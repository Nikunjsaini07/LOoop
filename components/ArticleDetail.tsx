"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, ArrowUpRight, Bookmark, BookOpenCheck, Check, LoaderCircle } from "lucide-react";
import { useReadingProfile } from "@/lib/useReadingProfile";
import type { Article } from "@/lib/types";

const dateLabel = (value: string) => new Date(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });

export default function ArticleDetail({ article }: { article: Article }) {
  const { profile, ready, storageLabel, syncStatus, recordOpen, toggleBookmark, toggleReadLog } = useReadingProfile();
  const [message, setMessage] = useState("");
  const saved = profile.bookmarks.includes(article.id);
  const readLog = profile.readLogs.find((log) => log.articleId === article.id);
  const publisher = new URL(article.url).hostname.replace(/^www\./, "");
  const abstract = article.summary.trim();
  const logRead = () => {
    try { toggleReadLog(article); setMessage(""); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Your reading log could not be updated. Try again."); }
  };

  return <div className="publication view-article">
    <a className="skip-link" href="#article-detail">Skip to article</a>
    <header className="site-header">
      <a className="wordmark" href="/"><span className="brand-mark" aria-hidden="true">⁄</span>Longreads</a>
      <nav className="main-nav" aria-label="Main navigation"><a className="nav-item is-active" href="/">Feed</a><a className="nav-item" href="/trending">Trending</a><a className="nav-item" href="/profile">Profile</a></nav>
    </header>
    <main className="reading-main detail-main" id="article-detail">
      <a className="back-to-feed" href="/"><ArrowLeft size={13} /> Back to feed</a>
      <article>
        <header className="detail-heading">
          <div className="detail-byline"><span>{article.company}</span><i aria-hidden="true" /><time dateTime={article.published_at || article.discovered_at}>{article.published_at ? "" : "Collected "}{dateLabel(article.published_at || article.discovered_at)}</time></div>
          <h1>{article.title}</h1>
          <div className="detail-tags">{article.topics.map((topic) => <span className="article-topic" key={topic}>{topic}</span>)}</div>
        </header>
        <section className="abstract-tray tray" aria-labelledby="abstract-heading">
          <div className="abstract-sheet sheet"><h2 className="eyebrow" id="abstract-heading">The short version</h2><p className={abstract ? "detail-abstract" : "detail-abstract detail-no-abstract"}>{abstract || "The publisher hasn’t provided an abstract for this article. Follow the link below to read the original story."}</p></div>
          <div className="abstract-source"><span>From {publisher}</span><span>Publisher excerpt</span></div>
        </section>
        <a className="detail-publisher-link" href={article.url} target="_blank" rel="noopener noreferrer" onClick={() => recordOpen(article)}><span><strong>Read the original article</strong><small>{publisher}</small></span><ArrowUpRight size={20} strokeWidth={1.5} /></a>
        <section className="detail-log tray" aria-labelledby="reading-log-heading">
          <div className="detail-log-sheet sheet"><div className="detail-log-copy"><span className="log-glyph" aria-hidden="true">{readLog ? <Check size={18} /> : <BookOpenCheck size={18} strokeWidth={1.5} />}</span><div><h2 id="reading-log-heading">Your reading log</h2><p>{readLog ? `Read · ${dateLabel(readLog.readAt)}` : "Finished the original? Keep a record."}</p></div></div><button className={`ink-button read-log-button${readLog ? " is-logged" : ""}`} disabled={!ready} aria-pressed={!!readLog} onClick={logRead}>{!ready ? <LoaderCircle size={14} className="spinning" /> : readLog ? <Check size={14} /> : <BookOpenCheck size={14} />}{readLog ? "Logged as read" : "Log as read"}</button></div>
          <div className="detail-log-footer"><span>{readLog ? "Click again to undo." : "Only you decide when it’s read."}</span><a href="/profile?tab=read-log">View reading log <ArrowRight size={11} /></a></div>
        </section>
        {message && <p className="detail-message" role="alert">{message}</p>}
        <div className="detail-secondary-actions"><button className="text-button" disabled={!ready} aria-pressed={saved} onClick={() => toggleBookmark(article)}><Bookmark size={14} fill={saved ? "currentColor" : "none"} />{saved ? "Bookmarked" : "Save for later"}</button><span className="detail-storage" role="status">{ready ? storageLabel : "Opening your reading profile…"}</span></div>
        {ready && syncStatus === "local" && <p className="detail-sync-link"><a href={`/signin-with-chatgpt?return_to=${encodeURIComponent(`/articles/${article.id}`)}`} target="_top">Sign in to sync across devices <ArrowUpRight size={11} /></a></p>}
      </article>
      <footer className="paper-footer"><span>A little reading, every day.</span><span>Stories stay with their publishers.</span></footer>
    </main>
  </div>;
}
