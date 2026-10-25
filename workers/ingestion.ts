import { pruneReadingCache } from "../lib/server/feed-budget";
import { refreshSources } from "../lib/server/ingestion";
import { readSources,readTopicClassifier } from "../lib/server/catalog";

import { createNeonDatabase } from "../lib/server/neon-db";

type Env = { DB?: D1Database; DATABASE_URL?: string };

function getDb(env: Env): D1Database {
  const url = env.DATABASE_URL || (typeof process !== "undefined" && process.env?.DATABASE_URL);
  if (url) return createNeonDatabase(url) as unknown as D1Database;
  if (env.DB) return env.DB;
  throw new Error("No database configured for ingestion");
}

export default {
  // This Worker has no public HTTP route. Only Cloudflare's scheduler invokes it.
  async scheduled(controller: ScheduledController, env: Env) {
    const db = getDb(env);
    const [sources,classify] = await Promise.all([readSources(db),readTopicClassifier(db)]);
    const result = await refreshSources(db, sources, {classify, batchSize: 25});
    await pruneReadingCache(db, Date.now(), 500);
    await db.prepare("INSERT INTO app_state(id,value) VALUES ('ingestion_last_run',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value").bind(Date.now()).run();
    const log = { event: "readzz.ingestion", scheduledAt: new Date(controller.scheduledTime).toISOString(), ...result };
    if (result.results.some(source => source.status === "error")) console.warn(JSON.stringify(log));
    else console.log(JSON.stringify(log));
  },
} satisfies ExportedHandler<Env>;
