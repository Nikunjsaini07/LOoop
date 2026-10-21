import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import { testDatabase } from './test-db.mjs';
const bundle = await build({ stdin: { contents: 'export {deleteReadingData} from "./account-data";export {writeProfile,ProfileConflictError} from "./profile-write";export {saveReaderReport} from "./reader-reports";export {emptyProfile} from "./core";', resolveDir: fileURLToPath(new URL('.', import.meta.url)) }, bundle: true, write: false, format: 'esm', platform: 'neutral' });
const { deleteReadingData, writeProfile, ProfileConflictError, saveReaderReport, emptyProfile } = await import(`data:text/javascript;base64,${Buffer.from(bundle.outputFiles[0].text).toString('base64')}`);
const now = new Date('2026-10-21T12:00:00.000Z');
function add(f) { f.sql.prepare('INSERT INTO articles VALUES (?,?,?,?,?,?,?,?,?)').run('one', 'stripe', 'Stripe', 'Story', 'https://stripe.com/one', '', now.toISOString(), now.toISOString(), '[]'); }

test('deletion removes only the verified reader’s data and blocks stale zero-version replays', async () => {
  const f = testDatabase(); try {
    add(f); const profile = { ...emptyProfile(), bookmarks: ['one'] };
    await writeProfile(f.db, 'a', emptyProfile(), profile, 0, now);
    await writeProfile(f.db, 'b', emptyProfile(), profile, 0, now);
    await saveReaderReport(f.db, 'a', { articleId: 'one', kind: 'broken-link', detail: '404' }, now);
    await deleteReadingData(f.db, 'a');
    assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM profiles WHERE user_id='a'").get().n, 0);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM user_bookmarks').get().n, 1);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM reader_reports').get().n, 0);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM engagements').get().n, 1);
    await assert.rejects(writeProfile(f.db, 'a', emptyProfile(), profile, 0, now), ProfileConflictError);
    const epoch = f.sql.prepare("SELECT value FROM app_state WHERE id LIKE 'reading_generation:%'").get().value;
    await writeProfile(f.db, 'a', emptyProfile(), profile, 0, now, epoch);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM profiles').get().n, 2);
    assert.deepEqual(f.sql.prepare('PRAGMA foreign_key_check').all(), []);
  } finally { f.close(); }
});

test('report validation, five-per-day limit, and unavailable articles are enforced', async () => {
  const f = testDatabase(); try {
    add(f); const report = { articleId: 'one', kind: 'incorrect-topic', detail: 'Security topic missing' };
    for (let i = 0; i < 5; i++) await saveReaderReport(f.db, 'a', report, now);
    await assert.rejects(saveReaderReport(f.db, 'a', report, now), /five reports/);
    await assert.rejects(saveReaderReport(f.db, 'b', { ...report, kind: 'invalid' }, now), /report type/);
    await assert.rejects(saveReaderReport(f.db, 'b', { ...report, articleId: 'missing' }, now), /unavailable/);
    await assert.rejects(saveReaderReport(f.db, 'b', { ...report, detail: 'x'.repeat(1001) }, now), /1,000/);
    assert.equal(f.sql.prepare('SELECT COUNT(*) n FROM reader_reports').get().n, 5);
  } finally { f.close(); }
});
