# readzz

A daily engineering reading app based on the supplied Longreads reference: a fading sky photograph, a 760px centered layout, layered neutral cards, Cal Sans headings, Instrument Serif italics, and Geist text. Fonts and reference imagery are served locally; origins and font licenses are recorded in `public/reference/ASSET_PROVENANCE.md`. Feed, Trending and Profile have direct routes and responsive layouts.

Articles show a publisher title, a short excerpt and a link to the original. This app does not republish full articles or pretend that opening an external link proves it was read.

## What works

- Home: personalized ordering, latest posts, followed companies and saved custom feeds.
- Trending: freshness/topic discovery with company diversity. This is not a global popularity ranking; the app does not invent readership or engagement statistics.
- Custom feeds: company/topic rules plus hard keyword exclusions, with editing and preview.
- Search and company/topic filters, stable snapshot pagination and progressive article loading.
- Article pages: every feed/library title opens `/articles/[id]` inside the app, with the publisher's short excerpt, original link, bookmark action and explicit read-log control. Missing excerpts have an honest fallback; full articles stay with their publishers.
- Profile: bookmarks, a dated read log with undo, followed companies, interests, editable name/bio and an activity calendar based on actual opens, saves and reported reads. Activity days use UTC.
- Anonymous device storage and optional signed-in account synchronization using dispatch-owned ChatGPT identity and Cloudflare D1.
- Responsive navigation, keyboard focus states, reduced-motion support and a mobile feed-editor sheet.

The initial archive contains **1,260 real collected articles across 37 companies**, gathered on 18 October 2026. It is a recent collection rather than a complete historical archive. Publication dates are only shown as such when supplied by the publisher; undated items use their collection date. Topic labels use deterministic keyword rules. Personalized ordering combines freshness, followed teams, interests, saved-article topics and company diversity; no trained recommendation model is included.

## Run locally

Requires Node.js 22.13 or newer and the locked dependencies.

```powershell
npm run install:ci
npm run dev
```

The portable development server uses loopback port 5173. Open the URL printed by the server. The project uses Vinext/React, TypeScript and Tailwind/CSS with Cloudflare Worker APIs; it is not a standalone static HTML export.

The portable preview can simulate sign-in by visiting `/signin-with-chatgpt?return_to=/`, then sign out through `/signout-with-chatgpt?return_to=/`. This development-only identity is `local_seedy`; production authentication is owned by the Sites hosting dispatch. Do not implement app routes for these reserved sign-in paths.

## Database and builds

`.openai/hosting.json` declares the `DB` D1 binding. The schema is in `db/schema.ts`; committed SQL migrations are in `drizzle/`. Tables are created through migrations, never inside an HTTP request.

```powershell
npm run build
```

The build emits a Worker configuration at `dist/server/wrangler.json`. For a fresh local database, apply each pending migration in order, once:

```powershell
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_glamorous_richard_fisk.sql
```

Use the actual filename in this checkout if it differs. `.wrangler/state` is the shared local persistence directory used by development, built preview and local migrations. Do not reapply a migration already applied. Production database provisioning and migration application belong to the Sites publishing workflow.

```powershell
npm start
```

This previews the built Worker locally at the URL printed by Wrangler; it does not publish the app. Publishing remains a separate Sites action. The local execution profile in `.sites-runtime/` is intentionally ignored and must not be uploaded.

### Connect the existing collected archive locally

The collector database is `../data/blogs.sqlite3`; the running app reads its own local D1 database under `.wrangler/state`. To merge a consistent snapshot of the collector into that database:

```powershell
python scripts/import-collector.py --verify
```

This command reads the collector in read-only snapshot mode, normalizes excerpts and tags with the app's actual TypeScript helpers, and imports through **local-only** Wrangler. It applies the committed schema only to a fresh empty local app database. Existing articles are merged by original URL; their IDs remain stable, earliest discovery times are retained, and extra live articles and all profiles are preserved. Older collector source-health records do not overwrite newer local refresh records. No cloud upload, account credentials, remote database, or publication is involved.

Run `npm run build` first if `dist/server/wrangler.json` does not exist. `--export-only` generates reviewable SQL without changing D1. Generated SQL and a count/verification report are kept under ignored `outputs/collector-import/`. The script also accepts `--source PATH` for another collector snapshot.

The verified 19 October import copied all **1,260 collected articles from 36 companies**, with **37 configured sources/source-health records**. LinkedIn has no collected articles. Local D1 held 1,260 articles immediately after import, including its existing rows. Later background updates can increase that count.

This is a repeatable snapshot synchronization, not a permanent live link to the Python SQLite file. After running the Python collector again, rerun the import to synchronize its new articles. The app's existing traffic-driven refresh can also write new articles directly into D1 independently. `loadArticle(id)` reads D1 first and falls back to the bundled archive for public article pages.

Import preservation checks:

```powershell
python -m unittest discover -s scripts -p test_import_collector.py
```

## Reading data and automatic updates

`GET /api/articles` returns articles, sources, pagination metadata and refresh timestamps. It supports `q`, `company`, `topic`, `signal`, `exclude`, `ids`, `pageSize`, `cursor` and `snapshot`; subsequent pages should retain their original snapshot. Signal chips (Rust, Data, Scale, Reliability, Realtime, Networking) match collected titles, excerpts and tags, and remain AND constraints with custom-feed rules. `GET /api/sources` returns the fixed source catalog, and `GET /api/refresh` reports actual source health and refresh mode.

Public reading works from the bundled real archive even before a new D1 database is populated. With migrated D1 available, article requests start bounded background refreshes without holding up the article response. Four due sources run per eligible batch, with a global one-minute cooldown and a six-hour interval per source. Fixed RSS/Atom endpoints and approved listing adapters are used; listing adapters check robots.txt. LinkedIn remains a manual source. Network/parser failures keep previously collected articles available.

**Refresh is traffic driven. An unattended daily scheduler is not provisioned.** A full source rotation requires multiple eligible visits or requests over several minutes. A guaranteed daily full refresh when nobody visits needs a trusted scheduler/queue connected to the refresh writer. The app does not claim that every company has refreshed simply because someone opened the feed. Signed-in users can request one due batch through `POST /api/refresh`; the same limits still apply.

See `lib/server/README.md` for bounds, source behavior and API contracts. The original Python collector and the larger source-research documents remain in the parent `blogs` folder.

## Profile storage

Anonymous profiles are stored only in this browser. Signed-in profiles use an account-specific browser cache and a D1 record keyed by the authenticated user ID. The server profile is authoritative on sign-in; another account's cache and anonymous history are not silently imported.

Writes debounce and serialize with version checks. Navigation resumes a pending save only for the confirmed owner and an unchanged server version. A changed server version wins; its pending device copy is retained under the account-specific `:unsynced` local-storage key and is not silently replayed. A visual conflict merge editor is not included. Blocked browser storage falls back to session memory with the label “Available in this session.” A network failure before identity can be confirmed does not expose a previously signed-in account's cache.

Opens, newly saved bookmarks and explicit read logs contribute to activity. Opening a detail page or publisher link never marks an article as read. Each article has at most one read log; undo removes that log from its original UTC reporting day. Removing a bookmark does not create a save. Read reports are personal records, not verified completion or public engagement statistics.

## Verification

```powershell
node node_modules/typescript/bin/tsc --noEmit
npm run lint
node --experimental-strip-types --test lib/server/core.test.mjs lib/useReadingProfile.test.mjs
npm run build
```

The focused tests cover feed normalization, invalid syndication/URLs, deduplication, snapshot filtering, bounded profile rules, honest activity, account isolation, in-flight profile edits, conflicts and browser-storage failure. Real-browser layout and interaction QA should accompany these checks.

Current fonts and visual asset provenance are recorded in `public/reference/ASSET_PROVENANCE.md`; font license files are stored beside the local WOFF2 files. `public/assets-notes.md` records earlier retained design assets.

See `PRODUCTION_SETUP.md` for current database locations, auth recommendations, and the inputs needed before public launch.
