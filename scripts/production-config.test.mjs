import assert from 'node:assert/strict';
import test from 'node:test';
import { productionConfig, configDigest, verifyBuiltConfig } from './production-config.mjs';

const settings = {
  CLOUDFLARE_ACCOUNT_ID: 'a'.repeat(32), CLOUDFLARE_D1_DATABASE_ID: '12345678-1234-4567-8901-123456789012',
  APP_ORIGIN: 'https://readwell.example', NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_' + Buffer.from('clerk.readwell.example$').toString('base64'),
};
test('release configuration binds the intended database and origin, and never copies arbitrary secrets', () => {
  const config = productionConfig({ ...settings, CLERK_SECRET_KEY: 'never-copy-this', CLOUDFLARE_API_TOKEN: 'never-copy-this' });
  assert.equal(config.d1_databases[0].database_id, settings.CLOUDFLARE_D1_DATABASE_ID);
  assert.equal(config.vars.CLERK_AUTHORIZED_PARTIES, settings.APP_ORIGIN);
  assert.equal(config.vars.REQUIRE_SCHEDULED_INGESTION, 'true');
  assert.equal(config.main, 'workers/api.ts');
  assert.equal(config.name, 'readwell-api');
  assert.ok(!JSON.stringify(config).includes('never-copy-this'));
});
test('release rejects test keys, placeholder bindings, invalid names and unsafe return origins', () => {
  for (const patch of [
    { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_example' }, { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_live_invalid' },
    { CLOUDFLARE_D1_DATABASE_ID: '00000000-0000-4000-8000-000000000000' }, { CLOUDFLARE_ACCOUNT_ID: '' },
    { APP_ORIGIN: 'http://readwell.example' }, { APP_ORIGIN: 'https://localhost' }, { APP_ORIGIN: 'https://readwell.example/path' },
    { APP_ORIGIN: 'https://user:pass@readwell.example' }, { READWELL_WORKER_NAME: '../outside' },
  ]) assert.throws(() => productionConfig({ ...settings, ...patch }));
});
test('a stale build cannot be deployed against changed keys or database settings', () => {
  const config = productionConfig(settings);
  assert.doesNotThrow(() => verifyBuiltConfig(config, config));
  const changed = productionConfig({ ...settings, APP_ORIGIN: 'https://different.example' });
  assert.notEqual(configDigest(config), configDigest(changed));
  assert.throws(() => verifyBuiltConfig(config, changed), /does not match/);
  assert.throws(() => verifyBuiltConfig({ ...config, d1_databases: [] }, config), /does not match/);
});

test('first deployment can use development auth only in an explicitly separate preview Worker', () => {
  const previewSettings = { ...settings, READWELL_DEPLOYMENT_MODE: 'preview', APP_ORIGIN: 'https://readwell-test.vercel.app', NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_' + Buffer.from('readwell-test.clerk.accounts.dev$').toString('base64') };
  const config = productionConfig(previewSettings);
  assert.equal(config.name, 'readwell-api-preview');
  assert.equal(config.vars.CLERK_AUTHORIZED_PARTIES, previewSettings.APP_ORIGIN);
  assert.equal(config.vars.REQUIRE_SCHEDULED_INGESTION, 'false');
  assert.throws(() => productionConfig({ ...previewSettings, READWELL_DEPLOYMENT_MODE: 'production' }), /production/);
  assert.throws(() => productionConfig({ ...previewSettings, READWELL_WORKER_NAME: 'readwell-api' }), /separate Worker/);
  assert.throws(() => productionConfig({ ...settings, READWELL_DEPLOYMENT_MODE: 'typo' }), /production or preview/);
});
