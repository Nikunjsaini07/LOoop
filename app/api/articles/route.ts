import { selectArticles } from "@/lib/server/core";
import { jsonError, loadArticles, sources } from "@/lib/server/store";
import { refreshStaleSources } from "@/lib/server/refresh";
import { waitUntil } from "cloudflare:workers";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  const offset = Number(query.get("cursor") || 0);
  const pageSize = Number(query.get("pageSize") || 24);
  if (!Number.isInteger(offset) || offset < 0 || offset > 100000 || !Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) return jsonError("Use a valid cursor and a pageSize from 1 to 100", 400);
  if ((query.get("q") || "").length > 200 || (query.get("company") || "").length > 2000 || (query.get("topic") || "").length > 1000) return jsonError("Search is too long", 400);
  if ((query.get("ids") || "").length > 41000 || (query.get("ids") || "").split(",").length > 500 || (query.get("exclude") || "").length > 2500) return jsonError("Filter is too long", 400);
  const now = new Date();
  const requested = query.get("snapshot");
  if (requested && (!Number.isFinite(new Date(requested).getTime()) || new Date(requested).getTime() > now.getTime() + 60000)) return jsonError("Invalid feed snapshot", 400);
  const snapshot = requested ? new Date(requested).toISOString() : now.toISOString();
  const loaded = await loadArticles();
  if (loaded.liveAvailable) waitUntil(refreshStaleSources().catch(() => undefined));
  const eligible = selectArticles(loaded.articles, query, snapshot);
  const articles = eligible.slice(offset, offset + pageSize);
  const nextOffset = offset + articles.length;
  const hasMore = nextOffset < eligible.length;
  return Response.json({ articles, sources, total: eligible.length, hasMore, nextCursor: hasMore ? String(nextOffset) : null,
    snapshot, updatedAt: loaded.updatedAt, liveAvailable: loaded.liveAvailable }, { headers: { "Cache-Control": "no-store" } });
}
