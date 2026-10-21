// Apply the reviewed, additive publisher bundle to the app/ingestion D1 catalog.
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { parseWranglerJson, validateIds } from './cloudflare-db.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2];
if (process.argv.length !== 3 || !['--local', '--remote'].includes(mode)) throw new Error('Usage: node scripts/apply-publishers.mjs --local | --remote');
const settings = parseEnv(readFileSync(join(root, '.env.local'), 'utf8'));
validateIds(settings);
const output = join(root, 'outputs', 'new-publishers');
mkdirSync(output, { recursive: true });
const sql = join(output, 'source-and-articles.sql');
const catalog = JSON.parse(readFileSync(join(output, 'verification.json'), 'utf8'));
if (catalog.publishers.length !== 3 || !readFileSync(sql, 'utf8').startsWith('-- Add public engineering/developer publications')) throw new Error('Run register-publishers.py to prepare the reviewed bundle first');
// A root-local config keeps Wrangler local export persistence at .wrangler/state.
const config = mode === '--local' ? join(root, '.env.domain-local.json') : join(output, 'remote-db.json');
writeFileSync(config, JSON.stringify({ name: 'readzz-publisher-admin', compatibility_date: '2026-05-15', account_id: settings.CLOUDFLARE_ACCOUNT_ID,
  d1_databases: [{ binding: 'DB', database_name: mode === '--remote' ? 'reads' : 'site-creator-d1', database_id: mode === '--remote' ? settings.CLOUDFLARE_D1_DATABASE_ID : '00000000-0000-4000-8000-000000000000' }] }, null, 2));
const target = mode === '--remote' ? ['--remote'] : ['--local', '--persist-to', join(root, '.wrangler/state')];
function wrangler(...args) {
  const result = spawnSync(process.execPath, [join(root, 'node_modules/wrangler/bin/wrangler.js'), ...args, '--config', config, '--env-file', join(root, '.env.local')], {
    cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024,
    env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: settings.CLOUDFLARE_ACCOUNT_ID, WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false' },
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(result.stderr || result.stdout || `Wrangler exited with status ${result.status}, signal ${result.signal ?? 'none'}`);
  return result.stdout;
}
const query = statement => parseWranglerJson(wrangler('d1', 'execute', 'DB', ...target, '--json', '--command', statement)).flatMap(result => result.results ?? []);
const before = query('SELECT id,url FROM articles; SELECT COUNT(*) AS profiles FROM profiles;');
const backup = join(output, `${new Date().toISOString().replace(/[:.]/g, '-')}-${mode.slice(2)}-backup.${mode === '--remote' ? 'sql' : 'sqlite3'}`);
if (mode === '--remote') {
  wrangler('d1', 'export', 'DB', '--remote', '--skip-confirmation', '--output', backup);
} else {
  // SQLite's online read-only backup avoids materializing the whole local DB as
  // SQL inside a memory-limited development Worker. The app stays running.
  const script = `import pathlib,sqlite3,sys\nroot=pathlib.Path(sys.argv[1]);paths=[]\nfor path in (root/'.wrangler/state').rglob('*.sqlite'):\n with sqlite3.connect(path.resolve().as_uri()+'?mode=ro',uri=True) as db:\n  tables={r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}\n  if {'articles','profiles','engagements'}<=tables:paths.append(path)\nif len(paths)!=1:raise RuntimeError('Expected exactly one local app database')\nwith sqlite3.connect(paths[0].resolve().as_uri()+'?mode=ro',uri=True) as db,sqlite3.connect(sys.argv[2]) as copy:db.backup(copy)\n`;
  const result = spawnSync('python', ['-c', script, root, backup], { encoding: 'utf8' });
  if (result.error || result.status) throw result.error || new Error(result.stderr || 'Local backup failed');
}
parseWranglerJson(wrangler('d1', 'execute', 'DB', ...target, '--yes', '--json', '--file', sql));
const after = query('SELECT id,url FROM articles; SELECT COUNT(*) AS profiles FROM profiles;');
const ids = new Map(after.filter(row => row.id).map(row => [row.id, row.url]));
if (before.some(row => row.id && ids.get(row.id) !== row.url) || Number(after.find(row => 'profiles' in row)?.profiles) !== Number(before.find(row => 'profiles' in row)?.profiles)) throw new Error('Existing identities or profile counts changed; inspect the backup');
const publishers = query("SELECT c.id,c.name,s.mode,s.feed_urls,COUNT(a.id) AS articles FROM companies c JOIN sources s ON s.company_id=c.id LEFT JOIN articles a ON a.company_id=c.id WHERE c.id IN ('linear','planetscale','posthog') GROUP BY c.id ORDER BY c.id;");
const foreignKeys = query('PRAGMA foreign_key_check;');
if (publishers.length !== 3 || publishers.some(row => row.mode !== 'feed' || !row.articles) || foreignKeys.length) throw new Error('Publisher verification failed');
const report = { target: mode.slice(2), backup, originalIdentitiesPreserved: true, profilesPreserved: true, publishers };
writeFileSync(join(output, `${mode.slice(2)}-report.json`), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
