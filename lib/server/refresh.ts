import type { Article, Source } from "../types";
import { articleId, canonicalUrl, inferTopics, parseFeed, plainText } from "./core";
import { database, sources, upsertArticles } from "./store";

const MAX_BYTES = 3 * 1024 * 1024;
const INTERVAL_MS = 6 * 60 * 60 * 1000;
const USER_AGENT = "DailyEngineeringReader/1.0";

type RefreshState = { source_id: string; last_attempt: string | null; last_success: string | null; etag: string | null; last_modified: string | null; error: string | null };
export type RefreshResult = { source: string; status: "updated" | "unchanged" | "error"; articles: number; error?: string };

async function boundedFetch(value: string, headers: HeadersInit = {}): Promise<{ response: Response; body: string }> {
  let current = value;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7500);
  try {
    for (let redirects = 0; redirects < 5; redirects++) {
      const url = canonicalUrl(current);
      if (!url || !url.startsWith("https://")) throw new Error("Unsafe publisher redirect");
      const response = await fetch(url, { headers: { "User-Agent": USER_AGENT, "Accept": "application/rss+xml,application/atom+xml,application/xml,text/xml,text/html;q=0.8", ...headers }, signal: controller.signal, redirect: "manual" });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get("location");
        await response.body?.cancel();
        if (!location) throw new Error("Publisher redirect has no destination");
        current = new URL(location, url).href;
        continue;
      }
      if (response.status === 304) return { response, body: "" };
      if (!response.ok) { await response.body?.cancel(); throw new Error(`Publisher returned HTTP ${response.status}`); }
      if (Number(response.headers.get("content-length") || 0) > MAX_BYTES) { await response.body?.cancel(); throw new Error("Publisher response is too large"); }
      const reader = response.body?.getReader();
      if (!reader) return { response, body: "" };
      const decoder = new TextDecoder();
      let bytes = 0;
      let body = "";
      while (true) {
        const chunk = await reader.read();
        if (chunk.done) break;
        bytes += chunk.value.byteLength;
        if (bytes > MAX_BYTES) { await reader.cancel(); throw new Error("Publisher response is too large"); }
        body += decoder.decode(chunk.value, { stream: true });
      }
      body += decoder.decode();
      return { response, body };
    }
    throw new Error("Too many publisher redirects");
  } finally { clearTimeout(timeout); }
}

function robotsAllows(body: string, pathname: string): boolean {
  const groups: { agents: string[]; rules: { allow: boolean; path: string }[] }[] = [];
  let group = { agents: [] as string[], rules: [] as { allow: boolean; path: string }[] };
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const separator = line.indexOf(":");
    if (separator === -1) continue;
    const name = line.slice(0, separator).trim().toLowerCase();
    const value = line.slice(separator + 1).trim();
    if (name === "user-agent") {
      if (group.rules.length) { groups.push(group); group = { agents: [], rules: [] }; }
      group.agents.push(value.toLowerCase());
    } else if ((name === "allow" || name === "disallow") && group.agents.length && value) group.rules.push({ allow: name === "allow", path: value });
  }
  groups.push(group);
  const exact = groups.filter((item) => item.agents.some((agent) => agent !== "*" && USER_AGENT.toLowerCase().includes(agent)));
  const applicable = exact.length ? exact : groups.filter((item) => item.agents.includes("*"));
  let best = { length: -1, allow: true };
  for (const rule of applicable.flatMap((item) => item.rules)) {
    const expression = rule.path.split("*").map((part) => part.replace(/[.+?^{}()|[\]\\]/g, "\\$&")).join(".*");
    const length = rule.path.replace(/[\*$]/g, "").length;
    if (new RegExp(`^${expression}`).test(pathname) && (length > best.length || (length === best.length && rule.allow))) best = { length, allow: rule.allow };
  }
  return best.allow;
}

async function fetchListing(source: Source, now: string): Promise<Article[]> {
  const origin = new URL(source.blog_url).origin;
  // Robots failures are conservative: skip the listing rather than bypassing its policy.
  const robots = await boundedFetch(`${origin}/robots.txt`);
  if (!robotsAllows(robots.body, new URL(source.blog_url).pathname)) throw new Error("Publisher robots policy disallows this listing");
  const { body } = await boundedFetch(source.blog_url);
  const allowed = source.include_url_regex ? new RegExp(source.include_url_regex) : null;
  const excluded = source.exclude_url_regex ? new RegExp(source.exclude_url_regex) : null;
  if (!allowed) throw new Error("No approved listing pattern");
  const entries = new Map<string, Article>();
  for (const match of body.matchAll(/<a\b([^>]*?)>([\s\S]*?)<\/a\s*>/gi)) {
    if (entries.size >= 30) break;
    const href = match[1].match(/\bhref\s*=\s*["']([^"']*)["']/i)?.[1];
    const url = href ? canonicalUrl(href, source.blog_url) : null;
    if (!url || !allowed.test(url) || excluded?.test(url) || entries.has(url)) continue;
    const heading = match[2].match(/<h[1-6]\b[^>]*>([\s\S]*?)<\/h[1-6]\s*>/i)?.[1];
    const title = plainText(heading || match[2], 300);
    if (title.length < 12 || /^(read more|learn more|view all)/i.test(title)) continue;
    const summary = plainText(match[2].match(/<p\b[^>]*>([\s\S]*?)<\/p\s*>/i)?.[1] || "");
    const dateValue = match[2].match(/<time\b[^>]*\bdatetime\s*=\s*["']([^"']*)["']/i)?.[1];
    const date = dateValue ? new Date(dateValue) : null;
    entries.set(url, { id: await articleId(url), company_id: source.id, company: source.company, title, url, summary,
      published_at: date && Number.isFinite(date.getTime()) ? date.toISOString() : null,
      discovered_at: now, topics: inferTopics(title, summary) });
  }
  if (!entries.size) throw new Error("Publisher listing markup changed or no entries were available");
  return [...entries.values()];
}

async function refreshSource(source: Source, state: RefreshState | undefined, now: string): Promise<RefreshResult> {
  const db = database();
  try {
    let articles: Article[];
    let response: Response | undefined;
    if (source.mode === "feed") {
      const headers: Record<string, string> = {};
      if (state?.etag) headers["If-None-Match"] = state.etag;
      if (state?.last_modified) headers["If-Modified-Since"] = state.last_modified;
      const result = await boundedFetch(source.feed_urls[0], headers);
      response = result.response;
      articles = response.status === 304 ? [] : await parseFeed(result.body, source, now);
    } else articles = await fetchListing(source, now);
    await upsertArticles(articles);
    await db.prepare(`INSERT INTO source_refresh (source_id,last_attempt,last_success,etag,last_modified,error) VALUES (?,?,?,?,?,NULL)
      ON CONFLICT(source_id) DO UPDATE SET last_attempt=excluded.last_attempt,last_success=excluded.last_success,
      etag=COALESCE(excluded.etag,source_refresh.etag),last_modified=COALESCE(excluded.last_modified,source_refresh.last_modified),error=NULL`)
      .bind(source.id, now, now, response?.headers.get("etag") ?? null, response?.headers.get("last-modified") ?? null).run();
    return { source: source.id, status: response?.status === 304 ? "unchanged" : "updated", articles: articles.length };
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError" ? "Publisher request timed out" : error instanceof Error ? error.message.slice(0, 180) : "Publisher refresh failed";
    await db.prepare(`INSERT INTO source_refresh (source_id,last_attempt,error) VALUES (?,?,?)
      ON CONFLICT(source_id) DO UPDATE SET last_attempt=excluded.last_attempt,error=excluded.error`).bind(source.id, now, message).run();
    return { source: source.id, status: "error", articles: 0, error: message };
  }
}

export async function refreshStaleSources(): Promise<{ status: string; results: RefreshResult[]; remaining: number }> {
  const db = database();
  const now = new Date().toISOString();
  const expires = new Date(Date.now() + 60000).toISOString();
  const lock = await db.prepare(`INSERT INTO refresh_locks (id,expires_at) VALUES ('feed-refresh',?)
    ON CONFLICT(id) DO UPDATE SET expires_at=excluded.expires_at WHERE refresh_locks.expires_at < ?`).bind(expires, now).run();
  if (!lock.meta.changes) return { status: "cooldown", results: [], remaining: 0 };
  const states = (await db.prepare("SELECT * FROM source_refresh").all<RefreshState>()).results;
  const stateById = new Map(states.map((state) => [state.source_id, state]));
  const due = sources.filter((source) => source.mode !== "manual" && (!stateById.get(source.id)?.last_attempt || Date.now() - new Date(stateById.get(source.id)!.last_attempt!).getTime() >= INTERVAL_MS))
    .sort((a, b) => (stateById.get(a.id)?.last_attempt || "").localeCompare(stateById.get(b.id)?.last_attempt || ""));
  const batch = due.slice(0, 4);
  // Four concurrent fixed publishers, bounded bytes and deadlines; no submitted URLs are fetched.
  const results = await Promise.all(batch.map((source) => refreshSource(source, stateById.get(source.id), now)));
  return { status: batch.length ? "complete" : "fresh", results, remaining: due.length - batch.length };
}
