"use client";

import type { MouseEvent } from "react";
import Link from "./PageLink";
import BrandLogo from "./BrandLogo";
import { useAuth } from "@/components/AuthProvider";
import { signInPath } from "@/lib/auth-path";
import AccountControl from "./AccountControl";
import ThemeToggle from "./ThemeToggle";

type ReaderView = "home" | "trending" | "profile";
type SiteView = ReaderView | "companies";

const links = [
  { id: "home", label: "Feed", href: "/" },
  { id: "trending", label: "Trending", href: "/trending" },
  { id: "companies", label: "Companies", href: "/companies" },
  { id: "profile", label: "Profile", href: "/profile" },
] as const;

export default function SiteHeader({ active, onNavigate }: { active: SiteView; onNavigate?: (next: ReaderView) => void }) {
  const { isSignedIn } = useAuth();
  const navigate = (event: MouseEvent<HTMLAnchorElement>, next: ReaderView) => {
    if (!onNavigate || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(next);
  };

  return <header className="site-header">
    <Link className="wordmark" href="/" aria-label="Readwell home" onClick={(event) => navigate(event, "home")}><BrandLogo />Readwell</Link>
    <nav className="main-nav" aria-label="Main navigation">
      {links.map(({ id, label, href }) => {
        const account = id === "profile";
        const selected = active === id && (!account || isSignedIn);
        if (account && isSignedIn) return <AccountControl key={id} active={!!selected}
          onProfileNavigate={onNavigate ? event => navigate(event, "profile") : undefined} />;
        return <Link key={id} href={account && !isSignedIn ? signInPath("/profile") : href}
          className={"nav-item" + (selected ? " is-active" : "")} aria-current={selected ? "page" : undefined}
          onClick={id === "companies" || (account && !isSignedIn) ? undefined : event => navigate(event, id)}>
          {account ? isSignedIn ? "Profile" : "Sign in" : label}
        </Link>;
      })}
    </nav>
    <ThemeToggle />
  </header>;
}
