# Get your first Vercel test deployment online

You do not need to have uploaded anything yet. Start here. This path uses your current Clerk development account so you can test on a free `vercel.app` address. Production login with Clerk requires your own domain later.

## 1. Create the Vercel website

Use the updated source in this project (or the latest source ZIP). Put it in your own GitHub repository, then in Vercel choose **Add New → Project → Import**. Keep credentials, database files and backups out of Git; the provided `.gitignore` excludes them.

Choose:

- Framework: **Next.js**
- Root: folder containing `package.json` (`scroll-app` if importing the parent repository; `.` if this folder is the repository)
- Build command: `npm run build`
- Install command: `npm ci`
- Output directory: leave the Next.js default
- Node: **22.x**

Add `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` using the current `pk_test_...` value in your local `.env.local`. This key is public. Deploy and copy the project's stable website URL, such as `https://your-project.vercel.app`.

**This first build establishes the address. The article pages need steps 2–4 before they work.** Do not treat the initial page-load error as a failed build.

If using Vercel CLI instead of GitHub, run `npx vercel` from this folder and link a project. Set the public Clerk key in the project's environment settings before its build. `.vercelignore` excludes private local files from uploads.

## 2. Prepare Cloudflare for that website address

In a terminal opened in this project's folder:

```powershell
Copy-Item .env.production.example .env.production
```

Edit `.env.production`:

```dotenv
READWELL_DEPLOYMENT_MODE=preview
CLOUDFLARE_ACCOUNT_ID=YOUR_EXISTING_ACCOUNT_ID
CLOUDFLARE_D1_DATABASE_ID=YOUR_EXISTING_READS_DATABASE_UUID
CLOUDFLARE_D1_DATABASE_NAME=reads
READWELL_WORKER_NAME=readwell-api-preview
APP_ORIGIN=https://YOUR-PROJECT.vercel.app
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=YOUR_CURRENT_PK_TEST_KEY
```

The existing account/database IDs and current Clerk public key are in ignored `.env.local`. Keep the real `pk_test_...` prefix/value. Use the exact Vercel URL without a trailing path.

Confirm Wrangler's saved login belongs to your intended Cloudflare account:

```powershell
npx wrangler whoami
```

If it is a different account, log out and use `npx wrangler login` for your intended account. Do not create a replacement database. This deploy uses your existing archive and does not apply migrations or import data. Test account actions will write test profile data to that database; use a separate database if it already serves real production users.

## 3. Deploy the API and set its two secrets

```powershell
npm run production:check
npm run build:backend
npm run deploy:backend
```

Copy the printed API URL, such as `https://readwell-api-preview.YOUR_SUBDOMAIN.workers.dev`.

In that Worker's Cloudflare settings, add two **secrets**:

| Secret | Value |
| --- | --- |
| `CLERK_SECRET_KEY` | Current `sk_test_...` key from `.env.local`, matching your development Clerk instance |
| `READWELL_PROXY_SECRET` | A new random private value, at least 32 characters; use the same value in Vercel |

You can enter them interactively instead:

```powershell
npx wrangler secret put CLERK_SECRET_KEY --config .wrangler.production.json
npx wrangler secret put READWELL_PROXY_SECRET --config .wrangler.production.json
```

A password manager can generate the connection secret. It is a separate value from the Cloudflare API token and Clerk secret key. Keep it private; never prefix it with `NEXT_PUBLIC_`.

## 4. Connect Vercel and redeploy

In Vercel → Project → Settings → Environment Variables, set these for the website deployment environment:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Your current `pk_test_...` key |
| `READWELL_API_URL` | The API Worker URL, with no `/api` path |
| `READWELL_PROXY_SECRET` | Exactly the connection secret you entered on Cloudflare |

Redeploy the Vercel website after saving them. Your Cloudflare API token and Clerk private key do not belong on Vercel.

## 5. Test the website

Open the Vercel URL, then check:

- Home, Companies, Trending and a real article load.
- `/api/ready` returns `ready: true` for this **test deployment**.
- Sign in, bookmark a story, reload and verify it remains saved.

Directly opening the Cloudflare API without the connection secret returns 401 by design. Use the Vercel website.

This is a test deployment with development authentication. Production readiness additionally requires a controlled domain, live Clerk keys, deletion webhook and a recent collector heartbeat. Test and production Clerk instances have separate user identities. Follow [DEPLOYMENT.md](DEPLOYMENT.md) before public launch.

Reference: [Clerk deployment to Vercel](https://clerk.com/docs/guides/development/deployment/vercel).
