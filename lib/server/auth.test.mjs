import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, sign } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const keys = generateKeyPairSync('rsa', { modulusLength: 2048 });
const settings = {
  CLERK_SECRET_KEY: 'sk_test_readwell_local_test_only',
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: 'pk_test_' + Buffer.from('readwell-test.clerk.accounts.dev$').toString('base64'),
  CLERK_AUTHORIZED_PARTIES: 'http://127.0.0.1:5173',
  CLERK_JWT_KEY: keys.publicKey.export({ type: 'spki', format: 'pem' }),
};
const source = await readFile(new URL('./auth.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  .replace("'@clerk/backend'", JSON.stringify(import.meta.resolve('@clerk/backend')))
  .replace("'@supabase/supabase-js'", JSON.stringify(import.meta.resolve('@supabase/supabase-js')))
  .replace(/import\s*\{\s*env\s*\}\s*from\s*['"][^'"]+['"];?/, 'const env = ' + JSON.stringify(settings) + ';');
const { getCurrentUser, AuthenticationError } = await import('data:text/javascript;base64,' + Buffer.from(compiled).toString('base64'));
function token(changes = {}, privateKey = keys.privateKey) {
  const now = Math.floor(Date.now() / 1000);
  const parts = [
    { alg: 'RS256', typ: 'JWT', kid: 'readwell-test' },
    { sub: 'user_reader_a', sid: 'sess_reader_a', iss: 'https://readwell-test.clerk.accounts.dev', azp: 'http://127.0.0.1:5173', iat: now, nbf: now - 1, exp: now + 60, v: 2, ...changes },
  ].map(value => Buffer.from(JSON.stringify(value)).toString('base64url')).join('.');
  return parts + '.' + sign('RSA-SHA256', Buffer.from(parts), privateKey).toString('base64url');
}
const request = (jwt) => new Request('http://127.0.0.1:5173/api/profile', { headers: { Authorization: 'Bearer ' + jwt } });

test('old hosting headers and cookies cannot authenticate a reader', async () => {
  assert.equal(await getCurrentUser(new Request('http://127.0.0.1:5173/api/profile', { headers: {
    'oai-authenticated-user-id': 'another_reader', 'oai-authenticated-user-email': 'reader@example.test',
    cookie: '__session=unverified',
  } })), null);
});
test('a real signed session identifies only the verified Clerk user', async () => {
  assert.equal((await getCurrentUser(request(token()))).userId, 'user_reader_a');
});
test('expired sessions and tokens from another origin fail closed', async () => {
  await assert.rejects(getCurrentUser(request(token({ exp: 1 }))), AuthenticationError);
  await assert.rejects(getCurrentUser(request(token({ azp: 'https://untrusted.example' }))), AuthenticationError);
});
test('malformed tokens, pending sessions, and wrong signatures are rejected', async () => {
  await assert.rejects(getCurrentUser(request('not-a-token')), AuthenticationError);
  await assert.rejects(getCurrentUser(request(token({ sts: 'pending' }))), AuthenticationError);
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  await assert.rejects(getCurrentUser(request(token({}, other.privateKey))), AuthenticationError);
});
