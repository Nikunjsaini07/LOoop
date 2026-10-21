-- Public article metadata only. Model inference runs in the background indexer.
CREATE TABLE IF NOT EXISTS semantic_documents (
  article_id TEXT PRIMARY KEY NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  model TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS semantic_topics (
  article_id TEXT NOT NULL REFERENCES semantic_documents(article_id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL REFERENCES topics(id),
  similarity REAL NOT NULL CHECK(similarity BETWEEN -1 AND 1),
  PRIMARY KEY(article_id,topic_id)
);
CREATE INDEX IF NOT EXISTS semantic_topics_topic_idx ON semantic_topics(topic_id,article_id);
CREATE TABLE IF NOT EXISTS semantic_neighbors (
  article_id TEXT NOT NULL REFERENCES semantic_documents(article_id) ON DELETE CASCADE,
  neighbor_id TEXT NOT NULL REFERENCES semantic_documents(article_id) ON DELETE CASCADE,
  similarity REAL NOT NULL CHECK(similarity BETWEEN -1 AND 1),
  PRIMARY KEY(article_id,neighbor_id)
);
CREATE INDEX IF NOT EXISTS semantic_neighbors_target_idx ON semantic_neighbors(neighbor_id,article_id);
ALTER TABLE feed_chunks ADD COLUMN details TEXT NOT NULL DEFAULT '{}';
INSERT OR IGNORE INTO app_state(id,value) VALUES ('semantic_revision',0);
INSERT OR IGNORE INTO readzz_migrations(name,applied_at) VALUES ('0004_semantic_feed',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
