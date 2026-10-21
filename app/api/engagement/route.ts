import { getCurrentUser, AuthenticationError } from "@/lib/server/auth";
import { engagementActive,engagementTotals,validateEngagement } from "@/lib/server/engagement";
import { ValidationError } from "@/lib/server/core";
import { database, isSameOrigin, jsonError } from "@/lib/server/store";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError('This request must come from Readwell',403);
  if (!request.headers.get('content-type')?.includes('application/json')) return jsonError('Send a JSON reading action',415);
  try {
    const user = await getCurrentUser(request);
    if (!user) return jsonError('Sign in to bookmark stories or log reads',401);
    const body = await request.text();
    if (body.length > 1000) return jsonError('Reading action is too large',413);
    const data = JSON.parse(body);
    if (data?.owner !== user.userId) return jsonError('Your reading account changed. Reload before syncing activity.',409);
    const event=validateEngagement(data);
    const identity=user.userId;
    const db=database();
    if(!Object.hasOwn(await engagementTotals(db,[event.articleId]),event.articleId))return jsonError('Article not found',404);
    // Compatibility endpoint: public activity is now written only with the
    // authoritative profile transaction. Old clients cannot mutate it separately.
    const current = await engagementActive(db, identity, event);
    if (current !== event.active) return jsonError('Sync your reading profile before confirming this action.', 409);
    const changed = false;
    const stats=(await engagementTotals(db,[event.articleId]))[event.articleId];
    return Response.json({ accepted:true,changed,articleId:event.articleId,stats },{ headers: { 'Cache-Control':'private, no-store' } });
  } catch (error) {
    if (error instanceof AuthenticationError) return jsonError(error.message,401);
    if (error instanceof ValidationError || error instanceof SyntaxError) return jsonError(error.message,400);
    return jsonError('Reading activity could not be synced. Your personal log remains saved.',503);
  }
}

export async function GET(request: Request) {
  const ids=[...new Set((new URL(request.url).searchParams.get('ids')||'').split(',').filter(Boolean))];
  if(!ids.length||ids.length>100||ids.some(id=>!/^\w[\w-]{0,79}$/.test(id)))return jsonError('Request 1 to 100 valid article IDs',400);
  try { return Response.json({stats:await engagementTotals(database(),ids)},{headers:{'Cache-Control':'no-store'}}); }
  catch { return jsonError('Community totals are temporarily unavailable',503); }
}
