import { articleId } from './core.ts';

export class FeedRateLimitError extends Error {}
export async function reserveFeedBuild(db: D1Database, clientKey: string, now: number) {
  const minute = Math.floor(now / 60000);
  const key = `feed_budget:${await articleId(clientKey)}`;
  const row = await db.prepare(`INSERT INTO app_state(id,value) VALUES (?,?)
    ON CONFLICT(id) DO UPDATE SET value=CASE WHEN CAST(app_state.value/10000 AS INTEGER)=? THEN app_state.value+1 ELSE excluded.value END
    RETURNING app_state.value`).bind(key, minute * 10000 + 1, minute).first<{ value: number }>();
  if (!row || row.value % 10000 > 120) throw new FeedRateLimitError('Too many new searches in a short time. Please try again in a minute.');
}

export async function pruneReadingCache(db: D1Database, now = Date.now(), limit = 100) {
  await db.batch([
    db.prepare('DELETE FROM feed_sessions WHERE id IN (SELECT id FROM feed_sessions WHERE expires_at<? ORDER BY expires_at LIMIT ?)').bind(new Date(now).toISOString(), limit),
    db.prepare("DELETE FROM app_state WHERE id IN (SELECT id FROM app_state WHERE id LIKE 'feed_budget:%' AND value<? LIMIT ?)").bind((Math.floor(now / 60000) - 10) * 10000, limit),
  ]);
}
