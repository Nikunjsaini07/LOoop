import assert from 'node:assert/strict';
import test from 'node:test';
import { secureResponse } from './response-headers.ts';

test('web responses preserve streaming content, redirects and cookies while adding browser protections', async () => {
  const original = new Response('reader stream', { status: 302, headers: { Location: '/sign-in', 'Set-Cookie': 'session=example; HttpOnly', Vary: 'Authorization' } });
  const response = secureResponse(original, 'https://readwell.example/profile');
  assert.equal(response.status, 302);
  assert.equal(await response.text(), 'reader stream');
  for (const name of ['Location', 'Set-Cookie', 'Vary']) assert.equal(response.headers.get(name), original.headers.get(name));
  assert.equal(response.headers.get('Cache-Control'), 'private, no-store');
  assert.equal(response.headers.get('X-Content-Type-Options'), 'nosniff');
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(response.headers.get('Strict-Transport-Security'), 'max-age=31536000');
});

test('public cache policy remains intact and local HTTP does not enable HSTS', () => {
  const response = secureResponse(new Response('{}', { headers: { 'Cache-Control': 'public, max-age=300' } }), 'http://127.0.0.1:5173/api/sources');
  assert.equal(response.headers.get('Cache-Control'), 'public, max-age=300');
  assert.equal(response.headers.has('Strict-Transport-Security'), false);
});
