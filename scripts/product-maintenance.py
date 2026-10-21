"""Local-only product migration, topic repair, and verified SQLite recovery drill."""
import datetime
import hashlib
import json
from pathlib import Path
import sqlite3
import subprocess

ROOT = Path(__file__).resolve().parents[1]
STATE = (ROOT / '.wrangler/state/v3/d1').resolve()
OUTPUT = ROOT / 'outputs/product-maintenance'


def private_hash(connection):
    tables = ['reader_reports', 'profiles', 'user_company_follows', 'user_topic_follows', 'user_bookmarks', 'user_read_logs', 'engagements']
    tables = [table for table in tables if connection.execute("SELECT 1 FROM sqlite_master WHERE name=?", (table,)).fetchone()]
    return {table: hashlib.sha256(json.dumps(sorted(connection.execute(f'SELECT * FROM {table}').fetchall()), ensure_ascii=False).encode()).hexdigest() for table in tables}


def maintain():
    candidates = []
    for path in STATE.rglob('*.sqlite'):
        if path.name == 'metadata.sqlite':
            continue
        resolved = path.resolve()
        if not resolved.is_relative_to(STATE):
            raise RuntimeError('Database must remain in the local application state directory')
        with sqlite3.connect(resolved.as_uri() + '?mode=ro', uri=True) as connection:
            if connection.execute("SELECT 1 FROM sqlite_master WHERE name='articles'").fetchone():
                candidates.append(resolved)
    if len(candidates) != 1:
        raise RuntimeError('Expected exactly one local application database')
    path = candidates[0]
    OUTPUT.mkdir(parents=True, exist_ok=True)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y-%m-%dT%H-%M-%SZ')
    backup_path = OUTPUT / f'{stamp}-before.sqlite'
    with sqlite3.connect(path.as_uri() + '?mode=ro', uri=True) as source, sqlite3.connect(backup_path) as backup:
        source.backup(backup)
    # Restore to an isolated file and verify the backup before touching live data.
    restored_path = OUTPUT / f'{stamp}-restore-check.sqlite'
    with sqlite3.connect(backup_path) as backup, sqlite3.connect(restored_path) as restored:
        backup.backup(restored)
        if restored.execute('PRAGMA integrity_check').fetchone()[0] != 'ok' or restored.execute('PRAGMA foreign_key_check').fetchall():
            raise RuntimeError('Backup recovery verification failed')
    with sqlite3.connect(path, timeout=30) as connection:
        connection.execute('PRAGMA foreign_keys=ON')
        connection.execute('BEGIN IMMEDIATE')
        before = private_hash(connection)
        identities = connection.execute('SELECT id,url FROM articles ORDER BY id').fetchall()
        # Apply additive report storage; never drop or rebuild existing account tables.
        migration = (ROOT / 'drizzle/0006_reader_reports.sql').read_text(encoding='utf-8')
        for statement in migration.split(';'):
            if statement.strip():
                connection.execute(statement)
        connection.execute("DELETE FROM topic_keywords WHERE topic_id='product' AND term IN ('team','teams','design','customer','customers','introducing')")
        for term in ['certificate', 'certificates', 'compromised', 'cve', 'tls', 'pki', 'fraud']:
            connection.execute("INSERT OR IGNORE INTO topic_keywords(topic_id,term,weight) VALUES ('security',?,1)", (term,))
        connection.execute("INSERT OR IGNORE INTO topic_keywords(topic_id,term,weight) VALUES ('product','product design',1)")
        catalog = []
        for identifier, name, parent in connection.execute('SELECT id,name,parent_id FROM topics ORDER BY id'):
            words = connection.execute('SELECT term,weight FROM topic_keywords WHERE topic_id=?', (identifier,)).fetchall()
            catalog.append(dict(id=identifier, name=name, parent=parent, keywords=[row[0] for row in words], keywordWeights=dict(words)))
        articles = [dict(zip(['id', 'title', 'summary'], row)) for row in connection.execute('SELECT id,title,summary FROM articles')]
        result = subprocess.run(['node', '--experimental-strip-types', str(ROOT / 'scripts/classify-topic-data.mjs')], input=json.dumps(dict(catalog=catalog, articles=articles)), text=True, encoding='utf-8', capture_output=True, check=True, cwd=ROOT)
        updated = json.loads(result.stdout)
        changes = 0
        for article in updated:
            tags = json.dumps([topic['name'] for topic in article['topics']], ensure_ascii=False, separators=(',', ':'))
            changes += connection.execute('UPDATE articles SET topics=? WHERE id=? AND topics<>?', (tags, article['id'], tags)).rowcount
            connection.execute('DELETE FROM article_topics WHERE article_id=?', (article['id'],))
            connection.executemany('INSERT INTO article_topics(article_id,topic_id,score) VALUES (?,?,?)', [(article['id'], topic['id'], topic['score']) for topic in article['topics']])
        expired = connection.execute("DELETE FROM feed_sessions WHERE expires_at<strftime('%Y-%m-%dT%H:%M:%fZ','now')").rowcount
        after = private_hash(connection)
        if identities != connection.execute('SELECT id,url FROM articles ORDER BY id').fetchall() or any(after.get(table) != digest for table, digest in before.items()):
            raise RuntimeError('Article identity or private-data preservation check failed')
        if connection.execute('PRAGMA foreign_key_check').fetchall():
            raise RuntimeError('Foreign-key verification failed')
        connection.commit()
        report = dict(articles=len(articles), updatedTopicLists=changes, expiredEditionsRemoved=expired, privateDataPreserved=True, articleIdentitiesPreserved=True, backupRestoredAndVerified=True, backup=str(backup_path), restoreCheck=str(restored_path))
    (OUTPUT / f'{stamp}-report.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    # Keep seven successfully verified maintenance snapshot pairs. Never touch
    # manually created backups or any path outside this task-owned output folder.
    for older in sorted(OUTPUT.glob('*-before.sqlite'), reverse=True)[7:]:
        for target in [older, older.with_name(older.name.replace('-before.sqlite', '-restore-check.sqlite'))]:
            if target.resolve().parent != OUTPUT.resolve():
                raise RuntimeError('Backup retention path escaped its output directory')
            target.unlink(missing_ok=True)
    print(json.dumps({key: value for key, value in report.items() if key not in ['backup', 'restoreCheck']}))


if __name__ == '__main__':
    maintain()
