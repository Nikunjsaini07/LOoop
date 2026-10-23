import { env } from 'cloudflare:workers';
import { database } from '@/lib/server/store';
import { checkReadiness } from '@/lib/server/readiness';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const result = await checkReadiness(database(), {
      production: env.REQUIRE_SCHEDULED_INGESTION === 'true',
      publishableKey: env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY,
      secretKey: env.CLERK_SECRET_KEY || process.env.CLERK_SECRET_KEY,
      webhookSecret: env.CLERK_WEBHOOK_SIGNING_SECRET || process.env.CLERK_WEBHOOK_SIGNING_SECRET,
      authorizedParties: env.CLERK_AUTHORIZED_PARTIES || process.env.CLERK_AUTHORIZED_PARTIES,
      origin: env.APP_ORIGIN,
      supabaseUrl: env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      schedulerIntervalMs: 24 * 60 * 60 * 1000,
    });
    return Response.json(result, { status: result.ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return Response.json({ ready: false, checks: { database: false }, error: err instanceof Error ? err.message : String(err) }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
