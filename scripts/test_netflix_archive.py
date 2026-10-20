"""Contract checks for archive metadata quality without network requests."""
import unittest
import json
from pathlib import Path
from tempfile import TemporaryDirectory

from netflix_archive import canonical_url, collect, parse_feed, topic_feed_url


class NetflixArchiveTests(unittest.TestCase):
    def test_feed_preserves_publisher_title_author_and_publication_date(self):
        source = b'''<?xml version="1.0"?>
        <rss xmlns:dc="http://purl.org/dc/elements/1.1/"
             xmlns:content="http://purl.org/rss/1.0/modules/content/">
          <channel><item>
            <title><![CDATA[Scaling APIs &amp; teams]]></title>
            <link>https://netflixtechblog.com/scaling-apis-abcdef123456?source=rss-tag</link>
            <pubDate>Mon, 09 Nov 2020 08:00:00 -0800</pubDate>
            <dc:creator>Netflix Technology Blog</dc:creator>
            <content:encoded><![CDATA[<p>A real publisher summary.</p><script>ignore()</script>]]></content:encoded>
          </item></channel>
        </rss>'''
        posts = parse_feed(source, "https://netflixtechblog.com/feed/tagged/api")
        self.assertEqual(len(posts), 1)
        self.assertEqual(posts[0]["title"], "Scaling APIs & teams")
        self.assertEqual(posts[0]["url"], "https://netflixtechblog.com/scaling-apis-abcdef123456")
        self.assertEqual(posts[0]["published_at"], "2020-11-09T16:00:00Z")
        self.assertEqual(posts[0]["author"], "Netflix Technology Blog")
        self.assertEqual(posts[0]["summary"], "A real publisher summary.")
        self.assertEqual(posts[0]["date_basis"], "official_rss_pubDate")

    def test_unrelated_links_and_topic_pages_are_not_articles(self):
        for url in (
            "https://netflixtechblog.com/tagged/api",
            "https://netflixtechblog.com/about",
            "https://example.com/scaling-apis-abcdef123456",
            "https://netflixtechblog.com.evil.example/scaling-apis-abcdef123456",
        ):
            self.assertIsNone(canonical_url(url))

    def test_missing_publication_date_fails_instead_of_using_discovery_date(self):
        source = b'''<rss><channel><item><title>API scaling</title>
        <link>https://netflixtechblog.com/scaling-apis-abcdef123456</link>
        </item></channel></rss>'''
        with self.assertRaisesRegex(ValueError, "publication date"):
            parse_feed(source, "https://netflixtechblog.com/feed/tagged/api")

    def test_non_feed_response_fails(self):
        with self.assertRaisesRegex(ValueError, "RSS"):
            parse_feed(b"<html><body>Forbidden</body></html>", "https://netflixtechblog.com/feed")

    def test_unicode_topic_paths_are_percent_encoded_for_http(self):
        self.assertEqual(topic_feed_url("\u30eb\u30d3"), "https://netflixtechblog.com/feed/tagged/%E3%83%AB%E3%83%93")

    def test_resuming_preserves_previous_posts_while_cached_topics_are_replayed(self):
        workspace = Path(__file__).resolve().parents[1]
        with TemporaryDirectory(dir=workspace) as folder:
            self.assertTrue(Path(folder).resolve().is_relative_to(workspace))
            output = Path(folder) / "netflix.json"
            cache = Path(folder) / "netflix-feeds"
            cache.mkdir()
            (cache / "sitemap.xml").write_text('''<urlset><url>
            <loc>https://netflixtechblog.com/tagged/api</loc></url></urlset>''', encoding="utf-8")
            old = {"url": "https://netflixtechblog.com/old-post-abcdef123456", "published_at": "2020-11-09T16:00:00Z"}
            new = {"url": "https://netflixtechblog.com/new-post-abcdef123457", "published_at": "2021-11-09T16:00:00Z"}
            output.write_text(json.dumps({"company_id": "netflix", "items": [old]}), encoding="utf-8")
            (cache / "api.json").write_text(json.dumps({"tag": "api", "items": [new]}), encoding="utf-8")
            result = collect(output, max_tags=1)
            self.assertEqual({item["url"] for item in result["items"]}, {old["url"], new["url"]})


if __name__ == "__main__":
    unittest.main()
