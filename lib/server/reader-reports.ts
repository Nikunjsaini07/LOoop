import { articleId, ValidationError } from './core.ts';
export async function saveReaderReport(db: D1Database, userId: string, value: unknown, now = new Date()) {
  const input = value as Record<string, unknown> | null;
  if (!input || typeof input !== 'object' || !['broken-link', 'incorrect-topic', 'missing-excerpt', 'other'].includes(String(input.kind)) || typeof input.articleId !== 'string' || !/^[\w-]{1,80}$/.test(input.articleId) || typeof input.detail !== 'string' || input.detail.length > 1000) throw new ValidationError('Choose a report type and use at most 1,000 characters.');
  const id = crypto.randomUUID(), reader = await articleId(`readzz-reader:${userId}`);
  const result = await db.prepare(`INSERT INTO reader_reports(id,reader_id,article_id,kind,detail,created_at)
    SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM articles WHERE id=?)
    AND (SELECT COUNT(*) FROM reader_reports WHERE reader_id=? AND created_at>=?)<5`)
    .bind(id, reader, input.articleId, input.kind, input.detail.trim(), now.toISOString(), input.articleId, reader, `${now.toISOString().slice(0,10)}T00:00:00.000Z`).run();
  if (!result.meta.changes) throw new ValidationError('The story is unavailable or you have already sent five reports today.');
  return { id };
}
