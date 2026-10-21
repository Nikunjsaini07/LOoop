# Readwell

Engineering stories from company blogs, with search, follows, bookmarks and reading logs.

## Hosting

- **Vercel:** standard Next.js website, server-rendered pages and a same-origin API relay.
- **Cloudflare Workers:** API logic in `workers/api.ts` and `backend/routes/`.
- **Cloudflare D1:** existing `reads` database. Preserve the local archive too.
- **Clerk:** account sign-in. Only its publishable key is needed on Vercel.
- **Existing ingestion Worker:** continues collecting public articles independently.

For your first Vercel deployment, follow [DEPLOY_NOW.md](DEPLOY_NOW.md). For production with your own domain, follow [DEPLOYMENT.md](DEPLOYMENT.md). The beta Vinext runtime is no longer used.

## Local development

Use Node 22.13 or newer. Install dependencies with `npm ci`. Keep existing `.env.local` and `.wrangler/state/` files; do not replace them. For a fresh checkout, copy `.env.example` to `.env.local`, enter Clerk development keys, and initialize/import a separate local database before browsing.

```powershell
node scripts/setup-local.mjs
npm run dev:backend
```

Leave the backend running, then in another terminal in this folder:

```powershell
npm run dev
```

Open http://127.0.0.1:5173. The API emulator runs at http://127.0.0.1:8787. The setup helper writes ignored local connection files and never changes the database or contacts Cloudflare. A local semantic indexing watcher, if wanted, is a separate `npm run semantic:watch` process.

## Verification

```powershell
npm test
npm run typecheck
npm run lint
npm run build
```

`npm start` serves the built Next.js website locally and needs the local API running. `node scripts/check-split-http.mjs` verifies the local split with real HTTP requests. No real login or live deployment is certified by these checks.

`npm run build:backend` validates production backend settings and bundles the Worker without publishing. `npm run deploy:backend` explicitly publishes the API; it does not deploy Vercel or the ingestion Worker and does not migrate the database.

`npm run release:source` creates a clean ZIP under `outputs/releases/`, excluding credentials, databases and generated output. Original files and data are retained. CI verifies source without deploying.
