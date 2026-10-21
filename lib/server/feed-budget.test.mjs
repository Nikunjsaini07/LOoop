import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { testDatabase } from './test-db.mjs';
const bundle = await build({ stdin: { contents: 'export * from "./feed-budget";', resolveDir: fileURLToPath(new URL('.', import.meta.url)) }, bundle: true, write: false, format: 'esm', platform: 'neutral' });
const { reserveFeedBuild, pruneReadingCache, FeedRateLimitError } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
test('expensive builds are bounded per client and reset with the minute', async () => {
  const f = testDatabase(); try {
    const now = Date.parse('2026-10-21T12:00:00Z');
    for (let i = 0; i < 120; i++) await reserveFeedBuild(f.db, 'reader-a', now);
    await assert.rejects(reserveFeedBuild(f.db, 'reader-a', now), FeedRateLimitError);
    await reserveFeedBuild(f.db, 'reader-b', now);
    await reserveFeedBuild(f.db, 'reader-a', now + 60000);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM app_state WHERE id LIKE 'feed_budget:%'").get().n, 2);
    assert.ok(!JSON.stringify(f.sql.prepare('SELECT * FROM app_state').all()).includes('reader-a'));
    await pruneReadingCache(f.db, now + 12 * 60000);
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM app_state WHERE id LIKE 'feed_budget:%'").get().n, 0);
  } finally { f.close(); }
});
