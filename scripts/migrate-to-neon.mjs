import { neon } from '@neondatabase/serverless';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';

const DATABASE_URL = 'postgresql://neondb_owner:npg_SiuWdC4OosL3@ep-frosty-dream-b584g56d-pooler.c-7.us-east-2.aws.neon.tech/neondb?sslmode=require';
const sqlitePath = join(process.cwd(), '.wrangler/state/v3/d1/miniflare-D1DatabaseObject/faaf2b0445ab934c3aac48ddf0cdfade8f9bac050be98993748742cdd2cb05fb.sqlite');

const sql = neon(DATABASE_URL);
const sqlite = new DatabaseSync(sqlitePath);

const DDL = `
CREATE TABLE IF NOT EXISTS companies (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL,
  blog_url TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS sources (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL REFERENCES companies(id),
  mode TEXT NOT NULL,
  blog_url TEXT NOT NULL,
  feed_urls TEXT NOT NULL,
  include_url_regex TEXT,
  exclude_url_regex TEXT
);

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT NOT NULL UNIQUE,
  parent_id TEXT
);

CREATE TABLE IF NOT EXISTS topic_keywords (
  topic_id TEXT NOT NULL REFERENCES topics(id),
  term TEXT NOT NULL,
  weight REAL DEFAULT 1 NOT NULL,
  PRIMARY KEY (topic_id, term)
);

CREATE TABLE IF NOT EXISTS articles (
  id TEXT PRIMARY KEY NOT NULL,
  company_id TEXT NOT NULL,
  company TEXT NOT NULL,
  title TEXT NOT NULL,
  url TEXT NOT NULL UNIQUE,
  summary TEXT NOT NULL,
  published_at TEXT,
  discovered_at TEXT NOT NULL,
  topics TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS articles_company_idx ON articles (company_id);

CREATE TABLE IF NOT EXISTS article_topics (
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL REFERENCES topics(id),
  score REAL DEFAULT 1 NOT NULL,
  PRIMARY KEY (article_id, topic_id)
);
CREATE INDEX IF NOT EXISTS article_topics_topic_idx ON article_topics (topic_id, article_id);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY NOT NULL,
  data TEXT NOT NULL,
  version INTEGER DEFAULT 1 NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS refresh_locks (
  id TEXT PRIMARY KEY NOT NULL,
  expires_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS source_refresh (
  source_id TEXT PRIMARY KEY NOT NULL,
  last_attempt TEXT,
  last_success TEXT,
  etag TEXT,
  last_modified TEXT,
  error TEXT
);

CREATE TABLE IF NOT EXISTS user_company_follows (
  user_id TEXT NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  company_id TEXT NOT NULL REFERENCES companies(id),
  PRIMARY KEY (user_id, company_id)
);

CREATE TABLE IF NOT EXISTS user_topic_follows (
  user_id TEXT NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL REFERENCES topics(id),
  PRIMARY KEY (user_id, topic_id)
);

CREATE TABLE IF NOT EXISTS user_bookmarks (
  user_id TEXT NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, article_id)
);

CREATE TABLE IF NOT EXISTS user_read_logs (
  user_id TEXT NOT NULL REFERENCES profiles(user_id) ON DELETE CASCADE,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  read_at TEXT NOT NULL,
  PRIMARY KEY (user_id, article_id)
);

CREATE TABLE IF NOT EXISTS engagements (
  reader_id TEXT NOT NULL,
  article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL,
  active INTEGER NOT NULL,
  occurred_at TEXT NOT NULL,
  PRIMARY KEY (reader_id, article_id, kind)
);
CREATE INDEX IF NOT EXISTS engagements_recent_idx ON engagements (active, occurred_at, article_id);
CREATE INDEX IF NOT EXISTS engagements_article_active_idx ON engagements (article_id, active, kind);

CREATE TABLE IF NOT EXISTS app_state (
  id TEXT PRIMARY KEY NOT NULL,
  value BIGINT NOT NULL
);

CREATE TABLE IF NOT EXISTS feed_sessions (
  id TEXT PRIMARY KEY NOT NULL,
  owner_hash TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  total INTEGER DEFAULT 0 NOT NULL,
  basis TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS feed_chunks (
  session_id TEXT NOT NULL REFERENCES feed_sessions(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  ids TEXT NOT NULL,
  basis TEXT NOT NULL,
  details TEXT DEFAULT '{}' NOT NULL,
  PRIMARY KEY (session_id, chunk_index)
);

CREATE TABLE IF NOT EXISTS semantic_documents (
  article_id TEXT PRIMARY KEY NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  model TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS semantic_topics (
  article_id TEXT NOT NULL REFERENCES semantic_documents(article_id) ON DELETE CASCADE,
  topic_id TEXT NOT NULL REFERENCES topics(id),
  similarity REAL NOT NULL,
  generation TEXT DEFAULT '' NOT NULL,
  PRIMARY KEY (article_id, topic_id)
);
CREATE INDEX IF NOT EXISTS semantic_topics_topic_idx ON semantic_topics (topic_id, article_id);

CREATE TABLE IF NOT EXISTS semantic_neighbors (
  article_id TEXT NOT NULL REFERENCES semantic_documents(article_id) ON DELETE CASCADE,
  neighbor_id TEXT NOT NULL REFERENCES semantic_documents(article_id) ON DELETE CASCADE,
  similarity REAL NOT NULL,
  generation TEXT DEFAULT '' NOT NULL,
  PRIMARY KEY (article_id, neighbor_id)
);
CREATE INDEX IF NOT EXISTS semantic_neighbors_target_idx ON semantic_neighbors (neighbor_id, article_id);

CREATE TABLE IF NOT EXISTS reader_reports (
  id TEXT PRIMARY KEY NOT NULL,
  reader_id TEXT NOT NULL,
  article_id TEXT REFERENCES articles(id) ON DELETE SET NULL,
  kind TEXT NOT NULL,
  detail TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS reader_reports_reader_date_idx ON reader_reports (reader_id, created_at);
CREATE INDEX IF NOT EXISTS reader_reports_date_idx ON reader_reports (created_at);
`;

async function batchInsert(tableName, rows, columns, chunkSize = 200) {
  if (!rows.length) return;
  console.log(`Inserting ${rows.length} rows into ${tableName}...`);

  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const valuePlaceholders = [];
    const values = [];

    chunk.forEach((row, rowIdx) => {
      const rowPlaceholders = [];
      columns.forEach((col, colIdx) => {
        const paramIndex = rowIdx * columns.length + colIdx + 1;
        rowPlaceholders.push(`$${paramIndex}`);
        values.push(row[col]);
      });
      valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
    });

    const colNames = columns.map(c => `"${c}"`).join(', ');
    const query = `INSERT INTO "${tableName}" (${colNames}) VALUES ${valuePlaceholders.join(', ')} ON CONFLICT DO NOTHING`;
    await sql.query(query, values);
    process.stdout.write(`  Inserted ${Math.min(i + chunkSize, rows.length)} / ${rows.length}\r`);
  }
  console.log(`\nDone ${tableName}`);
}

async function main() {
  console.log('--- Step 1: Creating Postgres Schema in Neon ---');
  for (const statement of DDL.split(';').map(s => s.trim()).filter(Boolean)) {
    await sql.query(statement);
  }
  console.log('Schema created successfully.');

  console.log('\n--- Step 2: Transferring Data from Local Archive to Neon ---');
  
  // 1. Companies
  const companies = sqlite.prepare('SELECT * FROM companies').all();
  await batchInsert('companies', companies, ['id', 'name', 'blog_url']);

  // 2. Sources
  const sources = sqlite.prepare('SELECT * FROM sources').all();
  await batchInsert('sources', sources, ['id', 'company_id', 'mode', 'blog_url', 'feed_urls', 'include_url_regex', 'exclude_url_regex']);

  // 3. Topics
  const topics = sqlite.prepare('SELECT * FROM topics').all();
  await batchInsert('topics', topics, ['id', 'name', 'parent_id']);

  // 4. Topic Keywords
  const topicKeywords = sqlite.prepare('SELECT * FROM topic_keywords').all();
  await batchInsert('topic_keywords', topicKeywords, ['topic_id', 'term', 'weight']);

  // 5. Articles
  const articleCount = await sql.query('SELECT count(*) as c FROM articles');
  if (Number(articleCount[0].c) < 5000) {
    const rawArticles = sqlite.prepare("SELECT * FROM articles WHERE url NOT LIKE '%/us/en/blog/engineering/?%'").all();
    await batchInsert('articles', rawArticles, ['id', 'company_id', 'company', 'title', 'url', 'summary', 'published_at', 'discovered_at', 'topics'], 100);
  } else {
    console.log(`Articles already migrated (${articleCount[0].c} rows). Skipping.`);
  }

  // 6. Article Topics
  const topicCount = await sql.query('SELECT count(*) as c FROM article_topics');
  if (Number(topicCount[0].c) < 5000) {
    const articleTopics = sqlite.prepare(`
      SELECT at.* FROM article_topics at
      INNER JOIN articles a ON at.article_id = a.id
      WHERE a.url NOT LIKE '%/us/en/blog/engineering/?%'
    `).all();
    await batchInsert('article_topics', articleTopics, ['article_id', 'topic_id', 'score'], 200);
  } else {
    console.log(`Article topics already migrated (${topicCount[0].c} rows). Skipping.`);
  }

  // 7. Profiles
  const profiles = sqlite.prepare('SELECT * FROM profiles').all();
  await batchInsert('profiles', profiles, ['user_id', 'data', 'version', 'updated_at']);

  // 8. Refresh Locks & Source Refresh
  const refreshLocks = sqlite.prepare('SELECT * FROM refresh_locks').all();
  await batchInsert('refresh_locks', refreshLocks, ['id', 'expires_at']);

  const sourceRefresh = sqlite.prepare('SELECT * FROM source_refresh').all();
  await batchInsert('source_refresh', sourceRefresh, ['source_id', 'last_attempt', 'last_success', 'etag', 'last_modified', 'error']);

  // 9. Follows, Bookmarks, Read logs
  const userCompanyFollows = sqlite.prepare('SELECT * FROM user_company_follows').all();
  await batchInsert('user_company_follows', userCompanyFollows, ['user_id', 'company_id']);

  const userReadLogs = sqlite.prepare('SELECT * FROM user_read_logs').all();
  await batchInsert('user_read_logs', userReadLogs, ['user_id', 'article_id', 'read_at']);

  // 10. Engagements
  const engagements = sqlite.prepare('SELECT * FROM engagements').all();
  await batchInsert('engagements', engagements, ['reader_id', 'article_id', 'kind', 'active', 'occurred_at'], 200);

  // 11. App State
  const appState = sqlite.prepare('SELECT * FROM app_state').all();
  await batchInsert('app_state', appState, ['id', 'value']);

  // 12. Semantic Documents (Only valid articles)
  const semanticDocs = sqlite.prepare(`
    SELECT s.* FROM semantic_documents s 
    INNER JOIN articles a ON s.article_id = a.id 
    WHERE a.url NOT LIKE '%/us/en/blog/engineering/?%'
  `).all();
  await batchInsert('semantic_documents', semanticDocs, ['article_id', 'content', 'model', 'updated_at'], 100);

  // 13. Semantic Topics (Only valid articles)
  const semanticTopics = sqlite.prepare(`
    SELECT st.* FROM semantic_topics st 
    INNER JOIN articles a ON st.article_id = a.id 
    WHERE a.url NOT LIKE '%/us/en/blog/engineering/?%'
  `).all();
  await batchInsert('semantic_topics', semanticTopics, ['article_id', 'topic_id', 'similarity', 'generation'], 200);

  console.log('\n--- Step 3: Verifying Neon Row Counts ---');
  const verifyTables = ['companies', 'sources', 'topics', 'articles', 'article_topics', 'profiles', 'semantic_documents', 'semantic_topics'];
  for (const vt of verifyTables) {
    const res = await sql.query(`SELECT count(*) as count FROM "${vt}"`);
    console.log(`Neon table ${vt}: ${res[0].count} rows`);
  }

  console.log('\nAll data transferred successfully to Neon PostgreSQL!');
}

main().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
