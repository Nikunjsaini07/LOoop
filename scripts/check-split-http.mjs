import assert from 'node:assert/strict';
import { parseEnv } from 'node:util';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import './sites-env.mjs';

const origin = process.env.CHECK_ORIGIN || 'http://127.0.0.1:5173';
const settings = parseEnv(readFileSync('.env.local', 'utf8'));
const results = [];
async function check(path, status, init) {
  const response = await fetch(origin + path, { ...init, signal: AbortSignal.timeout(45000), redirect: 'manual' });
  const text = await response.text();
  assert.equal(response.status, status, `${path}: ${response.status}, expected ${status}: ${text.slice(0,120)}`);
  assert.ok(!text.includes(settings.READWELL_PROXY_SECRET), 'The proxy credential leaked into a response');
  results.push({ path, method: init?.method || 'GET', status: response.status });
  console.log(`${response.status} ${init?.method || 'GET'} ${path}`);
  return { text, response };
}
for (const path of ['/', '/companies', '/trending', '/profile', '/sign-in', '/sign-up', '/settings', '/privacy']) {
  const { text } = await check(path, 200);
  assert.ok(text.includes('Readwell'));
}
const { text } = await check('/api/articles?pageSize=2', 200);
const page = JSON.parse(text);
assert.equal(page.articles.length, 2);
assert.ok(page.total > 0);
const article = page.articles[0];
const detail = await check(`/articles/${encodeURIComponent(article.id)}`, 200);
assert.ok(detail.text.includes(article.title.split(' ')[0]));
await check('/articles/nonexistent-deployment-test', 404);
await check('/api/articles/nonexistent-deployment-test', 404);
await check('/api/articles?pageSize=0', 400);
await check('/api/engagement?ids=bad!', 400);
await check('/api/profile', 401);
await check('/api/profile', 401, { method: 'POST', headers: { origin, 'content-type': 'application/json' }, body: '{}' });
await check('/api/profile', 403, { method: 'POST', headers: { origin: 'https://attacker.example', 'content-type': 'application/json' }, body: '{}' });
await check('/api/account', 401);
await check('/api/profile', 401, { headers: { authorization: 'Bearer invalid' } });
await check('/api/does-not-exist', 404);
const ready = await check('/api/ready', 200);
assert.equal(JSON.parse(ready.text).ready, true);
const direct = await fetch(settings.READWELL_API_URL + '/api/articles', { signal: AbortSignal.timeout(5000) });
assert.equal(direct.status, 401);
results.push({ path: 'direct Cloudflare /api/articles without proxy credential', status: direct.status });
mkdirSync('outputs/deployment', { recursive: true });
writeFileSync('outputs/deployment/split-http-check.json', JSON.stringify({ checkedAt: new Date().toISOString(), origin, localOnly: true, results }, null, 2));
console.log(`Passed ${results.length} split deployment checks. Local verification only; no live account login was performed.`);
