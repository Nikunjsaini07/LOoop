import assert from 'node:assert/strict';
import test from 'node:test';
import { testDatabase } from './test-db.mjs';
import { checkReadiness } from './readiness.ts';

const now = Date.now();
const settings = { production: true, secretKey: 'sk_live_fixture', publishableKey: 'pk_live_fixture', webhookSecret: 'whsec_fixture', authorizedParties: 'https://readwell.example', origin: 'https://readwell.example' };
function fixture() {
  const database = testDatabase();
  database.sql.exec("INSERT INTO articles VALUES ('story','linear','Linear','A story','https://linear.app/now/story','Excerpt',NULL,'2026-10-21','[]')");
  database.sql.prepare("INSERT INTO app_state(id,value) VALUES ('ingestion_last_run',?)").run(now - 1000);
  return database;
}
test('production readiness requires data, live authentication, lifecycle configuration and a recent scheduler', async () => {
  const database = fixture();
  try {
    assert.equal((await checkReadiness(database.db, settings, now)).ready, true);
    for (const patch of [{ secretKey: 'sk_test_fixture' }, { webhookSecret: '' }, { authorizedParties: 'http://localhost:5173' }]) {
      assert.equal((await checkReadiness(database.db, { ...settings, ...patch }, now)).ready, false);
    }
    database.sql.exec("DELETE FROM app_state WHERE id='ingestion_last_run'");
    const result = await checkReadiness(database.db, settings, now);
    assert.equal(result.ready, false);
    assert.equal(result.checks.scheduler, false);
  } finally { database.close(); }
});
test('stale scheduler, empty archive and partial schema fail readiness without exposing account records', async () => {
  const database = fixture();
  try {
    assert.equal((await checkReadiness(database.db, settings, now + 31 * 60 * 1000)).ready, false);
    database.sql.exec('DELETE FROM articles');
    assert.equal((await checkReadiness(database.db, settings, now)).checks.archive, false);
    database.sql.exec('DROP TABLE reader_reports');
    assert.deepEqual(await checkReadiness(database.db, settings, now), { ready: false, checks: { database: true, schema: false } });
  } finally { database.close(); }
});
