# readzz data service

The API starts with **1,260 real collected articles and all 37 companies**, exported from the local collector on 18 October 2026. These are publisher titles, short excerpts and original links. The seed is a recent collection, not a complete historical archive. Keyword rules assign initial topic tags; these are not a trained classification model.

## API

- `GET /api/articles?pageSize=24&cursor=0`: returns `articles`, `sources`, `total`, `hasMore`, `nextCursor`, `snapshot`, `updatedAt`, `liveAvailable`. Optional `company` and `topic` accept comma-separated values; `q` searches title, abstract and company. `ids` accepts up to 500 article IDs (useful for the saved library); `exclude` accepts comma-separated terms excluded from title/abstract/company. Values within a filter are OR; company, topic, IDs and query groups are AND. Exclusions are hard constraints. Pass the original `snapshot` alongside subsequent cursors so newly discovered articles do not shift the current list. The snapshot is a discovery-time cutoff, not a historical copy of mutable publisher metadata.
- `GET /api/sources`: fixed verified catalog. Source modes are `feed`, `listing` and `manual`.
- `GET /api/profile`: signed-in user's profile, version and identity; anonymous requests return 401. The app may maintain an explicitly device-local profile for anonymous readers. Profile fields: `name`, `bio`, `follows`, `interests`, `customFeeds`, `bookmarks`, `activity`.
- `POST /api/profile`: JSON partial profile or `{profile,version,event?}`. Ownership comes exclusively from the dispatch-owned ChatGPT identity helper. Optional `version` checks stale clients; database compare-and-swap prevents concurrent overwrites. A 409 requires reloading/merging before retry. An event is `{kind:"open"|"save",articleId}` and increments a server UTC activity day. Opens and saves never imply that an external article was fully read. Client activity history can also be synced as profile data; this is personal tracking, not trusted leaderboard data.
- `GET /api/refresh`: per-source refresh timestamps/errors and refresh mode.
- `POST /api/refresh`: signed-in, same-origin request runs one due batch, returning status and source results. There is no submitted URL parameter or force-refresh bypass.

## Refresh behavior and limits

With a migrated D1 database, public article requests start a small background refresh through Cloudflare `waitUntil`; article responses read the existing archive immediately. One global D1 cooldown permits a batch per minute. Successful sources refresh at six-hour intervals; failed sources retry after one hour. Four sources are processed concurrently per batch, oldest attempt first. RSS/Atom and approved listing adapters are included; listing extraction first checks robots.txt and skips on policy/check failure. LinkedIn remains manual. Listing markup changes and upstream errors leave collected articles intact and appear in source health.

Fetches use only the fixed source catalog, validate HTTPS redirect destinations, cap bodies at 3 MiB, cap redirect hops, and time out at 7.5 seconds per fetch. A listing uses two bounded fetches (robots and listing). Syndication rejects DTD/entity declarations and limits ingestion to 100 items; listing ingestion is limited to 30 links matching the approved patterns. ETag/Last-Modified are used for feeds when available. D1 upserts deduplicate URLs and retain initial discovery times; archive reads merge the bundled seed with up to 20,000 live rows.

**Remote D1 also has an independent scheduled ingestion Worker.** `readzz-ingestion` runs every five minutes against remote `reads`, using the same source parser, writer and cooldown as traffic-driven refresh. See [INGESTION.md](../../INGESTION.md) for deployment and verification. Local preview still uses local D1; its `/api/refresh` mode continues to describe its own traffic-driven behavior. A successful trigger does not imply every publisher was reachable; inspect source health for coverage.

The tables are declared in `db/schema.ts`; generate/apply migrations through the starter's D1 workflow. Request handlers never create tables. Missing/unmigrated storage preserves public seed reading but returns a clear 503 for account writes.

## Client profile integration

`lib/useReadingProfile.ts` exposes the profile, readiness, storage/sync status, profile editing, open tracking and bookmark toggling. Mutations are gated until identity resolution finishes. Anonymous browser copies use a separate key; signed-in copies are scoped by the confirmed user ID. The server profile is authoritative on load; anonymous history is never silently imported into a signed-in account. Corrupt local JSON is ignored, and blocked browser storage falls back to session memory with an explicit label.

Account updates debounce for 450 ms and serialize version-checked writes. Responses advance the server version but never overwrite newer pending local edits. Requests include an optional `owner` assertion, rejected before writing if the current signed-in identity changed. A 409 halts automatic writes and keeps the device copy with a conflict label. On reload, any dirty account copy is retained under its account-specific `:unsynced` key before the authoritative server profile is loaded. The UI does not yet provide a recovery/merge editor for that retained copy.

Open and new-bookmark actions increment UTC activity; removing a bookmark does not create a save. The hook syncs the resulting profile history rather than sending an additional server event, avoiding double counts.

## Verification

Run `node --experimental-strip-types --test lib/server/core.test.mjs` with the starter's Node runtime. Tests exercise real RSS/Atom normalization, invalid feeds and destinations, deduplication, snapshot filtering, bounded profile rules and honest activity counts. Build/typecheck and API auth/persistence smoke checks should also run before publishing.

Run `node --experimental-strip-types --test lib/useReadingProfile.test.mjs` after installing dependencies for deterministic client persistence/sync tests, including account isolation, in-flight edits, conflicts and unavailable storage. These tests exercise hook state/effects with a small controlled harness; they do not replace real-browser interaction QA.
