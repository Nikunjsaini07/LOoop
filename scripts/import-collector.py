"""Copy a consistent read-only collector snapshot into the local app D1 database.

No remote mode exists. Existing article IDs, extra rows and profile records survive.
Run from any directory: python scripts/import-collector.py
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import shutil
import sqlite3
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
COLLECTOR_ROOT = ROOT.parent if (ROOT.parent / "dailyblogs.py").is_file() else ROOT / "collector"
REQUIRED_TABLES = {"articles", "profiles", "refresh_locks", "source_refresh"}


def literal(value):
    if value is None:
        return "NULL"
    value = str(value)
    if "\0" in value:
        raise ValueError("Collector data contains an unsupported null byte")
    return "'" + value.replace("'", "''") + "'"


def timestamp(value):
    if not value:
        return None
    result = datetime.fromisoformat(value.replace("Z", "+00:00"))
    if result.tzinfo is None:
        raise ValueError(f"Collector timestamp has no timezone: {value}")
    return result.astimezone(timezone.utc).isoformat(timespec="milliseconds").replace("+00:00", "Z")


def snapshot(source):
    if not source.is_file():
        raise FileNotFoundError(f"Collector database does not exist: {source}")
    db = sqlite3.connect(source.as_uri() + "?mode=ro", uri=True, timeout=30)
    db.row_factory = sqlite3.Row
    try:
        db.execute("PRAGMA query_only=ON")
        db.execute("BEGIN")
        articles = [dict(row) for row in db.execute("SELECT * FROM articles ORDER BY url")]
        statuses = [dict(row) for row in db.execute("SELECT * FROM source_status ORDER BY company_id")]
        return articles, statuses
    finally:
        db.close()


def normalize(articles, node):
    # Use the app's actual normalization/topic rules instead of a second classifier.
    script = """import {readFileSync} from 'node:fs';
import {inferTopics,plainText,canonicalUrl} from './lib/server/core.ts';
const articles=JSON.parse(readFileSync(0,'utf8'));
console.log(JSON.stringify(articles.map(article=>{
  const title=plainText(article.title,300), summary=plainText(article.summary);
  if(!title||!canonicalUrl(article.url)) throw new Error('Invalid collector article: '+article.id);
  return {...article,title,summary,topics:inferTopics(title,summary)};
})));"""
    result = subprocess.run([node, "--experimental-strip-types", "--input-type=module", "-e", script],
                            cwd=ROOT, input=json.dumps(articles), text=True, encoding="utf-8", capture_output=True)
    if result.returncode:
        raise RuntimeError(result.stderr.strip() or "Article normalization failed")
    return json.loads(result.stdout)


def export_sql(articles, statuses, companies):
    statements = ["-- Generated read-only collector snapshot; local D1 import only."]
    for article in articles:
        company_id = article["company_id"]
        if company_id not in companies:
            raise ValueError(f"Unknown company in collector: {company_id}")
        if not article.get("discovered_at"):
            raise ValueError(f"Missing discovery time: {article['id']}")
        values = [article["id"], company_id, companies[company_id], article["title"], article["url"],
                  article["summary"], timestamp(article["published_at"]), timestamp(article["discovered_at"]),
                  json.dumps(article["topics"], ensure_ascii=False, separators=(",", ":"))]
        statements.append("""INSERT INTO articles (id,company_id,company,title,url,summary,published_at,discovered_at,topics)
VALUES (%s)
ON CONFLICT(url) DO UPDATE SET
  company_id=excluded.company_id,company=excluded.company,title=excluded.title,
  summary=CASE WHEN excluded.summary != '' THEN excluded.summary ELSE articles.summary END,
  published_at=COALESCE(excluded.published_at,articles.published_at),topics=excluded.topics,
  discovered_at=CASE WHEN julianday(excluded.discovered_at) < julianday(articles.discovered_at)
    THEN excluded.discovered_at ELSE articles.discovered_at END;""" % ",".join(map(literal, values)))
    for status in statuses:
        if status["company_id"] not in companies:
            continue
        values = [status["company_id"], timestamp(status["attempted_at"]), timestamp(status["succeeded_at"]),
                  status["etag"], status["last_modified"], status["error"]]
        statements.append("""INSERT INTO source_refresh (source_id,last_attempt,last_success,etag,last_modified,error)
VALUES (%s)
ON CONFLICT(source_id) DO UPDATE SET
  last_success=CASE WHEN excluded.last_success IS NOT NULL AND
    (source_refresh.last_success IS NULL OR julianday(excluded.last_success) > julianday(source_refresh.last_success))
    THEN excluded.last_success ELSE source_refresh.last_success END,
  last_attempt=excluded.last_attempt,etag=excluded.etag,last_modified=excluded.last_modified,error=excluded.error
WHERE source_refresh.last_attempt IS NULL OR julianday(excluded.last_attempt) >= julianday(source_refresh.last_attempt);""" % ",".join(map(literal, values)))
    return "\n\n".join(statements) + "\n"


def run_d1(node, config, persist, *arguments):
    command = [node, "--import", (ROOT / "scripts/sites-env.mjs").as_uri(),
               str(ROOT / "node_modules/wrangler/bin/wrangler.js"), "d1", "execute", "DB", "--local",
               "--config", str(config), "--persist-to", str(persist), *map(str, arguments), "--json"]
    environment = {**os.environ, "WRANGLER_SEND_METRICS": "false", "WRANGLER_WRITE_LOGS": "false"}
    result = subprocess.run(command, cwd=ROOT, text=True, encoding="utf-8", capture_output=True, env=environment)
    if result.returncode:
        raise RuntimeError("Local D1 command failed:\n" + (result.stderr.strip() or result.stdout.strip()))
    try:
        response = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError("Could not parse local D1 response: " + result.stdout[:1000]) from error
    if not isinstance(response, list) or any(item.get("success") is False for item in response):
        raise RuntimeError("Local D1 returned an error: " + json.dumps(response))
    return response


def ensure_schema(node, config, persist):
    response = run_d1(node, config, persist, "--command", "SELECT name FROM sqlite_master WHERE type='table'")
    existing = {row["name"] for item in response for row in item.get("results", [])}
    if REQUIRED_TABLES <= existing:
        return
    if existing & REQUIRED_TABLES:
        raise RuntimeError("Local app schema is partially migrated. Apply its pending migrations before importing.")
    migrations = sorted((ROOT / "drizzle").glob("*.sql"))
    if not migrations:
        raise RuntimeError("No committed database migrations found")
    for migration in migrations:
        print("Applying fresh local schema: " + migration.name, file=sys.stderr)
        run_d1(node, config, persist, "--file", migration)


def database_summary(node, config, persist):
    response = run_d1(node, config, persist, "--command", """
SELECT COUNT(*) AS articles, COUNT(DISTINCT company_id) AS companies FROM articles;
SELECT COUNT(*) AS profiles FROM profiles;
SELECT COUNT(*) AS sources, MAX(last_success) AS latest_success FROM source_refresh;
""")
    return {key: value for item in response for row in item.get("results", []) for key, value in row.items()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, default=COLLECTOR_ROOT / "data/blogs.sqlite3")
    parser.add_argument("--export-only", action="store_true", help="Generate the SQL snapshot without changing local D1")
    parser.add_argument("--verify", action="store_true", help="Verify every source ID, URL and discovery time after import")
    args = parser.parse_args()
    source = args.source.resolve()
    node = shutil.which("node")
    if not node:
        raise RuntimeError("Node.js 22.13 or newer is required")
    config = ROOT / "wrangler.jsonc" if (ROOT / "wrangler.jsonc").is_file() else ROOT / "dist/server/wrangler.json"
    persist = ROOT / ".wrangler/state"
    articles, statuses = snapshot(source)
    catalog = json.loads((ROOT / "lib/server/seed.json").read_text(encoding="utf-8"))["sources"]
    companies = {item["id"]: item["company"] for item in catalog}
    articles = normalize(articles, node)
    sql = export_sql(articles, statuses, companies)
    output = ROOT / "outputs/collector-import"
    output.mkdir(parents=True, exist_ok=True)
    sql_path = output / "snapshot.sql"
    sql_path.write_text(sql, encoding="utf-8")
    # Public verification metadata comes from the same read transaction as the SQL.
    manifest_path = output / "manifest.json"
    manifest_path.write_text(json.dumps([{key: article[key] for key in ("id", "company_id", "url", "discovered_at")}
                                         for article in articles], ensure_ascii=False) + "\n", encoding="utf-8")
    report = {"source": str(source), "sourceArticles": len(articles),
              "sourceCompaniesWithArticles": len({item["company_id"] for item in articles}),
              "configuredSources": len(companies), "sourceStatuses": len(statuses),
              "sourceLatestSuccess": max((timestamp(item["succeeded_at"]) for item in statuses if item["succeeded_at"]), default=None),
              "sqlFile": str(sql_path), "manifestFile": str(manifest_path), "localOnly": True, "continuousLink": False}
    if not args.export_only:
        if not config.is_file():
            raise RuntimeError("Run npm run build first to emit the local Worker configuration")
        # The target and --local flag are fixed: no credentials or remote execution are used.
        ensure_schema(node, config, persist)
        before = database_summary(node, config, persist)
        run_d1(node, config, persist, "--file", sql_path)
        after = database_summary(node, config, persist)
        if before["profiles"] != after["profiles"]:
            raise RuntimeError("Profile count changed unexpectedly during import")
        report.update(before=before, after=after)
        if args.verify:
            rows = run_d1(node, config, persist, "--command", "SELECT id,url,discovered_at FROM articles")
            imported = {row["url"]: row for result in rows for row in result.get("results", [])}
            for article in articles:
                row = imported.get(article["url"])
                if not row or timestamp(row["discovered_at"]) > timestamp(article["discovered_at"]):
                    raise RuntimeError("Import verification failed for " + article["url"])
            report["verifiedSourceArticles"] = len(articles)
    report_path = output / "report.json"
    report_path.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (OSError, ValueError, RuntimeError, sqlite3.Error) as error:
        print("Import failed: " + str(error), file=sys.stderr)
        raise SystemExit(1)
