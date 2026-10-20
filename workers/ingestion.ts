import { refreshSources } from "../lib/server/ingestion";
import { readSources,readTopicClassifier } from "../lib/server/catalog";

type Env = { DB: D1Database };

export default {
  // This Worker has no public HTTP route. Only Cloudflare's scheduler invokes it.
  async scheduled(controller: ScheduledController, env: Env) {
    const [sources,classify] = await Promise.all([readSources(env.DB),readTopicClassifier(env.DB)]);
    const result = await refreshSources(env.DB, sources, {classify});
    await env.DB.prepare('DELETE FROM feed_sessions WHERE id IN (SELECT id FROM feed_sessions WHERE expires_at<? LIMIT 20)').bind(new Date().toISOString()).run();
    await env.DB.prepare("INSERT INTO app_state(id,value) VALUES ('ingestion_last_run',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value").bind(Date.now()).run();
    const log = { event: "readzz.ingestion", scheduledAt: new Date(controller.scheduledTime).toISOString(), ...result };
    if (result.results.some(source => source.status === "error")) console.warn(JSON.stringify(log));
    else console.log(JSON.stringify(log));
  },
} satisfies ExportedHandler<Env>;
