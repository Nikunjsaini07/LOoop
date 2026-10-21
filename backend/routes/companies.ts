import { loadCompanyDirectory } from "@/lib/server/companies";
import { database } from "@/lib/server/store";

export const dynamic = "force-dynamic";

export async function GET() {
  let db: D1Database | undefined;
  try { db = database(); }
  catch { /* The bundled directory remains available without a live binding. */ }
  return Response.json(await loadCompanyDirectory(db), {
    headers: { "Cache-Control": "no-store" },
  });
}
