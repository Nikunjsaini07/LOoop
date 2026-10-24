import type { Article, ArticlePage, Profile, Source } from "../types";
import { canonicalTopic } from "../topics.ts";
import { articleId } from "./core.ts";
import { readTopicClassifier } from "./catalog.ts";
import { pruneReadingCache, reserveFeedBuild } from "./feed-budget.ts";

export type FeedInput = {
  mode: "personal" | "trending" | "latest" | "following";
  period: "today" | "week" | "archive";
  companies: string[]; topics: string[]; signal: string | null; ids: string[]; exclude: string[]; q: string;
  follows: string[]; interests: string[]; bookmarks: string[];
  readLogs: Profile["readLogs"]; activity: Profile["activity"]; snapshot: string;
  feedback: NonNullable<Profile["recommendationFeedback"]>;
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
    readLogs: profile.readLogs, activity: profile.activity, feedback: profile.recommendationFeedback ?? [], snapshot };
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
-- All inference and nearest-neighbor work is done by the background indexer.
-- Reject stale metadata immediately, even before its next indexing pass.
valid_documents AS (
  SELECT d.article_id,d.updated_at FROM semantic_documents d JOIN articles a ON a.id=d.article_id
  WHERE d.content=a.title||char(10)||a.summary AND d.model='Xenova/all-MiniLM-L6-v2@751bff37182d3f1213fa05d7196b954e230abad9:q8:mean:v1'
),
seed_candidates AS (
  SELECT article_id,weight FROM logs
  UNION ALL SELECT j.value,0.8+0.3*(CAST(j.key AS REAL)+1)/MAX(1,json_array_length(p,'$.bookmarks')) FROM input,json_each(p,'$.bookmarks') j
  UNION ALL SELECT json_extract(j.value,'$.articleId'),1.2/(1+MAX(0,julianday(json_extract(p,'$.snapshot'))-julianday(json_extract(j.value,'$.at')))/90.0) FROM input,json_each(p,'$.feedback') j WHERE json_extract(j.value,'$.value')='useful'
),
seeds AS (SELECT article_id,MAX(weight) AS weight FROM seed_candidates GROUP BY article_id ORDER BY weight DESC,article_id LIMIT 64),
semantic_matches AS (
  SELECT n.neighbor_id,n.article_id,n.similarity*s.weight AS affinity,
    ROW_NUMBER() OVER(PARTITION BY n.neighbor_id ORDER BY n.similarity*s.weight DESC,n.article_id) AS match_rank
  FROM seeds s JOIN semantic_neighbors n ON n.article_id=s.article_id
  JOIN valid_documents source ON source.article_id=n.article_id JOIN valid_documents target ON target.article_id=n.neighbor_id
    AND n.generation=source.updated_at||'|'||target.updated_at
),
semantic_interests AS (
  SELECT st.article_id,t.name,st.similarity,
    ROW_NUMBER() OVER(PARTITION BY st.article_id ORDER BY st.similarity DESC,t.id) AS match_rank
  FROM semantic_topics st JOIN topics t ON t.id=st.topic_id JOIN valid_documents d ON d.article_id=st.article_id AND d.updated_at=st.generation CROSS JOIN input
  WHERE json_array_length(p,'$.interests')=0 OR t.name IN (SELECT value FROM json_each(p,'$.interests'))
),
negative_matches AS (
  SELECT n.neighbor_id,MAX(n.similarity) AS similarity FROM input,json_each(p,'$.feedback') j
  JOIN semantic_neighbors n ON n.article_id=json_extract(j.value,'$.articleId')
  JOIN valid_documents source ON source.article_id=n.article_id JOIN valid_documents target ON target.article_id=n.neighbor_id
    AND n.generation=source.updated_at||'|'||target.updated_at
  WHERE json_extract(j.value,'$.value')='not-relevant' GROUP BY n.neighbor_id
),
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
    CASE WHEN EXISTS(SELECT 1 FROM logs WHERE article_id=a.id) THEN 1 ELSE 0 END AS already_read,
    CASE WHEN json_extract(p,'$.mode')='personal' AND json_array_length(p,'$.readLogs')>0
      THEN COALESCE((SELECT SUM(r.affinity) FROM article_topics at JOIN read_topics r ON r.topic_id=at.topic_id WHERE at.article_id=a.id),0) ELSE 0 END AS read_affinity,
    CASE WHEN json_extract(p,'$.mode')='personal' AND json_array_length(p,'$.readLogs')>0
      THEN COALESCE((SELECT affinity FROM read_companies WHERE company_id=a.company_id),0) ELSE 0 END AS company_affinity,
    CASE WHEN json_extract(p,'$.mode')='personal' AND json_array_length(p,'$.interests')>0
      THEN (SELECT COUNT(*) FROM article_topics at JOIN topics t ON t.id=at.topic_id WHERE at.article_id=a.id AND t.name IN (SELECT value FROM json_each(p,'$.interests'))) ELSE 0 END AS interest_matches,
    CASE WHEN json_extract(p,'$.mode')='personal' AND json_array_length(p,'$.bookmarks')>0
      THEN (SELECT COUNT(*) FROM article_topics at JOIN saved_topics st ON st.topic_id=at.topic_id WHERE at.article_id=a.id) ELSE 0 END AS saved_matches,
    CASE WHEN a.company_id IN (SELECT value FROM json_each(p,'$.follows')) THEN 1 ELSE 0 END AS followed,
    MAX(COALESCE(sm.affinity,0),COALESCE(si.similarity,0)) AS semantic_affinity,
    CASE WHEN sm.affinity>=COALESCE(si.similarity,0) THEN (SELECT title FROM articles WHERE id=sm.article_id) ELSE NULL END AS semantic_title,
    si.name AS semantic_topic,COALESCE(nm.similarity,0) AS negative_affinity
  FROM articles a CROSS JOIN input LEFT JOIN popular pop ON pop.article_id=a.id
  LEFT JOIN semantic_matches sm ON sm.neighbor_id=a.id AND sm.match_rank=1
  LEFT JOIN semantic_interests si ON si.article_id=a.id AND si.match_rank=1
  LEFT JOIN negative_matches nm ON nm.neighbor_id=a.id
  WHERE a.discovered_at<=json_extract(p,'$.snapshot')
    AND (json_array_length(p,'$.companies')=0 OR a.company_id IN (SELECT value FROM json_each(p,'$.companies')))
    AND (json_array_length(p,'$.ids')=0 OR a.id IN (SELECT value FROM json_each(p,'$.ids')))
    AND (json_array_length(p,'$.topics')=0 OR EXISTS(SELECT 1 FROM article_topics at JOIN topics t ON t.id=at.topic_id WHERE at.article_id=a.id AND (t.name IN (SELECT value FROM json_each(p,'$.topics')) OR t.id IN (SELECT value FROM json_each(p,'$.topics')))))
    AND (json_extract(p,'$.signal') IS NULL OR EXISTS(SELECT 1 FROM article_topics at JOIN topics t ON t.id=at.topic_id WHERE at.article_id=a.id AND (t.name=json_extract(p,'$.signal') OR t.id=json_extract(p,'$.signal'))))
    AND NOT EXISTS(SELECT 1 FROM json_each(p,'$.exclude') j WHERE instr(lower(a.title||' '||a.summary||' '||a.company),j.value)>0)
    AND (json_extract(p,'$.q')='' OR instr(lower(a.title||' '||a.summary||' '||a.company),json_extract(p,'$.q'))>0)
    AND (json_extract(p,'$.mode')<>'personal' OR json_array_length(p,'$.ids')>0 OR NOT EXISTS(
      SELECT 1 FROM json_each(p,'$.feedback') j WHERE json_extract(j.value,'$.articleId')=a.id AND json_extract(j.value,'$.value')='not-relevant'))
),
context AS (SELECT COUNT(*) AS popular_count FROM eligible WHERE popularity>0),
-- Quiet windows still offer ten stories; recent discoveries follow every genuinely ranked story.
discovery AS (
  SELECT id,ROW_NUMBER() OVER(ORDER BY COALESCE(published_at,discovered_at) DESC,id DESC) AS discovery_rank
  FROM eligible WHERE popularity=0
),
scored AS (
  SELECT e.*,CASE
    WHEN json_extract(p,'$.mode')='trending' THEN popularity
    WHEN json_extract(p,'$.mode') IN ('latest','following') THEN julianday(COALESCE(published_at,discovered_at))
    ELSE 4.0/(1+age_days/(CASE WHEN (SELECT active_days FROM cadence)>=7 THEN 7.0 ELSE 14.0 END))
      +CASE WHEN json_extract(p,'$.mode')='personal' THEN followed*3+interest_matches*2+saved_matches*0.6+MIN(4,read_affinity*1.2)+company_affinity*0.4+MAX(0,semantic_affinity-0.25)*6-negative_affinity*3-already_read*12 ELSE 0 END END AS base_score,
    CASE WHEN json_extract(p,'$.mode')='trending' THEN CASE WHEN popular_count>0 THEN 'engagement' ELSE 'freshness' END ELSE json_extract(p,'$.mode') END AS basis
  FROM eligible e CROSS JOIN input CROSS JOIN context LEFT JOIN discovery d ON d.id=e.id
  WHERE json_extract(p,'$.mode')<>'trending' OR popularity>0
    OR d.discovery_rank<=MAX(0,10-popular_count)
),
lanes AS (SELECT *,CASE WHEN basis='personal' AND already_read=0 AND age_days<=30 THEN 'recent'
    WHEN basis='personal' AND already_read=0 AND published_at IS NOT NULL AND age_days>=180 AND semantic_affinity>=0.42 AND negative_affinity<0.65 THEN 'archive'
    ELSE 'discovery' END AS lane,
    CASE WHEN already_read=1 THEN 'Already in your reading log'
      WHEN semantic_title IS NOT NULL AND semantic_affinity>=0.42 THEN 'Similar to “'||substr(semantic_title,1,100)||'”'
      WHEN semantic_topic IS NOT NULL AND semantic_affinity>=0.42 THEN 'Related to '||semantic_topic
      WHEN interest_matches>0 THEN 'Matches your interests'
      WHEN read_affinity>0 THEN 'Related to your reading log'
      WHEN followed=1 THEN 'From a company you follow'
      ELSE '' END AS reason FROM scored),
varied AS (SELECT *,base_score-CASE WHEN basis='personal' THEN (ROW_NUMBER() OVER(PARTITION BY company_id,lane ORDER BY base_score DESC,id DESC)-1)*1.8 ELSE 0 END AS score FROM lanes),
lane_positions AS (SELECT *,ROW_NUMBER() OVER(PARTITION BY lane ORDER BY already_read,score DESC,COALESCE(published_at,discovered_at) DESC,id DESC)-1 AS lane_position FROM varied),
mixed AS (SELECT *,CASE lane WHEN 'recent' THEN CAST(lane_position/3 AS INTEGER)*5+lane_position%3 WHEN 'archive' THEN lane_position*5+3 ELSE lane_position*5+4 END AS mix_position FROM lane_positions),
ranked AS (SELECT id,basis,lane,reason,reads,saves,ROW_NUMBER() OVER(ORDER BY CASE WHEN basis='personal' THEN already_read ELSE 0 END,
    CASE WHEN basis='personal' THEN mix_position ELSE 0 END,score DESC,COALESCE(published_at,discovered_at) DESC,id DESC)-1 AS position FROM mixed)
`;

type Session = { id: string; owner_hash: string; request_hash: string; created_at: string; expires_at: string; total: number; basis: ArticlePage["rankingBasis"] };

export class FeedExpiredError extends Error {}

export async function queryFeed(db: D1Database, input: FeedInput, sources: Source[], options: { pageSize: number; cursor?: string | null; page?: number; edition?: string | null; owner: string; clientKey?: string; now?: number }): Promise<ArticlePage> {
  const now = options.now ?? Date.now();
  const preferences = Object.fromEntries(Object.entries(input).filter(([key]) => key !== "snapshot"));
  const ownerHash = await articleId(options.owner);
  const stableHash = await articleId(JSON.stringify(preferences));
  let session: Session | null = null;
  let offset = ((options.page ?? 1) - 1) * options.pageSize;
  const cursor = options.edition ? `${options.edition}:${offset}` : options.cursor;
  if (cursor) {
    const match = cursor.match(/^([\da-f-]{36}):(\d+)$/i);
    if (!match || Number(match[2]) > 10000000) throw new FeedExpiredError('Invalid feed cursor');
    offset = Number(match[2]);
    session = await db.prepare('SELECT * FROM feed_sessions WHERE id=? AND owner_hash=? AND request_hash LIKE ? AND expires_at>?').bind(match[1], ownerHash, `${stableHash}:product-v4:%`, new Date(now).toISOString()).first<Session>();
    if (!session) throw new FeedExpiredError('This edition expired. Refresh your feed to continue.');
  } else {
    const revisions = (await db.prepare("SELECT id,value FROM app_state WHERE id IN ('content_revision','engagement_revision','semantic_revision')").all<{ id: string; value: number }>()).results;
    const revision = revisions.map(r => `${r.id}=${r.value}`).sort().join('|');
    const requestHash = `${stableHash}:product-v4:${revision}:${Math.floor(now / 300000)}`;
    session = await db.prepare('SELECT * FROM feed_sessions WHERE owner_hash=? AND request_hash=? AND expires_at>? LIMIT 1').bind(ownerHash, requestHash, new Date(now).toISOString()).first<Session>();
    if (!session) {
      if (options.clientKey) await reserveFeedBuild(db, options.clientKey, now);
      await pruneReadingCache(db, now);
      const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${ownerHash}:${requestHash}`)))].map(value => value.toString(16).padStart(2, '0')).join('');
      const id = `${digest.slice(0,8)}-${digest.slice(8,12)}-${digest.slice(12,16)}-${digest.slice(16,20)}-${digest.slice(20,32)}`;
      const created = new Date(now).toISOString();
      const params = JSON.stringify({ ...input, snapshot: created });
      // The batch freezes one globally ranked edition, including engagement and read-history effects.
      await db.batch([
        db.prepare('INSERT OR IGNORE INTO feed_sessions(id,owner_hash,request_hash,created_at,expires_at,total,basis) VALUES (?,?,?,?,?,0,?)').bind(id, ownerHash, requestHash, created, new Date(now + 3600000).toISOString(), input.mode === 'following' ? 'latest' : input.mode),
        db.prepare(`${RANK_SQL} INSERT INTO feed_chunks(session_id,chunk_index,ids,basis,details)
          SELECT ?,CAST(position/512 AS INTEGER),json_group_array(id),MAX(basis),json_group_object(id,json_object('lane',lane,'reason',reason,'reads',reads,'saves',saves)) FROM (SELECT * FROM ranked ORDER BY position) WHERE NOT EXISTS(SELECT 1 FROM feed_chunks WHERE session_id=?) GROUP BY CAST(position/512 AS INTEGER)`).bind(params, id, id),
        db.prepare(`UPDATE feed_sessions SET total=COALESCE((SELECT SUM(json_array_length(ids)) FROM feed_chunks WHERE session_id=?),0),
          basis=COALESCE((SELECT CASE basis WHEN 'following' THEN 'latest' ELSE basis END FROM feed_chunks WHERE session_id=? LIMIT 1),?) WHERE id=?`)
          .bind(id, id, input.mode === 'trending' ? 'freshness' : input.mode === 'following' ? 'latest' : input.mode, id),
      ]);
      session = await db.prepare('SELECT * FROM feed_sessions WHERE id=?').bind(id).first<Session>();
    }
  }
  if (!session) throw new Error('Could not create feed edition');
  const totalPages = Math.max(1, Math.ceil(session.total / options.pageSize));
  if (offset >= session.total) offset = (totalPages - 1) * options.pageSize;
  const firstChunk = Math.floor(offset / 512);
  const lastChunk = Math.floor((offset + options.pageSize - 1) / 512);
  const chunks = (await db.prepare('SELECT chunk_index,ids,details FROM feed_chunks WHERE session_id=? AND chunk_index BETWEEN ? AND ? ORDER BY chunk_index').bind(session.id, firstChunk, lastChunk).all<{ chunk_index: number; ids: string; details: string }>()).results;
  const details = Object.assign({}, ...chunks.map(chunk => JSON.parse(chunk.details))) as Record<string,{lane:Article['recommendationLane'];reason:string;reads?:number;saves?:number}>;
  const ids = chunks.flatMap(chunk => JSON.parse(chunk.ids) as string[]).slice(offset % 512, offset % 512 + options.pageSize);
  const rows = ids.length ? (await db.prepare(`SELECT a.*,COALESCE((SELECT json_group_array(t.name) FROM article_topics at JOIN topics t ON t.id=at.topic_id WHERE at.article_id=a.id),'[]') AS normalized_topics,
    (SELECT t.name FROM article_topics at JOIN topics t ON t.id=at.topic_id WHERE at.article_id=a.id AND EXISTS(SELECT 1 FROM article_topics old JOIN json_each(?) log ON old.article_id=json_extract(log.value,'$.articleId') WHERE old.topic_id=at.topic_id) LIMIT 1) AS related_topic,
    (SELECT COUNT(*) FROM engagements e WHERE e.article_id=a.id AND e.kind='read' AND e.active=1) AS logged_reads,
    (SELECT COUNT(*) FROM engagements e WHERE e.article_id=a.id AND e.kind='save' AND e.active=1) AS saved_count
    FROM articles a WHERE a.id IN (SELECT value FROM json_each(?))`).bind(JSON.stringify(input.readLogs), JSON.stringify(ids)).all<Record<string, unknown>>()).results : [];
  const classify = await readTopicClassifier(db);
  const byId = new Map(rows.map(row => [String(row.id), row]));
  const articles = ids.flatMap(id => {
    const row = byId.get(id); if (!row) return [];
    const article = { ...row, topics: classify(String(row.title), String(row.summary)).map(topic => topic.name), engagement: { reads: Number(row.logged_reads), saves: Number(row.saved_count) } } as unknown as Article;
    if(input.mode==='trending') {
      article.windowEngagement = { reads: details[id]?.reads ?? 0, saves: details[id]?.saves ?? 0 };
      article.discovery = article.windowEngagement.reads + article.windowEngagement.saves === 0;
    }
    if(input.mode==='personal') {
      article.recommendationReason = details[id]?.reason || undefined;
      article.recommendationLane = details[id]?.lane;
    }
    return [article];
  });
  const next = offset + ids.length;
  const topicCatalog=(await db.prepare('SELECT id,name,parent_id FROM topics ORDER BY parent_id IS NOT NULL,name').all<{id:string;name:string;parent_id:string|null}>()).results;
  const cutoff = new Date(now - (input.period === 'today' ? 1 : input.period === 'week' ? 7 : 1000000) * 86400000).toISOString();
  const communitySummary = input.mode === 'trending' ? await db.prepare(`SELECT COALESCE(SUM(e.kind='read'),0) AS reads,COALESCE(SUM(e.kind='save'),0) AS saves,COUNT(DISTINCT e.article_id) AS stories,COUNT(DISTINCT a.company_id) AS companies FROM engagements e JOIN articles a ON a.id=e.article_id WHERE e.active=1 AND e.occurred_at>=? AND e.occurred_at<=?`).bind(cutoff,new Date(now).toISOString()).first<{reads:number;saves:number;stories:number;companies:number}>() : null;
  return { articles, sources, total: session.total, hasMore: next < session.total, nextCursor: next < session.total ? `${session.id}:${next}` : null, snapshot: session.created_at, updatedAt: session.created_at, rankingBasis: session.basis, rankingVersion: 3,contentVersion:session.request_hash.match(/content_revision=(\d+)/)?.[1]??'0',topicCatalog,page:Math.floor(offset/options.pageSize)+1,pageSize:options.pageSize,totalPages,edition:session.id,...(communitySummary?{communitySummary}:{}) };
}
