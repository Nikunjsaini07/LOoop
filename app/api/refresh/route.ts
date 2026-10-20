import { getChatGPTUser } from "@/app/chatgpt-auth";
import { refreshStaleSources } from "@/lib/server/refresh";
import { database, isSameOrigin, jsonError } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db=database();
    const [states,heartbeat] = await Promise.all([db.prepare("SELECT source_id,last_attempt,last_success,error FROM source_refresh ORDER BY source_id").all(),db.prepare("SELECT value FROM app_state WHERE id='ingestion_last_run'").first<{value:number}>()]);
    const scheduled=Boolean(heartbeat&&Date.now()-heartbeat.value<30*60*1000);
    return Response.json({ states: states.results, mode: scheduled?"scheduled":"traffic-driven", intervalHours: 6, scheduled,lastScheduledRun:heartbeat?new Date(heartbeat.value).toISOString():null }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ states: [], mode: "seed", intervalHours: 6, scheduled: false }); }
}

export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError("This request must come from readzz", 403);
  const user = await getChatGPTUser();
  if (!user) return jsonError("Sign in before requesting a source refresh", 401);
  try {
    return Response.json(await refreshStaleSources(), { headers: { "Cache-Control": "no-store" } });
  } catch { return jsonError("Live source storage is temporarily unavailable. The collected archive is still available.", 503); }
}
