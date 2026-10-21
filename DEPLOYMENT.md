# Deploy Readwell

Use GitHub repository `Nikunjsaini07/LOoop`, branch **main**. Deploy the website to Vercel and the API to Cloudflare Workers. Both use the same Clerk instance.

## 1. Vercel website

Import the GitHub repository and use:

| Setting | Value |
| --- | --- |
| Framework | Next.js |
| Root Directory | `.` |
| Node | 22.x |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output Directory | Next.js default |

Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` from Clerk (your current `pk_test_...` key for the first test deployment). Deploy and copy the stable URL, such as `https://your-project.vercel.app`. Article pages will work after the API is connected in step 3.

## 2. Cloudflare backend

Open a terminal in the folder containing `package.json`:

```powershell
npm ci
Copy-Item .env.production.example .env.production
```

For the first deployment, fill `.env.production` with:

```dotenv
READWELL_DEPLOYMENT_MODE=preview
CLOUDFLARE_ACCOUNT_ID=YOUR_ACCOUNT_ID
CLOUDFLARE_D1_DATABASE_ID=YOUR_EXISTING_DATABASE_UUID
CLOUDFLARE_D1_DATABASE_NAME=reads
READWELL_WORKER_NAME=readwell-api-preview
APP_ORIGIN=https://YOUR-PROJECT.vercel.app
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_YOUR_KEY
```

The existing account/database IDs and Clerk keys are in ignored `.env.local`. Use your intended Cloudflare account and the existing populated `reads` database. Do not replace it with an empty database. `APP_ORIGIN` must match the website URL exactly, with no trailing slash.

```powershell
npx wrangler login
npx wrangler whoami
npm run production:check
npm run build:backend
npm run deploy:backend
```

The deploy command prints the Worker URL. In that Worker's Cloudflare settings, add these **secrets**:

| Worker secret | Value |
| --- | --- |
| `CLERK_SECRET_KEY` | Matching Clerk `sk_test_...` key |
| `READWELL_PROXY_SECRET` | New random private value, at least 32 characters |

Alternatively enter each secret using `npx wrangler secret put NAME --config .wrangler.production.json`.

The Worker entrypoint is `workers/api.ts`. Deployment does not apply database migrations or replace the existing ingestion Worker. The database schema must include migrations through `drizzle/0006_reader_reports.sql`; inspect and back up existing data before applying any missing migrations.

## 3. Connect Vercel to the backend

In Vercel project settings, set these environment variables for the environment being deployed:

| Vercel variable | Value |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Same Clerk public key used on Cloudflare |
| `READWELL_API_URL` | Worker URL, such as `https://readwell-api-preview.YOUR_SUBDOMAIN.workers.dev`, without `/api` |
| `READWELL_PROXY_SECRET` | Exactly the same secret as on Cloudflare |

Redeploy Vercel after saving. Cloudflare credentials and Clerk private keys stay off Vercel.

Open the website and check `/api/ready`, a real article, sign-in, and a bookmark that persists after reload. A direct request to the Worker without the proxy secret returns 401 by design.

## Public production launch

The setup above uses development authentication for testing. For production, configure your owned domain in Vercel and Clerk. Set `READWELL_DEPLOYMENT_MODE=production`, `READWELL_WORKER_NAME=readwell-api`, `APP_ORIGIN` to that domain, and matching `pk_live_...` / `sk_live_...` Clerk keys on the two hosts. Rebuild and redeploy both.

Create a Clerk webhook at `https://YOUR_API_WORKER/api/webhooks/clerk`, subscribe to `user.deleted`, and set its signing secret as `CLERK_WEBHOOK_SIGNING_SECRET` on the Worker. Verify delivery with a disposable account. Production readiness checks include the schema, archive, authentication settings, webhook secret, and a collector heartbeat within 30 minutes.

## Collection and maintenance

The existing `readzz-ingestion` Worker collects articles into the same D1 database every five minutes. The website does not need to stay open. Check its health with:

```sh
node scripts/ingestion.mjs --status
```

To explicitly rebuild or redeploy the collector, use `node scripts/ingestion.mjs --dry-run` or `node scripts/ingestion.mjs --deploy`. These use account/database identifiers from `.env.local`; verify those targets before remote operations.

Optional semantic indexing runs separately with `node scripts/semantic-index.mjs --remote` on a Node/Python host with NumPy and D1 credentials. The collector does not generate embeddings; article reading continues without freshly generated embeddings.

Keep off-device database backups and monitor `/api/ready`, Worker errors, D1 usage, and collector health. Roll back website and API code through their respective host deployment histories; code rollback does not reverse database migrations.
