import { headers } from "next/headers";
import { FeedRateLimitError } from "./feed-budget";
import BlogReader from "@/components/BlogReader";
import { selectArticles } from "./core";
import { database,loadArticles,sources } from "./store";
import { queryFeed,feedInput } from "./feed-query";
import { emptyProfile } from "./core";
import { readSources } from "./catalog";
import { withDatabaseRetry } from "./database-retry";
import { readingLocation } from "../reading-location";
import { FeedExpiredError } from "./feed-query";

type ReaderView = "home" | "trending" | "profile";

export async function renderReader(initialView: ReaderView, search: Record<string, string | string[] | undefined> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) if (typeof value === "string") params.set(key, value);
  const location = readingLocation(params);
  try {
    const db=database();
    const requestHeaders = await headers();
    const clientKey = `network:${requestHeaders.get("cf-connecting-ip") || "local"}`;
    const catalog=await readSources(db);
    if (initialView === "profile") {
      const snapshot = new Date().toISOString();
      return <BlogReader initialLocation={location} initialView="profile" initial={{ articles: [], sources: catalog, total: 0, hasMore: false, nextCursor: null, snapshot, updatedAt: snapshot }} />;
    }
    // Public SSR stays readable without authentication. The client loads its verified
    // account and personal edition after Clerk has restored the session.
    const profile=emptyProfile();
    const query = new URLSearchParams(params);
    query.set("mode", initialView === "trending" ? "trending" : location.feed === "latest" || location.feed === "following" ? location.feed : "personal");
    query.set("period", location.period);
    if (location.feed === "following") query.set("company", "__none__");
    const input = feedInput(query, profile, new Date().toISOString());
    let initial;
    try { initial = await withDatabaseRetry(() => queryFeed(db, input, catalog, { pageSize: 12, page: location.page, edition: location.edition || undefined, owner: 'guest', clientKey })); }
    catch (error) {
      if (!(error instanceof FeedExpiredError)) throw error;
      initial = await withDatabaseRetry(() => queryFeed(db, input, catalog, { pageSize: 12, page: location.page, owner: 'guest', clientKey }));
    }
    return <BlogReader initialLocation={location} initialView={initialView} initial={initial}/>;
  }catch(error){if(error instanceof FeedRateLimitError)throw error;/* Keep the public seed readable while an offline preview is being migrated. */}
  const loaded = await loadArticles();
  const snapshot = new Date().toISOString();
  const eligible = location.feed === "following" ? [] : selectArticles(loaded.articles, params, snapshot);
  const totalPages = Math.max(1, Math.ceil(eligible.length / 12));
  const number = Math.min(location.page, totalPages);
  const articles = eligible.slice((number - 1) * 12, number * 12);
  const hasMore = number < totalPages;

  return <BlogReader initialLocation={location} initialView={initialView} initial={{
    articles,
    degraded: true, page: number, pageSize: 12, totalPages,
    sources,
    total: eligible.length,
    hasMore,
    nextCursor: hasMore ? String(articles.length) : null,
    snapshot,
    updatedAt: loaded.updatedAt,
  }} />;
}
