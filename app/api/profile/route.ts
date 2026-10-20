import { getChatGPTUser } from "@/app/chatgpt-auth";
import { emptyProfile, recordActivity, sanitizeProfile, ValidationError } from "@/lib/server/core";
import { database, isSameOrigin, jsonError } from "@/lib/server/store";
import type { Profile } from "@/lib/types";
import { readSources } from "@/lib/server/catalog";

export const dynamic = "force-dynamic";

async function storedProfile(userId: string, name: string) {
  const row = await database().prepare("SELECT data,version FROM profiles WHERE user_id=?").bind(userId).first<{ data: string; version: number }>();
  const catalog=await readSources(database());
  return { profile: row ? sanitizeProfile(JSON.parse(row.data) as Profile, emptyProfile(name), new Set(catalog.map((source) => source.id))) : emptyProfile(name), version: row?.version ?? 0 };
}

export async function GET() {
  const user = await getChatGPTUser();
  if (!user) return jsonError("Sign in to sync your reading profile across devices", 401);
  try {
    const stored = await storedProfile(user.userId, user.fullName || "Reader");
    return Response.json({ ...stored, user: { id: user.userId, name: user.displayName, email: user.email } }, { headers: { "Cache-Control": "private, no-store", "Vary": "Cookie" } });
  } catch { return jsonError("Account storage is temporarily unavailable. Your device copy is still available.", 503); }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError("This request must come from Scroll", 403);
  const user = await getChatGPTUser();
  if (!user) return jsonError("Sign in to sync your reading profile across devices", 401);
  if (!request.headers.get("content-type")?.includes("application/json")) return jsonError("Send a JSON profile", 415);
  try {
    const body = await request.text();
    if (body.length > 500000) return jsonError("Profile is too large", 413);
    const data = JSON.parse(body) as Record<string, unknown>;
    if (!data || typeof data !== "object" || Array.isArray(data)) return jsonError("A profile object is required", 400);
    if (data.owner !== undefined && data.owner !== user.userId) return jsonError("Your signed-in account changed. Reload before saving.", 409);
    const stored = await storedProfile(user.userId, user.fullName || "Reader");
    if (data.version !== undefined && data.version !== stored.version) return jsonError("Your profile changed on another device. Reload before saving.", 409);
    let profile = sanitizeProfile(data.profile ?? data, stored.profile, new Set((await readSources(database())).map((source) => source.id)));
    if (data.event !== undefined) profile = recordActivity(profile, data.event);
    const now = new Date().toISOString();
    const db = database();
    // Compare-and-swap also protects simultaneous writes from silently overwriting each other.
    const result = stored.version ? await db.prepare("UPDATE profiles SET data=?,version=version+1,updated_at=? WHERE user_id=? AND version=?").bind(JSON.stringify(profile), now, user.userId, stored.version).run()
      : await db.prepare("INSERT INTO profiles (user_id,data,version,updated_at) VALUES (?,?,1,?) ON CONFLICT(user_id) DO NOTHING").bind(user.userId, JSON.stringify(profile), now).run();
    if (!result.meta.changes) return jsonError("Your profile changed on another device. Reload before saving.", 409);
    return Response.json({ profile, version: stored.version + 1, user: { id: user.userId, name: user.displayName, email: user.email } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof ValidationError) return jsonError(error.message, 400);
    if (error instanceof SyntaxError) return jsonError("Invalid JSON profile", 400);
    return jsonError("Account storage is temporarily unavailable. Keep your device copy and retry.", 503);
  }
}
