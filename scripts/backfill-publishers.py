"""Collect public historical publisher metadata without changing the database.

WordPress archives are paginated rather than limited to a publisher's current
RSS window. Large RSS/Atom archives are parsed in batches through dailyblogs'
shared parser. Run again to resume from the bounded raw response cache.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
from http.client import HTTPException
import json
from pathlib import Path
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit, urlunsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from urllib.robotparser import RobotFileParser
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent))
from dailyblogs import canonical_url, parse_feed, plain, tag_name, timestamp

USER_AGENT = "DailyEngineeringReader/1.0"
MAX_BYTES = 20 * 1024 * 1024
MAX_PAGES = 200
SOURCES = {
    "meta": {"host": "engineering.fb.com", "kind": "wordpress"},
    "github": {"host": "github.blog", "kind": "wordpress", "category": 72},
    "slack": {"host": "slack.engineering", "kind": "wordpress"},
    "shopify": {"host": "shopify.engineering", "kind": "feed", "path": "/blog.atom"},
    "stripe": {"host": "stripe.dev", "kind": "feed", "path": "/blog/feed"},
}
ALLOWED_HOSTS = frozenset(source["host"] for source in SOURCES.values())


def checked_url(url):
    parts = urlsplit(url)
    if (parts.scheme != "https" or parts.hostname not in ALLOWED_HOSTS
            or parts.username or parts.password or parts.port not in (None, 443)):
        raise ValueError("URL is outside the fixed HTTPS publisher allowlist")
    return url


class SafeRedirects(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, newurl):
        checked_url(newurl)
        return super().redirect_request(request, response, code, message, headers, newurl)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_suffix(path.suffix + ".tmp")
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    temporary.replace(path)


class PublicReader:
    """Check robots, constrain responses, and pace all network requests."""

    def __init__(self, cache):
        self.cache = Path(cache)
        self.cache.mkdir(parents=True, exist_ok=True)
        self.opener = build_opener(SafeRedirects())
        self.robots = {}
        self.next_request = 0.0
        self.last_request = 0.0
        self.requests = 0
        self.cache_hits = 0

    def _read(self, url, delay=0.5):
        checked_url(url)
        key = hashlib.sha256(url.encode()).hexdigest()
        body_path = self.cache / (key + ".body")
        info_path = self.cache / (key + ".json")
        if body_path.exists() and info_path.exists():
            if body_path.stat().st_size > MAX_BYTES:
                raise ValueError("Cached response exceeds 20 MiB")
            info = json.loads(info_path.read_text(encoding="utf-8"))
            if info.get("url") != url:
                raise ValueError("Cached response URL does not match request")
            checked_url(info["final_url"])
            self.cache_hits += 1
            return body_path.read_bytes(), info
        request = Request(url, headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json, application/atom+xml, application/rss+xml, text/plain;q=0.8",
        })
        for attempt in range(3):
            wait = self.next_request - time.monotonic()
            if wait > 0:
                time.sleep(wait)
            self.last_request = time.monotonic()
            self.next_request = self.last_request + max(0.5, delay)
            self.requests += 1
            try:
                with self.opener.open(request, timeout=30) as response:
                    checked_url(response.url)
                    length = response.headers.get("Content-Length")
                    if length and int(length) > MAX_BYTES:
                        raise ValueError("Response exceeds 20 MiB")
                    body = response.read(MAX_BYTES + 1)
                    if len(body) > MAX_BYTES:
                        raise ValueError("Response exceeds 20 MiB")
                    info = {
                        "url": url, "final_url": response.url,
                        "headers": {key.lower(): value for key, value in response.headers.items()},
                        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
                    }
                break
            except HTTPError as error:
                if attempt == 2 or error.code not in (429, 500, 502, 503, 504):
                    raise
                retry_after = error.headers.get("Retry-After", "")
                if retry_after.isdigit() and int(retry_after) > 30:
                    raise
                time.sleep(max(2 ** attempt, int(retry_after) if retry_after.isdigit() else 0))
            except (URLError, HTTPException, TimeoutError, ConnectionError):
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)
        temporary = body_path.with_suffix(".tmp")
        temporary.write_bytes(body)
        temporary.replace(body_path)
        write_json(info_path, info)
        return body, info

    def read(self, url):
        checked_url(url)
        parts = urlsplit(url)
        host = parts.hostname
        if host not in self.robots:
            robots_url = urlunsplit(("https", host, "/robots.txt", "", ""))
            robot = RobotFileParser(robots_url)
            try:
                body, _ = self._read(robots_url)
                robot.parse(body.decode("utf-8", "replace").splitlines())
            except HTTPError as error:
                if error.code != 404:
                    raise ValueError(f"Cannot verify robots.txt: HTTP {error.code}") from error
                robot.parse(["User-agent: *", "Disallow:"])
            self.robots[host] = robot
        robot = self.robots[host]
        if not robot.can_fetch(USER_AGENT, url):
            raise ValueError("Publisher robots.txt disallows this archive URL")
        delay = max(0.5, robot.crawl_delay(USER_AGENT) or robot.crawl_delay("*") or 0)
        # Robots can require a longer pause than the default interval.
        self.next_request = max(self.next_request, self.last_request + delay)
        return self._read(url, delay)


def article_url(value, company):
    url = canonical_url(value)
    if not url:
        return None
    parts = urlsplit(url)
    source = SOURCES[company]
    if parts.scheme != "https" or parts.hostname != source["host"] or parts.port not in (None, 443):
        return None
    if company == "github" and not parts.path.startswith("/engineering/"):
        return None
    if parts.path in ("", "/", "/engineering/"):
        return None
    # Preserve publisher canonical trailing slashes so existing article IDs and
    # interactions continue to resolve. Deduplication treats slash aliases as
    # equivalent without rewriting the permalink stored in the result.
    return urlunsplit(("https", parts.hostname, parts.path, "", ""))


def parse_full_feed(body, base):
    class NoDoctype(ET.TreeBuilder):
        def doctype(self, name, pubid, system):
            raise ValueError("DTD/entity declarations are not accepted")

    root = ET.fromstring(body, parser=ET.XMLParser(target=NoDoctype()))
    if tag_name(root) not in ("rss", "feed", "rdf"):
        raise ValueError("Response is not an RSS or Atom feed")
    entries = [node for node in root.iter() if tag_name(node) in ("item", "entry")]
    items = []
    for offset in range(0, len(entries), 100):
        batch = ET.Element(root.tag)
        batch.extend(entries[offset:offset + 100])
        items.extend(parse_feed(ET.tostring(batch, encoding="utf-8"), base))
    return items


def wordpress_items(rows):
    items = []
    for row in rows:
        title = plain(row.get("title", {}).get("rendered", ""), 300)
        if not title or not row.get("link"):
            continue
        excerpt = row.get("excerpt") or {}
        published = timestamp(row.get("date_gmt"))
        items.append({
            "url": row["link"], "title": title,
            "summary": "" if excerpt.get("protected") else plain(excerpt.get("rendered", "")),
            "author": "", "published_at": published,
            "date_basis": "published" if published else "discovered",
        })
    return items


def paginated_json(reader, host, resource, parameters, report):
    rows = []
    for page in range(1, MAX_PAGES + 1):
        query = {**parameters, "per_page": 100, "page": page}
        url = f"https://{host}/wp-json/wp/v2/{resource}?{urlencode(query)}"
        body, info = reader.read(url)
        batch = json.loads(body)
        if not isinstance(batch, list):
            raise ValueError("Publisher did not return a WordPress archive list")
        report["archive_urls"].append(url)
        rows.extend(batch)
        headers = info.get("headers", {})
        total_pages = int(headers.get("x-wp-totalpages", 0))
        if page == 1 and resource == "posts":
            report["publisher_reported_posts"] = int(headers.get("x-wp-total", len(batch)))
        if not batch or (total_pages and page >= total_pages) or (not total_pages and len(batch) < 100):
            return rows
    raise ValueError(f"Archive exceeds the {MAX_PAGES}-page collection bound")


def collect_company(company, reader):
    source = SOURCES[company]
    report = {"archive_urls": [], "errors": [], "skipped_urls": 0}
    items = []
    try:
        if source["kind"] == "feed":
            url = f"https://{source['host']}{source['path']}"
            body, _ = reader.read(url)
            report["archive_urls"].append(url)
            items = parse_full_feed(body, url)
        else:
            parameters = {"_fields": "link,title,excerpt,date_gmt"}
            if source.get("category"):
                categories = paginated_json(reader, source["host"], "categories", {"_fields": "id,parent"}, report)
                selected = {source["category"]}
                while True:
                    descendants = {row["id"] for row in categories if row.get("parent") in selected}
                    previous = len(selected)
                    selected.update(descendants)
                    if len(selected) == previous:
                        break
                parameters["categories"] = ",".join(str(category) for category in sorted(selected))
                report["category_ids"] = sorted(selected)
            rows = paginated_json(reader, source["host"], "posts", parameters, report)
            items = wordpress_items(rows)
    except Exception as error:
        report["errors"].append(f"{type(error).__name__}: {error}")
    unique = {}
    for item in items:
        url = article_url(item.get("url", ""), company)
        if not url:
            report["skipped_urls"] += 1
            continue
        item["url"] = url
        key = url.rstrip("/")
        if key not in unique:
            unique[key] = item
    result = sorted(unique.values(), key=lambda item: (item.get("published_at") or "", item["url"]), reverse=True)
    report.update({
        "fetched_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "items": len(result), "duplicates_removed": len(items) - report["skipped_urls"] - len(result),
        "dated_items": sum(bool(item.get("published_at")) for item in result),
        "oldest_publication": min((item["published_at"] for item in result if item.get("published_at")), default=None),
        "newest_publication": max((item["published_at"] for item in result if item.get("published_at")), default=None),
    })
    return {"company_id": company, "items": result, "report": report}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--companies", nargs="+", choices=sorted(SOURCES), default=list(SOURCES))
    parser.add_argument("--output-dir", type=Path, default=ROOT / "outputs" / "archive-backfill")
    parser.add_argument("--cache-dir", type=Path, default=ROOT / "outputs" / "archive-backfill" / "raw")
    arguments = parser.parse_args()
    reader = PublicReader(arguments.cache_dir)
    failures = False
    for company in arguments.companies:
        result = collect_company(company, reader)
        write_json(arguments.output_dir / f"{company}.json", result)
        report = result["report"]
        print(json.dumps({"company_id": company, "items": report["items"], "oldest_publication": report["oldest_publication"], "errors": report["errors"]}), flush=True)
        failures |= bool(report["errors"])
    print(json.dumps({"network_requests": reader.requests, "cache_hits": reader.cache_hits}), flush=True)
    return int(failures)


if __name__ == "__main__":
    raise SystemExit(main())
