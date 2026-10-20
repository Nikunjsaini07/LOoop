import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { testDatabase } from "./test-db.mjs";

const bundle = await build({
  stdin: { contents: 'export {writeArticles} from "./article-writer"; export {articleId} from "./core";', resolveDir: fileURLToPath(new URL(".", import.meta.url)) },
  bundle: true, write: false, format: "esm", platform: "neutral", target: "es2022",
});
const { writeArticles, articleId } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);
const now = "2026-10-20T00:00:00.000Z";
const story = (url, overrides = {}) => ({
  id: "incoming-id", company_id: "netflix", company: "Netflix", title: "Building reliable streaming systems",
  url, summary: "An excerpt from the engineering team.", published_at: "2020-01-01T00:00:00.000Z", discovered_at: now, topics: ["Systems"], ...overrides,
});

function trackedDatabase() {
  const fixture = testDatabase();
  const lookups = [];
  const parameters = [];
  const batchSizes = [];
  return {
    ...fixture,
    lookups, parameters, batchSizes,
    db: {
      prepare(text) {
        return { bind(...values) {
          parameters.push(values.length);
          if (/^SELECT/i.test(text)) lookups.push({ text, values });
          return fixture.db.prepare(text).bind(...values);
        } };
      },
      batch(items) { batchSizes.push(items.length); return fixture.db.batch(items); },
    },
  };
}

function insertExisting(fixture, article) {
  fixture.sql.prepare("INSERT INTO articles VALUES (?,?,?,?,?,?,?,?,?)").run(article.id, article.company_id, article.company,
    article.title, article.url, article.summary, article.published_at, article.discovered_at, JSON.stringify(article.topics));
}

for (const storedUrl of ["https://netflixtechblog.com/streaming-systems-123456abcdef", "https://netflixtechblog.com/streaming-systems-123456abcdef?source=rss-original"]) {
  test(`Medium refresh preserves the exact existing identity and reader references: ${new URL(storedUrl).search || "canonical URL"}`, async () => {
    const fixture = trackedDatabase();
    try {
      const old = story(storedUrl, { id: "original-article-id", title: "Original title", discovered_at: "2020-01-02T00:00:00.000Z" });
      insertExisting(fixture, old);
      const profile = JSON.stringify({ follows: [], interests: [], bookmarks: [old.id], readLogs: [{ articleId: old.id, readAt: now }], activity: [] });
      fixture.sql.prepare("INSERT INTO profiles VALUES (?,?,1,?)").run("reader", profile, now);
      fixture.sql.prepare("INSERT INTO engagements VALUES (?,?,?,?,?)").run("reader", old.id, "save", 1, now);
      const incoming = story("https://netflixtechblog.com/streaming-systems-123456abcdef?source=rss-fresh");
      assert.equal(await writeArticles(fixture.db, [incoming]), 1);
      const rows = fixture.sql.prepare("SELECT id,url,title,discovered_at FROM articles").all();
      assert.deepEqual(rows.map(row => ({ ...row })), [{ id: old.id, url: storedUrl, title: incoming.title, discovered_at: old.discovered_at }]);
      assert.equal(fixture.sql.prepare("SELECT data FROM profiles WHERE user_id='reader'").get().data, profile);
      assert.equal(fixture.sql.prepare("SELECT article_id FROM user_bookmarks").get().article_id, old.id);
      assert.equal(fixture.sql.prepare("SELECT article_id FROM user_read_logs").get().article_id, old.id);
      assert.equal(fixture.sql.prepare("SELECT article_id FROM engagements").get().article_id, old.id);
      assert.deepEqual(fixture.sql.prepare("PRAGMA foreign_key_check").all(), []);
      assert.equal(await writeArticles(fixture.db, [incoming]), 0);
      assert.equal(fixture.lookups.length, 2);
      assert.ok(fixture.lookups.every(query => /WHERE company_id=\?/.test(query.text) && query.values[0] === "netflix"));
    } finally { fixture.close(); }
  });
}

test("new Medium variants deduplicate within the batch, remove only source, and recompute the URL hash", async () => {
  const fixture = trackedDatabase();
  try {
    const clean = "https://medium.com/netflix-techblog/streaming-systems-123456abcdef?edition=engineering";
    const input = [story(clean + "&source=rss-one"), story(clean + "&source=rss-two"), story(clean)];
    const original = structuredClone(input);
    assert.equal(await writeArticles(fixture.db, input), 1);
    const row = fixture.sql.prepare("SELECT id,url FROM articles").get();
    assert.equal(row.id, await articleId(clean));
    assert.equal(row.url, clean);
    assert.deepEqual(input, original);
    assert.equal(fixture.lookups.length, 1);
    assert.equal(await writeArticles(fixture.db, input), 0);
    assert.equal(fixture.sql.prepare("SELECT COUNT(*) AS count FROM articles").get().count, 1);
  } finally { fixture.close(); }
});

test("Medium post aliases cover publication subdomains and renamed slugs without crossing company identities", async () => {
  const fixture = trackedDatabase();
  try {
    const old = story("https://engineering.medium.com/old-title-123456abcdef?source=rss", { id: "original-medium-id" });
    insertExisting(fixture, old);
    const renamed = story("https://medium.com/engineering/new-title-123456abcdef?source=new");
    assert.equal(await writeArticles(fixture.db, [renamed]), 0);
    assert.equal(fixture.sql.prepare("SELECT id FROM articles").get().id, old.id);
    const anotherCompany = story("https://medium.com/pinterest-engineering/new-title-123456abcdef?source=rss", { company_id: "pinterest", company: "Pinterest" });
    assert.equal(await writeArticles(fixture.db, [anotherCompany]), 1);
    assert.equal(fixture.sql.prepare("SELECT COUNT(*) AS count FROM articles").get().count, 2);
  } finally { fixture.close(); }
});

test("ordinary source queries and Medium pages without post IDs retain their exact URL and supplied identity", async () => {
  const fixture = trackedDatabase();
  try {
    const urls = ["https://engineering.example/blog/123456abcdef?source=one", "https://engineering.example/blog/123456abcdef?source=two", "https://medium.com/engineering?source=one", "https://netflixtechblog.com/tagged/systems?source=one", "https://medium.com.evil.example/story-123456abcdef?source=one"];
    const input = urls.map((url, index) => story(url, { id: `unchanged-${index}` }));
    assert.equal(await writeArticles(fixture.db, input), input.length);
    const stored = fixture.sql.prepare("SELECT id,url FROM articles ORDER BY id").all().map(row => ({ ...row }));
    assert.deepEqual(stored, input.map(({ id, url }) => ({ id, url })));
    assert.equal(fixture.lookups.length, 0);
  } finally { fixture.close(); }
});

test("Medium alias prelookups use the company index once per100 input rows and retain write limits", async () => {
  const fixture = trackedDatabase();
  try {
    const input = Array.from({ length: 251 }, (_, index) => story(`https://netflixtechblog.com/story-${(index + 1).toString(16).padStart(12, "0")}?source=rss`, { id: `upstream-${index}` }));
    assert.equal(await writeArticles(fixture.db, input), input.length);
    assert.equal(fixture.lookups.length, 3);
    assert.ok(fixture.lookups.every(query => query.values.length === 1 && query.values[0] === "netflix"));
    const plan = fixture.sql.prepare("EXPLAIN QUERY PLAN " + fixture.lookups[0].text).all("netflix");
    assert.ok(plan.some(row => /USING INDEX articles_company_idx/.test(row.detail)));
    assert.equal(Math.max(...fixture.parameters), 90);
    assert.equal(Math.max(...fixture.batchSizes), 10);
    assert.equal(await writeArticles(fixture.db, input), 0);
    assert.equal(fixture.sql.prepare("SELECT COUNT(*) AS count FROM articles").get().count, input.length);
  } finally { fixture.close(); }
});
