CREATE TABLE IF NOT EXISTS reader_reports (
  id TEXT PRIMARY KEY NOT NULL,
  reader_id TEXT NOT NULL,
  article_id TEXT REFERENCES articles(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reader_reports_reader_date_idx ON reader_reports(reader_id,created_at);
CREATE INDEX IF NOT EXISTS reader_reports_date_idx ON reader_reports(created_at);
INSERT OR IGNORE INTO readzz_migrations(name,applied_at) VALUES ('0006_reader_reports',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
