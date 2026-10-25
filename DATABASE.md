# Database Configuration Guide

This project supports multiple database configurations depending on your deployment environment.

## Overview

The application can work with:
1. **Cloudflare D1** (SQLite) - For Cloudflare Workers environment
2. **Neon PostgreSQL** - For production with better scalability
3. **Local D1** - For local development
4. **Seed Data Fallback** - When no database is configured

## Database Selection Logic

The application automatically selects the appropriate database based on environment:

```typescript
// In lib/server/store.ts
export function database(): D1Database {
  // Priority 1: Neon PostgreSQL (if DATABASE_URL is set)
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    return createNeonDatabase(connectionString); // Returns D1-compatible adapter
  }
  
  // Priority 2: Cloudflare D1 binding
  if (env.DB) {
    return env.DB;
  }
  
  // Falls back to seed data with error
  throw new Error("Database is unavailable");
}
```

## Configuration by Environment

### Local Development

**Option A: Local D1 (Recommended)**
```bash
# Uses local SQLite database via Wrangler
npm run dev:backend  # Starts Cloudflare Workers dev server
npm run dev          # Starts Next.js dev server
```

Configuration in `wrangler.jsonc`:
```jsonc
{
  "d1_databases": [{
    "binding": "DB",
    "database_id": "00000000-0000-4000-8000-000000000000",
    "database_name": "site-creator-d1"
  }]
}
```

Database files stored in: `.wrangler/state/v3/d1/`

**Option B: Neon PostgreSQL (Optional)**
```env
# .env.local
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require
```

### Production (Vercel + Cloudflare Workers)

**Website (Next.js on Vercel)**
```env
# Can use Neon PostgreSQL
DATABASE_URL=postgresql://user:password@ep-xxx.region.aws.neon.tech/dbname?sslmode=require

# Or rely on API Worker (no DATABASE_URL needed)
READWELL_API_URL=https://readwell-api.your-subdomain.workers.dev
READWELL_PROXY_SECRET=your-secure-random-secret
```

**API Worker (Cloudflare)**
```bash
# Uses Cloudflare D1 (configured in production config)
npm run build:production
npm run deploy
```

Environment variables for Worker (set via Wrangler secrets):
```bash
wrangler secret put READWELL_PROXY_SECRET
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
```

## SQL Compatibility Layer

Since Cloudflare D1 uses SQLite and Neon uses PostgreSQL, there's a compatibility layer in `lib/server/neon-db.ts` that:

1. **Converts parameter syntax**: `?` → `$1, $2, ...`
2. **Translates functions**:
   - `json_group_array()` → `json_agg()`
   - `json_group_object()` → `json_object_agg()`
   - `json_object()` → `json_build_object()`
   - `char(10)` → `chr(10)`
3. **Handles SQLite-specific syntax**:
   - `INSERT OR IGNORE` → `INSERT ... ON CONFLICT DO NOTHING`
   - `IS NOT` → `IS DISTINCT FROM` (for non-NULL comparisons)

## Schema Management

The project uses **Drizzle ORM** for schema definition and migrations.

### Schema Location
- Definition: `db/schema.ts`
- Migrations: `drizzle/` directory
- Config: `drizzle.config.ts`

### Generate New Migration
```bash
npm run db:generate
```

### Apply Migrations

**Local D1:**
Migrations run automatically when you start `dev:backend`

**Production D1:**
Migrations are applied during deployment:
```bash
npm run deploy  # Applies pending migrations to production D1
```

**Neon PostgreSQL:**
You need to apply migrations manually to Neon:
```bash
# Convert SQLite migrations to PostgreSQL format
# Then run against your Neon database
```

## Database Tables

Key tables:
- `articles` - Blog articles with metadata
- `profiles` - User profiles
- `companies` - Company/publisher information
- `sources` - RSS/Atom feed sources
- `topics` - Article categorization
- `user_bookmarks` - User bookmarks
- `user_read_logs` - Reading history
- `engagements` - User engagement tracking
- `semantic_documents` - Semantic search embeddings
- `feed_sessions` - Paginated feed state

Full schema: See `db/schema.ts`

## Troubleshooting

### "Database is unavailable" error

**Cause**: Neither D1 nor DATABASE_URL is configured

**Solution**: 
- Local: Make sure `npm run dev:backend` is running
- Production: Set DATABASE_URL or configure READWELL_API_URL

### "D1 binding not found" error

**Cause**: Cloudflare Worker not properly configured

**Solution**: Check `wrangler.jsonc` has correct D1 binding

### SQL syntax errors with Neon

**Cause**: SQLite-specific syntax not converted properly

**Solution**: Check `lib/server/neon-db.ts` for conversion rules, may need to add new pattern

### Migrations not applying

**Cause**: Migration state mismatch

**Solution**:
```bash
# For local D1, delete and recreate:
rm -rf .wrangler/state/v3/d1
npm run dev:backend

# For production, check Wrangler logs:
wrangler tail readwell-api
```

## Performance Considerations

### D1 (SQLite)
- **Pros**: Simple, built-in, no external dependencies
- **Cons**: Limited to Cloudflare edge, slower for complex queries
- **Best for**: Edge workers, simple queries, development

### Neon PostgreSQL
- **Pros**: Better performance for complex queries, standard SQL, larger storage
- **Cons**: External dependency, higher latency from edge
- **Best for**: Production with heavy read/write workloads

## Backup and Recovery

### D1 Backups
Cloudflare D1 has automatic backups (check Cloudflare dashboard)

### Neon Backups
Configure in Neon console, or use `pg_dump`:
```bash
pg_dump $DATABASE_URL > backup.sql
```

### Export Data
Use the API:
```bash
curl https://your-api.workers.dev/api/articles > articles.json
```
