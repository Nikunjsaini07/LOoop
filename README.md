# Readwell

Readwell brings engineering articles from company blogs into one reading room. Search the archive, filter by topic or company, explore trending stories, and keep a personal library of bookmarks and reading history.

## Features

- Search and filter engineering articles by topic and publisher
- Browse recent, personalized, and trending feeds
- Discover company blogs and follow publishers
- Save articles and keep a reading log
- Build custom feeds around companies and topics
- Read short excerpts and open the original publisher article

## Tech stack

- Next.js, React, and TypeScript for the web app
- Cloudflare Workers for the API
- Cloudflare D1 for the application database, with a Neon PostgreSQL adapter available
- Supabase Auth for user accounts
- Remotion for the optional product intro video

## Requirements

- Node.js 22.13 or newer
- npm
- Supabase project credentials for authentication

## Local development

Install dependencies and create your local environment file:

```sh
npm ci
cp .env.example .env.local
```

Set the Supabase URL and public anon key in `.env.local`. For local API development, set `READWELL_API_URL` to `http://127.0.0.1:8787` and set `READWELL_PROXY_SECRET` to the same value used by the local Worker in `.dev.vars`. The proxy secret must be at least 32 characters. Keep `.env.local` and `.dev.vars` private.

Create `.dev.vars` for the local Worker:

```env
READWELL_PROXY_SECRET=the-same-local-secret-as-in-env-local
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-supabase-service-role-key
```

Apply the D1 migrations to the local database:

```sh
npx wrangler d1 migrations apply site-creator-d1 --local --config wrangler.jsonc
```

Start the API and website in separate terminals:

```sh
npm run dev:backend
```

```sh
npm run dev
```

Open [http://127.0.0.1:5173](http://127.0.0.1:5173).

## Environment variables

| Variable | Used by | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Web app | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Web app | Public Supabase client key |
| `READWELL_API_URL` | Web app | API Worker origin; use localhost for local development |
| `READWELL_PROXY_SECRET` | Web app and Worker | Shared secret protecting requests between the app and API |
| `SUPABASE_SERVICE_ROLE_KEY` | Worker | Server-side Supabase access; keep private |
| `DATABASE_URL` | Web app / database adapter | Optional PostgreSQL connection string |

See `.env.example` for local settings and `.env.production.example` for production Worker configuration. Never commit real credentials.

## Common commands

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Next.js app on port 5173 |
| `npm run dev:backend` | Start the local Cloudflare Worker API on port 8787 |
| `npm run build` | Build the web app |
| `npm start` | Run the built web app on port 5173 |
| `npm run lint` | Run ESLint |
| `npm run typecheck` | Check TypeScript types |
| `npm test` | Run the automated test suite |
| `npm run db:generate` | Generate a Drizzle migration |
| `npm run video:studio` | Open the Remotion intro video studio |
| `npm run video:render` | Render the intro video to `out/readwell-intro.mp4` |

## Production deployment

The web app is deployed to Vercel. Set the production Supabase and API variables in the Vercel project settings. Web Analytics and Speed Insights are included in the root layout; enable both in the Vercel project dashboard to collect production data.

The API is deployed separately to Cloudflare Workers. Copy `.env.production.example` to `.env.production`, fill in the public deployment configuration, and provide private Worker secrets through Wrangler or your CI secret store. Then run:

```sh
npm run production:check
npm run build:backend
npm run deploy:backend:check
npm run deploy:backend
```

`npm run deploy:backend` deploys the API Worker. It does not deploy the Vercel web app.

## Project layout

| Directory | Contents |
| --- | --- |
| `app/` | Next.js routes and global styles |
| `components/` | Reader, profile, company, and account UI |
| `backend/`, `workers/` | API routes and Cloudflare Worker entry point |
| `lib/` | Shared application logic and server data access |
| `db/`, `drizzle/` | Database schema and SQL migrations |
| `scripts/` | Development, ingestion, indexing, and deployment tools |
| `remotion/` | Product intro video composition |
