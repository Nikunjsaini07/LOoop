import type { Source } from "../types";
import { TOPIC_CATALOG, classifyTopics } from "../topics.ts";

export const sqlLiteral = (value: string | number | null): string => value === null ? "NULL" : typeof value === "number" ? String(value) : `'${value.replaceAll("'", "''")}'`;

export function catalogSql(sources: Source[]): string {
  const lines: string[] = [];
  for (const source of sources) {
    lines.push(`INSERT INTO companies(id,name,blog_url) VALUES (${[source.id, source.company, source.blog_url].map(sqlLiteral).join(",")}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,blog_url=excluded.blog_url;`);
    lines.push(`INSERT INTO sources(id,company_id,mode,blog_url,feed_urls,include_url_regex,exclude_url_regex) VALUES (${[source.id, source.id, source.mode, source.blog_url, JSON.stringify(source.feed_urls),source.include_url_regex??null,source.exclude_url_regex??null].map(sqlLiteral).join(",")}) ON CONFLICT(id) DO UPDATE SET mode=excluded.mode,blog_url=excluded.blog_url,feed_urls=excluded.feed_urls,include_url_regex=excluded.include_url_regex,exclude_url_regex=excluded.exclude_url_regex;`);
  }
  for (const topic of TOPIC_CATALOG) {
    lines.push(`INSERT INTO topics(id,name,parent_id) VALUES (${[topic.id, topic.name, topic.parent].map(sqlLiteral).join(",")}) ON CONFLICT(id) DO UPDATE SET name=excluded.name,parent_id=excluded.parent_id;`);
    for (const term of topic.keywords) lines.push(`INSERT OR IGNORE INTO topic_keywords(topic_id,term,weight) VALUES (${sqlLiteral(topic.id)},${sqlLiteral(term)},1);`);
  }
  return lines.join("\n");
}

export function backfillTopicSql(articles: { id: string; title: string; summary: string }[]): string {
  return articles.map(article => {
    const tags = sqlLiteral(JSON.stringify(classifyTopics(article.title, article.summary).map(topic => topic.name)));
    return `UPDATE articles SET topics=${tags} WHERE id=${sqlLiteral(article.id)} AND topics IS NOT ${tags};`;
  }).join("\n");
}

export function profileProjectionSql(): string {
  return `
    INSERT OR IGNORE INTO user_company_follows SELECT p.user_id,c.id FROM profiles p,json_each(CASE WHEN json_valid(p.data) THEN p.data ELSE '{}' END,'$.follows') j JOIN companies c ON c.id=j.value;
    INSERT OR IGNORE INTO user_topic_follows SELECT p.user_id,t.id FROM profiles p,json_each(CASE WHEN json_valid(p.data) THEN p.data ELSE '{}' END,'$.interests') j JOIN topics t ON t.name=j.value OR t.id=j.value;
    INSERT OR IGNORE INTO user_bookmarks SELECT p.user_id,a.id FROM profiles p,json_each(CASE WHEN json_valid(p.data) THEN p.data ELSE '{}' END,'$.bookmarks') j JOIN articles a ON a.id=j.value;
    INSERT OR IGNORE INTO user_read_logs SELECT p.user_id,a.id,json_extract(j.value,'$.readAt') FROM profiles p,json_each(CASE WHEN json_valid(p.data) THEN p.data ELSE '{}' END,'$.readLogs') j JOIN articles a ON a.id=json_extract(j.value,'$.articleId');
    INSERT OR IGNORE INTO article_topics(article_id,topic_id) SELECT a.id,t.id FROM articles a,json_each(CASE WHEN json_valid(a.topics) THEN a.topics ELSE '[]' END) j JOIN topics t ON t.name=j.value OR t.id=j.value;
  `;
}

export function profileTriggerSql(): string {
  const body = `
    DELETE FROM user_company_follows WHERE user_id=NEW.user_id;
    INSERT OR IGNORE INTO user_company_follows SELECT NEW.user_id,c.id FROM json_each(NEW.data,'$.follows') j JOIN companies c ON c.id=j.value;
    DELETE FROM user_topic_follows WHERE user_id=NEW.user_id;
    INSERT OR IGNORE INTO user_topic_follows SELECT NEW.user_id,t.id FROM json_each(NEW.data,'$.interests') j JOIN topics t ON t.name=j.value OR t.id=j.value;
    DELETE FROM user_bookmarks WHERE user_id=NEW.user_id;
    INSERT OR IGNORE INTO user_bookmarks SELECT NEW.user_id,a.id FROM json_each(NEW.data,'$.bookmarks') j JOIN articles a ON a.id=j.value;
    DELETE FROM user_read_logs WHERE user_id=NEW.user_id;
    INSERT OR IGNORE INTO user_read_logs SELECT NEW.user_id,a.id,json_extract(j.value,'$.readAt') FROM json_each(NEW.data,'$.readLogs') j JOIN articles a ON a.id=json_extract(j.value,'$.articleId');
  `;
  return ['INSERT', 'UPDATE OF data'].map((event,index) => `CREATE TRIGGER IF NOT EXISTS readzz_profile_${index ? 'update' : 'insert'} AFTER ${event} ON profiles WHEN json_valid(NEW.data) BEGIN\n${body.trim()}\nEND;`).join('\n');
}
