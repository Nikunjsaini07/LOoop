import assert from 'node:assert/strict';
import test from 'node:test';
import { DatabaseSync } from 'node:sqlite';
import { fields, importSql, verify } from './sync-local-archive.mjs';

const article = (id, url = `https://example.com/${id}`) => ({ id, company_id: 'stripe', company: 'Stripe', title: "A team's engineering", url, summary: 'A real excerpt', published_at: null, discovered_at: '2026-10-20T00:00:00Z', topics: '["Systems"]' });
test('sync adds missing public stories, preserves cloud identities/metadata and never writes profiles', () => {
  const db = new DatabaseSync(':memory:');
  try {
    db.exec(`CREATE TABLE articles(id TEXT PRIMARY KEY,company_id TEXT,company TEXT,title TEXT,url TEXT UNIQUE,summary TEXT,published_at TEXT,discovered_at TEXT,topics TEXT); CREATE TABLE profiles(user_id TEXT PRIMARY KEY,data TEXT); INSERT INTO profiles VALUES ('reader','private-bookmarks');`);
    const existing = article('cloud-id', 'https://example.com/existing');
    db.prepare(`INSERT INTO articles VALUES (${fields.map(() => '?').join(',')})`).run(...fields.map(field => existing[field]));
    const source = [article('local-id', existing.url), article('new')];
    const prepared = importSql(source, [existing], new Set(['stripe']));
    assert.equal(prepared.missing.length, 1);
    db.exec(prepared.sql);
    db.exec(prepared.sql);
    const after = db.prepare(`SELECT ${fields.join(',')} FROM articles ORDER BY url`).all().map(row => ({ ...row }));
    assert.equal(verify(source, [existing], after), 2);
    assert.equal(after.length, 2);
    assert.equal(db.prepare('SELECT data FROM profiles').get().data, 'private-bookmarks');
    assert.ok(!prepared.sql.includes('profiles'));
  } finally { db.close(); }
});
test('sync rejects conflicting article IDs or unknown companies before changing remote data', () => {
  assert.throws(() => importSql([article('same')], [article('same', 'https://example.com/other')], new Set(['stripe'])), /collision/);
  assert.throws(() => importSql([article('new')], [], new Set()), /Missing remote company/);
  assert.throws(() => verify([article('new')], [], []), /Missing local story/);
});
