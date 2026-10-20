"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Bookmark, BookOpenCheck, ChevronDown, LoaderCircle, Plus, RefreshCw, Search, SlidersHorizontal } from "lucide-react";
import ProfileView from "./ProfileView";
import FeedDialog from "./FeedDialog";
import { TOPICS, type Article, type ArticlePage, type CustomFeed } from "@/lib/types";
import { useReadingProfile } from "@/lib/useReadingProfile";
import { HOME_TOPICS } from "@/lib/topics";
import CompanyLogo from "./CompanyLogo";
import FeedPagination from "./FeedPagination";
import { useEngagementTotals } from "@/lib/useEngagementTotals";
import { COMMUNITY_EVENT, type CommunityTotals } from "@/lib/community-events";
import SiteHeader from "./SiteHeader";

type View = "home" | "trending" | "profile";
const articleLabel = (article: Article) => `${article.published_at ? "" : "Collected "}${new Date(article.published_at || article.discovered_at).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
const mergeArticles = (first: Article[], next: Article[]) => [...new Map([...first, ...next].map((article) => [article.id, article])).values()];
const heroCompanies = [{ id: "stripe", name: "Stripe" }, { id: "netflix", name: "Netflix" }, { id: "cloudflare", name: "Cloudflare" }, { id: "discord", name: "Discord" }, { id: "figma", name: "Figma" }, { id: "github", name: "GitHub" }, { id: "spotify", name: "Spotify" }, { id: "shopify", name: "Shopify" }, { id: "airbnb", name: "Airbnb" }, { id: "uber", name: "Uber" }];

const domain = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Original publisher"; } };

function StoryCard({ article, rank, saved, logged, ready, stats, onSave, onLog, onTopic }: { article: Article; rank?: number; saved: boolean; logged: boolean; ready: boolean; stats?: CommunityTotals; onSave: () => void; onLog: () => void; onTopic: (value: string) => void }) {
  return <article className={`article-card tray${rank!==undefined ? " ranked-story" : ""}`}>
    <div className="article-sheet sheet">
      <div className="article-topline">
        {rank !== undefined && <span className="article-rank" aria-label={`Rank ${rank}`}>{String(rank).padStart(2,"0")}</span>}
        <span className="company-icon"><CompanyLogo companyId={article.company_id} company={article.company} /></span>
        <div className="article-byline"><span>{article.company}</span><time dateTime={article.published_at || article.discovered_at}>{articleLabel(article)}</time></div>
        <span className="publisher-domain">{domain(article.url)}</span>
      </div>
      <h2><a href={`/articles/${encodeURIComponent(article.id)}`}>{article.title}</a></h2>
      {article.summary && <p className="article-abstract">{article.summary.length > 240 ? `${article.summary.slice(0, 237).replace(/\s+\S*$/, "")}…` : article.summary}</p>}
      {article.recommendationReason && rank === undefined && <p className="story-reason">{article.recommendationReason}</p>}
      <div className="story-actions" aria-label="Community activity">
        <button className={saved?"is-active":""} disabled={!ready} aria-pressed={saved} aria-label={`${saved ? "Remove bookmark for" : "Bookmark"} ${article.title}`} onClick={onSave}><Bookmark size={14} strokeWidth={1.5} fill={saved?"currentColor":"none"}/><strong>{stats?.saves.toLocaleString() ?? "—"}</strong><span>{stats?.saves===1?"bookmark":"bookmarks"}</span></button>
        <button className={logged?"is-active":""} disabled={!ready} aria-pressed={logged} aria-label={`${logged ? "Undo read log for" : "Log as read:"} ${article.title}`} onClick={onLog}><BookOpenCheck size={14} strokeWidth={1.5}/><strong>{stats?.reads.toLocaleString() ?? "—"}</strong><span>{stats?.reads===1?"logged read":"logged reads"}</span></button>
      </div>
    </div>
    <div className="article-footer"><div className="article-topics">{article.topics.slice(0, 2).map((value) => <button className="article-topic" key={value} onClick={() => onTopic(value)}>{value}</button>)}</div><a className="original-link" href={`/articles/${encodeURIComponent(article.id)}`}>Read <ArrowRight size={13} /></a></div>
  </article>;
}

export default function BlogReader({ initial, initialView = "home" }: { initial: ArticlePage; initialView?: View }) {
  const { profile, ready, profileOwner, storageLabel, syncStatus, communityStatus, updateProfile, toggleBookmark, toggleReadLog } = useReadingProfile();
  const [view, setView] = useState<View>(initialView);
  const [feed, setFeed] = useState("personal");
  const [ordered, setOrdered] = useState(initial.articles);
  const [known, setKnown] = useState(initial.articles);
  const [page, setPage] = useState(initial);
  const [pageSelection, setPageSelection] = useState<{key:string;number:number}|null>(null);
  const [newActivity,setNewActivity] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [queryInput, setQueryInput] = useState("");
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("");
  const [topic, setTopic] = useState("");
  const [signal, setSignal] = useState("All");
  const [period, setPeriod] = useState("today");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFeed, setEditingFeed] = useState<CustomFeed | null>(null);
  const [reload, setReload] = useState(0);
  const [newPosts, setNewPosts] = useState(false);
  const edition = useRef<{key:string;id:string}|null>(null);
  const locationKey = useRef("");
  const searchInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const customFeed = profile.customFeeds.find((item) => item.id === feed);
  const sources = page.sources;
  const topicOptions = page.topicCatalog?.map(topic=>topic.name) ?? TOPICS;
  const signals = ["All",...HOME_TOPICS.filter(topic=>topicOptions.includes(topic)),...topicOptions.filter(topic=>!HOME_TOPICS.includes(topic))];

  useEffect(() => {
    const readLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const requested = window.location.pathname.slice(1) || params.get("view");
      const requestedCompany = params.get("company") || "";
      setView(requested === "profile" || requested === "trending" ? requested : "home");
      setCompany(requestedCompany);
      if (requestedCompany) setSearchOpen(true);
      const number = Number(params.get("page") || 1);
      setPageSelection({ key: locationKey.current, number: Number.isInteger(number) && number > 0 && number <= 100000 ? number : 1 });
    };
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
    const params = new URLSearchParams({ pageSize: "12", mode: view === "trending" ? "trending" : feed === "latest" || feed === "following" ? feed : "personal", period });
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
  const filterKey = `${view}|${feed}|${paramsString}|${interestsKey}|${followsKey}`;
  const baseKey = `${filterKey}|${profileOwner}|${ready}|${historyKey}|${reload}`;
  locationKey.current = filterKey;
  const pageNumber = pageSelection?.key===filterKey ? pageSelection.number : 1;
  const requestKey = `${baseKey}|${pageNumber}|${pageSelection!==null}`;
  const totals = useEngagementTotals(view === "profile" ? [] : ordered);
  const feedOptions = () => ({method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({owner:profileOwner,profile:{follows:profile.follows,interests:profile.interests,bookmarks:profile.bookmarks,readLogs:profile.readLogs,activity:profile.activity}}),credentials:"same-origin" as const});


  useEffect(() => {
    if (view === "profile" || !ready || !pageSelection) return;
    const current = ++generation.current;
    requestController.current?.abort();
    const controller = new AbortController();
    requestController.current = controller;
    // Pending state reflects a newly subscribed external feed while previous results stay visible.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    const params = new URLSearchParams(paramsString);
    params.set("page",String(pageNumber));
    if(edition.current?.key===baseKey)params.set("edition",edition.current.id);
    if(pageNumber===1){const url=new URL(window.location.href);url.searchParams.delete("page");window.history.replaceState(window.history.state,"",url);}
    const fetchPage = () => fetch(`/api/articles?${params}`, { ...feedOptions(), signal: controller.signal, cache: "no-store" });
    void fetchPage().then(async response=>{
      if(response.status===409 && params.has("edition")){edition.current=null;params.delete("edition");return fetchPage();}
      return response;
    }).then(async (response) => {
      if (!response.ok) throw new Error("The archive could not be loaded. Your place is safe; try again.");
      return await response.json() as ArticlePage;
    }).then((result) => {
      if (current !== generation.current) return;
      setPage(result);
      setOrdered(result.articles);
      setKnown((previous) => mergeArticles(previous, result.articles));
      if(result.edition)edition.current={key:baseKey,id:result.edition};
      if(result.page && result.page!==pageNumber)setPageSelection({key:filterKey,number:result.page});
      setNewActivity(false);
      setNewPosts(false);
    }).catch((reason: Error) => { if (reason.name !== "AbortError" && current === generation.current) { setError(reason.message); } }).finally(() => { if (current === generation.current) { setLoading(false); } });
    return () => controller.abort();
    // A new reading history creates a new server-ranked edition; cursor pages remain frozen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey]);

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
    const refresh = async () => {
      if(document.visibilityState === "hidden")return;
      const params = new URLSearchParams({pageSize:"1",mode:view==="trending"?"trending":"latest",period});
      try {
        const response=await fetch(`/api/articles?${params}`,{signal:controller.signal,cache:"no-store"});
        if(!response.ok)return;
        const result=await response.json() as ArticlePage;
        if(result.contentVersion!==page.contentVersion)setNewPosts(true);
        if(view==="trending" && result.communitySummary){
          if(JSON.stringify(result.communitySummary)!==JSON.stringify(page.communitySummary))setNewActivity(true);
          setPage(previous=>({...previous,communitySummary:result.communitySummary}));
        }
      }catch{/* The current edition stays readable while offline. */}
    };
    const changed=()=>{if(view==="trending"){setNewActivity(true);void refresh();}};
    const timer=window.setInterval(()=>void refresh(),view==="trending"?30000:300000);
    window.addEventListener(COMMUNITY_EVENT,changed);
    return ()=>{window.clearInterval(timer);controller.abort();window.removeEventListener(COMMUNITY_EVENT,changed);};
  },[page.contentVersion,view,period,page.communitySummary]);

  const navigate = (next: View) => {
    if (next === "trending") clearFilters();
    setView(next);
    const url = new URL(window.location.href);
    url.pathname = next === "home" ? "/" : `/${next}`;
    url.searchParams.delete("view");
    url.searchParams.delete("page");
    window.history.pushState({}, "", url);
    window.scrollTo({ top: 0, behavior: "instant" });
  };
  const openArticle = (article: Article) => { window.location.assign(`/articles/${encodeURIComponent(article.id)}`); };
  const customize = (editing: CustomFeed | null = null) => { if (ready) { setEditingFeed(editing); setDialogOpen(true); } };
  const saveFeed = (edition: CustomFeed) => { updateProfile({ customFeeds: [...profile.customFeeds.filter((item) => item.id !== edition.id), edition] }); clearFilters(); setFeed(edition.id); navigate("home"); };
  const selectCompany = (value: string) => {
    setCompany(value);
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("company", value); else url.searchParams.delete("company");
    url.searchParams.delete("page");
    window.history.replaceState(window.history.state, "", url);
  };
  const clearFilters = () => { setQueryInput(""); setQuery(""); selectCompany(""); setTopic(""); setSignal("All"); };
  const retryFeed = () => setReload(value=>value+1);
  const goToPage = (number:number) => {
    setPageSelection({key:filterKey,number});
    const url=new URL(window.location.href);
    if(number>1)url.searchParams.set("page",String(number));else url.searchParams.delete("page");
    window.history.pushState({},"",url);
    document.getElementById("feed-stories")?.scrollIntoView({block:"start",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
  };
  const issueDate = new Date(page.snapshot);
  const activeFilters = Number(!!query) + Number(!!company) + Number(!!topic);

  const stories = ordered;
  const featured = view === "home" && pageNumber===1 ? stories[0] ?? null : null;
  const remaining = featured ? stories.filter((article) => article.id !== featured.id) : stories;
  const renderStory = (article: Article, index?: number) => <StoryCard key={article.id} article={article} rank={index} ready={ready} saved={profile.bookmarks.includes(article.id)} logged={profile.readLogs.some(log=>log.articleId===article.id)} stats={totals[article.id]} onSave={() => toggleBookmark(article)} onLog={() => toggleReadLog(article)} onTopic={(value) => { setTopic(value); setSearchOpen(true); if (view !== "home") navigate("home"); }} />;

  return <div className={`publication view-${view}`}>
    <a className="skip-link" href="#reading-surface">Skip to your reading</a>
    <SiteHeader active={view} onNavigate={navigate} />
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
            <div className="company-strip" aria-label="Writing from engineering teams">{heroCompanies.map((company) => <CompanyLogo key={company.id} companyId={company.id} company={company.name} />)}</div>
          </section>
          <div className="search-tray tray"><label className="search-sheet sheet"><Search size={16} strokeWidth={1.6} aria-hidden="true" /><input ref={searchInput} type="search" placeholder={`Search ${initial.total.toLocaleString("en-US")} articles`} value={queryInput} onChange={(event) => setQueryInput(event.target.value)} aria-label="Search titles and abstracts" /><button className="search-shortcut" aria-label="Focus search, Command or Control K" onClick={() => searchInput.current?.focus()}><kbd>⌘K</kbd></button></label></div>
          <div className="signal-chips" aria-label="Filter by subject">{signals.map((value) => <button key={value} className={`signal-chip${signal === value ? " is-active" : ""}`} aria-pressed={signal === value} onClick={() => setSignal(value)}>{value}</button>)}</div>
          {(feed !== "personal" || company || topic) && <div className="active-filter-note"><span>{customFeed?.name || (feed === "following" ? "Following" : feed === "latest" ? "Latest" : "For you")}{company ? ` · ${sources.find((item) => item.id === company)?.company}` : ""}{topic ? ` · ${topic}` : ""}</span><button onClick={() => setSearchOpen(!searchOpen)}>Edit filters</button></div>}
          {searchOpen && <div className="feed-filter-panel"><div className="feed-filter-row"><label><span className="sr-only">Company</span><select value={company} onChange={(event) => selectCompany(event.target.value)}><option value="">All companies</option>{sources.map((source) => <option value={source.id} key={source.id}>{source.company}</option>)}</select></label><label><span className="sr-only">Topic</span><select value={topic} onChange={(event) => setTopic(event.target.value)}><option value="">All topics</option>{topicOptions.map((value) => <option key={value}>{value}</option>)}</select></label><button className="text-button" onClick={() => { clearFilters(); setSearchOpen(false); }}>Clear</button></div>{customFeed && <p className="filter-note">Searching within “{customFeed.name}”. Your feed’s rules still apply.</p>}</div>}
        </> : <header className="trending-heading trending-editorial">
          <p className="eyebrow">THE READING ROOM</p><h1>Good ideas,<br/><em>finding readers.</em></h1>
          <p className="trending-intro">Ranked by bookmarks and read logs {period === "today" ? "from the last 24 hours" : period === "week" ? "from the last seven days" : "across all time"}. Recent stories round out the top ten.</p>
          <div className="trending-controls"><div className="trending-windows" role="group" aria-label="Trending time period">{([{id:"today",label:"Today"},{id:"week",label:"This week"},{id:"archive",label:"All time"}]).map(window=><button key={window.id} aria-pressed={period===window.id} onClick={()=>setPeriod(window.id)}>{window.label}</button>)}</div><button className="text-button" onClick={retryFeed} disabled={loading} aria-label="Refresh trending ranking"><RefreshCw size={13}/><span>Refresh</span></button></div>
        </header>}

        {(newPosts||newActivity) && <button className="new-posts-button" onClick={() => setReload((value) => value + 1)}><ArrowDown size={14} /> {newActivity?"Community activity changed. Refresh the ranking.":"New stories are ready. Refresh your feed."}</button>}
        <div id="feed-stories" aria-busy={loading}>
          {communityStatus==="error" && <p className="community-sync-note" role="status">Your personal copy is saved. Community totals could not be updated.</p>}
          {view==="trending" && <div className="section-rule"><span>Top stories</span><i/><span>{page.total.toLocaleString()} {page.total===1?"story":"stories"}</span></div>}
          {featured && <section className="featured-section"><div className="section-rule"><span>{feed === "latest" || feed === "following" ? "Latest stories" : "Selected for you"}</span><i /><time dateTime={page.snapshot}>Today</time></div>{renderStory(featured)}</section>}
          {remaining.length > 0 && <section className="stories-section">{view === "home" && <div className="section-rule"><span>{query || signal !== "All" || activeFilters ? "In your feed" : "In your feed"}</span><i /><span>{ordered.length} stories</span></div>}<div className="article-list">{(view === "home" ? remaining.slice(0, 7) : remaining).map((article, index) => renderStory(article, view === "trending" ? ((page.page??pageNumber)-1)*12+index+1 : undefined))}</div></section>}
        </div>
        {view === "home" && pageNumber===1 && <section className="customize-panel"><h2>Make it yours.</h2><p>Follow companies and topics for a personal feed.</p><button className="ink-button" disabled={!ready} onClick={() => customize(customFeed ?? null)}><Plus size={14} /> Customise feed</button>{(profile.customFeeds.length > 0 || profile.follows.length > 0) && <div className="personal-feed-controls"><label className="edition-select"><span className="sr-only">Choose your feed</span><select value={feed} onChange={(event) => { clearFilters(); setFeed(event.target.value); }}><option value="personal">For you</option><option value="latest">Latest</option><option value="following">Following</option>{profile.customFeeds.map((edition) => <option key={edition.id} value={edition.id}>{edition.name}</option>)}</select><ChevronDown size={12} /></label><button className="text-button" aria-expanded={searchOpen} onClick={() => { setSearchOpen(!searchOpen); window.scrollTo({ top: 470, behavior: "smooth" }); }}><SlidersHorizontal size={12} /> Filters</button></div>}</section>}
        {view === "home" && remaining.length > 7 && <div className="article-list continued-stories">{remaining.slice(7).map((article) => renderStory(article))}</div>}
        {!ordered.length && !loading && !error && <div className="feed-empty"><h2>{feed === "following" && !profile.follows.length ? "Choose whose ideas find you." : view === "trending" && period !== "archive" ? "A quiet week, so far." : "No stories found."}</h2><p>{feed === "following" && !profile.follows.length ? "Follow a few companies in your profile to begin your feed." : "Try another subject, clear your filters, or explore the collected archive."}</p>{feed === "following" && !profile.follows.length ? <button className="ink-button" onClick={() => navigate("profile")}>Choose companies</button> : view === "trending" && period !== "archive" ? <button className="ink-button" onClick={() => setPeriod("archive")}>Explore the archive</button> : <button className="text-button" onClick={clearFilters}>Clear filters</button>}</div>}
        {error && <div className="feed-error-state" role="alert"><p>{error}</p><button className="text-button" onClick={retryFeed}>Try again</button></div>}
        {loading && <p className="feed-status" role="status"><LoaderCircle size={15} className="spinning" /> Gathering stories…</p>}
        {!!ordered.length && <><FeedPagination current={page.page??pageNumber} total={page.totalPages??Math.max(1,Math.ceil(page.total/12))} loading={loading} onChange={goToPage}/><p className="pagination-caption">Page {page.page??pageNumber} of {page.totalPages??Math.max(1,Math.ceil(page.total/12))} · {page.total.toLocaleString()} stories</p></>}
      </>}
      <footer className="paper-footer"><span>Collected from {sources.length} companies</span><span>Links go to original publisher</span></footer>
    </main>
    <FeedDialog topicOptions={topicOptions} open={dialogOpen} onClose={() => setDialogOpen(false)} profile={profile} sources={sources} onSave={saveFeed} onPreferences={updateProfile} editingFeed={editingFeed} onDelete={(id) => { updateProfile({ customFeeds: profile.customFeeds.filter((edition) => edition.id !== id) }); if (feed === id) setFeed("personal"); }} />
  </div>;
}
