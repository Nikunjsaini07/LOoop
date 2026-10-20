#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {resolve,join} from 'node:path';
import {readFileSync} from 'node:fs';
import {RANK_SQL,feedInput} from '../lib/server/feed-query.ts';
import {emptyProfile} from '../lib/server/core.ts';
import {sqlLiteral} from '../lib/server/domain.ts';
import {parseWranglerJson} from './cloudflare-db.mjs';

const root=resolve(import.meta.dirname,'..');
const remote=process.argv[2]==='--remote';
if(!remote&&process.argv[2]!=='--local')throw new Error('Use --remote or --local');
const profile={...emptyProfile(),interests:['PostgreSQL','Inference'],follows:['cloudflare']};
const input=feedInput(new URLSearchParams('mode=personal'),profile,new Date().toISOString());
const sql=RANK_SQL.replace('?',sqlLiteral(JSON.stringify(input)))+`SELECT id,basis FROM ranked ORDER BY position LIMIT 5; SELECT COUNT(*) AS articles FROM articles;SELECT COUNT(*) AS companies FROM companies;SELECT COUNT(*) AS topics FROM topics;SELECT COUNT(*) AS relationships FROM article_topics;SELECT COUNT(*) AS real_engagements FROM engagements;SELECT COUNT(*) AS reviewed_triggers FROM sqlite_master WHERE type='trigger' AND name LIKE 'readzz_%';PRAGMA foreign_key_check;`;
const config=remote?join(root,'outputs/domain-upgrade/remote.json'):join(root,'.env.domain-local.json');
readFileSync(config);
const result=spawnSync(process.execPath,[join(root,'node_modules/wrangler/bin/wrangler.js'),'d1','execute','DB',...(remote?['--remote']:['--local','--persist-to',join(root,'.wrangler/state')]),'--config',config,'--env-file',join(root,'.env.local'),'--json','--command',sql],{cwd:root,encoding:'utf8',maxBuffer:8*1024*1024,env:{...process.env,WRANGLER_SEND_METRICS:'false',WRANGLER_WRITE_LOGS:'false'}});
if(result.error)throw result.error;if(result.status)throw new Error(result.stderr||result.stdout);
console.log(JSON.stringify({target:remote?'remote':'local',results:parseWranglerJson(result.stdout).map(r=>({success:r.success,results:r.results,durationMs:r.meta?.duration}))},null,2));
