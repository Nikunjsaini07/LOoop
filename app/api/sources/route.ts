import { sources, seededAt } from "@/lib/server/store";

export async function GET() {
  return Response.json({ sources, checkedAt: seededAt }, { headers: { "Cache-Control": "public, max-age=3600" } });
}
