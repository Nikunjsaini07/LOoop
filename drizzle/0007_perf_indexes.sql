CREATE INDEX IF NOT EXISTS articles_published_discovered_idx ON articles(published_at, discovered_at);
CREATE INDEX IF NOT EXISTS feed_sessions_owner_request_idx ON feed_sessions(owner_hash, request_hash, expires_at);
INSERT OR IGNORE INTO readzz_migrations(name,applied_at) VALUES ('0007_perf_indexes',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
