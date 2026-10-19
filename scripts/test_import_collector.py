"""Exercise import SQL against actual SQLite constraints without Worker mocks."""
import importlib.util
from pathlib import Path
import sqlite3
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("collector_import", ROOT / "scripts/import-collector.py")
collector = importlib.util.module_from_spec(spec)
spec.loader.exec_module(collector)


class CollectorImportTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.executescript((ROOT / "drizzle/0000_glamorous_richard_fisk.sql").read_text())
        self.article = dict(id="source-id", company_id="example", title="Reader's database", summary="An author's excerpt",
                            url="https://publisher.example/post?value=it's", topics=["Data"],
                            published_at="2026-10-10T00:00:00+00:00", discovered_at="2026-10-18T09:00:00+00:00")

    def tearDown(self):
        self.db.close()

    def test_repeat_import_preserves_profiles_existing_ids_extra_rows_and_earliest_discovery(self):
        self.db.execute("INSERT INTO profiles VALUES (?,?,?,?)", ("reader", '{"bookmarks":["stored-id"]}', 7, "2026-10-19T00:00:00Z"))
        self.db.execute("INSERT INTO articles VALUES (?,?,?,?,?,?,?,?,?)", ("stored-id", "example", "Example", "Old title", self.article["url"], "Old excerpt", None, "2026-10-17T00:00:00Z", "[]"))
        self.db.execute("INSERT INTO articles VALUES (?,?,?,?,?,?,?,?,?)", ("extra", "other", "Other", "Extra live article", "https://publisher.example/extra", "", None, "2026-10-19T00:00:00Z", "[]"))
        sql = collector.export_sql([self.article], [], {"example": "Example"})
        self.db.executescript(sql)
        self.db.executescript(sql)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM articles").fetchone()[0], 2)
        self.assertEqual(self.db.execute("SELECT id,title,summary,discovered_at FROM articles WHERE url=?", (self.article["url"],)).fetchone(),
                         ("stored-id", self.article["title"], self.article["summary"], "2026-10-17T00:00:00Z"))
        self.assertEqual(self.db.execute("SELECT * FROM profiles").fetchone(), ("reader", '{"bookmarks":["stored-id"]}', 7, "2026-10-19T00:00:00Z"))
        older = {**self.article, "discovered_at": "2026-10-16T00:00:00+00:00"}
        self.db.executescript(collector.export_sql([older], [], {"example": "Example"}))
        self.assertEqual(self.db.execute("SELECT discovered_at FROM articles WHERE id='stored-id'").fetchone()[0], "2026-10-16T00:00:00.000Z")

    def test_older_collector_health_cannot_overwrite_newer_live_refresh(self):
        self.db.execute("INSERT INTO source_refresh VALUES (?,?,?,?,?,?)", ("example", "2026-10-19T00:00:00Z", "2026-10-19T00:00:00Z", "new-etag", None, None))
        status = dict(company_id="example", attempted_at="2026-10-18T00:00:00+00:00", succeeded_at="2026-10-18T00:00:00+00:00",
                      etag="old-etag", last_modified=None, error="old error")
        self.db.executescript(collector.export_sql([], [status], {"example": "Example"}))
        self.assertEqual(self.db.execute("SELECT last_attempt,last_success,etag,error FROM source_refresh").fetchone(),
                         ("2026-10-19T00:00:00Z", "2026-10-19T00:00:00Z", "new-etag", None))


if __name__ == "__main__":
    unittest.main()
