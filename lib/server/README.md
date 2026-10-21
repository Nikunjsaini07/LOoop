# readzz data service

The API fallback includes **1,602 real collected articles across 40 configured companies**: the original 18 October archive plus verified Linear, PlanetScale and PostHog feed metadata added on 20 October 2026. Live D1 contains additional historical backfills. These are publisher titles, short excerpts and original links. Keyword rules assign initial topic tags; these are not a trained classification model.

## API

- `GET /api/articles?pageSize=24`: server-ranked edition. `POST` accepts `{profile:{follows,interests,bookmarks,readLogs,activity}}` for private personalization, including device-local guest preferences. It does not persist these preferences or turn history into community metrics.
- Filters: `company`, `topic`, `signal`, `q`, `exclude`, `ids`; modes: `personal`, `latest`, `following`, `trending`. Topic chips and saved-feed rules stay ANDed. Use `period=today|week|archive` for trends.
- Home and Trending use twelve-story numbered pages: `page=2&edition=<id>&pageSize=12`. The response includes `page`, `pageSize`, `totalPages` and `edition`. Existing opaque `nextCursor` and original `snapshot` clients remain supported. Editions are tied to preferences/owner; 409 means refresh the edition. Responses also include `rankingVersion:2`, `rankingBasis`, `contentVersion`, `topicCatalog`, `total`, `hasMore`; Trending includes `communitySummary` for the selected period.
- `GET /api/sources`: SQL source catalog, with the public seed as an offline fallback.
- `GET/POST /api/profile`: verified account profile with owner checks and version compare-and-swap; signed-out UI actions require sign-in; legacy guest copies are not silently imported. Database triggers maintain private normalized follows/bookmarks/read-log projections.
- `POST /api/engagement`: same-origin explicit read/save toggle, deduplicated and server-timestamped. Verified accounts use their server identity; guest browsers receive an HttpOnly deduplication cookie. Each identity contributes once per article/kind, undo deactivates it, and historical profile imports never generate votes. Guest identity is not private-profile authentication.
- `GET /api/engagement?ids=...`: current public totals, no reader identities; up to one hundred IDs. POST also returns confirmed totals. Visible clients refresh every thirty seconds and on focus.
- `GET /api/refresh`: source health and scheduler heartbeat. `POST` remains an authenticated, same-origin request for one due batch.

See [RECOMMENDATIONS.md](../../RECOMMENDATIONS.md) for scoring, schema, privacy and cache details.

## Refresh behavior and limits

With a migrated D1 database, public article requests start a small background refresh through Cloudflare `waitUntil`; article responses read the existing archive immediately. One global D1 cooldown permits a batch per minute. Successful sources refresh at six-hour intervals; failed sources retry after one hour. Four sources are processed concurrently per batch, oldest attempt first. RSS/Atom and approved listing adapters are included; listing extraction first checks robots.txt and skips on policy/check failure. LinkedIn remains manual. Listing markup changes and upstream errors leave collected articles intact and appear in source health.

Fetches use only the fixed source catalog, validate HTTPS redirect destinations, cap bodies at 3 MiB (8 MiB for PostHog's larger official feed), cap redirect hops, and time out at 7.5 seconds per fetch. A listing uses two bounded fetches (robots and listing). Syndication rejects DTD/entity declarations and limits ingestion to 100 items; listing ingestion is limited to 30 links matching the approved patterns. ETag/Last-Modified are used for feeds when available. D1 upserts deduplicate URLs and retain initial discovery times; archive reads merge the bundled seed with up to 20,000 live rows.

**Remote D1 also has an independent scheduled ingestion Worker.** `readzz-ingestion` runs every five minutes against remote `reads`, using the same source parser, writer and cooldown as traffic-driven refresh. See [INGESTION.md](../../INGESTION.md) for deployment and verification. Local preview still uses local D1. `/api/refresh` detects a recent ingestion heartbeat in its own database and reports scheduled or traffic-driven updates accordingly. A successful trigger does not imply every publisher was reachable; inspect source health for coverage.

The tables are declared in `db/schema.ts`; generate/apply migrations through the starter's D1 workflow. Request handlers never create tables. Missing/unmigrated storage preserves public seed reading but returns a clear 503 for account writes.

## Client profile integration

`lib/useReadingProfile.ts` exposes the profile, readiness, storage/sync status, profile editing, open tracking and bookmark toggling. Mutations are gated until identity resolution finishes. Signed-out initialization skips the profile API and creates no browser profile. Signed-in copies are scoped by the confirmed Clerk user ID; legacy anonymous keys remain separate. The server profile is authoritative on load; anonymous history is never silently imported into a signed-in account. Corrupt local JSON is ignored, and blocked browser storage falls back to session memory with an explicit label.

Account updates debounce for 450 ms and serialize version-checked writes. Responses advance the server version but never overwrite newer pending local edits. Requests include an optional `owner` assertion, rejected before writing if the current signed-in identity changed. A 409 halts automatic writes and keeps the device copy with a conflict label. On reload, any dirty account copy is retained under its account-specific `:unsynced` key before the authoritative server profile is loaded. The UI does not yet provide a recovery/merge editor for that retained copy.

Open and new-bookmark actions increment UTC activity; removing a bookmark does not create a save. The hook syncs the resulting profile history rather than sending an additional server event, avoiding double counts.

## Verification

Run `node --experimental-strip-types --test lib/server/core.test.mjs` with the starter's Node runtime. Tests exercise real RSS/Atom normalization, invalid feeds and destinations, deduplication, snapshot filtering, bounded profile rules and honest activity counts. Build/typecheck and API auth/persistence smoke checks should also run before publishing.

Run `node --experimental-strip-types --test lib/useReadingProfile.test.mjs` after installing dependencies for deterministic client persistence/sync tests, including account isolation, in-flight edits, conflicts and unavailable storage. These tests exercise hook state/effects with a small controlled harness; they do not replace real-browser interaction QA.
