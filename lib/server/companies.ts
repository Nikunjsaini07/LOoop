import type { CompanyDirectory, CompanySummary } from "../company-types";
import type { Article, Source } from "../types";
import { readSources } from "./catalog";
import seedData from "./seed.json";

type CompanyTotals = {
  id: string;
  blogs: number;
  followers: number;
  bookmarks: number;
  read_logs: number;
};

type ArticleRow = Omit<Article, "topics"> & { topics: string };

// Each relationship is counted before joining, so readers with several saved
// stories cannot multiply either article counts or company followers.
const COMPANY_TOTALS_SQL = `
  WITH article_totals AS (
    SELECT company_id, COUNT(*) AS blogs FROM articles GROUP BY company_id
  ), follower_totals AS (
    SELECT company_id, COUNT(*) AS followers FROM user_company_follows GROUP BY company_id
  ), community_totals AS (
    SELECT a.company_id, SUM(e.kind='save') AS bookmarks, SUM(e.kind='read') AS read_logs
    FROM engagements e JOIN articles a ON a.id=e.article_id
    WHERE e.active=1 GROUP BY a.company_id
  )
  SELECT c.id, COALESCE(a.blogs,0) AS blogs, COALESCE(f.followers,0) AS followers,
    COALESCE(e.bookmarks,0) AS bookmarks, COALESCE(e.read_logs,0) AS read_logs
  FROM companies c
  LEFT JOIN article_totals a ON a.company_id=c.id
  LEFT JOIN follower_totals f ON f.company_id=c.id
  LEFT JOIN community_totals e ON e.company_id=c.id
`;

function uniqueCatalog(catalog: Source[]) {
  return [...new Map(catalog.map(source => [source.id, source])).values()]
    .sort((first, second) => first.company.localeCompare(second.company));
}

function companyBase(source: Source): CompanySummary {
  return {
    id: source.id,
    name: source.company,
    blogUrl: source.blog_url,
    sourceMode: source.mode,
    blogCount: 0,
    followers: 0,
    bookmarks: 0,
    readLogs: 0,
    topics: [],
    latestArticle: null,
  };
}

function articleFromRow(row: ArticleRow): Article {
  let topics: string[] = [];
  try {
    const parsed: unknown = JSON.parse(row.topics);
    if (Array.isArray(parsed)) topics = parsed.filter((topic): topic is string => typeof topic === "string");
  } catch { /* A damaged tag list should not hide the latest article. */ }
  return { ...row, topics };
}

/** Real collected stories stay browsable when the live community is unavailable. */
export function aggregateCompanyArchive(catalog: Source[], articles: Article[], updatedAt: string): CompanyDirectory {
  const companies = uniqueCatalog(catalog).map(companyBase);
  const byId = new Map(companies.map(company => [company.id, company]));
  const topicCounts = new Map<string, Map<string, number>>();
  for (const article of articles) {
    const company = byId.get(article.company_id);
    if (!company) continue;
    company.blogCount += 1;
    const previous = company.latestArticle;
    const published = Date.parse(article.published_at || article.discovered_at);
    const previousPublished = previous ? Date.parse(previous.published_at || previous.discovered_at) : -Infinity;
    if (!previous || published > previousPublished || (published === previousPublished && article.id > previous.id)) company.latestArticle = article;
    const counts = topicCounts.get(company.id) ?? new Map<string, number>();
    for (const topic of new Set(article.topics)) counts.set(topic, (counts.get(topic) ?? 0) + 1);
    topicCounts.set(company.id, counts);
  }
  for (const company of companies) company.topics = [...(topicCounts.get(company.id)?.entries() ?? [])]
    .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))
    .slice(0, 3).map(([topic]) => topic);
  return { companies, updatedAt, communityAvailable: false };
}

/** Entire-archive summaries; independent of the reader's current feed page. */
export async function readCompanyDirectory(db: D1Database): Promise<CompanyDirectory> {
  const [catalog, totals, latest, topicRows, freshness, health] = await Promise.all([
    readSources(db),
    (async () => db.prepare(COMPANY_TOTALS_SQL).all<CompanyTotals>())(),
    (async () => db.prepare(`WITH ranked AS (
      SELECT a.*, ROW_NUMBER() OVER (
        PARTITION BY company_id ORDER BY COALESCE(published_at,discovered_at) DESC,id DESC
      ) AS company_position FROM articles a
    ) SELECT id,company_id,company,title,url,summary,published_at,discovered_at,topics
      FROM ranked WHERE company_position=1`).all<ArticleRow>())(),
    (async () => db.prepare(`SELECT a.company_id,t.name,COUNT(*) AS total
      FROM article_topics at JOIN topics t ON t.id=at.topic_id
      JOIN articles a ON a.id=at.article_id
      GROUP BY a.company_id,t.id,t.name ORDER BY a.company_id,total DESC,t.name`).all<{ company_id: string; name: string; total: number }>())(),
    (async () => db.prepare(`SELECT (SELECT MAX(last_success) FROM source_refresh) AS refreshed,
      (SELECT MAX(discovered_at) FROM articles) AS discovered`).first<{ refreshed: string | null; discovered: string | null }>())(),
    (async () => db.prepare("SELECT source_id,last_success,error FROM source_refresh").all<{source_id:string;last_success:string|null;error:string|null}>())(),
  ]);
  const byId = new Map(totals.results.map(row => [row.id, row]));
  const latestByCompany = new Map(latest.results.map(row => [row.company_id, articleFromRow(row)]));
  const topicsByCompany = new Map<string, string[]>();
  for (const row of topicRows.results) {
    const topics = topicsByCompany.get(row.company_id) ?? [];
    if (topics.length < 3) topics.push(row.name);
    topicsByCompany.set(row.company_id, topics);
  }
  const companies = uniqueCatalog(catalog).map(source => {
    const totals = byId.get(source.id);
    return {
      ...companyBase(source),
      lastCollectedAt: health.results.find(row => row.source_id === source.id)?.last_success ?? null,
      collectionDelayed: Boolean(health.results.find(row => row.source_id === source.id)?.error),
      blogCount: Number(totals?.blogs ?? 0),
      followers: Number(totals?.followers ?? 0),
      bookmarks: Number(totals?.bookmarks ?? 0),
      readLogs: Number(totals?.read_logs ?? 0),
      topics: topicsByCompany.get(source.id) ?? [],
      latestArticle: latestByCompany.get(source.id) ?? null,
    };
  });
  const updatedAt = [seedData.updatedAt, freshness?.refreshed, freshness?.discovered]
    .filter((value): value is string => typeof value === "string" && Number.isFinite(Date.parse(value)))
    .sort((first, second) => Date.parse(second) - Date.parse(first))[0] || seedData.updatedAt;
  return { companies, updatedAt, communityAvailable: true };
}

/** Omit the binding for an explicit seed fallback, or pass D1 for current totals. */
export async function loadCompanyDirectory(db?: D1Database): Promise<CompanyDirectory> {
  if (db) {
    try {
      const directory = await readCompanyDirectory(db);
      if (directory.companies.length) return directory;
    }
    catch { /* Preserve the collected directory during storage outages. */ }
  }
  return aggregateCompanyArchive(seedData.sources as Source[], seedData.articles as Article[], seedData.updatedAt);
}
