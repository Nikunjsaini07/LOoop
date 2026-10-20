import type { Article } from "../types";
import { articleId } from "./core";

type ArticleIdentity = Pick<Article, "id" | "url">;

/** Only a known Medium post ID establishes this alias, never a generic source query. */
function mediumArticle(value: string): { postId: string; url: string } | null {
  try {
    const url = new URL(value);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password || url.port) return null;
    if (url.hostname !== "netflixtechblog.com" && url.hostname !== "medium.com" && !url.hostname.endsWith(".medium.com")) return null;
    const postId = url.pathname.match(/(?:\/|-)([a-f0-9]{12})\/?$/i)?.[1]?.toLowerCase();
    if (!postId) return null;
    for (const key of [...url.searchParams.keys()]) {
      if (key.toLowerCase() === "source") url.searchParams.delete(key);
    }
    return { postId, url: url.href };
  } catch { return null; }
}

async function preserveMediumIdentities(db: D1Database, batch: Article[]): Promise<Article[]> {
  const candidates = batch.map(article => ({ article, medium: mediumArticle(article.url) }));
  const companies = new Set(candidates.filter(candidate => candidate.medium).map(candidate => candidate.article.company_id));
  const identities = new Map<string, Map<string, ArticleIdentity>>();
  for (const company of companies) {
    // company_id is indexed. Do one lookup per affected source/batch, including
    // old RSS URLs whose source query formed part of the original article ID.
    const existing = await db.prepare("SELECT id,url FROM articles WHERE company_id=? ORDER BY discovered_at,id")
      .bind(company).all<ArticleIdentity>();
    const aliases = new Map<string, ArticleIdentity>();
    for (const row of existing.results) {
      const medium = mediumArticle(row.url);
      if (medium && !aliases.has(medium.postId)) aliases.set(medium.postId, row);
    }
    identities.set(company, aliases);
  }
  const seen = new Map<string, Set<string>>();
  const result: Article[] = [];
  for (const { article, medium } of candidates) {
    if (!medium) {
      result.push(article);
      continue;
    }
    const companySeen = seen.get(article.company_id) ?? new Set<string>();
    if (companySeen.has(medium.postId)) continue;
    companySeen.add(medium.postId);
    seen.set(article.company_id, companySeen);
    const aliases = identities.get(article.company_id)!;
    let identity = aliases.get(medium.postId);
    if (!identity) {
      identity = { id: await articleId(medium.url), url: medium.url };
      aliases.set(medium.postId, identity);
    }
    // Keep the exact stored URL as well as its ID: the URL conflict path updates
    // metadata in place, retaining bookmarks, read logs and engagement references.
    result.push({ ...article, ...identity });
  }
  return result;
}

/** Bound parameters stay below D1's 100-parameter limit; unchanged rows cost no writes. */
export async function writeArticles(db: D1Database, articles: Article[]): Promise<number> {
  let changes = 0;
  for (let offset = 0; offset < articles.length; offset += 100) {
    const statements: D1PreparedStatement[] = [];
    const batch = await preserveMediumIdentities(db, articles.slice(offset, offset + 100));
    for (let start = 0; start < batch.length; start += 10) {
      const group = batch.slice(start, start + 10);
      statements.push(db.prepare(`
        INSERT INTO articles (id,company_id,company,title,url,summary,published_at,discovered_at,topics)
        VALUES ${group.map(() => "(?,?,?,?,?,?,?,?,?)").join(",")}
        ON CONFLICT(url) DO UPDATE SET title=excluded.title,
          summary=CASE WHEN excluded.summary <> '' THEN excluded.summary ELSE articles.summary END,
          published_at=COALESCE(excluded.published_at,articles.published_at),topics=excluded.topics,
          discovered_at=CASE WHEN julianday(excluded.discovered_at) < julianday(articles.discovered_at)
            THEN excluded.discovered_at ELSE articles.discovered_at END
        WHERE articles.title IS NOT excluded.title
          OR (excluded.summary <> '' AND articles.summary IS NOT excluded.summary)
          OR articles.published_at IS NOT COALESCE(excluded.published_at,articles.published_at)
          OR articles.topics IS NOT excluded.topics
          OR julianday(excluded.discovered_at) < julianday(articles.discovered_at)
      `).bind(...group.flatMap(article => [article.id, article.company_id, article.company, article.title,
        article.url, article.summary, article.published_at, article.discovered_at, JSON.stringify(article.topics)])));
    }
    if (statements.length) for (const result of await db.batch(statements)) changes += result.meta.changes;
  }
  return changes;
}
