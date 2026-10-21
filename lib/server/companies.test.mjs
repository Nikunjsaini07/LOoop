import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { testDatabase } from "./test-db.mjs";

const bundle = await build({
  stdin: { contents: 'export {readCompanyDirectory,aggregateCompanyArchive,loadCompanyDirectory} from "./companies";', resolveDir: fileURLToPath(new URL(".", import.meta.url)) },
  bundle: true, write: false, format: "esm", platform: "neutral", target: "es2022",
});
const { readCompanyDirectory, aggregateCompanyArchive, loadCompanyDirectory } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString("base64")}`);

function insertArticle(fixture, id, company, date, topics = ["Security"]) {
  fixture.sql.prepare("INSERT INTO articles VALUES (?,?,?,?,?,?,?,?,?)").run(
    id, company, company, `Story ${id}`, `https://${company}.example/${id}`, "An engineering story.", date, date, JSON.stringify(topics),
  );
}

test("company totals count full independent relationships, active engagement, and empty publishers", async () => {
  const fixture = testDatabase();
  try {
    insertArticle(fixture, "first", "stripe", "2026-10-19T00:00:00.000Z", ["Security", "Systems"]);
    insertArticle(fixture, "latest", "stripe", "2026-10-20T00:00:00.000Z", ["Security"]);
    insertArticle(fixture, "other", "meta", "2026-10-18T00:00:00.000Z");
    for (const userId of ["one", "two"]) fixture.sql.prepare("INSERT INTO profiles VALUES (?,?,1,?)").run(userId, JSON.stringify({ follows: ["stripe"], bookmarks: [], readLogs: [], interests: [] }), "2026-10-20T00:00:00.000Z");
    for (const [reader, article, kind, active] of [
      ["one", "first", "save", 1], ["two", "first", "save", 1], ["one", "latest", "save", 1],
      ["one", "first", "read", 1], ["two", "latest", "read", 1], ["inactive", "latest", "read", 0],
      ["other", "other", "read", 1],
    ]) fixture.sql.prepare("INSERT INTO engagements VALUES (?,?,?,?,?)").run(reader, article, kind, active, "2026-10-20T00:00:00.000Z");
    fixture.sql.prepare("INSERT INTO sources VALUES (?,?,?,?,?,?,?)").run("stripe-secondary", "stripe", "feed", "https://stripe.dev/blog", "[]", null, null);

    const directory = await readCompanyDirectory(fixture.db);
    assert.equal(directory.communityAvailable, true);
    assert.equal(directory.companies.length, 40);
    assert.equal(new Set(directory.companies.map(company => company.id)).size, 40);
    const stripe = directory.companies.find(company => company.id === "stripe");
    assert.deepEqual({ blogs: stripe.blogCount, followers: stripe.followers, saves: stripe.bookmarks, reads: stripe.readLogs }, { blogs: 2, followers: 2, saves: 3, reads: 2 });
    assert.deepEqual(stripe.topics, ["Security", "Systems"]);
    assert.equal(stripe.latestArticle.id, "latest");
    assert.deepEqual(stripe.latestArticle.topics, ["Security"]);
    const empty = directory.companies.find(company => company.id === "github");
    assert.deepEqual({ blogs: empty.blogCount, followers: empty.followers, saves: empty.bookmarks, reads: empty.readLogs, latest: empty.latestArticle, topics: empty.topics }, { blogs: 0, followers: 0, saves: 0, reads: 0, latest: null, topics: [] });
  } finally { fixture.close(); }
});

test("seed fallback preserves real archive counts and marks community metrics unavailable", async () => {
  const source = { id: "stripe", company: "Stripe", blog_url: "https://stripe.dev/blog", feed_urls: [], notes: "", mode: "feed" };
  const article = { id: "one", company_id: "stripe", company: "Stripe", title: "A real title", url: "https://stripe.dev/blog/one", summary: "A real excerpt.", published_at: null, discovered_at: "2026-10-20T00:00:00.000Z", topics: ["Systems"] };
  const fallback = aggregateCompanyArchive([source, source], [article], article.discovered_at);
  assert.equal(fallback.companies.length, 1);
  assert.equal(fallback.companies[0].blogCount, 1);
  assert.equal(fallback.companies[0].latestArticle, article);
  assert.deepEqual(fallback.companies[0].topics, ["Systems"]);
  assert.equal(fallback.communityAvailable, false);
  const unavailable = await loadCompanyDirectory({ prepare() { throw new Error("D1 unavailable"); } });
  assert.equal(unavailable.communityAvailable, false);
  assert.ok(unavailable.companies.length > 0);
  assert.ok(unavailable.companies.some(company => company.blogCount > 0));
});

test("empty live catalogs use the collected directory without hiding individual empty publishers", async () => {
  const fixture = testDatabase();
  try {
    const populatedCatalog = await loadCompanyDirectory(fixture.db);
    assert.equal(populatedCatalog.communityAvailable, true);
    assert.equal(populatedCatalog.companies.length, 40);
    assert.ok(populatedCatalog.companies.every(company => company.blogCount === 0));
    fixture.sql.exec("DELETE FROM sources; DELETE FROM companies;");
    const emptyCatalog = await loadCompanyDirectory(fixture.db);
    assert.equal(emptyCatalog.communityAvailable, false);
    assert.ok(emptyCatalog.companies.length > 0);
    assert.ok(emptyCatalog.companies.some(company => company.blogCount > 0));
  } finally { fixture.close(); }
});

test("archive latest stories compare instants across ISO offsets and break equal-time ties consistently", () => {
  const source = { id: "stripe", company: "Stripe", blog_url: "https://stripe.dev/blog", feed_urls: [], notes: "", mode: "feed" };
  const base = { company_id: "stripe", company: "Stripe", title: "A real title", url: "https://stripe.dev/blog/one", summary: "A real excerpt.", discovered_at: "2026-10-20T00:00:00.000Z", topics: [] };
  const localMorning = { ...base, id: "local", published_at: "2026-10-20T10:00:00+05:30" };
  const laterUtc = { ...base, id: "utc", published_at: "2026-10-20T08:00:00Z" };
  const directory = aggregateCompanyArchive([source], [localMorning, laterUtc], base.discovered_at);
  assert.equal(directory.companies[0].latestArticle.id, "utc");
  const sameInstant = { ...base, id: "z-tie", published_at: "2026-10-20T13:30:00+05:30" };
  const tied = aggregateCompanyArchive([source], [sameInstant, laterUtc], base.discovered_at);
  assert.equal(tied.companies[0].latestArticle.id, "z-tie");
});
