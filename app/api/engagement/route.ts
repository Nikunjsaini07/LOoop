import { getChatGPTUser } from "@/app/chatgpt-auth";
import { recordEngagement, validateEngagement } from "@/lib/server/engagement";
import { ValidationError } from "@/lib/server/core";
import { database, isSameOrigin, jsonError } from "@/lib/server/store";

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError('This request must come from readzz',403);
  const user = await getChatGPTUser();
  if (!user) return jsonError('Sign in to contribute to community trends',401);
  if (!request.headers.get('content-type')?.includes('application/json')) return jsonError('Send a JSON reading action',415);
  try {
    const body = await request.text();
    if (body.length > 1000) return jsonError('Reading action is too large',413);
    const data = JSON.parse(body);
    if (data?.owner !== user.userId) return jsonError('Your signed-in account changed. Reload before syncing activity.',409);
    const changed = await recordEngagement(database(),user.userId,validateEngagement(data));
    return Response.json({ accepted: true, changed },{ headers: { 'Cache-Control':'private, no-store' } });
  } catch (error) {
    if (error instanceof ValidationError || error instanceof SyntaxError) return jsonError(error.message,400);
    return jsonError('Reading activity could not be synced. Your personal log remains saved.',503);
  }
}
