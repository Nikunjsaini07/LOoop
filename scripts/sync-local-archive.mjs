#!/usr/bin/env node
// Copy public articles from the actual local D1 archive, not the older collector.
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { DatabaseSync } from 'node:sqlite';
import { parseWranglerJson, validateIds } from './cloudflare-db.mjs';

const root = resolve(import.meta.dirname, '..');
export const fields = ['id', 'company_id', 'company', 'title', 'url', 'summary', 'published_at', 'discovered_at', 'topics'];
const privateTables = ['profiles', 'user_company_follows', 'user_topic_follows', 'user_bookmarks', 'user_read_logs', 'engagements'];
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const literal = value => {
  if (value === null) return 'NULL';
  if (typeof value !== 'string' || value.includes('\0')) throw new Error('Invalid public article field');
  return `'${value.replaceAll("'", "''")}'`;
};

export function importSql(source, before, companyIds) {
  const byUrl = new Map(before.map(row => [row.url, row]));
  const byId = new Map(before.map(row => [row.id, row]));
  const seen = new Set();
  const missing = [];
  for (const article of source) {
    if (seen.has(article.url)) throw new Error('Duplicate local article URL');
    seen.add(article.url);
    if (!companyIds.has(article.company_id)) throw new Error(`Missing remote company: ${article.company_id}`);
    if (!article.id || !article.title || !Number.isFinite(Date.parse(article.discovered_at)) || !Array.isArray(JSON.parse(article.topics))) throw new Error('Invalid local article metadata');
    if (byUrl.has(article.url)) {
      if (byUrl.get(article.url).company_id !== article.company_id) throw new Error(`Company conflict for ${article.url}`);
      continue; // Existing cloud IDs and metadata stay authoritative.
    }
    if (byId.has(article.id)) throw new Error(`Article ID collision: ${article.id}`);
    const url = new URL(article.url);
    if (!['https:', 'http:'].includes(url.protocol)) throw new Error('Unsupported article URL');
    missing.push(article);
  }
  const statements = [];
  for (let start = 0; start < missing.length; start += 10) {
    const batch = missing.slice(start, start + 10);
    const statement = `INSERT INTO articles (${fields.join(',')}) VALUES ${batch.map(article => `(${fields.map(field => literal(article[field])).join(',')})`).join(',')} ON CONFLICT(url) DO NOTHING;`;
    if (Buffer.byteLength(statement) > 90000) throw new Error('Article batch exceeds the reviewed statement bound');
    statements.push(statement);
  }
  return { missing, sql: statements.join('\n') + '\n' };
}

export function verify(source, before, after) {
  const byUrl = new Map(after.map(article => [article.url, article]));
  const old = new Map(before.map(article => [article.url, article]));
  if (byUrl.size !== after.length) throw new Error('Remote URLs are not unique');
  for (const previous of before) {
    if (JSON.stringify(byUrl.get(previous.url)) !== JSON.stringify(previous)) throw new Error(`Existing remote article changed: ${previous.id}`);
  }
  for (const article of source) {
    const actual = byUrl.get(article.url);
    if (!actual || actual.company_id !== article.company_id) throw new Error(`Missing local story in remote archive: ${article.url}`);
    if (!old.has(article.url) && fields.some(field => actual[field] !== article[field])) throw new Error(`Imported metadata mismatch: ${article.id}`);
  }
  return source.length;
}

async function main() {
  const mode = process.argv[2];
  if (!['--plan', '--apply'].includes(mode) || process.argv.length !== 3) throw new Error('Use --plan or --apply');
  const output = join(root, 'outputs', 'archive-sync');
  mkdirSync(output, { recursive: true });
  const envFile = join(root, '.env.local');
  const settings = parseEnv(readFileSync(envFile, 'utf8'));
  validateIds(settings);
  const config = join(output, 'wrangler.json');
  writeFileSync(config, JSON.stringify({ name: 'readwell-archive-sync', compatibility_date: '2026-05-15', account_id: settings.CLOUDFLARE_ACCOUNT_ID,
    d1_databases: [{ binding: 'DB', database_name: 'reads', database_id: settings.CLOUDFLARE_D1_DATABASE_ID }] }, null, 2));
  const wrangler = (...args) => {
    const result = spawnSync(process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), ...args, '--config', config, '--env-file', envFile], {
      cwd: root, encoding: 'utf8', maxBuffer: 128 * 1024 * 1024,
      env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: settings.CLOUDFLARE_ACCOUNT_ID, WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false' },
    });
    if (result.error) throw result.error;
    if (result.status) throw new Error(result.stderr || result.stdout);
    return result.stdout;
  };
  const query = sql => {
    const results = parseWranglerJson(wrangler('d1', 'execute', 'DB', '--remote', '--json', '--command', sql));
    if (!Array.isArray(results) || results.some(result => !result.success)) throw new Error('Remote query failed');
    return results.map(result => result.results ?? []);
  };
  const databases = parseWranglerJson(wrangler('d1', 'list', '--json'));
  const target = databases.find(database => database.uuid.toLowerCase() === settings.CLOUDFLARE_D1_DATABASE_ID.toLowerCase());
  if (target?.name !== 'reads') throw new Error('Configured remote database is not the expected reads database');

  const localDir = join(root, '.wrangler/state/v3/d1/miniflare-D1DatabaseObject');
  const candidates = readdirSync(localDir).filter(file => file.endsWith('.sqlite') && file !== 'metadata.sqlite');
  if (candidates.length !== 1) throw new Error('Local archive database selection is ambiguous');
  const local = new DatabaseSync(join(localDir, candidates[0]), { readOnly: true });
  let source;
  try {
    local.exec('BEGIN');
    source = local.prepare(`SELECT ${fields.join(',')} FROM articles ORDER BY url`).all().map(row => ({ ...row }));
    local.exec('ROLLBACK');
  } finally { local.close(); }
  if (source.length < 6058) throw new Error('This is not the expected complete local archive');
  const snapshotSql = `SELECT ${fields.join(',')} FROM articles ORDER BY url; SELECT id FROM companies ORDER BY id; ${privateTables.map(table => `SELECT * FROM ${table} ORDER BY ${table === 'profiles' ? 'user_id' : table === 'engagements' ? 'reader_id,article_id,kind' : table === 'user_company_follows' ? 'user_id,company_id' : table === 'user_topic_follows' ? 'user_id,topic_id' : 'user_id,article_id'};`).join(' ')} PRAGMA foreign_key_check;`;
  const before = query(snapshotSql);
  if (before.at(-1).length) throw new Error('Remote foreign keys fail before import');
  const prepared = importSql(source, before[0], new Set(before[1].map(company => company.id)));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const sqlFile = join(output, `${stamp}-articles.sql`);
  const manifestFile = join(output, `${stamp}-manifest.json`);
  writeFileSync(sqlFile, prepared.sql);
  writeFileSync(manifestFile, JSON.stringify(source));
  const report = { mode: mode.slice(2), sourceArticles: source.length, remoteBefore: before[0].length,
    missingArticles: prepared.missing.length, publicManifestHash: digest(source), sqlFile, manifestFile,
    privateTables: Object.fromEntries(privateTables.map((table, index) => [table, { count: before[index + 2].length, hash: digest(before[index + 2]) }])) };
  if (mode === '--apply' && prepared.missing.length) {
    report.backupFile = join(output, `${stamp}-remote-before.sql`);
    wrangler('d1', 'export', 'DB', '--remote', '--skip-confirmation', '--output', report.backupFile);
    if (!statSync(report.backupFile).isFile() || statSync(report.backupFile).size < 100) throw new Error('Remote backup was not saved; no import attempted');
    const execution = parseWranglerJson(wrangler('d1', 'execute', 'DB', '--remote', '--yes', '--json', '--file', sqlFile));
    if (!Array.isArray(execution) || execution.some(result => !result.success)) throw new Error('Import did not confirm success; inspect remote state before retrying');
  }
  if (mode === '--apply') {
    const after = query(snapshotSql);
    report.verifiedLocalArticles = verify(source, before[0], after[0]);
    if (after.at(-1).length) throw new Error('Remote foreign keys fail after import');
    for (let index = 0; index < privateTables.length; index++) {
      if (digest(before[index + 2]) !== digest(after[index + 2])) throw new Error(`Remote ${privateTables[index]} changed during sync; inspect backup and concurrent activity`);
    }
    report.remoteAfter = after[0].length;
    report.existingArticleIdsAndMetadataPreserved = true;
    report.privateDataUnchanged = true;
    report.foreignKeysValid = true;
    report.status = 'verified';
  }
  const reportFile = join(output, `${stamp}-${mode.slice(2)}-report.json`);
  writeFileSync(reportFile, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report, privateTables: Object.fromEntries(Object.entries(report.privateTables).map(([table, data]) => [table, data.count])), reportFile }, null, 2));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
