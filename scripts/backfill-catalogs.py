"""Collect historical metadata from fixed official public company catalogs.

This writes resumable public JSON under outputs/archive-backfill only. It does
not alter SQLite, D1, source health, profiles or engagement.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
from html import unescape
import json
from pathlib import Path
import re
import sys
import time
from urllib.error import HTTPError
from urllib.parse import urljoin, urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener
from urllib.robotparser import RobotFileParser

ROOT = Path(__file__).resolve().parents[1]
COLLECTOR_ROOT = ROOT.parent if (ROOT.parent / "dailyblogs.py").is_file() else ROOT / "collector"
sys.path.insert(0, str(COLLECTOR_ROOT))
from dailyblogs import canonical_url, plain, timestamp

AGENT = "DailyEngineeringReader/1.0"
HOSTS = {
    "apple": "machinelearning.apple.com",
    "dropbox": "dropbox.tech",
    "google": "developers.googleblog.com",
    "microsoft": "devblogs.microsoft.com",
    "spotify": "engineering.atspotify.com",
}
MAX_BYTES = 12 * 1024 * 1024


def checked_url(url):
    p = urlsplit(url)
    if (p.scheme != "https" or p.hostname not in HOSTS.values() or p.username
            or p.password or p.port not in (None, 443)):
        raise ValueError("URL is outside the fixed official HTTPS publisher allowlist")
    return url


class SafeRedirects(HTTPRedirectHandler):
    def __init__(self, robots):
        super().__init__()
        self.robots = robots

    def redirect_request(self, request, response, code, message, headers, newurl):
        checked_url(newurl)
        host = urlsplit(newurl).hostname
        if host != urlsplit(request.full_url).hostname:
            raise ValueError("Cross-publisher redirects are not allowed")
        if host in self.robots and not self.robots[host][0].can_fetch(AGENT, newurl):
            raise ValueError("Publisher robots.txt disallows the redirect target")
        return super().redirect_request(request, response, code, message, headers, newurl)


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)


class PublicReader:
    def __init__(self, output):
        self.cache = output / "catalog-cache"
        self.cache.mkdir(parents=True, exist_ok=True)
        self.robots = {}
        self.opener = build_opener(SafeRedirects(self.robots))
        self.last = {}
        self.requests = self.cache_hits = 0
        # Reuse the successful public research responses, without trusting error pages.
        probes = ROOT / "outputs/archive-probe"
        self.probes = {}
        for path in probes.glob("*.json"):
            try:
                info = json.loads(path.read_text(encoding="utf-8"))
                body = path.with_suffix(".body")
                if isinstance(info, dict) and info.get("status") == 200 and body.is_file():
                    self.probes[info["url"]] = (body, info)
            except (ValueError, KeyError):
                pass

    def _read(self, url, delay=0.5):
        checked_url(url)
        key = hashlib.sha256(url.encode()).hexdigest()
        body_path, info_path = self.cache / (key + ".body"), self.cache / (key + ".json")
        if body_path.is_file() and info_path.is_file():
            info = json.loads(info_path.read_text(encoding="utf-8"))
            if info.get("url") != url or body_path.stat().st_size > MAX_BYTES:
                raise ValueError("Invalid public response cache")
            checked_url(info["final_url"])
            self.cache_hits += 1
            return body_path.read_bytes(), info
        if url in self.probes:
            path, old = self.probes[url]
            body = path.read_bytes()
            checked_url(old["final"])
            info = {"url": url, "final_url": old["final"], "headers": {k.lower(): v for k, v in old.get("headers", {}).items()}, "from_probe": True}
            body_path.write_bytes(body)
            write_json(info_path, info)
            self.cache_hits += 1
            return body, info
        host = urlsplit(url).hostname
        remaining = self.last.get(host, 0) + delay - time.monotonic()
        if remaining > 0:
            time.sleep(remaining)
        self.last[host] = time.monotonic()
        request = Request(url, headers={"User-Agent": AGENT, "Accept": "text/html, application/json, application/xml;q=0.8"})
        for attempt in range(3):
            self.requests += 1
            try:
                with self.opener.open(request, timeout=30) as response:
                    checked_url(response.url)
                    body = response.read(MAX_BYTES + 1)
                    if len(body) > MAX_BYTES:
                        raise ValueError("Public response exceeds 12 MiB")
                    info = {"url": url, "final_url": response.url, "headers": {k.lower(): v for k, v in response.headers.items()}, "fetched_at": datetime.now(timezone.utc).isoformat()}
                break
            except OSError as error:
                if attempt == 2 or (isinstance(error, HTTPError) and error.code not in (429, 500, 502, 503, 504)):
                    raise
                time.sleep(max(delay, 2 ** (attempt + 1)))
                self.last[host] = time.monotonic()
        body_path.write_bytes(body)
        write_json(info_path, info)
        return body, info

    def read(self, url):
        checked_url(url)
        host = urlsplit(url).hostname
        if host not in self.robots:
            robot = RobotFileParser("https://" + host + "/robots.txt")
            try:
                body, _ = self._read(robot.url)
                lines = body.decode("utf-8", "replace").splitlines()
            except HTTPError as error:
                if error.code != 404:
                    raise ValueError(f"Cannot verify robots.txt: HTTP {error.code}") from error
                lines = ["User-agent: *", "Disallow:"]
            robot.parse(lines)
            # Some publishers put crawl-delay before User-agent; honor it too.
            delay = max([float(m.group(1)) for line in lines if (m := re.match(r"\s*Crawl-delay:\s*([0-9.]+)", line, re.I))] + [0.5])
            self.robots[host] = robot, delay
        robot, delay = self.robots[host]
        if not robot.can_fetch(AGENT, url):
            raise ValueError("Publisher robots.txt disallows this URL")
        return self._read(url, max(delay, robot.crawl_delay(AGENT) or robot.crawl_delay("*") or 0))


def item(url, title, summary="", published=None, author=""):
    date = timestamp(published)
    return {"url": url, "title": plain(title, 300), "summary": plain(summary), "author": plain(author, 150), "published_at": date, "date_basis": "published" if date else "discovered"}


def visible_date(value):
    value = plain(value).strip().replace(".", "")
    # Django uses SEPT. and full month names alongside abbreviated names.
    value = re.sub(r"\bSEPT\b", "SEP", value, flags=re.I)
    for pattern in ("%b %d, %Y", "%B %d, %Y"):
        try:
            return datetime.strptime(value, pattern).date().isoformat()
        except ValueError:
            pass
    return None


def apple_items(body):
    match = re.search(r'<script\b[^>]*id="__NEXT_DATA__"[^>]*>(.*?)</script>', body.decode("utf-8"), re.S)
    if not match:
        raise ValueError("Apple public research catalog metadata was not found")
    posts = json.loads(match.group(1))["props"]["pageProps"]["posts"]
    return [item("https://machinelearning.apple.com/research/" + x["slug"], x["title"], x.get("description") or x.get("body") or "", x.get("published"), x.get("authorsOrdered") or "") for x in posts]


def dropbox_items(body):
    result = []
    for li in re.findall(r'<li\b[^>]*class="[^"]*dr-article-section__list-item[^\"]*"[^>]*>(.*?)</li>', body.decode("utf-8"), re.S):
        link = re.search(r'<a\b[^>]*href="([^"]+)"[^>]*data-element-id="article-link"', li)
        title = re.search(r'<span[^>]*data-element-id="article-title"[^>]*>(.*?)</span>', li, re.S)
        date = re.search(r'<span[^>]*data-element-id="article-date"[^>]*>(.*?)</span>', li, re.S)
        if link and title:
            result.append(item(unescape(link.group(1)), title.group(1), published=visible_date(date.group(1)) if date else None))
    return result


def google_items(body):
    result = []
    for li in re.findall(r'<li class="search-result">(.*?)</li>', body.decode("utf-8"), re.S):
        link = re.search(r'<h3\b[^>]*>\s*<a href="([^"]+)">(.*?)</a>', li, re.S)
        date = re.search(r'<p class="search-result__eyebrow">(.*?)</p>', li, re.S)
        summary = re.search(r'<p class="search-result__summary">(.*?)</p>', li, re.S)
        if link:
            result.append(item(urljoin("https://developers.googleblog.com", unescape(link.group(1))), link.group(2), summary.group(1) if summary else "", visible_date(date.group(1).split(" / ")[0]) if date else None))
    return result


def spotify_items(body):
    text = body.decode("utf-8")
    result = []
    for card in re.split(r'<div class="(?:post-card|sticky-post)">', text)[1:]:
        link = re.search(r'<a href="(/\d{4}/\d{1,2}/[^"?#]+)"', card)
        title = re.search(r'<h4 class="(?:post-card|sticky-post)__title">(.*?)</h4>', card, re.S)
        date = re.search(r'<div class="(?:post-card|sticky-post)__date">(.*?)</div>', card, re.S)
        summary = re.search(r'<div class="(?:post-card|sticky-post)__description">(.*?)</div>', card, re.S)
        if link and title:
            result.append(item("https://engineering.atspotify.com" + unescape(link.group(1)), title.group(1), summary.group(1) if summary else "", visible_date(date.group(1)) if date else None))
    categories = sorted(set(re.findall(r'href="(/category/[a-z0-9-]+)"', text)))
    return result, categories


def collect(company, reader, maximum=2000):
    items, urls, errors = [], [], []
    report = {"archive_urls": urls, "errors": errors, "complete": False}
    def read(url):
        urls.append(url)
        return reader.read(url)
    try:
        if company == "apple":
            body, _ = read("https://machinelearning.apple.com/research/")
            items = apple_items(body)
            report.update(complete=True, scope="Apple Machine Learning Research publication papers; complete public catalog")
        elif company == "dropbox":
            body, _ = read("https://dropbox.tech/all-stories")
            items = dropbox_items(body)
            report.update(complete=True, scope="All stories exposed by the official Dropbox Tech listing")
        elif company == "microsoft":
            for page in range(1, 21):
                url = f"https://devblogs.microsoft.com/engineering-at-microsoft/wp-json/wp/v2/posts?per_page=100&page={page}&_fields=id,date_gmt,link,title,excerpt"
                body, info = read(url)
                rows = json.loads(body)
                if not isinstance(rows, list):
                    raise ValueError("Microsoft archive did not return a post list")
                items.extend(item(x["link"], x.get("title", {}).get("rendered", ""), "" if x.get("excerpt", {}).get("protected") else x.get("excerpt", {}).get("rendered", ""), x.get("date_gmt")) for x in rows)
                pages = int(info["headers"].get("x-wp-totalpages", 1))
                report["publisher_reported_posts"] = int(info["headers"].get("x-wp-total", len(rows)))
                if page >= pages or len(rows) < 100:
                    report["complete"] = True
                    break
                if len(items) >= maximum:
                    break
            report["scope"] = "Engineering@Microsoft publication; other Microsoft publications are separate sources"
        elif company == "google":
            seen = set()
            for page in range(1, min(200, (maximum + 9) // 10) + 1):
                url = f"https://developers.googleblog.com/search/?page={page}"
                body, _ = read(url)
                batch = google_items(body)
                signature = tuple(x["url"] for x in batch)
                if not batch or signature in seen:
                    raise ValueError("Google archive stopped or repeated before its advertised final page")
                seen.add(signature)
                items.extend(batch)
                text = body.decode("utf-8")
                total = re.search(r'class="total-results[^\"]*">\s*(\d+)', text)
                if total:
                    report["publisher_reported_posts"] = int(total.group(1))
                if f"/search/?page={page + 1}" not in text:
                    report["complete"] = True
                    break
                if len(items) >= maximum:
                    break
                if page % 10 == 0:
                    print(f"google: {len(items)} historical metadata records collected", file=sys.stderr, flush=True)
            report["scope"] = "Google Developers Blog official paginated search archive"
        elif company == "spotify":
            queue, visited = ["/"], set()
            while queue and len(visited) < 40 and len(items) < maximum:
                path = queue.pop(0)
                if path in visited:
                    continue
                visited.add(path)
                body, _ = read("https://engineering.atspotify.com" + path)
                batch, categories = spotify_items(body)
                items.extend(batch)
                queue.extend(x for x in categories if x not in visited and x not in queue)
            report.update(scope="Initial public home/category listing cards; API and Next internals are disallowed by robots.txt", category_pages=len(visited), complete=False)
    except Exception as error:
        errors.append(f"{type(error).__name__}: {error}")
    unique = {}
    for entry in items:
        url = canonical_url(entry["url"])
        if not url or urlsplit(url).hostname != HOSTS[company] or not entry["title"]:
            continue
        # Keep publisher slash style; the merge step reconciles existing URLs.
        entry["url"] = url
        unique[url] = entry
    items = list(unique.values())
    if company not in ("apple", "dropbox"):
        items = items[:maximum]
    dates = [x["published_at"] for x in items if x["published_at"]]
    report.update(articles=len(items), oldest_published=min(dates, default=None), newest_published=max(dates, default=None), network_requests=reader.requests, cache_hits=reader.cache_hits)
    return {"company_id": company, "items": items, "report": report}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--company", default=",".join(HOSTS), help="Comma-separated fixed company IDs")
    parser.add_argument("--max-posts", type=int, default=2000)
    parser.add_argument("--output", type=Path, default=ROOT / "outputs/archive-backfill")
    args = parser.parse_args()
    companies = args.company.split(",")
    if not 1 <= args.max_posts <= 2000 or any(x not in HOSTS for x in companies):
        parser.error("Choose supported company IDs and max-posts between 1 and 2000")
    reader = PublicReader(args.output)
    failed = False
    for company in companies:
        result = collect(company, reader, args.max_posts)
        write_json(args.output / (company + ".json"), result)
        print(json.dumps({"company": company, **result["report"]}), flush=True)
        failed |= bool(result["report"]["errors"])
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
