"""Collect Uber's public, paginated engineering index; never changes a database."""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import math
from pathlib import Path
import re
import sys
import time
from urllib.error import HTTPError, URLError
from urllib.parse import unquote, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from urllib.robotparser import RobotFileParser

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent))
from dailyblogs import canonical_url, plain, timestamp

ORIGIN = "https://www.uber.com"
INDEX = ORIGIN + "/us/en/blog/engineering/"
ENGINEERING = "add2dbca-fda9-41d4-9a47-8ca0529aaa88"
USER_AGENT = "DailyEngineeringReader/1.0"
MAX_BYTES = 8 * 1024 * 1024


def checked_url(url):
    value = urlsplit(url)
    if value.scheme != "https" or value.hostname != "www.uber.com" or value.username or value.password or value.port not in (None, 443):
        raise ValueError("Only the official Uber HTTPS archive is allowed")
    return url


class Redirects(HTTPRedirectHandler):
    def redirect_request(self, request, response, code, message, headers, newurl):
        return super().redirect_request(request, response, code, message, headers, checked_url(newurl))


class Reader:
    def __init__(self, cache):
        self.cache = cache
        cache.mkdir(parents=True, exist_ok=True)
        self.robot = None
        self.last_request = 0.0
        self.opener = build_opener(Redirects())

    def read(self, url):
        checked_url(url)
        if self.robot is None and url != ORIGIN + "/robots.txt":
            robot = RobotFileParser()
            robot.parse(self.read(ORIGIN + "/robots.txt").decode("utf-8").splitlines())
            self.robot = robot
        if self.robot and not self.robot.can_fetch(USER_AGENT, url):
            raise ValueError("Publisher robots policy disallows the requested page")
        path = self.cache / (hashlib.sha256(url.encode()).hexdigest() + ".html")
        if path.exists():
            if path.stat().st_size > MAX_BYTES:
                raise ValueError("Cached response is too large")
            return path.read_bytes()
        for attempt in range(3):
            delay = max(0.5, (self.robot.crawl_delay(USER_AGENT) or 0) if self.robot else 0)
            time.sleep(max(0, self.last_request + delay - time.monotonic()))
            self.last_request = time.monotonic()
            try:
                with self.opener.open(Request(url, headers={"User-Agent": USER_AGENT}), timeout=25) as response:
                    checked_url(response.url)
                    body = response.read(MAX_BYTES + 1)
                    if len(body) > MAX_BYTES:
                        raise ValueError("Publisher response exceeds 8 MiB")
                path.write_bytes(body)
                return body
            except HTTPError as error:
                if error.code not in (429, 500, 502, 503, 504) or attempt == 2:
                    raise
                retry = error.headers.get("Retry-After", "")
                if retry.isdigit() and int(retry) > 30:
                    raise
                time.sleep(max(2 ** attempt, int(retry) if retry.isdigit() else 0))
            except (URLError, TimeoutError, ConnectionError):
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)


def parse_listing(html):
    for attrs, body in re.findall(r"<script([^>]*)>(.*?)</script>", html, re.S):
        if 'type="application/json"' not in attrs or "Article Feed Store" not in attrs:
            continue
        data = json.loads(unquote(body.strip()))
        page = data.get("relatedPages", {})
        if not page.get("hasServerLoaded"):
            raise ValueError("The public engineering index did not load")
        articles = []
        for row in page.get("relatedPages", []):
            if ENGINEERING not in row.get("categoryIDs", []):
                continue
            raw = row.get("fullURL", "")
            url = canonical_url(raw if raw.startswith("https://") else "https://" + raw)
            title = plain(row.get("title") or row.get("ogTitle", ""), 300)
            published = timestamp(row.get("publishedAt"))
            if not url or not title or not published:
                continue
            checked_url(url)
            if not re.fullmatch(r"/us/en/blog/[^/]+/", urlsplit(url).path):
                continue
            articles.append({"url": url, "title": title, "summary": "", "author": "",
                             "published_at": published, "date_basis": "publisher_publishedAt"})
        return articles, int(page.get("totalCount", 0))
    raise ValueError("Publisher engineering listing metadata was not found")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--max-pages", type=int, default=100)
    args = parser.parse_args()
    if not 1 <= args.max_pages <= 100:
        parser.error("--max-pages must be between 1 and 100")
    out = ROOT / "outputs/archive-backfill"
    out.mkdir(parents=True, exist_ok=True)
    reader = Reader(out / "uber-cache")
    articles, errors, publisher_total = {}, [], 0
    page_number, pages, consecutive_errors = 1, 1, 0
    while page_number <= min(args.max_pages, pages):
        url = INDEX if page_number == 1 else INDEX + f"page/{page_number}/"
        try:
            rows, publisher_total = parse_listing(reader.read(url).decode("utf-8"))
            if page_number == 1:
                pages = math.ceil(publisher_total / len(rows)) if rows else 1
            previous = len(articles)
            articles.update({row["url"]: row for row in rows})
            if rows and len(articles) == previous:
                raise ValueError("Archive pagination repeated an earlier page")
            consecutive_errors = 0
        except Exception as error:
            errors.append({"page": page_number, "error": str(error)})
            consecutive_errors += 1
        payload = {"company_id": "uber", "items": list(articles.values()), "report": {
            "source": INDEX, "publisher_total": publisher_total, "pages_checked": page_number,
            "pages_available": pages, "unique_articles": len(articles), "errors": errors,
            "collected_at": datetime.now(timezone.utc).isoformat(timespec="seconds")}}
        temporary = out / "uber.tmp"
        temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
        temporary.replace(out / "uber.json")
        if page_number % 10 == 0 or page_number == pages or consecutive_errors >= 3:
            print(json.dumps({key: value for key, value in payload["report"].items() if key != "errors"} | {"errors": len(errors)}), flush=True)
        if consecutive_errors >= 3:
            break
        page_number += 1
    if not articles:
        raise RuntimeError("No engineering article metadata was collected")


if __name__ == "__main__":
    main()
