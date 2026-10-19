import BlogReader from "@/components/BlogReader";
import { selectArticles } from "./core";
import { loadArticles, sources } from "./store";

type ReaderView = "home" | "trending" | "profile";

export async function renderReader(initialView: ReaderView) {
  const loaded = await loadArticles();
  const snapshot = new Date().toISOString();
  const eligible = selectArticles(loaded.articles, new URLSearchParams(), snapshot);
  const articles = eligible.slice(0, 100);
  const hasMore = eligible.length > articles.length;

  return <BlogReader initialView={initialView} initial={{
    articles,
    sources,
    total: eligible.length,
    hasMore,
    nextCursor: hasMore ? String(articles.length) : null,
    snapshot,
    updatedAt: loaded.updatedAt,
  }} />;
}
