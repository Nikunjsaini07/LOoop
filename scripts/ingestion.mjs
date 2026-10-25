#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { validateIds } from './cloudflare-db.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const mode = process.argv[2] ?? '--prepare';
if (process.argv.length > 3 || !['--prepare', '--dry-run', '--deploy', '--status', '--smoke-server'].includes(mode)) {
  throw new Error('Usage: node scripts/ingestion.mjs [--prepare | --dry-run | --deploy | --status | --smoke-server]');
}
const settings = parseEnv(readFileSync(join(root, '.env.local'), 'utf8'));
validateIds(settings);
const output = join(root, 'outputs', 'ingestion');
mkdirSync(output, { recursive: true });
const configPath = join(output, mode === '--smoke-server' ? 'wrangler-smoke.json' : 'wrangler.json');
const config = {
  name: 'readzz-ingestion',
  main: join(root, 'workers', 'ingestion.ts'),
  compatibility_date: '2026-05-15',
  compatibility_flags: ['nodejs_compat'],
  account_id: settings.CLOUDFLARE_ACCOUNT_ID,
  workers_dev: false,
  preview_urls: false,
  triggers: { crons: ['0 6,18 * * *'] },
  observability: { enabled: true },
  d1_databases: [{ binding: 'DB', database_name: 'reads', database_id: settings.CLOUDFLARE_D1_DATABASE_ID,
    ...(mode === '--smoke-server' ? { remote: true } : {}) }],
};
writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
if (mode === '--prepare') {
  console.log(JSON.stringify({ worker: config.name, configPath, schedule: 'Twice daily at 06:00 and 18:00 UTC', publicHttpEndpoint: false }, null, 2));
} else {
  const command = mode === '--status'
    ? ['d1', 'execute', 'DB', '--remote', '--json', '--command', "SELECT COUNT(*) AS articles FROM articles; SELECT source_id,last_attempt,last_success,error FROM source_refresh ORDER BY source_id;"]
    : mode === '--smoke-server'
      ? ['dev', '--test-scheduled', '--ip', '127.0.0.1', '--port', '8788', '--inspector-port', '0']
      : ['deploy', ...(mode === '--dry-run' ? ['--dry-run', '--outdir', join(output, 'bundle')] : [])];
  const result = spawnSync(process.execPath, [join(root, 'node_modules', 'wrangler', 'bin', 'wrangler.js'), ...command,
    '--config', configPath, '--env-file', join(root, '.env.local')], {
    cwd: root, stdio: 'inherit', env: { ...process.env, CLOUDFLARE_ACCOUNT_ID: settings.CLOUDFLARE_ACCOUNT_ID,
      WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false' },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
