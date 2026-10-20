"""Merge collected public archive JSON into the collector, preserving identities.

Dry-run by default. After --apply, run import-collector.py --verify to synchronize
the app's local D1 database. This command never writes the app SQLite file.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
from urllib.parse import urlsplit, urlunsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT.parent))
from dailyblogs import article_url_key, canonical_url, plain, timestamp


def alias(url):
    url = article_url_key(url)
    if not url:
        raise ValueError("Invalid archive URL")
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.password or parts.port not in (None, 443):
        raise ValueError("Archive articles require a public HTTPS publisher URL")
    return urlunsplit(("https", parts.hostname.lower(), parts.path.rstrip("/") or "/", parts.query, ""))


def read_app_archive():
    candidates = []
    for path in (ROOT / ".wrangler/state").rglob("*.sqlite"):
        with sqlite3.connect(path.resolve().as_uri() + "?mode=ro", uri=True) as db:
            tables = {row[0] for row in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
            if {"articles", "profiles", "engagements"} <= tables:
                rows = list(db.execute("SELECT id,company_id,url FROM articles"))
                candidates.append((path, rows))
    if len(candidates) > 1:
        raise ValueError("Multiple app databases found; use --without-app-aliases only after checking the target")
    return candidates[0] if candidates else (None, [])


def normalize_batches(directory, catalog):
    incoming, reports = {}, {}
    for path in sorted(directory.glob("*.json")):
        payload = json.loads(path.read_text(encoding="utf-8"))
        company = payload.get("company_id") if isinstance(payload, dict) else None
        if not company or "items" not in payload:
            continue
        if company not in catalog:
            raise ValueError("Unknown company in " + path.name)
        source = catalog[company]
        hosts = {urlsplit(url).hostname for url in [source["blog_url"], *source.get("feed_urls", [])]}
        for row in payload["items"]:
            url = canonical_url(row.get("url", ""))
            if not url or urlsplit(url).hostname not in hosts:
                raise ValueError("Archive article is outside its configured publisher: " + str(url))
            title = plain(row.get("title", ""), 300)
            date = timestamp(row.get("published_at"))
            if not title or not date:
                raise ValueError("Archive entries require real titles and publisher dates")
            if datetime.fromisoformat(date) > datetime.now(timezone.utc):
                raise ValueError("Archive entry has a future publisher date: " + url)
            item = {"company_id": company, "url": url, "title": title, "summary": plain(row.get("summary", "")),
                    "author": plain(row.get("author", ""), 150), "published_at": date}
            key = alias(url)
            previous = incoming.get(key)
            if previous and previous["company_id"] != company:
                raise ValueError("The same article was assigned to two companies")
            if not previous or len(item["summary"]) > len(previous["summary"]):
                incoming[key] = item
        reports[company] = {"input": path.name, "collected": len(payload["items"]), "source_report": payload.get("report", {key: value for key, value in payload.items() if key != "items"})}
    return incoming, reports


def merge(db, incoming, app_rows=(), now=None):
    checked = now or datetime.now(timezone.utc).isoformat(timespec="seconds")
    existing = {alias(row[2]): row for row in db.execute("SELECT id,company_id,url FROM articles ORDER BY discovered_at DESC")}
    app_aliases = {alias(row[2]): row for row in app_rows}
    before = dict(db.execute("SELECT company_id,COUNT(*) FROM articles GROUP BY company_id"))
    for key, item in incoming.items():
        previous = existing.get(key) or app_aliases.get(key)
        if previous and previous[1] != item["company_id"]:
            raise ValueError("Existing publisher identity conflicts with archive metadata")
        url = previous[2] if previous else item["url"]
        identity = previous[0] if previous else hashlib.sha256(url.encode()).hexdigest()[:24]
        db.execute("""INSERT INTO articles(id,company_id,url,title,summary,author,published_at,discovered_at,last_seen_at,source_kind)
            VALUES (?,?,?,?,?,?,?,?,?,'archive') ON CONFLICT(url) DO UPDATE SET
            title=excluded.title,
            summary=CASE WHEN excluded.summary<>'' THEN excluded.summary ELSE articles.summary END,
            author=CASE WHEN excluded.author<>'' THEN excluded.author ELSE articles.author END,
            published_at=COALESCE(articles.published_at,excluded.published_at),
            last_seen_at=excluded.last_seen_at""",
            (identity, item["company_id"], url, item["title"], item["summary"], item["author"], item["published_at"], checked, checked))
    after = dict(db.execute("SELECT company_id,COUNT(*) FROM articles GROUP BY company_id"))
    return {company: {"before": before.get(company, 0), "after": after.get(company, 0), "added": after.get(company, 0) - before.get(company, 0)}
            for company in sorted({row["company_id"] for row in incoming.values()})}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--directory", type=Path, default=ROOT / "outputs/archive-backfill")
    parser.add_argument("--database", type=Path, default=ROOT.parent / "data/blogs.sqlite3")
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--without-app-aliases", action="store_true")
    args = parser.parse_args()
    directory, database = args.directory.resolve(), args.database.resolve()
    catalog = {source["id"]: source for source in json.loads((ROOT.parent / "sources.json").read_text(encoding="utf-8"))["sources"]}
    incoming, sources = normalize_batches(directory, catalog)
    if not incoming:
        raise ValueError("No collected archive metadata was found")
    app_path, app_rows = (None, []) if args.without_app_aliases else read_app_archive()
    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as source:
        backup = directory / ("collector-before-" + stamp + ".sqlite3") if args.apply else None
        target = sqlite3.connect(str(backup) if backup else ":memory:")
        source.backup(target)
        target.close()
    db = sqlite3.connect(str(database) if args.apply else ":memory:")
    if not args.apply:
        with sqlite3.connect(database.as_uri() + "?mode=ro", uri=True) as source:
            source.backup(db)
    try:
        with db:
            changes = merge(db, incoming, app_rows)
        report = {"applied": args.apply, "collector": str(database), "appAliasesReadOnly": str(app_path) if app_path else None,
                  "backup": str(backup) if backup else None, "uniqueArchiveItems": len(incoming),
                  "added": sum(row["added"] for row in changes.values()), "companies": changes, "sources": sources}
        (directory / ("merge-report.json" if args.apply else "merge-preview.json")).write_text(json.dumps(report, indent=2, ensure_ascii=False), encoding="utf-8")
        print(json.dumps({key: value for key, value in report.items() if key != "sources"}, indent=2))
    finally:
        db.close()


if __name__ == "__main__":
    main()
