import { getCurrentUser, AuthenticationError } from "@/lib/server/auth";
import { emptyProfile, recordActivity, sanitizeProfile, ValidationError, articleId } from "@/lib/server/core";
import { database, isSameOrigin, jsonError } from "@/lib/server/store";
import type { Profile } from "@/lib/types";
import { readSources } from "@/lib/server/catalog";
import { writeProfile, ProfileConflictError, ContributionLimitError } from "@/lib/server/profile-write";

export const dynamic = "force-dynamic";

async function storedProfile(userId: string, name: string) {
  const row = await database().prepare("SELECT data,version FROM profiles WHERE user_id=?").bind(userId).first<{ data: string; version: number }>();
  const catalog=await readSources(database());
  const epoch = await database().prepare("SELECT value FROM app_state WHERE id=?").bind(`reading_generation:${await articleId(`account:${userId}`)}`).first<{value:number}>();
  return { generation: epoch?.value ?? 0, profile: row ? sanitizeProfile(JSON.parse(row.data) as Profile, emptyProfile(name), new Set(catalog.map((source) => source.id))) : emptyProfile(name), version: row?.version ?? 0 };
}

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request, true);
    if (!user) return jsonError("Sign in to sync your reading profile across devices", 401);
    const stored = await storedProfile(user.userId, user.fullName || user.email.split("@")[0] || "Your profile");
    return Response.json({ ...stored, user: { id: user.userId, name: user.displayName, email: user.email } }, { headers: { "Cache-Control": "private, no-store", "Vary": "Authorization, Cookie" } });
  } catch (error) { if (error instanceof AuthenticationError) return jsonError(error.message, 401); return jsonError("Account storage is temporarily unavailable. Your device copy is still available.", 503); }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError("This request must come from Readwell", 403);
  if (!request.headers.get("content-type")?.includes("application/json")) return jsonError("Send a JSON profile", 415);
  try {
    const user = await getCurrentUser(request);
    if (!user) return jsonError("Sign in to sync your reading profile across devices", 401);
    const body = await request.text();
    if (body.length > 500000) return jsonError("Profile is too large", 413);
    const data = JSON.parse(body) as Record<string, unknown>;
    if (!data || typeof data !== "object" || Array.isArray(data)) return jsonError("A profile object is required", 400);
    if (data.owner !== undefined && data.owner !== user.userId) return jsonError("Your signed-in account changed. Reload before saving.", 409);
    const stored = await storedProfile(user.userId, user.fullName || "Reader");
    if (data.version !== undefined && data.version !== stored.version) return jsonError("Your profile changed on another device. Reload before saving.", 409);
    let profile = sanitizeProfile(data.profile ?? data, stored.profile, new Set((await readSources(database())).map((source) => source.id)));
    if (data.event !== undefined) profile = recordActivity(profile, data.event);
    const result = await writeProfile(database(), user.userId, stored.profile, profile, stored.version, new Date(), typeof data.generation === "number" ? data.generation : 0);
    return Response.json({ profile, ...result, generation: stored.generation, user: { id: user.userId, name: user.displayName, email: user.email } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof AuthenticationError) return jsonError(error.message, 401);
    if (error instanceof ProfileConflictError) return jsonError(error.message, 409);
    if (error instanceof ContributionLimitError) return jsonError(error.message, 429);
    if (error instanceof ValidationError) return jsonError(error.message, 400);
    if (error instanceof SyntaxError) return jsonError("Invalid JSON profile", 400);
    return jsonError("Account storage is temporarily unavailable. Keep your device copy and retry.", 503);
  }
}
