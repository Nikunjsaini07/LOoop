# Production setup and decisions

The current app is a functioning local prototype with an imported article database, internal article pages, custom feeds, recommendations, bookmarks and explicit reading logs. A public production deployment and a new authentication provider have not been configured.

## Current connections

| Item | Current value |
| --- | --- |
| App | `http://127.0.0.1:5173/` |
| Article API | `http://127.0.0.1:5173/api/articles` |
| Original collector | `../data/blogs.sqlite3` |
| Runtime database | Local Cloudflare D1, accessed as `env.DB` |
| Local database persistence | `.wrangler/state/` (ignored by Git) |
| Imported archive | 1,260 articles, 36 companies with articles, 37 configured sources |
| Schema/migration | `db/schema.ts`, `drizzle/0000_glamorous_richard_fisk.sql` |
| Current authentication | Sites-owned ChatGPT identity; development-only local mock |
| Guest profile | Browser-local storage |
| Signed-in profile | D1 `profiles` row keyed by verified account ID |
| Remote database | Existing `reads` D1, imported and verified; separate from local preview |
| Scheduled ingestion | Deployed `readzz-ingestion` Worker; five-minute trigger, six-hour normal source interval |

D1 uses a Worker binding, rather than a PostgreSQL-style `DATABASE_URL`. Local files and the localhost API are not public database endpoints. Database contents and user profiles are not committed to Git. The bundled `lib/server/seed.json` is a public article fallback.

The remote archive now updates independently of website traffic. See [INGESTION.md](INGESTION.md) for the deployed scheduler, source coverage, failure handling and verification commands. The public website itself is not deployed or bound to remote D1 yet.

Repeat a collector import after collecting new articles:

```powershell
python scripts/import-collector.py --verify
```

This copies a read-only snapshot into local D1, preserving profiles and existing article IDs. It is not a continuous connection to the collector's SQLite file.

## Connect the existing Cloudflare D1 database

Store `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_D1_DATABASE_ID` in the ignored `.env.local` file. Authenticate Wrangler using its normal login flow or an appropriately scoped environment token; never commit credentials. The helper uses this project's installed Wrangler and always passes `--env-file .env.local`.

```powershell
# Read-only remote inspection; this is also the default with no arguments.
node scripts/cloudflare-db.mjs --inspect

# Explicitly import the public collector archive into the configured remote DB.
node scripts/cloudflare-db.mjs --import

# Compare every collector article against remote D1 without changing it.
node scripts/cloudflare-db.mjs --verify
```

The helper resolves the database's real name from `d1 list` within the configured account and saves a separate binding config under ignored `outputs/cloudflare-d1/`. It never changes the local preview binding, creates/deletes a database, or changes `.openai/hosting.json`. Uploading the database does not deploy the website or connect the running local preview to the remote database.

Before import it exports the remote schema and rejects partial/incompatible app tables or unreviewed app triggers. A database with no app tables receives the committed initial migration; existing compatible tables are retained. If any user tables already exist, a full pre-import SQL backup is saved under `outputs/cloudflare-d1/`. Cloudflare notes that remote exports can briefly make the database unavailable to queries, so schedule repeat imports appropriately once the app is live. Keep these ignored backups private because an existing database can contain user profiles.

Only public articles and source health are uploaded. The article upserts retain existing IDs, earliest discovery timestamps, extra remote articles, and newer source refresh status. Every source URL/company/discovery timestamp is checked, existing IDs are checked, and profile counts must remain unchanged. A public verification manifest is generated from the same collector read transaction as the SQL snapshot. Rerunning an import is idempotent. The helper reports the actual verified count instead of assuming the archive will always contain 1,260 articles.

These commands administer D1 only. They do not create a daily ingestion schedule, enable authentication, publish the app, or replace its production Worker binding. Review pending schema migrations explicitly as the app evolves; this helper deliberately refuses to guess how to repair an incompatible remote schema.

References: [D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/), [Wrangler D1 commands](https://developers.cloudflare.com/d1/wrangler-commands/).

## Authentication recommendation

Recommended for a standalone public reading product: **Clerk**, initially Google and GitHub sign-in, with email as an optional fallback. Keep the site's own typography and page layout around the auth flow. Clerk is the identity provider; app profiles, read logs and bookmarks remain in the application database, linked by verified Clerk user ID.

Firebase Authentication is a sound alternative when the project is intentionally based on Firebase/Google Cloud. Google sign-in is a login method that both providers can support, not a competing complete application backend.

The app currently uses Vinext on Cloudflare Workers, not stock Next.js on Vercel. Do not assume a Next.js-only authentication middleware will be compatible. Validate a small Clerk client/backend integration against this runtime first. Use Clerk's supported frontend SDK and request authentication on protected server APIs; verify issuer/session/origin and use the verified user ID. Never accept a client-provided owner ID as authentication. Sites-injected identity headers are only trusted behind the Sites hosting dispatch; they are not a standalone auth mechanism on arbitrary hosting.

Existing ChatGPT-owned profiles and new Clerk-owned profiles are separate identities. Switching providers requires an explicit account-linking/migration plan; do not silently merge browser histories or accounts by email.

Official references checked on 19 October 2026:

- [Clerk JavaScript quickstart](https://clerk.com/docs/js-frontend/getting-started/quickstart)
- [Clerk backend request authentication](https://clerk.com/docs/reference/backend/authenticate-request)
- [Firebase Authentication for websites](https://firebase.google.com/docs/auth/web/start)
- [Cloudflare D1 Worker API](https://developers.cloudflare.com/d1/worker-api/d1-database/)

## Inputs needed for deployment

1. **Hosting choice:** keep Cloudflare Worker + D1, or approve a platform/database migration. Keeping the existing stack avoids an unnecessary data migration for the first launch.
2. **Repository:** GitHub repository URL and normal authenticated Git access. Local commits do not push or publish the code.
3. **Domain:** intended production domain/origin and access to configure its DNS. Redirects and allowed auth origins must match it.
4. **Clerk app (if selected):** publishable key, backend secret key or appropriate JWT verification key, enabled sign-in providers and production auth domain/redirect settings. Configure keys in local environment/hosting secrets; do not paste private keys into chat or commit them. Provider client credentials belong in the auth provider's dashboard. Webhook signing secret is needed only if webhook handlers are implemented.
5. **Cloudflare production database:** account/project access and real D1 database ID/binding `DB`; apply migrations and import the public archive there. Do not substitute the preview's placeholder database ID.
6. **Daily ingestion:** the scheduled Worker is deployed against remote `reads`. Confirm source health and hosting limits, add external alerts if needed, and bind the public app to the same database. Local preview remains independent.
7. **Operations:** backup/restore policy, error reporting and basic service monitoring. Add email-provider credentials only if email digests are actually implemented; the current Digest cadence selector is a saved preference, not an email delivery system.

## Development order

1. Keep the existing UI and verify the complete article → original → explicit read log → profile flow.
2. Integrate the selected identity provider and test account isolation, ownership checks, sign-out, and interrupted saves.
3. Provision production data storage, apply migrations, import content, and verify reads/writes using a real account.
4. Operate the deployed scheduled ingestion: review source failures, verify daily coverage and configure external alerts.
5. Server recommendations and authentic event-based trends are implemented; review quality and performance with real users. See RECOMMENDATIONS.md.
6. Publish staging, verify desktop/mobile and accessibility, then launch the production domain.

## SQL domain upgrade

Company/source/topic entities, keyword aliases, article-topic links, normalized user-history projections and server-ranked feed editions are implemented. Both local and remote databases have been migrated with backups and identity preservation checks. See [RECOMMENDATIONS.md](RECOMMENDATIONS.md) for current behavior and verification commands.
