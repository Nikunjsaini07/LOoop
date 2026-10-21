import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';
import { configDigest, productionConfig, verifyBuiltConfig } from './production-config.mjs';
import './sites-env.mjs';

const mode = process.argv[2];
if (!['check', 'build', 'dry-run', 'deploy'].includes(mode) || process.argv.length !== 3) throw new Error('Use check, build, dry-run or deploy.');
const settings = { ...(existsSync('.env.production') ? parseEnv(readFileSync('.env.production', 'utf8')) : {}), ...process.env };
const config = productionConfig(settings);
const digest = configDigest(config);
// Only non-secret, explicitly selected fields go into Wrangler configuration.
writeFileSync('.wrangler.production.json', JSON.stringify(config, null, 2) + '\n');
if (mode === 'check') {
  console.log('Production settings are valid. This checks local configuration only; no deployment or remote database changes were made.');
  process.exit(0);
}
const childEnv = { ...process.env, READWELL_PRODUCTION: '1', NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: config.vars.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY, APP_ORIGIN: config.vars.APP_ORIGIN };
function run(script, args) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(script, import.meta.url)), ...args], {
    env: childEnv, stdio: 'inherit', windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
if (mode === 'build') {
  run('./run-framework.mjs', ['build']);
  verifyBuiltConfig(JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8')), config);
  writeFileSync('dist/production-manifest.json', JSON.stringify({ digest, builtAt: new Date().toISOString() }) + '\n');
  console.log('Production build verified. Next: npm run deploy:check.');
} else {
  if (!existsSync('dist/production-manifest.json') || JSON.parse(readFileSync('dist/production-manifest.json', 'utf8')).digest !== digest) {
    throw new Error('No matching production build. Run npm run build:production first.');
  }
  verifyBuiltConfig(JSON.parse(readFileSync('dist/server/wrangler.json', 'utf8')), config);
  run('../node_modules/wrangler/bin/wrangler.js', ['deploy', '--config', 'dist/server/wrangler.json',
    ...(mode === 'dry-run' ? ['--dry-run', '--outdir', 'outputs/production-bundle'] : []),
  ]);
}
