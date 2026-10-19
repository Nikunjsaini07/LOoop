import assert from "node:assert/strict";
import test from "node:test";

// Test the same pure helpers used by the Worker, without mocking Worker bindings.
const { canonicalUrl, emptyProfile, inferTopics, parseFeed, plainText, recordActivity, sanitizeProfile, selectArticles, toggleReadLog } = await import("./core.ts");
const source = { id: "example", company: "Example", blog_url: "https://publisher.example/blog/", feed_urls: [], notes: "", mode: "feed" };

test("RSS decodes publisher markup, canonicalizes links and preserves explicit publication", async () => {
  const xml = `<rss><channel><item><title><![CDATA[Fast &amp; reliable databases]]></title><link>https://publisher.example/post?utm_source=rss&amp;keep=yes#section</link><description>&lt;p&gt;Caching &amp;amp; indexing.&lt;/p&gt;</description><pubDate>Fri, 16 Oct 2026 12:00:00 GMT</pubDate></item></channel></rss>`;
  const result = await parseFeed(xml, source, "2026-10-18T00:00:00Z");
  assert.equal(result.length, 1);
  assert.equal(result[0].title, "Fast & reliable databases");
  assert.equal(result[0].summary, "Caching & indexing.");
  assert.equal(result[0].url, "https://publisher.example/post?keep=yes");
  assert.equal(result[0].published_at, "2026-10-16T12:00:00.000Z");
  assert.ok(result[0].topics.includes("Data"));
  assert.match(result[0].id, /^[a-f0-9]{24}$/);
});

test("Atom chooses alternate links, deduplicates and does not infer publication from updated", async () => {
  const xml = `<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Browser architecture</title><link rel="self" href="https://publisher.example/api/item"/><link rel="alternate" href="/blog/a"/><summary>Web performance</summary><updated>2026-10-16T12:00:00Z</updated></entry><entry><title>Duplicate</title><link href="/blog/a"/></entry><entry><title>Unsafe</title><link href="javascript:alert(1)"/></entry></feed>`;
  const result = await parseFeed(xml, source, "2026-10-18T00:00:00Z");
  assert.equal(result.length, 1);
  assert.equal(result[0].url, "https://publisher.example/blog/a");
  assert.equal(result[0].published_at, null);
});

test("rejects challenge pages, DTDs and truncated feed entries", async () => {
  await assert.rejects(() => parseFeed("<html>Challenge</html>", source, "2026-10-18T00:00:00Z"));
  await assert.rejects(() => parseFeed('<!DOCTYPE rss [<!ENTITY x SYSTEM "file:///secret">]><rss/>', source, "2026-10-18T00:00:00Z"));
  await assert.rejects(() => parseFeed("<rss><channel><item><title>Broken", source, "2026-10-18T00:00:00Z"));
});

test("URL and text normalization exclude executable/private destinations and hidden scripts", () => {
  for (const url of ["javascript:alert(1)", "http://localhost/a", "https://127.0.0.1/a", "https://10.2.3.4/a", "https://user:pass@publisher.example/a"]) assert.equal(canonicalUrl(url), null);
  assert.equal(plainText("<script>secret()</script><p>Useful text</p>"), "Useful text");
  assert.ok(plainText("This is a considerably longer article abstract with many words.", 30).length <= 30);
});

test("snapshot pagination excludes newly discovered items and has deterministic tie order", () => {
  const base = { company_id: "a", company: "A", title: "Database systems", summary: "", url: "https://publisher.example/a", topics: ["Data"], published_at: "2026-10-10T00:00:00Z", discovered_at: "2026-10-11T00:00:00Z" };
  const articles = [{ ...base, id: "a" }, { ...base, id: "b" }, { ...base, id: "new", discovered_at: "2026-10-19T00:00:00Z" }, { ...base, id: "other", company_id: "b", topics: ["Security"] }];
  const result = selectArticles(articles, new URLSearchParams("company=a&topic=Data&q=database"), "2026-10-18T00:00:00Z");
  assert.deepEqual(result.map((article) => article.id), ["b", "a"]);
  assert.deepEqual(selectArticles(articles, new URLSearchParams("ids=a,b&exclude=database"), "2026-10-18T00:00:00Z"), []);
  assert.deepEqual(selectArticles(articles, new URLSearchParams("ids=a"), "2026-10-18T00:00:00Z").map((article) => article.id), ["a"]);
});

test("signal chips match article content and topics while All and unknown values leave selection unchanged", () => {
  const base = { company_id: "a", company: "A", summary: "", url: "https://publisher.example/a", topics: [], published_at: "2026-10-10T00:00:00Z", discovered_at: "2026-10-11T00:00:00Z" };
  const articles = [
    { ...base, id: "rust", title: "A RUST service" },
    { ...base, id: "data", title: "Building our reporting platform", topics: ["Data"] },
    { ...base, id: "scale", title: "Scaling distributed services" },
    { ...base, id: "reliability", title: "Incident recovery and observability" },
    { ...base, id: "realtime", title: "Real-time streaming with Kafka" },
    { ...base, id: "networking", title: "DNS routing through a proxy" },
    { ...base, id: "other", title: "Building trust with customers" },
  ];
  const snapshot = "2026-10-18T00:00:00Z";
  for (const signal of ["Rust", "Data", "Scale", "Reliability", "Realtime", "Networking"]) {
    const result = selectArticles(articles, new URLSearchParams({ signal }), snapshot);
    assert.deepEqual(result.map((article) => article.id), [signal.toLowerCase()]);
  }
  const unfiltered = selectArticles(articles, new URLSearchParams(), snapshot);
  for (const signal of ["All", "unknown", "constructor", "__proto__"]) {
    assert.deepEqual(selectArticles(articles, new URLSearchParams({ signal }), snapshot), unfiltered);
  }
});

test("signal selection remains ANDed with company, topic, exclusions, search, IDs and snapshot", () => {
  const base = { company_id: "a", company: "A", title: "Rust service performance", summary: "Production lessons", url: "https://publisher.example/a", topics: ["Systems"], published_at: "2026-10-10T00:00:00Z", discovered_at: "2026-10-11T00:00:00Z" };
  const articles = [
    { ...base, id: "keep" },
    { ...base, id: "wrong-company", company_id: "b" },
    { ...base, id: "excluded", summary: "Production lessons from hiring" },
    { ...base, id: "wrong-topic", topics: ["Security"] },
    { ...base, id: "wrong-search", title: "Rust service internals" },
    { ...base, id: "not-requested" },
    { ...base, id: "new", discovered_at: "2026-10-19T00:00:00Z" },
  ];
  const query = new URLSearchParams({ signal: "Rust", company: "a", topic: "Systems", exclude: "hiring", q: "performance", ids: "keep,wrong-company,excluded,wrong-topic,wrong-search,new" });
  assert.deepEqual(selectArticles(articles, query, "2026-10-18T00:00:00Z").map((article) => article.id), ["keep"]);
});

test("profile validation bounds payloads, filters unknown companies and rejects malformed rules", () => {
  const previous = emptyProfile("Reader");
  const result = sanitizeProfile({ follows: ["a", "a", "unknown"], bookmarks: ["id-1", "id-1"], customFeeds: [{ id: "feed-1", name: "Data", companies: ["a"], topics: ["Data"], exclude: ["hiring"] }] }, previous, new Set(["a"]));
  assert.deepEqual(result.follows, ["a"]);
  assert.deepEqual(result.bookmarks, ["id-1"]);
  assert.equal(result.customFeeds[0].exclude[0], "hiring");
  assert.throws(() => sanitizeProfile({ name: "x".repeat(61) }, previous, new Set()));
  assert.throws(() => sanitizeProfile({ customFeeds: [{ id: "bad/id" }] }, previous, new Set()));
  assert.throws(() => sanitizeProfile({ activity: [{ date: "2026-02-31", opens: 1, saves: 0, count: 1 }] }, previous, new Set()));
  assert.throws(() => sanitizeProfile({ activity: [{ date: "2026-99-31", opens: 1, saves: 0, count: 1 }] }, previous, new Set()));
});

test("activity records opens and saves without fabricating read completions", () => {
  let profile = emptyProfile();
  const now = new Date("2026-10-18T09:00:00Z");
  profile = recordActivity(profile, { kind: "open", articleId: "a" }, now);
  profile = recordActivity(profile, { kind: "save", articleId: "a" }, now);
  assert.deepEqual(profile.activity, [{ date: "2026-10-18", count: 2, opens: 1, saves: 1, reads: 0 }]);
  assert.deepEqual(profile.readLogs, []);
  assert.throws(() => recordActivity(profile, { kind: "complete", articleId: "a" }, now));
});

test("legacy profiles normalize missing read fields without inferring a completed read", () => {
  const legacy = { name: "Reader", bio: "", follows: [], interests: [], customFeeds: [], bookmarks: ["a"], activity: [{ date: "2026-10-01", count: 99, opens: 2, saves: 1 }] };
  const profile = sanitizeProfile(legacy, emptyProfile(), new Set());
  assert.deepEqual(profile.readLogs, []);
  assert.deepEqual(profile.activity, [{ date: "2026-10-01", count: 3, opens: 2, saves: 1, reads: 0 }]);
  assert.deepEqual(sanitizeProfile({ bio: "Updated" }, legacy, new Set()).activity, profile.activity);
});

test("unique read reports normalize timestamps and determine the activity count", () => {
  const profile = sanitizeProfile({
    readLogs: [{ articleId: "a", readAt: "2026-10-02T08:00:00Z" }, { articleId: "a", readAt: "2026-10-01T23:59:00Z" }, { articleId: "b", readAt: "2026-10-02T00:01:00.000Z" }],
    activity: [{ date: "2026-10-02", opens: 1, saves: 2, reads: 17, count: 20 }],
  }, emptyProfile(), new Set());
  assert.deepEqual(profile.readLogs, [{ articleId: "b", readAt: "2026-10-02T00:01:00.000Z" }, { articleId: "a", readAt: "2026-10-01T23:59:00.000Z" }]);
  assert.deepEqual(profile.activity, [{ date: "2026-10-01", count: 1, opens: 0, saves: 0, reads: 1 }, { date: "2026-10-02", count: 4, opens: 1, saves: 2, reads: 1 }]);
  const withoutLogs = sanitizeProfile({ readLogs: [] }, profile, new Set());
  assert.equal(withoutLogs.activity.reduce((sum, day) => sum + day.reads, 0), 0);
  assert.equal(withoutLogs.activity[1].count, 3);
});

test("read events are idempotent and undo adjusts the original UTC reporting day", () => {
  const reported = new Date("2026-10-01T23:59:00Z");
  const later = new Date("2026-10-02T00:01:00Z");
  let profile = recordActivity(emptyProfile(), { kind: "open", articleId: "a" }, reported);
  profile = recordActivity(profile, { kind: "read", articleId: "a" }, reported);
  profile = recordActivity(profile, { kind: "read", articleId: "a" }, later);
  assert.equal(profile.readLogs.length, 1);
  assert.equal(profile.activity[0].reads, 1);
  profile = recordActivity(profile, { kind: "save", articleId: "b" }, later);
  const undone = toggleReadLog(profile, "a", later);
  assert.deepEqual(undone.readLogs, []);
  assert.deepEqual(undone.activity, [{ date: "2026-10-01", count: 1, opens: 1, saves: 0, reads: 0 }, { date: "2026-10-02", count: 1, opens: 0, saves: 1, reads: 0 }]);
  const markedAgain = toggleReadLog(undone, "a", later);
  assert.equal(markedAgain.readLogs.length, 1);
  assert.equal(markedAgain.activity[1].reads, 1);
  assert.equal(markedAgain.activity[1].count, 2);
});

test("read logs reject malformed IDs, invalid/future dates, excessive history and invalid counters", () => {
  const valid = { articleId: "a", readAt: "2026-10-01T00:00:00Z" };
  const invalid = [null, {}, { ...valid, articleId: "" }, { ...valid, articleId: "bad/id" }, { ...valid, articleId: "a".repeat(81) }, { ...valid, readAt: "2026-02-31T00:00:00Z" }, { ...valid, readAt: "2026-10-01" }, { ...valid, readAt: new Date(Date.now() + 86400000).toISOString() }];
  for (const row of invalid) assert.throws(() => sanitizeProfile({ readLogs: [row] }, emptyProfile(), new Set()));
  assert.throws(() => sanitizeProfile({ readLogs: null }, emptyProfile(), new Set()));
  assert.throws(() => sanitizeProfile({ readLogs: Array(2001).fill(valid) }, emptyProfile(), new Set()));
  assert.throws(() => sanitizeProfile({ activity: [{ date: "2026-10-01", opens: 0, saves: 0, count: 0, reads: -1 }] }, emptyProfile(), new Set()));
  for (const id of ["", "bad/id", "a".repeat(81)]) {
    assert.throws(() => toggleReadLog(emptyProfile(), id));
    assert.throws(() => recordActivity(emptyProfile(), { kind: "open", articleId: id }));
  }
});

test("keyword topic inference is reproducible and bounded", () => {
  assert.deepEqual(inferTopics("Postgres data pipelines", "SQL analytics"), ["Data"]);
  assert.ok(inferTopics("AI model cloud security data systems frontend", "").length <= 3);
});
