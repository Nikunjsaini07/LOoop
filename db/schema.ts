import { index, integer, primaryKey, real, sqliteTable, text } from "drizzle-orm/sqlite-core";

// Migrations create these tables. Request handlers never create schema at runtime.
export const articles = sqliteTable("articles", {
  id: text("id").primaryKey(),
  companyId: text("company_id").notNull(),
  company: text("company").notNull(),
  title: text("title").notNull(),
  url: text("url").notNull().unique(),
  summary: text("summary").notNull(),
  publishedAt: text("published_at"),
  discoveredAt: text("discovered_at").notNull(),
  topics: text("topics").notNull(),
}, (table) => [index("articles_company_idx").on(table.companyId)]);

export const profiles = sqliteTable("profiles", {
  userId: text("user_id").primaryKey(),
  data: text("data").notNull(),
  version: integer("version").notNull().default(1),
  updatedAt: text("updated_at").notNull(),
});

export const sourceRefresh = sqliteTable("source_refresh", {
  sourceId: text("source_id").primaryKey(),
  lastAttempt: text("last_attempt"),
  lastSuccess: text("last_success"),
  etag: text("etag"),
  lastModified: text("last_modified"),
  error: text("error"),
});

export const refreshLocks = sqliteTable("refresh_locks", {
  id: text("id").primaryKey(),
  expiresAt: text("expires_at").notNull(),
});

export const companies = sqliteTable("companies", { id: text("id").primaryKey(), name: text("name").notNull(), blogUrl: text("blog_url").notNull() });
export const sources = sqliteTable("sources", { id: text("id").primaryKey(), companyId: text("company_id").notNull().references(() => companies.id), mode: text("mode").notNull(), blogUrl: text("blog_url").notNull(), feedUrls: text("feed_urls").notNull(), includeUrlRegex: text("include_url_regex"), excludeUrlRegex: text("exclude_url_regex") });
export const topics = sqliteTable("topics", { id: text("id").primaryKey(), name: text("name").notNull().unique(), parentId: text("parent_id") });
export const topicKeywords = sqliteTable("topic_keywords", { topicId: text("topic_id").notNull().references(() => topics.id), term: text("term").notNull(), weight: real("weight").notNull().default(1) }, t => [primaryKey({ columns: [t.topicId, t.term] })]);
export const articleTopics = sqliteTable("article_topics", { articleId: text("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }), topicId: text("topic_id").notNull().references(() => topics.id), score: real("score").notNull().default(1) }, t => [primaryKey({ columns: [t.articleId, t.topicId] }), index("article_topics_topic_idx").on(t.topicId, t.articleId)]);
export const userCompanyFollows = sqliteTable("user_company_follows", { userId: text("user_id").notNull().references(() => profiles.userId, { onDelete: "cascade" }), companyId: text("company_id").notNull().references(() => companies.id) }, t => [primaryKey({ columns: [t.userId, t.companyId] })]);
export const userTopicFollows = sqliteTable("user_topic_follows", { userId: text("user_id").notNull().references(() => profiles.userId, { onDelete: "cascade" }), topicId: text("topic_id").notNull().references(() => topics.id) }, t => [primaryKey({ columns: [t.userId, t.topicId] })]);
export const userBookmarks = sqliteTable("user_bookmarks", { userId: text("user_id").notNull().references(() => profiles.userId, { onDelete: "cascade" }), articleId: text("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }) }, t => [primaryKey({ columns: [t.userId, t.articleId] })]);
export const userReadLogs = sqliteTable("user_read_logs", { userId: text("user_id").notNull().references(() => profiles.userId, { onDelete: "cascade" }), articleId: text("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }), readAt: text("read_at").notNull() }, t => [primaryKey({ columns: [t.userId, t.articleId] })]);
export const engagements = sqliteTable("engagements", { readerId: text("reader_id").notNull(), articleId: text("article_id").notNull().references(() => articles.id, { onDelete: "cascade" }), kind: text("kind").notNull(), active: integer("active").notNull(), occurredAt: text("occurred_at").notNull() }, t => [primaryKey({ columns: [t.readerId, t.articleId, t.kind] }), index("engagements_recent_idx").on(t.active, t.occurredAt, t.articleId)]);
export const appState = sqliteTable("app_state", { id: text("id").primaryKey(), value: integer("value").notNull() });
export const feedSessions = sqliteTable("feed_sessions", { id: text("id").primaryKey(), ownerHash: text("owner_hash").notNull(), requestHash: text("request_hash").notNull(), createdAt: text("created_at").notNull(), expiresAt: text("expires_at").notNull(), total: integer("total").notNull().default(0), basis: text("basis").notNull() });
export const feedChunks = sqliteTable("feed_chunks", { sessionId: text("session_id").notNull().references(() => feedSessions.id, { onDelete: "cascade" }), chunkIndex: integer("chunk_index").notNull(), ids: text("ids").notNull(), basis: text("basis").notNull() }, t => [primaryKey({ columns: [t.sessionId, t.chunkIndex] })]);
