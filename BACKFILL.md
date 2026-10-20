# Historical engineering archives

The regular scheduler fetches recent RSS/Atom windows and public listings. A feed may expose only five or ten posts, even when a company has published for years. Its 100-item processing limit protects scheduled refresh latency; increasing that limit alone cannot retrieve history absent from the response.

Historical collection is a separate, repeatable local operation. The scripts read official public metadata, retain publisher titles and dates, and store short excerpts and source links. They do not republish full articles or turn sitemap modification times into publication dates.

## Collect and import

From `scroll-app`, run the collectors you need:

```powershell
python scripts/netflix_archive.py --target 400
python scripts/backfill-publishers.py
python scripts/backfill-catalogs.py --max-posts 600
python scripts/backfill-uber.py
```

The collectors write public metadata JSON and resumable response caches under ignored `outputs/archive-backfill/`. A partial publisher failure retains collected records and appears in its report. Review the reports before merging. Netflix topic feeds, Google pages, Uber pages and Spotify listings are bounded coverage, not promises of a complete historical archive. Apple covers its machine-learning research publication; Microsoft covers Engineering@Microsoft.

```powershell
# Preview counts without changing either database.
python scripts/merge-archives.py

# Back up and merge into the Python collector database.
python scripts/merge-archives.py --apply

# Synchronize the app's local D1 database through the supported importer.
python scripts/import-collector.py --verify
```

The merge reconciles trailing-slash variants and Medium RSS attribution parameters against existing collector and app URLs. Existing IDs and exact permalinks win, preserving bookmarks and read logs. Non-Medium `source` query parameters retain their meaning. The Python collector and app ingestion writer apply the same Medium tracking safeguard during later refreshes. Normal scheduled updates retain all historical rows.

The importer is explicitly local. It does not change the deployed Cloudflare database or publish the website. Both the collector and local app database were backed up before the first historical import.

## Verified expansion on 20 October 2026

The local app grew from 1,287 to 5,701 entries. Selected company totals:

| Publication | Before | After |
| --- | ---: | ---: |
| Netflix TechBlog | 10 | 406 |
| Engineering at Meta | 12 | 1,113 |
| Apple Machine Learning Research | 10 | 1,184 |
| Google Developers | 22 | 592 |
| Shopify Engineering | 101 | 433 |
| Dropbox Tech | 10 | 410 |
| Slack Engineering | 8 | 194 |
| GitHub Engineering | 10 | 169 |
| Stripe Developers | 102 | 125 |
| Uber Engineering | 15 | 59 |
| Engineering@Microsoft | 10 | 31 |
| Spotify Engineering | 5 | 13 |

Counts can rise with later refreshes. Netflix's official RSS dates for some older migrated posts reflect Medium's migration date. Uber returned HTTP 406 for many older index pages, and Spotify category pages returned HTTP 500, so those archives remain partial. A few Japanese Netflix topic URLs failed during the run; the reusable collector now percent-encodes them correctly. Other publishers were not backfilled in this pass.

Verification checks include repeated-import idempotence, canonical URL deduplication, preservation of original IDs and reading data, valid foreign keys, and company totals from the full archive. Per-publisher collection reports, the merge report, backups and the final database verification remain under `outputs/archive-backfill/`.
