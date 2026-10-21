import type { Metadata } from "next";
import { notFound } from "next/navigation";
import ArticleDetail from "@/components/ArticleDetail";
import { safeReturnPath } from "@/lib/auth-path";
import { loadArticle } from "@/lib/server/store";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ return_to?: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const article = await loadArticle(id);
  return { title: article ? `${article.title} — Readwell` : "Article not found — Readwell", description: article?.summary || "An engineering story, a short abstract, and your personal reading log." };
}

export default async function ArticlePage({ params, searchParams }: Props) {
  const { id } = await params;
  const article = await loadArticle(id);
  if (!article) notFound();
  const search = await searchParams;
  return <ArticleDetail article={article} returnTo={search.return_to ? safeReturnPath(search.return_to) : "/"} />;
}
