# readzz data model and feeds

## SQL entities

The additive `0001_readzz_domain` migration adds companies, sources, topics, topic keywords and article-topic links. Fifteen initial topics include Networking, AI & ML, Inference, PostgreSQL, Rust, Systems, Data and Infrastructure. Sources retain their approved listing URL patterns. The ingestion Worker reads the source and keyword catalog from D1.

`article_topics` has a composite key and indexed topic lookup. A story can belong to multiple topics without being copied. Classification recognizes whole-word aliases, weights title matches twice as strongly as excerpt matches, and inherits parent categories (PostgreSQL → Data, Inference → AI & ML). All matching catalog topics are retained. The keyword table stores term weights; ingestion uses them. Publisher bodies are not fetched for classification, so subjects absent from the title/excerpt can be missed.

Existing `articles.company`, `articles.topics` and `profiles.data` remain compatible caches. IDs, URLs and profile JSON are preserved. SQLite triggers validate article company membership and maintain article-topic links and normalized follows, bookmarks and reading-log projections transactionally. New relationship tables have foreign keys; legacy `articles.company_id` is validated by triggers rather than rebuilding the original table. Normalized private user history never creates public popularity votes.

## Personal recommendations

`lib/server/feed-query.ts` scores the complete matching archive in D1 **before** pagination. The browser displays the server's order and never re-ranks fetched pages.

- Freshness: `4 / (1 + ageDays / freshnessWindow)`.
- Seven or more active days in the last fourteen days use a seven-day freshness window; otherwise fourteen days. This gives the activity calendar a concrete effect without treating an activity count as topical interest.
- Followed company: +3.
- Matching explicit interest: +2 per topic.
- Topic appearing in saved articles: +0.6 per topic.
- Related logged reads: recency-weighted topic affinity, with thirty-day decay and a bounded boost.
- A smaller company affinity boost comes from logged reading history.
- Already-read stories follow unread stories and also receive a score penalty.
- SQL window functions apply a company-variety penalty within personal feeds. Latest and Following remain chronological.

Custom company/topic selections, topic chips, exclusions and search are hard constraints. Topic chips are ANDed with custom-feed topic rules. A bookmark/read action creates a new personal edition; ordinary pagination preserves the current one. Recommendation reasons distinguish related reading history, explicit interests, followed companies and discovery.

## Community trends

`POST /api/engagement` accepts explicit `read` and `save` toggles only from a verified signed-in reader. Identity comes from the server, including an owner assertion to detect account changes. Timestamps are assigned on the server. The browser sends an action only when the reader toggles a log or bookmark; loading/importing old history produces no votes. Guest actions remain personal and do not affect global popularity.

Each reader/article/kind has one contribution. Undo deactivates it; reactivation retains its first observed timestamp. Repeated clicks cannot accumulate votes. At most one hundred new contributions per account per UTC day are accepted. Read logs are self-reports, not proof that an external article was completed. This is basic deduplication/rate bounding, not a comprehensive bot or account-farm detector.

Trending scores recent active read reports at weight 3 and saves at weight 2, both decaying with event age. The selected window is 24 hours, seven days or all recorded activity. Older articles can trend through new engagement. With no matching community events, the page explicitly presents fresh discovery stories instead of claiming popularity. Existing/private history is not backdated into the public metrics.

## Pagination, caching and privacy

The server materializes ordered article IDs into 512-ID chunks. A one-hour edition freezes ranking across pages, so new posts or changing popularity do not cause duplicate or skipped stories. Responses return only the requested article bodies, normally 24. Opaque cursors are tied to the request/preferences and verified owner; expired or mismatched editions return 409.

Unchanged editions can be reused within a five-minute bucket. Content and engagement revision counters invalidate new editions when data changes. Update prompts compare content revisions, rather than refreshing merely because a publisher check succeeded. Only ordered IDs and hashed ownership/preferences are cached; profile bodies are not stored in feed sessions. Personalized HTTP responses use `private, no-store`.

The scheduled Worker cleans expired editions and records its heartbeat. `/api/refresh` reports a scheduled mode when that database has received a scheduler heartbeat within thirty minutes. Local preview and remote D1 are independent, as before.

## Migration and verification

```powershell
node --experimental-strip-types scripts/domain-upgrade.mjs --local
node --experimental-strip-types scripts/domain-upgrade.mjs --remote
node --experimental-strip-types scripts/verify-domain.mjs --local
node --experimental-strip-types scripts/verify-domain.mjs --remote
node scripts/ingestion.mjs --deploy
```

Upgrade commands first save ignored SQL backups, then apply/backfill the reviewed migration and verify that original IDs/URLs and profiles were retained. They do not fabricate community events. `verify-domain` is read-only and exercises the actual full-archive SQL ranking query and foreign-key checks.

Tests cover a relevant story beyond the newest 100 articles, reading affinities, already-read ordering, activity cadence, real-event ranking, historical/guest isolation, undo/deduplication, contribution caps, custom-filter intersections, cross-chunk pagination and owner-bound cursors. Full website deployment and a standalone auth provider are still separate work; current account endpoints use the existing Sites identity contract.
