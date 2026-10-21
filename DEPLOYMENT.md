# Deploy Readwell: Vercel + Cloudflare

The code is split: **Vercel website → private Cloudflare API → existing D1 database**. The existing article collector stays on Cloudflare. No beta Vinext runtime or ChatGPT Sites service is required.

All commands below run from the folder containing `package.json` (`scroll-app` in the original workspace). Keep private local files and `.wrangler/state/`. The migration did not move or replace database contents.

## 1. Decide the website address and configure Clerk

Choose the exact HTTPS address visitors will use. Configure it on your Vercel project. Clerk production setup requires a domain you control; complete its production domain/DNS setup and enable the sign-in methods you want. A `vercel.app` preview with development keys is a test deployment, not this guide's production setup.

From Clerk's production instance get the publishable `pk_live_...` key and private `sk_live_...` key. Use the same Clerk instance on both hosts.

- Sign-in path: `/sign-in`
- Sign-up path: `/sign-up`
- After sign-out: `/`
- After sign-in: `/profile`

References: [Clerk production deployment](https://clerk.com/docs/guides/development/deployment/production), [Vercel domains](https://vercel.com/docs/domains/working-with-domains/add-a-domain).

## 2. Configure and deploy the Cloudflare API

Keep the existing `reads` database and existing ingestion Worker. Do not create an empty replacement database or replay all migrations against an existing archive.

```powershell
npm ci
Copy-Item .env.production.example .env.production
```

Fill in `.env.production`:

| Setting | Value |
| --- | --- |
| `CLOUDFLARE_ACCOUNT_ID` | Your intended Cloudflare account ID |
| `CLOUDFLARE_D1_DATABASE_ID` | UUID of the existing `reads` database |
| `CLOUDFLARE_D1_DATABASE_NAME` | `reads` |
| `READWELL_WORKER_NAME` | `readwell-api` |
| `APP_ORIGIN` | Exact website origin, such as `https://readwell.example.com` |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk production `pk_live_...` key |

Existing account/database IDs are in ignored `.env.local`. They are identifiers, not passwords. Confirm that the saved Wrangler login belongs to your intended account:

```powershell
npx wrangler whoami
# If that is not your intended account:
# npx wrangler logout
# npx wrangler login
npm run production:check
```

This generates ignored `.wrangler.production.json` containing public backend configuration only. Inspect the existing schema with a read-only query before deploying:

```powershell
npx wrangler d1 execute DB --remote --config .wrangler.production.json --command "SELECT COUNT(*) AS articles FROM articles; SELECT name FROM sqlite_master WHERE type='table' ORDER BY name; PRAGMA foreign_key_check;"
```

The schema must include the committed migrations through `0006_reader_reports.sql`. If readiness reports a missing schema, inspect and back up the database before applying only verified missing migrations. Website deployment never performs a data migration.

Check and publish the backend:

```powershell
npm test
npm run typecheck
npm run lint
npm run build:backend
npm run deploy:backend
```

The backend deploy prints a URL such as `https://readwell-api.YOUR_SUBDOMAIN.workers.dev`. Keep that URL for Vercel. At this point the API intentionally rejects requests until the connection secret is configured.

In Cloudflare's Worker settings add these **secrets**, or enter them interactively:

```powershell
npx wrangler secret put READWELL_PROXY_SECRET --config .wrangler.production.json
npx wrangler secret put CLERK_SECRET_KEY --config .wrangler.production.json
npx wrangler secret put CLERK_WEBHOOK_SIGNING_SECRET --config .wrangler.production.json
```

For `READWELL_PROXY_SECRET`, generate a new random value of at least 32 characters (recommended: 32 random bytes encoded as 64 hex characters), keep it private, and enter the **same value** in Vercel. This is separate from your Cloudflare API token and Clerk keys. Do not reuse the local development connection secret for production.

`CLERK_SECRET_KEY` is the live `sk_live_...` key. For the webhook signing secret, create a Clerk endpoint at `https://YOUR_API_WORKER/api/webhooks/clerk`, subscribe to `user.deleted`, and copy its signing secret. The webhook is signature-verified and does not require the proxy secret. Optional `CLERK_JWT_KEY` enables offline verification.

## 3. Deploy the website on Vercel

Use the updated source, not an older release ZIP. Import your repository into Vercel, or run `npx vercel` from this folder and follow its account/project prompts. Add these settings to the project's **Production** environment:

| Vercel environment variable | Value |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Same live public key used on Cloudflare |
| `READWELL_API_URL` | Cloudflare API origin, without `/api` at the end |
| `READWELL_PROXY_SECRET` | Exactly the same private connection secret as Cloudflare |

Vercel build settings:

- Framework: **Next.js**
- Root directory: folder containing this app's `package.json`; `scroll-app` if the parent folder is your repository root, otherwise `.`
- Install command: `npm ci`
- Build command: `npm run build`
- Output directory: leave the Next.js default
- Node version: **22.x**

Do not select a static export or upload `dist/`. The site uses Next.js server rendering and a server-side API relay. `.vercelignore` excludes private local credentials, databases and backups from CLI uploads. Git ignores them too. Do not put Clerk secret keys or Cloudflare API tokens in Vercel.

Deploy to Production after saving the three environment variables. Environment changes need a new deployment. If using CLI, `npx vercel --prod` performs the production deployment using project settings. Your final domain must match Cloudflare's `APP_ORIGIN` and Clerk's production setup exactly.

Preview deployments require their own backend/origin/auth configuration. Do not allow every `*.vercel.app` origin to access production accounts.

References: [Next.js on Vercel](https://vercel.com/docs/frameworks/full-stack/nextjs), [environment variables](https://vercel.com/docs/environment-variables), [Workers secrets](https://developers.cloudflare.com/workers/configuration/secrets/).

## 4. Verify before sharing

Open the **Vercel website** (not the API Worker URL):

1. `/api/ready` must return HTTP 200 with `ready: true`. Its checks cover schema, archive, production auth configuration, deletion signing secret and a collector heartbeat newer than 30 minutes. Configured keys alone do not prove login/webhook delivery.
2. Check home, Companies, Trending and a real article. Missing articles should return 404; real backend failures must not appear as an empty library.
3. Sign in, bookmark a story, reload and confirm it in a second browser. Check sign-out and account isolation.
4. Send a Clerk test deletion event for a disposable account and confirm delivery.

A direct request to the Cloudflare API without the connection secret returns 401 by design. Use the website's `/api/ready` for monitoring.

The collector is already a separate deployment; this release does not replace its schedule. For existing administration and explicit collector redeployment see [INGESTION.md](INGESTION.md). Semantic indexing also remains a separate maintenance process; fresh articles remain readable before indexing completes.

Daily quotas are not a measured user-capacity guarantee. Monitor Worker CPU time, D1 rows read/written and source health. Existing alerting/backup/recovery limitations are recorded in `LAUNCH_CHECK.md`; schedule owned off-device backups and monitoring before relying on unattended operation.

## Common setup errors

| Symptom | Check |
| --- | --- |
| Website API returns 503 | Vercel API URL, both copies of the proxy secret, Worker logs |
| Signed-out `/api/profile` returns 401 | Expected; this route requires sign-in |
| Signed-in actions return 401 | Same Clerk instance/public key, live secret, exact authorized website origin |
| Writes return 403 | Website domain matches `APP_ORIGIN`; use the production domain |
| `/api/ready` returns 503 | Read its `checks`; do not replace a populated database |
| Website shows a page-load error | Backend reachability and Vercel function logs |

Rollback code from Vercel and Cloudflare deployment history separately. Code rollback does not undo database migrations. Never overwrite the existing archive or account data to test deployment/recovery.
