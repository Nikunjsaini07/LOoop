declare namespace Cloudflare {
  interface Env {
    CLERK_SECRET_KEY?: string;
    CLERK_WEBHOOK_SIGNING_SECRET?: string;
    CLERK_JWT_KEY?: string;
    NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?: string;
    CLERK_AUTHORIZED_PARTIES?: string;
    APP_ORIGIN?: string;
    READWELL_PROXY_SECRET?: string;
    REQUIRE_SCHEDULED_INGESTION?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
