import test from 'node:test';
import assert from 'node:assert/strict';
import { validateIds, validateSchema, verifyArticles } from './cloudflare-db.mjs';

test('rejects malformed IDs and partially migrated schema before writing', () => {
  assert.throws(() => validateIds({ CLOUDFLARE_ACCOUNT_ID: 'example' }), /32-character/);
  assert.equal(validateSchema([], {}, []), 'fresh');
  assert.throws(() => validateSchema(['articles'], {}, []), /partially migrated/);
});

test('verifies every collector URL, company, earliest discovery and preserved IDs', () => {
  const source = [{ id: 'collector-id', company_id: 'example', url: 'https://example.com/a', discovered_at: '2026-10-19T00:00:00Z' }];
  const existing = [{ ...source[0], id: 'already-linked-id', discovered_at: '2026-10-18T00:00:00Z' }, { id: 'extra', company_id: 'other', url: 'https://example.com/extra', discovered_at: '2026-10-17T00:00:00Z' }];
  assert.equal(verifyArticles(source, existing, existing), 1);
  assert.throws(() => verifyArticles(source, existing, [{ ...existing[0], id: 'collector-id' }, existing[1]]), /verification/);
  assert.throws(() => verifyArticles(source, existing, [{ ...existing[0], discovered_at: '2026-10-20T00:00:00Z' }, existing[1]]), /verification/);
  assert.throws(() => verifyArticles(source, existing, [{ ...existing[0], discovered_at: source[0].discovered_at }, existing[1]]), /verification/);
  assert.throws(() => verifyArticles(source, existing, [existing[0]]), /lost or changed/);
});
