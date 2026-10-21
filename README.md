# Readwell

Engineering stories from company blogs, with search, follows, saved stories, reading logs and a private reading library. Full articles stay with their publishers.

## Run locally

Use Node.js 22.13 or newer (Node 22 LTS is the CI baseline).

```powershell
npm ci
Copy-Item .env.example .env.local
# Fill in Clerk development keys in .env.local.
npm run dev
```

The app opens at http://127.0.0.1:5173. Local D1 state lives in `.wrangler/state/`; retain it to keep your existing archive. A fresh clone needs migrations and article data before database-backed reading works.

## Check and build

```powershell
npm test
npm run typecheck
npm run lint
npm run build
npm start
```

`npm start` previews the compiled Worker locally; it does not host a production website. The portable preview uses Wrangler and the same persisted local database as development. Its preview proxy has a known timeout on one validation-error request; direct built-Worker checks pass. See DEPLOYMENT.md for the verification boundary.

## Deploy

Use **Cloudflare Workers + D1**, with Clerk for accounts. The website, API and static assets deploy together. Scheduled ingestion remains a separate Worker sharing the existing `reads` database.

Follow [DEPLOYMENT.md](DEPLOYMENT.md) for configuration, secrets, database checks, deployment commands, rollback and operations. Production builds reject test keys and placeholder database bindings.

```powershell
Copy-Item .env.production.example .env.production
# Fill in the public production settings.
npm run production:check
npm run build:production
npm run deploy:check
# After setting Worker secrets and checking the database:
npm run deploy
```

Deployment is manual. The included CI workflow runs checks and builds without publishing.

## Clean source package

`npm run release:source` produces a ZIP under `outputs/releases/`. It includes application source, tests, migrations, locked dependencies and deployment documentation. It excludes unused starter UI/connectors, old design assets, credentials, databases, dependency folders and build output.

The original collector, design references and private backups outside this app are retained. The ZIP is the recommended source handoff; extract it into a new folder or repository before deployment.

## Product and data

- Public browsing needs no account. Clerk verifies account-specific reading actions.
- Account data and public contributions commit together in D1; conflict recovery retains both copies.
- URL state preserves searches, filters and pagination. The library supports search, ordering and recovery.
- Profile resumes the most recently read or opened story. Opening a publisher link does not mark it read.
- `/settings` provides data export/reset and optional identity deletion; `/privacy` explains storage.
- `/api/health` reports archive/source health. `/api/ready` returns 503 when required runtime setup is missing.
- Recommendation indexing runs outside HTTP requests. See [SEMANTIC_FEED.md](SEMANTIC_FEED.md).
- Source collection and existing scheduler operations: [INGESTION.md](INGESTION.md).
- Authentication and account isolation: [AUTH.md](AUTH.md).

The pinned Vinext runtime is a beta release. Local verification is evidence for the checked build, not a substitute for acceptance on the final domain with real accounts and devices.
