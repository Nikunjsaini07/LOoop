import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { testDatabase } from './test-db.mjs';

test('new publishers are feed sources in SQL and fallback catalogs, and registration is idempotent', () => {
  const fixture = testDatabase();
  try {
    const ids = ['linear', 'planetscale', 'posthog'];
    const expected = ['https://linear.app/rss/now.xml', 'https://planetscale.com/blog/feed.atom', 'https://posthog.com/rss.xml'];
    const seed = JSON.parse(readFileSync(new URL('./seed.json', import.meta.url), 'utf8'));
    for (const [index, id] of ids.entries()) {
      const source = fixture.sql.prepare('SELECT mode,feed_urls FROM sources WHERE id=?').get(id);
      assert.equal(source.mode, 'feed');
      assert.deepEqual(JSON.parse(source.feed_urls), [expected[index]]);
      assert.deepEqual(seed.sources.find(source => source.id === id).feed_urls, [expected[index]]);
      assert.ok(seed.articles.some(article => article.company_id === id));
    }
    fixture.sql.exec(readFileSync(new URL('../../drizzle/0003_engineering_publishers.sql', import.meta.url), 'utf8'));
    assert.equal(fixture.sql.prepare('SELECT COUNT(*) AS n FROM sources').get().n, 40);
    const pattern = fixture.sql.prepare("SELECT include_url_regex FROM sources WHERE id='posthog'").get().include_url_regex;
    assert.ok(new RegExp(pattern).test('https://posthog.com/blog/clickhouse'));
    assert.ok(!new RegExp(pattern).test('https://posthog.com/founders/diary'));
  } finally { fixture.close(); }
});
