type RuntimeSettings = {
  production: boolean;
  publishableKey?: string;
  secretKey?: string;
  webhookSecret?: string;
  authorizedParties?: string;
  origin?: string;
  supabaseUrl?: string;
  supabaseAnonKey?: string;
  schedulerIntervalMs?: number;
};

/** Small indexed probes: no account rows or private metadata leave this endpoint. */
export async function checkReadiness(db: D1Database, settings: RuntimeSettings, now = Date.now()) {
  const required = ['articles', 'profiles', 'refresh_locks', 'source_refresh', 'companies', 'sources', 'topics', 'topic_keywords', 'article_topics', 'user_company_follows', 'user_topic_follows', 'user_bookmarks', 'user_read_logs', 'engagements', 'app_state', 'feed_sessions', 'feed_chunks', 'semantic_documents', 'semantic_topics', 'semantic_neighbors', 'reader_reports'];
  const tables = await db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all<{ name: string }>();
  const schema = required.every(name => tables.results.some(table => table.name === name));
  if (!schema) return { ready: false, checks: { database: true, schema: false } };
  for (const [table, column] of [['semantic_topics', 'generation'], ['semantic_neighbors', 'generation'], ['feed_chunks', 'details']]) {
    const columns = await db.prepare(`PRAGMA table_info(${table})`).all<{ name: string }>();
    if (!columns.results.some(value => value.name === column)) return { ready: false, checks: { database: true, schema: false } };
  }
  const [article, heartbeat] = await Promise.all([
    db.prepare('SELECT id FROM articles LIMIT 1').first(),
    db.prepare("SELECT value FROM app_state WHERE id='ingestion_last_run'").first<{ value: number }>(),
  ]);
  const checks = {
    database: true,
    schema: true,
    archive: Boolean(article),
    authentication: Boolean(
      (settings.supabaseUrl && settings.supabaseAnonKey) ||
      (settings.secretKey && settings.publishableKey && settings.authorizedParties)
    ) && (!settings.production || Boolean(
      (settings.supabaseUrl && settings.supabaseAnonKey) ||
      (settings.secretKey?.startsWith('sk_live_') && settings.publishableKey?.startsWith('pk_live_')
        && settings.origin && settings.authorizedParties?.split(',').map(value => value.trim()).includes(settings.origin))
    )),
    accountLifecycle: !settings.production || Boolean(settings.supabaseUrl && settings.supabaseAnonKey) || Boolean(settings.webhookSecret),
    scheduler: !settings.production || Boolean(heartbeat && heartbeat.value <= now && now - heartbeat.value < (settings.schedulerIntervalMs ?? (30 * 60 * 1000))),
  };
  return { ready: Object.values(checks).every(Boolean), checks };
}
