import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { testDatabase } from './test-db.mjs';
import { validateSchema } from '../../scripts/cloudflare-db.mjs';

const bundle=await build({stdin:{contents:'export {queryFeed,feedInput,FeedExpiredError} from "./feed-query";export {recordEngagement,validateEngagement} from "./engagement";export {classifyTopics} from "../topics";export {emptyProfile} from "./core";export {readTopicClassifier} from "./catalog";',resolveDir:fileURLToPath(new URL('.',import.meta.url))},bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022'});
const {queryFeed,feedInput,FeedExpiredError,recordEngagement,validateEngagement,classifyTopics,emptyProfile,readTopicClassifier}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const now=Date.parse('2026-10-20T12:00:00Z');
function insert(f,id,{company='meta',title='Product launch',summary='',days=0,discoveredAt=now-1000}={}){
  const topics=classifyTopics(title,summary).map(t=>t.name);
  f.sql.prepare('INSERT INTO articles VALUES (?,?,?,?,?,?,?,?,?)').run(id,company,company,title,`https://${company}.example/${id}`,summary,new Date(now-days*86400000).toISOString(),new Date(discoveredAt).toISOString(),JSON.stringify(topics));
}
const input=(profile=emptyProfile(),query='mode=personal')=>feedInput(new URLSearchParams(query),profile,new Date(now).toISOString());
const page=(f,profile=emptyProfile(),query='mode=personal',options={})=>queryFeed(f.db,input(profile,query),[],{pageSize:24,owner:'guest',now,...options});

test('normalized topics recognize aliases and boundaries; article updates maintain relationships atomically',()=>{
 const f=testDatabase();try{
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM companies').get().n,37);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM topics').get().n,15);
  assert.ok(!classifyTopics('A daily diary','').some(t=>t.id==='ai'));
  insert(f,'one',{title:'Postgres inference over TCP networking'});
  const tags=f.sql.prepare('SELECT t.name FROM article_topics at JOIN topics t ON t.id=at.topic_id WHERE article_id=?').all('one').map(t=>t.name);
  for(const tag of ['PostgreSQL','Inference','Networking'])assert.ok(tags.includes(tag));
  f.sql.prepare('UPDATE articles SET topics=? WHERE id=?').run('["Security"]','one');
  assert.deepEqual(f.sql.prepare('SELECT topic_id FROM article_topics WHERE article_id=?').all('one').map(t=>t.topic_id),['security']);
  assert.throws(()=>insert(f,'bad',{company:'not-in-catalog'}),/Unknown article company/);
  assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(),[]);
 }finally{f.close();}
});

test('SQL personalization considers an older matching story beyond the newest 100 articles',async()=>{
 const f=testDatabase();try{
  for(let i=0;i<160;i++)insert(f,`new-${i}`);
  insert(f,'older-match',{company:'cloudflare',title:'PostgreSQL infrastructure',days:20});
  const result=await page(f,{...emptyProfile(),follows:['cloudflare'],interests:['PostgreSQL']});
  assert.equal(result.articles[0].id,'older-match');assert.equal(result.total,161);
  assert.equal(result.rankingVersion,2);
 }finally{f.close();}
});

test('read history builds affinities and reduces already-read articles; activity cadence changes freshness emphasis',async()=>{
 const f=testDatabase();try{
  insert(f,'read',{company:'cloudflare',title:'Postgres indexes',days:10});
  insert(f,'related',{company:'cloudflare',title:'PostgreSQL query planner',days:9});
  insert(f,'unrelated',{title:'Product launch',days:9});
  const profile={...emptyProfile(),readLogs:[{articleId:'read',readAt:new Date(now-86400000).toISOString()}]};
  const result=await page(f,profile);
  assert.ok(result.articles.findIndex(a=>a.id==='related')<result.articles.findIndex(a=>a.id==='unrelated'));
  assert.equal(result.articles.at(-1).id,'read');
  const other=testDatabase();try{
   insert(other,'older',{title:'PostgreSQL indexing',days:10});insert(other,'fresh',{title:'Product launch'});
   const preferences={...emptyProfile(),interests:['PostgreSQL']};
   assert.equal((await page(other,preferences)).articles[0].id,'older');
   const activity=Array.from({length:7},(_,i)=>({date:new Date(now-i*86400000).toISOString().slice(0,10),opens:1,saves:0,reads:0,count:1}));
   assert.equal((await page(other,{...preferences,activity})).articles[0].id,'fresh');
  }finally{other.close();}
 }finally{f.close();}
});

test('community trends use real unique events, not imported personal history, and explain empty-data discovery',async()=>{
 const f=testDatabase();try{
  insert(f,'fresh');insert(f,'popular',{title:'Postgres performance',days:100});
  assert.equal((await page(f,emptyProfile(),'mode=trending')).rankingBasis,'freshness');
  const imported={...emptyProfile(),readLogs:[{articleId:'popular',readAt:new Date(now).toISOString()}]};
  f.sql.prepare('INSERT INTO profiles VALUES (?,?,1,?)').run('imported',JSON.stringify(imported),new Date(now).toISOString());
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM user_read_logs').get().n,1);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM engagements').get().n,0);
  await recordEngagement(f.db,'reader',{articleId:'popular',kind:'read',active:true},new Date(now-1000));
  await recordEngagement(f.db,'reader',{articleId:'popular',kind:'read',active:true},new Date(now-500));
  const result=await page(f,emptyProfile(),'mode=trending');
  assert.equal(result.rankingBasis,'engagement');assert.equal(result.articles[0].id,'popular');
  assert.equal(result.articles[0].engagement.reads,1);
  await recordEngagement(f.db,'reader',{articleId:'popular',kind:'read',active:false},new Date(now));
  assert.equal((await page(f,emptyProfile(),'mode=trending')).rankingBasis,'freshness');
  await assert.rejects(()=>recordEngagement(f.db,'',{articleId:'fresh',kind:'read',active:true}),/verified reader/);
  assert.throws(()=>validateEngagement({articleId:'bad/path',kind:'read',active:true}));
 }finally{f.close();}
});

test('frozen editions prevent duplicates and reordering when articles, engagement or profile ownership change',async()=>{
 const f=testDatabase();try{
  for(let i=0;i<7;i++)insert(f,`item-${i}`,{company:i%2?'meta':'cloudflare'});
  const first=await page(f,emptyProfile(),'mode=personal',{pageSize:2});
  insert(f,'new-arrival',{discoveredAt:now+1000});
  await recordEngagement(f.db,'reader',{articleId:'item-0',kind:'read',active:true},new Date(now+1000));
  const second=await page(f,emptyProfile(),'mode=personal',{pageSize:2,cursor:first.nextCursor,now:now+2000});
  assert.equal(second.total,7);assert.equal(second.snapshot,first.snapshot);
  assert.ok(second.articles.every(a=>!first.articles.some(b=>b.id===a.id)&&a.id!=='new-arrival'));
  await assert.rejects(()=>page(f,emptyProfile(),'mode=personal',{cursor:first.nextCursor,owner:'another-account'}),FeedExpiredError);
  await assert.rejects(()=>page(f,{...emptyProfile(),interests:['Security']},'mode=personal',{cursor:first.nextCursor}),FeedExpiredError);
 }finally{f.close();}
});

test('custom company/topic rules, keyword exclusions and title search remain hard SQL constraints',async()=>{
 const f=testDatabase();try{
  insert(f,'keep',{company:'cloudflare',title:'Postgres performance'});
  insert(f,'wrong-company',{title:'Postgres performance'});
  insert(f,'excluded',{company:'cloudflare',title:'Postgres performance hiring'});
  insert(f,'wrong-topic',{company:'cloudflare',title:'Networking performance'});
  const result=await page(f,emptyProfile(),'company=cloudflare&topic=postgres&q=performance&exclude=hiring');
  assert.deepEqual(result.articles.map(a=>a.id),['keep']);
 }finally{f.close();}
});

test('bookmark/read toggles preserve first observed time and cannot create repeated popularity votes',async()=>{
 const f=testDatabase();try{
  insert(f,'one');
  const event={articleId:'one',kind:'save',active:true};
  assert.equal(await recordEngagement(f.db,'reader',event,new Date(now-86400000)),true);
  assert.equal(await recordEngagement(f.db,'reader',event,new Date(now)),false);
  await recordEngagement(f.db,'reader',{...event,active:false},new Date(now));
  await recordEngagement(f.db,'reader',event,new Date(now));
  const row=f.sql.prepare('SELECT * FROM engagements').get();
  assert.equal(row.active,1);assert.equal(row.occurred_at,new Date(now-86400000).toISOString());
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM engagements').get().n,1);
 }finally{f.close();}
});

test('topic chips stay ANDed with custom-feed topics and cursors cross cached chunk boundaries',async()=>{
 const f=testDatabase();try{
  insert(f,'both',{title:'PostgreSQL TCP networking'});
  insert(f,'network-only',{title:'DNS TCP networking'});
  assert.deepEqual((await page(f,emptyProfile(),'topic=Data&signal=Networking')).articles.map(a=>a.id),['both']);
  for(let i=0;i<525;i++)insert(f,`bulk-${i}`);
  const first=await page(f,emptyProfile(),'mode=latest',{pageSize:100});
  const session=first.nextCursor.split(':')[0];
  const boundary=await page(f,emptyProfile(),'mode=latest',{pageSize:100,cursor:`${session}:500`});
  assert.equal(boundary.articles.length,27);
  assert.equal(new Set(boundary.articles.map(a=>a.id)).size,27);
  assert.equal(boundary.hasMore,false);
 }finally{f.close();}
});

test('the daily community contribution cap applies to new events, without trusting client timestamps',async()=>{
 const f=testDatabase();try{
  for(let i=0;i<101;i++){
   insert(f,`cap-${i}`);
   await recordEngagement(f.db,'reader',{articleId:`cap-${i}`,kind:'read',active:true},new Date(now));
  }
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM engagements').get().n,100);
  assert.equal(f.sql.prepare('SELECT COUNT(DISTINCT occurred_at) AS n FROM engagements').get().n,1);
 }finally{f.close();}
});

test('SQL-managed topic aliases, weights and parent inheritance are used by ingestion',async()=>{
 const f=testDatabase();try{
  f.sql.exec("INSERT INTO topics VALUES ('ebpf','eBPF','systems'); INSERT INTO topic_keywords VALUES ('ebpf','eBPF',2);");
  const classify=await readTopicClassifier(f.db);
  const tags=classify('Learning eBPF','');
  assert.equal(tags.find(topic=>topic.id==='ebpf').score,4);
  assert.ok(tags.some(topic=>topic.id==='systems'));
 }finally{f.close();}
});

test('database inspection accepts reviewed projection triggers and rejects modified or unknown triggers',()=>{
 const f=testDatabase();try{
  const names=['articles','profiles','refresh_locks','source_refresh'];
  const columns=Object.fromEntries(names.map(name=>[name,f.sql.prepare(`PRAGMA table_info('${name}')`).all()]));
  const triggers=f.sql.prepare("SELECT name,tbl_name,sql FROM sqlite_master WHERE type='trigger'").all();
  const indexes=[{unique:true,columns:['url']}];
  assert.equal(validateSchema(names,columns,indexes,triggers),'compatible');
  const changed=triggers.map(trigger=>trigger.name==='readzz_article_insert'?{...trigger,sql:trigger.sql.replace('value=value+1','value=value+1000')}:trigger);
  assert.throws(()=>validateSchema(names,columns,indexes,changed),/unreviewed triggers/);
  assert.throws(()=>validateSchema(names,columns,indexes,[...triggers,{name:'unknown',tbl_name:'articles',sql:'CREATE TRIGGER unknown'}]),/unreviewed triggers/);
 }finally{f.close();}
});
