"""Prepare verified Linear, PlanetScale and PostHog source metadata for readzz.

Reads the official feeds, updates the collector/seed catalogs, and writes a
reviewable additive SQL bundle. SQL application and Worker deployment are separate.
"""
from __future__ import annotations
import hashlib
import importlib.util
import json
from pathlib import Path
import sqlite3
import sys
from datetime import datetime, timezone
from urllib.request import Request, urlopen
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
COLLECTOR_ROOT = ROOT.parent if (ROOT.parent / "dailyblogs.py").is_file() else ROOT / "collector"
sys.path.insert(0, str(COLLECTOR_ROOT))
from dailyblogs import parse_feed, tag_name, opml, initialize, connect

PUBLISHERS = [
    {"id": "linear", "company": "Linear", "blog_url": "https://linear.app/now", "feed_urls": ["https://linear.app/rss/now.xml"],
     "notes": "Official Linear Now publication: engineering, product design, and how Linear is built.", "icon": "https://linear.app/favicon.ico?v=2"},
    {"id": "planetscale", "company": "PlanetScale", "blog_url": "https://planetscale.com/blog", "feed_urls": ["https://planetscale.com/blog/feed.atom"],
     "notes": "Official PlanetScale blog: database engineering, MySQL, Postgres, Vitess, tutorials and product updates.", "icon": "https://planetscale.com/favicon.ico"},
    {"id": "posthog", "company": "PostHog", "blog_url": "https://posthog.com/blog", "feed_urls": ["https://posthog.com/rss.xml"],
     "notes": "Official PostHog blog: engineering, data infrastructure, product building and company lessons. Broad publisher feed; non-blog library/founder entries are excluded. Worker accepts up to 8 MiB for this source.", "include_url_regex": r"^https://posthog\.com/blog/[^/?#]+", "icon": "https://posthog.com/favicon-32x32.png?v=6e5ac8d4a5b381b5caa29396fbf7c955"},
]

def full_feed(body, base):
    if b'<!DOCTYPE' in body.upper() or b'<!ENTITY' in body.upper():
        raise ValueError("Syndication DTDs are not accepted")
    tree = ET.fromstring(body)
    if tag_name(tree) not in ("rss", "feed", "rdf"):
        raise ValueError("Expected an RSS or Atom feed")
    rows = [node for node in tree.iter() if tag_name(node) in ("item", "entry")]
    result = {}
    for start in range(0, len(rows), 100):
        batch = ET.Element(tree.tag)
        batch.extend(rows[start:start + 100])
        for item in parse_feed(ET.tostring(batch, encoding="utf-8"), base):
            result[item["url"]] = item
    return list(result.values())

def fetch(url, maximum):
    with urlopen(Request(url, headers={"User-Agent": "DailyEngineeringReader/1.0"}), timeout=30) as response:
        body = response.read(maximum + 1)
        if len(body) > maximum:
            raise ValueError("Publisher response exceeds the reviewed limit")
        return body

def main():
    output = ROOT / "outputs/new-publishers"
    output.mkdir(parents=True, exist_ok=True)
    sources_path = COLLECTOR_ROOT / "sources.json"
    catalog = json.loads(sources_path.read_text(encoding="utf-8"))
    seed_path = ROOT / "lib/server/seed.json"
    seed = json.loads(seed_path.read_text(encoding="utf-8"))
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    incoming = []
    results = []
    for source in PUBLISHERS:
        cache = output / f'{source["id"]}-verified-feed.xml'
        if not cache.exists():
            cache.write_bytes(fetch(source["feed_urls"][0], 8 * 1024 * 1024))
        parsed = full_feed(cache.read_bytes(), source["blog_url"])
        items = [item for item in parsed if item["url"].startswith(source["blog_url"].rstrip("/") + "/")]
        if not items:
            raise ValueError("Missing approved publisher article metadata")
        incoming.extend({**item, "company_id": source["id"], "company": source["company"], "id": hashlib.sha256(item["url"].encode()).hexdigest()[:24], "discovered_at": now} for item in items)
        results.append({"company": source["company"], "articles": len(items), "feed": source["feed_urls"][0], "bytes": cache.stat().st_size, "nonBlogEntriesSkipped": len(parsed) - len(items)})
        common = {key: source[key] for key in ("id", "company", "blog_url", "feed_urls", "notes")}
        if source.get("include_url_regex"):
            common["include_url_regex"] = source["include_url_regex"]
        public = {**common, "verification": "xml_verified", "listing_fallback": False, "evidence_url": source["feed_urls"][0]}
        catalog["sources"] = [row for row in catalog["sources"] if row["id"] != source["id"]] + [public]
        seed["sources"] = [row for row in seed["sources"] if row["id"] != source["id"]] + [{**common, "mode": "feed"}]
    sources_path.write_text(json.dumps(catalog, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    (COLLECTOR_ROOT / "feeds.opml").write_bytes(opml(catalog["sources"]))
    db_path = COLLECTOR_ROOT / "data/blogs.sqlite3"
    initialize(db_path)
    backup_name = "collector-before-" + datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ") + ".sqlite3"
    with sqlite3.connect(db_path) as current, sqlite3.connect(output / backup_name) as backup:
        current.backup(backup)
    with connect(db_path) as db:
        for article in incoming:
            db.execute("""INSERT INTO articles VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(url) DO UPDATE SET
                title=excluded.title,summary=CASE WHEN excluded.summary<>'' THEN excluded.summary ELSE articles.summary END,
                published_at=COALESCE(articles.published_at,excluded.published_at),last_seen_at=excluded.last_seen_at""",
                (article["id"], article["company_id"], article["url"], article["title"], article["summary"], article["author"], article["published_at"], now, now, "feed"))
    # Reuse the actual app classifier and supported SQL exporter.
    spec = importlib.util.spec_from_file_location("collector_import", ROOT / "scripts/import-collector.py")
    importer = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(importer)
    normalized = importer.normalize(incoming, __import__('shutil').which('node'))
    by_url = {article["url"]: article for article in seed["articles"]}
    for article in normalized:
        app_article = {key: article[key] for key in ("id", "company_id", "company", "title", "url", "summary", "published_at", "discovered_at", "topics")}
        by_url.setdefault(article["url"], app_article)
    seed["articles"] = list(by_url.values())
    seed_path.write_text(json.dumps(seed, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    (output / "articles.json").write_text(json.dumps(normalized, ensure_ascii=False, indent=2), encoding="utf-8")
    sql = (ROOT / "drizzle/0003_engineering_publishers.sql").read_text(encoding="utf-8")
    sql += "\n" + importer.export_sql(normalized, [], {source["id"]: source["company"] for source in PUBLISHERS})
    (output / "source-and-articles.sql").write_text(sql, encoding="utf-8")
    (output / "verification.json").write_text(json.dumps({"verified_at": now, "publishers": results}, indent=2), encoding="utf-8")
    print(json.dumps({"publishers": results, "configuredCompanies": len(seed["sources"]), "sql": str(output / "source-and-articles.sql")}, indent=2))

if __name__ == "__main__":
    main()
