"use client";

import { useId, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import { BookOpenCheck, Bookmark, Check, ChevronDown, Pencil, Plus, SlidersHorizontal, X } from "lucide-react";
import { TOPICS, type Article, type CustomFeed, type Profile, type Source } from "@/lib/types";

type Props = {
  profile: Profile;
  articles: Article[];
  sources: Source[];
  onChange: (patch: Partial<Profile>) => void;
  onOpen: (article: Article) => void;
  onBookmark: (article: Article) => void;
  onReadLog: (article: Article) => void;
  onCustomize: () => void;
  onEditFeed?: (feed: CustomFeed) => void;
  storageLabel: string;
};

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

const libraryTabs = ["bookmarks", "read-log", "following", "interests"] as const;
type LibraryTab = typeof libraryTabs[number];

function getLibraryTab(): LibraryTab {
  const requested = new URLSearchParams(window.location.search).get("tab");
  return libraryTabs.find((tab) => tab === requested) || "bookmarks";
}

function subscribeLibraryTab(callback: () => void) {
  window.addEventListener("popstate", callback);
  window.addEventListener("longreads-library-tab-change", callback);
  return () => {
    window.removeEventListener("popstate", callback);
    window.removeEventListener("longreads-library-tab-change", callback);
  };
}

function setLibraryTab(tab: LibraryTab) {
  const url = new URL(window.location.href);
  if (tab === "bookmarks") url.searchParams.delete("tab");
  else url.searchParams.set("tab", tab);
  window.history.replaceState(window.history.state, "", url);
  window.dispatchEvent(new Event("longreads-library-tab-change"));
}

function activityCount(day: Profile["activity"][number] | undefined) {
  return (day?.opens || 0) + (day?.saves || 0) + (day?.reads || 0);
}

function loggedDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Date unavailable" : date.toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
}

function activityDates(year: boolean) {
  const today = new Date();
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const weeks = year ? 53 : 12;
  start.setUTCDate(start.getUTCDate() - ((weeks - 1) * 7 + today.getUTCDay()));
  return Array.from({ length: weeks * 7 }, (_, index) => {
    const date = new Date(start);
    date.setUTCDate(start.getUTCDate() + index);
    return { key: dateKey(date), future: date > today, date };
  });
}

type DigestCadence = "daily" | "weekly";
let digestFallback: DigestCadence | null = null;
const digestPreferenceKey = "longreads-digest-cadence";
function getDigestCadence(): DigestCadence {
  if (digestFallback) return digestFallback;
  try { return localStorage.getItem(digestPreferenceKey) === "weekly" ? "weekly" : "daily"; } catch { return "daily"; }
}
function subscribeDigestCadence(callback: () => void) {
  const onStorage = (event: StorageEvent) => { if (event.key === digestPreferenceKey || event.key === null) { digestFallback = null; callback(); } };
  window.addEventListener("storage", onStorage);
  window.addEventListener("longreads-digest-change", callback);
  return () => { window.removeEventListener("storage", onStorage); window.removeEventListener("longreads-digest-change", callback); };
}
function setDigestCadence(cadence: DigestCadence) {
  try { localStorage.setItem(digestPreferenceKey, cadence); digestFallback = null; } catch { digestFallback = cadence; }
  window.dispatchEvent(new Event("longreads-digest-change"));
}

export default function ProfileView({ profile, articles, sources, onChange, onOpen, onBookmark, onReadLog, onCustomize, onEditFeed, storageLabel }: Props) {
  const id = useId();
  const tab = useSyncExternalStore(subscribeLibraryTab, getLibraryTab, () => "bookmarks" as const);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [bio, setBio] = useState(profile.bio);
  const [year, setYear] = useState(false);
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [sourceQuery, setSourceQuery] = useState("");
  const [showAllCompanies, setShowAllCompanies] = useState(false);
  const digest = useSyncExternalStore(subscribeDigestCadence, getDigestCadence, () => "daily" as const);
  const dates = activityDates(year);
  const activity = new Map(profile.activity.map((day) => [day.date, day]));
  const selected = activity.get(selectedDate);
  const bookmarks = articles.filter((article) => profile.bookmarks.includes(article.id));
  const unavailableBookmarks = Math.max(0, profile.bookmarks.length - bookmarks.length);
  const readLogs = profile.readLogs || [];
  const articleById = new Map(articles.map((article) => [article.id, article]));
  const loggedArticles = [...readLogs].sort((a, b) => b.readAt.localeCompare(a.readAt)).flatMap((log) => {
    const article = articleById.get(log.articleId);
    return article ? [{ article, readAt: log.readAt }] : [];
  });
  const unavailableLogs = Math.max(0, readLogs.length - loggedArticles.length);
  const toggle = (values: string[], value: string) => values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  const uniqueSources = sources.filter((source, index) => sources.findIndex((item) => item.id === source.id) === index);
  const companyOrder = ["Stripe", "Netflix", "Cloudflare", "Discord", "GitHub", "Spotify", "Shopify", "Airbnb", "Uber"];
  const orderedSources = [...uniqueSources].sort((a, b) => {
    const aIndex = companyOrder.indexOf(a.company);
    const bIndex = companyOrder.indexOf(b.company);
    return (aIndex < 0 ? 100 : aIndex) - (bIndex < 0 ? 100 : bIndex) || a.company.localeCompare(b.company);
  });
  const visibleCompanies = showAllCompanies ? orderedSources : orderedSources.slice(0, 10);
  const companyLogos = new Set(["stripe", "netflix", "cloudflare", "discord", "github", "spotify", "shopify", "airbnb", "uber"]);
  const selectedLabel = new Date(`${selectedDate}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

  return <section className="profile-view" aria-labelledby={`${id}-title`}>
    <header className="profile-heading">
      <div className="profile-identity">
        <div className="profile-monogram" aria-hidden="true">{(profile.name || "Reader").trim().slice(0, 1).toUpperCase()}</div>
        <div className="profile-identity-copy">
          <h1 id={`${id}-title`}>{profile.name || "A curious mind"}</h1>
          <p>{profile.bio ? <>{profile.bio}<span className="profile-meta-separator"> · </span></> : null}{profile.bookmarks.length} saved</p>
        </div>
        <button className="icon-button profile-edit" aria-label="Edit your name and bio" onClick={() => { setName(profile.name); setBio(profile.bio); setEditing(!editing); }}><Pencil size={16} /></button>
      </div>
      {editing && <form className="profile-edit-form" onSubmit={(event) => { event.preventDefault(); onChange({ name: name.trim() || "A curious mind", bio: bio.trim() }); setEditing(false); }}>
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoFocus required /></label>
        <label>A line about you<input value={bio} onChange={(event) => setBio(event.target.value)} maxLength={160} placeholder="What are you curious about?" /></label>
        <div className="profile-form-actions"><button className="text-button" type="button" onClick={() => setEditing(false)}>Cancel</button><button className="ink-button" type="submit">Save profile</button></div>
      </form>}
    </header>

    <section className="profile-tray companies-tray" aria-labelledby={`${id}-companies-title`}>
      <div className="profile-panel">
        <h2 id={`${id}-companies-title`}>Companies you follow</h2>
        <div className="company-follow-grid">{visibleCompanies.map((source) => {
          const following = profile.follows.includes(source.id);
          const logo = source.company.toLowerCase();
          return <button key={source.id} type="button" className={`company-follow-button${following ? " is-following" : ""}`} aria-pressed={following} onClick={() => onChange({ follows: toggle(profile.follows, source.id) })}>
            {companyLogos.has(logo) ? <Image src={`/reference/logos/${logo}.svg`} width={14} height={14} alt="" unoptimized /> : <span className="company-follow-initial" aria-hidden="true">{source.company[0]}</span>}
            <span>{source.company}</span>{following ? <Check size={12} aria-hidden="true" /> : <Plus size={12} aria-hidden="true" />}
          </button>;
        })}</div>
      </div>
      <footer className="profile-tray-footer"><span>{profile.follows.length} followed</span>{uniqueSources.length > 10 && <button type="button" aria-expanded={showAllCompanies} onClick={() => setShowAllCompanies(!showAllCompanies)}>{showAllCompanies ? "Show less" : `All ${uniqueSources.length} companies`}<ChevronDown size={11} className={showAllCompanies ? "is-expanded" : ""} /></button>}</footer>
    </section>

    <section className="profile-tray digest-tray" aria-labelledby={`${id}-digest-title`}>
      <div className="profile-panel digest-panel"><h2 id={`${id}-digest-title`}>Digest</h2><div className="digest-segmented" role="group" aria-label="Preferred digest cadence, saved in this browser">{(["daily", "weekly"] as const).map((cadence) => <button key={cadence} type="button" aria-pressed={digest === cadence} className={digest === cadence ? "is-selected" : ""} onClick={() => setDigestCadence(cadence)}>{cadence === "daily" ? "Daily" : "Weekly"}</button>)}</div></div>
    </section>

    <section className="profile-tray activity-tray" aria-labelledby={`${id}-activity`}><div className="profile-panel activity-section">
      <div className="section-heading"><h2 id={`${id}-activity`}>A habit of curiosity</h2><button className="text-button activity-range" onClick={() => setYear(!year)}>{year ? "Last 12 weeks" : "View year"}<ChevronDown size={13} aria-hidden="true" /></button></div>
      <p className="section-description">Every dot, a day. Log a read, open an article, or save something for later.</p>
      <dl className="profile-stats">
        <div><dt>Logged reads</dt><dd>{readLogs.length}</dd></div>
        <div><dt>Articles opened</dt><dd>{profile.activity.reduce((sum, day) => sum + day.opens, 0)}</dd></div>
        <div><dt>Saved for later</dt><dd>{profile.bookmarks.length}</dd></div>
        <div><dt>Active days</dt><dd>{profile.activity.filter((day) => activityCount(day) > 0).length}</dd></div>
      </dl>
      <div className={`activity-calendar-wrap${year ? " activity-calendar-year" : ""}`} tabIndex={year ? 0 : undefined} aria-label={year ? "Full year activity calendar. Scroll horizontally to explore." : undefined}>
        <div className="activity-calendar" style={{ gridTemplateColumns: `repeat(${year ? 53 : 12}, minmax(8px, 1fr))` }}>
          {dates.map(({ key, future, date }) => {
            const day = activity.get(key);
            const count = activityCount(day);
            const level = !count ? 0 : count < 3 ? 1 : count < 6 ? 2 : 3;
            const label = `${date.toLocaleDateString("en-GB", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })} UTC: ${day?.reads || 0} reads logged, ${day?.opens || 0} articles opened, ${day?.saves || 0} saved`;
            return <button key={key} type="button" className={`activity-dot activity-level-${level}${future ? " activity-future" : ""}${selectedDate === key ? " activity-selected" : ""}`} disabled={future} title={label} aria-label={label} aria-pressed={selectedDate === key} onFocus={() => setSelectedDate(key)} onMouseEnter={() => setSelectedDate(key)} onClick={() => setSelectedDate(key)} />;
          })}
        </div>
      </div>
      <div className="activity-footer"><p className="activity-detail" aria-live="polite">{selectedLabel} UTC <span>· {selected?.reads || 0} logged · {selected?.opens || 0} opened · {selected?.saves || 0} saved</span></p><div className="activity-legend" aria-label="Darker ink means more activity"><span>Less</span>{[0, 1, 2, 3].map((level) => <i key={level} className={`activity-dot activity-level-${level}`} aria-hidden="true" />)}<span>More</span></div></div>
    </div></section>

    <section className="profile-tray" aria-label="Your library and preferences"><div className="profile-panel library-section">
      <div className="library-tabs" role="tablist" aria-label="Your library">{libraryTabs.map((key) => <button key={key} id={`${id}-${key}-tab`} role="tab" type="button" aria-selected={tab === key} aria-controls={`${id}-${key}-panel`} tabIndex={tab === key ? 0 : -1} className={tab === key ? "is-active" : ""} onClick={() => setLibraryTab(key)} onKeyDown={(event) => {
        const index = libraryTabs.indexOf(key);
        const next = event.key === "ArrowRight" ? libraryTabs[(index + 1) % libraryTabs.length] : event.key === "ArrowLeft" ? libraryTabs[(index + libraryTabs.length - 1) % libraryTabs.length] : event.key === "Home" ? libraryTabs[0] : event.key === "End" ? libraryTabs[libraryTabs.length - 1] : null;
        if (next) { event.preventDefault(); setLibraryTab(next); document.getElementById(`${id}-${next}-tab`)?.focus(); }
      }}>{key === "bookmarks" ? "Bookmarks" : key === "read-log" ? "Read log" : key === "following" ? "Following" : "Interests"}<span>{key === "bookmarks" ? profile.bookmarks.length : key === "read-log" ? readLogs.length : key === "following" ? profile.follows.length : profile.interests.length}</span></button>)}</div>
      <div role="tabpanel" id={`${id}-${tab}-panel`} aria-labelledby={`${id}-${tab}-tab`} className="library-panel" tabIndex={0}>
        {tab === "bookmarks" && <>
          {!profile.bookmarks.length && <div className="library-empty"><Bookmark size={24} strokeWidth={1.2} /><h3>Keep something worth returning to.</h3><p>Save an article from your feed. It will be waiting here.</p></div>}
          {bookmarks.map((article) => <article className="library-article" key={article.id}><div><p className="article-byline">{article.company}</p><a className="library-article-title" href={`/articles/${encodeURIComponent(article.id)}`} onClick={(event) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); onOpen(article); } }}>{article.title}</a></div><button className="icon-button" onClick={() => onBookmark(article)} aria-label={`Remove ${article.title} from bookmarks`} title="Remove bookmark"><X size={16} /></button></article>)}
          {unavailableBookmarks > 0 && <p className="library-note">{unavailableBookmarks} saved {unavailableBookmarks === 1 ? "article is" : "articles are"} outside the currently loaded collection.</p>}
        </>}
        {tab === "read-log" && <>
          {!readLogs.length && <div className="library-empty"><BookOpenCheck size={24} strokeWidth={1.2} /><h3>Your reading, remembered.</h3><p>Mark an article as read from its page to keep it here.</p></div>}
          {loggedArticles.map(({ article, readAt }) => <article className="library-article read-log-article" key={article.id}><div><p className="article-byline">{article.company}</p><a className="library-article-title" href={`/articles/${encodeURIComponent(article.id)}`} onClick={(event) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); onOpen(article); } }}>{article.title}</a><p className="read-log-date">Logged <time dateTime={readAt}>{loggedDate(readAt)}</time></p></div><button className="read-log-undo" onClick={() => onReadLog(article)} aria-label={`Remove read log for ${article.title}`}>Undo</button></article>)}
          {unavailableLogs > 0 && <p className="library-note">{unavailableLogs} logged {unavailableLogs === 1 ? "article is" : "articles are"} outside the currently loaded collection.</p>}
        </>}
        {tab === "following" && <><p className="section-description">Choose the teams you want to hear from. These shape your Following feed.</p><label className="profile-source-search"><span className="sr-only">Find a company</span><input type="search" placeholder="Find a company…" value={sourceQuery} onChange={(event) => setSourceQuery(event.target.value)} /></label><div className="profile-source-list">{uniqueSources.filter((source) => source.company.toLowerCase().includes(sourceQuery.toLowerCase())).map((source) => <button key={source.id} className="profile-source" aria-pressed={profile.follows.includes(source.id)} onClick={() => onChange({ follows: toggle(profile.follows, source.id) })}><span>{source.company}</span><span className="profile-source-action">{profile.follows.includes(source.id) ? <><Check size={13} /> Following</> : "Follow"}</span></button>)}</div>{!uniqueSources.some((source) => source.company.toLowerCase().includes(sourceQuery.toLowerCase())) && <p className="library-note">No companies match “{sourceQuery}”.</p>}</>}
        {tab === "interests" && <><p className="section-description">A starting point for your recommendations. Change these whenever your curiosity moves.</p><div className="profile-interest-list">{TOPICS.map((topic) => <button key={topic} aria-pressed={profile.interests.includes(topic)} className={`profile-interest${profile.interests.includes(topic) ? " is-selected" : ""}`} onClick={() => onChange({ interests: toggle(profile.interests, topic) })}>{topic}{profile.interests.includes(topic) && <Check size={14} aria-hidden="true" />}</button>)}</div></>}
      </div>
    </div></section>

    <section className="profile-tray"><div className="profile-panel profile-feeds"><div className="section-heading"><div><h2>Your own editions</h2><p className="section-description">{profile.customFeeds.length ? `${profile.customFeeds.length} custom ${profile.customFeeds.length === 1 ? "feed" : "feeds"}, shaped around you.` : "Give a particular curiosity a feed of its own."}</p></div><button className="text-button" onClick={onCustomize}><SlidersHorizontal size={14} /> Create a feed</button></div>{profile.customFeeds.map((feed) => <div className="profile-feed" key={feed.id}><span>{feed.name}</span><small>{feed.companies.length ? `${feed.companies.length} companies` : "All companies"} · {feed.topics.length ? feed.topics.join(", ") : "All topics"}</small>{onEditFeed && <button className="icon-button" onClick={() => onEditFeed(feed)} aria-label={`Edit ${feed.name}`}><Pencil size={14} /></button>}</div>)}</div></section>
    <p className="profile-storage-note">{storageLabel} · Read logs are marked by you. Opening an article does not mark it as read.</p>
  </section>;
}
