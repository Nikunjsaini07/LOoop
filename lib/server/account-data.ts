import { articleId } from './core.ts';

export async function deleteReadingData(db: D1Database, userId: string) {
  const reader = await articleId(`readzz-reader:${userId}`);
  const owner = await articleId(`account:${userId}`);
  // Relationship projections cascade with the profile. Hashes are scoped to the
  // verified identity; no caller-supplied owner or email is accepted.
  await db.batch([
    db.prepare("INSERT INTO app_state(id,value) VALUES (?,?) ON CONFLICT(id) DO UPDATE SET value=MAX(value+1,excluded.value)").bind(`reading_generation:${owner}`, Date.now()),
    db.prepare('DELETE FROM reader_reports WHERE reader_id=?').bind(reader),
    db.prepare('DELETE FROM engagements WHERE reader_id=?').bind(reader),
    db.prepare('DELETE FROM feed_sessions WHERE owner_hash=?').bind(owner),
    db.prepare('DELETE FROM profiles WHERE user_id=?').bind(userId),
  ]);
}
