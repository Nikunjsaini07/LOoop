# Vercel / Cloudflare split verification — 21 October 2026

The website now builds with standard Next.js 16.3.4. The Cloudflare API is a separate Worker at `workers/api.ts`; the existing route implementations live in `backend/routes/`. The beta Vinext web runtime and Vite build configuration were removed.

## Passed locally

- 127 JavaScript/TypeScript tests, including authentication, profile transactions, recommendation behavior, API routing, private proxy credentials, request-size/origin checks and explicit preview/production configuration boundaries.
- TypeScript checking and ESLint without warnings.
- Next.js production build. Server-rendered article and directory pages fetch the API without importing Cloudflare bindings into the Vercel runtime.
- Cloudflare API bundle and production-configured Wrangler dry run (330.20 KiB gzip), using synthetic public IDs/keys for configuration validation only. No remote deployment was performed. Synthetic deployment config/manifest were removed afterward.
- 22 HTTP acceptance checks against a real locally built Next.js server connected to Wrangler's local Worker and the existing local D1 archive. Home, Companies, Trending, Profile, sign-in/up, Settings, Privacy and a real article loaded. Missing article pages and APIs returned 404; invalid queries returned 400; signed-out account reads/writes returned 401; outside-origin writes returned 403; local readiness returned 200/ready. A direct API request without its proxy credential returned 401.
- Dependency lockfile root entries match package.json. The updated source ZIP excludes private environment files, database files and generated build/backup outputs.

The HTTP report is in ignored `outputs/deployment/split-http-check.json`. Local checks used Node 24.13.0 on Windows; the configured deployment/CI baseline remains Node 22.13+ / Vercel 22.x.

## Integration fixes

The API relay strips upstream compression/length headers after Node fetch decodes a response. It checks browser-facing Host when Next normalizes its internal request URL. Article existence is resolved before headers are sent, and the redundant root loading boundary was removed so missing stories return actual 404 responses. Feed/account components retain their own loading and error states.

## Deployment boundary

No Vercel project was created or published. No Cloudflare Worker was published, no remote database migration/import was run, and the existing collector deployment was not modified. The existing local archive was retained; normal local ingestion can add public stories during HTTP checks.

A first test deployment can use explicit preview mode with development Clerk keys and a separate Worker name ending in `-preview`; this is not production readiness. Live Clerk login, a second-browser bookmark test, production domain/DNS, webhook delivery, capacity, monitoring and recovery still require verification on the configured deployment. Real credentials were not submitted to a login form.

Start with [DEPLOY_NOW.md](DEPLOY_NOW.md) if you have no Vercel deployment yet. Use [DEPLOYMENT.md](DEPLOYMENT.md) for production with your own domain.
