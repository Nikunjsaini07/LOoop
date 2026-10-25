"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowRight, ChevronDown, Search, X } from "lucide-react";
import type { CompanySummary } from "@/lib/company-types";
import { companyDescription, companyHref } from "@/lib/company-editorial";
import CompanyLogo from "../CompanyLogo";
import CompanyFollowButton from "./CompanyFollowButton";
import { formatCount } from "./CompanyMetrics";

type Sort = "blogs" | "name" | "followers" | "bookmarks" | "readLogs";

function CompanyRow({ company, available, following, ready, onToggle }: {
  company: CompanySummary; available: boolean; following: boolean; ready: boolean; onToggle: () => void;
}) {
  return <article className="company-directory-row tray">
    <div className="directory-company-sheet sheet">
    <div className="directory-company-topline">
    <a className="directory-company-identity" href={companyHref(company.id)} aria-label={`Browse ${company.name} blogs${available ? `, ${formatCount(company.followers)} ${company.followers === 1 ? "follower" : "followers"} on Readwell` : ", follower count unavailable"}`}>
      <span className="directory-logo"><CompanyLogo companyId={company.id} company={company.name} size={18} decorative /></span>
      <span className="directory-company-copy"><h3>{company.name}</h3><span className="directory-follower-count" title={available ? `Readers following ${company.name} on Readwell` : "Follower count is temporarily unavailable"}>{available ? formatCount(company.followers) : "—"} {available && company.followers === 1 ? "follower" : "followers"}</span></span>
    </a>
    {company.sourceMode === "manual" ? <span className="source-status">Manual source</span> : <CompanyFollowButton name={company.name} following={following} ready={ready} onToggle={onToggle} />}
    </div>
    <p className="directory-company-description">{companyDescription(company)}</p>
    {company.latestArticle ? <a className="directory-latest-story" href={`/articles/${encodeURIComponent(company.latestArticle.id)}`}><span>Latest collected blog</span><h4>{company.latestArticle.title}</h4><ArrowRight size={15} aria-hidden="true" /></a> : <p className="directory-awaiting">{company.sourceMode === "manual" ? "Automatic collection is unavailable. Read this publisher at its own blog." : "No blogs collected yet. Check the publisher’s blog for its latest writing."}</p>}
    {company.sourceMode === "manual" ? <a className="text-button source-original" href={company.blogUrl} target="_blank" rel="noopener noreferrer">Visit publisher<ArrowRight size={13} /></a> : <p className="source-health">{company.collectionDelayed ? "Collection delayed · " : ""}{company.lastCollectedAt ? `Last checked ${new Date(company.lastCollectedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" })}` : "Collection status unavailable"}</p>}
    </div>
    <div className="article-footer"><span className="directory-story-count">{formatCount(company.blogCount)} {company.blogCount === 1 ? "blog" : "blogs"}</span><a className="original-link" href={companyHref(company.id)}>Explore company<ArrowRight size={13} /></a></div>
  </article>;
}

export default function CompanyDirectory({ companies, available, follows, ready, onToggle }: {
  companies: CompanySummary[]; available: boolean; follows: string[]; ready: boolean; onToggle: (id: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [followingOnly, setFollowingOnly] = useState(false);
  const [sort, setSort] = useState<Sort>("blogs");
  const [visible, setVisible] = useState(12);
  const matched = useMemo(() => companies.filter(company => (!followingOnly || follows.includes(company.id)) &&
    `${company.name} ${company.topics.join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()))
    .sort((a, b) => (sort === "name" ? 0 : (sort === "blogs" ? b.blogCount - a.blogCount : b[sort] - a[sort])) || a.name.localeCompare(b.name)),
  [companies, followingOnly, follows, query, sort]);
  const reset = () => { setQuery(""); setFollowingOnly(false); setVisible(12); };

  return <section className="company-directory" id="company-directory" aria-labelledby="company-directory-heading">
    <h2 className="sr-only" id="company-directory-heading">Explore companies</h2>
    <div className="search-tray tray"><label className="search-sheet sheet"><Search size={16} strokeWidth={1.6} aria-hidden="true" /><input type="search" placeholder="Search companies or topics" aria-label="Search companies or topics" value={query} onChange={event => { setQuery(event.target.value); setVisible(12); }} />{query && <button className="directory-clear" aria-label="Clear company search" onClick={() => { setQuery(""); setVisible(12); }}><X size={14} /></button>}</label></div>
    <div className="directory-filter-bar"><div className="directory-tabs" role="group" aria-label="Filter companies"><button className={!followingOnly ? "is-active" : ""} aria-pressed={!followingOnly} onClick={() => { setFollowingOnly(false); setVisible(12); }}>All companies <span>{companies.length}</span></button><button className={followingOnly ? "is-active" : ""} aria-pressed={followingOnly} disabled={!ready} onClick={() => { setFollowingOnly(true); setVisible(12); }}>Following <span>{ready ? companies.filter(company => follows.includes(company.id)).length : "—"}</span></button></div><label className="directory-sort edition-select"><span className="sr-only">Sort companies</span><select value={sort} onChange={event => { setSort(event.target.value as Sort); setVisible(12); }}><option value="blogs">Most blogs</option><option value="name">Name, A–Z</option><option value="followers" disabled={!available}>Most followed</option><option value="bookmarks" disabled={!available}>Most bookmarked</option><option value="readLogs" disabled={!available}>Most read logs</option></select><ChevronDown size={12} /></label></div>
    <p className="sr-only" role="status">{matched.length} {matched.length === 1 ? "company" : "companies"}{query ? " found" : ""}</p>
    {matched.length ? <><div className="company-directory-list">{matched.slice(0, visible).map(company => <CompanyRow key={company.id} company={company} available={available} following={follows.includes(company.id)} ready={ready} onToggle={() => onToggle(company.id)} />)}</div><div className="directory-list-footer"><span>Showing {Math.min(visible, matched.length)} of {matched.length} companies</span>{visible < matched.length && <button className="company-load-more" onClick={() => setVisible(count => count + 12)}>More companies <ArrowDown size={13} /></button>}</div></> : <div className="directory-empty"><Search size={23} strokeWidth={1.3} /><h3>{query ? "No matching teams." : "Your reading circle starts here."}</h3><p>{query ? `We couldn’t find a company or topic matching “${query.trim()}”. Try another search.` : "Follow a company to keep its blogs close. You’ll find your teams here."}</p><button className="ink-button" onClick={reset}>{query ? "Clear filters" : "Explore all companies"}<ArrowRight size={13} /></button></div>}
  </section>;
}
