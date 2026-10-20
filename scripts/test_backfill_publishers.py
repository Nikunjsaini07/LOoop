import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

SPEC = importlib.util.spec_from_file_location("backfill_publishers", Path(__file__).with_name("backfill-publishers.py"))
archive = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(archive)


class PublisherArchiveTests(unittest.TestCase):
    def test_full_feed_preserves_items_beyond_recent_feed_limit(self):
        entries = "".join(f'<entry><title>Post {i}</title><link href="https://shopify.engineering/post-{i}"/><published>2020-01-01T12:00:00Z</published></entry>' for i in range(233))
        items = archive.parse_full_feed(f'<feed xmlns="http://www.w3.org/2005/Atom">{entries}</feed>'.encode(), "https://shopify.engineering/blog.atom")
        self.assertEqual(len(items), 233)
        self.assertTrue(all(item["published_at"] == "2020-01-01T12:00:00+00:00" for item in items))

    def test_feed_rejects_entity_declarations(self):
        with self.assertRaises(ValueError):
            archive.parse_full_feed(b'<!DOCTYPE rss [<!ENTITY secret "bad">]><rss/>', "https://stripe.dev/blog/feed")

    def test_publisher_dates_and_protected_excerpts(self):
        item = archive.wordpress_items([{"link": "https://engineering.fb.com/post/", "title": {"rendered": "Post &amp; title"}, "excerpt": {"protected": True, "rendered": "private excerpt"}, "date_gmt": "2018-01-02T03:04:05"}])[0]
        self.assertEqual(item["published_at"], "2018-01-02T03:04:05+00:00")
        self.assertEqual(item["summary"], "")
        self.assertEqual(item["title"], "Post & title")

    def test_allowlist_blocks_external_and_insecure_requests(self):
        for url in ["http://github.blog/feed", "https://example.com/feed", "https://github.blog:8443/feed", "https://me@github.blog/feed"]:
            with self.subTest(url=url), self.assertRaises(ValueError):
                archive.checked_url(url)

    def test_article_url_filters_github_nonengineering_and_deduplicates(self):
        self.assertIsNone(archive.article_url("https://github.blog/news-insights/post/", "github"))
        self.assertIsNone(archive.article_url("https://external.example/post/", "meta"))
        self.assertEqual(archive.article_url("https://github.blog/engineering/post/?utm_source=feed#more", "github"), "https://github.blog/engineering/post/")

    def test_wordpress_pagination_and_descendants(self):
        class Reader:
            def __init__(self):
                self.urls = []

            def read(self, url):
                self.urls.append(url)
                if "/categories?" in url:
                    rows = [{"id": 72, "parent": 0}, {"id": 100, "parent": 72}, {"id": 101, "parent": 100}, {"id": 22, "parent": 0}]
                    pages = 1
                else:
                    page = int(archive.urlsplit(url).query.split("page=")[-1])
                    rows = [{"link": f"https://github.blog/engineering/post-{page}/", "title": {"rendered": f"Post {page}"}, "date_gmt": "2022-01-01T00:00:00"}]
                    pages = 2
                return json.dumps(rows).encode(), {"headers": {"x-wp-totalpages": str(pages)}}

        reader = Reader()
        result = archive.collect_company("github", reader)
        self.assertEqual(len(result["items"]), 2)
        self.assertEqual(result["report"]["category_ids"], [72, 100, 101])
        self.assertIn("categories=72%2C100%2C101", reader.urls[1])
        self.assertFalse(result["report"]["errors"])

    def test_slash_alias_dedup_preserves_publisher_permalink(self):
        class Reader:
            def read(self, url):
                body = b'<feed><entry><title>First</title><link href="https://shopify.engineering/post/"/></entry><entry><title>Alias</title><link href="https://shopify.engineering/post"/></entry></feed>'
                return body, {}

        result = archive.collect_company("shopify", Reader())
        self.assertEqual(len(result["items"]), 1)
        self.assertEqual(result["items"][0]["url"], "https://shopify.engineering/post/")
        self.assertEqual(result["report"]["duplicates_removed"], 1)

    def test_robots_denial_is_not_fetched(self):
        with tempfile.TemporaryDirectory(dir=archive.ROOT / "outputs") as directory:
            reader = archive.PublicReader(directory)
            calls = []

            def read(url, delay=0.5):
                calls.append(url)
                return b"User-agent: *\nDisallow: /wp-json/", {}

            reader._read = read
            with self.assertRaisesRegex(ValueError, "robots.txt disallows"):
                reader.read("https://slack.engineering/wp-json/wp/v2/posts")
            self.assertEqual(calls, ["https://slack.engineering/robots.txt"])


if __name__ == "__main__":
    unittest.main()
