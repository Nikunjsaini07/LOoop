import type { Article, Profile } from "./types";

export function articleDate(article: Article) { return new Date(article.published_at || article.discovered_at).getTime() || 0; }

export function recommendationReason(article: Article, profile: Profile, articles: Article[] = []): string {
  const interest = article.topics.find((topic) => profile.interests.includes(topic));
  if (interest) return `For your interest in ${interest}`;
  if (profile.follows.includes(article.company_id)) return `From ${article.company}, a team you follow`;
  const savedTopics = new Set(articles.filter((item) => profile.bookmarks.includes(item.id)).flatMap((item) => item.topics));
  const related = article.topics.find((topic) => savedTopics.has(topic));
  return related ? `More ${related}, like your saved articles` : "A different perspective to explore";
}

export function rankArticles(articles: Article[], profile: Profile, mode: "personal" | "trending" = "personal", now = Date.now(), context: Article[] = articles): Article[] {
  const savedTopics = new Set(context.filter((item) => profile.bookmarks.includes(item.id)).flatMap((item) => item.topics));
  const scored = articles.map((article) => {
    const ageDays = Math.max(0, (now - articleDate(article)) / 86400000);
    const freshness = 4 / (1 + ageDays / 14);
    const personal = mode === "personal" ? (profile.follows.includes(article.company_id) ? 3 : 0) + article.topics.reduce((sum, topic) => sum + (profile.interests.includes(topic) ? 2 : 0) + (savedTopics.has(topic) ? 0.6 : 0), 0) : Math.min(article.topics.length, 3) * 0.25;
    return { article, score: freshness + personal };
  });
  const result: Article[] = [];
  const companies = new Map<string, number>();
  while (scored.length) {
    let best = 0;
    let score = -Infinity;
    for (let index = 0; index < scored.length; index++) {
      const candidate = scored[index].score - (companies.get(scored[index].article.company_id) || 0) * 1.8;
      if (candidate > score) { score = candidate; best = index; }
    }
    const [{ article }] = scored.splice(best, 1);
    result.push(article);
    companies.set(article.company_id, (companies.get(article.company_id) || 0) + 1);
  }
  return result;
}
