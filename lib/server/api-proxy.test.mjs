import assert from 'node:assert/strict';
import test from 'node:test';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';

const bundle = await build({ entryPoints: [fileURLToPath(new URL('./api-proxy.ts', import.meta.url))], bundle: true, write: false, format: 'esm', platform: 'node' });
const { proxyApi } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);

test('Vercel proxy forwards account tokens and exact request data without trusting client proxy credentials or cookies', async () => {
  const saved = { api: process.env.READWELL_API_URL, secret: process.env.READWELL_PROXY_SECRET, fetch: globalThis.fetch };
  process.env.READWELL_API_URL = 'https://readwell-api.example';
  process.env.READWELL_PROXY_SECRET = 's'.repeat(64);
  try {
    let call;
    globalThis.fetch = async (url, init) => { call = { url, init }; return Response.json({ saved: true }, { headers: { 'set-cookie': 'backend_cookie=bad', 'x-readwell-proxy-secret': 'never-return-this', 'content-encoding': 'gzip', 'content-length': '1000' } }); };
    const response = await proxyApi(new Request('https://readwell.example/api/profile?version=2', {
      method: 'POST', headers: { origin: 'https://readwell.example', 'content-type': 'application/json', authorization: 'Bearer reader-session', cookie: 'private-cookie=secret', 'x-readwell-proxy-secret': 'attacker', 'x-forwarded-for': 'attacker' }, body: '{"version":2}',
    }));
    assert.equal(response.status, 200);
    assert.equal(String(call.url), 'https://readwell-api.example/api/profile?version=2');
    assert.equal(call.init.headers.get('authorization'), 'Bearer reader-session');
    assert.equal(call.init.headers.get('x-readwell-proxy-secret'), 's'.repeat(64));
    assert.equal(call.init.headers.get('origin'), 'https://readwell.example');
    assert.equal(call.init.headers.get('cookie'), null);
    assert.equal(call.init.headers.get('x-forwarded-for'), null);
    assert.equal(new TextDecoder().decode(call.init.body), '{"version":2}');
    assert.equal(response.headers.get('set-cookie'), null);
    assert.equal(response.headers.get('x-readwell-proxy-secret'), null);
    assert.equal(response.headers.get('content-encoding'), null);
    assert.equal(response.headers.get('content-length'), null);
    assert.equal(response.headers.get('cache-control'), 'private, no-store');
    const adapted = await proxyApi(new Request('http://localhost:5173/api/profile', { method: 'POST', headers: { host: '127.0.0.1:5173', origin: 'http://127.0.0.1:5173' }, body: '{}' }));
    assert.equal(adapted.status, 200);
  } finally { globalThis.fetch = saved.fetch; restore('READWELL_API_URL', saved.api); restore('READWELL_PROXY_SECRET', saved.secret); }
});

function restore(key, value) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }

test('cross-origin writes, oversized payloads, redirects and disconnected services fail safely', async () => {
  const saved = { api: process.env.READWELL_API_URL, secret: process.env.READWELL_PROXY_SECRET, fetch: globalThis.fetch };
  process.env.READWELL_API_URL = 'https://readwell-api.example';
  process.env.READWELL_PROXY_SECRET = 's'.repeat(64);
  try {
    globalThis.fetch = async () => { throw new Error('Must not fetch'); };
    assert.equal((await proxyApi(new Request('https://readwell.example/api/profile', { method: 'POST', headers: { origin: 'https://attacker.example' } }))).status, 403);
    assert.equal((await proxyApi(new Request('https://readwell.example/api/profile', { method: 'POST', body: 'x'.repeat(600001) }))).status, 413);
    globalThis.fetch = async () => Response.redirect('https://attacker.example');
    assert.equal((await proxyApi(new Request('https://readwell.example/api/profile'))).status, 502);
    globalThis.fetch = async () => { throw new Error('Private infrastructure details'); };
    const response = await proxyApi(new Request('https://readwell.example/api/profile'));
    assert.equal(response.status, 503);
    assert.ok(!(await response.text()).includes('Private infrastructure'));
    delete process.env.READWELL_PROXY_SECRET;
    assert.equal((await proxyApi(new Request('https://readwell.example/api/profile'))).status, 503);
  } finally { globalThis.fetch = saved.fetch; restore('READWELL_API_URL', saved.api); restore('READWELL_PROXY_SECRET', saved.secret); }
});
