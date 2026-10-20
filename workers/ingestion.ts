import catalog from "../lib/server/seed.json";
import type { Source } from "../lib/types";
import { refreshSources } from "../lib/server/ingestion";

type Env = { DB: D1Database };

export default {
  // This Worker has no public HTTP route. Only Cloudflare's scheduler invokes it.
  async scheduled(controller: ScheduledController, env: Env) {
    const result = await refreshSources(env.DB, catalog.sources as Source[]);
    const log = { event: "readzz.ingestion", scheduledAt: new Date(controller.scheduledTime).toISOString(), ...result };
    if (result.results.some(source => source.status === "error")) console.warn(JSON.stringify(log));
    else console.log(JSON.stringify(log));
  },
} satisfies ExportedHandler<Env>;
