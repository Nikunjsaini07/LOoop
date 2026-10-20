import importlib.util
from pathlib import Path
import sqlite3
import unittest

spec = importlib.util.spec_from_file_location("archive_merge", Path(__file__).with_name("merge-archives.py"))
archive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive)


class ArchiveMergeTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.execute("CREATE TABLE articles(id TEXT PRIMARY KEY,company_id TEXT,url TEXT UNIQUE,title TEXT,summary TEXT,author TEXT,published_at TEXT,discovered_at TEXT,last_seen_at TEXT,source_kind TEXT)")
        self.item = {"company_id": "meta", "url": "https://engineering.fb.com/2020/post", "title": "A real title", "summary": "", "author": "", "published_at": "2020-01-01T00:00:00+00:00"}

    def tearDown(self):
        self.db.close()

    def test_slash_alias_reimport_retains_identity_excerpt_date_and_first_discovery(self):
        self.db.execute("INSERT INTO articles VALUES(?,?,?,?,?,?,?,?,?,?)", ("original-id", "meta", self.item["url"] + "/", "Old title", "Original excerpt", "Original author", "2019-01-01T00:00:00Z", "2026-10-18T00:00:00Z", "2026-10-18T00:00:00Z", "feed"))
        incoming = {archive.alias(self.item["url"]): self.item}
        archive.merge(self.db, incoming)
        result = archive.merge(self.db, incoming)
        row = self.db.execute("SELECT id,url,summary,published_at,discovered_at,source_kind FROM articles").fetchone()
        self.assertEqual(row, ("original-id", self.item["url"] + "/", "Original excerpt", "2019-01-01T00:00:00Z", "2026-10-18T00:00:00Z", "feed"))
        self.assertEqual(result["meta"]["added"], 0)

    def test_app_existing_url_and_id_win_for_a_new_collector_entry(self):
        existing = [("app-id", "meta", self.item["url"] + "/")]
        archive.merge(self.db, {archive.alias(self.item["url"]): self.item}, existing)
        self.assertEqual(self.db.execute("SELECT id,url FROM articles").fetchone(), ("app-id", self.item["url"] + "/"))
        with self.assertRaises(ValueError):
            archive.merge(self.db, {archive.alias(self.item["url"]): {**self.item, "company_id": "other"}})

    def test_medium_rss_source_parameters_do_not_inflate_archive_counts(self):
        base = "https://netflixtechblog.com/a-real-post-abcdef123456"
        self.assertEqual(archive.alias(base + "?source=rss-old"), archive.alias(base))
        self.assertNotEqual(archive.alias("https://example.com/post?source=a"), archive.alias("https://example.com/post?source=b"))


if __name__ == "__main__":
    unittest.main()
