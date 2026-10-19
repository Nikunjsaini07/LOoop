import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

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
