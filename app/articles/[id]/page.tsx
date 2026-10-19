import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ArticleDetail from "@/components/ArticleDetail";
import { loadArticle } from "@/lib/server/store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const article = await loadArticle(id);
  return { title: article ? `${article.title} — Longreads` : "Article not found — Longreads", description: article?.summary || "An engineering story, a short abstract, and your personal reading log." };
}

export default async function ArticlePage({ params }: Props) {
  const { id } = await params;
  const article = await loadArticle(id);
  if (!article) notFound();
  return <ArticleDetail article={article} />;
}
