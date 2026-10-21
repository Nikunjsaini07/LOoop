# Production setup

Follow [DEPLOYMENT.md](DEPLOYMENT.md). The website is standard Next.js on Vercel. Its API relay connects to `workers/api.ts` on Cloudflare, using the existing D1 database and Clerk identity service.

Vercel needs the Clerk public key, the API Worker URL and a shared proxy secret. Clerk private keys and Cloudflare account credentials belong on the backend only. No publishing or remote database changes occur during local builds or source packaging.
