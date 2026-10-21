import { createHash } from 'node:crypto';

export function productionConfig(settings) {
  const account = settings.CLOUDFLARE_ACCOUNT_ID;
  const database = settings.CLOUDFLARE_D1_DATABASE_ID;
  if (!/^[a-f0-9]{32}$/i.test(account ?? '')) throw new Error('Set CLOUDFLARE_ACCOUNT_ID to your Cloudflare account ID.');
  if (!/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/i.test(database ?? '') || database === '00000000-0000-4000-8000-000000000000') {
    throw new Error('Set CLOUDFLARE_D1_DATABASE_ID to the existing reads database ID, never the local placeholder.');
  }
  let origin;
  try { origin = new URL(settings.APP_ORIGIN); } catch { throw new Error('Set APP_ORIGIN to your public HTTPS origin.'); }
  if (origin.protocol !== 'https:' || origin.username || origin.password || origin.search || origin.hash || origin.pathname !== '/'
    || /^(localhost|127\.|0\.|\[|.*\.local$)/i.test(origin.hostname) || !origin.hostname.includes('.')) {
    throw new Error('APP_ORIGIN must be a public HTTPS origin without a path, query or credentials.');
  }
  const key = settings.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? '';
  const host = Buffer.from(key.slice(8), 'base64').toString('utf8');
  if (!key.startsWith('pk_live_') || !/^[a-z0-9.-]+\$$/i.test(host)) {
    throw new Error('Set NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY to your real Clerk production pk_live_ key. Test keys cannot be released.');
  }
  const name = settings.READWELL_WORKER_NAME || 'readwell-web';
  if (!/^[a-z][a-z0-9-]{0,62}$/.test(name)) throw new Error('READWELL_WORKER_NAME must be a lowercase Worker name.');
  const databaseName = settings.CLOUDFLARE_D1_DATABASE_NAME || 'reads';
  if (!/^[a-zA-Z0-9_-]+$/.test(databaseName)) throw new Error('Invalid D1 database name.');
  return {
    name, account_id: account, main: 'workers/web.ts',
    compatibility_date: '2026-05-15', compatibility_flags: ['nodejs_compat'],
    workers_dev: true, preview_urls: false,
    observability: { enabled: true },
    vars: { NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: key, CLERK_AUTHORIZED_PARTIES: origin.origin, APP_ORIGIN: origin.origin, REQUIRE_SCHEDULED_INGESTION: 'true' },
    d1_databases: [{ binding: 'DB', database_name: databaseName, database_id: database, migrations_dir: 'drizzle' }],
  };
}

export function configDigest(config) {
  return createHash('sha256').update(JSON.stringify(config)).digest('hex');
}

export function verifyBuiltConfig(built, expected) {
  const binding = built.d1_databases?.find(value => value.binding === 'DB');
  if (built.name !== expected.name || built.account_id !== expected.account_id
    || binding?.database_id !== expected.d1_databases[0].database_id
    || Object.entries(expected.vars).some(([key, value]) => built.vars?.[key] !== value)) {
    throw new Error('The build does not match production settings. Run npm run build:production.');
  }
}
