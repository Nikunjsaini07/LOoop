# Deploy Readwell

## What goes where

| Part | Destination | Source or output |
| --- | --- | --- |
| Website, React client, API, fonts and images | Cloudflare Workers with Static Assets | Build from this folder; deploy `dist/server/wrangler.json` |
| Stories, profiles, saves, read logs, feed editions | Existing Cloudflare D1 database `reads` | Bind it as `DB`; do not upload local SQLite files |
| Scheduled article collection | Existing `readzz-ingestion` Cloudflare Worker | `workers/ingestion.ts`; same D1 database |
| Sign-in and identity | Clerk production application | Production keys, providers, domain and deletion webhook |
| Semantic index generation | Separate Node/Python maintenance job | `scripts/semantic-index.mjs --remote`; never run model inference inside the web Worker |

The app imports `cloudflare:workers` and uses D1 bindings. The supported handoff is a Workers deployment. Uploading just `public/`, using a static Pages project, or running a stock Next.js/Vercel build will not run this application.

The standalone build has no ChatGPT Sites hosting or connector dependency.

## 1. Start from the clean source

Run `npm run release:source` in the original project and extract the generated ZIP into a new folder. The archive contains a `readwell/` root directory. Use that directory as your repository/build root.

Install Node 22 LTS (22.13 or newer). From that root:

```powershell
npm ci
Copy-Item .env.production.example .env.production
```

Fill in the Cloudflare account ID, the **existing reads database ID**, the intended HTTPS origin, and Clerk's live publishable key. IDs and the publishable key are public configuration. The template deliberately has no private credentials.

For Workers Builds/Git integration, use the same values as build environment variables instead of committing `.env.production`. Set build command `npm ci && npm run build:production` and deploy command `npm run deploy`. Keep automatic deployments disabled until you choose to enable them. The repository CI file included here never deploys.

## 2. Configure Clerk and Worker secrets

In Clerk, create/configure the production instance, enable the desired login providers, and configure your final domain. Use these app routes:

- Sign-in: `https://YOUR_DOMAIN/sign-in`
- Sign-up: `https://YOUR_DOMAIN/sign-up`
- Sign-out destination: `https://YOUR_DOMAIN/`

Run `npm run production:check`. This generates ignored `.wrangler.production.json` with the exact origin allowlist and database binding.

Authenticate Wrangler using `npx wrangler login` locally, or set a scoped `CLOUDFLARE_API_TOKEN` in your CI secret store. Add runtime secrets using the dashboard or interactive commands:

```powershell
npx wrangler secret put CLERK_SECRET_KEY --config .wrangler.production.json
npx wrangler secret put CLERK_WEBHOOK_SIGNING_SECRET --config .wrangler.production.json
```

Use the **live** Clerk secret key. For the signing secret, configure Clerk's `user.deleted` webhook to `https://YOUR_DOMAIN/api/webhooks/clerk` and copy its signing secret into the Worker secret. Retry delivery after the domain is live. An optional `CLERK_JWT_KEY` secret can enable networkless token verification.

Secrets are Worker runtime configuration; setting only CI build secrets does not configure the deployed Worker. Do not commit private keys, local environment files, databases or backup exports.

## 3. Check the existing database before changing schema

The existing remote archive has already been imported in this project's earlier work. Bind that database; do not create an empty replacement or re-import the entire collector unnecessarily.

Inspect it with a read-only command:

```powershell
npx wrangler d1 execute DB --remote --config .wrangler.production.json --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name; SELECT name FROM readzz_migrations ORDER BY name; SELECT COUNT(*) AS articles FROM articles; PRAGMA foreign_key_check;"
```

The full schema is the committed sequence `drizzle/0000_*.sql` through `0006_*.sql`. It includes semantic generation columns and `reader_reports`. An existing database may not use Wrangler's migration ledger: **do not run the entire sequence against it blindly**. Back it up, inspect actual schema, and apply only verified missing migrations. Base migrations and ALTER TABLE migrations are not all safe to replay.

A genuinely new database needs the complete ordered schema and company/topic catalog initialization, then article import. This is a separate data migration; the web deploy does not perform it. Use existing reviewed administration scripts rather than request-time table creation.

## 4. Build, inspect and publish

```powershell
npm test
npm run typecheck
npm run lint
npm run build:production
npm run deploy:check
npm run deploy
```

`build:production` validates public configuration, builds the Worker/client and checks the generated binding. `deploy:check` performs Wrangler's local dry run; it does not publish. `deploy` requires the matching production manifest, preventing an ordinary local build from being released accidentally.

Deploy from the generated config. It supplies the Worker code and adjacent `dist/client` asset directory together; do not drag-upload individual output folders.

In Cloudflare, add your final custom domain under the web Worker's Settings â†’ Domains & Routes. Its HTTPS origin must exactly match `APP_ORIGIN`. A different origin requires updating production settings and rebuilding. Set production Worker secrets before accepting account traffic.

## 5. Verify on the final domain

- `/`, `/companies`, `/trending`, real article links, styles/fonts and the guest route load.
- `/api/ready` returns HTTP 200 and `ready: true`. A 503 response names failed setup checks without returning secrets/account rows.
- Readiness requires the schema, at least one article, live auth settings, a configured deletion signing secret and an ingestion heartbeat newer than 30 minutes. It does not prove OAuth or webhook delivery; test those separately.
- `/api/health` reports source failures and stale ingestion. It intentionally uses HTTP 200 for degraded collection, so monitor its JSON status as well.
- Sign in with a real test account; save/follow/log a story, reload, then verify it in a second browser. Confirm sign-out and account isolation.
- Send a Clerk test deletion event for a disposable test account and confirm successful delivery. Test real phone navigation and keyboard operation.

Local checks cannot certify these live account/domain integrations.

## 6. Keep collection and semantic data current

The existing ingestion Worker runs every five minutes and normally checks due sources on a six-hour interval. Leave it running against the same `reads` database. Website deployment does not redeploy or replace it.

If redeployment is needed, `node scripts/ingestion.mjs --deploy` is an explicit separate operation. That administration helper reads the Cloudflare IDs from ignored `.env.local`; verify they match the web production binding first. See INGESTION.md.

Semantic metadata is computed outside Workers. A maintenance runner needs the Node dependencies, Python/NumPy, the model cache and scoped Cloudflare credentials. The existing semantic helper also reads remote IDs from `.env.local`. Fresh stories remain readable before embedding completes. Index scheduling and its operator are not provisioned by the web deployment.

## 7. Monitoring, backups and rollback

Enable Workers logs (the generated config enables observability), then connect an external monitor to `https://YOUR_DOMAIN/api/ready` and inspect `/api/health` for collection degradation. Choose an owned alert destination and verify a test alert. Store reports require a review owner; creating a row does not send an email.

Before schema/data maintenance, create a full private SQL export:

```powershell
npx wrangler d1 export DB --remote --config .wrangler.production.json --output /PRIVATE_BACKUP_LOCATION/readwell-before-change.sql
```

Store exports outside the repository in access-controlled off-device storage. Define a daily schedule and retention with your operator; no external backup scheduler is configured by this source package. Restore a backup into a **separate temporary database**, check integrity/foreign keys and counts, and only then plan any real recovery. Never test a restore by overwriting `reads`.

Cloudflare D1 also provides Time Travel; check your database's retention window before relying on it. Export/recovery references: [D1 export](https://developers.cloudflare.com/d1/best-practices/import-export-data/), [Time Travel](https://developers.cloudflare.com/d1/reference/time-travel/).

For code rollback, select a previous deployment in Workers deployment history or use `wrangler rollback` for the web Worker. Code rollback does not reverse database migrations, so keep schema changes backward compatible and retain pre-change backups.

## Verification boundary

The source targets the pinned Vinext 1.0.0-beta.5 runtime and Cloudflare Vite plugin 1.37.1. Keep the lockfile and test framework upgrades separately. Passing unit/type/lint/build checks and a local deployment dry run do not establish production load capacity, real-account acceptance, alert delivery or remote recovery.

Local verification on 21 October 2026: the extracted clean package passed 121 tests, type checking and the production build. Wrangler's deployment dry run succeeded (637.31 KiB gzip). All 24 direct built-Worker HTTP acceptance checks passed against the persisted local archive. The separate Wrangler development proxy still timed out on the invalid-page-size GET; direct Worker requests returned the expected 400. Treat this as an unresolved local preview issue, and verify the actual deployed runtime before launch.

Official platform references: [Cloudflare Vite deployment](https://developers.cloudflare.com/workers/vite-plugin/get-started/), [Vite plugin configuration](https://developers.cloudflare.com/workers/vite-plugin/reference/api/), [Worker secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
