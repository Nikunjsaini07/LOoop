"use client";

import { useEffect, useState } from "react";
import { ArrowUpRight } from "lucide-react";
import type { CompanyDirectory as DirectoryData } from "@/lib/company-types";
import { useReadingProfile } from "@/lib/useReadingProfile";
import SiteHeader from "./SiteHeader";
import { useRequireAccount } from "./AuthProvider";
import ProfileSyncNotice from "./ProfileSyncNotice";
import CompanyDirectory from "./companies/CompanyDirectory";
import { formatCount } from "./companies/CompanyMetrics";

export default function CompaniesView({ initial }: { initial: DirectoryData }) {
  const [directory, setDirectory] = useState(initial);
  const [refreshError, setRefreshError] = useState(false);
  const [retry, setRetry] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const requireAccount = useRequireAccount();
  const reading = useReadingProfile();
  const { profile, ready, updateProfile, syncStatus } = reading;

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
  const total = (key: "blogCount" | "bookmarks" | "readLogs") => companies.reduce((sum, company) => sum + company[key], 0);
  const toggleFollow = (id: string) => {
    if (!ready || !requireAccount({ kind: "follow", id, active: !profile.follows.includes(id) })) return;
    const wasFollowing = profile.follows.includes(id);
    if (!updateProfile({ follows: wasFollowing ? profile.follows.filter(value => value !== id) : [...profile.follows, id] })) return;
    setAnnouncement(`${companies.find(company => company.id === id)?.name ?? "Company"} ${wasFollowing ? "removed from" : "added to"} your Following feed.`);
  };

  return <div className="publication view-companies">
    <a className="skip-link" href="#companies-main">Skip to companies</a>
    <SiteHeader active="companies" />
    <main className="reading-main companies-main" id="companies-main">
      <ProfileSyncNotice {...reading} />
      <section className="companies-intro" aria-labelledby="companies-heading">
        <p className="issue-pill">{companies.length} companies · {formatCount(total("blogCount"))} collected blogs</p>
        <h1 id="companies-heading">Good ideas.<br /><em>Good company.</em></h1>
        <p className="hero-description">Follow the engineering teams you want to hear from. Find their blogs in your Following feed.</p>
      </section>
      <CompanyDirectory companies={companies} available={directory.communityAvailable} follows={profile.follows} ready={ready} onToggle={toggleFollow} />
      <div className="directory-data-note"><p>Blogs come from each company’s own blog. Follow a team to keep up with its writing.</p>{ready && syncStatus === "local" && <p><a href="/sign-in?return_to=%2Fcompanies">Sign in to follow companies <ArrowUpRight size={11} /></a></p>}{refreshError && <p role="status">Showing the last loaded totals. <button onClick={() => setRetry(value => value + 1)}>Try again</button></p>}{ready && syncStatus === "error" && <p role="status">Your follows are saved on this device. Account sync needs attention in <a href="/profile">your profile</a>.</p>}</div>
      <p className="sr-only" role="status">{announcement}</p>
      <footer className="paper-footer"><span>Good ideas have good company.</span><span>Blogs stay with their publishers.</span></footer>
    </main>
  </div>;
}
