import { database } from '@/lib/server/store';

export const dynamic = 'force-dynamic';
export async function GET() {
  const checkedAt = new Date().toISOString();
  try {
    const db = database();
    const [archive, collection, heartbeat] = await Promise.all([
      (async () => db.prepare('SELECT COUNT(*) AS articles,MAX(discovered_at) AS lastDiscoveredAt FROM articles').first<{articles:number;lastDiscoveredAt:string|null}>())(),
      (async () => db.prepare(`SELECT COUNT(*) AS automaticSources,SUM(r.last_success IS NULL OR r.error IS NOT NULL) AS sourcesNeedingAttention,MAX(r.last_success) AS lastSuccessfulCollection
        FROM sources s LEFT JOIN source_refresh r ON r.source_id=s.id WHERE s.mode<>'manual'`).first<{automaticSources:number;sourcesNeedingAttention:number;lastSuccessfulCollection:string|null}>())(),
      (async () => db.prepare("SELECT value FROM app_state WHERE id='ingestion_last_run'").first<{value:number}>())(),
    ]);
    const staleScheduler = Boolean(heartbeat && Date.now() - heartbeat.value > 30 * 60 * 1000);
    return Response.json({ status: !archive?.articles || collection?.sourcesNeedingAttention || staleScheduler ? 'degraded' : 'healthy', checkedAt,
      articles: archive?.articles ?? 0, lastDiscoveredAt: archive?.lastDiscoveredAt ?? null,
      automaticSources: collection?.automaticSources ?? 0, sourcesNeedingAttention: collection?.sourcesNeedingAttention ?? 0,
      lastSuccessfulCollection: collection?.lastSuccessfulCollection ?? null,
      ingestionMode: heartbeat ? 'scheduled' : 'traffic-driven', schedulerStale: staleScheduler,
    }, { headers: { 'Cache-Control': 'no-store' } });
  } catch {
    console.error(JSON.stringify({ event: 'readwell.health.unavailable', checkedAt }));
    return Response.json({ status: 'unavailable', checkedAt }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
  }
}
