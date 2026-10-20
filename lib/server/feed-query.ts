import type { Article, ArticlePage, Profile, Source } from "../types";
import { canonicalTopic } from "../topics.ts";
import { articleId } from "./core.ts";

export type FeedInput = {
  mode: "personal" | "trending" | "latest" | "following";
  period: "today" | "week" | "archive";
  companies: string[]; topics: string[]; signal: string | null; ids: string[]; exclude: string[]; q: string;
  follows: string[]; interests: string[]; bookmarks: string[];
  readLogs: Profile["readLogs"]; activity: Profile["activity"]; snapshot: string;
};

export function feedInput(query: URLSearchParams, profile: Profile, snapshot: string): FeedInput {
  const list = (key: string) => (query.get(key) || "").split(",").map(s => s.trim()).filter(Boolean);
  const mode = query.get("mode");
  const signal = query.get("signal");
  const requestedTopics = list("topic").map(value => canonicalTopic(value) ?? value);
  return { mode: mode === "trending" || mode === "latest" || mode === "following" ? mode : "personal",
    period: query.get("period") === "today" ? "today" : query.get("period") === "archive" ? "archive" : "week",
    companies: list("company"), topics: requestedTopics, signal:signal&&signal!=='All'?(canonicalTopic(signal)??signal):null, ids: list("ids"), exclude: list("exclude").map(s => s.toLowerCase()), q: (query.get("q") || "").trim().toLowerCase(),
    follows: profile.follows, interests: profile.interests.map(s => canonicalTopic(s) ?? s), bookmarks: profile.bookmarks,
    readLogs: profile.readLogs, activity: profile.activity, snapshot };
}

// Entire-archive SQL scoring precedes pagination. Only ordered ID chunks are cached.
export const RANK_SQL = `
WITH input AS (SELECT json(?) AS p),
logs AS (
  SELECT json_extract(j.value,'$.articleId') AS article_id,
    1.0/(1+MAX(0,julianday(json_extract(p,'$.snapshot'))-julianday(json_extract(j.value,'$.readAt')))/30.0) AS weight
  FROM input,json_each(p,'$.readLogs') j
),
read_topics AS (SELECT at.topic_id,MIN(2.5,SUM(l.weight)) AS affinity FROM logs l JOIN article_topics at ON at.article_id=l.article_id GROUP BY at.topic_id),
read_companies AS (SELECT a.company_id,MIN(2,SUM(l.weight)) AS affinity FROM logs l JOIN articles a ON a.id=l.article_id GROUP BY a.company_id),
saved_topics AS (SELECT DISTINCT at.topic_id FROM input,json_each(p,'$.bookmarks') j JOIN article_topics at ON at.article_id=j.value),
cadence AS (SELECT COUNT(DISTINCT json_extract(j.value,'$.date')) AS active_days FROM input,json_each(p,'$.activity') j
  WHERE json_extract(j.value,'$.count')>0 AND json_extract(j.value,'$.date')>=date(json_extract(p,'$.snapshot'),'-14 days') AND json_extract(j.value,'$.date')<=date(json_extract(p,'$.snapshot'))),
popular AS (
  SELECT e.article_id,SUM(e.kind='read') AS reads,SUM(e.kind='save') AS saves,
    SUM((CASE e.kind WHEN 'read' THEN 3.0 ELSE 2.0 END)/(1+MAX(0,julianday(json_extract(p,'$.snapshot'))-julianday(e.occurred_at)))) AS popularity
  FROM engagements e,input WHERE e.active=1 AND e.occurred_at<=json_extract(p,'$.snapshot')
    AND julianday(e.occurred_at)>=julianday(json_extract(p,'$.snapshot'))-CASE json_extract(p,'$.period') WHEN 'today' THEN 1 WHEN 'week' THEN 7 ELSE 1000000 END
  GROUP BY e.article_id
),
eligible AS (
  SELECT a.*,COALESCE(pop.reads,0) AS reads,COALESCE(pop.saves,0) AS saves,COALESCE(pop.popularity,0) AS popularity,
    MAX(0,julianday(json_extract(p,'$.snapshot'))-julianday(COALESCE(a.published_at,a.discovered_at))) AS age_days,
    EXISTS(SELECT 1 FROM logs WHERE article_id=a.id) AS already_read,
    COALESCE((SELECT SUM(r.affinity) FROM article_topics at JOIN read_topics r ON r.topic_id=at.topic_id WHERE at.article_id=a.id),0) AS read_affinity,
    COALESCE((SELECT affinity FROM read_companies WHERE company_id=a.company_id),0) AS company_affinity,
    (SELECT COUNT(*) FROM article_topics at JOIN topics t ON t.id=at.topic_id WHERE at.article_id=a.id AND t.name IN (SELECT value FROM json_each(p,'$.interests'))) AS interest_matches,
    (SELECT COUNT(*) FROM article_topics at JOIN saved_topics st ON st.topic_id=at.topic_id WHERE at.article_id=a.id) AS saved_matches,
    a.company_id IN (SELECT value FROM json_each(p,'$.follows')) AS followed
  FROM articles a CROSS JOIN input LEFT JOIN popular pop ON pop.article_id=a.id
  WHERE a.discovered_at<=json_extract(p,'$.snapshot')
    AND (json_array_length(p,'$.companies')=0 OR a.company_id IN (SELECT value FROM json_each(p,'$.companies')))
    AND (json_array_length(p,'$.ids')=0 OR a.id IN (SELECT value FROM json_each(p,'$.ids')))
    AND (json_array_length(p,'$.topics')=0 OR EXISTS(SELECT 1 FROM article_topics at JOIN topics t ON t.id=at.topic_id WHERE at.article_id=a.id AND (t.name IN (SELECT value FROM json_each(p,'$.topics')) OR t.id IN (SELECT value FROM json_each(p,'$.topics')))))
    AND (json_extract(p,'$.signal') IS NULL OR EXISTS(SELECT 1 FROM article_topics at JOIN topics t ON t.id=at.topic_id WHERE at.article_id=a.id AND (t.name=json_extract(p,'$.signal') OR t.id=json_extract(p,'$.signal'))))
    AND NOT EXISTS(SELECT 1 FROM json_each(p,'$.exclude') j WHERE instr(lower(a.title||' '||a.summary||' '||a.company),j.value)>0)
    AND (json_extract(p,'$.q')='' OR instr(lower(a.title||' '||a.summary||' '||a.company),json_extract(p,'$.q'))>0)
),
context AS (SELECT EXISTS(SELECT 1 FROM eligible WHERE popularity>0) AS has_popularity),
scored AS (
  SELECT e.*,CASE
    WHEN json_extract(p,'$.mode')='trending' AND has_popularity=1 THEN popularity
    WHEN json_extract(p,'$.mode') IN ('latest','following') THEN julianday(COALESCE(published_at,discovered_at))
    ELSE 4.0/(1+age_days/(CASE WHEN (SELECT active_days FROM cadence)>=7 THEN 7.0 ELSE 14.0 END))
      +CASE WHEN json_extract(p,'$.mode')='personal' THEN followed*3+interest_matches*2+saved_matches*0.6+MIN(4,read_affinity*1.2)+company_affinity*0.4-already_read*12 ELSE 0 END END AS base_score,
    CASE WHEN json_extract(p,'$.mode')='trending' THEN CASE WHEN has_popularity=1 THEN 'engagement' ELSE 'freshness' END ELSE json_extract(p,'$.mode') END AS basis
  FROM eligible e,input,context
  WHERE json_extract(p,'$.mode')<>'trending' OR (has_popularity=1 AND popularity>0)
    OR (has_popularity=0 AND (json_extract(p,'$.period')='archive' OR age_days<=CASE json_extract(p,'$.period') WHEN 'today' THEN 1 ELSE 7 END))
),
varied AS (SELECT *,base_score-CASE WHEN basis='personal' THEN (ROW_NUMBER() OVER(PARTITION BY company_id ORDER BY base_score DESC,id DESC)-1)*1.8 ELSE 0 END AS score FROM scored),
ranked AS (SELECT id,basis,ROW_NUMBER() OVER(ORDER BY CASE WHEN basis='personal' THEN already_read ELSE 0 END ASC,score DESC,COALESCE(published_at,discovered_at) DESC,id DESC)-1 AS position FROM varied)
`;

type Session = { id: string; owner_hash: string; request_hash: string; created_at: string; expires_at: string; total: number; basis: ArticlePage["rankingBasis"] };

export class FeedExpiredError extends Error {}

export async function queryFeed(db: D1Database, input: FeedInput, sources: Source[], options: { pageSize: number; cursor?: string | null; owner: string; now?: number }): Promise<ArticlePage> {
  const now = options.now ?? Date.now();
  const { snapshot: _snapshot, ...preferences } = input;
  const ownerHash = await articleId(options.owner);
  const stableHash = await articleId(JSON.stringify(preferences));
  let session: Session | null = null;
  let offset = 0;
  if (options.cursor) {
    const match = options.cursor.match(/^([\da-f-]{36}):(\d+)$/i);
    if (!match || Number(match[2]) > 10000000) throw new FeedExpiredError('Invalid feed cursor');
    offset = Number(match[2]);
    session = await db.prepare('SELECT * FROM feed_sessions WHERE id=? AND owner_hash=? AND request_hash LIKE ? AND expires_at>?').bind(match[1], ownerHash, `${stableHash}:%`, new Date(now).toISOString()).first<Session>();
    if (!session) throw new FeedExpiredError('This edition expired. Refresh your feed to continue.');
  } else {
    const revisions = (await db.prepare("SELECT id,value FROM app_state WHERE id IN ('content_revision','engagement_revision')").all<{ id: string; value: number }>()).results;
    const revision = revisions.map(r => `${r.id}=${r.value}`).sort().join('|');
    const requestHash = `${stableHash}:${revision}:${Math.floor(now / 300000)}`;
    session = await db.prepare('SELECT * FROM feed_sessions WHERE owner_hash=? AND request_hash=? AND expires_at>? LIMIT 1').bind(ownerHash, requestHash, new Date(now).toISOString()).first<Session>();
    if (!session) {
      const id = crypto.randomUUID();
      const created = new Date(now).toISOString();
      const params = JSON.stringify({ ...input, snapshot: created });
      // The batch freezes one globally ranked edition, including engagement and read-history effects.
      await db.batch([
        db.prepare('INSERT INTO feed_sessions(id,owner_hash,request_hash,created_at,expires_at,total,basis) VALUES (?,?,?,?,?,0,?)').bind(id, ownerHash, requestHash, created, new Date(now + 3600000).toISOString(), input.mode === 'following' ? 'latest' : input.mode),
        db.prepare(`${RANK_SQL} INSERT INTO feed_chunks(session_id,chunk_index,ids,basis)
          SELECT ?,CAST(position/512 AS INTEGER),json_group_array(id),MAX(basis) FROM (SELECT * FROM ranked ORDER BY position) GROUP BY CAST(position/512 AS INTEGER)`).bind(params, id),
        db.prepare(`UPDATE feed_sessions SET total=COALESCE((SELECT SUM(json_array_length(ids)) FROM feed_chunks WHERE session_id=?),0),
          basis=COALESCE((SELECT CASE basis WHEN 'following' THEN 'latest' ELSE basis END FROM feed_chunks WHERE session_id=? LIMIT 1),?) WHERE id=?`)
          .bind(id, id, input.mode === 'trending' ? 'freshness' : input.mode === 'following' ? 'latest' : input.mode, id),
      ]);
      session = await db.prepare('SELECT * FROM feed_sessions WHERE id=?').bind(id).first<Session>();
    }
  }
  if (!session) throw new Error('Could not create feed edition');
  const firstChunk = Math.floor(offset / 512);
  const lastChunk = Math.floor((offset + options.pageSize - 1) / 512);
  const chunks = (await db.prepare('SELECT chunk_index,ids FROM feed_chunks WHERE session_id=? AND chunk_index BETWEEN ? AND ? ORDER BY chunk_index').bind(session.id, firstChunk, lastChunk).all<{ chunk_index: number; ids: string }>()).results;
  const ids = chunks.flatMap(chunk => JSON.parse(chunk.ids) as string[]).slice(offset % 512, offset % 512 + options.pageSize);
  const rows = ids.length ? (await db.prepare(`SELECT a.*,COALESCE((SELECT json_group_array(t.name) FROM article_topics at JOIN topics t ON t.id=at.topic_id WHERE at.article_id=a.id),'[]') AS normalized_topics,
    (SELECT t.name FROM article_topics at JOIN topics t ON t.id=at.topic_id WHERE at.article_id=a.id AND EXISTS(SELECT 1 FROM article_topics old JOIN json_each(?) log ON old.article_id=json_extract(log.value,'$.articleId') WHERE old.topic_id=at.topic_id) LIMIT 1) AS related_topic,
    (SELECT COUNT(*) FROM engagements e WHERE e.article_id=a.id AND e.kind='read' AND e.active=1 AND e.occurred_at<=?) AS logged_reads,
    (SELECT COUNT(*) FROM engagements e WHERE e.article_id=a.id AND e.kind='save' AND e.active=1 AND e.occurred_at<=?) AS saved_count
    FROM articles a WHERE a.id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(input.readLogs),session.created_at, session.created_at, JSON.stringify(ids)).all<Record<string, unknown>>()).results : [];
  const byId = new Map(rows.map(row => [String(row.id), row]));
  const articles = ids.flatMap(id => {
    const row = byId.get(id); if (!row) return [];
    const article = { ...row, topics: JSON.parse(String(row.normalized_topics)), engagement: { reads: Number(row.logged_reads), saves: Number(row.saved_count) } } as unknown as Article;
    article.recommendationReason = input.readLogs.some(log => log.articleId === id) ? 'Already in your reading log' : row.related_topic ? `More ${String(row.related_topic)}, like your reading log` : input.interests.some(topic => article.topics.includes(topic)) ? 'Matches your interests' : input.follows.includes(article.company_id) ? 'From a company you follow' : 'A fresh perspective to explore';
    return [article];
  });
  const next = offset + ids.length;
  const topicCatalog=(await db.prepare('SELECT id,name,parent_id FROM topics ORDER BY parent_id IS NOT NULL,name').all<{id:string;name:string;parent_id:string|null}>()).results;
  return { articles, sources, total: session.total, hasMore: next < session.total, nextCursor: next < session.total ? `${session.id}:${next}` : null, snapshot: session.created_at, updatedAt: session.created_at, rankingBasis: session.basis, rankingVersion: 2,contentVersion:session.request_hash.match(/content_revision=(\d+)/)?.[1]??'0',topicCatalog };
}
