export const TOPIC_CATALOG = [
  { id: "ai", name: "AI & ML", parent: null, keywords: ["ai", "ml", "llm", "llms", "machine learning", "neural", "inference", "agent", "agents", "embedding", "embeddings", "transformer", "transformers", "gpu", "gpus"] },
  { id: "systems", name: "Systems", parent: null, keywords: ["distributed", "system", "systems", "architecture", "latency", "performance", "scalability", "scaling", "concurrency", "reliability", "rust", "network", "networking", "cache", "caching"] },
  { id: "data", name: "Data", parent: null, keywords: ["data", "database", "databases", "sql", "postgres", "postgresql", "clickhouse", "analytics", "storage", "kafka", "streaming", "pipeline", "pipelines"] },
  { id: "infrastructure", name: "Infrastructure", parent: null, keywords: ["cloud", "infrastructure", "kubernetes", "deployment", "deploy", "container", "containers", "serverless", "observability", "aws", "sre", "devops", "terraform"] },
  { id: "security", name: "Security", parent: null, keywords: ["security", "secure", "privacy", "authentication", "authorization", "vulnerability", "encryption", "threat", "identity", "safety"] },
  { id: "frontend", name: "Frontend", parent: null, keywords: ["frontend", "front-end", "react", "javascript", "typescript", "css", "browser", "web performance", "web component", "accessibility", "design system"] },
  { id: "mobile", name: "Mobile", parent: null, keywords: ["mobile", "android", "ios", "swift", "kotlin", "flutter", "react native"] },
  { id: "product", name: "Product", parent: null, keywords: ["product", "developer experience", "workflow", "workflows", "team", "teams", "design", "customer", "customers", "launch", "introducing"] },
  { id: "networking", name: "Networking", parent: "systems", keywords: ["network", "networking", "proxy", "proxies", "cdn", "tcp", "udp", "dns", "routing", "http", "https", "quic", "bgp"] },
  { id: "inference", name: "Inference", parent: "ai", keywords: ["inference", "model serving", "token generation", "kv cache", "speculative decoding", "vllm", "tensorrt"] },
  { id: "postgres", name: "PostgreSQL", parent: "data", keywords: ["postgres", "postgresql", "pgvector", "pgbouncer", "autovacuum"] },
  { id: "rust", name: "Rust", parent: "systems", keywords: ["rust", "rustlang", "tokio"] },
  { id: "scale", name: "Scale", parent: "systems", keywords: ["scale", "scaling", "scalability", "distributed", "sharding"] },
  { id: "reliability", name: "Reliability", parent: "systems", keywords: ["reliability", "reliable", "resilience", "resiliency", "observability", "incident", "incidents", "availability", "fault", "recovery"] },
  { id: "realtime", name: "Realtime", parent: "data", keywords: ["realtime", "real-time", "real time", "stream", "streaming", "kafka", "flink", "websocket", "websockets"] },
] as const;

export const TOPICS = TOPIC_CATALOG.map(topic => topic.name);
export const HOME_TOPICS = ["AI & ML", "Inference", "PostgreSQL", "Networking", "Rust", "Data", "Scale", "Reliability", "Realtime"];

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export type TopicDefinition = { id: string; name: string; parent?: string | null; keywords: readonly string[]; keywordWeights?: Record<string,number> };
export function createTopicClassifier(catalog: readonly TopicDefinition[]) {
  const patterns = catalog.map(topic => ({ topic, patterns: topic.keywords.filter(term=>term.trim()).map(term => ({pattern:new RegExp(`(?:^|[^a-z0-9_])${escape(term)}(?=$|[^a-z0-9_])`, "i"),weight:Math.max(0,Math.min(10,topic.keywordWeights?.[term]??1))})) }));
  return (title: string, summary: string): { id: string; name: string; score: number }[] => {
    const matches = patterns.map(({ topic, patterns }) => ({ id: topic.id, name: topic.name,
      score: patterns.reduce((sum, {pattern,weight}) => sum + (pattern.test(title) ? 2 : pattern.test(summary) ? 1 : 0)*weight, 0) }));
    for(const definition of catalog){
      const child=matches.find(topic=>topic.id===definition.id);
      const parent=definition.parent?matches.find(topic=>topic.id===definition.parent):null;
      if(child&&parent&&child.score>0)parent.score=Math.max(parent.score,1);
    }
    return matches.filter(topic => topic.score > 0).sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  };
}
const classify = createTopicClassifier(TOPIC_CATALOG);

export function classifyTopics(title: string, summary: string): { id: string; name: string; score: number }[] {
  return classify(title, summary);
}

export function canonicalTopic(value: string): string | null {
  const key = value.trim().toLowerCase();
  return TOPIC_CATALOG.find(topic => topic.id === key || topic.name.toLowerCase() === key)?.name
    ?? (key === "ai & ml" || key === "machine learning" ? "AI & ML" : key === "postgresql" ? "PostgreSQL" : null);
}
