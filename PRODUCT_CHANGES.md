# Product improvements — 21 October 2026

Scope: local Readwell implementation and verification following `PRODUCT_AUDIT.md`. No deployment, publication, remote database migration, or remote account configuration was performed. The original audit records the state before these changes.

## Implemented

| Audit area | Result |
| --- | --- |
| Saving and public totals | One version-checked D1 transaction commits the private profile and its public contributions. Losing writes and quota failures leave no partial changes. |
| Save recovery | Visible pending/error notices, bounded retries, foreground refresh, cross-tab notification, downloadable account/device copies, and an explicit choice after conflict. Further edits pause until the conflict is resolved. |
| Form limits | Invalid feed drafts remain open with actionable errors. UI and domain limits agree. Profile mutations return success/failure. |
| Account controls | Export, reading-data reset, optional identity deletion, privacy explanation, and signed Clerk deletion webhook. A generation marker prevents stale tabs from recreating deleted data. |
| Navigation | Search, company, topic, custom feed, period, page, and edition survive links/reloads. Article links return to their reading context. Expired editions receive an explicit fresh-start notice. Sign-in retains one short-lived intended action. |
| Reading controls | Feed and filter controls precede results. Direct publisher links and explicit save/read labels reduce navigation and ambiguity. Repeated zero social counts and the extra hero logo strip were removed. |
| Libraries | Search, ordering, 20-item pages, bounded hydration, loading/error/retry states, unavailable-item handling, and bookmark removal undo. |
| Source trust | Manual publishers are identified honestly; LinkedIn has an explicit unavailable state and publisher link. Collection delays and cached article fallback are disclosed. |
| Content and Trending | Removed overly broad Product classification terms, repaired local topic data, improved title-specific topic ordering and excerpt display, labeled unranked discovery fillers, and explained Trending activity windows. |
| Accessibility | Larger action targets, stronger light-theme muted text, focus states, live status notices, responsive toolbar/forms, and keyboard navigation for the activity calendar. |
| Failure states | Recoverable page error boundary, loading state, explicit article-unavailable behavior, library retry, and private story reports. |
| Capacity and operations | Bounded cold-query admission, deterministic concurrent cache reuse, bounded stale-cache cleanup, aggregate health endpoint, local backup/restore verification, and isolated query benchmark. |

## Verification

- 101 automated regression tests passed with zero failures. These cover transaction rollback, retries/conflicts, account isolation, deleted-account stale-write rejection, validation, public feed rules, semantic ranking, pagination, and source handling.
- TypeScript, ESLint, and the production build passed.
- The development preview passed 20 HTTP route/API cases without worker restarts, including filtered server rendering, empty manual sources, pagination uniqueness, error responses, unauthenticated mutation rejection, and cross-origin write rejection.
- The built local worker passed all 24 HTTP cases, including compiled JS/CSS assets, when tested directly with the same local bindings. No retries or restarts occurred. Its separate Wrangler preview proxy did **not** pass: route transitions produced “Your worker restarted mid-request” and the invalid-page-size GET timed out. Direct requests to that same worker returned the correct 401/403/400 responses. This isolates an unresolved local preview-proxy issue; it does not certify a remote runtime. The HTTP script only permits one explicitly recorded retry of unsigned rejection probes; application failures are never retried by the script.
- Browser checks exercised search, filter clearing, article context links, the manual-source empty state, Trending discovery labels, and desktop/narrow layouts.
- The local 6,073-article archive was backed up and restored to a separate verification copy before topic/cache maintenance. Article identities and existing private data were preserved; 853 topic lists were repaired and 325 expired editions removed.
- An isolated in-memory SQLite benchmark measured 10 cold queries (p50 165.7 ms, p95 857 ms), 30 cached queries (p50 20 ms, p95 27.2 ms), and 20 concurrent identical requests sharing one edition. These exclude browser, network, and remote D1 latency and do not certify production capacity.

## Acceptance still required

- Resolve Wrangler's local preview-proxy restarts/timeouts if using `npm start` for acceptance. Direct built-worker checks pass; the proxy route is not yet reliable.
- Real-account browser acceptance: the test-account sign-in handoff is pending. Verify persistence after reload, sign-in intent, cross-tab conflict recovery, custom-feed editing, and account switching through the actual provider session. Automated coverage is not a substitute for this check.
- Configure and verify the Clerk deletion event subscription and signing secret. The handler is implemented and fails closed when unconfigured; deletion outside Readwell is not connected until this setup is complete.
- Connect health/error signals to an owned monitoring destination, alerts, and a report-review workflow. Reports currently remain in the application database; no email delivery or support response time is promised.
- Define service latency/error budgets and measure representative remote database cost, concurrency, archive growth, and semantic-index growth. The local benchmark is an initial baseline.
- Complete real-device, cross-browser, screen-reader and keyboard acceptance. Current checks do not constitute a formal accessibility audit or penetration test.
- Establish recurring off-device backups and recovery drills. The verified local backup and bounded local retention are implemented; an independently operated backup service is not configured.
- Finish later refinements from the original audit: richer canonical/share metadata, a freshness-aware company-directory default, privacy-conscious product outcome measurement, and broader account-problem support.

The changes improve the core find → read → save → return experience. Large-company product readiness still depends on the acceptance and operating work above.

## Reading-continuity follow-up

- Replaced the profile's unread-recommendation card with the actual latest read, or a more recently opened publisher story. Existing read logs provide the last-read card immediately; a newly stored private `lastOpened` reference makes later publisher opens resumable without marking them complete.
- Included the last-opened ID in bounded library hydration. Loading, failed hydration, and unavailable metadata retain the history reference and show a relevant state rather than the empty-library invitation.
- Removed successful account-sync banners and duplicate storage labels. Pending saves use a small fixed status so they do not move the story being read; errors and recovery controls remain visible.
- Removed the development-mode badge from the local preview through Clerk's supported appearance option. Authentication remains the configured development instance. Production builds do not suppress that warning if accidentally configured with test keys.
- Added regression coverage for last-read selection, resume persistence, history loading failures, and quiet healthy sync. The updated 108-test suite passes. Browser inspection confirms the local sign-in badge is absent; signed-in visual acceptance still requires a real browser session.

## Sign-in presentation follow-up

- Replaced the isolated “Opening sign-in…” message with a reading-account card, an explicit provider-loading placeholder, and a recovery action after ten seconds or a provider failure. The actual Clerk sign-in and sign-up forms remain in use.
- Guest browsing stays accessible during loading and failures. It preserves public return destinations while routing private profile/settings destinations to the public feed.
- Removed the decorative sky and dotted background on account entry pages. Added a forest accent, bookmark detail, light/dark styling, reduced-motion handling, and larger form targets.
- Verification: all 114 JavaScript/TypeScript regression tests pass; TypeScript and focused ESLint pass. Browser checks confirmed the real GitHub, Google, X and email controls, sign-up navigation, and 390px/320px layouts without horizontal overflow. These checks do not complete the real-account acceptance or operational items above.

## Standalone deployment handoff

- Added a direct Cloudflare Worker entry and configuration, replacing Sites/connector dependencies in the application build. Kept the local D1 identity and persisted database intact.
- Reduced declared runtime dependencies from 26 to 8 and regenerated the lockfile. Added standalone source packaging, example environments, a checks-only GitHub workflow, response security headers and `/api/ready`.
- Production commands validate the live public key, origin and real database binding; deployment requires a matching verified build. Runtime readiness fails when the schema, article archive, live authentication, webhook signing secret or scheduler heartbeat is missing.
- The clean ZIP excludes 114 audited starter/tooling/asset files; original workspace removal was blocked by automatic approval review. Originals and a recoverable ZIP remain under local control, and private state/backups are excluded from the deployment handoff.
- The extracted source passes 121 regression tests, TypeScript and the production build. Wrangler's local deployment dry run passes (637.31 KiB gzip). The separate original maintenance suite passes 26 Python tests. A client-output scan found no configured secret values in 41 generated client files.
- All 24 direct compiled-Worker HTTP checks pass. Wrangler's separate local proxy still times out for the invalid-page-size GET, which returns 400 directly. Live account/domain/device acceptance, external monitoring/backup configuration and remote recovery remain operator work; no publication or remote changes were performed.
- Use DEPLOYMENT.md for the exact service mapping, commands, secrets, data precautions and rollback procedure. The public collector sources are included under `collector/` in the clean ZIP so its tests and optional maintenance scripts work without the original parent workspace.
