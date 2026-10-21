# Readwell

Engineering stories from company blogs, with search, follows, bookmarks and reading logs.

- Website: Next.js on Vercel.
- API: Cloudflare Workers.
- Database: Cloudflare D1.
- Sign-in: Clerk.

Deploy from GitHub branch **main**, with Vercel Root Directory **.**.
See [DEPLOYMENT.md](DEPLOYMENT.md) for all deployment commands and environment variables.

## Local development

Use Node 22.13 or newer. Run `npm ci`, copy `.env.example` to `.env.local` for a fresh checkout, and enter your development settings. Preserve existing local credentials and database files.

```sh
node scripts/setup-local.mjs
npm run dev:backend
```

In a second terminal, run `npm run dev` and open http://127.0.0.1:5173.

## Checks

```sh
npm test
npm run typecheck
npm run lint
npm run build
```

`app/`, `components/` and `lib/` contain the website; `backend/` and `workers/` contain API and collection code; `db/` and `drizzle/` contain the schema and migrations. `scripts/` contains deployment and database maintenance tools. Tests and CI verify production changes before deployment.
