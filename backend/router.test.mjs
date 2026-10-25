import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchApi } from './router.ts';

const secret = 'a'.repeat(64);
const request = (path, method = 'GET', key = secret) => new Request(`https://api.example${path}`, { method, headers: key ? { 'x-readwell-proxy-secret': key } : {} });
const route = { GET: async () => Response.json({ articles: ['public'] }) };
const routes = { '/api/articles': route };
const article = async id => id === 'known' ? { id, title: 'A real article' } : null;

test('only the configured Vercel connection can reach the API, including public browsing', async () => {
  for (const key of [null, 'wrong', 'a'.repeat(513)]) assert.equal((await dispatchApi(request('/api/articles', 'GET', key), routes, secret, article)).status, 401);
  assert.equal((await dispatchApi(request('/api/articles'), routes, undefined, article)).status, 503);
  const response = await dispatchApi(request('/api/articles'), routes, secret, article);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { articles: ['public'] });
});

test('article detail distinguishes missing articles from upstream errors and malformed paths', async () => {
  assert.equal((await dispatchApi(request('/api/articles/known'), routes, secret, article)).status, 200);
  assert.equal((await dispatchApi(request('/api/articles/missing'), routes, secret, article)).status, 404);
  assert.equal((await dispatchApi(request('/api/articles/bad%2Fpath'), routes, secret, article)).status, 400);
  assert.equal((await dispatchApi(request('/api/articles/%FF'), routes, secret, article)).status, 400);
  await assert.rejects(dispatchApi(request('/api/articles/known'), routes, secret, async () => { throw new Error('Database offline'); }), /Database offline/);
});

test('unsupported routes/methods fail gracefully', async () => {
  assert.equal((await dispatchApi(request('/api/unknown'), routes, secret, article)).status, 404);
  const response = await dispatchApi(request('/api/articles', 'DELETE'), routes, secret, article);
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET');
});
