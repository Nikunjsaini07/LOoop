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
    });
    return Response.json(result, { status: result.ready ? 200 : 503, headers: { 'Cache-Control': 'no-store' } });
  } catch {
    return Response.json({ ready: false, checks: { database: false } }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
