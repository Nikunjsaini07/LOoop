-- A graph edge is valid only for the exact indexing generation of both ends.
ALTER TABLE semantic_topics ADD COLUMN generation TEXT NOT NULL DEFAULT '';
ALTER TABLE semantic_neighbors ADD COLUMN generation TEXT NOT NULL DEFAULT '';
INSERT OR IGNORE INTO readzz_migrations(name,applied_at) VALUES ('0005_semantic_generation',strftime('%Y-%m-%dT%H:%M:%fZ','now'));
