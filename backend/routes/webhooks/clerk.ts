import { verifyWebhook } from '@clerk/backend/webhooks';
import { env } from '@/lib/server/env';
import { database } from '@/lib/server/store';
import { deleteReadingData } from '@/lib/server/account-data';

export async function POST(request: Request) {
  const secret = env.CLERK_WEBHOOK_SIGNING_SECRET || process.env.CLERK_WEBHOOK_SIGNING_SECRET;
  if (!secret) return new Response('Account lifecycle events are not configured', { status: 503 });
  let event;
  try { event = await verifyWebhook(request, { signingSecret: secret }); }
  catch { return new Response('Invalid event signature', { status: 400 }); }
  if (event.type === 'user.deleted' && event.data.id) {
    try { await deleteReadingData(database(), event.data.id); }
    catch { return new Response('Reading-data cleanup must be retried', { status: 503 }); }
  }
  return new Response('Accepted', { status: 200 });
}
