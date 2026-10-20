# readzz ingestion

The `readzz-ingestion` Cloudflare Worker independently updates the existing remote D1 database, `reads`. It does not require the website, a browser, or this computer to stay open. This Worker has no public HTTP endpoint and never touches the profiles table.

## Schedule and sources

- Cloudflare invokes the Worker every five minutes, using its UTC scheduler.
- Each invocation selects up to four due sources, oldest attempt first.
- Successful sources become due again after six hours; failed sources retry after one hour.
- The fixed catalog has 31 RSS/Atom sources, five approved HTML listings, and one manual source (LinkedIn).
- A fully overdue roster of 36 automatic sources takes about 45 minutes to rotate under normal operation. Source outages, hosting limits and scheduler delays can extend this; daily coverage is a target, not a promise that every publisher will be reachable.
- A one-minute D1 lock is shared with traffic-driven refreshes to prevent overlapping refresh batches.

The pipeline fetches publisher feeds/listings, normalizes URLs and text, assigns rule-based topics, and upserts title, short publisher excerpt, original URL and dates. It does not fetch complete article bodies or use an AI summarization provider. Listing adapters check robots.txt before reading their approved listing paths. LinkedIn stays manual.

## Data integrity and limits

`lib/server/ingestion.ts` is shared by the scheduled Worker and the app's existing refresh wrapper. Companies, source adapters, topics and keyword aliases are read from SQL; article-topic relationships are maintained by transactional triggers. `lib/server/article-writer.ts` performs bulk SQL upserts: ten articles per SQL statement, at most 90 bound parameters, and ten statements for a full 100-item feed. An unchanged row is not rewritten. Existing article IDs, earlier discovery dates and nonempty excerpts survive subsequent refreshes.

Fetches use fixed source URLs, HTTPS redirect validation, a 7.5-second deadline and a 3 MiB body cap. Feeds ingest at most 100 entries; listings ingest at most 30 matching links. ETag and Last-Modified conditionals reduce repeat downloads. Publisher failures retain the archive and record their error in `source_refresh`.

Worker observability records a `readzz.ingestion` JSON event with per-source status, parsed article count, changed-row count and remaining due sources. `changed` includes inserts and updates; it is not a new-article count. Configured logs do not constitute an external alerting service.

## Administration

Normal Wrangler authentication is required. Account/database IDs come from ignored `.env.local`; generated deployment configuration and bundles stay under ignored `outputs/ingestion/`. No API token is read or written by the helper.

```powershell
# Generate the ignored configuration without contacting Cloudflare.
node scripts/ingestion.mjs --prepare

# Bundle and validate without deploying.
node scripts/ingestion.mjs --dry-run

# Deploy the Worker and its scheduled trigger against existing D1.
node scripts/ingestion.mjs --deploy

# Read remote article count and per-source health.
node scripts/ingestion.mjs --status

# Optional: test the actual scheduled handler locally against remote D1.
node scripts/ingestion.mjs --smoke-server
# From a second terminal; this writes a real due batch to remote D1:
Invoke-WebRequest http://127.0.0.1:8788/__scheduled
```

Deployment does not create a database, apply migrations, change the account's billing plan, publish the website, or change the website's local preview binding. The production website must use the same `reads` D1 binding to display these updates. Localhost continues to use its separate local D1 archive. `/api/refresh` reports scheduled updates only when its database has received the ingestion heartbeat within thirty minutes; otherwise it reports traffic-driven refresh.

For a different account/database, verify the target and change the helper's database name as needed before deploying. Do not reuse production profile data for development tests. For a larger source roster, use per-source queue jobs; the current bounded scheduler avoids introducing another service for 36 automatic sources.

## Verification

```powershell
node --experimental-strip-types --test lib/server/core.test.mjs lib/useReadingProfile.test.mjs scripts/cloudflare-db.test.mjs lib/server/ingestion.test.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
```

The ingestion tests execute the production writer and scheduling logic against SQLite: bulk parameter limits, idempotence, identity/excerpt/profile preservation, bounded rotations, shared cooldown, conditional requests, failure recovery and robots restrictions.

On 20 October 2026, the real scheduled handler was exercised against remote D1: Netflix, Cloudflare, Meta and ClickHouse all refreshed successfully; the archive grew from 1,260 to 1,267 articles. Cloudflare then confirmed deployment of version `58b9fa9d-13a1-426e-8ab9-45f0a6d2f754` and its five-minute trigger. Subsequent runs change these counts; use the status command for current state.

References: [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/), [D1 Worker API](https://developers.cloudflare.com/d1/worker-api/).

The SQL domain migration and recommendation engine are documented in [RECOMMENDATIONS.md](RECOMMENDATIONS.md). The scheduled Worker also cleans expired ranked editions and records a heartbeat in `app_state`.
