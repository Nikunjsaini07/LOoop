import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';

const bundled = await build({
  stdin: { contents: 'export { refreshSources } from "./ingestion"; export { writeArticles } from "./article-writer";',
    resolveDir: fileURLToPath(new URL('.', import.meta.url)) },
  bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022',
});
const { refreshSources, writeArticles } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);

function fixture() {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync(new URL('../../drizzle/0000_glamorous_richard_fisk.sql', import.meta.url), 'utf8'));
  let queries = 0;
  let maxParameters = 0;
  const db = {
    prepare(text) {
      return { bind(...values) {
        maxParameters = Math.max(maxParameters, values.length);
        assert.ok(values.length <= 100, 'D1 parameter limit');
        const runSync = () => { queries++; const result = sql.prepare(text).run(...values); return { success: true, meta: { changes: Number(result.changes) } }; };
        return {
          runSync,
          async run() { return runSync(); },
          async all() { queries++; return { success: true, results: sql.prepare(text).all(...values) }; },
        };
      }, async all() { queries++; return { success: true, results: sql.prepare(text).all() }; } };
    },
    async batch(statements) {
      sql.exec('BEGIN');
      try { const result = statements.map(statement => statement.runSync()); sql.exec('COMMIT'); return result; }
      catch (error) { sql.exec('ROLLBACK'); throw error; }
    },
  };
  return { db, sql, get queries() { return queries; }, get maxParameters() { return maxParameters; } };
}

const start = Date.parse('2026-10-20T00:00:00Z');
const source = id => ({ id, company: id, mode: 'feed', blog_url: `https://${id}.example/blog/`, feed_urls: [`https://${id}.example/feed`], notes: '' });
const article = index => ({ id: `id-${index}`, company_id: 'example', company: 'Example', title: `Engineering systems ${index}`, url: `https://example.com/${index}`, summary: 'A useful publisher excerpt.', published_at: null, discovered_at: new Date(start).toISOString(), topics: ['Systems'] });
const rss = id => `<rss><channel><item><title>Engineering systems at ${id}</title><link>https://${id}.example/blog/one</link><description>A useful publisher excerpt.</description></item></channel></rss>`;

test('bulk writes remain within D1 limits, skip unchanged rows and preserve identity, excerpts and profiles', async () => {
  const f = fixture();
  f.sql.exec("INSERT INTO profiles VALUES ('reader','{}',1,'2026-10-20T00:00:00Z')");
  const articles = Array.from({ length: 100 }, (_, index) => article(index));
  assert.equal(await writeArticles(f.db, articles), 100);
  assert.equal(f.queries, 10);
  assert.equal(f.maxParameters, 90);
  assert.equal(await writeArticles(f.db, articles.map(a => ({ ...a, discovered_at: '2026-10-21T00:00:00Z' }))), 0);
  assert.equal(await writeArticles(f.db, [{ ...articles[0], id: 'replacement-id', title: 'Updated title', summary: '' }]), 1);
  const row = f.sql.prepare('SELECT * FROM articles WHERE url=?').get(articles[0].url);
  assert.equal(row.id, articles[0].id);
  assert.equal(row.summary, articles[0].summary);
  assert.equal(row.discovered_at, articles[0].discovered_at);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM profiles').get().n, 1);
  f.sql.close();
});

test('scheduled rotations limit batches, skip manual/fresh sources and share the traffic refresh cooldown', async () => {
  const f = fixture();
  f.sql.prepare('INSERT INTO source_refresh (source_id,last_attempt,last_success) VALUES (?,?,?)').run('fresh', new Date(start).toISOString(), new Date(start).toISOString());
  const catalog = [...['a','b','c','d','e'].map(source), source('fresh'), { ...source('manual'), mode: 'manual' }];
  let calls = 0;
  const fetcher = async url => { calls++; return new Response(rss(new URL(url).hostname.split('.')[0])); };
  const first = await refreshSources(f.db, catalog, { now: start, fetcher });
  assert.equal(first.results.length, 4);
  assert.equal(first.remaining, 1);
  assert.equal(first.results.reduce((sum, s) => sum + s.changed, 0), 4);
  assert.equal((await refreshSources(f.db, catalog, { now: start, fetcher })).status, 'cooldown');
  assert.equal(calls, 4);
  const next = await refreshSources(f.db, catalog, { now: start + 300_000, fetcher });
  assert.deepEqual(next.results.map(s => s.source), ['e']);
  assert.equal(calls, 5);
  f.sql.close();
});

test('conditional requests keep articles on 304 and record successful refresh health', async () => {
  const f = fixture();
  await refreshSources(f.db, [source('a')], { now: start, fetcher: async () => new Response(rss('a'), { headers: { etag: 'version-one' } }) });
  const result = await refreshSources(f.db, [source('a')], { now: start + 6 * 3_600_000, fetcher: async (_url, options) => {
    assert.equal(options.headers['If-None-Match'], 'version-one');
    return new Response(null, { status: 304 });
  } });
  assert.equal(result.results[0].status, 'unchanged');
  assert.equal(result.results[0].changed, 0);
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM articles').get().n, 1);
  assert.equal(f.sql.prepare('SELECT last_success FROM source_refresh').get().last_success, new Date(start + 6 * 3_600_000).toISOString());
  f.sql.close();
});

test('a full four-source rotation with 400 entries stays below 50 D1 SQL statements', async () => {
  const f = fixture();
  const catalog = ['a', 'b', 'c', 'd'].map(source);
  const result = await refreshSources(f.db, catalog, { now: start, fetcher: async url => {
    const id = new URL(url).hostname.split('.')[0];
    return new Response(`<rss><channel>${Array.from({ length: 100 }, (_, i) => `<item><title>Engineering systems ${i}</title><link>https://${id}.example/blog/${i}</link></item>`).join('')}</channel></rss>`);
  } });
  assert.equal(result.results.reduce((sum, item) => sum + item.changed, 0), 400);
  assert.equal(f.queries, 46);
  assert.equal(f.maxParameters, 90);
  f.sql.close();
});

test('upstream failures preserve the archive and retry after one hour instead of six', async () => {
  const f = fixture();
  await refreshSources(f.db, [source('a')], { now: start, fetcher: async () => new Response(rss('a')) });
  const failedAt = start + 6 * 3_600_000;
  const failed = await refreshSources(f.db, [source('a')], { now: failedAt, fetcher: async () => new Response('', { status: 503 }) });
  assert.equal(failed.results[0].status, 'error');
  assert.equal(f.sql.prepare('SELECT COUNT(*) AS n FROM articles').get().n, 1);
  let calls = 0;
  const fetcher = async () => { calls++; return new Response(rss('a')); };
  assert.equal((await refreshSources(f.db, [source('a')], { now: failedAt + 1_800_000, fetcher })).results.length, 0);
  assert.equal(calls, 0);
  assert.equal((await refreshSources(f.db, [source('a')], { now: failedAt + 3_600_000, fetcher })).results.length, 1);
  assert.equal(calls, 1);
  assert.equal(f.sql.prepare('SELECT error FROM source_refresh').get().error, null);
  f.sql.close();
});

test('listing ingestion respects publisher robots restrictions', async () => {
  const f = fixture();
  const listing = { ...source('listing'), mode: 'listing', include_url_regex: '/blog/' };
  let calls = 0;
  const result = await refreshSources(f.db, [listing], { now: start, fetcher: async url => {
    calls++; assert.ok(url.endsWith('/robots.txt')); return new Response('User-agent: *\nDisallow: /blog/');
  } });
  assert.equal(calls, 1);
  assert.equal(result.results[0].status, 'error');
  assert.match(result.results[0].error, /robots policy/);
  f.sql.close();
});
