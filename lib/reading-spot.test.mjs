import assert from 'node:assert/strict';
import test from 'node:test';
import { readingSpot } from './reading-spot.ts';
import { emptyProfile, sanitizeProfile } from './server/core.ts';

test('last read is retained when every available story is already read', () => {
  const profile = { ...emptyProfile(), bookmarks: ['next'], readLogs: [
    { articleId: 'older', readAt: '2026-10-01T00:00:00Z' },
    { articleId: 'latest', readAt: '2026-10-02T00:00:00Z' },
  ] };
  assert.deepEqual(readingSpot(profile), { articleId: 'latest', kind: 'read', at: '2026-10-02T00:00:00Z' });
});

test('a more recent publisher open resumes without becoming a completed read', () => {
  const profile = sanitizeProfile({ ...emptyProfile(), lastOpened: { articleId: 'resume', openedAt: '2026-10-03T00:00:00Z' }, readLogs: [{ articleId: 'read', readAt: '2026-10-02T00:00:00Z' }] }, emptyProfile(), new Set());
  assert.equal(readingSpot(profile).kind, 'opened');
  assert.equal(readingSpot(profile).articleId, 'resume');
  assert.equal(profile.readLogs.length, 1);
  assert.equal(profile.activity.reduce((total, row) => total + row.reads, 0), 1);
  assert.deepEqual(sanitizeProfile(profile, emptyProfile(), new Set()).lastOpened, profile.lastOpened);
  for (const lastOpened of [null, {}, { articleId: 'bad/id', openedAt: '2026-10-03T00:00:00Z' }, { articleId: 'resume', openedAt: 'tomorrow' }]) {
    assert.throws(() => sanitizeProfile({ lastOpened }, emptyProfile(), new Set()));
  }
});

test('new readers get their newest bookmark or an honest empty state', () => {
  assert.equal(readingSpot(emptyProfile()), null);
  assert.deepEqual(readingSpot({ ...emptyProfile(), bookmarks: ['first', 'last'] }), { articleId: 'last', kind: 'saved' });
});
