"use client";

import type { MouseEvent } from "react";
import Link from "next/link";

type ReaderView = "home" | "trending" | "profile";
type SiteView = ReaderView | "companies";

const links = [
  { id: "home", label: "Feed", href: "/" },
  { id: "trending", label: "Trending", href: "/trending" },
  { id: "companies", label: "Companies", href: "/companies" },
  { id: "profile", label: "Profile", href: "/profile" },
] as const;

export default function SiteHeader({ active, onNavigate }: { active: SiteView; onNavigate?: (next: ReaderView) => void }) {
  const navigate = (event: MouseEvent<HTMLAnchorElement>, next: ReaderView) => {
    if (!onNavigate || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(next);
  };

  return <header className="site-header">
    <Link className="wordmark" href="/" onClick={(event) => navigate(event, "home")}><span className="brand-mark" aria-hidden="true">⁄</span>readzz</Link>
    <nav className="main-nav" aria-label="Main navigation">
      {links.map(({ id, label, href }) => <Link key={id} href={href} className={`nav-item${active === id ? " is-active" : ""}`} aria-current={active === id ? "page" : undefined} onClick={id === "companies" ? undefined : (event) => navigate(event, id)}>{label}</Link>)}
    </nav>
  </header>;
}
