"use client";

import { useId, useState, useSyncExternalStore } from "react";
import Link from "./PageLink";
import { ArrowRight, BookOpenCheck, Bookmark, Check, ChevronDown, Pencil, SlidersHorizontal, X } from "lucide-react";
import { TOPICS, type Article, type CustomFeed, type Profile, type Source } from "@/lib/types";
import CompanyLogo from "./CompanyLogo";
import FeedPagination from "./FeedPagination";
import { readingSpot } from "@/lib/reading-spot";

type Props = {
  topicOptions?: string[];
  profile: Profile;
  articles: Article[];
  sources: Source[];
  onChange: (patch: Partial<Profile>) => boolean;
  onOpen: (article: Article) => void;
  onBookmark: (article: Article) => boolean | void;
  onReadLog: (article: Article) => void;
  onCustomize: () => void;
  onEditFeed?: (feed: CustomFeed) => void;
  libraryState?: "loading" | "ready" | "error";
  onRetryLibrary?: () => void;
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

export default function ProfileView({ profile, articles, sources, onChange, onOpen, onBookmark, onReadLog, onCustomize, onEditFeed, topicOptions=TOPICS, libraryState = "ready", onRetryLibrary }: Props) {
  const id = useId();
  const tab = useSyncExternalStore(subscribeLibraryTab, getLibraryTab, () => "bookmarks" as const);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(profile.name);
  const [bio, setBio] = useState(profile.bio);
  const [year, setYear] = useState(false);
  const [selectedDate, setSelectedDate] = useState(dateKey(new Date()));
  const [removedBookmark, setRemovedBookmark] = useState<Article | null>(null);
  const [sourceQuery, setSourceQuery] = useState("");
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryOrder, setLibraryOrder] = useState("newest");
  const [librarySelection, setLibrarySelection] = useState({ key: "", page: 1 });
  const libraryKey = `${tab}|${libraryQuery}|${libraryOrder}`;
  const requestedLibraryPage = librarySelection.key === libraryKey ? librarySelection.page : 1;
  const dates = activityDates(year);
  const activity = new Map(profile.activity.map((day) => [day.date, day]));
  const selected = activity.get(selectedDate);
  const articleById = new Map(articles.map((article) => [article.id, article]));
  const allBookmarks = [...profile.bookmarks].reverse().flatMap(id => { const article = articleById.get(id); return article ? [article] : []; });
  const matchesLibrary = (article: Article) => `${article.title} ${article.company} ${article.topics.join(" ")}`.toLowerCase().includes(libraryQuery.trim().toLowerCase());
  const bookmarkMatches = allBookmarks.filter(matchesLibrary);
  if (libraryOrder === "oldest") bookmarkMatches.reverse();
  const unavailableBookmarks = Math.max(0, profile.bookmarks.length - allBookmarks.length);
  const readLogs = profile.readLogs || [];

  const allLoggedArticles = [...readLogs].sort((a, b) => b.readAt.localeCompare(a.readAt)).flatMap((log) => {
    const article = articleById.get(log.articleId);
    return article ? [{ article, readAt: log.readAt }] : [];
  });
  const logMatches = allLoggedArticles.filter(row => matchesLibrary(row.article));
  if (libraryOrder === "oldest") logMatches.reverse();
  const unavailableLogs = Math.max(0, readLogs.length - allLoggedArticles.length);
  const libraryTotal = tab === "bookmarks" ? bookmarkMatches.length : logMatches.length;
  const libraryPage = Math.min(requestedLibraryPage, Math.max(1, Math.ceil(libraryTotal / 20)));
  const bookmarks = bookmarkMatches.slice((libraryPage - 1) * 20, libraryPage * 20);
  const loggedArticles = logMatches.slice((libraryPage - 1) * 20, libraryPage * 20);
  const toggle = (values: string[], value: string) => values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
  const uniqueSources = sources.filter((source, index) => sources.findIndex((item) => item.id === source.id) === index);
  const followedSources = uniqueSources.filter((source) => profile.follows.includes(source.id)).sort((a, b) => a.company.localeCompare(b.company));
  const matchingFollows = followedSources.filter((source) => source.company.toLowerCase().includes(sourceQuery.trim().toLowerCase()));
  const spot = readingSpot(profile);
  const nextRead = spot ? articleById.get(spot.articleId) : undefined;
  const selectedLabel = new Date(`${selectedDate}T12:00:00Z`).toLocaleDateString("en-GB", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });

  return <section className="profile-view" aria-labelledby={`${id}-title`}>
    <header className="profile-heading">
      <div className="profile-identity">
        <div className="profile-identity-copy">
          <p className="eyebrow">Your reading space</p>
          <h1 id={`${id}-title`}>{profile.name || "A curious mind"}</h1>
          <p className="profile-bio">{profile.bio || "A place for the ideas you want to keep."}</p>
        </div>
        <button className="text-button profile-edit" aria-label="Edit your name and bio" aria-expanded={editing} onClick={() => { setName(profile.name); setBio(profile.bio); setEditing(!editing); }}><Pencil size={13} /><span>Edit profile</span></button>
      </div>
      {editing && <form className="profile-edit-form" onSubmit={(event) => { event.preventDefault(); if (onChange({ name: name.trim() || "A curious mind", bio: bio.trim() })) setEditing(false); }}>
        <label>Name<input value={name} onChange={(event) => setName(event.target.value)} maxLength={60} autoFocus required /></label>
        <label>A line about you<input value={bio} onChange={(event) => setBio(event.target.value)} maxLength={160} placeholder="What are you curious about?" /></label>
        <div className="profile-form-actions"><button className="text-button" type="button" onClick={() => setEditing(false)}>Cancel</button><button className="ink-button" type="submit">Save profile</button></div>
      </form>}
    </header>

    <section className="profile-next-read" aria-labelledby={`${id}-next-title`}>
      <div className="section-rule"><h2 id={`${id}-next-title`}>{spot?.kind === "read" ? "Last read" : spot?.kind === "opened" ? "Continue reading" : spot ? "Up next" : "Your reading"}</h2><i /><span>{spot?.kind === "saved" ? "From your bookmarks" : spot?.at ? `${spot.kind === "read" ? "Logged" : "Opened"} ${loggedDate(spot.at)}` : "Pick up where you left off"}</span></div>
      {nextRead ? <article className="tray next-read-tray">
        <div className="sheet next-read-sheet">
          <p className="library-publisher"><CompanyLogo companyId={nextRead.company_id} company={nextRead.company} size={16} decorative />{nextRead.company}</p>
          <h3><a href={`/articles/${encodeURIComponent(nextRead.id)}`} onClick={(event) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); onOpen(nextRead); } }}>{nextRead.title}</a></h3>
          {nextRead.summary && <p className="next-read-summary">{nextRead.summary}</p>}
          <div className="next-read-actions"><Link className="ink-button" href={`/articles/${encodeURIComponent(nextRead.id)}`}>{spot?.kind === "read" ? "Read again" : spot?.kind === "opened" ? "Continue reading" : "Read story"}<ArrowRight size={13} /></Link><Link className="text-button" href="/">Explore your feed</Link></div>
        </div>
      </article> : spot && libraryState === "loading" ? <p className="next-read-empty" role="status">Loading your last story…</p>
        : spot && libraryState === "error" ? <div className="next-read-empty" role="alert"><h3>Your last story couldn’t load.</h3><p>Your reading history is still saved.</p><button className="text-button" onClick={onRetryLibrary}>Try again</button></div>
        : spot ? <div className="next-read-empty"><h3>This story is currently unavailable.</h3><p>Your saved reading history hasn’t been changed.</p><button className="text-button" onClick={onRetryLibrary}>Check again</button></div>
        : <div className="next-read-empty"><h3>Your reading starts here.</h3><p>Open a story or log a read. You can pick it up here next time.</p><Link className="text-button" href="/">Explore your feed<ArrowRight size={13} /></Link></div>}
    </section>

    <section className="profile-tray" aria-label="Your library and preferences"><div className="profile-panel library-section">
      <div className="library-tabs" role="tablist" aria-label="Your library">{libraryTabs.map((key) => <button key={key} id={`${id}-${key}-tab`} role="tab" type="button" aria-selected={tab === key} aria-controls={`${id}-${key}-panel`} tabIndex={tab === key ? 0 : -1} className={tab === key ? "is-active" : ""} onClick={() => setLibraryTab(key)} onKeyDown={(event) => {
        const index = libraryTabs.indexOf(key);
        const next = event.key === "ArrowRight" ? libraryTabs[(index + 1) % libraryTabs.length] : event.key === "ArrowLeft" ? libraryTabs[(index + libraryTabs.length - 1) % libraryTabs.length] : event.key === "Home" ? libraryTabs[0] : event.key === "End" ? libraryTabs[libraryTabs.length - 1] : null;
        if (next) { event.preventDefault(); setLibraryTab(next); document.getElementById(`${id}-${next}-tab`)?.focus(); }
      }}>{key === "bookmarks" ? "Bookmarks" : key === "read-log" ? "Read log" : key === "following" ? "Following" : "Interests"}<span>{key === "bookmarks" ? profile.bookmarks.length : key === "read-log" ? readLogs.length : key === "following" ? profile.follows.length : profile.interests.length}</span></button>)}</div>
      <div role="tabpanel" id={`${id}-${tab}-panel`} aria-labelledby={`${id}-${tab}-tab`} className="library-panel" tabIndex={0}>
        {(tab === "bookmarks" || tab === "read-log") && <>
          <div className="library-controls"><label><span className="sr-only">Search your library</span><input type="search" placeholder="Find a saved story, company, or topic" value={libraryQuery} onChange={event => setLibraryQuery(event.target.value)} maxLength={200} /></label><label><span className="sr-only">Library order</span><select value={libraryOrder} onChange={event => setLibraryOrder(event.target.value)}><option value="newest">Newest first</option><option value="oldest">Oldest first</option></select></label></div>
          {libraryState === "loading" && <p className="library-note" role="status">Loading your saved stories…</p>}
          {libraryState === "error" && <p className="library-note" role="alert">Some saved stories could not be loaded. Your saved list is safe. <button className="text-button" onClick={onRetryLibrary}>Try again</button></p>}
          {libraryQuery && !libraryTotal && libraryState !== "loading" && <p className="library-note" role="status">No saved stories match “{libraryQuery}”. <button className="text-button" onClick={() => setLibraryQuery("")}>Clear search</button></p>}
        </>}
        {tab === "bookmarks" && <>
          {!profile.bookmarks.length && <div className="library-empty"><Bookmark size={24} strokeWidth={1.2} /><h3>Keep something worth returning to.</h3><p>Save an article from your feed. It will be waiting here.</p></div>}
          {removedBookmark && <p className="library-note" role="status">Bookmark removed. <button className="text-button" onClick={() => { if (!profile.bookmarks.includes(removedBookmark.id)) onBookmark(removedBookmark); setRemovedBookmark(null); }}>Undo</button></p>}
          {bookmarks.map((article) => <article className="library-article" key={article.id}><div><p className="library-publisher"><CompanyLogo companyId={article.company_id} company={article.company} size={14} decorative />{article.company}</p><a className="library-article-title" href={`/articles/${encodeURIComponent(article.id)}`} onClick={(event) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); onOpen(article); } }}>{article.title}</a></div><button className="icon-button library-remove" onClick={() => { if (onBookmark(article) !== false) setRemovedBookmark(article); }} aria-label={`Remove ${article.title} from bookmarks`} title="Remove bookmark"><X size={16} /></button></article>)}
          {unavailableBookmarks > 0 && libraryState === "ready" && <p className="library-note">{unavailableBookmarks} saved {unavailableBookmarks === 1 ? "story is" : "stories are"} no longer available in the archive. <button className="text-button" onClick={onRetryLibrary}>Check again</button> <button className="text-button" onClick={() => onChange({ bookmarks: profile.bookmarks.filter(id => articleById.has(id)) })}>Remove unavailable bookmarks</button></p>}
        </>}
        {tab === "read-log" && <>
          {!readLogs.length && <div className="library-empty"><BookOpenCheck size={24} strokeWidth={1.2} /><h3>Your reading, remembered.</h3><p>Mark an article as read from its page to keep it here.</p></div>}
          {loggedArticles.map(({ article, readAt }) => <article className="library-article read-log-article" key={article.id}><div><p className="library-publisher"><CompanyLogo companyId={article.company_id} company={article.company} size={14} decorative />{article.company}</p><a className="library-article-title" href={`/articles/${encodeURIComponent(article.id)}`} onClick={(event) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey && event.button === 0) { event.preventDefault(); onOpen(article); } }}>{article.title}</a><p className="read-log-date">Logged <time dateTime={readAt}>{loggedDate(readAt)}</time></p></div><button className="read-log-undo" onClick={() => onReadLog(article)} aria-label={`Remove read log for ${article.title}`}>Undo</button></article>)}
          {unavailableLogs > 0 && libraryState === "ready" && <p className="library-note">{unavailableLogs} logged {unavailableLogs === 1 ? "story is" : "stories are"} no longer available in the archive. <button className="text-button" onClick={onRetryLibrary}>Check again</button> <button className="text-button" onClick={() => onChange({ readLogs: profile.readLogs.filter(log => articleById.has(log.articleId)) })}>Remove unavailable read logs</button></p>}
        </>}
        {(tab === "bookmarks" || tab === "read-log") && libraryTotal > 20 && <FeedPagination current={libraryPage} total={Math.ceil(libraryTotal / 20)} loading={false} onChange={page => setLibrarySelection({ key: libraryKey, page })} />}
        {tab === "following" && <><p className="section-description">The teams in your Following feed. <a className="profile-browse-link" href="/companies">Browse companies</a> to find more.</p>{followedSources.length > 0 && <label className="profile-source-search"><span className="sr-only">Search followed companies</span><input type="search" placeholder="Search followed companies…" value={sourceQuery} onChange={(event) => setSourceQuery(event.target.value)} /></label>}<div className="profile-source-list">{matchingFollows.map((source) => <button key={source.id} className="profile-source" aria-pressed={true} aria-label={`Unfollow ${source.company}`} title={`Unfollow ${source.company}`} onClick={() => onChange({ follows: toggle(profile.follows, source.id) })}><span className="publisher-label"><CompanyLogo companyId={source.id} company={source.company} size={16} decorative />{source.company}</span><span className="profile-source-action"><Check size={13} aria-hidden="true" /> Following</span></button>)}</div>{!followedSources.length ? <p className="library-note">No companies followed yet. Follow a team to find it here.</p> : !matchingFollows.length && <p className="library-note">No followed companies match “{sourceQuery}”.</p>}</>}
        {tab === "interests" && <><p className="section-description">A starting point for your recommendations. Change these whenever your curiosity moves.</p><div className="profile-interest-list">{topicOptions.map((topic) => <button key={topic} aria-pressed={profile.interests.includes(topic)} className={`profile-interest${profile.interests.includes(topic) ? " is-selected" : ""}`} onClick={() => onChange({ interests: toggle(profile.interests, topic) })}>{topic}{profile.interests.includes(topic) && <Check size={14} aria-hidden="true" />}</button>)}</div></>}
      </div>
    </div></section>

    <section className="profile-tray activity-tray" aria-labelledby={`${id}-activity`}><div className="profile-panel activity-section">
      <div className="section-heading"><h2 id={`${id}-activity`}>A habit of curiosity</h2><button className="text-button activity-range" onClick={() => setYear(!year)}>{year ? "Last 12 weeks" : "View year"}<ChevronDown size={13} aria-hidden="true" /></button></div>
      <p className="section-description">Every dot, a day in UTC. Use arrow keys to explore the calendar.</p>
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
            return <button key={key} data-date={key} tabIndex={!future && (dates.some(row => row.key === selectedDate) ? selectedDate === key : key === dateKey(new Date())) ? 0 : -1} onKeyDown={event => {
              const index = dates.findIndex(row => row.key === key);
              const last = dates.findLastIndex(row => !row.future);
              const next = event.key === "ArrowRight" ? index + 7 : event.key === "ArrowLeft" ? index - 7 : event.key === "ArrowDown" ? index + 1 : event.key === "ArrowUp" ? index - 1 : event.key === "Home" ? 0 : event.key === "End" ? last : null;
              if (next !== null) { event.preventDefault(); const day = dates[Math.max(0, Math.min(last, next))]; setSelectedDate(day.key); (event.currentTarget.parentElement?.querySelector(`[data-date="${day.key}"]`) as HTMLButtonElement | null)?.focus(); }
            }} type="button" className={`activity-dot activity-level-${level}${future ? " activity-future" : ""}${selectedDate === key ? " activity-selected" : ""}`} disabled={future} title={label} aria-label={label} aria-pressed={selectedDate === key} onFocus={() => setSelectedDate(key)} onMouseEnter={() => setSelectedDate(key)} onClick={() => setSelectedDate(key)} />;
          })}
        </div>
      </div>
      <div className="activity-footer"><p className="activity-detail" aria-live="polite">{selectedLabel} UTC <span>· {selected?.reads || 0} logged · {selected?.opens || 0} opened · {selected?.saves || 0} saved</span></p><div className="activity-legend" aria-label="Darker ink means more activity"><span>Less</span>{[0, 1, 2, 3].map((level) => <i key={level} className={`activity-dot activity-level-${level}`} aria-hidden="true" />)}<span>More</span></div></div>
    </div></section>

    <section className="profile-tray"><div className="profile-panel profile-feeds"><div className="section-heading"><div><h2>Your own editions</h2><p className="section-description">{profile.customFeeds.length ? `${profile.customFeeds.length} custom ${profile.customFeeds.length === 1 ? "feed" : "feeds"}, shaped around you.` : "Give a particular curiosity a feed of its own."}</p></div><button className="text-button" onClick={onCustomize}><SlidersHorizontal size={14} /> Create a feed</button></div>{profile.customFeeds.map((feed) => <div className="profile-feed" key={feed.id}><a href={`/?feed=${encodeURIComponent(feed.id)}`}>{feed.name}<ArrowRight size={13} /></a><small>{feed.companies.length ? `${feed.companies.length} companies` : "All companies"} · {feed.topics.length ? feed.topics.join(", ") : "All topics"}</small>{onEditFeed && <button className="icon-button" onClick={() => onEditFeed(feed)} aria-label={`Edit ${feed.name}`}><Pencil size={14} /></button>}</div>)}</div></section>
    <p className="profile-storage-note"><Link href="/settings">Reading data &amp; privacy</Link></p>
  </section>;
}
