import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { configDigest, productionConfig } from './production-config.mjs';
import './sites-env.mjs';

const mode = process.argv[2];
if (!['check', 'build', 'dry-run', 'deploy'].includes(mode) || process.argv.length !== 3) throw new Error('Use check, build, dry-run or deploy.');
const settings = { ...(existsSync('.env.production') ? parseEnv(readFileSync('.env.production', 'utf8')) : {}), ...process.env };
const config = productionConfig(settings);
const digest = configDigest(config);
writeFileSync('.wrangler.production.json', JSON.stringify(config, null, 2) + '\n');
if (mode === 'check') {
  console.log('Backend configuration is valid. No deployment or database changes were made.');
  process.exit(0);
}
const manifestPath = 'outputs/backend/production-manifest.json';
function wrangler(args) {
  // An empty env file prevents local/test settings leaking into production.
  mkdirSync('outputs/backend', { recursive: true });
  writeFileSync('outputs/backend/empty.env', '');
  const result = spawnSync(process.execPath, [fileURLToPath(new URL('../node_modules/wrangler/bin/wrangler.js', import.meta.url)),
    ...args, '--config', '.wrangler.production.json', '--env-file', 'outputs/backend/empty.env'], {
    env: { ...process.env, WRANGLER_SEND_METRICS: 'false', WRANGLER_WRITE_LOGS: 'false' }, stdio: 'inherit', windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (mode === 'build') {
  wrangler(['deploy', '--dry-run', '--outdir', 'outputs/backend/bundle']);
  writeFileSync(manifestPath, JSON.stringify({ digest, builtAt: new Date().toISOString() }) + '\n');
  console.log('Cloudflare API bundle verified locally. No deployment was performed.');
} else {
  if (!existsSync(manifestPath) || JSON.parse(readFileSync(manifestPath, 'utf8')).digest !== digest) throw new Error('Run npm run build:backend with these production settings first.');
  wrangler(['deploy', ...(mode === 'dry-run' ? ['--dry-run', '--outdir', 'outputs/backend/bundle'] : [])]);
}
