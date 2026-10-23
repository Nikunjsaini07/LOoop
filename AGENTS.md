# Deployment policy

- Keep development and verification local. The user will handle hosting elsewhere.
- Do not create, publish, or deploy through ChatGPT Sites.
- Do not push source for automatic publication or deploy to any other host unless the user explicitly requests that specific deployment.
- Preserve the local application, database, assets, and existing changes when managing hosting.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
