import { ArrowRight, ArrowUpRight } from "lucide-react";
import type { CompanySummary } from "@/lib/company-types";
import { companyDescription, companyHref } from "@/lib/company-editorial";
import CompanyLogo from "../CompanyLogo";
import CompanyFollowButton from "./CompanyFollowButton";
import CompanyMetrics from "./CompanyMetrics";

export default function CompanySpotlight({ company, available, following, ready, onToggle }: {
  company: CompanySummary; available: boolean; following: boolean; ready: boolean; onToggle: () => void;
}) {
  return <article className="company-spotlight">
    <div className="spotlight-body">
      <p className="directory-eyebrow"><span className="pine-dot" /> A place to start</p>
      <div className="spotlight-identity"><span className="publisher-stamp"><CompanyLogo companyId={company.id} company={company.name} size={29} decorative /></span><div><h2><a href={companyHref(company.id)}>{company.name}</a></h2></div><CompanyFollowButton name={company.name} ready={ready} following={following} onToggle={onToggle} /></div>
      <p className="spotlight-description">{companyDescription(company)}</p>
      <CompanyMetrics company={company} available={available} />
    </div>
    <div className="spotlight-story">{company.latestArticle ? <><span className="directory-eyebrow">Latest in the archive</span><a className="spotlight-story-title" href={`/articles/${encodeURIComponent(company.latestArticle.id)}`}>{company.latestArticle.title}<ArrowUpRight size={17} /></a></> : <p>New blogs will appear here as they join the archive.</p>}<a className="company-browse" href={companyHref(company.id)}>Browse {company.name} blogs <ArrowRight size={13} /></a></div>
  </article>;
}
