# Readwell

Engineering stories from company blogs, with search, follows, bookmarks and reading logs.

- Website: Next.js on Vercel.
- API: Cloudflare Workers.
- Database: Cloudflare D1 (SQLite) or Neon PostgreSQL.
- Authentication: Supabase Auth.

Deploy from GitHub branch **main**, with Vercel Root Directory **.**.

## Prerequisites

- Node.js 22.13 or newer
- Supabase project (for authentication)
- Cloudflare account (for Workers and D1)
- Neon PostgreSQL database (optional, for production)

## Prerequisites

- Node.js 22.13 or newer
- Supabase project (for authentication)
- Cloudflare account (for Workers and D1)
- Neon PostgreSQL database (optional, for production)

## Local development

Use Node 22.13 or newer. Run `npm ci`, copy `.env.example` to `.env.local` for a fresh checkout, and configure your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

Then run:

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
