import { articleId, ValidationError } from "./core.ts";

export type EngagementAction = { articleId: string; kind: "read" | "save"; active: boolean };

export function validateEngagement(input: unknown): EngagementAction {
  if (!input || typeof input !== "object") throw new ValidationError('An engagement action is required');
  const event = input as Record<string, unknown>;
  if (typeof event.articleId !== 'string' || !/^[\w-]{1,80}$/.test(event.articleId) || !['read','save'].includes(String(event.kind)) || typeof event.active !== 'boolean') throw new ValidationError('Invalid reading action');
  return { articleId: event.articleId, kind: event.kind as EngagementAction['kind'], active: event.active };
}

/** Account identity or the server's guest-browser token; never client timestamps/history. */
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

export async function engagementTotals(db: D1Database, ids: string[]) {
  const rows = (await db.prepare(`SELECT a.id,COALESCE(SUM(e.kind='read'),0) AS reads,COALESCE(SUM(e.kind='save'),0) AS saves FROM articles a LEFT JOIN engagements e ON e.article_id=a.id AND e.active=1 WHERE a.id IN (SELECT value FROM json_each(?)) GROUP BY a.id`).bind(JSON.stringify(ids)).all<{id:string;reads:number;saves:number}>()).results;
  return Object.fromEntries(rows.map(row=>[row.id,{reads:Number(row.reads),saves:Number(row.saves)}]));
}

// A guest token only deduplicates public activity; it never authenticates private profiles.
export function guestReader(request: Request) {
  const value = request.headers.get('cookie')?.match(/(?:^|;\s*)readzz_reader=([a-f\d]{8}-[a-f\d]{4}-4[a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12})(?:;|$)/i)?.[1]?.toLowerCase();
  const token = value ?? crypto.randomUUID();
  return { identity: `guest:${token}`, cookie: value ? null : `readzz_reader=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=31536000${new URL(request.url).protocol==='https:'?'; Secure':''}` };
}

export async function engagementActive(db: D1Database, identity: string, event: EngagementAction) {
  const reader = await articleId(`readzz-reader:${identity}`);
  const row = await db.prepare('SELECT active FROM engagements WHERE reader_id=? AND article_id=? AND kind=?').bind(reader,event.articleId,event.kind).first<{active:number}>();
  return Boolean(row?.active);
}
