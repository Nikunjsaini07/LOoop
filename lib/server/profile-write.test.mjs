import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { testDatabase } from './test-db.mjs';

const bundle = await build({ stdin: { contents: 'export * from "./profile-write";export {emptyProfile,articleId} from "./core";', resolveDir: fileURLToPath(new URL('.', import.meta.url)) }, bundle: true, write: false, format: 'esm', platform: 'neutral' });
const { writeProfile, emptyProfile, articleId, ProfileConflictError, ContributionLimitError } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const now = new Date('2026-10-21T12:00:00.000Z');
function add(f, id) { f.sql.prepare('INSERT INTO articles VALUES (?,?,?,?,?,?,?,?,?)').run(id, 'stripe', 'Stripe', id, `https://stripe.com/${id}`, '', now.toISOString(), now.toISOString(), '[]'); }

test('profile, projections and public activity commit together and retry cannot double count', async () => {
  const f = testDatabase(); try {
    add(f, 'one'); const profile = { ...emptyProfile(), bookmarks: ['one'], readLogs: [{ articleId: 'one', readAt: now.toISOString() }] };
    const result = await writeProfile(f.db, 'reader', emptyProfile(), profile, 0, now);
    assert.equal(result.version, 1); assert.deepEqual(result.stats.one, { saves: 1, reads: 1 });
    assert.equal(f.sql.prepare('SELECT COUNT(*) total FROM user_bookmarks').get().total, 1);
    await assert.rejects(writeProfile(f.db, 'reader', emptyProfile(), profile, 0, now), ProfileConflictError);
    assert.equal(f.sql.prepare('SELECT COUNT(*) total FROM engagements').get().total, 2);
    await writeProfile(f.db, 'reader', profile, emptyProfile(), 1, new Date(+now + 1000));
    assert.equal(f.sql.prepare('SELECT SUM(active) total FROM engagements').get().total, 0);
  } finally { f.close(); }
});

test('a losing version cannot alter counts and another account remains isolated', async () => {
  const f = testDatabase(); try {
    add(f, 'one'); add(f, 'two');
    const one = { ...emptyProfile(), bookmarks: ['one'] }, two = { ...emptyProfile(), bookmarks: ['two'] };
    await writeProfile(f.db, 'a', emptyProfile(), one, 0, now);
    await writeProfile(f.db, 'b', emptyProfile(), two, 0, now);
    await assert.rejects(writeProfile(f.db, 'a', emptyProfile(), two, 0, new Date(+now + 1000)), ProfileConflictError);
    const reader = await articleId('readzz-reader:a');
    assert.deepEqual(f.sql.prepare('SELECT article_id,active FROM engagements WHERE reader_id=?').all(reader).map(row => ({ ...row })), [{ article_id: 'one', active: 1 }]);
    assert.equal(JSON.parse(f.sql.prepare('SELECT data FROM profiles WHERE user_id=?').get('b').data).bookmarks[0], 'two');
  } finally { f.close(); }
});

test('existing imported history is not retroactively counted by an unrelated profile edit', async () => {
  const f = testDatabase(); try {
    add(f, 'old'); const previous = { ...emptyProfile(), bookmarks: ['old'] };
    f.sql.prepare('INSERT INTO profiles VALUES (?,?,1,?)').run('reader', JSON.stringify(previous), now.toISOString());
    await writeProfile(f.db, 'reader', previous, { ...previous, bio: 'Systems' }, 1, now);
    assert.equal(f.sql.prepare('SELECT COUNT(*) total FROM engagements').get().total, 0);
  } finally { f.close(); }
});

test('any database side-effect failure rolls back the profile as well as public activity', async () => {
  const f = testDatabase(); try {
    add(f, 'one');
    f.sql.exec("CREATE TRIGGER reject_engagement BEFORE INSERT ON engagements BEGIN SELECT RAISE(ABORT,'Test failure'); END;");
    await assert.rejects(writeProfile(f.db, 'reader', emptyProfile(), { ...emptyProfile(), bookmarks: ['one'] }, 0, now), /Test failure/);
    assert.equal(f.sql.prepare('SELECT COUNT(*) total FROM profiles').get().total, 0);
    assert.equal(f.sql.prepare('SELECT COUNT(*) total FROM user_bookmarks').get().total, 0);
  } finally { f.close(); }
});

test('daily new-action limits reject the complete mutation without partial saves', async () => {
  const f = testDatabase(); try {
    const ids = Array.from({ length: 101 }, (_, i) => `item-${i}`); ids.forEach(id => add(f, id));
    await assert.rejects(writeProfile(f.db, 'reader', emptyProfile(), { ...emptyProfile(), bookmarks: ids }, 0, now), ContributionLimitError);
    assert.equal(f.sql.prepare('SELECT COUNT(*) total FROM profiles').get().total, 0);
    assert.equal(f.sql.prepare('SELECT COUNT(*) total FROM engagements').get().total, 0);
  } finally { f.close(); }
});
