import test from 'node:test';
import assert from 'node:assert/strict';
import { readingLocation, readingParams, articlePath } from './reading-location.ts';
import { applyIntent, takeIntent, rememberIntent } from './reading-intent.ts';
import { emptyProfile } from './server/core.ts';

test('reading links round-trip search, feed, topic, period, and page with bounded inputs', () => {
  const params = new URLSearchParams('feed=latest&q=PostgreSQL&company=cloudflare&topic=Data&signal=Rust&page=3');
  const value = readingLocation(params);
  assert.deepEqual(readingLocation(readingParams(value)), value);
  assert.equal(readingLocation(new URLSearchParams('page=-2&q=' + 'x'.repeat(500))).page, 1);
  assert.equal(readingLocation(new URLSearchParams('q=' + 'x'.repeat(500))).q.length, 200);
  const destination = articlePath('story', '/?' + params);
  assert.equal(new URL(destination, 'https://readwell.test').searchParams.get('return_to'), '/?' + params);
  assert.equal(readingParams({ ...value, period: 'week' }, true).get('period'), 'week');
});

test('pending sign-in intent is single-use, idempotent, and expires after ten minutes', () => {
  const previous = globalThis.window, storage = new Map();
  globalThis.window = { sessionStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } };
  try {
    rememberIntent({ kind: 'bookmark', id: 'story', active: true });
    const intent = takeIntent(); assert.equal(takeIntent(), null);
    const once = applyIntent(emptyProfile(), intent);
    assert.deepEqual(applyIntent(once, intent).bookmarks, ['story']);
    rememberIntent({ kind: 'read', id: 'story', active: true });
    const read = takeIntent(), readOnce = applyIntent(emptyProfile(), read);
    assert.equal(applyIntent(readOnce, read).readLogs.length, 1);
    rememberIntent({ kind: 'follow', id: 'stripe', active: true });
    for (const [key, value] of storage) storage.set(key, JSON.stringify({ ...JSON.parse(value), at: Date.now() - 600001 }));
    assert.equal(takeIntent(), null);
  } finally { globalThis.window = previous; }
});
