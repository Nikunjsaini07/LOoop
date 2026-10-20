import { articleId, ValidationError } from "./core.ts";

export type EngagementAction = { articleId: string; kind: "read" | "save"; active: boolean };

export function validateEngagement(input: unknown): EngagementAction {
  if (!input || typeof input !== "object") throw new ValidationError('An engagement action is required');
  const event = input as Record<string, unknown>;
  if (typeof event.articleId !== 'string' || !/^[\w-]{1,80}$/.test(event.articleId) || !['read','save'].includes(String(event.kind)) || typeof event.active !== 'boolean') throw new ValidationError('Invalid reading action');
  return { articleId: event.articleId, kind: event.kind as EngagementAction['kind'], active: event.active };
}

/** Identity comes from verified server auth. Client timestamps/history never count. */
export async function recordEngagement(db: D1Database, verifiedUserId: string, event: EngagementAction, now = new Date()): Promise<boolean> {
  if (!verifiedUserId) throw new ValidationError('A verified reader is required');
  const reader = await articleId(`readzz-reader:${verifiedUserId}`);
  if (!event.active) {
    const result = await db.prepare('UPDATE engagements SET active=0 WHERE reader_id=? AND article_id=? AND kind=? AND active=1').bind(reader, event.articleId, event.kind).run();
    return Boolean(result.meta.changes);
  }
  const timestamp = now.toISOString();
  const result = await db.prepare(`INSERT INTO engagements(reader_id,article_id,kind,active,occurred_at)
    SELECT ?,?,?,1,? WHERE EXISTS(SELECT 1 FROM articles WHERE id=?)
      AND ((SELECT COUNT(*) FROM engagements WHERE reader_id=? AND occurred_at>=?)<100
        OR EXISTS(SELECT 1 FROM engagements WHERE reader_id=? AND article_id=? AND kind=?))
    ON CONFLICT(reader_id,article_id,kind) DO UPDATE SET active=1 WHERE engagements.active=0`)
    .bind(reader,event.articleId,event.kind,timestamp,event.articleId,reader,`${timestamp.slice(0,10)}T00:00:00.000Z`,reader,event.articleId,event.kind).run();
  return Boolean(result.meta.changes);
}
