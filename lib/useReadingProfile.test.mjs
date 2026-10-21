import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import * as core from "./server/core.ts";
import * as intent from "./reading-intent.ts";

// Exercise the hook's persistence/synchronization state with deterministic effects and timers.
// Browser rendering itself remains part of the preview QA.
const source = await readFile(new URL("./useReadingProfile.ts", import.meta.url), "utf8");
let compiled = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText
  .replace(/import\s*\{[^}]+\}\s*from\s*["']react["'];?/, "const {useCallback,useEffect,useRef,useState}=globalThis.__scrollHookTest.react;")
  .replace(/import\s*\{[^}]+\}\s*from\s*["'].\/server\/core["'];?/, "const {emptyProfile,sanitizeProfile,toggleReadLog:toggleProfileReadLog}=globalThis.__scrollHookTest.core;")
  .replace(/import\s*\{[^}]+\}\s*from\s*["'].\/community-events["'];?/, "const announceEngagement=()=>undefined;");
compiled = compiled.replace(/import[^;]+from "\.\/reading-intent";?/, "const {applyIntent,takeIntent}=globalThis.__scrollHookTest.intent;");
compiled = compiled.replace(/import[^;]+from "@\/components\/AuthProvider";?/, "const useAuthReady=()=>true;const useAuthRequest=()=>fetch;const useRequireAccount=()=>globalThis.__scrollHookTest.requireAccount;const useAccountId=()=>globalThis.__scrollHookTest.accountId;");
const prefix = "scroll:reading-profile:v1:";
const tick = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
const response = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
const article = { id: "article-1", company_id: "github", company: "GitHub", title: "Example", url: "https://github.blog/example", summary: "", topics: [], published_at: null, discovered_at: "2026-10-18T00:00:00Z" };
let instance = 0;

test("reading actions queue one authoritative profile save and never post separate public events", async () => {
  const writes = [];
  const previous = core.toggleReadLog(core.emptyProfile(), "old-article", new Date("2026-10-01T00:00:00Z"));
  const app = await harness(async (_url, options) => {
    if (options?.method === "POST") { const body = JSON.parse(options.body); writes.push(body); return response({ profile: body.profile, version: 2, user: { id: "reader" } }); }
    return response({ profile: previous, version: 1, user: { id: "reader" } });
  });
  try {
    await tick();
    app.render().toggleReadLog(article);
    app.render().toggleBookmark(article);
    assert.equal(app.engagementRequests.length, 0);
    app.flushTimers(); await tick();
    assert.equal(writes.length, 1);
    assert.deepEqual(writes[0].profile.bookmarks, [article.id]);
    assert.deepEqual(writes[0].profile.readLogs.map(log => log.articleId).sort(), [article.id, "old-article"].sort());
    assert.equal(app.render().syncStatus, "synced");
  } finally { app.close(); }
});

function envelope(owner, profile, dirty = false, serverVersion = 0) { return JSON.stringify({ format: 1, owner, profile, dirty, serverVersion }); }

async function harness(fetcher, entries = [], blocked = false, allowAccountActions = true, accountId = "test-reader") {
  const previous = { window: globalThis.window, fetch: globalThis.fetch, test: globalThis.__scrollHookTest };
  const storage = new Map(entries);
  const values = [];
  const effects = [];
  const timers = new Map();
  let cursor = 0;
  let timeoutId = 0;
  let cleanup;
  const react = {
    useState(initial) { const index = cursor++; if (!(index in values)) values[index] = typeof initial === "function" ? initial() : initial; return [values[index], (next) => { values[index] = typeof next === "function" ? next(values[index]) : next; }]; },
    useRef(initial) { const index = cursor++; if (!(index in values)) values[index] = { current: initial }; return values[index]; },
    useCallback(callback) { cursor++; return callback; },
    useEffect(effect) { const index = cursor++; if (!(index in values)) { values[index] = true; effects.push(effect); } },
  };
  // Persistence tests isolate the account gate; the signed-out test below denies it.
  const accountRequests = [];
  globalThis.__scrollHookTest = { react, core, intent, accountId, requireAccount: () => { accountRequests.push(true); return allowAccountActions; }, setTimeout: (callback) => { const id = ++timeoutId; timers.set(id, callback); return id; }, clearTimeout: (id) => timers.delete(id) };
  const events = new Map();
  globalThis.window = { addEventListener(name, callback) { events.set(name, callback); }, removeEventListener(name) { events.delete(name); }, sessionStorage: { getItem() { return null; }, removeItem() {} }, localStorage: {
    getItem(key) { if (blocked) throw new DOMException("Storage blocked", "SecurityError"); return storage.get(key) ?? null; },
    setItem(key, value) { if (blocked) throw new DOMException("Storage blocked", "SecurityError"); storage.set(key, value); },
  } };
  const engagementRequests=[];
  globalThis.fetch=(url,options)=>{if(url==='/api/engagement'){engagementRequests.push(JSON.parse(options.body));return Promise.resolve(response({accepted:true}));}return fetcher(url,options);};
  const hookModule = await import(`data:text/javascript;base64,${Buffer.from(`const setTimeout=globalThis.__scrollHookTest.setTimeout;const clearTimeout=globalThis.__scrollHookTest.clearTimeout;\n${compiled}`).toString("base64")}#${instance++}`);
  function render() { cursor = 0; return hookModule.useReadingProfile(); }
  render();
  for (const effect of effects) cleanup = effect();
  return {
    storage, render, engagementRequests, accountRequests, dispatch(name, event) { events.get(name)?.(event); },
    flushTimers() { const pending = [...timers.values()]; timers.clear(); for (const callback of pending) callback(); },
    close() { cleanup?.(); globalThis.window = previous.window; globalThis.fetch = previous.fetch; globalThis.__scrollHookTest = previous.test; },
  };
}

test("anonymous profile uses its own validated copy, gates early edits and counts real actions", async () => {
  let resolveGet;
  const request = new Promise((resolve) => { resolveGet = resolve; });
  const initial = { ...core.emptyProfile(), bookmarks: [article.id] };
  const app = await harness(() => request, [[`${prefix}anonymous`, envelope("anonymous", initial)]]);
  try {
    app.render().recordOpen(article);
    assert.equal(app.render().ready, false);
    resolveGet(response({ error: "Sign in" }, 401));
    await tick();
    assert.equal(app.render().ready, true);
    assert.deepEqual(app.render().profile.bookmarks, [article.id]);
    app.render().toggleBookmark(article); // Removing a bookmark creates no save activity.
    assert.deepEqual(app.render().profile.activity, []);
    app.render().toggleBookmark(article);
    app.render().recordOpen(article);
    const day = app.render().profile.activity[0];
    assert.deepEqual({ count: day.count, opens: day.opens, saves: day.saves }, { count: 1, opens: 0, saves: 1 });
    assert.equal(day.date, new Date().toISOString().slice(0, 10));
    assert.equal(app.render().storageLabel, "Saved on this device");
  } finally { app.close(); }
});

test("signed-in server is authoritative and different accounts never share cached profile data", async () => {
  const accountA = core.toggleReadLog({ ...core.emptyProfile("A"), bookmarks: ["private-a"] }, "private-a", new Date("2026-10-01T00:00:00Z"));
  const accountB = { ...core.emptyProfile("B"), follows: ["github"] };
  const requests = [];
  const app = await harness(async (_url, options) => {
    if (options?.method === "POST") { const body = JSON.parse(options.body); requests.push(body); return response({ profile: body.profile, version: 1, user: { id: "b" } }); }
    return response({ profile: accountB, version: 0, user: { id: "b" } });
  }, [[`${prefix}a`, envelope("a", accountA)], [`${prefix}anonymous`, envelope("anonymous", accountA)]]);
  try {
    await tick();
    assert.equal(app.render().profile.name, "B");
    assert.deepEqual(app.render().profile.bookmarks, []);
    assert.deepEqual(app.render().profile.readLogs, []);
    app.render().updateProfile({ bio: "Reading systems" });
    app.render().toggleReadLog(article);
    app.flushTimers(); await tick();
    assert.equal(requests[0].owner, "b");
    assert.equal(JSON.parse(app.storage.get(`${prefix}a`)).profile.name, "A");
    assert.deepEqual(JSON.parse(app.storage.get(`${prefix}a`)).profile.readLogs, accountA.readLogs);
    assert.equal(JSON.parse(app.storage.get(`${prefix}b`)).profile.bio, "Reading systems");
    assert.deepEqual(requests[0].profile.readLogs.map((log) => log.articleId), [article.id]);
    assert.equal(app.render().syncStatus, "synced");
  } finally { app.close(); }
});

test("serialized version saves preserve edits made while the first response is in flight", async () => {
  const writes = [];
  const resolvers = [];
  const app = await harness((_url, options) => {
    if (options?.method !== "POST") return Promise.resolve(response({ profile: core.emptyProfile(), version: 2, user: { id: "reader" } }));
    writes.push(JSON.parse(options.body));
    return new Promise((resolve) => resolvers.push(resolve));
  });
  try {
    await tick();
    app.render().updateProfile({ bio: "First change" });
    app.flushTimers(); await tick();
    assert.equal(writes.length, 1);
    app.render().updateProfile({ name: "Second change" });
    app.render().toggleReadLog(article);
    app.flushTimers(); await tick();
    assert.equal(writes.length, 1);
    resolvers[0](response({ profile: writes[0].profile, version: 3, user: { id: "reader" } }));
    await tick();
    assert.equal(app.render().profile.name, "Second change");
    assert.equal(app.render().profile.readLogs.length, 1);
    app.flushTimers(); await tick();
    assert.equal(writes.length, 2);
    assert.equal(writes[1].version, 3);
    assert.equal(writes[1].profile.name, "Second change");
    assert.deepEqual(writes[1].profile.readLogs.map((log) => log.articleId), [article.id]);
    resolvers[1](response({ profile: writes[1].profile, version: 4, user: { id: "reader" } }));
    await tick();
    assert.equal(app.render().syncStatus, "synced");
    assert.equal(JSON.parse(app.storage.get(`${prefix}reader`)).dirty, false);
  } finally { app.close(); }
});

test("navigation resumes the confirmed owner's unsent read log only against the unchanged server version", async () => {
  const writes = [];
  const fetcher = async (_url, options) => {
    if (options?.method === "POST") { const body = JSON.parse(options.body); writes.push(body); return response({ profile: body.profile, version: 6, user: { id: "reader" } }); }
    return response({ profile: core.emptyProfile("Account reader"), version: 5, user: { id: "reader" } });
  };
  const firstPage = await harness(fetcher);
  let entries;
  try {
    await tick();
    firstPage.render().toggleReadLog(article);
    const pending = JSON.parse(firstPage.storage.get(`${prefix}reader`));
    assert.equal(pending.dirty, true);
    assert.equal(pending.serverVersion, 5);
    entries = [...firstPage.storage];
  } finally { firstPage.close(); }
  assert.equal(writes.length, 0); // Navigation happened before the debounced POST.

  const nextPage = await harness(fetcher, entries);
  try {
    await tick();
    assert.equal(nextPage.render().profile.readLogs[0].articleId, article.id);
    assert.equal(nextPage.render().syncStatus, "syncing");
    assert.equal(JSON.parse(nextPage.storage.get(`${prefix}reader`)).dirty, true);
    nextPage.flushTimers(); await tick();
    assert.equal(writes.length, 1);
    assert.equal(writes[0].owner, "reader");
    assert.equal(writes[0].version, 5);
    assert.equal(writes[0].profile.readLogs[0].articleId, article.id);
    assert.equal(nextPage.render().syncStatus, "synced");
    assert.equal(JSON.parse(nextPage.storage.get(`${prefix}reader`)).dirty, false);
    assert.equal(JSON.parse(nextPage.storage.get(`${prefix}reader`)).serverVersion, 6);
  } finally { nextPage.close(); }
});

test("changed server versions retain a pending read log separately without replaying or overwriting", async () => {
  const local = core.toggleReadLog(core.emptyProfile("Device reader"), article.id, new Date("2026-10-01T00:00:00Z"));
  const remote = core.emptyProfile("Account reader");
  let writes = 0;
  const app = await harness(async (_url, options) => {
    if (options?.method === "POST") { writes++; return response({ error: "Unexpected replay" }, 409); }
    return response({ profile: remote, version: 6, user: { id: "reader" } });
  }, [[`${prefix}reader`, envelope("reader", local, true, 5)]]);
  try {
    await tick();
    assert.equal(app.render().profile.name, "Account reader");
    assert.deepEqual(app.render().profile.readLogs, []);
    const retained = JSON.parse(app.storage.get(`${prefix}reader:unsynced`));
    assert.equal(retained.serverVersion, 5);
    assert.equal(retained.profile.readLogs[0].articleId, article.id);
    assert.equal(retained.dirty, true);
    assert.equal(JSON.parse(app.storage.get(`${prefix}reader`)).serverVersion, 6);
    assert.equal(JSON.parse(app.storage.get(`${prefix}reader`)).dirty, false);
    app.flushTimers(); await tick();
    assert.equal(writes, 0);
    assert.match(app.render().storageLabel, /unsynced device copy retained/);
  } finally { app.close(); }
});

test("matching versions cannot import a dirty envelope belonging to a different owner", async () => {
  const other = core.toggleReadLog(core.emptyProfile("Other account"), "private-other", new Date("2026-10-01T00:00:00Z"));
  let writes = 0;
  const app = await harness(async (_url, options) => {
    if (options?.method === "POST") { writes++; return response({ error: "Unexpected replay" }, 409); }
    return response({ profile: core.emptyProfile("Current account"), version: 5, user: { id: "reader" } });
  }, [[`${prefix}reader`, envelope("other", other, true, 5)]]);
  try {
    await tick();
    assert.equal(app.render().profile.name, "Current account");
    assert.deepEqual(app.render().profile.readLogs, []);
    app.flushTimers(); await tick();
    assert.equal(writes, 0);
    assert.equal(app.storage.has(`${prefix}reader:unsynced`), false);
  } finally { app.close(); }
});

test("version conflicts expose both copies and block edits until the reader chooses", async () => {
  let writes = 0;
  const app = await harness(async (_url, options) => {
    if (options?.method === "POST") { writes++; return response({ error: "Conflict" }, 409); }
    return response({ profile: core.emptyProfile(), version: 5, user: { id: "reader" } });
  });
  try {
    await tick();
    app.render().toggleBookmark(article);
    app.flushTimers(); await tick();
    assert.equal(app.render().recovery.bookmarks[0], article.id);
    assert.deepEqual(app.render().profile.bookmarks, []);
    assert.match(app.render().storageLabel, /unsynced device copy retained/);
    assert.equal(app.render().updateProfile({ bio: "Keep this change" }), false);
    app.flushTimers(); await tick();
    assert.equal(writes, 1);
    const retained = JSON.parse(app.storage.get(`${prefix}reader:unsynced`));
    assert.equal(retained.dirty, true);
    assert.deepEqual(retained.profile.bookmarks, [article.id]);
    app.render().resolveRecovery(false);
    assert.equal(app.render().recovery, null);
    assert.equal(app.render().updateProfile({ bio: "Keep this change" }), true);
  } finally { app.close(); }
});

test("blocked localStorage retains a working session profile with an honest label", async () => {
  const app = await harness(async () => response({ error: "Sign in" }, 401), [], true);
  try {
    await tick();
    app.render().toggleBookmark(article);
    assert.deepEqual(app.render().profile.bookmarks, [article.id]);
    assert.equal(app.render().storageLabel, "Available in this session");
  } finally { app.close(); }
});

test("corrupted browser JSON recovers to empty state without fake history", async () => {
  const app = await harness(async () => response({ error: "Sign in" }, 401), [[`${prefix}anonymous`, "{broken"]]);
  try {
    await tick();
    assert.equal(app.render().ready, true);
    assert.deepEqual(app.render().profile, core.emptyProfile());
    assert.equal(JSON.parse(app.storage.get(`${prefix}anonymous`)).format, 1);
  } finally { app.close(); }
});

test("browser profile cap accepts a large valid read history and rejects envelopes over 500000 characters", async () => {
  const large = { ...core.emptyProfile("Archive reader"), readLogs: Array.from({ length: 2000 }, (_, index) => ({ articleId: `article-${String(index).padStart(4, "0")}-${"x".repeat(60)}`, readAt: "2026-10-01T00:00:00.000Z" })) };
  const accepted = envelope("anonymous", large);
  assert.ok(accepted.length > 150000 && accepted.length < 500000);
  const app = await harness(async () => response({ error: "Sign in" }, 401), [[`${prefix}anonymous`, accepted]]);
  try {
    await tick();
    assert.equal(app.render().profile.name, "Archive reader");
    assert.equal(app.render().profile.readLogs.length, 2000);
    assert.equal(app.render().profile.activity[0].reads, 2000);
    assert.equal(JSON.parse(app.storage.get(`${prefix}anonymous`)).profile.readLogs.length, 2000);
    assert.equal(app.render().toggleReadLog(article), false);
    assert.match(app.render().mutationError, /at most 2000 read logs/);
    assert.equal(app.render().profile.readLogs.length, 2000);
    assert.equal(JSON.parse(app.storage.get(`${prefix}anonymous`)).profile.readLogs.length, 2000);
  } finally { app.close(); }

  const oversized = JSON.stringify({ format: 1, owner: "anonymous", profile: large, serverVersion: 0, dirty: false, padding: "x".repeat(500001) });
  const blocked = await harness(async () => response({ error: "Sign in" }, 401), [[`${prefix}anonymous`, oversized]]);
  try {
    await tick();
    assert.equal(blocked.render().ready, true);
    assert.deepEqual(blocked.render().profile, core.emptyProfile());
    assert.deepEqual(JSON.parse(blocked.storage.get(`${prefix}anonymous`)).profile.readLogs, []);
  } finally { blocked.close(); }
});

test("v1 legacy browser profiles migrate missing reads and read logs in place", async () => {
  const legacy = { name: "Longtime reader", bio: "", follows: [], interests: [], customFeeds: [], bookmarks: [article.id], activity: [{ date: "2026-10-01", opens: 2, saves: 1, count: 3 }] };
  let resolveGet;
  const app = await harness(() => new Promise((resolve) => { resolveGet = resolve; }), [[`${prefix}anonymous`, envelope("anonymous", legacy)]]);
  try {
    app.render().toggleReadLog(article);
    assert.deepEqual(app.render().profile.readLogs, []);
    resolveGet(response({ error: "Sign in" }, 401));
    await tick();
    assert.equal(app.render().profile.name, "Longtime reader");
    assert.deepEqual(app.render().profile.readLogs, []);
    assert.equal(app.render().profile.activity[0].reads, 0);
    const stored = JSON.parse(app.storage.get(`${prefix}anonymous`));
    assert.equal(stored.format, 1);
    assert.equal(stored.profile.activity[0].count, 3);
    assert.equal(stored.profile.activity[0].reads, 0);
    assert.deepEqual(stored.profile.readLogs, []);
  } finally { app.close(); }
});

test("explicit read toggles persist a single report without opening or bookmarking an article", async () => {
  const app = await harness(async () => response({ error: "Sign in" }, 401));
  let entries;
  try {
    await tick();
    const actions = app.render();
    actions.toggleReadLog(article);
    let profile = app.render().profile;
    assert.equal(profile.readLogs.length, 1);
    assert.equal(profile.readLogs[0].articleId, article.id);
    assert.equal(profile.readLogs[0].readAt.slice(0, 10), new Date().toISOString().slice(0, 10));
    assert.deepEqual(profile.bookmarks, []);
    assert.deepEqual(profile.activity.map(({ reads, opens, saves, count }) => ({ reads, opens, saves, count })), [{ reads: 1, opens: 0, saves: 0, count: 1 }]);
    // Callbacks read the current ref even when the UI has not rerendered between clicks.
    actions.toggleReadLog(article);
    assert.deepEqual(app.render().profile.readLogs, []);
    assert.equal(app.render().profile.activity[0].count, 0);
    actions.toggleReadLog(article);
    profile = app.render().profile;
    assert.equal(profile.readLogs.length, 1);
    assert.equal(profile.activity[0].reads, 1);
    assert.deepEqual(JSON.parse(app.storage.get(`${prefix}anonymous`)).profile.readLogs, profile.readLogs);
    entries = [...app.storage];
  } finally { app.close(); }
  const reopened = await harness(async () => response({ error: "Sign in" }, 401), entries);
  try {
    await tick();
    assert.deepEqual(reopened.render().profile.readLogs.map((log) => log.articleId), [article.id]);
    assert.equal(reopened.render().profile.activity[0].reads, 1);
  } finally { reopened.close(); }
});

test("undoing a persisted read report decrements its original day and keeps today's actions", async () => {
  const today = new Date().toISOString().slice(0, 10);
  const initial = { ...core.emptyProfile(), readLogs: [{ articleId: article.id, readAt: "2026-10-01T23:59:00.000Z" }], activity: [{ date: "2026-10-01", count: 4, opens: 2, saves: 1, reads: 1 }, { date: today, count: 1, opens: 1, saves: 0, reads: 0 }] };
  const app = await harness(async () => response({ error: "Sign in" }, 401), [[`${prefix}anonymous`, envelope("anonymous", initial)]]);
  try {
    await tick();
    app.render().toggleReadLog(article);
    const profile = app.render().profile;
    assert.deepEqual(profile.readLogs, []);
    assert.deepEqual(profile.activity.find((day) => day.date === "2026-10-01"), { date: "2026-10-01", count: 3, opens: 2, saves: 1, reads: 0 });
    assert.deepEqual(profile.activity.find((day) => day.date === today), { date: today, count: 1, opens: 1, saves: 0, reads: 0 });
    assert.deepEqual(JSON.parse(app.storage.get(`${prefix}anonymous`)).profile.readLogs, []);
  } finally { app.close(); }
});


test("signed-out bookmark, read-log and follow actions prompt sign-in without modifying data", async () => {
  const app = await harness(async () => response({}, 401), [], false, false);
  try {
    await tick();
    const before = JSON.stringify(app.render().profile);
    const deviceCopy = [...app.storage];
    app.render().toggleBookmark(article);
    app.render().toggleReadLog(article);
    app.render().updateProfile({ follows: ["github"] });
    app.flushTimers(); await tick();
    assert.equal(app.accountRequests.length, 3);
    assert.equal(JSON.stringify(app.render().profile), before);
    assert.deepEqual([...app.storage], deviceCopy);
    assert.deepEqual(app.engagementRequests, []);
  } finally { app.close(); }
});


test("signed-out initialization skips the account API and never restores or writes a reader profile", async () => {
  let requests = 0;
  const oldGuest = { ...core.emptyProfile("Old guest"), bookmarks: ["old-bookmark"] };
  const entries = [[prefix + "anonymous", envelope("anonymous", oldGuest)]];
  const app = await harness(async () => { requests += 1; throw new Error("Guest must not request an account"); }, entries, false, false, null);
  try {
    await tick();
    assert.equal(requests, 0);
    assert.equal(app.render().ready, true);
    assert.equal(app.render().accountVerified, false);
    assert.deepEqual(app.render().profile.bookmarks, []);
    assert.deepEqual([...app.storage], entries);
    app.render().recordOpen(article);
    assert.deepEqual(app.render().profile.activity, []);
    assert.deepEqual([...app.storage], entries);
  } finally { app.close(); }
});

test("recommendation feedback persists privately, toggles off, and never creates public activity", async () => {
  const app=await harness(async()=>response({profile:core.emptyProfile(),version:1,user:{id:'reader'}}));
  try {
    await tick();
    app.render().rateRecommendation(article,'useful');
    assert.equal(app.render().profile.recommendationFeedback[0].value,'useful');
    app.render().rateRecommendation(article,'not-relevant');
    assert.equal(app.render().profile.recommendationFeedback.length,1);
    assert.equal(app.render().profile.recommendationFeedback[0].value,'not-relevant');
    assert.equal(JSON.parse(app.storage.get(`${prefix}reader`)).profile.recommendationFeedback[0].value,'not-relevant');
    assert.deepEqual(app.render().profile.activity,[]);
    assert.equal(app.engagementRequests.length,0);
    app.render().rateRecommendation(article,'not-relevant');
    assert.deepEqual(app.render().profile.recommendationFeedback,[]);
  } finally {app.close();}
});

test("signed-out recommendation feedback prompts for an account and does not persist a rating",async()=>{
  const app=await harness(async()=>response({},401),[],false,false,null);
  try{await tick();app.render().rateRecommendation(article,'useful');assert.equal(app.accountRequests.length,1);assert.equal(app.render().profile.recommendationFeedback,undefined);assert.equal(app.storage.size,0);}
  finally{app.close();}
});


test("an unchanged failed revision retries and clears the error after recovery", async () => {
  let attempts = 0;
  const app = await harness(async (_url, options) => {
    if (options?.method !== "POST") return response({ profile: core.emptyProfile(), version: 1, user: { id: "reader" } });
    if (++attempts === 1) throw new Error("Offline");
    return response({ profile: JSON.parse(options.body).profile, version: 2, user: { id: "reader" } });
  });
  try {
    await tick(); app.render().toggleBookmark(article); app.flushTimers(); await tick();
    assert.equal(app.render().syncStatus, "error");
    app.flushTimers(); await tick();
    assert.equal(attempts, 2); assert.equal(app.render().syncStatus, "synced");
    assert.equal(app.render().mutationError, "");
  } finally { app.close(); }
});

test("publisher opens persist a return point without creating a completed read", async () => {
  let stored = core.emptyProfile();
  const fetcher = async (_url, options) => {
    if (options?.method === "POST") stored = JSON.parse(options.body).profile;
    return response({ profile: stored, version: options?.method === "POST" ? 2 : 1, user: { id: "reader" } });
  };
  const app = await harness(fetcher);
  try {
    await tick(); app.render().recordOpen(article); app.flushTimers(); await tick();
    assert.equal(stored.lastOpened.articleId, article.id);
    assert.ok(Number.isFinite(Date.parse(stored.lastOpened.openedAt)));
    assert.deepEqual(stored.readLogs, []);
    assert.equal(stored.activity[0].opens, 1);
  } finally { app.close(); }
  const restored = await harness(fetcher);
  try { await tick(); assert.deepEqual(restored.render().profile.lastOpened, stored.lastOpened); }
  finally { restored.close(); }
});

test("a recovered device copy resumes against the freshly read account version", async () => {
  let latest = 6, writes = [];
  const local = { ...core.emptyProfile(), bookmarks: [article.id] };
  const app = await harness(async (_url, options) => {
    if (options?.method === "POST") { const body = JSON.parse(options.body); writes.push(body); return response({ profile: body.profile, version: ++latest, user: { id: "reader" } }); }
    return response({ profile: core.emptyProfile(), version: latest, user: { id: "reader" } });
  }, [[`${prefix}reader`, envelope("reader", local, true, 5)]]);
  try {
    await tick(); assert.deepEqual(app.render().recovery.bookmarks, [article.id]);
    app.render().resolveRecovery(true); app.flushTimers(); await tick();
    assert.equal(writes[0].version, 6); assert.deepEqual(writes[0].profile.bookmarks, [article.id]);
    assert.equal(app.render().syncStatus, "synced");
  } finally { app.close(); }
});
