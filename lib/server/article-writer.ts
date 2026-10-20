import type { Article } from "../types";

/** Bound parameters stay below D1's 100-parameter limit; unchanged rows cost no writes. */
export async function writeArticles(db: D1Database, articles: Article[]): Promise<number> {
  let changes = 0;
  for (let offset = 0; offset < articles.length; offset += 100) {
    const statements: D1PreparedStatement[] = [];
    const batch = articles.slice(offset, offset + 100);
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
