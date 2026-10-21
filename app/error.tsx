"use client";
import Link from "@/components/PageLink";
export default function ReadingError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <main className="reading-main settings-main"><section className="settings-card" role="alert"><p className="eyebrow">Reading interrupted</p><h1>This page could not be loaded.</h1><p>Your saved reading data has not been cleared. Try again or return to the feed.</p><div className="sync-actions"><button className="ink-button" onClick={reset}>Try again</button><Link className="text-button" href="/">Back to reading</Link></div></section></main>;
}
