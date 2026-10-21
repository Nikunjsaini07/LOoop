# Production setup

The current deployment runbook is [DEPLOYMENT.md](DEPLOYMENT.md). It replaces the earlier prototype setup notes.

Deploy the web/API Worker to Cloudflare Workers, bind the existing `reads` D1 database as `DB`, and configure a Clerk production instance. The existing `readzz-ingestion` Worker is separate and shares that database.

No deployment, remote migration, database import or account configuration is performed by local checks or source packaging.
