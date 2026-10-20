import { database,sources,seededAt } from "@/lib/server/store";
import { readSources } from "@/lib/server/catalog";

export async function GET() {
  try {return Response.json({sources:await readSources(database()),checkedAt:new Date().toISOString()},{headers:{"Cache-Control":"public, max-age=300"}});}
  catch {return Response.json({ sources, checkedAt: seededAt }, { headers: { "Cache-Control": "public, max-age=300" } });}
}
