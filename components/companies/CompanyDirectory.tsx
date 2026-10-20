"use client";

import { useMemo, useState } from "react";
import { ArrowDown, ArrowRight, ChevronDown, Search, X } from "lucide-react";
import type { CompanySummary } from "@/lib/company-types";
import { companyHref } from "@/lib/company-editorial";
import CompanyLogo from "../CompanyLogo";
import CompanyFollowButton from "./CompanyFollowButton";
import CompanyMetrics from "./CompanyMetrics";

type Sort = "blogs" | "name" | "followers" | "bookmarks" | "readLogs";

function CompanyRow({ company, available, following, ready, onToggle }: {
  company: CompanySummary; available: boolean; following: boolean; ready: boolean; onToggle: () => void;
}) {
  return <article className="company-directory-row">
    <a className="directory-company-identity" href={companyHref(company.id)} aria-label={`Browse ${company.name} blogs`}>
      <span className="directory-logo"><CompanyLogo companyId={company.id} company={company.name} size={23} decorative /></span>
      <span><h3>{company.name}<ArrowRight size={12} /></h3><span className="directory-company-topics">{company.blogCount ? company.topics.slice(0, 2).join(" · ") || "Engineering" : "Awaiting first blog"}</span></span>
    </a>
    <CompanyMetrics company={company} available={available} />
    <CompanyFollowButton name={company.name} following={following} ready={ready} onToggle={onToggle} />
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
    <div className="directory-section-heading"><div><p className="directory-eyebrow">An open index</p><h2 id="company-directory-heading">Find a team worth reading.</h2></div><span className="directory-index-label">A–Z / {companies.length} companies</span></div>
    <div className="directory-tools"><label className="directory-search"><Search size={16} aria-hidden="true" /><input type="search" placeholder="Search companies or topics" aria-label="Search companies or topics" value={query} onChange={event => { setQuery(event.target.value); setVisible(12); }} />{query && <button aria-label="Clear company search" onClick={() => { setQuery(""); setVisible(12); }}><X size={14} /></button>}</label><label className="directory-sort"><span className="sr-only">Sort companies</span><select value={sort} onChange={event => { setSort(event.target.value as Sort); setVisible(12); }}><option value="blogs">Most blogs</option><option value="name">Name, A–Z</option><option value="followers" disabled={!available}>Most followed</option><option value="bookmarks" disabled={!available}>Most bookmarked</option><option value="readLogs" disabled={!available}>Most read logs</option></select><ChevronDown size={13} /></label></div>
    <div className="directory-filter-bar"><div className="directory-tabs" role="group" aria-label="Filter companies"><button className={!followingOnly ? "is-active" : ""} aria-pressed={!followingOnly} onClick={() => { setFollowingOnly(false); setVisible(12); }}>All companies <span>{companies.length}</span></button><button className={followingOnly ? "is-active" : ""} aria-pressed={followingOnly} disabled={!ready} onClick={() => { setFollowingOnly(true); setVisible(12); }}>Following <span>{ready ? companies.filter(company => follows.includes(company.id)).length : "—"}</span></button></div><span className="directory-results" role="status">{matched.length} {matched.length === 1 ? "company" : "companies"}{query ? " found" : ""}</span></div>
    {matched.length ? <><div className="company-directory-list">{matched.slice(0, visible).map(company => <CompanyRow key={company.id} company={company} available={available} following={follows.includes(company.id)} ready={ready} onToggle={() => onToggle(company.id)} />)}</div><div className="directory-list-footer"><span>Showing {Math.min(visible, matched.length)} of {matched.length} companies</span>{visible < matched.length ? <button className="company-load-more" onClick={() => setVisible(count => count + 12)}>More companies <ArrowDown size={13} /></button> : <span className="directory-endnote">A good place to keep exploring.</span>}</div></> : <div className="directory-empty"><Search size={23} strokeWidth={1.3} /><h3>{query ? "No teams on this shelf." : "No companies followed yet."}</h3><p>{query ? `We couldn’t find a company or topic matching “${query.trim()}”. Try another search.` : "Follow a company and you’ll find it here, ready for your next reading session."}</p><button className="company-browse" onClick={reset}>{query ? "Clear filters" : "Explore all companies"}<ArrowRight size={13} /></button></div>}
  </section>;
}
