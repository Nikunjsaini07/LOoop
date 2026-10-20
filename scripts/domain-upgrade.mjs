#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readFileSync,writeFileSync,mkdirSync } from 'node:fs';
import { dirname,join,resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { catalogSql,backfillTopicSql,profileProjectionSql,profileTriggerSql } from '../lib/server/domain.ts';
import { validateIds,parseWranglerJson } from './cloudflare-db.mjs';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const mode=process.argv[2];
if(process.argv.length!==3 || !['--local','--remote'].includes(mode)) throw new Error('Usage: node scripts/domain-upgrade.mjs --local | --remote (applies the additive migration and backfills topics)');
const settings=parseEnv(readFileSync(join(root,'.env.local'),'utf8'));validateIds(settings);
const directory=join(root,'outputs','domain-upgrade');mkdirSync(directory,{recursive:true});
// Wrangler local exports resolve persistence relative to the config and have no --persist-to flag.
const config=mode==='--remote'?join(directory,'remote.json'):join(root,'.env.domain-local.json');
writeFileSync(config,JSON.stringify({name:'readzz-domain-admin',compatibility_date:'2026-05-15',account_id:settings.CLOUDFLARE_ACCOUNT_ID,d1_databases:[{binding:'DB',database_name:mode==='--remote'?'reads':'site-creator-d1',database_id:mode==='--remote'?settings.CLOUDFLARE_D1_DATABASE_ID:'00000000-0000-4000-8000-000000000000'}]},null,2));
function wrangler(...args){const result=spawnSync(process.execPath,[join(root,'node_modules/wrangler/bin/wrangler.js'),...args,'--config',config,'--env-file',join(root,'.env.local')],{cwd:root,encoding:'utf8',maxBuffer:64*1024*1024,env:{...process.env,CLOUDFLARE_ACCOUNT_ID:settings.CLOUDFLARE_ACCOUNT_ID,WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'}});if(result.error)throw result.error;if(result.status)throw new Error(result.stderr||result.stdout);return result.stdout;}
const target=mode==='--remote'?['--remote']:['--local','--persist-to',join(root,'.wrangler/state')];
const query=sql=>parseWranglerJson(wrangler('d1','execute','DB',...target,'--json','--command',sql)).flatMap(r=>r.results??[]);
const before=query('SELECT id,url FROM articles ORDER BY id; SELECT COUNT(*) AS profiles FROM profiles;');
const articles=query('SELECT id,title,summary FROM articles');
const stamp=new Date().toISOString().replace(/[:.]/g,'-');
const backup=join(directory,`${stamp}-${mode.slice(2)}-backup.sql`);
wrangler('d1','export','DB',...(mode==='--remote'?['--remote','--skip-confirmation']:['--local']),'--output',backup);
const catalog=JSON.parse(readFileSync(join(root,'lib/server/seed.json'),'utf8')).sources;
const migration=readFileSync(join(root,'drizzle/0001_readzz_domain.sql'),'utf8');
const counterIndex=readFileSync(join(root,'drizzle/0002_engagement_totals.sql'),'utf8');
const sql=[migration,counterIndex,"INSERT OR IGNORE INTO companies(id,name,blog_url) SELECT company_id,company,'' FROM articles;",catalogSql(catalog),backfillTopicSql(articles),profileProjectionSql(),profileTriggerSql(),"INSERT OR IGNORE INTO readzz_migrations(name,applied_at) VALUES ('0001_readzz_domain',strftime('%Y-%m-%dT%H:%M:%fZ','now'));"] .join('\n');
const file=join(directory,`${stamp}-${mode.slice(2)}-upgrade.sql`);writeFileSync(file,sql);
parseWranglerJson(wrangler('d1','execute','DB',...target,'--yes','--json','--file',file));
const after=query('SELECT id,url FROM articles ORDER BY id; SELECT COUNT(*) AS profiles FROM profiles;');
const savedIds=new Map(after.filter(row=>row.id).map(row=>[row.id,row.url]));
if(before.some(row=>row.id&&savedIds.get(row.id)!==row.url)||Number(after.find(row=>Object.hasOwn(row,'profiles'))?.profiles)<Number(before.find(row=>Object.hasOwn(row,'profiles'))?.profiles))throw new Error('Existing article identities or profiles were lost; inspect the saved backup before continuing.');
const counts=query('SELECT COUNT(*) AS articles FROM articles; SELECT COUNT(*) AS companies FROM companies; SELECT COUNT(*) AS topics FROM topics; SELECT COUNT(*) AS article_topic_links FROM article_topics; PRAGMA foreign_key_check;');
if(counts.some(row=>Object.hasOwn(row,'fkid')))throw new Error('Foreign key verification failed');
console.log(JSON.stringify({target:mode.slice(2),backup,identitiesPreserved:true,counts},null,2));
