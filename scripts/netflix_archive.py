"""Recover Netflix's historical post metadata from its public topic RSS feeds.

Medium's main publication RSS contains only ten recent posts. Netflix's robots-
advertised sitemap lists historical topic names; their RSS feeds expose older
posts with publisher-provided titles, authors and publication timestamps. This
collector reads those feeds, caches responses, deduplicates canonical URLs and
writes metadata only. It never substitutes sitemap modification dates for dates
of publication, and it does not access login pages or private APIs.
"""
from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from html import unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import threading
import time
from urllib.parse import quote, urlsplit, urlunsplit
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET


ROOT = Path(__file__).resolve().parents[1]
SITEMAP = "https://netflixtechblog.com/sitemap/sitemap.xml"
USER_AGENT = "EngineeringBlogReader/1.0 (public engineering blog metadata archive)"
CONTENT_NS = "{http://purl.org/rss/1.0/modules/content/}"
DC_NS = "{http://purl.org/dc/elements/1.1/}"


class TextExtractor(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.ignored = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.ignored += 1
        if tag in {"p", "div", "br", "h1", "h2", "h3", "li"}:
            self.parts.append(" ")

    def handle_endtag(self, tag):
        if tag in {"script", "style"}:
            self.ignored = max(0, self.ignored - 1)
        self.parts.append(" ")

    def handle_data(self, data):
        if not self.ignored:
            self.parts.append(data)


def text_content(value, limit=None):
    parser = TextExtractor()
    parser.feed(value or "")
    result = re.sub(r"\s+", " ", unescape("".join(parser.parts))).strip()
    return result[:limit].rstrip() if limit else result


def canonical_url(value):
    parsed = urlsplit(value or "")
    if parsed.scheme != "https" or parsed.hostname != "netflixtechblog.com":
        return None
    if not re.fullmatch(r"/[^/]+-[a-f0-9]{10,16}", parsed.path):
        return None
    return urlunsplit(("https", "netflixtechblog.com", parsed.path, "", ""))


def topic_feed_url(tag):
    return "https://netflixtechblog.com/feed/tagged/" + quote(tag, safe="")


def parse_feed(body, feed_url):
    root = ET.fromstring(body)
    if root.tag != "rss":
        raise ValueError("Expected a public RSS feed")
    posts = []
    for item in root.findall("./channel/item"):
        url = canonical_url(item.findtext("link"))
        title = text_content(item.findtext("title"), 300)
        if not url or not title:
            continue
        published = item.findtext("pubDate")
        if not published:
            raise ValueError("RSS item has no publisher publication date")
        date = parsedate_to_datetime(published)
        if date.tzinfo is None:
            raise ValueError("RSS publication date has no timezone")
        summary = item.findtext("description") or item.findtext(CONTENT_NS + "encoded")
        posts.append({
            "url": url,
            "title": title,
            "summary": text_content(summary, 700),
            "author": text_content(item.findtext(DC_NS + "creator"), 250),
            "published_at": date.astimezone(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "date_basis": "official_rss_pubDate",
            "source_url": feed_url,
        })
    return posts


class PublicReader:
    """Limit request starts to two per second across two fetch workers."""

    def __init__(self):
        self.lock = threading.Lock()
        self.next_request = 0.0

    def read(self, url):
        with self.lock:
            delay = self.next_request - time.monotonic()
            if delay > 0:
                time.sleep(delay)
            self.next_request = time.monotonic() + 0.5
        with urlopen(Request(url, headers={"User-Agent": USER_AGENT}), timeout=25) as response:
            return response.read()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


def collect(output, max_tags=None, target=None):
    reader = PublicReader()
    cache_dir = output.parent / "netflix-feeds"
    cache_dir.mkdir(parents=True, exist_ok=True)
    sitemap_cache = cache_dir / "sitemap.xml"
    if not sitemap_cache.exists():
        sitemap_cache.write_bytes(reader.read(SITEMAP))
    root = ET.fromstring(sitemap_cache.read_bytes())
    tags = list(dict.fromkeys(
        entry.findtext("{*}loc").split("/tagged/", 1)[1]
        for entry in root
        if "/tagged/" in (entry.findtext("{*}loc") or "")
    ))
    selected = tags[:max_tags] if max_tags else tags
    # Preserve the last successful union while a resumed run replays cached
    # topics, so readers never see a smaller interim metadata snapshot.
    previous = json.loads(output.read_text(encoding="utf-8")) if output.exists() else {}
    if previous and previous.get("company_id") != "netflix":
        raise ValueError("Output already contains another company's archive")
    all_items = {item["url"]: item for item in previous.get("items", [])}
    errors = []
    completed = 0

    def load(tag):
        url = topic_feed_url(tag)
        cache = cache_dir / (tag + ".json")
        if cache.exists():
            return json.loads(cache.read_text(encoding="utf-8"))
        try:
            result = {"tag": tag, "url": url, "items": parse_feed(reader.read(url), url)}
            write_json(cache, result)
            return result
        except Exception as error:
            return {"tag": tag, "url": url, "error": str(error)}

    def report():
        return {
            "company_id": "netflix",
            "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z"),
            "discovery_url": SITEMAP,
            "method": "Union of official Netflix topic RSS feeds discovered in its advertised sitemap",
            "total_tags": len(tags),
            "completed_tags": completed,
            "unique_articles": len(all_items),
            "errors": errors,
            "notes": "RSS publication dates can reflect Medium's original migration date for older posts; sitemap lastmod dates are never used as publication dates.",
            "items": sorted(all_items.values(), key=lambda item: (item["published_at"], item["url"]), reverse=True),
        }

    # Process small bounded batches so a target can stop before the whole archive
    # is fetched. Every completed batch persists a resumable metadata snapshot.
    with ThreadPoolExecutor(max_workers=2) as pool:
        for start in range(0, len(selected), 10):
            for result in pool.map(load, selected[start:start + 10]):
                completed += 1
                if result.get("error"):
                    errors.append({"url": result["url"], "error": result["error"]})
                for item in result.get("items", []):
                    all_items.setdefault(item["url"], item)
            write_json(output, report())
            print(json.dumps({"completed_tags": completed, "unique_articles": len(all_items), "errors": len(errors)}), flush=True)
            if target and len(all_items) >= target:
                break
    return report()


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, default=ROOT / "outputs/archive-backfill/netflix.json")
    parser.add_argument("--max-tags", type=int)
    parser.add_argument("--target", type=int, default=400,
                        help="Stop after a batch reaches this many unique articles (default: 400; 0 scans every topic)")
    arguments = parser.parse_args()
    collect(arguments.output, arguments.max_tags, arguments.target)
