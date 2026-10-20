"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight, BookOpen, Bookmark, BookOpenCheck } from "lucide-react";
import type { CompanyDirectory as DirectoryData } from "@/lib/company-types";
import { useReadingProfile } from "@/lib/useReadingProfile";
import SiteHeader from "./SiteHeader";
import CompanyDirectory from "./companies/CompanyDirectory";
import CompanySpotlight from "./companies/CompanySpotlight";
import { formatCount } from "./companies/CompanyMetrics";

export default function CompaniesView({ initial }: { initial: DirectoryData }) {
  const [directory, setDirectory] = useState(initial);
  const [refreshError, setRefreshError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const { profile, ready, updateProfile, storageLabel, syncStatus } = useReadingProfile();

  useEffect(() => {
    const controller = new AbortController();
    let sequence = 0;
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      const current = ++sequence;
      try {
        const response = await fetch("/api/companies", { cache: "no-store", signal: controller.signal });
        if (!response.ok) throw new Error("Company totals unavailable");
        const result = await response.json() as DirectoryData;
        if (!controller.signal.aborted && current === sequence) { setDirectory(result); setRefreshError(false); }
      } catch { if (!controller.signal.aborted && current === sequence) setRefreshError(true); }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 60000);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener("focus", refresh); document.removeEventListener("visibilitychange", refresh); };
  }, [retry, syncStatus]);

  const companies = directory.companies;
  const spotlight = companies.find(company => company.id === "stripe" && company.blogCount > 0) ?? companies.find(company => company.blogCount > 0);
  const total = (key: "blogCount" | "bookmarks" | "readLogs") => companies.reduce((sum, company) => sum + company[key], 0);
  const toggleFollow = (id: string) => {
    if (!ready) return;
    const wasFollowing = profile.follows.includes(id);
    updateProfile({ follows: wasFollowing ? profile.follows.filter(value => value !== id) : [...profile.follows, id] });
    setAnnouncement(`${companies.find(company => company.id === id)?.name ?? "Company"} ${wasFollowing ? "removed from" : "added to"} your Following feed.`);
  };

  return <div className="publication view-companies">
    <a className="skip-link" href="#companies-main">Skip to companies</a>
    <SiteHeader active="companies" />
    <main className="reading-main companies-main" id="companies-main">
      <section className="companies-intro" aria-labelledby="companies-heading"><div className="companies-intro-copy"><p className="directory-eyebrow">The teams behind the ideas</p><h1 id="companies-heading">Find your next<br /><em>favorite team.</em></h1><p>Good engineering is worth sharing. Explore the companies opening their notebooks, and follow the ones that make you think.</p></div><div className="collective-shelf"><p className="directory-eyebrow">On the bookshelf</p><div className="shelf-big-number"><strong>{companies.length}</strong><span>companies.<br />A world of engineering.</span></div><div className="shelf-stat"><BookOpen size={15} strokeWidth={1.5} /><strong>{formatCount(total("blogCount"))}</strong><span>collected blogs</span></div><div className="shelf-small-stats"><span><Bookmark size={12} />{directory.communityAvailable ? formatCount(total("bookmarks")) : "—"} bookmarks</span><span><BookOpenCheck size={13} />{directory.communityAvailable ? formatCount(total("readLogs")) : "—"} read logs</span></div></div></section>
      {spotlight && <CompanySpotlight company={spotlight} available={directory.communityAvailable} following={profile.follows.includes(spotlight.id)} ready={ready} onToggle={() => toggleFollow(spotlight.id)} />}
      <CompanyDirectory companies={companies} available={directory.communityAvailable} follows={profile.follows} ready={ready} onToggle={toggleFollow} />
      <div className="directory-data-note"><p>Blogs are articles collected in readzz, not a publisher’s complete archive. Followers count synced accounts; bookmarks and read logs count shared reader actions.</p><p>{ready ? storageLabel : "Opening your reading profile…"}{ready && syncStatus === "local" && <> · <a href="/signin-with-chatgpt?return_to=%2Fcompanies" target="_top">Sign in to sync follows <ArrowUpRight size={11} /></a></>}{!directory.communityAvailable && " · Community totals are temporarily unavailable."}</p>{refreshError && <p role="status">Showing the last loaded totals. <button onClick={() => setRetry(value => value + 1)}>Try again</button></p>}{ready && syncStatus === "error" && <p role="status">Your follows are saved on this device. Account sync needs attention in <a href="/profile">your profile</a>.</p>}</div>
      <p className="sr-only" role="status">{announcement}</p>
      <footer className="paper-footer"><span>Good ideas have good company.</span><span>Stories stay with their publishers.</span></footer>
    </main>
  </div>;
}
