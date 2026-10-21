// Read public metadata only; all simulated readers and writes live in memory.
import { DatabaseSync } from 'node:sqlite';
import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { testDatabase } from '../lib/server/test-db.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = join(root, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
let source;
for (const name of readdirSync(directory).filter(name => name.endsWith('.sqlite') && name !== 'metadata.sqlite')) {
  const candidate = new DatabaseSync(join(directory, name), { readOnly: true });
  if (candidate.prepare("SELECT name FROM sqlite_master WHERE name='articles'").get()) { if (source) throw new Error('Ambiguous local database'); source = candidate; }
  else candidate.close();
}
if (!source) throw new Error('Local archive not found');
const f = testDatabase();
try {
  source.exec('BEGIN'); f.sql.exec('BEGIN');
  // These tables contain public publisher data and its derived semantic graph.
  for (const table of ['companies', 'sources', 'topics', 'topic_keywords', 'articles', 'article_topics', 'semantic_documents', 'semantic_topics', 'semantic_neighbors']) {
    const rows = source.prepare(`SELECT * FROM ${table}`).all();
    if (!rows.length) continue;
    const names = Object.keys(rows[0]);
    const insert = f.sql.prepare(`INSERT OR REPLACE INTO ${table}(${names.join(',')}) VALUES (${names.map(() => '?').join(',')})`);
    for (const row of rows) insert.run(...names.map(name => row[name]));
  }
  f.sql.exec('COMMIT'); source.exec('COMMIT'); source.close(); source = null;
  const bundle = await build({ stdin: { contents: 'export {queryFeed,feedInput} from "./lib/server/feed-query";export {emptyProfile} from "./lib/server/core";', resolveDir: root }, bundle: true, write: false, format: 'esm', platform: 'neutral' });
  const { queryFeed, feedInput, emptyProfile } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
  const times = [], profile = emptyProfile(), now = Date.now();
  const request = async (q, owner = 'benchmark', mode = 'personal') => {
    const started = performance.now();
    const result = await queryFeed(f.db, feedInput(new URLSearchParams({ q, mode }), profile, new Date(now).toISOString()), [], { owner, clientKey: owner, now, pageSize: 12 });
    times.push(performance.now() - started);
    if (new Set(result.articles.map(article => article.id)).size !== result.articles.length) throw new Error('Duplicate story in page');
    return result;
  };
  const queries = ['', 'postgres', 'rust', 'inference', 'network', 'reliability', 'react', 'data', 'cache', 'kubernetes'];
  for (const query of queries) await request(query);
  const cold = times.splice(0).sort((a, b) => a - b);
  for (let index = 0; index < 30; index++) await request(queries[index % queries.length]);
  const warm = times.splice(0).sort((a, b) => a - b);
  const concurrent = await Promise.all(Array.from({ length: 20 }, () => request('distributed', 'concurrent-benchmark')));
  if (new Set(concurrent.map(page => page.edition)).size !== 1) throw new Error('Concurrent misses created duplicate editions');
  const percentile = (list, p) => Math.round(list[Math.min(list.length - 1, Math.floor(list.length * p))] * 10) / 10;
  const report = { measuredAt: new Date().toISOString(), environment: 'isolated in-memory SQLite; excludes browser, network, and remote D1 latency', articles: f.sql.prepare('SELECT COUNT(*) n FROM articles').get().n,
    cold: { requests: cold.length, p50ms: percentile(cold, .5), p95ms: percentile(cold, .95) }, warm: { requests: warm.length, p50ms: percentile(warm, .5), p95ms: percentile(warm, .95) }, concurrent: { requests: 20, sharedEditions: 1 }, productionLoadCertified: false };
  const output = join(root, 'outputs/product-maintenance'); mkdirSync(output, { recursive: true });
  writeFileSync(join(output, 'feed-benchmark.json'), JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report));
} finally { source?.close(); f.close(); }
