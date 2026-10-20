import importlib.util
import json
from pathlib import Path
import unittest
from urllib.parse import quote

spec = importlib.util.spec_from_file_location("uber_archive", Path(__file__).with_name("backfill-uber.py"))
archive = importlib.util.module_from_spec(spec)
spec.loader.exec_module(archive)


class UberArchiveTests(unittest.TestCase):
    def page(self, rows):
        data = {"relatedPages": {"hasServerLoaded": True, "totalCount": 100, "relatedPages": rows},
                "fallbackRelatedPages": {"relatedPages": [{"title": "Not an engineering article"}]}}
        return '<script type="application/json" id="__LOCAL_REDUX_STATE_Article Feed Store">' + quote(json.dumps(data)) + '</script>'

    def test_exact_metadata_is_used_and_unrelated_featured_or_category_rows_are_excluded(self):
        row = {"title": "Scaling &amp; reliability", "fullURL": "www.uber.com/us/en/blog/scaling/",
               "publishedAt": "2024-01-02T03:00:00Z", "updatedAt": "2026-10-20T00:00:00Z",
               "categoryIDs": [archive.ENGINEERING]}
        rows, total = archive.parse_listing(self.page([row, {**row, "categoryIDs": ["marketing"]}]))
        self.assertEqual(total, 100)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["title"], "Scaling & reliability")
        self.assertEqual(rows[0]["url"], "https://www.uber.com/us/en/blog/scaling/")
        self.assertTrue(rows[0]["published_at"].startswith("2024-01-02"))
        self.assertEqual(rows[0]["summary"], "")

    def test_missing_dates_and_unsafe_origins_are_not_imported(self):
        self.assertEqual(archive.parse_listing(self.page([{"title": "Unknown date", "fullURL": "www.uber.com/us/en/blog/test/", "categoryIDs": [archive.ENGINEERING]}]))[0], [])
        with self.assertRaises(ValueError):
            archive.checked_url("https://www.uber.com.evil.example/article")
        with self.assertRaises(ValueError):
            archive.parse_listing("<html>Publisher challenge</html>")


if __name__ == "__main__":
    unittest.main()
