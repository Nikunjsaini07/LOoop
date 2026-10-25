declare namespace Cloudflare {
  interface Env {
    SUPABASE_URL?: string;
    SUPABASE_ANON_KEY?: string;
    SUPABASE_SERVICE_ROLE_KEY?: string;
    NEXT_PUBLIC_SUPABASE_URL?: string;
    NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
    APP_ORIGIN?: string;
    READWELL_PROXY_SECRET?: string;
    REQUIRE_SCHEDULED_INGESTION?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
