import { TOPIC_CATALOG, classifyTopics } from "./topics.ts";
import type { Article } from './types.ts';

export function publisherExcerpt(article: Pick<Article, 'title' | 'summary'>) {
  const summary = article.summary.trim();
  if (summary.toLocaleLowerCase() === article.title.trim().toLocaleLowerCase()) return '';
  // Some syndicated posts prepend a long, comma-separated author roster.
  // Remove it only when both its byline and Introduction boundary are explicit.
  const introduction = summary.indexOf(' Introduction ');
  if (/^By\s+[A-Z]/.test(summary) && introduction > 0 && introduction < 500 && (summary.slice(0, introduction).match(/,/g)?.length ?? 0) >= 3) return summary.slice(introduction + ' Introduction '.length).trim();
  return summary;
}

export function visibleTopics(article: Pick<Article, 'title' | 'topics'>) {
  const titleTopics = new Set(classifyTopics(article.title, '').map(topic => topic.name));
  const specific = new Set<string>(TOPIC_CATALOG.filter(topic => topic.parent && titleTopics.has(topic.name)).map(topic => topic.name));
  const priority = (name: string) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return new RegExp(`(?:^|[^a-z0-9_])${escaped}(?=$|[^a-z0-9_])`, 'i').test(article.title) ? 3 : specific.has(name) ? 1 : 0;
  };
  return [...article.topics].sort((a, b) => priority(b) - priority(a));
}
