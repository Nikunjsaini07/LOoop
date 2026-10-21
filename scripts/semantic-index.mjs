// Public metadata -> local transformer -> persisted topic affinities and neighbors.
// No profile data or article bodies are sent to an embedding service.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, openSync, closeSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { parseWranglerJson, validateIds } from './cloudflare-db.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
if ([...args].some(a => !['--local','--remote','--watch','--status','--migrate-only'].includes(a)) || Number(args.has('--local')) + Number(args.has('--remote')) !== 1) throw new Error('Use --local or --remote, optionally --watch, --status or --migrate-only');
if (args.has('--watch') && args.has('--remote')) throw new Error('Remote runs are one-shot; schedule this command in your deployment environment.');
const remote = args.has('--remote');
const output = join(root, 'outputs/semantic');
mkdirSync(output, {recursive:true});
const lock=join(output,`${remote?'remote':'local'}.lock`);
if(!args.has('--status')) {
if(existsSync(lock)) {
  const pid=Number(readFileSync(lock,'utf8'));
  let active=false;
  if(Number.isInteger(pid)&&pid>0)try{process.kill(pid,0);active=true;}catch{/* A crashed owner's lock can be recovered. */}
  if(active){console.log('A semantic indexer is already running for this database.');process.exit(0);}
  unlinkSync(lock);
}
const lockHandle=openSync(lock,'wx');writeFileSync(lockHandle,String(process.pid));closeSync(lockHandle);
process.on('exit',()=>{try{unlinkSync(lock);}catch{/* Already cleaned up. */}});
}
const settings = existsSync(join(root,'.env.local')) ? parseEnv(readFileSync(join(root,'.env.local'),'utf8')) : {};
if(remote) validateIds(settings);
const config = join(root,'.env.semantic-local.json');
const remoteConfig = join(output,'remote.json');
writeFileSync(remote ? remoteConfig : config, JSON.stringify({name:'readwell-semantic',compatibility_date:'2026-05-15',
  ...(remote?{account_id:settings.CLOUDFLARE_ACCOUNT_ID}:{}),
  d1_databases:[{binding:'DB',database_name:remote?'reads':'site-creator-d1',database_id:remote?settings.CLOUDFLARE_D1_DATABASE_ID:'00000000-0000-4000-8000-000000000000'}]}));
const target = remote ? ['--remote'] : ['--local','--persist-to',join(root,'.wrangler/state')];
function wrangler(...rest) {
  for(let attempt=0;attempt<6;attempt++) {
  const result = spawnSync(process.execPath,[join(root,'node_modules/wrangler/bin/wrangler.js'),'d1','execute','DB',...target,'--config',remote?remoteConfig:config,'--json',...rest],{
    cwd:root,encoding:'utf8',maxBuffer:96*1024*1024,
    env:{...process.env,...(remote?{CLOUDFLARE_ACCOUNT_ID:settings.CLOUDFLARE_ACCOUNT_ID}:{}),WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'},
  });
  if(result.error || result.status) {
    const message=result.stderr || result.stdout || 'Local database command failed';
    if(!remote && /SQLITE_BUSY|database is locked/.test(message) && attempt<5) {Atomics.wait(new Int32Array(new SharedArrayBuffer(4)),0,0,500*(attempt+1));continue;}
    throw result.error || new Error(message);
  }
  return parseWranglerJson(result.stdout).flatMap(r=>r.results??[]);
  }
}
const query = sql => wrangler('--command',sql);
const quote = value => "'"+String(value).replaceAll("'","''")+"'";
const hash = value => createHash('sha256').update(value).digest('hex');
const model = 'Xenova/all-MiniLM-L6-v2';
const revision = '751bff37182d3f1213fa05d7196b954e230abad9';
const modelKey = `${model}@${revision}:q8:mean:v1`;
let extractor;
async function embed(texts) {
  if(!extractor) {
    console.log('Loading pinned MiniLM model; first run downloads model files, later runs use the local cache.');
    const {pipeline,env} = await import('@huggingface/transformers');
    env.cacheDir = join(output,'models');
    extractor = await pipeline('feature-extraction',model,{revision,dtype:'q8',device:'cpu',session_options:{intraOpNumThreads:2,interOpNumThreads:1}});
  }
  return (await extractor(texts,{pooling:'mean',normalize:true,truncation:true,max_length:256})).tolist();
}
function executeFile(name,sql) {
  const path=join(output,name);writeFileSync(path,sql);wrangler('--yes','--file',path);
}
async function index() {
  for(const name of ['0004_semantic_feed','0005_semantic_generation']) {
    const migrations=query(`SELECT name FROM readzz_migrations WHERE name=${quote(name)}`);
    if(!migrations.length) executeFile('migration.sql',readFileSync(join(root,`drizzle/${name}.sql`),'utf8'));
  }
  if(args.has('--migrate-only')) { console.log('Semantic feed migration applied.'); return; }
  const status = () => query("SELECT (SELECT COUNT(*) FROM articles) AS articles,(SELECT COUNT(*) FROM semantic_documents d JOIN articles a ON a.id=d.article_id WHERE d.content=a.title||char(10)||a.summary) AS indexed,(SELECT COUNT(*) FROM semantic_neighbors) AS neighbors,(SELECT COUNT(*) FROM semantic_topics) AS topicAffinities")[0];
  if(args.has('--status')) { console.log(JSON.stringify(status()));return; }
  const started=performance.now();
  const articles=query('SELECT id,title,summary FROM articles ORDER BY id');
  const topics=query("SELECT t.id,t.name,group_concat(k.term,', ') AS keywords FROM topics t LEFT JOIN topic_keywords k ON k.topic_id=t.id GROUP BY t.id ORDER BY t.id");
  if(!articles.length) {console.log('No collected articles to index yet.');return;}
  const corpusHash=hash(JSON.stringify({indexVersion:3,modelKey,articles,topics}));
  const appliedFile=join(output,`${remote?'remote':'local'}-applied.json`);
  if(existsSync(appliedFile) && JSON.parse(readFileSync(appliedFile,'utf8')).hash===corpusHash && status().indexed===articles.length) { console.log('Semantic index is current.');return; }
  const cacheFile=join(output,'vectors.json');
  const cache=existsSync(cacheFile)?JSON.parse(readFileSync(cacheFile,'utf8')):{};
  const content = article => `${article.title}\n${article.summary}`;
  const key = text => hash(`${modelKey}\n${text}`);
  const texts=[...new Set([...articles.map(content),...topics.map(t=>`${t.name}: ${t.keywords}. Engineering explanations, research and practical system design.`)])];
  const missing=texts.filter(text=>!cache[key(text)]);
  console.log(`Semantic indexing: ${articles.length} articles; ${missing.length} new or changed texts.`);
  for(let offset=0;offset<missing.length;offset+=16) {
    const batch=missing.slice(offset,offset+16);
    const vectors=await embed(batch);
    if(vectors.length!==batch.length || vectors.some(v=>v.length!==384 || v.some(n=>!Number.isFinite(n)))) throw new Error('Embedding model returned invalid vectors');
    batch.forEach((text,i)=>{cache[key(text)]=vectors[i];});
    // Checkpoints make interrupted backfills restartable without re-embedding.
    if(offset%128===0 || offset+16>=missing.length) {writeFileSync(cacheFile,JSON.stringify(cache));console.log(`Embedded ${Math.min(offset+16,missing.length)}/${missing.length}`);}
  }
  const matrixFile=join(output,'matrix.json'),matchesFile=join(output,'matches.json');
  writeFileSync(matrixFile,JSON.stringify({vectors:articles.map(a=>cache[key(content(a))]),anchors:topics.map(t=>cache[key(`${t.name}: ${t.keywords}. Engineering explanations, research and practical system design.`)])}));
  const result=spawnSync('python',[join(root,'scripts/semantic-neighbors.py'),matrixFile,matchesFile],{stdio:'inherit',env:{...process.env,OPENBLAS_NUM_THREADS:'2',OMP_NUM_THREADS:'2'}});
  if(result.error || result.status) throw result.error || new Error('Neighbor matching failed; Python with NumPy is required');
  const matches=JSON.parse(readFileSync(matchesFile,'utf8'));
  // Install only metadata whose content is still identical to our snapshot.
  // A failed/partial run remains restartable. Queries reject stale content.
  const stamp=new Date().toISOString();
  const stored=new Map(query('SELECT article_id,content,model,updated_at FROM semantic_documents').map(row=>[row.article_id,row]));
  const versions=new Map(articles.map(a=>{const old=stored.get(a.id);return [a.id,old?.content===content(a)&&old.model===modelKey?old.updated_at:stamp];}));
  const changedDocuments=articles.filter(a=>versions.get(a.id)===stamp);
  for(let offset=0;offset<changedDocuments.length;offset+=500) {
    const sql=[];
    for(const article of changedDocuments.slice(offset,offset+500)) sql.push(`INSERT INTO semantic_documents(article_id,content,model,updated_at) SELECT id,${quote(content(article))},${quote(modelKey)},${quote(stamp)} FROM articles WHERE id=${quote(article.id)} AND title||char(10)||summary=${quote(content(article))} ON CONFLICT(article_id) DO UPDATE SET content=excluded.content,model=excluded.model,updated_at=excluded.updated_at;`);
    executeFile('documents.sql',sql.join('\n'));
    console.log(`Stored changed semantic documents ${Math.min(offset+500,changedDocuments.length)}/${changedDocuments.length}`);
  }
  // Recompute similarities off-line, but write only changed neighborhoods.
  // Per-document versions keep unaffected edges valid when one new article arrives.
  const graphFile=join(output,`${remote?'remote':'local'}-graph.json`);
  const graph=existsSync(graphFile)?JSON.parse(readFileSync(graphFile,'utf8')):{};
  const signatures=articles.map((a,i)=>hash(JSON.stringify({version:3,source:versions.get(a.id),topics:matches.topics[i].map(([t,s])=>[topics[t].id,s]),neighbors:matches.neighbors[i].map(([n,s])=>[articles[n].id,s,versions.get(articles[n].id)])})));
  const changedIndices=articles.flatMap((a,i)=>graph[a.id]!==signatures[i]?[i]:[]);
  for(let offset=0;offset<changedIndices.length;offset+=500) {
    const sql=[];
    const batch=changedIndices.slice(offset,offset+500);
    for(const i of batch) {
      const id=quote(articles[i].id);
      const sourceVersion=quote(versions.get(articles[i].id));
      sql.push(`DELETE FROM semantic_topics WHERE article_id=${id};DELETE FROM semantic_neighbors WHERE article_id=${id};`);
      for(const [topic,score] of matches.topics[i]) sql.push(`INSERT INTO semantic_topics(article_id,topic_id,similarity,generation) SELECT article_id,${quote(topics[topic].id)},${score},${sourceVersion} FROM semantic_documents WHERE article_id=${id} AND updated_at=${sourceVersion};`);
      const neighbors=matches.neighbors[i];
      if(neighbors.length) sql.push(`INSERT INTO semantic_neighbors(article_id,neighbor_id,similarity,generation) SELECT ${id},json_extract(j.value,'$[0]'),json_extract(j.value,'$[1]'),${sourceVersion}||'|'||json_extract(j.value,'$[2]') FROM json_each(${quote(JSON.stringify(neighbors.map(([n,s])=>[articles[n].id,s,versions.get(articles[n].id)])))}) j JOIN semantic_documents d ON d.article_id=json_extract(j.value,'$[0]') AND d.updated_at=json_extract(j.value,'$[2]') WHERE EXISTS(SELECT 1 FROM semantic_documents WHERE article_id=${id} AND updated_at=${sourceVersion});`);
    }
    executeFile('matches.sql',sql.join('\n'));
    batch.forEach(i=>{graph[articles[i].id]=signatures[i];});writeFileSync(graphFile,JSON.stringify(graph));
    console.log(`Stored changed semantic matches ${Math.min(offset+500,changedIndices.length)}/${changedIndices.length}`);
  }
  query("UPDATE app_state SET value=value+1 WHERE id='semantic_revision'");
  const report={hash:corpusHash,model:modelKey,completedAt:stamp,seconds:Math.round((performance.now()-started)/1000),changedDocuments:changedDocuments.length,changedNeighborhoods:changedIndices.length,...status()};
  writeFileSync(appliedFile,JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}
let stopped=false;
process.on('SIGINT',()=>{stopped=true;process.exit(0);});
process.on('SIGTERM',()=>{stopped=true;process.exit(0);});
do {
  try {await index();} catch(error) {console.error('Semantic index:',error.message);if(!args.has('--watch'))process.exitCode=1;}
  if(!args.has('--watch') || stopped)break;
  await new Promise(resolve=>setTimeout(resolve,60000));
}while(!stopped);
