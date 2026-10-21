import type { Profile } from '../types.ts';
import { articleId, ValidationError } from './core.ts';
import { engagementTotals } from './engagement.ts';

export class ProfileConflictError extends Error {}
export class ContributionLimitError extends ValidationError {}

/** Persist private state and its explicit public changes in one D1 transaction. */
export async function writeProfile(db: D1Database, userId: string, previous: Profile, profile: Profile, version: number, now = new Date(), generation = 0) {
  const owner = await articleId(`account:${userId}`);
  const epochKey = `reading_generation:${owner}`;
  const epoch = await db.prepare("SELECT value FROM app_state WHERE id=?").bind(epochKey).first<{value:number}>();
  if ((epoch?.value ?? 0) !== generation) throw new ProfileConflictError("Your reading data was reset. Reload to start with the current account copy.");
  const reader = await articleId(`readzz-reader:${userId}`);
  const additions = {
    save: profile.bookmarks.filter(id => !previous.bookmarks.includes(id)),
    read: profile.readLogs.map(log => log.articleId).filter(id => !previous.readLogs.some(log => log.articleId === id)),
  };
  const added = [...new Set([...additions.save, ...additions.read])];
  const used = await db.prepare('SELECT COUNT(*) AS total FROM engagements WHERE reader_id=? AND occurred_at>=?')
    .bind(reader, `${now.toISOString().slice(0, 10)}T00:00:00.000Z`).first<{ total: number }>();
  const fresh = added.length ? (await db.prepare(`SELECT COUNT(*) AS total FROM (
    SELECT a.id,'save' AS kind FROM articles a JOIN json_each(?) j ON j.value=a.id
    UNION ALL SELECT a.id,'read' AS kind FROM articles a JOIN json_each(?) j ON j.value=a.id
  ) n WHERE NOT EXISTS(SELECT 1 FROM engagements e WHERE e.reader_id=? AND e.article_id=n.id AND e.kind=n.kind)`)
    .bind(JSON.stringify(additions.save), JSON.stringify(additions.read), reader).first<{ total: number }>())?.total ?? 0 : 0;
  if (fresh > 0 && (used?.total ?? 0) + fresh > 100) throw new ContributionLimitError('You have reached today’s limit of 100 new reading actions. Your changes remain on this device; try again tomorrow.');
  const data = JSON.stringify(profile), timestamp = now.toISOString(), next = version + 1;
  const save = version
    ? db.prepare('UPDATE profiles SET data=?,version=version+1,updated_at=? WHERE user_id=? AND version=? AND COALESCE((SELECT value FROM app_state WHERE id=?),0)=?').bind(data, timestamp, userId, version, epochKey, generation)
    : db.prepare('INSERT INTO profiles(user_id,data,version,updated_at) SELECT ?,?,1,? WHERE COALESCE((SELECT value FROM app_state WHERE id=?),0)=? ON CONFLICT(user_id) DO NOTHING').bind(userId, data, timestamp, epochKey, generation);
  // The exact winning profile guards every side effect if the CAS loses. Equal
  // concurrent payloads have identical desired state and idempotent effects.
  const guard = 'EXISTS(SELECT 1 FROM profiles WHERE user_id=? AND version=? AND updated_at=? AND data=?)';
  const commands = [save];
  for (const [kind, ids] of [['save', profile.bookmarks], ['read', profile.readLogs.map(log => log.articleId)]] as const) {
    commands.push(db.prepare(`UPDATE engagements SET active=0 WHERE reader_id=? AND kind=? AND active=1
      AND article_id NOT IN (SELECT value FROM json_each(?)) AND ${guard}`)
      .bind(reader, kind, JSON.stringify(ids), userId, next, timestamp, data));
    commands.push(db.prepare(`UPDATE engagements SET active=1 WHERE reader_id=? AND kind=? AND active=0
      AND article_id IN (SELECT value FROM json_each(?)) AND ${guard}`)
      .bind(reader, kind, JSON.stringify(ids), userId, next, timestamp, data));
    commands.push(db.prepare(`INSERT INTO engagements(reader_id,article_id,kind,active,occurred_at)
      SELECT ?,a.id,?,1,? FROM articles a JOIN json_each(?) j ON j.value=a.id WHERE ${guard}
      ON CONFLICT(reader_id,article_id,kind) DO NOTHING`)
      .bind(reader, kind, timestamp, JSON.stringify(additions[kind]), userId, next, timestamp, data));
  }
  const results = await db.batch(commands);
  if (!results[0].meta.changes) throw new ProfileConflictError('Your reading changed in another tab or device. Review both copies before saving.');
  const changed = [...new Set([...added, ...previous.bookmarks.filter(id => !profile.bookmarks.includes(id)),
    ...previous.readLogs.filter(log => !profile.readLogs.some(nextLog => nextLog.articleId === log.articleId)).map(log => log.articleId)])];
  // Confirmation must not turn a committed write into a failed mutation if a
  // nonessential totals query fails. Polling can refresh these counts later.
  const stats: Record<string, { reads: number; saves: number }> = {};
  try {
    for (let index = 0; index < changed.length; index += 100) Object.assign(stats, await engagementTotals(db, changed.slice(index, index + 100)));
  } catch { /* The profile and activity transaction has already committed. */ }
  return { version: next, stats };
}
