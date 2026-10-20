import { refreshSources } from "./ingestion";
import { database } from "./store";
import { readSources,readTopicClassifier } from "./catalog";

export async function refreshStaleSources() {
  const db=database();
  const [sources,classify]=await Promise.all([readSources(db),readTopicClassifier(db)]);
  return refreshSources(db, sources, {classify});
}
