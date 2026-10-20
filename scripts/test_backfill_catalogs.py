import importlib.util
from pathlib import Path
import unittest
from urllib.request import Request
from urllib.robotparser import RobotFileParser

spec = importlib.util.spec_from_file_location("backfill_catalogs", Path(__file__).with_name("backfill-catalogs.py"))
catalogs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(catalogs)


class CatalogTests(unittest.TestCase):
    def test_publisher_dates_do_not_use_modified_or_cms_creation_time(self):
        self.assertEqual(catalogs.visible_date("SEPT. 8, 2024"), "2024-09-08")
        self.assertIsNone(catalogs.visible_date("Recently updated"))
        self.assertIsNone(catalogs.item("https://dropbox.tech/post", "Title")["published_at"])

    def test_apple_uses_explicit_published_field_and_bounded_excerpt(self):
        body = b'<script id="__NEXT_DATA__">{"props":{"pageProps":{"posts":[{"slug":"real-post","title":"<p>Research &amp; systems</p>","body":"Public summary","published":"2020-01-02","updated":"2026-10-20"}]}}}</script>'
        row = catalogs.apple_items(body)[0]
        self.assertEqual(row["published_at"], "2020-01-02T00:00:00+00:00")
        self.assertEqual(row["title"], "Research & systems")
        self.assertEqual(row["url"], "https://machinelearning.apple.com/research/real-post")

    def test_google_reads_only_result_cards_and_publisher_dates(self):
        body = b'<li class="search-result"><p class="search-result__eyebrow">OCT. 7, 2026 / AI</p><h3 class="search-result__title"><a href="/real-post/">Real title</a></h3><p class="search-result__summary">An excerpt</p></li><a href="/search/?page=3">Next page</a>'
        rows = catalogs.google_items(body)
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["published_at"], "2026-10-07T00:00:00+00:00")

    def test_fixed_domain_and_noncredential_https_urls(self):
        for url in ("http://dropbox.tech/", "https://evil.example/", "https://user:pass@dropbox.tech/", "https://dropbox.tech:8443/"):
            with self.assertRaises(ValueError):
                catalogs.checked_url(url)

    def test_redirects_cannot_enter_disallowed_paths_or_other_publishers(self):
        robot = RobotFileParser()
        robot.parse(["User-agent: *", "Disallow: /api/"])
        redirects = catalogs.SafeRedirects({"engineering.atspotify.com": (robot, 0.5)})
        request = Request("https://engineering.atspotify.com/category/data")
        for target in ("https://engineering.atspotify.com/api/posts", "https://dropbox.tech/all-stories"):
            with self.assertRaises(ValueError):
                redirects.redirect_request(request, None, 302, "Found", {}, target)


if __name__ == "__main__":
    unittest.main()
