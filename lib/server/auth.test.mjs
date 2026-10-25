import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NEXT_PUBLIC_SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://example.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'test-anon-key';

import { getCurrentUser, AuthenticationError } from './auth.ts';

test('missing authorization returns null', async () => {
  assert.equal(await getCurrentUser(new Request('http://127.0.0.1:5173/api/profile')), null);
});

test('malformed authorization header fails closed', async () => {
  await assert.rejects(
    getCurrentUser(new Request('http://127.0.0.1:5173/api/profile', { headers: { Authorization: 'Basic 12345' } })),
    AuthenticationError
  );
  await assert.rejects(
    getCurrentUser(new Request('http://127.0.0.1:5173/api/profile', { headers: { Authorization: 'Bearer' } })),
    AuthenticationError
  );
});

test('invalid token rejects with AuthenticationError', async () => {
  await assert.rejects(
    getCurrentUser(new Request('http://127.0.0.1:5173/api/profile', { headers: { Authorization: 'Bearer invalid-token' } })),
    AuthenticationError
  );
});
