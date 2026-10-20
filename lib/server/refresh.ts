import { refreshSources } from "./ingestion";
import { database, sources } from "./store";

export async function refreshStaleSources() {
  return refreshSources(database(), sources);
}
