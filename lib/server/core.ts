import type { ActivityDay, Article, CustomFeed, Profile, ReadLog, Source } from "../types";

const topicRules: [string, RegExp][] = [
  ["AI & ML", /\b(ai|ml|llm|llms|models?|machine learning|neural|inference|agents?|embeddings?|transformers?|gpus?)\b/i],
  ["Systems", /\b(distributed|systems?|architecture|latency|performance|scalability|scaling|concurrency|reliability|rust|network|networking|cache|caching)\b/i],
  ["Data", /\b(data|databases?|sql|postgres|postgresql|clickhouse|analytics|storage|kafka|streaming|pipelines?)\b/i],
  ["Infrastructure", /\b(cloud|infrastructure|kubernetes|deployment|deploy|containers?|serverless|observability|aws|sre|devops|terraform)\b/i],
  ["Security", /\b(security|secure|privacy|authentication|authorization|vulnerability|encryption|threat|identity|safety)\b/i],
  ["Frontend", /\b(frontend|front-end|react|javascript|typescript|css|browser|web performance|web component|accessibility|design system)\b/i],
  ["Mobile", /\b(mobile|android|ios|swift|kotlin|flutter|react native)\b/i],
  ["Product", /\b(product|developer experience|workflows?|teams?|design|customers?|launch|introducing)\b/i],
];

export function inferTopics(title: string, summary: string): string[] {
  const matches = topicRules.filter(([, expression]) => expression.test(`${title} ${summary}`)).map(([name]) => name);
  return matches.length ? matches.slice(0, 3) : ["Product"];
}

const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

export function decodeEntities(value: string): string {
  return value.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (whole, key: string) => {
    if (!key.startsWith("#")) return entities[key.toLowerCase()] ?? whole;
    const code = key[1]?.toLowerCase() === "x" ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
    return code > 0 && code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : "";
  });
}

export function plainText(value: string, limit = 280): string {
  // Decode before stripping too: RSS descriptions often encode their HTML.
  const text = decodeEntities(decodeEntities(value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")))
    .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  if (text.length <= limit) return text;
  const start = text.slice(0, limit - 1);
  return `${start.slice(0, Math.max(start.lastIndexOf(" "), Math.floor(limit * 0.7)))}…`;
}

export function canonicalUrl(value: string, base?: string): string | null {
  try {
    const url = new URL(decodeEntities(value).trim(), base);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    if (!url.hostname || url.hostname === "localhost" || !url.hostname.includes(".") || /^(127\.|10\.|192\.168\.|169\.254\.|0\.|172\.(1[6-9]|2\d|3[01])\.)/.test(url.hostname) || url.hostname.includes(":")) return null;
    url.hash = "";
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    }
    return url.href;
  } catch { return null; }
}

function element(block: string, names: string[]): string {
  for (const name of names) {
    const expression = new RegExp(`<(?:(?:[\\w-]+):)?${name}\\b[^>]*>([\\s\\S]*?)<\\/(?:(?:[\\w-]+):)?${name}\\s*>`, "i");
    const match = block.match(expression);
    if (match) return match[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1").trim();
  }
  return "";
}

export async function articleId(url: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(url));
  return [...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, "0")).join("").slice(0, 24);
}

export async function parseFeed(xml: string, source: Source, discoveredAt: string): Promise<Article[]> {
  // This bounded syndication reader never evaluates DTDs, entities, or scripts.
  if (/<!DOCTYPE|<!ENTITY/i.test(xml) || !/<(?:[\w-]+:)?(?:rss|feed|RDF)\b/i.test(xml.slice(0, 2000))) throw new Error("Not a supported RSS or Atom document");
  const blocks = [...xml.matchAll(/<(?:[\w-]+:)?(item|entry)\b[^>]*>([\s\S]*?)<\/(?:[\w-]+:)?\1\s*>/gi)].slice(0, 100);
  if (!blocks.length) {
    // A genuinely empty feed is valid; truncated non-empty XML is an error.
    if (/<(?:[\w-]+:)?(?:item|entry)\b/i.test(xml)) throw new Error("Incomplete syndication document");
    return [];
  }
  const articles: Article[] = [];
  const seen = new Set<string>();
  for (const block of blocks) {
    const body = block[2];
    let link = "";
    for (const tag of body.matchAll(/<(?:[\w-]+:)?link\b([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:[\w-]+:)?link\s*>)/gi)) {
      const rel = tag[1].match(/\brel\s*=\s*["']([^"']*)["']/i)?.[1];
      if (rel && rel !== "alternate") continue;
      link = tag[1].match(/\bhref\s*=\s*["']([^"']*)["']/i)?.[1] ?? tag[2] ?? "";
      if (link) break;
    }
    if (!link) link = element(body, ["guid"]);
    const url = canonicalUrl(link, source.blog_url);
    const title = plainText(element(body, ["title"]), 300);
    if (!url || !link || !title || seen.has(url)) continue;
    const summary = plainText(element(body, ["summary", "description", "encoded", "content"]));
    const published = element(body, ["published", "pubDate", "date"]);
    const date = published ? new Date(published) : null;
    // An Atom updated timestamp does not establish original publication time.
    const publishedAt = date && Number.isFinite(date.getTime()) && date.getTime() <= Date.now() + 86400000 ? date.toISOString() : null;
    articles.push({ id: await articleId(url), company_id: source.id, company: source.company, title, url, summary,
      published_at: publishedAt, discovered_at: discoveredAt, topics: inferTopics(title, summary) });
    seen.add(url);
  }
  return articles;
}

export function articleTime(article: Article): number {
  return new Date(article.published_at || article.discovered_at).getTime() || 0;
}

const signalRules: Record<string, RegExp> = {
  rust: /\brust\b/i,
  data: /\b(?:databases?|analytics|data|warehouses?)\b/i,
  scale: /\b(?:scal(?:e|ing|ability)|distributed)\b/i,
  reliability: /\b(?:reliab\w*|resilien\w*|observab\w*|incidents?|availability|fault\w*|recovery)\b/i,
  realtime: /\b(?:real.?time|stream\w*|kafka|flink|websockets?)\b/i,
  networking: /\b(?:network\w*|prox(?:y|ies)|cdn|tcp|dns|routing|https?)\b/i,
};

export function selectArticles(articles: Article[], query: URLSearchParams, snapshot: string): Article[] {
  const companies = (query.get("company") || "").split(",").map((item) => item.trim()).filter(Boolean);
  const topics = (query.get("topic") || "").split(",").map((item) => item.trim().toLowerCase()).filter(Boolean);
  const needle = (query.get("q") || "").trim().toLowerCase().slice(0, 200);
  const ids = (query.get("ids") || "").split(",").filter(Boolean);
  const exclusions = (query.get("exclude") || "").split(",").map((term) => term.trim().toLowerCase()).filter(Boolean);
  const signalName = (query.get("signal") || "").trim().toLowerCase();
  const signal = Object.hasOwn(signalRules, signalName) ? signalRules[signalName] : undefined;
  const before = new Date(snapshot).getTime();
  return articles.filter((article) => {
    if (new Date(article.discovered_at).getTime() > before) return false;
    if (ids.length && !ids.includes(article.id)) return false;
    if (companies.length && !companies.includes(article.company_id)) return false;
    if (topics.length && !article.topics.some((topic) => topics.includes(topic.toLowerCase()))) return false;
    if (signal && !signal.test(`${article.title} ${article.summary} ${article.topics.join(" ")}`)) return false;
    const searchable = `${article.title} ${article.summary} ${article.company}`.toLowerCase();
    if (exclusions.some((term) => searchable.includes(term))) return false;
    return !needle || searchable.includes(needle);
  }).sort((a, b) => articleTime(b) - articleTime(a) || b.id.localeCompare(a.id));
}

export function emptyProfile(name = "Reader"): Profile {
  return { name, bio: "", follows: [], interests: [], customFeeds: [], bookmarks: [], readLogs: [], activity: [] };
}

export class ValidationError extends Error {}

function text(value: unknown, limit: number, name: string): string {
  if (typeof value !== "string" || value.length > limit) throw new ValidationError(`Invalid ${name}`);
  return value.trim();
}

function strings(value: unknown, maximum: number, limit: number, name: string): string[] {
  if (!Array.isArray(value) || value.length > maximum) throw new ValidationError(`Invalid ${name}`);
  return [...new Set(value.map((item) => text(item, limit, name)).filter(Boolean))];
}

function validArticleId(value: unknown): string {
  const id = text(value, 80, "article id");
  if (!/^[\w-]+$/.test(id)) throw new ValidationError("Invalid article id");
  return id;
}

function validReadTimestamp(value: unknown): string {
  const timestamp = text(value, 30, "read timestamp");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(timestamp)) throw new ValidationError("Invalid read timestamp");
  const parsed = new Date(timestamp);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 19) !== timestamp.slice(0, 19) || parsed.getTime() > Date.now() + 300000) throw new ValidationError("Invalid read timestamp");
  return parsed.toISOString();
}

export function sanitizeProfile(input: unknown, previous: Profile, knownSources: Set<string>): Profile {
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ValidationError("A profile object is required");
  const data = input as Record<string, unknown>;
  const output = { ...previous };
  if (data.name !== undefined) output.name = text(data.name, 60, "name") || "Reader";
  if (data.bio !== undefined) output.bio = text(data.bio, 240, "bio");
  if (data.follows !== undefined) output.follows = strings(data.follows, 100, 80, "follows").filter((id) => knownSources.has(id));
  if (data.interests !== undefined) output.interests = strings(data.interests, 30, 80, "interests");
  if (data.bookmarks !== undefined) output.bookmarks = strings(data.bookmarks, 4000, 80, "bookmarks").filter((id) => /^[\w-]+$/.test(id));
  if (data.customFeeds !== undefined) {
    if (!Array.isArray(data.customFeeds) || data.customFeeds.length > 30) throw new ValidationError("Use at most 30 custom feeds");
    const feeds = data.customFeeds as Record<string, unknown>[];
    output.customFeeds = feeds.map((feed): CustomFeed => {
      if (!feed || typeof feed !== "object" || Array.isArray(feed)) throw new ValidationError("Invalid custom feed");
      const id = text(feed.id, 80, "feed id");
      if (!/^[\w-]+$/.test(id)) throw new ValidationError("Invalid feed id");
      return { id, name: text(feed.name, 60, "feed name") || "Untitled feed", companies: strings(feed.companies, 100, 80, "feed companies").filter((key) => knownSources.has(key)), topics: strings(feed.topics, 30, 80, "feed topics"), exclude: strings(feed.exclude, 30, 80, "feed exclusions") };
    });
    if (new Set(output.customFeeds.map((feed) => feed.id)).size !== output.customFeeds.length) throw new ValidationError("Duplicate custom feed ids");
  }
  const logInput = data.readLogs !== undefined ? data.readLogs : previous.readLogs ?? [];
  if (!Array.isArray(logInput) || logInput.length > 2000) throw new ValidationError("Use at most 2000 read logs");
  const logs = new Map<string, ReadLog>();
  for (const row of logInput) {
    if (!row || typeof row !== "object" || Array.isArray(row)) throw new ValidationError("Invalid read log");
    const item = row as Record<string, unknown>;
    const log = { articleId: validArticleId(item.articleId), readAt: validReadTimestamp(item.readAt) };
    const existing = logs.get(log.articleId);
    // Retain the original report when imported copies contain the same article twice.
    if (!existing || log.readAt < existing.readAt) logs.set(log.articleId, log);
  }
  output.readLogs = [...logs.values()].sort((a, b) => b.readAt.localeCompare(a.readAt) || a.articleId.localeCompare(b.articleId));

  const activityInput = data.activity !== undefined ? data.activity : previous.activity ?? [];
  if (!Array.isArray(activityInput) || activityInput.length > 400) throw new ValidationError("Invalid activity history");
  const normalizedActivity = activityInput.map((row): ActivityDay => {
      if (!row || typeof row !== "object") throw new ValidationError("Invalid activity day");
      const item = row as Record<string, unknown>;
      const date = text(item.date, 10, "activity date");
      const parsed = new Date(`${date}T00:00:00Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) throw new ValidationError("Invalid activity date");
      const values = [item.opens, item.saves, item.count, item.reads === undefined ? 0 : item.reads];
      if (values.some((value) => typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 100000)) throw new ValidationError("Invalid activity count");
      // A legacy row has no reads. Only explicit, unique read logs establish that count.
      return { date, opens: item.opens as number, saves: item.saves as number, reads: 0, count: 0 };
    });
  if (new Set(normalizedActivity.map((day) => day.date)).size !== normalizedActivity.length) throw new ValidationError("Duplicate activity dates");
  const days = new Map(normalizedActivity.map((day) => [day.date, day]));
  for (const log of output.readLogs) {
    const date = log.readAt.slice(0, 10);
    const day = days.get(date) ?? { date, count: 0, opens: 0, saves: 0, reads: 0 };
    day.reads += 1;
    days.set(date, day);
  }
  output.activity = [...days.values()].map((day) => {
    const count = day.opens + day.saves + day.reads;
    if (count > 100000) throw new ValidationError("Invalid activity count");
    return { ...day, count };
  }).sort((a, b) => a.date.localeCompare(b.date)).slice(-400);
  return output;
}

/** Explicitly mark/unmark an article as read; this never opens an external link. */
export function toggleReadLog(profile: Profile, articleId: string, now = new Date()): Profile {
  const id = validArticleId(articleId);
  const existing = (profile.readLogs ?? []).find((log) => log.articleId === id);
  const readAt = existing?.readAt ?? validReadTimestamp(now.toISOString());
  const date = readAt.slice(0, 10);
  const rows = profile.activity.map((day) => ({ ...day, reads: day.reads ?? 0 }));
  const day = rows.find((row) => row.date === date) ?? { date, count: 0, opens: 0, saves: 0, reads: 0 };
  day.reads = Math.max(0, day.reads + (existing ? -1 : 1));
  day.count = day.opens + day.saves + day.reads;
  if (!rows.some((row) => row.date === date) && !existing) rows.push(day);
  const readLogs = (existing ? profile.readLogs.filter((log) => log.articleId !== id) : [...(profile.readLogs ?? []), { articleId: id, readAt }]).sort((a, b) => b.readAt.localeCompare(a.readAt) || a.articleId.localeCompare(b.articleId));
  if (readLogs.length > 2000) throw new ValidationError("Use at most 2000 read logs");
  return { ...profile, readLogs, activity: rows.sort((a, b) => a.date.localeCompare(b.date)).slice(-400) };
}

export function recordActivity(profile: Profile, event: unknown, now = new Date()): Profile {
  if (!event || typeof event !== "object") throw new ValidationError("Invalid activity event");
  const value = event as Record<string, unknown>;
  if (value.kind !== "open" && value.kind !== "save" && value.kind !== "read") throw new ValidationError("Invalid activity kind");
  const id = validArticleId(value.articleId);
  if (value.kind === "read") return profile.readLogs?.some((log) => log.articleId === id) ? profile : toggleReadLog(profile, id, now);
  const date = now.toISOString().slice(0, 10);
  const rows = profile.activity.map((day) => ({ ...day, reads: day.reads ?? 0 }));
  const row = rows.find((day) => day.date === date) ?? { date, count: 0, opens: 0, saves: 0, reads: 0 };
  row[value.kind === "open" ? "opens" : "saves"] += 1;
  row.count = row.opens + row.saves + row.reads;
  if (!rows.some((day) => day.date === date)) rows.push(row);
  return { ...profile, activity: rows.sort((a, b) => a.date.localeCompare(b.date)).slice(-400) };
}
