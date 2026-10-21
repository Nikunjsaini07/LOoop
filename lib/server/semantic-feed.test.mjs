import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import {testDatabase} from './test-db.mjs';

const bundle=await build({stdin:{contents:'export {queryFeed,feedInput} from "./feed-query";export {emptyProfile,sanitizeProfile} from "./core";',resolveDir:fileURLToPath(new URL('.',import.meta.url))},bundle:true,write:false,format:'esm',platform:'neutral',target:'es2022'});
const {queryFeed,feedInput,emptyProfile,sanitizeProfile}=await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const now=Date.parse('2026-10-21T12:00:00Z'),stamp=new Date(now).toISOString();
const model='Xenova/all-MiniLM-L6-v2@751bff37182d3f1213fa05d7196b954e230abad9:q8:mean:v1';
function article(f,id,days,{company='cloudflare',title=id,summary='',published=true,indexed=true,topicScore=0.65}={}) {
  f.sql.prepare('INSERT INTO articles VALUES (?,?,?,?,?,?,?,?,?)').run(id,company,company,title,`https://${company}.example/${id}`,summary,published?new Date(now-days*86400000).toISOString():null,new Date(now-10000).toISOString(),'[]');
  if(indexed){
    f.sql.prepare('INSERT INTO semantic_documents VALUES (?,?,?,?)').run(id,`${title}\n${summary}`,model,stamp);
    f.sql.prepare('INSERT INTO semantic_topics VALUES (?,?,?,?)').run(id,'systems',topicScore,stamp);
  }
}
function edge(f,from,to,score=.85){f.sql.prepare('INSERT INTO semantic_neighbors VALUES (?,?,?,?)').run(from,to,score,`${stamp}|${stamp}`);}
async function page(f,profile=emptyProfile(),query='mode=personal',options={}) {
  return queryFeed(f.db,feedInput(new URLSearchParams(query),profile,stamp),[],{owner:'reader',pageSize:12,now,...options});
}
test('personal editions reserve recent slots while surfacing relevant historical articles without keyword overlap',async()=>{
 const f=testDatabase();try{
  for(let i=0;i<9;i++)article(f,`recent-${i}`,i,{company:i%2?'meta':'cloudflare'});
  article(f,'old-concept',2000,{title:'Keeping replicas in agreement'});
  article(f,'old-concept-two',1000,{title:'When machines disagree',company:'meta'});
  article(f,'middle-aged',70);
  const result=await page(f);
  assert.deepEqual(result.articles.slice(0,5).map(a=>a.recommendationLane),['recent','recent','recent','archive','discovery']);
  assert.ok(Number(result.articles[3].published_at.slice(0,4))<=2024);
  assert.equal(result.articles[3].recommendationReason,'Related to Systems');
  assert.equal(new Set(result.articles.map(a=>a.id)).size,result.articles.length);
  assert.ok(result.articles.filter(a=>a.recommendationLane==='recent').length>=7);
 }finally{f.close();}
});
test('saved and useful articles retrieve semantic neighbors even when tags and keywords do not overlap',async()=>{
 const f=testDatabase();try{
  article(f,'seed',1,{title:'Raft consensus',topicScore:.31});
  article(f,'match',2000,{title:'Keeping replicas in agreement',topicScore:.31});
  article(f,'irrelevant',2000,{title:'Office move',topicScore:.31});
  edge(f,'seed','match');
  for(const profile of [{...emptyProfile(),bookmarks:['seed']},{...emptyProfile(),recommendationFeedback:[{articleId:'seed',value:'useful',at:stamp}]}]){
   const result=await page(f,profile);
   assert.equal(result.articles.find(a=>a.id==='match').recommendationLane,'archive');
   assert.match(result.articles.find(a=>a.id==='match').recommendationReason,/Similar to “Raft consensus”/);
   assert.equal(result.articles.find(a=>a.id==='irrelevant').recommendationLane,'discovery');
  }
 }finally{f.close();}
});
test('publication age stays honest and historical quota requires genuine semantic evidence',async()=>{
 const f=testDatabase();try{
  article(f,'undated',2000,{published:false});
  article(f,'unindexed',2000,{indexed:false});
  article(f,'weak-match',2000,{topicScore:.32});
  article(f,'known-old',2000);
  const result=await page(f);
  assert.equal(result.articles.find(a=>a.id==='undated').recommendationLane,'recent');
  assert.equal(result.articles.find(a=>a.id==='unindexed').recommendationLane,'discovery');
  assert.equal(result.articles.find(a=>a.id==='weak-match').recommendationLane,'discovery');
  assert.equal(result.articles.find(a=>a.id==='known-old').recommendationLane,'archive');
  const read=await page(f,{...emptyProfile(),readLogs:[{articleId:'known-old',readAt:stamp}]});
  assert.equal(read.articles.at(-1).id,'known-old');
  assert.notEqual(read.articles.at(-1).recommendationLane,'archive');
 }finally{f.close();}
});
test('changed content and incomplete indexing generations cannot contribute stale matches',async()=>{
 const f=testDatabase();try{
  article(f,'seed',2);article(f,'old',1000,{topicScore:.31});edge(f,'seed','old');
  const profile={...emptyProfile(),bookmarks:['seed']};
  assert.equal((await page(f,profile)).articles.find(a=>a.id==='old').recommendationLane,'archive');
  f.sql.prepare('UPDATE articles SET summary=? WHERE id=?').run('A different subject','seed');
  assert.equal((await page(f,profile)).articles.find(a=>a.id==='old').recommendationLane,'discovery');
  f.sql.prepare('UPDATE semantic_documents SET content=?,updated_at=? WHERE article_id=?').run('seed\nA different subject','a-new-generation','seed');
  f.sql.exec("UPDATE app_state SET value=value+1 WHERE id='semantic_revision'");
  assert.equal((await page(f,profile)).articles.find(a=>a.id==='old').recommendationLane,'discovery');
 }finally{f.close();}
});
test('feedback changes new editions, exact dismissals persist, undo restores, and explicit libraries remain accessible',async()=>{
 const f=testDatabase();try{
  article(f,'old',1000);article(f,'related',1000);edge(f,'old','related');
  const original=await page(f);
  const rated={...emptyProfile(),recommendationFeedback:[{articleId:'old',value:'not-relevant',at:stamp}]};
  assert.ok(!(await page(f,rated)).articles.some(a=>a.id==='old'));
  assert.ok((await page(f,rated,'mode=personal&ids=old')).articles.some(a=>a.id==='old'));
  assert.ok((await page(f)).articles.some(a=>a.id==='old'));
  f.sql.exec("DELETE FROM semantic_topics; UPDATE app_state SET value=value+1 WHERE id='semantic_revision'");
  const frozen=await page(f,emptyProfile(),'mode=personal',{edition:original.edition});
  assert.deepEqual(frozen.articles.map(a=>[a.id,a.recommendationLane,a.recommendationReason]),original.articles.map(a=>[a.id,a.recommendationLane,a.recommendationReason]));
 }finally{f.close();}
});
test('semantic candidates respect every explicit filter and chronological feeds retain their order',async()=>{
 const f=testDatabase();try{
  article(f,'recent',1,{title:'TCP performance'});article(f,'old',1000,{company:'meta',title:'TCP performance'});
  article(f,'middle',80,{title:'TCP networking'});edge(f,'recent','old');
  assert.deepEqual((await page(f,emptyProfile(),'mode=personal&company=cloudflare&q=performance')).articles.map(a=>a.id),['recent']);
  assert.deepEqual((await page(f,emptyProfile(),'mode=latest')).articles.map(a=>a.id),['recent','middle','old']);
  assert.ok((await page(f,emptyProfile(),'mode=latest')).articles.every(a=>!a.recommendationLane));
 }finally{f.close();}
});
test('recommendation ratings are validated, bounded, private profile data and deduplicated by article',()=>{
 const at=new Date().toISOString();
 const profile=sanitizeProfile({recommendationFeedback:[{articleId:'one',value:'useful',at},{articleId:'one',value:'not-relevant',at}]},emptyProfile(),new Set());
 assert.equal(profile.recommendationFeedback.length,1);assert.equal(profile.recommendationFeedback[0].value,'not-relevant');
 for(const row of [{articleId:'../one',value:'useful',at},{articleId:'one',value:'popular',at},{articleId:'one',value:'useful',at:'tomorrow'}])assert.throws(()=>sanitizeProfile({recommendationFeedback:[row]},emptyProfile(),new Set()));
 assert.throws(()=>sanitizeProfile({recommendationFeedback:Array(501).fill({articleId:'one',value:'useful',at})},emptyProfile(),new Set()));
});

test('new unindexed arrivals enter recent slots immediately and sparse archives do not fabricate historical picks',async()=>{
 const f=testDatabase();try{
  article(f,'today',0,{indexed:false});article(f,'yesterday',1,{indexed:false});
  const fresh=await page(f);
  assert.equal(fresh.total,2);assert.ok(fresh.articles.every(a=>a.recommendationLane==='recent'));
  article(f,'old',1000);const mixed=await page(f);
  assert.equal(mixed.total,3);assert.equal(mixed.articles.find(a=>a.id==='old').recommendationLane,'archive');
 }finally{f.close();}
});
