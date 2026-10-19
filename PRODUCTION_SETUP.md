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
| Public production database | Not provisioned/verified in this checkout |

D1 uses a Worker binding, rather than a PostgreSQL-style `DATABASE_URL`. Local files and the localhost API are not public database endpoints. Database contents and user profiles are not committed to Git. The bundled `lib/server/seed.json` is a public article fallback.

Repeat a collector import after collecting new articles:

```powershell
python scripts/import-collector.py --verify
```

This copies a read-only snapshot into local D1, preserving profiles and existing article IDs. It is not a continuous connection to the collector's SQLite file.

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
6. **Daily ingestion:** provision an unattended scheduled refresh/queue with retries and monitoring. Current refresh is traffic driven; visiting the app is not a guaranteed daily full crawl.
7. **Operations:** backup/restore policy, error reporting and basic service monitoring. Add email-provider credentials only if email digests are actually implemented; the current Digest cadence selector is a saved preference, not an email delivery system.

## Development order

1. Keep the existing UI and verify the complete article → original → explicit read log → profile flow.
2. Integrate the selected identity provider and test account isolation, ownership checks, sign-out, and interrupted saves.
3. Provision production data storage, apply migrations, import content, and verify reads/writes using a real account.
4. Add scheduled ingestion, deduplication, source health, retry/backoff and observability.
5. Refine recommendations from explicit interests, follows, saved items and read history. Avoid invented global popularity metrics.
6. Publish staging, verify desktop/mobile and accessibility, then launch the production domain.
