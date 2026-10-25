import { env } from '@/lib/server/env';
import { database } from '@/lib/server/store';
import { checkReadiness } from '@/lib/server/readiness';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const supabaseUrl = (typeof env.SUPABASE_URL === 'string' ? env.SUPABASE_URL : undefined) || process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = (typeof env.SUPABASE_ANON_KEY === 'string' ? env.SUPABASE_ANON_KEY : undefined) || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const appOrigin = typeof env.APP_ORIGIN === 'string' ? env.APP_ORIGIN : undefined;
    
    const result = await checkReadiness(database(), {
      production: env.REQUIRE_SCHEDULED_INGESTION === 'true',
      supabaseUrl,
      supabaseAnonKey,
      origin: appOrigin,
      schedulerIntervalMs: 24 * 60 * 60 * 1000,
    });
    return Response.json(result, { status: result.ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    return Response.json({ ready: false, checks: { database: false }, error: err instanceof Error ? err.message : String(err) }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
