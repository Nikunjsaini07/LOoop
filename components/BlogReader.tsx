"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { ArrowDown, ArrowRight, ArrowUpRight, Bookmark, Check, ChevronDown, LoaderCircle, Plus, Search, SlidersHorizontal } from "lucide-react";
import ProfileView from "./ProfileView";
import FeedDialog from "./FeedDialog";
import { TOPICS, type Article, type ArticlePage, type CustomFeed } from "@/lib/types";
import { useReadingProfile } from "@/lib/useReadingProfile";
import { HOME_TOPICS } from "@/lib/topics";

type View = "home" | "trending" | "profile";
const articleLabel = (article: Article) => `${article.published_at ? "" : "Collected "}${new Date(article.published_at || article.discovered_at).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
const mergeArticles = (first: Article[], next: Article[]) => [...new Map([...first, ...next].map((article) => [article.id, article])).values()];
const companyLogos = ["stripe", "netflix", "cloudflare", "discord", "figma", "github", "spotify", "shopify", "airbnb", "uber"];

const domain = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Original publisher"; } };

function StoryCard({ article, rank, saved, ready, onSave, onTopic }: { article: Article; rank?: number; saved: boolean; ready: boolean; onSave: () => void; onTopic: (value: string) => void }) {
  const logo = article.company.toLowerCase();
  return <article className="article-card tray">
    <div className="article-sheet sheet">
      <div className="article-topline">
        {rank !== undefined && <span className="article-rank">{rank}</span>}
        <span className="company-icon">{companyLogos.includes(logo) ? <Image src={`/reference/logos/${logo}.svg`} alt={article.company} width={18} height={18} unoptimized /> : <span aria-label={article.company}>{article.company.charAt(0)}</span>}</span>
        <div className="article-byline"><span>{domain(article.url)}</span><time dateTime={article.published_at || article.discovered_at}>{articleLabel(article)}</time></div>
        <button className={`bookmark-button${saved ? " is-saved" : ""}`} disabled={!ready} aria-pressed={saved} aria-label={`${saved ? "Remove bookmark for" : "Bookmark"} ${article.title}`} onClick={onSave}><Bookmark size={16} strokeWidth={1.5} fill={saved ? "currentColor" : "none"} /></button>
      </div>
      <h2><a href={`/articles/${encodeURIComponent(article.id)}`}>{article.title}</a></h2>
      {article.summary && <p className="article-abstract">{article.summary.length > 240 ? `${article.summary.slice(0, 237).replace(/\s+\S*$/, "")}…` : article.summary}</p>}
      {article.recommendationReason && rank === undefined && <p className="story-reason">{article.recommendationReason}</p>}
      {rank !== undefined && article.engagement && article.engagement.reads + article.engagement.saves > 0 && <p className="story-reason">{article.engagement.reads} read logs · {article.engagement.saves} saves</p>}
    </div>
    <div className="article-footer"><div className="article-topics">{article.topics.slice(0, 2).map((value) => <button className="article-topic" key={value} onClick={() => onTopic(value)}>{value}</button>)}</div><a className="original-link" href={`/articles/${encodeURIComponent(article.id)}`}>Read <ArrowRight size={13} /></a></div>
  </article>;
}

export default function BlogReader({ initial, initialView = "home" }: { initial: ArticlePage; initialView?: View }) {
  const { profile, ready, profileOwner, storageLabel, syncStatus, updateProfile, toggleBookmark, toggleReadLog } = useReadingProfile();
  const [view, setView] = useState<View>(initialView);
  const [feed, setFeed] = useState("personal");
  const [ordered, setOrdered] = useState(initial.articles);
  const [known, setKnown] = useState(initial.articles);
  const [page, setPage] = useState(initial);
  const [visible, setVisible] = useState(12);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("");
  const [topic, setTopic] = useState("");
  const [signal, setSignal] = useState("All");
  const [period, setPeriod] = useState("week");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFeed, setEditingFeed] = useState<CustomFeed | null>(null);
  const [reload, setReload] = useState(0);
  const [newPosts, setNewPosts] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const busy = useRef(false);
  const requestController = useRef<AbortController | null>(null);
  const failedRequest = useRef<"edition" | "page" | null>(null);
  const customFeed = profile.customFeeds.find((item) => item.id === feed);
  const sources = page.sources;
  const topicOptions = page.topicCatalog?.map(topic=>topic.name) ?? TOPICS;
  const signals = ["All",...HOME_TOPICS.filter(topic=>topicOptions.includes(topic)),...topicOptions.filter(topic=>!HOME_TOPICS.includes(topic))];

  useEffect(() => {
    const readLocation = () => { const requested = window.location.pathname.slice(1) || new URLSearchParams(window.location.search).get("view"); setView(requested === "profile" || requested === "trending" ? requested : "home"); };
    readLocation();
    window.addEventListener("popstate", readLocation);
    return () => window.removeEventListener("popstate", readLocation);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setQuery(queryInput.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [queryInput]);


  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k" && view === "home") { event.preventDefault(); searchInput.current?.focus(); } };
    window.addEventListener("keydown", shortcut);
    return () => window.removeEventListener("keydown", shortcut);
  }, [view]);

  const paramsString = useMemo(() => {
    const params = new URLSearchParams({ pageSize: "24", mode: view === "trending" ? "trending" : feed === "latest" || feed === "following" ? feed : "personal", period });
    let companies = view === "trending" ? [] : customFeed?.companies ?? (feed === "following" ? profile.follows : []);
    let topics = view === "trending" ? [] : customFeed?.topics ?? [];
    if (company) companies = companies.length ? companies.filter((id) => id === company) : [company];
    if (topic) topics = topics.length ? topics.filter((item) => item === topic) : [topic];
    if (view !== "trending" && ((company && (customFeed?.companies.length || feed === "following") && !companies.length) || (feed === "following" && !profile.follows.length))) companies = ["__none__"];
    if (view !== "trending" && topic && customFeed?.topics.length && !topics.length) topics = ["__none__"];
    if (companies.length) params.set("company", companies.join(","));
    if (topics.length) params.set("topic", topics.join(","));
    if (query) params.set("q", query);
    if (view === "home" && signal !== "All") params.set("signal", signal);
    if (view !== "trending" && customFeed?.exclude.length) params.set("exclude", customFeed.exclude.join(","));
    return params.toString();
  }, [customFeed, profile.follows, feed, company, topic, query, view, signal, period]);
  const interestsKey = profile.interests.join("|");
  const followsKey = profile.follows.join("|");
  const historyKey = `${profile.readLogs.map(log => `${log.articleId}:${log.readAt}`).join("|")}|${profile.bookmarks.join("|")}|${profile.activity.map(day=>`${day.date}:${day.count}`).join("|")}`;
  const requestKey = `${view}|${feed}|${paramsString}|${period}|${interestsKey}|${followsKey}|${historyKey}|${profileOwner}|${ready}|${reload}`;
  const feedOptions = () => ({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({owner:profileOwner,profile:{follows:profile.follows,interests:profile.interests,bookmarks:profile.bookmarks,readLogs:profile.readLogs,activity:profile.activity}}),credentials:"same-origin" as const});


  useEffect(() => {
    if (view === "profile" || !ready) return;
    const current = ++generation.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    busy.current = true;
    // Pending state reflects a newly subscribed external feed while previous results stay visible.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    failedRequest.current = null;
    void fetch(`/api/articles?${paramsString}`, { ...feedOptions(), signal: controller.signal, cache: "no-store" }).then(async (response) => {
      if (!response.ok) throw new Error("The archive could not be loaded. Your place is safe; try again.");
      return await response.json() as ArticlePage;
    }).then((result) => {
      if (current !== generation.current) return;
      setPage(result);
      setOrdered(result.articles);
      setKnown((previous) => mergeArticles(previous, result.articles));
      setVisible(12);
      setNewPosts(false);
    }).catch((reason: Error) => { if (reason.name !== "AbortError" && current === generation.current) { failedRequest.current = "edition"; setError(reason.message); } }).finally(() => { if (current === generation.current) { busy.current = false; setLoading(false); } });
    return () => controller.abort();
    // A new reading history creates a new server-ranked edition; cursor pages remain frozen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

  const loadMore = useCallback(async () => {
    if (busy.current || view === "profile" || !ready) return;
    if (visible < ordered.length) { setVisible((count) => count + 12); return; }
    if (!page.hasMore || !page.nextCursor) return;
    busy.current = true;
    setLoading(true);
    setError("");
    failedRequest.current = null;
    const current = generation.current;
    const controller = new AbortController();
    requestController.current = controller;
    const params = new URLSearchParams(paramsString);
    params.set("cursor", page.nextCursor);
    params.set("snapshot", page.snapshot);
    try {
      const response = await fetch(`/api/articles?${params}`, { ...feedOptions(), signal: controller.signal, cache: "no-store" });
      if (response.status === 409) { setReload(value=>value+1); return; }
      if (!response.ok) throw new Error("The next stories are taking a moment. Try again.");
      const result = await response.json() as ArticlePage;
      if (current !== generation.current) return;
      setPage(result);
      setOrdered((previous) => mergeArticles(previous, result.articles));
      setKnown((previous) => mergeArticles(previous, result.articles));
      setVisible((count) => count + 12);
    } catch (reason) { if (reason instanceof Error && reason.name !== "AbortError" && current === generation.current) { failedRequest.current = "page"; setError(reason.message); } }
    finally { if (current === generation.current) { busy.current = false; setLoading(false); } }
    // Keep existing entries in place when a new batch arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, ordered.length, page, paramsString, view, feed, period, interestsKey, followsKey, historyKey,ready,profileOwner]);

  useEffect(() => {
    const element = sentinel.current;
    if (!element || view === "profile" || error || !window.IntersectionObserver) return;
    const observer = new IntersectionObserver((entries) => { if (entries[0]?.isIntersecting) void loadMore(); }, { rootMargin: "600px" });
    observer.observe(element);
    return () => observer.disconnect();
  }, [loadMore, view, error]);

  useEffect(() => {
    if (!ready || view !== "profile") return;
    const savedIds = [...new Set([...profile.bookmarks, ...profile.readLogs.map((log) => log.articleId)])];
    const missing = savedIds.filter((id) => !known.some((article) => article.id === id));
    if (!missing.length) return;
    const controller = new AbortController();
    void Promise.all(Array.from({ length: Math.ceil(missing.length / 100) }, (_, index) => fetch(`/api/articles?${new URLSearchParams({ ids: missing.slice(index * 100, index * 100 + 100).join(","), pageSize: "100" })}`, { signal: controller.signal }).then(async (response) => response.ok ? (await response.json() as ArticlePage).articles : []))).then((batches) => { if (!controller.signal.aborted) setKnown((previous) => mergeArticles(previous, batches.flat())); }).catch(() => undefined);
    return () => controller.abort();
    // Bookmark hydration runs when the saved collection changes, not on feed pagination.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.bookmarks.join("|"), profile.readLogs.map((log) => log.articleId).join("|"), view, ready]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setInterval(() => { void fetch("/api/articles?pageSize=1", { signal: controller.signal, cache: "no-store" }).then(async (response) => response.ok ? await response.json() as ArticlePage : null).then((result) => { if (result && result.contentVersion !== page.contentVersion) setNewPosts(true); }).catch(() => undefined); }, 300000);
    return () => { window.clearInterval(timer); controller.abort(); };
  }, [page.contentVersion]);

  const navigate = (next: View) => {
    if (next === "trending") clearFilters();
    setView(next);
    const url = new URL(window.location.href);
    url.pathname = next === "home" ? "/" : `/${next}`;
    url.searchParams.delete("view");
    window.history.pushState({}, "", url);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const openArticle = (article: Article) => { window.location.assign(`/articles/${encodeURIComponent(article.id)}`); };
  const customize = (editing: CustomFeed | null = null) => { if (ready) { setEditingFeed(editing); setDialogOpen(true); } };
  const saveFeed = (edition: CustomFeed) => { updateProfile({ customFeeds: [...profile.customFeeds.filter((item) => item.id !== edition.id), edition] }); clearFilters(); setFeed(edition.id); navigate("home"); };
  const clearFilters = () => { setQueryInput(""); setQuery(""); setCompany(""); setTopic(""); setSignal("All"); };
  const retryFeed = () => { if (failedRequest.current === "page") void loadMore(); else setReload((value) => value + 1); };
  const issueDate = new Date(page.snapshot);
  const activeFilters = Number(!!query) + Number(!!company) + Number(!!topic);
  const hasMore = visible < ordered.length || page.hasMore;

  const stories = ordered.slice(0, visible);
  const featured = view === "home" ? stories[0] ?? null : null;
  const remaining = featured ? stories.filter((article) => article.id !== featured.id) : stories;
  const renderStory = (article: Article, index?: number) => <StoryCard key={article.id} article={article} rank={index} ready={ready} saved={profile.bookmarks.includes(article.id)} onSave={() => toggleBookmark(article)} onTopic={(value) => { setTopic(value); setSearchOpen(true); if (view !== "home") navigate("home"); }} />;

  return <div className={`publication view-${view}`}>
    <a className="skip-link" href="#reading-surface">Skip to your reading</a>
    <header className="site-header">
      <a className="wordmark" href="/" onClick={(event) => { event.preventDefault(); navigate("home"); }}><span className="brand-mark" aria-hidden="true">⁄</span>readzz</a>
      <nav className="main-nav" aria-label="Main navigation">{([{ id: "home", label: "Feed", href: "/" }, { id: "trending", label: "Trending", href: "/trending" }, { id: "profile", label: "Profile", href: "/profile" }] as const).map(({ id, label, href }) => <a key={id} href={href} className={`nav-item${view === id ? " is-active" : ""}`} aria-current={view === id ? "page" : undefined} onClick={(event) => { if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return; event.preventDefault(); navigate(id); }}>{label}</a>)}</nav>
    </header>
    <main className="reading-main" id="reading-surface">
      {view === "profile" ? <>
        <ProfileView topicOptions={topicOptions} profile={profile} articles={known} sources={sources} onChange={(patch) => { if (ready) updateProfile(patch); }} onOpen={openArticle} onBookmark={toggleBookmark} onReadLog={toggleReadLog} onCustomize={() => customize()} onEditFeed={(edition) => customize(edition)} storageLabel={storageLabel} />
        {!ready && <p className="feed-status"><LoaderCircle size={15} className="spinning" /> Opening your profile…</p>}
        {ready && syncStatus === "local" && <p className="profile-account-link"><a href="/signin-with-chatgpt?return_to=%2Fprofile" target="_top">Sign in to sync your reading across devices <ArrowUpRight size={12} /></a></p>}
      </> : <>
        {view === "home" ? <>
          <section className="home-hero">
            <p className="issue-pill"><span aria-hidden="true" />Daily edition · {issueDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}</p>
            <h1>Engineering,<br /><em>read slowly.</em></h1>
            <p className="hero-description">Engineering stories from the teams building the internet — short publisher excerpts, linked to the source.</p>
            <div className="company-strip" aria-label="Writing from engineering teams">{companyLogos.map((logo) => <Image key={logo} src={`/reference/logos/${logo}.svg`} alt={logo.charAt(0).toUpperCase() + logo.slice(1)} width={18} height={18} unoptimized />)}</div>
          </section>
          <div className="search-tray tray"><label className="search-sheet sheet"><Search size={16} strokeWidth={1.6} aria-hidden="true" /><input ref={searchInput} type="search" placeholder={`Search ${initial.total.toLocaleString("en-US")} articles`} value={queryInput} onChange={(event) => setQueryInput(event.target.value)} aria-label="Search titles and abstracts" /><button className="search-shortcut" aria-label="Focus search, Command or Control K" onClick={() => searchInput.current?.focus()}><kbd>⌘K</kbd></button></label></div>
          <div className="signal-chips" aria-label="Filter by subject">{signals.map((value) => <button key={value} className={`signal-chip${signal === value ? " is-active" : ""}`} aria-pressed={signal === value} onClick={() => setSignal(value)}>{value}</button>)}</div>
          {(feed !== "personal" || company || topic) && <div className="active-filter-note"><span>{customFeed?.name || (feed === "following" ? "Following" : feed === "latest" ? "Latest" : "For you")}{company ? ` · ${sources.find((item) => item.id === company)?.company}` : ""}{topic ? ` · ${topic}` : ""}</span><button onClick={() => setSearchOpen(!searchOpen)}>Edit filters</button></div>}
          {searchOpen && <div className="feed-filter-panel"><div className="feed-filter-row"><label><span className="sr-only">Company</span><select value={company} onChange={(event) => setCompany(event.target.value)}><option value="">All companies</option>{sources.map((source) => <option value={source.id} key={source.id}>{source.company}</option>)}</select></label><label><span className="sr-only">Topic</span><select value={topic} onChange={(event) => setTopic(event.target.value)}><option value="">All topics</option>{topicOptions.map((value) => <option key={value}>{value}</option>)}</select></label><button className="text-button" onClick={() => { clearFilters(); setSearchOpen(false); }}>Clear</button></div>{customFeed && <p className="filter-note">Searching within “{customFeed.name}”. Your feed’s rules still apply.</p>}</div>}
        </> : <header className="trending-heading"><p className="eyebrow">{period === "archive" ? "From the archive" : period === "today" ? "Last 24 hours" : "Last 7 days"}</p><h1>{page.rankingBasis === "engagement" ? <>What readers <em>recommend</em></> : <>Fresh ideas to <em>explore</em></>}</h1><label className="trending-period"><span className="sr-only">Trending time period</span><select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="week">Last 7 days</option><option value="today">Last 24 hours</option><option value="archive">All collected stories</option></select><ChevronDown size={12} /></label></header>}
        {newPosts && <button className="new-posts-button" onClick={() => setReload((value) => value + 1)}><ArrowDown size={14} /> New stories are ready. Refresh your feed.</button>}
        <div aria-busy={loading}>
          {featured && <section className="featured-section"><div className="section-rule"><span>{feed === "latest" || feed === "following" ? "Latest stories" : "Selected for you"}</span><i /><time dateTime={page.snapshot}>Today</time></div>{renderStory(featured)}</section>}
          {remaining.length > 0 && <section className="stories-section">{view === "home" && <div className="section-rule"><span>{query || signal !== "All" || activeFilters ? "In your feed" : "This week"}</span><i /><span>{Math.min(remaining.length, 7)} pieces</span></div>}<div className="article-list">{(view === "home" ? remaining.slice(0, 7) : remaining).map((article, index) => renderStory(article, view === "trending" ? index + 1 : undefined))}</div></section>}
        </div>
        {view === "home" && <section className="customize-panel"><h2>Make it yours.</h2><p>Follow companies and topics for a personal feed.</p><button className="ink-button" disabled={!ready} onClick={() => customize(customFeed ?? null)}><Plus size={14} /> Customise feed</button>{(profile.customFeeds.length > 0 || profile.follows.length > 0) && <div className="personal-feed-controls"><label className="edition-select"><span className="sr-only">Choose your feed</span><select value={feed} onChange={(event) => { clearFilters(); setFeed(event.target.value); }}><option value="personal">For you</option><option value="latest">Latest</option><option value="following">Following</option>{profile.customFeeds.map((edition) => <option key={edition.id} value={edition.id}>{edition.name}</option>)}</select><ChevronDown size={12} /></label><button className="text-button" aria-expanded={searchOpen} onClick={() => { setSearchOpen(!searchOpen); window.scrollTo({ top: 470, behavior: "smooth" }); }}><SlidersHorizontal size={12} /> Filters</button></div>}</section>}
        {view === "home" && remaining.length > 7 && <div className="article-list continued-stories">{remaining.slice(7).map((article) => renderStory(article))}</div>}
        {!ordered.length && !loading && !error && <div className="feed-empty"><h2>{feed === "following" && !profile.follows.length ? "Choose whose ideas find you." : view === "trending" && period !== "archive" ? "A quiet week, so far." : "No stories found."}</h2><p>{feed === "following" && !profile.follows.length ? "Follow a few companies in your profile to begin your feed." : "Try another subject, clear your filters, or explore the collected archive."}</p>{feed === "following" && !profile.follows.length ? <button className="ink-button" onClick={() => navigate("profile")}>Choose companies</button> : view === "trending" && period !== "archive" ? <button className="ink-button" onClick={() => setPeriod("archive")}>Explore the archive</button> : <button className="text-button" onClick={clearFilters}>Clear filters</button>}</div>}
        {error && <div className="feed-error-state" role="alert"><p>{error}</p><button className="text-button" onClick={retryFeed}>Try again</button></div>}
        <div ref={sentinel} className="scroll-sentinel" aria-hidden="true" />
        {loading && <p className="feed-status" role="status"><LoaderCircle size={15} className="spinning" /> Gathering stories…</p>}
        {!loading && hasMore && !error && <button className="load-more-button" onClick={() => void loadMore()}>More stories <ArrowDown size={14} /></button>}
        {!loading && !hasMore && !!ordered.length && <div className="caught-up"><Check size={16} /><p>You’re all caught up.</p><span>More stories arrive as the companies publish.</span></div>}
        {view === "trending" && <p className="ranking-note">{page.rankingBasis === "engagement" ? "Ranked by recent, unique reader logs and saves. Repeat clicks don’t add votes." : "Community trends are warming up. These are fresh stories until readers start logging and saving."}</p>}
      </>}
      <footer className="paper-footer"><span>Collected from {sources.length} companies</span><span>Links go to original publisher</span></footer>
    </main>
    <FeedDialog topicOptions={topicOptions} open={dialogOpen} onClose={() => setDialogOpen(false)} profile={profile} sources={sources} onSave={saveFeed} onPreferences={updateProfile} editingFeed={editingFeed} onDelete={(id) => { updateProfile({ customFeeds: profile.customFeeds.filter((edition) => edition.id !== id) }); if (feed === id) setFeed("personal"); }} />
  </div>;
}
