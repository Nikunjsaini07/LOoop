import { env } from "cloudflare:workers";
import type { Article, Source } from "../types";
import seedData from "./seed.json";
import { writeArticles } from "./article-writer";
import { createNeonDatabase, type NeonD1Database } from "./neon-db";

export const sources = seedData.sources as Source[];
export const seedArticles = seedData.articles as Article[];
export const seededAt = seedData.updatedAt;

let neonDbInstance: NeonD1Database | null = null;

export function database(): D1Database {
  const connectionString =
    (typeof env !== "undefined" && ((env as unknown as Record<string, unknown>).DATABASE_URL as string | undefined)) ||
    (typeof process !== "undefined" && process.env?.DATABASE_URL);

  if (connectionString) {
    if (!neonDbInstance) {
      neonDbInstance = createNeonDatabase(connectionString);
    }
    return neonDbInstance as unknown as D1Database;
  }
  if (!env.DB) throw new Error("Reading account storage is temporarily unavailable");
  return env.DB;
}

type ArticleRow = {
  id: string; company_id: string; company: string; title: string; url: string;
  summary: string; published_at: string | null; discovered_at: string; topics: string;
};

function toArticle(row: ArticleRow): Article {
  let topics: string[] = [];
  try { topics = JSON.parse(row.topics) as string[]; } catch { /* A damaged tag list must not hide the article. */ }
  return { ...row, topics };
}

export class ArticleUnavailableError extends Error {}

export async function loadArticle(id: string): Promise<Article | null> {
  const fallback = seedArticles.find((article) => article.id === id) ?? null;
  try {
    const row = await database().prepare("SELECT * FROM articles WHERE id = ? LIMIT 1").bind(id).first<ArticleRow>();
    if (!row) return fallback;
    const article = toArticle(row);
    if (fallback && new Date(fallback.discovered_at) < new Date(article.discovered_at)) article.discovered_at = fallback.discovered_at;
    return article;
  } catch {
    if (fallback) return { ...fallback, stale: true };
    throw new ArticleUnavailableError("The article archive is temporarily unavailable. Please try again.");
  }
}



export async function loadArticles(): Promise<{ articles: Article[]; updatedAt: string; liveAvailable: boolean }> {
  // The real, collected archive also works before a fresh D1 database is populated.
  const byUrl = new Map(seedArticles.map((article) => [article.url, article]));
  let updatedAt = seededAt;
  try {
    const db = database();
    const [stored, refresh] = await Promise.all([
      db.prepare("SELECT * FROM articles ORDER BY COALESCE(published_at,discovered_at) DESC LIMIT 20000").all<ArticleRow>(),
      db.prepare("SELECT MAX(last_success) AS updated_at FROM source_refresh").first<{ updated_at: string | null }>(),
    ]);
    for (const row of stored.results) {
      const article = toArticle(row);
      const existing = byUrl.get(article.url);
      if (existing && new Date(existing.discovered_at) < new Date(article.discovered_at)) article.discovered_at = existing.discovered_at;
      byUrl.set(article.url, article);
    }
    if (refresh?.updated_at && new Date(refresh.updated_at) > new Date(updatedAt)) updatedAt = refresh.updated_at;
    return { articles: [...byUrl.values()], updatedAt, liveAvailable: true };
  } catch {
    return { articles: seedArticles, updatedAt, liveAvailable: false };
  }
}

export async function upsertArticles(articles: Article[]): Promise<number> {
  return writeArticles(database(), articles);
}

export function isSameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const site = request.headers.get("sec-fetch-site");
  if (site === "cross-site") return false;
  // Server/CLI clients without browser Origin remain usable with authenticated identity.
  return !origin || origin === (env.APP_ORIGIN || new URL(request.url).origin);
}

export function jsonError(message: string, status: number): Response {
  return Response.json({ error: message }, { status, headers: { "Cache-Control": "no-store" } });
}
