import { getChatGPTUser } from "@/app/chatgpt-auth";
import { engagementActive,engagementTotals,guestReader,recordEngagement,validateEngagement } from "@/lib/server/engagement";
import { ValidationError } from "@/lib/server/core";
import { database, isSameOrigin, jsonError } from "@/lib/server/store";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError('This request must come from readzz',403);
  const user = await getChatGPTUser();
  if (!request.headers.get('content-type')?.includes('application/json')) return jsonError('Send a JSON reading action',415);
  try {
    const body = await request.text();
    if (body.length > 1000) return jsonError('Reading action is too large',413);
    const data = JSON.parse(body);
    if (user ? data?.owner !== user.userId : data?.owner != null) return jsonError('Your reading account changed. Reload before syncing activity.',409);
    const event=validateEngagement(data);
    const guest=user?null:guestReader(request);
    const identity=user?.userId??guest!.identity;
    const db=database();
    if(!Object.hasOwn(await engagementTotals(db,[event.articleId]),event.articleId))return jsonError('Article not found',404);
    const changed=await recordEngagement(db,identity,event);
    if(!changed && await engagementActive(db,identity,event)!==event.active)return jsonError('Today’s community contribution limit has been reached. Your personal copy is saved.',429);
    const stats=(await engagementTotals(db,[event.articleId]))[event.articleId];
    return Response.json({ accepted:true,changed,articleId:event.articleId,stats },{ headers: { 'Cache-Control':'private, no-store',...(guest?.cookie?{'Set-Cookie':guest.cookie}:{}) } });
  } catch (error) {
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
