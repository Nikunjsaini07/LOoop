> Historical audit from before the Vercel/Cloudflare split. For the current architecture and deployment instructions see DEPLOYMENT.md. See SPLIT_DEPLOYMENT_CHECK.md for verification of the split.

# Release audit — 21 October 2026

## Passed

- All 81 JavaScript/TypeScript tests and 26 Python tests passed in the current saved checkout.
- Full-project ESLint passed without warnings after excluding generated output and fixing application errors.
- TypeScript passed with `--noEmit --incremental false`.
- Production Vinext build completed. Its static analyzer labels the auth routes unknown; both served HTTP 200 in the built preview.
- Built-worker HTTP checks passed for Companies, Trending, sign-in, a real article and a missing article.
- A clean build produced client CSS/JavaScript and the home page’s referenced asset URLs returned HTTP 200. Stop the built preview before rebuilding on Windows: its file locks can prevent build cleanup and leave partial output.
- Built-worker APIs rejected signed-out profile reads/writes and malformed authentication with 401, and rejected cross-origin profile writes with 403.
- Feed pages retained their edition with no duplicate articles across pages. Company filtering, 40-company directory and trending results passed.
- Local SQLite backup restored into a separate database with matching table counts, successful integrity check and no foreign-key errors. The source database was opened read-only.
- Remote D1 ranking query, 40-company catalog, 15-topic catalog and foreign-key checks passed using read-only queries. Remote D1 does not authorize SQLite `PRAGMA integrity_check`; full remote physical integrity was not tested.
- Remote ingestion heartbeat was three minutes old when checked. Its scheduled worker is running.

## Fixed during the audit

- ESLint no longer scans generated Wrangler, build or QA bundles.
- Rendering reads profile identity from React state; mutable refs remain internal to asynchronous persistence.
- Sign-in return-path hydration uses an external-store subscription.
- Production browser testing exposed a Vinext RSC navigation/prefetch error. A shared native `PageLink` now handles cross-page links without the failing framework prefetch path. In-feed view switching keeps its existing behavior.
- The final built browser preview verified that “Continue reading without an account” navigates from sign-in to the fully rendered feed after this fix.
- Engagement polling declares its initial-refresh dependency correctly.
- README, production setup, API and recommendation notes now describe Clerk, the current Companies/Profile design and refresh-stable feed editions.

## Open before launch

1. **Archive parity — resolved:** the authorized follow-up sync on 21 October copied 4,416 missing public articles into remote `reads`. Every one of the 6,061 articles in the local snapshot is verified in Cloudflare. Remote now contains 6,064 articles, including three cloud-only stories retained intact. Existing remote article IDs/metadata and hashes of profiles, follows, bookmarks, reading logs and engagements were unchanged; foreign keys passed. A full remote backup preceded import. Verification: `outputs/archive-sync/2026-10-21T02-11-21-258Z-apply-report.json`. The local count grew from the original audit’s 6,058 through normal ingestion.
2. **Publisher coverage:** remote source health reported a GitHub feed parsing error and an Anthropic listing extraction error. LinkedIn remains deliberately manual because no authorized automatic source is configured. Other remote sources had no recorded errors at the time of inspection.
3. **Real account acceptance:** automated token validation, account isolation, conflicts and interrupted-save tests passed. The built application redirected a signed-out profile visit to `/sign-in?return_to=%2Fprofile`; Clerk loaded Google, GitHub, X and email login options. Completing login, sign-out and persistence in a second browser was not tested because no authenticated account session was available. No credentials were submitted.
4. **Operations:** existing administration scripts create pre-change SQL backups and Worker logs record source failures. Scheduled backup retention, external failure notifications and a remote recovery drill are not configured/verified by this audit. The successful recovery drill was local and isolated.
5. **Sync recovery:** conflicting device data is retained, but no user-facing recovery/merge screen exists. This is a known optional improvement, not a silently implemented feature.

The original audit made read-only remote checks. The user then explicitly authorized the archive sync described above; it imported public articles only. No website deployment was performed and no credentials were entered into a login form. The local application’s normal traffic-driven refresh may add public articles during HTTP checks.

Theme and semantic-feed changes were also arriving in the shared workspace during this audit. This report describes the saved code and outputs that were checked, rather than certifying any later changes.

## Re-run

```powershell
node --experimental-strip-types --test components/BlogReader.test.mjs lib/useReadingProfile.test.mjs lib/server/*.test.mjs scripts/cloudflare-db.test.mjs
python -m unittest discover -s scripts -p 'test_*.py'
npm run lint
node node_modules/typescript/bin/tsc --noEmit --incremental false
npm run build
node scripts/ingestion.mjs --status
node --experimental-strip-types scripts/verify-domain.mjs --remote
```

Local backup copies and HTTP-check helpers are under ignored `outputs/`. Treat database copies as private; they can contain account data.
