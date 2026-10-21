import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import ts from "typescript";
import { readingLocation, readingParams, articlePath } from "../lib/reading-location.ts";

// Exercise the real reader's effects and UI callbacks with controlled identity,
// profile updates and requests. No auth service or browser account is required.
const source = await readFile(new URL("./BlogReader.tsx", import.meta.url), "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  jsx: ts.JsxEmit.React, jsxFactory: "h",
} }).outputText.replace(/^import .+ from ["'][^"']+["'];?\r?$/gm, "");
const prelude = `
const env = globalThis.__readerEditionTest;
const { useState, useEffect, useMemo, useRef } = env.react;
const {readingLocation,readingParams,articlePath} = env.locationHelpers;
const publisherExcerpt=article=>article.summary;const visibleTopics=article=>article.topics;
const emptyProfile=()=>({});const sanitizeProfile=(value)=>value;
const lazy = () => 'Lazy', Suspense = 'Suspense';
const React = { Fragment: 'Fragment' };
const useAccountId = () => env.owner;
const useAuthRequest = () => env.request;
const useRequireAccount = () => () => true;
const useReadingProfile = () => ({ profile: env.profile, ready: true, profileOwner: env.owner,
  accountVerified: true, updateProfile: () => {}, toggleBookmark: () => {}, toggleReadLog: () => {} });
const useEngagementTotals = () => ({});
const TOPICS = [], HOME_TOPICS = [], COMMUNITY_EVENT = 'community-change';
const ProfileSyncNotice = 'ProfileSyncNotice';
const CompanyLogo = 'CompanyLogo', FeedPagination = 'FeedPagination', SiteHeader = 'SiteHeader', ProfileAccess = 'ProfileAccess';
const ArrowDown = 'ArrowDown', ArrowRight = 'ArrowRight', ArrowUpRight = 'ArrowUpRight',
  Bookmark = 'Bookmark', BookOpenCheck = 'BookOpenCheck', ChevronDown = 'ChevronDown',
  LoaderCircle = 'LoaderCircle', Plus = 'Plus', RefreshCw = 'RefreshCw', Search = 'Search', SlidersHorizontal = 'SlidersHorizontal';
const h = (type, props, ...children) => ({ type, props: { ...props, children: children.flat(Infinity) } });
`;
const article = id => ({ id, company_id: "stripe", company: "Stripe", title: id,
  url: `https://stripe.com/blog/${id}`, summary: "", topics: [],
  published_at: "2026-10-20T00:00:00Z", discovered_at: "2026-10-20T00:00:00Z" });
const page = number => ({ articles: [article(`story-${number}`)], sources: [], total: 24,
  page: number, totalPages: 2, hasMore: number === 1, nextCursor: null,
  snapshot: "2026-10-20T00:00:00Z", updatedAt: "2026-10-20T00:00:00Z", edition: "stable-edition" });
function nodes(node, predicate) {
  if (!node || typeof node !== "object") return [];
  return [...(predicate(node) ? [node] : []), ...(node.props?.children ?? []).flatMap(child => nodes(child, predicate))];
}
let instance = 0;
async function harness(view = "home") {
  const previous = { window: globalThis.window, document: globalThis.document, env: globalThis.__readerEditionTest };
  const values = [], pending = [], requests = [];
  let cursor = 0, dirty = true, tree;
  const changed = (a, b) => !a || a.length !== b.length || a.some((value, i) => !Object.is(value, b[i]));
  const env = {
    owner: "reader-a",
    locationHelpers: {readingLocation,readingParams,articlePath},
    profile: { name: "Reader", bio: "", follows: ["stripe"], interests: [], customFeeds: [], bookmarks: [], readLogs: [], activity: [] },
    request: async (url, options) => {
      requests.push({ url: new URL(url, "https://reader.test"), body: JSON.parse(options.body) });
      return Response.json(page(Number(requests.at(-1).url.searchParams.get("page") || 1)));
    },
    react: {
      useState(initial) {
        const i = cursor++;
        if (!(i in values)) values[i] = typeof initial === "function" ? initial() : initial;
        return [values[i], next => { const value = typeof next === "function" ? next(values[i]) : next; if (!Object.is(value, values[i])) { values[i] = value; dirty = true; } }];
      },
      useRef(initial) { const i = cursor++; return values[i] ??= { current: initial }; },
      useMemo(fn, deps) { const i = cursor++; if (changed(values[i]?.deps, deps)) values[i] = { deps, value: fn() }; return values[i].value; },
      useEffect(fn, deps) { const i = cursor++; if (changed(values[i]?.deps, deps)) { const old = values[i]; values[i] = { deps }; pending.push(() => { old?.cleanup?.(); values[i].cleanup = fn(); }); } },
    },
  };
  let href = `https://reader.test/${view === "home" ? "" : view}`;
  globalThis.window = {
    get location() { const url = new URL(href); return { href, search: url.search, pathname: url.pathname }; },
    history: { replaceState: (_, __, url) => { href = String(url); }, pushState: (_, __, url) => { href = String(url); } },
    addEventListener() {}, removeEventListener() {}, setTimeout: () => 1, clearTimeout() {},
    setInterval: () => 1, clearInterval() {}, scrollTo() {}, matchMedia: () => ({ matches: true }),
  };
  globalThis.document = { getElementById: () => ({ scrollIntoView() {} }) };
  globalThis.__readerEditionTest = env;
  const { default: Reader } = await import(`data:text/javascript;base64,${Buffer.from(prelude + compiled + "\n//# sourceURL=BlogReader-under-test.js").toString("base64")}#${instance++}`);
  const settle = async () => {
    for (let i = 0; i < 30; i++) {
      if (dirty) { dirty = false; cursor = 0; tree = Reader({ initial: page(1), initialView: view }); }
      while (pending.length) pending.shift()();
      for (let tick = 0; tick < 12; tick++) await Promise.resolve();
      if (!dirty && !pending.length) return;
    }
    throw new Error("Reader did not settle");
  };
  await settle();
  return {
    env, requests, settle,
    find: predicate => nodes(tree, predicate),
    async patch(patch) { env.profile = { ...env.profile, ...patch }; dirty = true; await settle(); },
    close() { for (const value of values) value?.cleanup?.(); globalThis.window = previous.window; globalThis.document = previous.document; globalThis.__readerEditionTest = previous.env; },
  };
}

test("bookmarks and read logs update controls without fetching or reordering the feed", async () => {
  const app = await harness();
  try {
    assert.equal(app.requests.length, 1);
    await app.patch({ bookmarks: ["story-1"] });
    await app.patch({ readLogs: [{ articleId: "story-1", readAt: "2026-10-20T12:00:00Z" }], activity: [{ date: "2026-10-20", count: 2, opens: 0, saves: 1, reads: 1 }] });
    const story = app.find(node => node.type?.name === "StoryCard")[0];
    assert.equal(story.props.article.id, "story-1");
    assert.equal(story.props.saved, true);
    assert.equal(story.props.logged, true);
    assert.equal(app.requests.length, 1);

    app.find(node => node.type === "FeedPagination")[0].props.onChange(2);
    await app.settle();
    assert.equal(app.requests.length, 2);
    assert.equal(app.requests[1].url.searchParams.get("edition"), "stable-edition");
    assert.equal(app.requests[1].url.searchParams.get("page"), "2");
    assert.deepEqual(app.requests[1].body, app.requests[0].body, "pagination retains the edition's ranking preferences");
    assert.equal(app.find(node => node.type?.name === "StoryCard")[0].props.article.id, "story-2");
  } finally { app.close(); }
});

test("explicit refresh captures new reading history and requests a fresh edition", async () => {
  const app = await harness("trending");
  try {
    await app.patch({ bookmarks: ["story-1"], readLogs: [{ articleId: "story-1", readAt: "2026-10-20T12:00:00Z" }] });
    assert.equal(app.requests.length, 1);
    app.find(node => node.props["aria-label"] === "Refresh trending ranking")[0].props.onClick();
    await app.settle();
    assert.equal(app.requests.length, 2);
    assert.equal(app.requests[1].url.searchParams.has("edition"), false);
    assert.deepEqual(app.requests[1].body.profile.bookmarks, ["story-1"]);
    assert.equal(app.requests[1].body.profile.readLogs[0].articleId, "story-1");
  } finally { app.close(); }
});

test("changing an explicit subject filter or identity starts an edition with current preferences", async () => {
  const app = await harness();
  try {
    await app.patch({ bookmarks: ["story-1"] });
    app.find(node => node.type?.name === "StoryCard")[0].props.onTopic("Data");
    await app.settle();
    assert.equal(app.requests.length, 2);
    assert.equal(app.requests[1].url.searchParams.get("topic"), "Data");
    assert.deepEqual(app.requests[1].body.profile.bookmarks, ["story-1"]);
    app.env.owner = "reader-b";
    await app.patch({ bookmarks: [], readLogs: [], activity: [] });
    assert.equal(app.requests.length, 3);
    assert.equal(app.requests[2].body.owner, "reader-b");
    assert.deepEqual(app.requests[2].body.profile.bookmarks, []);
    assert.equal(app.requests[2].url.searchParams.has("edition"), false);
  } finally { app.close(); }
});

test("feedback stays frozen across numbered pages and explicit refresh captures it",async()=>{
 const app=await harness();
 try{
  const feedback=[{articleId:'story-1',value:'not-relevant',at:'2026-10-21T00:00:00Z'}];
  await app.patch({recommendationFeedback:feedback});
  assert.equal(app.requests.length,1);
  app.find(node=>node.type==='FeedPagination')[0].props.onChange(2);await app.settle();
  assert.equal(app.requests[1].body.profile.recommendationFeedback,undefined);
  app.find(node=>node.type==='button'&&node.props['aria-label']==='Refresh your feed')[0].props.onClick();await app.settle();
  assert.deepEqual(app.requests.at(-1).body.profile.recommendationFeedback,feedback);
  assert.equal(app.requests.at(-1).url.searchParams.has('edition'),false);
 }finally{app.close();}
});
