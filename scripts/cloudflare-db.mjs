#!/usr/bin/env node
// Remote D1 administration. Read-only unless --import is explicitly supplied.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const normalizeSql = value => String(value??'').replace(/IF NOT EXISTS\s+/gi,'').replace(/\s+/g,' ').trim().replace(/;$/,'');
const triggerSources=readFileSync(join(ROOT,'drizzle','0001_readzz_domain.sql'),'utf8');
const reviewedTriggers=new Map([...triggerSources.matchAll(/CREATE TRIGGER IF NOT EXISTS (\w+)\b[\s\S]*?\bEND;/g)].map(match=>[match[1],normalizeSql(match[0])]));
const EXPECTED = {
  articles: { id: ['TEXT', 1, 1], company_id: ['TEXT', 1, 0], company: ['TEXT', 1, 0], title: ['TEXT', 1, 0], url: ['TEXT', 1, 0], summary: ['TEXT', 1, 0], published_at: ['TEXT', 0, 0], discovered_at: ['TEXT', 1, 0], topics: ['TEXT', 1, 0] },
  profiles: { user_id: ['TEXT', 1, 1], data: ['TEXT', 1, 0], version: ['INTEGER', 1, 0], updated_at: ['TEXT', 1, 0] },
  refresh_locks: { id: ['TEXT', 1, 1], expires_at: ['TEXT', 1, 0] },
  source_refresh: { source_id: ['TEXT', 1, 1], last_attempt: ['TEXT', 0, 0], last_success: ['TEXT', 0, 0], etag: ['TEXT', 0, 0], last_modified: ['TEXT', 0, 0], error: ['TEXT', 0, 0] },
};

export function validateIds(settings) {
  if (!/^[a-f0-9]{32}$/i.test(settings.CLOUDFLARE_ACCOUNT_ID ?? '')) throw new Error('CLOUDFLARE_ACCOUNT_ID must be a 32-character hexadecimal account ID in .env.local.');
  if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(settings.CLOUDFLARE_D1_DATABASE_ID ?? '')) throw new Error('CLOUDFLARE_D1_DATABASE_ID must be a UUID in .env.local.');
}

export function validateSchema(tables, columns, urlIndexes, triggers = []) {
  const present = Object.keys(EXPECTED).filter(name => tables.includes(name));
  if (!present.length) return 'fresh';
  if (present.length !== Object.keys(EXPECTED).length) throw new Error('Remote app schema is partially migrated. No changes made; apply/review pending migrations first.');
  for (const [table, expected] of Object.entries(EXPECTED)) {
    const actual = columns[table] ?? [];
    if (actual.length !== Object.keys(expected).length || actual.some(column => {
      const want = expected[column.name];
      return !want || String(column.type).toUpperCase() !== want[0] || Number(column.notnull) !== want[1] || Number(column.pk) !== want[2];
    })) throw new Error(`Remote table ${table} is incompatible with the committed app schema. No changes made.`);
  }
  if (!urlIndexes.some(index => index.unique && index.columns.length === 1 && index.columns[0] === 'url')) throw new Error('Remote articles.url requires a unique index. No changes made.');
  if (triggers.some(trigger => Object.hasOwn(EXPECTED, trigger.tbl_name) && reviewedTriggers.get(trigger.name)!==normalizeSql(trigger.sql))) throw new Error('Remote app tables contain unreviewed triggers. No changes made.');
  return 'compatible';
}

export function verifyArticles(source, before, after) {
  const old = new Map(before.map(article => [article.url, article]));
  const current = new Map(after.map(article => [article.url, article]));
  if (current.size !== after.length) throw new Error('Remote article URLs are not unique.');
  for (const article of source) {
    const row = current.get(article.url);
    const expectedId = old.get(article.url)?.id ?? article.id;
    const discovery = Date.parse(row?.discovered_at);
    const earliestDiscovery = Math.min(Date.parse(article.discovered_at), Date.parse(old.get(article.url)?.discovered_at ?? article.discovered_at));
    if (!row || row.id !== expectedId || row.company_id !== article.company_id || !Number.isFinite(discovery) || !Number.isFinite(earliestDiscovery) || discovery > earliestDiscovery) {
      throw new Error(`Article verification failed for ${article.url}`);
    }
  }
  for (const row of before) if (current.get(row.url)?.id !== row.id) throw new Error('An existing remote article ID was lost or changed.');
  return source.length;
}

function subprocess(executable, args, options = {}) {
  const result = spawnSync(executable, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${executable === process.execPath ? 'Wrangler' : executable} failed:\n${result.stderr?.trim() || result.stdout?.trim() || `exit ${result.status}`}`);
  return result.stdout;
}

function parseJson(output) {
  try { return JSON.parse(output); } catch { throw new Error('A subprocess did not return valid JSON. Inspect the remote database before retrying because a completed operation may already have changed it.'); }
}

export function parseWranglerJson(output) {
  // Wrangler's file-import spinner writes progress to stdout even with --json.
  // Accept only a complete trailing JSON document, never a partial result.
  for (const match of output.matchAll(/^[\[{]/gm)) {
    try { return JSON.parse(output.slice(match.index)); } catch { /* Try the next document start. */ }
  }
  throw new Error('Wrangler did not return a complete JSON result. Inspect the remote database before retrying because the operation may have completed.');
}

function rows(response) {
  if (!Array.isArray(response) || response.some(result => result.success === false)) throw new Error('D1 returned an unsuccessful SQL result.');
  return response.flatMap(result => result.results ?? []);
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log('Usage: node scripts/cloudflare-db.mjs [--inspect | --import | --verify]\nDefault: remote read-only inspection. --import exports a backup, initializes an empty app schema, imports public collector data, and verifies it. --verify compares the current collector snapshot without changing D1.');
    return;
  }
  if (args.some(arg => !['--inspect', '--import', '--verify'].includes(arg)) || args.length > 1) throw new Error('Specify exactly one of --inspect, --import, or --verify; use --help for details.');
  const mode = args[0] ?? '--inspect';
  const envFile = join(ROOT, '.env.local');
  const settings = parseEnv(readFileSync(envFile, 'utf8'));
  validateIds(settings);
  // No token is read, copied, logged, or written by this helper. Wrangler owns auth.
  const environment = { ...process.env, CLOUDFLARE_ACCOUNT_ID: settings.CLOUDFLARE_ACCOUNT_ID, WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false' };
  const output = join(ROOT, 'outputs', 'cloudflare-d1');
  mkdirSync(output, { recursive: true });
  const configPath = join(output, 'wrangler.json');
  const baseConfig = { name: 'longreads-d1-admin', compatibility_date: '2026-10-19', account_id: settings.CLOUDFLARE_ACCOUNT_ID };
  // Separate ignored config never alters Sites hosting or local preview bindings.
  writeFileSync(configPath, JSON.stringify(baseConfig, null, 2) + '\n');
  const wrangler = (...command) => subprocess(process.execPath, [join(ROOT, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), ...command, '--config', configPath, '--env-file', envFile], { env: environment });
  const databases = parseJson(wrangler('d1', 'list', '--json'));
  if (!Array.isArray(databases)) throw new Error('Unexpected D1 database list response.');
  const database = databases.find(item => item.uuid?.toLowerCase() === settings.CLOUDFLARE_D1_DATABASE_ID.toLowerCase());
  if (!database?.name) throw new Error('Configured D1 database ID was not found in the configured Cloudflare account. No database was created or changed.');
  writeFileSync(configPath, JSON.stringify({ ...baseConfig, d1_databases: [{ binding: 'DB', database_name: database.name, database_id: database.uuid, migrations_dir: join(ROOT, 'drizzle') }] }, null, 2) + '\n');
  const execute = sql => rows(parseJson(wrangler('d1', 'execute', 'DB', '--remote', '--json', '--command', sql)));
  const executeFile = path => rows(parseWranglerJson(wrangler('d1', 'execute', 'DB', '--remote', '--yes', '--json', '--file', path)));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-') + '-' + process.pid;
  const schemaPath = join(output, `${stamp}-schema.sql`);
  wrangler('d1', 'export', 'DB', '--remote', '--skip-confirmation', '--output', schemaPath, '--no-data');
  if (!statSync(schemaPath).isFile()) throw new Error('Remote schema export was not saved.');
  const objects = execute("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE type IN ('table','trigger') AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'");
  const tables = objects.filter(item => item.type === 'table').map(item => item.name);
  const columns = {};
  for (const name of Object.keys(EXPECTED).filter(name => tables.includes(name))) columns[name] = execute(`PRAGMA table_info('${name}')`);
  const urlIndexes = [];
  if (tables.includes('articles')) for (const index of execute("PRAGMA index_list('articles')")) {
    if (Number(index.unique) === 1 && !Number(index.partial)) urlIndexes.push({ unique: true, columns: execute(`PRAGMA index_info('${String(index.name).replaceAll("'", "''")}')`).map(column => column.name) });
  }
  let schema = validateSchema(tables, columns, urlIndexes, objects.filter(item => item.type === 'trigger'));
  const summary = () => Object.fromEntries(execute('SELECT COUNT(*) AS articles FROM articles; SELECT COUNT(*) AS profiles FROM profiles; SELECT COUNT(*) AS sources FROM source_refresh;').flatMap(row => Object.entries(row)));
  const beforeSummary = schema === 'compatible' ? summary() : { articles: 0, profiles: 0, sources: 0 };
  const report = { mode: mode.slice(2), database: database.name, databaseId: database.uuid, schema, before: beforeSummary, schemaFile: schemaPath, configFile: configPath, remoteChanged: false };
  if (mode === '--inspect') {
    console.log(JSON.stringify(report, null, 2));
    return;
  }
  const python = process.env.PYTHON ?? 'python';
  const exportReport = parseJson(subprocess(python, [join(ROOT, 'scripts', 'import-collector.py'), '--export-only']));
  // Read only public collector metadata, never local profiles or private app rows.
  const source = JSON.parse(readFileSync(exportReport.manifestFile, 'utf8'));
  if (!source.length || source.length !== exportReport.sourceArticles) throw new Error('Collector verification manifest does not match the SQL snapshot.');
  report.sourceArticles = source.length;
  const beforeRows = schema === 'compatible' ? execute('SELECT id,company_id,url,discovered_at FROM articles') : [];
  if (mode === '--import') {
    if (tables.length) {
      report.backupFile = join(output, `${stamp}-before-import.sql`);
      wrangler('d1', 'export', 'DB', '--remote', '--skip-confirmation', '--output', report.backupFile);
      if (!statSync(report.backupFile).isFile() || !statSync(report.backupFile).size) throw new Error('Pre-import database backup was not saved. No changes made.');
    }
    if (schema === 'fresh') {
      const migrations = readdirSync(join(ROOT, 'drizzle')).filter(file => file.startsWith('0000_') && file.endsWith('.sql')).sort();
      if (migrations.length !== 1) throw new Error('Fresh schema initialization expects the reviewed initial migration.');
      executeFile(join(ROOT, 'drizzle', migrations[0]));
      schema = 'compatible';
    }
    executeFile(exportReport.sqlFile);
    if(!tables.includes('topics')) subprocess(process.execPath,['--experimental-strip-types',join(ROOT,'scripts','domain-upgrade.mjs'),'--remote']);
    report.remoteChanged = true;
  } else if (schema !== 'compatible') throw new Error('Remote app schema is empty. Import before verifying.');
  const afterRows = execute('SELECT id,company_id,url,discovered_at FROM articles');
  report.verifiedSourceArticles = verifyArticles(source, beforeRows, afterRows);
  report.after = summary();
  if (report.after.profiles !== beforeSummary.profiles) throw new Error('Profile count changed during the operation; check concurrent account creation and the saved pre-import backup.');
  report.schema = schema;
  const reportPath = join(output, `${stamp}-${mode.slice(2)}-report.json`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ ...report, reportFile: reportPath }, null, 2));
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  main().catch(error => { console.error(`Cloudflare D1 operation failed: ${error.message}`); process.exitCode = 1; });
}
