# Readwell product audit

Reviewed 21 October 2026. Scope: the running local app and current source, excluding deployment.

**Implementation follow-up:** this report preserves the original findings. Many have since been addressed locally; see [PRODUCT_CHANGES.md](PRODUCT_CHANGES.md) for implemented changes, current verification, and acceptance gaps that remain open. The verification section below describes the original audit, not the later implementation pass.

## Assessment

Readwell has an identifiable visual direction, real publisher data, meaningful recommendation logic, explicit reading logs, and careful account isolation. Its main remaining weaknesses are continuity, recovery, content trust, and operating at sustained usage. Passing builds and unit tests do not establish those product qualities.

P1 means resolve before a broad public release. P2 means important product quality work. P3 means later refinement. These priorities express product impact, not a formal security severity rating.

Evidence labels: **Observed** means exercised in the live browser; **Code** means a directly inspected implementation path; **Data** means read-only aggregate queries against the local app database; **Unverified** means an acceptance gap rather than a demonstrated defect.

## P1: reliability and user trust

### 1. Sync conflicts have no usable recovery path

**Code.** `lib/useReadingProfile.ts:111` stops saves once `conflicted.current` becomes true. A 409 retains the dirty device copy. Reinitialization with a newer server version stores that copy under `:unsynced`, but no UI lets a reader review, restore, merge, or discard it. The hook also has no cross-tab storage subscription or foreground profile refresh.

Two tabs can start at the same server version. A save from the first makes the second tab's next save conflict. The second reader sees a status label, while further changes remain local. Retaining bytes is valuable, but it is not a recoverable product experience.

**Required:** an actionable persistent conflict notice; safe reload and comparison; recovery/export of pending changes; cross-tab coordination. Make the outcome understandable without opening developer tools.

### 2. Failed saves and failed public activity can diverge

**Code.** In `lib/useReadingProfile.ts`, profile persistence is debounced while `shareAction` separately posts to `/api/engagement`. They have no shared transaction or durable reconciliation. A personal save can fail while its public count succeeds, or the personal profile can succeed while its public event fails. The profile triggers project personal relationships but do not reconcile the separate `engagements` table.

The profile flush does not automatically retry an unchanged failed revision after the network returns; the community queue also has no durable replay. Feed rendering does not consume the hook's `syncStatus`, so personal save failures can be invisible there. The community error message says the personal copy is saved even though it only describes one side of the operation.

**Required:** one authoritative mutation or an idempotent durable event queue, bounded reconnect retry, visible pending/error states, and reconciliation tests for every partial-success combination. Define precisely whether public activity represents current saved state or historical actions.

### 3. The custom-feed form can silently reject valid-looking input

**Code + direct validation check.** The exclusion field accepts 300 characters, but profile validation permits at most 30 exclusions and 80 characters per exclusion. An 81-character phrase or 31 short exclusions passes the form's checks and fails `sanitizeProfile` with `Invalid feed exclusions`.

`commit` catches the error and only sets sync status; `FeedForm` immediately calls `onClose()` after `onSave()`. The dialog can disappear without saving or showing an error. The same general problem affects reaching the custom-feed/bookmark caps. Read-log overflow throws; the feed handler does not catch it, unlike the article detail handler.

**Required:** shared form/domain validation, explicit mutation success/failure results, keep invalid forms open with the draft intact, and clear limit messages. Cover 31 feeds, 4,001 bookmarks, and 2,001 read logs.

### 4. Account lifecycle and privacy controls are missing

**Code.** The app offers profile editing and sign-out, but no app-level account settings, reading-data export, history reset, account/data deletion flow, or account-deletion webhook. There is no visible privacy explanation or support/report route. Clerk handles identity, while app profiles, relationship projections, and hashed public engagements live separately in D1.

**Required:** explain what is stored and what affects public totals; provide data export and deletion; define retention and engagement cleanup; connect identity deletion to application data deletion. This is a product-control gap, not a legal compliance determination.

### 5. Core real-account acceptance is still unverified

**Unverified.** This review used a signed-out browser. Existing release notes also record that complete sign-in/out and second-browser persistence were not exercised. Automated token/ownership tests are useful but do not prove OAuth returns, interrupted saves, expired sessions, account switching, and the actual library work together.

**Required:** acceptance with two test accounts and two browser sessions, including reload, network loss/recovery, simultaneous edits, pending navigation, sign-out, and failed login. Do not assume account flows work merely because the sign-in component renders.

## P2: continuity and core product experience

### 6. Search, feed, and navigation state are not durable

**Observed + Code.** Searching for `postgresql` changed the results to 13 stories while the URL remained `/`. Only company and page are read from the location; query, subject chip, topic, selected edition, and Trending period are React state. Article links perform native navigation, and the detail page's Back to feed link always goes to `/`.

Reloading or sharing cannot reconstruct the current search/edition. Returning through the app's link resets the context. Browser Back may benefit from browser caching, but there is no app-owned restoration guarantee. The edition ID is not retained in the URL, so a reloaded numbered page can belong to a new ranking.

**Required:** canonical URL state for meaningful filters/feed/period/page, a defined edition-resume policy, contextual return links, and scroll restoration. Verify reload, Back/Forward, copied links, and opening a result in another tab.

### 7. Core feed controls are hidden and inconsistently available

**Observed + Code.** `Latest`, `Following`, custom editions, and Filters live in the customization panel after the first eight stories. The selector only renders when the profile has follows or custom feeds, and the entire panel only renders on page one. A reader with only topic interests still cannot discover the selector. Company filtering is otherwise exposed by entering through Companies; clicking a story tag reveals the secondary filters.

**Required:** persistent feed selection and filter access above results, with useful empty Following behavior and a visible current context on every page.

### 8. Sign-in loses the action that motivated it

**Observed + Code.** Clicking a bookmark while signed out redirected to `/sign-in?return_to=%2F`. The implementation stores the return path, not the intended article/action. The bookmark is not applied after sign-in. Follow, read-log, feedback, and customize have the same intent gap. Search context is also absent from that return path.

**Required:** a clear sign-in explanation and short-lived pending intent, scoped to the verified account and exact article/action, with safe replay and undo where appropriate. Alternatively return to the exact control with an explicit instruction to finish the action.

### 9. Coverage promises contradict actual publisher availability

**Observed + Data + Code.** LinkedIn's directory card says “The first story is on its way” and permits following, but it has zero collected stories and its source is explicitly manual. Its feed shows generic “No stories found” copy without explaining the unavailable automatic source or offering the publisher's blog.

The local source-health snapshot also contained 13 publisher timeout records. Those records predate this review's browsing and do not prove those publishers are currently down or that remote ingestion has the same errors. The public UI offers no meaningful distinction between a healthy quiet publisher, delayed updates, and a disabled source.

**Required:** source-aware empty states, manual-source labeling, last successful collection information, and links to the original publisher. Use “Latest collected story” where archive coverage is incomplete.

### 10. Excerpt and taxonomy quality weaken discovery

**Observed + Data.** The local archive contained 6,061 articles: 855 had empty summaries (14.1%), five had summaries identical to their titles, and 33 lacked publication dates. Missing dates are already honestly labeled as collected dates. Missing excerpts are explained on detail pages but simply omitted in feed cards. Some excerpts mostly contain author lists rather than useful descriptions.

Observed topic issues include a compromised-certificates story shown with only a Product tag, and a TypeScript-to-Rust story whose two visible tags were Frontend and Product despite a Rust recommendation reason. Card rendering takes the first two topics, while topic ordering can differ across data paths. Generic terms such as “team,” “customers,” and “introducing” can push Product into otherwise specialized stories.

**Required:** metadata quality gates; better excerpt cleanup; consistent tag relevance ordering; a missing-excerpt treatment; a report-metadata action; an evaluated taxonomy sample. Do not invent full-article summaries or reading times from unavailable bodies.

### 11. The library is not ready for a large personal collection

**Code.** The profile fetches all missing bookmark/read-log IDs in parallel batches and silently substitutes empty results on failed requests. The UI calls missing records “outside the currently loaded collection” without distinguishing loading, deletion, and fetch failure or offering retry.

Bookmarks use the incidental order of `known` articles rather than a defined saved-date order. There is no bookmark/read-log search, sorting, pagination, or bulk management despite supporting thousands of records. Profile editions can be edited but not directly opened from their list.

**Required:** explicit library loading/retry states, stable newest-saved ordering, search and pagination, direct edition links, and clear unavailable-item recovery/removal. Avoid unbounded parallel hydration.

### 12. Feed labels overstate personalization and currency

**Observed + Code.** Signed-out visitors see “Selected for you” even though their profile is empty. Search results retain that heading and the fixed “Today” label; the PostgreSQL result featured a story dated 14 October. Historical mixing is intentional and carries archive labels in its archive lane, but the surrounding daily-edition language does not explain the overall content policy.

**Required:** distinguish editorial/default discovery, personalized recommendations, search results, and latest publication. Label the date as the edition date when that is what it means. Offer a clear preference for historical discoveries versus chronological writing.

### 13. Trending mixes popularity and discovery without identifying each row

**Observed + Code.** The live ranking contained real activity followed by zero-activity fillers. The introduction does disclose that recent stories round out the top ten, which is a good safeguard, but all rows still receive equivalent numbered ranks. Global counts on cards are all-time while Today/This week ranking uses windowed activity, making visible counts insufficient to explain order. There is no minimum readership confidence indication.

**Required:** mark discovery fillers separately; explain the time window and weighting; choose whether to show windowed counts alongside all-time totals; show an honest low-activity state. Do not fabricate social proof.

### 14. Degraded data states can look like normal content or missing articles

**Code.** `render-reader.tsx` catches ranking/storage errors and returns a chronological archive slice of up to 100 articles, including for Trending, without a degraded-mode explanation. The normal feed page size is 12. Initial rendering ignores company/query parameters; the browser observed the general feed first at `/?company=linkedin`, followed by the filtered empty state after hydration.

`loadArticle` converts a database failure into seed fallback or null. A real live-only article can therefore appear not found during an outage. Global error/loading boundaries are absent from the app routes.

**Required:** consistent fallback pagination, stale-data notices, accurate distinction between unavailable and not found, server-side initial filter handling, and recoverable error boundaries. Test failure states explicitly.

### 15. Accessibility and mobile polish need targeted acceptance

**Observed + Code.** The narrow running UI fits its viewport and has skip links, labeled buttons, reduced-motion styles, and keyboard-operable library tabs. However, small metadata/tag text is often 9–11px. Article topic buttons have approximately 21px-tall visual boxes, and other compact controls need touch-target review. Search/subject result changes lack a dedicated result-count announcement; internal view changes do not establish route focus.

The activity calendar creates 84 or 371 individually tabbable day buttons with no grid arrow-key model. A keyboard reader must traverse those controls to reach later sections. UTC is explicitly labeled, but it may not match a reader's expected daily habit boundary.

**Required:** keyboard/screen-reader acceptance, contrast and zoom measurement, adequate target spacing, mobile Safari/Android checks, roving calendar focus, result announcements, and a deliberate timezone policy. This was not a formal accessibility conformance audit.

### 16. Capacity and abuse resistance need evidence

**Code; risk, not an observed load failure.** A cache miss performs full-archive SQL ranking and stores ordered IDs/details for every matching article. Public searches can generate distinct cached editions, and the app has no request-level rate limiter for that work. Content, engagement, and semantic revisions contribute to cache invalidation. A cache lookup and insert are not protected by a unique request-hash constraint, so simultaneous misses can duplicate ranking/storage work.

The scheduled cleanup removes at most 20 expired sessions per five-minute run: 240 per hour. Sustained creation above that rate can accumulate expired session data. Local preview has no equivalent scheduler cleanup; the local snapshot contained 328 sessions, 325 expired. That is not a claim about remote backlog.

Semantic neighbor generation is documented as quadratic. The entire profile is also sent for personalized requests and rewritten for many small changes. These are manageable at current scale but should not be assumed to meet large-company traffic expectations.

**Required:** representative load and database-cost measurements, bounded admission/rate control, deduplicated cache creation, cleanup that keeps up with creation, indexed query review, and a measured archive/index growth plan. Define latency/error budgets before optimizing.

### 17. Operational and product feedback loops are incomplete

**Code + documented acceptance gaps.** Console logs and status APIs exist, but the checkout does not establish client error reporting, actionable alerting, backup retention, or recurring recovery drills. No measured activation/return-reading funnel is implemented. There is no in-product route to report a broken original link, bad metadata, or an account problem.

**Required:** attributable error reporting and source alerts; tested restore procedures; support/reporting paths; privacy-conscious metrics for finding a useful story, following, saving, returning, and reaching the original. These are operating capabilities independent of deploying the website.

## P3: simplify and align

- Feed, library, and detail copy alternate between feed and edition; choose a consistent user-facing vocabulary.
- Repeated zero bookmarks/read counts occupy space before community activity is meaningful. Keep personal actions clear while reducing low-value social decoration.
- The article-detail step adds a click before the publisher. Offer a clearly labeled direct-original action in the feed while preserving details for readers who want excerpts and logging.
- The hero and logo strip occupy most of the first narrow viewport before useful reading. Consider a compact returning-reader header.
- Companies sort by archive size by default, strongly favoring heavily backfilled publishers. Add an editorial/freshness-aware starting point and show publication/collection age on the latest-story preview.
- Bookmark removal and edition deletion have no undo flow; accidental clicks are harder to recover from than they should be.
- Add useful share metadata/canonical handling and unique titles for major routes. Trending and Feed currently share the root title.
- Retire stale documentation/counts and unused components as behavior stabilizes. The README still describes continuous loading although the current feed uses numbered pagination.

## Recommended implementation sequence

1. Fix silent validation failures, expose save state everywhere, and implement sync recovery/reconciliation.
2. Preserve browsing state and sign-in intent; move feed/filter controls above results.
3. Correct source availability claims, excerpt quality, tag ordering, and Trending explanations.
4. Finish account data controls and a scalable, recoverable library.
5. Complete real-account, accessibility, failure-mode, restore, and load acceptance; add feedback and monitoring.

The first simplification should be removing repeated zero social counts. More features should not precede reliable completion of the core find → read → save → return loop.

## Verification and limits

- Live browser inspection: Feed, keyword search, sign-in redirect/component, article details, Trending, Companies, and the LinkedIn empty feed, at the current narrow in-app viewport.
- Read-only local aggregates: content completeness, source-health errors, empty publishers, and expired feed-session counts. No account content was printed.
- Current automated check: **87 JavaScript/TypeScript tests passed, zero failures**.
- Current TypeScript check: `tsc --noEmit --incremental false` passed.
- Direct validation probes confirmed both exclusion-limit mismatches.
- No app implementation changes, deployment, remote database queries, account login, destructive operations, or load generation were performed. This report is the only new deliverable.
- Signed-in UI findings are source-derived; they are not claimed as manually reproduced account failures. Cross-browser/device acceptance, formal accessibility, production performance, and security penetration testing remain unverified.
