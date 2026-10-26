"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowRight, ArrowUpRight, Bookmark, BookOpenCheck, ChevronDown, LoaderCircle, Plus, RefreshCw, Search, SlidersHorizontal, ThumbsUp, ThumbsDown } from "lucide-react";
import { TOPICS, type Article, type ArticlePage, type CustomFeed, type Profile } from "@/lib/types";
import { useReadingProfile } from "@/lib/useReadingProfile";
import { HOME_TOPICS } from "@/lib/topics";
import CompanyLogo from "./CompanyLogo";
import FeedPagination from "./FeedPagination";
import { useEngagementTotals } from "@/lib/useEngagementTotals";
import { COMMUNITY_EVENT, announceEngagement, type CommunityTotals } from "@/lib/community-events";
import SiteHeader from "./SiteHeader";
import { useAuthRequest, useRequireAccount, useAccountId } from "./AuthProvider";
import ProfileAccess from "./ProfileAccess";
import ProfileSyncNotice from "./ProfileSyncNotice";
import { publisherExcerpt, visibleTopics } from "@/lib/article-copy";
import { emptyProfile, sanitizeProfile } from "@/lib/server/core";
import { readingLocation, readingParams, articlePath, type ReadingLocation } from "@/lib/reading-location";

const ProfileView = lazy(() => import("./ProfileView"));
const FeedDialog = lazy(() => import("./FeedDialog"));

type View = "home" | "trending" | "profile";
type FeedSort = "default" | "newest" | "oldest" | "title" | "company" | "popular";
const articleLabel = (article: Article) => `${article.published_at ? "" : "Collected "}${new Date(article.published_at || article.discovered_at).toLocaleDateString("en-GB", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" })}`;
const mergeArticles = (first: Article[], next: Article[]) => [...new Map([...first, ...next].map((article) => [article.id, article])).values()];
const clientFeedCache = new Map<string, { data: ArticlePage; timestamp: number }>();


const domain = (url: string) => { try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return "Original publisher"; } };

function StoryCard({ article, returnTo, rank, saved, logged, stats, feedback, onFeedback, onSave, onLog, onTopic, onOriginal }: { article: Article; returnTo: string; rank?: number; saved: boolean; logged: boolean; ready?: boolean; stats?: CommunityTotals; feedback?: "useful" | "not-relevant"; onFeedback: (value:"useful"|"not-relevant")=>void; onSave: () => void; onLog: () => void; onTopic: (value: string) => void; onOriginal: () => void }) {
  const excerpt = publisherExcerpt(article);
  const historical = article.recommendationLane === "archive" && rank === undefined;
  const totalSaves = stats?.saves ?? 0;
  const totalReads = stats?.reads ?? 0;
  return <article id={`story-${article.id}`} className={`article-card tray${rank!==undefined ? " ranked-story" : ""}${historical ? " archive-story" : ""}`}>
    <div className="article-sheet sheet">
      <div className="article-topline">
        {rank !== undefined && !article.discovery && <span className="article-rank" aria-label={`Rank ${rank}`}>{String(rank).padStart(2,"0")}</span>}
        <span className="company-icon"><CompanyLogo companyId={article.company_id} company={article.company} /></span>
        <div className="article-byline"><span>{article.company}</span><time dateTime={article.published_at || article.discovered_at}>{articleLabel(article)}</time></div>
        <span className="publisher-domain">{domain(article.url)}</span>
      </div>
      {article.discovery && rank !== undefined && <p className="discovery-label">Recent discovery · no activity in this window</p>}
      {article.windowEngagement && !article.discovery && <p className="trending-window-counts">{article.windowEngagement.saves} {article.windowEngagement.saves === 1 ? "bookmark" : "bookmarks"} · {article.windowEngagement.reads} {article.windowEngagement.reads === 1 ? "read log" : "read logs"} in this window</p>}
      {historical && <p className="archive-label">From the archive <span aria-hidden="true">·</span> {article.published_at?.slice(0,4)}</p>}
      <h2><a href={articlePath(article.id, returnTo.split("#")[0] + `#story-${article.id}`)}>{article.title}</a></h2>
      {excerpt ? <p className="article-abstract">{excerpt.length > 240 ? `${excerpt.slice(0, 237).replace(/\s+\S*$/, "")}…` : excerpt}</p> : <p className="article-abstract missing-excerpt">No publisher excerpt. Read the blog at the source.</p>}
      {article.recommendationReason && rank === undefined && <p className="story-reason">{article.recommendationReason}</p>}
      {historical && <div className="recommendation-feedback" role="group" aria-label={`Recommendation feedback for ${article.title}`}>
        <span>Worth finding?</span>
        <button aria-pressed={feedback==="useful"} aria-label={`Useful recommendation: ${article.title}`} onClick={()=>onFeedback("useful")}><ThumbsUp size={12} aria-hidden="true"/>Useful</button>
        <button aria-pressed={feedback==="not-relevant"} aria-label={`Less like this: ${article.title}`} onClick={()=>onFeedback("not-relevant")}><ThumbsDown size={12} aria-hidden="true"/>Less like this</button>
        {feedback && <p role="status">{feedback==="useful"?"Noted for your next feed. Tap again to undo.":"We’ll adjust your next feed. Tap again to undo."}</p>}
      </div>}
      <div className="story-actions" aria-label="Community activity">
        <button className={saved?"is-active":""} aria-pressed={saved} aria-label={`${saved ? "Unsave" : "Save"} ${article.title}`} onClick={onSave}><Bookmark size={14} strokeWidth={1.5} fill={saved?"currentColor":"none"}/><span>{saved ? "Saved" : "Save"}</span><strong aria-label={`${totalSaves} total bookmarks`}>{totalSaves.toLocaleString()}</strong></button>
        <button className={logged?"is-active":""} aria-pressed={logged} aria-label={`${logged ? "Unlog" : "Log"} ${article.title}`} onClick={onLog}><BookOpenCheck size={14} strokeWidth={1.5}/><span>{logged ? "Logged" : "Log"}</span><strong aria-label={`${totalReads} total read logs`}>{totalReads.toLocaleString()}</strong></button>
      </div>
    </div>
    <div className="article-footer"><div className="article-topics">{visibleTopics(article).slice(0, 2).map((value) => <button className="article-topic" key={value} onClick={() => onTopic(value)}>{value}</button>)}</div><div className="story-links"><a className="original-link" href={article.url} target="_blank" rel="noopener noreferrer" onClick={onOriginal}>Original <ArrowUpRight size={13} /></a><a className="original-link" href={articlePath(article.id, returnTo.split("#")[0] + `#story-${article.id}`)}>Details <ArrowRight size={13} /></a></div></div>
  </article>;
}

export default function BlogReader({ initial, initialView = "home", initialLocation = readingLocation() }: { initial: ArticlePage; initialView?: View; initialLocation?: ReadingLocation }) {
  const accountId = useAccountId();
  const authRequest = useAuthRequest();
  const requireAccount = useRequireAccount();
  const reading = useReadingProfile();
  const { profile, ready, profileOwner, accountVerified, communityStatus, updateProfile, rateRecommendation, toggleBookmark, toggleReadLog, recordOpen, pendingCustomize, dismissCustomize } = reading;
  const [view, setView] = useState<View>(initialView);
  const [feed, setFeed] = useState(initialLocation.feed);
  const [ordered, setOrdered] = useState(initial.articles);
  const [known, setKnown] = useState(initial.articles);
  const [page, setPage] = useState(initial);
  const [pageSelection, setPageSelection] = useState<{key:string;number:number}|null>(null);
  const [newActivity,setNewActivity] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [queryInput, setQueryInput] = useState(initialLocation.q);
  const [query, setQuery] = useState(initialLocation.q);
  const [company, setCompany] = useState(initialLocation.company);
  const [topic, setTopic] = useState(initialLocation.topic);
  const [sort, setSort] = useState<FeedSort>("default");
  const [signal, setSignal] = useState(initialLocation.signal);
  const [period, setPeriod] = useState<string>(initialLocation.period);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFeed, setEditingFeed] = useState<CustomFeed | null>(null);
  const [reload, setReload] = useState(0);
  const [newPosts, setNewPosts] = useState(false);
  const edition = useRef<{key:string;id:string}|null>(null);
  const editionPreferences = useRef<{key:string;owner:string|null;profile:Pick<Profile,"follows"|"interests"|"bookmarks"|"readLogs"|"activity"|"recommendationFeedback">}|null>(null);
  const locationKey = useRef("");
  const pendingPage = useRef<number | null>(null);
  const requestedEdition = useRef(initialLocation.edition);
  const [libraryState, setLibraryState] = useState<"loading" | "ready" | "error">("loading");
  const [libraryRetry, setLibraryRetry] = useState(0);
  const [deletedFeed, setDeletedFeed] = useState<CustomFeed | null>(null);
  const [editionNotice, setEditionNotice] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const generation = useRef(0);
  const requestController = useRef<AbortController | null>(null);
  const knownIds = useMemo(() => new Set(known.map(article => article.id)), [known]);
  const libraryMissing = [...profile.bookmarks, ...profile.readLogs.map(log => log.articleId), ...(profile.lastOpened ? [profile.lastOpened.articleId] : [])].some(id => !knownIds.has(id));
  const customFeed = profile.customFeeds.find((item) => item.id === feed);
  const sources = page.sources;
  const topicOptions = page.topicCatalog?.map(topic=>topic.name) ?? TOPICS;
  const signals = ["All",...HOME_TOPICS.filter(topic=>topicOptions.includes(topic)),...topicOptions.filter(topic=>!HOME_TOPICS.includes(topic))];

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
    if (!["personal", "latest", "following"].includes(feed) && !customFeed) companies = ["__none__"];
    if (companies.length) params.set("company", companies.join(","));
    if (topics.length) params.set("topic", topics.join(","));
    if (query) params.set("q", query);
    if (view === "home" && signal !== "All") params.set("signal", signal);
    if (view !== "trending" && customFeed?.exclude.length) params.set("exclude", customFeed.exclude.join(","));
    return params.toString();
  }, [customFeed, profile.follows, feed, company, topic, query, view, signal, period]);
  const interestsKey = profile.interests.join("|");
  const followsKey = profile.follows.join("|");
  const filterKey = `${view}|${feed}|${paramsString}|${interestsKey}|${followsKey}`;
  const baseKey = `${filterKey}|${profileOwner}|${ready}|${reload}`;
  useEffect(() => { locationKey.current = filterKey; }, [filterKey]);
  useEffect(() => {
    const readLocation = () => {
      const params = new URLSearchParams(window.location.search);
      const requested = window.location.pathname.slice(1) || params.get("view");
      const location = readingLocation(params);
      const requestedCompany = location.company;
      setFeed(location.feed); setQueryInput(location.q); setQuery(location.q); setTopic(location.topic); setSignal(location.signal); setPeriod(location.period);
      requestedEdition.current = location.edition;
      setView(requested === "profile" || requested === "trending" ? requested : "home");
      setCompany(requestedCompany);
      if (requestedCompany) setSearchOpen(true);
      const number = location.page;
      pendingPage.current = number;
      setPageSelection({ key: locationKey.current, number: Number.isInteger(number) && number > 0 && number <= 100000 ? number : 1 });
    };
    readLocation();
    window.addEventListener("popstate", readLocation);
    return () => window.removeEventListener("popstate", readLocation);
  }, []);
  useEffect(() => {
    if (pendingPage.current !== null) { setPageSelection({ key: filterKey, number: pendingPage.current }); pendingPage.current = null; }
  }, [filterKey]);
  const pageNumber = pageSelection?.key===filterKey ? pageSelection.number : 1;
  const requestKey = `${baseKey}|${pageNumber}|${pageSelection!==null}`;
  const browsingReady = !accountId || ready;
  const canReuseInitial = !accountId && view === initialView && feed === initialLocation.feed && query === initialLocation.q && company === initialLocation.company && topic === initialLocation.topic && signal === initialLocation.signal && period === initialLocation.period;
  const returnParams = readingParams({ feed, q: query, company, topic, signal, period: period as ReadingLocation["period"], page: pageNumber, edition: page.edition ?? "" }, view === "trending");
  const returnTo = `${view === "home" ? "/" : `/${view}`}${returnParams.size ? `?${returnParams}` : ""}`;
  useEffect(() => {
    if (!pageSelection || view === "profile") return;
    const url = new URL(window.location.href);
    url.pathname = view === "home" ? "/" : "/trending";
    url.search = readingParams({feed,q:query,company,topic,signal,period:period as ReadingLocation["period"],page:pageNumber,edition:edition.current?.key===baseKey?edition.current.id:""},view==="trending").toString();
    window.history.replaceState(window.history.state, "", url);
  }, [view,feed,query,company,topic,signal,period,pageNumber,page.edition,baseKey,pageSelection]);
  const totals = useEngagementTotals(view === "profile" ? [] : ordered);


  useEffect(() => {
    if (view === "profile" || !browsingReady || !pageSelection) return;
    const current = ++generation.current;
    requestController.current?.abort();
    if (canReuseInitial && pageNumber === (initial.page ?? 1) && reload === 0 && initial.edition) {
      // Reuse the server-rendered public edition instead of requesting it again after auth.
      edition.current = { key: baseKey, id: initial.edition };
      // Restore the external snapshot when returning to the unfiltered public feed.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setPage(initial);
      setOrdered(initial.articles);
      setLoading(false);
      setError("");
      return;
    }
    const controller = new AbortController();
    requestController.current = controller;
    // Pagination must send the same preferences that created this ranked edition.
    // Live bookmark/read states still render from profile; refresh captures the new history.
    if (editionPreferences.current?.key !== baseKey) {
      editionPreferences.current = { key: baseKey, owner: profileOwner, profile: {
        follows: profile.follows, interests: profile.interests, bookmarks: profile.bookmarks,
        readLogs: profile.readLogs, activity: profile.activity, recommendationFeedback: profile.recommendationFeedback,
      } };
    }
    let preferences = editionPreferences.current;
    if (requestedEdition.current && profileOwner) {
      try {
        const raw = window.sessionStorage.getItem(`readwell:edition:${encodeURIComponent(profileOwner)}:${requestedEdition.current}`);
        if (raw && raw.length < 500000) {
          const stored = JSON.parse(raw);
          if (stored.owner === profileOwner && stored.signature === paramsString && stored.expires > Date.now()) {
            const frozen = sanitizeProfile(stored.profile, emptyProfile(), new Set(sources.map(source => source.id)));
            preferences = { key: baseKey, owner: profileOwner, profile: frozen };
            editionPreferences.current = preferences;
          }
        }
      } catch { /* A missing device snapshot starts a fresh edition explicitly. */ }
    }
    const cacheKey = `${baseKey}:${pageNumber}:${profileOwner || 'guest'}`;
    const cached = reload === 0 ? clientFeedCache.get(cacheKey) : null;
    if (cached && Date.now() - cached.timestamp < 120000) {
      setPage(cached.data);
      setOrdered(cached.data.articles);
      setKnown((previous) => mergeArticles(previous, cached.data.articles));
      setLoading(false);
    } else {
      setLoading(true);
    }
    setError("");
    const params = new URLSearchParams(paramsString);
    params.set("page",String(pageNumber));
    if(edition.current?.key===baseKey)params.set("edition",edition.current.id);
    else if (requestedEdition.current && reload === 0) { params.set("edition", requestedEdition.current); requestedEdition.current = ""; }
    if(pageNumber===1){const url=new URL(window.location.href);url.searchParams.delete("page");window.history.replaceState(window.history.state,"",url);}
    const fetchPage = () => accountId
      ? authRequest('/api/articles?' + params, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner: preferences.owner, profile: preferences.profile }), credentials: "same-origin", signal: controller.signal, cache: "no-store" })
      : fetch('/api/articles?' + params, { signal: controller.signal, cache: "no-store" });
    void fetchPage().then(async response=>{
      if(response.status===409 && params.has("edition")){setEditionNotice("Your previous edition changed or expired. Showing a fresh edition with the same filters.");edition.current=null;params.delete("edition");return fetchPage();}
      return response;
    }).then(async (response) => {
      if (!response.ok) throw new Error("The archive could not be loaded. Your place is safe; try again.");
      return await response.json() as ArticlePage;
    }).then((result) => {
      if (current !== generation.current) return;
      clientFeedCache.set(cacheKey, { data: result, timestamp: Date.now() });
      setPage(result);
      setOrdered(result.articles);
      setKnown((previous) => mergeArticles(previous, result.articles));
      if(result.edition) {
        edition.current={key:baseKey,id:result.edition};
        if (profileOwner) {
          try { window.sessionStorage.setItem(`readwell:edition:${encodeURIComponent(profileOwner)}:${result.edition}`, JSON.stringify({ owner: profileOwner, signature: paramsString, expires: Date.parse(result.snapshot) + 3600000, profile: preferences.profile })); }
          catch { /* Account saves still use their independent durable cache. */ }
        }
      }
      if(result.page && result.page!==pageNumber)setPageSelection({key:filterKey,number:result.page});
      setNewActivity(false);
      setNewPosts(false);
    }).catch((reason: Error) => { if (reason.name !== "AbortError" && current === generation.current) { setError(reason.message); } }).finally(() => { if (current === generation.current) { setLoading(false); } });
    return () => controller.abort();
    // Reading actions update controls immediately. Only refresh, filters or identity change the edition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestKey, accountId]);

  useEffect(() => {
    if (!ready || view !== "profile") return;
    const savedIds = [...new Set([...profile.bookmarks, ...profile.readLogs.map((log) => log.articleId), ...(profile.lastOpened ? [profile.lastOpened.articleId] : [])])];
    const missing = savedIds.filter((id) => !knownIds.has(id));
    if (!missing.length) return;
    const controller = new AbortController();
    // Hydration subscribes the library to the account’s externally stored IDs.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLibraryState("loading");
    void (async () => {
      for (let offset = 0; offset < missing.length; offset += 100) {
        const response = await authRequest(`/api/articles?${new URLSearchParams({ ids: missing.slice(offset, offset + 100).join(","), pageSize: "100" })}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Your saved blogs could not be loaded.");
        const result = await response.json() as ArticlePage;
        if (controller.signal.aborted) return;
        setKnown(previous => mergeArticles(previous, result.articles));
      }
      if (!controller.signal.aborted) setLibraryState("ready");
    })().catch(() => { if (!controller.signal.aborted) setLibraryState("error"); });
    return () => controller.abort();
    // Bookmark hydration runs when the saved collection changes, not on feed pagination.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile.bookmarks.join("|"), profile.readLogs.map((log) => log.articleId).join("|"), view, ready, libraryRetry, profile.lastOpened?.articleId]);

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
    if (next === "home" && view === "trending") setPeriod("today");
    const url = new URL(window.location.href);
    url.pathname = next === "home" ? "/" : `/${next}`;
    url.searchParams.delete("view");
    url.searchParams.delete("page");
    window.history.pushState({}, "", url);
    window.scrollTo({ top: 0, behavior: "instant" });
    document.getElementById("reading-surface")?.focus();
  };
  // Match PageLink's native navigation until the Vinext production router is reliable.
  // eslint-disable-next-line @next/next/no-location-assign-relative-destination
  const openArticle = (article: Article) => { window.location.assign(`/articles/${encodeURIComponent(article.id)}`); };
  const customize = (editing: CustomFeed | null = null) => { if (ready && requireAccount({ kind: "customize", id: "new", active: true })) { setEditingFeed(editing); setDialogOpen(true); } };
  useEffect(() => {
    if (pendingCustomize && accountVerified) {
      // Complete a user-requested editor opening after the external auth handoff.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDialogOpen(true);
      dismissCustomize();
    }
  }, [pendingCustomize, accountVerified, dismissCustomize]);
  const saveFeed = (edition: CustomFeed) => { if (!updateProfile({ customFeeds: [...profile.customFeeds.filter((item) => item.id !== edition.id), edition] })) return false; clearFilters(); setFeed(edition.id); navigate("home"); return true; };
  const selectCompany = (value: string) => {
    setCompany(value);
    const url = new URL(window.location.href);
    if (value) url.searchParams.set("company", value); else url.searchParams.delete("company");
    url.searchParams.delete("page");
    window.history.replaceState(window.history.state, "", url);
  };
  const clearFilters = () => { setQueryInput(""); setQuery(""); selectCompany(""); setTopic(""); setSignal("All"); setSort("default"); };
  const retryFeed = () => { requestedEdition.current = ""; setReload(value=>value+1); };
  const goToPage = (number:number) => {
    setPageSelection({key:filterKey,number});
    const url=new URL(window.location.href);
    if(number>1)url.searchParams.set("page",String(number));else url.searchParams.delete("page");
    window.history.pushState({},"",url);
    document.getElementById("feed-stories")?.scrollIntoView({block:"start",behavior:window.matchMedia("(prefers-reduced-motion: reduce)").matches?"instant":"smooth"});
  };
  const issueDate = new Date(page.snapshot);
  const activeFilters = Number(!!query) + Number(!!company) + Number(!!topic) + Number(sort !== "default");

  const sortedStories = useMemo(() => {
    if (sort === "default") return ordered;
    return [...ordered].sort((a, b) => {
      if (sort === "newest") {
        const dateA = a.published_at || a.discovered_at || "";
        const dateB = b.published_at || b.discovered_at || "";
        return dateB.localeCompare(dateA);
      }
      if (sort === "oldest") {
        const dateA = a.published_at || a.discovered_at || "";
        const dateB = b.published_at || b.discovered_at || "";
        return dateA.localeCompare(dateB);
      }
      if (sort === "title") return a.title.localeCompare(b.title);
      if (sort === "company") return a.company.localeCompare(b.company);
      if (sort === "popular") {
        const savesA = totals[a.id]?.saves ?? 0;
        const savesB = totals[b.id]?.saves ?? 0;
        return savesB - savesA;
      }
      return 0;
    });
  }, [ordered, sort, totals]);

  const stories = sortedStories;
  const featured = view === "home" && pageNumber===1 ? stories[0] ?? null : null;
  const remaining = featured ? stories.filter((article) => article.id !== featured.id) : stories;
  const handleSave = (article: Article) => {
    const isSaved = profile.bookmarks.includes(article.id);
    const currentStats = totals[article.id] ?? article.engagement ?? { reads: 0, saves: 0 };
    const nextSaves = Math.max(0, currentStats.saves + (isSaved ? -1 : 1));
    announceEngagement(article.id, { ...currentStats, saves: nextSaves });
    toggleBookmark(article);
  };

  const handleLog = (article: Article) => {
    const isLogged = profile.readLogs.some(log => log.articleId === article.id);
    const currentStats = totals[article.id] ?? article.engagement ?? { reads: 0, saves: 0 };
    const nextReads = Math.max(0, currentStats.reads + (isLogged ? -1 : 1));
    announceEngagement(article.id, { ...currentStats, reads: nextReads });
    toggleReadLog(article);
  };

  const renderStory = (article: Article, index?: number) => <StoryCard key={article.id} article={article} returnTo={returnTo} rank={index} ready={ready} saved={profile.bookmarks.includes(article.id)} logged={profile.readLogs.some(log=>log.articleId===article.id)} stats={totals[article.id]} onOriginal={() => recordOpen(article)} feedback={profile.recommendationFeedback?.find(item=>item.articleId===article.id)?.value} onFeedback={(value)=>rateRecommendation(article,value)} onSave={() => handleSave(article)} onLog={() => handleLog(article)} onTopic={(value) => { setTopic(value); setSearchOpen(true); if (view !== "home") navigate("home"); }} />;

  return <div className={`publication view-${view}`}>
    <a className="skip-link" href="#reading-surface">Skip to your reading</a>
    <SiteHeader active={view} onNavigate={navigate} />
    <main className="reading-main" id="reading-surface" tabIndex={-1}>
      <ProfileSyncNotice {...reading} />
      {deletedFeed && <p className="sync-notice" role="status">“{deletedFeed.name}” was deleted. <button className="text-button" onClick={() => { if (updateProfile({ customFeeds: [...profile.customFeeds, deletedFeed] })) { setFeed(deletedFeed.id); setDeletedFeed(null); } }}>Undo</button></p>}
      {view === "profile" ? <>
        <ProfileAccess>
        {ready && accountVerified ? <>
          <Suspense fallback={<p className="feed-status" role="status">Loading your library…</p>}>
        <ProfileView topicOptions={topicOptions} profile={profile} articles={known} sources={sources} onChange={(patch) => ready ? updateProfile(patch) : false} onOpen={openArticle} onBookmark={toggleBookmark} onReadLog={toggleReadLog} onCustomize={() => customize()} onEditFeed={(edition) => customize(edition)} libraryState={libraryMissing ? libraryState : "ready"} onRetryLibrary={() => setLibraryRetry(value => value + 1)} />
          </Suspense>
        </> : <p className="feed-status" role="status">{ready ? <>Your profile could not be loaded. <button className="text-button" onClick={() => window.location.reload()}>Try again</button></> : <><LoaderCircle size={15} className="spinning" /> Loading your library…</>}</p>}
        </ProfileAccess>
      </> : <>
        {view === "home" ? <>
          <section className="home-hero">
            <p className="issue-pill"><span aria-hidden="true" />Reading edition · {issueDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" })}</p>
            <h1>Engineering,<br /><em>worth reading.</em></h1>
            <p className="hero-description">Engineering blogs from the teams building the internet — short publisher excerpts, linked to the source.</p>
          </section>
          <div className="reading-toolbar" aria-label="Reading controls"><label className="edition-select"><span className="sr-only">Choose your feed</span><select value={feed} onChange={event => { clearFilters(); setFeed(event.target.value); }}><option value="personal">{accountId ? "For you" : "Discover"}</option><option value="latest">Latest</option><option value="following">Following</option>{!["personal", "latest", "following"].includes(feed) && !customFeed && <option value={feed}>Unavailable custom feed</option>}{profile.customFeeds.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><ChevronDown size={14} /></label><div><button className="text-button" aria-expanded={searchOpen} aria-controls="reading-filters" onClick={() => setSearchOpen(!searchOpen)}><SlidersHorizontal size={14} />Filters{activeFilters ? ` (${activeFilters})` : ""}</button><button className="text-button" disabled={!ready} onClick={() => customize(customFeed ?? null)}><Plus size={14} />{customFeed ? "Edit feed" : "Create feed"}</button></div></div>
          <div className="search-tray tray"><label className="search-sheet sheet"><Search size={16} strokeWidth={1.6} aria-hidden="true" /><input ref={searchInput} type="search" placeholder={`Search collected articles`} value={queryInput} maxLength={200} onChange={(event) => setQueryInput(event.target.value)} aria-label="Search titles and abstracts" /><span className="search-shortcut" aria-hidden="true"><kbd>Ctrl K</kbd></span></label></div>
          <div className="signal-chips" aria-label="Filter by subject">{signals.map((value) => <button key={value} className={`signal-chip${signal === value ? " is-active" : ""}`} aria-pressed={signal === value} onClick={() => setSignal(value)}>{value}</button>)}</div>
          {(feed !== "personal" || company || topic || sort !== "default") && <div className="active-filter-note"><span>{customFeed?.name || (!["personal", "latest", "following"].includes(feed) ? "Unavailable custom feed" : feed === "following" ? "Following" : feed === "latest" ? "Latest" : accountId ? "For you" : "Discover")}{company ? ` · ${sources.find((item) => item.id === company)?.company ?? company}` : ""}{topic ? ` · ${topic}` : ""}{sort !== "default" ? ` · ${sort === "newest" ? "Newest" : sort === "oldest" ? "Oldest" : sort === "title" ? "Title A–Z" : sort === "company" ? "Company A–Z" : "Most bookmarked"}` : ""}</span><button className="active-filter-edit" onClick={() => setSearchOpen(!searchOpen)}>Edit filters</button></div>}
          {searchOpen && <div className="feed-filter-panel" id="reading-filters"><div className="feed-filter-row"><label className="feed-filter-select-wrap"><span className="sr-only">Company</span><select value={company} onChange={(event) => selectCompany(event.target.value)}><option value="">All companies</option>{sources.map((source) => <option value={source.id} key={source.id}>{source.company}</option>)}</select><ChevronDown size={14} aria-hidden="true" /></label><label className="feed-filter-select-wrap"><span className="sr-only">Topic</span><select value={topic} onChange={(event) => setTopic(event.target.value)}><option value="">All topics</option>{topicOptions.map((value) => <option key={value}>{value}</option>)}</select><ChevronDown size={14} aria-hidden="true" /></label><label className="feed-filter-select-wrap"><span className="sr-only">Sort by</span><select value={sort} onChange={(event) => setSort(event.target.value as FeedSort)}><option value="default">Default order</option><option value="newest">Newest first</option><option value="oldest">Oldest first</option><option value="title">Title, A–Z</option><option value="company">Company, A–Z</option><option value="popular">Most bookmarked</option></select><ChevronDown size={14} aria-hidden="true" /></label><button className="feed-filter-clear-btn" onClick={() => { clearFilters(); setSearchOpen(false); }}>Clear</button></div>{customFeed && <p className="filter-note">Searching within “{customFeed.name}”. Your feed’s rules still apply.</p>}</div>}
        </> : <header className="trending-heading trending-editorial">
          <p className="eyebrow">THE READING ROOM</p><h1>Good ideas,<br/><em>finding readers.</em></h1>
          <p className="trending-intro">Ranked by bookmarks and read logs {period === "today" ? "from the last 24 hours" : period === "week" ? "from the last seven days" : "across all time"}. Read logs weigh more than bookmarks; newer activity has more influence. Recent discoveries fill any remaining places and are labeled separately.</p>
          <div className="trending-controls"><div className="trending-windows" role="group" aria-label="Trending time period">{([{id:"today",label:"Today"},{id:"week",label:"This week"},{id:"archive",label:"All time"}]).map(window=><button key={window.id} aria-pressed={period===window.id} onClick={()=>setPeriod(window.id)}>{window.label}</button>)}</div><button className="text-button" onClick={retryFeed} disabled={loading} aria-label="Refresh trending ranking"><RefreshCw size={13}/><span>Refresh</span></button></div>
        </header>}

        {(newPosts||newActivity) && <button className="new-posts-button" onClick={() => setReload((value) => value + 1)}><ArrowDown size={14} /> {newActivity?"Community activity changed. Refresh the ranking.":"New blogs are ready. Refresh your feed."}</button>}
        <p className="sr-only" role="status" aria-live="polite">{loading ? "Loading matching blogs" : `${page.total} matching blogs. Page ${page.page ?? pageNumber}.`}</p>
        <div id="feed-stories" aria-busy={loading}>
          {editionNotice && <p className="feed-context-note" role="status">{editionNotice}</p>}
          {initial.degraded && <p className="feed-context-note" role="status">Live reading data is unavailable. Showing the last collected archive. <button className="text-button" onClick={() => window.location.reload()}>Try again</button></p>}
          {communityStatus==="error" && <p className="community-sync-note" role="status">Some reading changes still need to sync. Check the save notice above.</p>}
          {view==="trending" && <div className="section-rule"><span>Top blogs</span><i/><span>{page.total.toLocaleString()} {page.total===1?"blog":"blogs"}</span></div>}
          {featured && <section className="featured-section"><div className="section-rule"><span>{feed === "latest" || feed === "following" ? "Latest blogs" : query ? "Search results" : company || topic || signal !== "All" ? "Matching blogs" : accountId ? "Selected for you" : "Selected blogs"}</span><i /><span>{query ? `${page.total.toLocaleString()} results` : "Current edition"}</span></div>{renderStory(featured)}</section>}
          {remaining.length > 0 && <section className="stories-section">{view === "home" && <div className="section-rule"><span>{feed === "personal" && !query && signal === "All" && !activeFilters ? "Recent & rediscovered" : "In your feed"}</span><i /><button className="feed-refresh" disabled={loading} onClick={retryFeed} aria-label="Refresh your feed"><RefreshCw size={12} aria-hidden="true"/><span>Refresh</span></button></div>}<div className="article-list">{(view === "home" ? remaining.slice(0, 7) : remaining).map((article, index) => renderStory(article, view === "trending" ? ((page.page??pageNumber)-1)*12+index+1 : undefined))}</div></section>}
        </div>

        {view === "home" && remaining.length > 7 && <div className="article-list continued-stories">{remaining.slice(7).map((article) => renderStory(article))}</div>}
        {!ordered.length && !loading && !error && <div className="feed-empty"><h2>{feed === "following" && !profile.follows.length ? "Choose whose ideas find you." : view === "trending" && period !== "archive" ? "A quiet week, so far." : sources.find(source => source.id === company)?.mode === "manual" ? "This publisher is available at the source." : "No blogs found."}</h2><p>{feed === "following" && !profile.follows.length ? "Follow a few companies in your profile to begin your feed." : sources.find(source => source.id === company)?.mode === "manual" ? "Automatic collection is unavailable for this publisher. Following won’t add new blogs until a supported source is available." : "Try another subject, clear your filters, or explore the collected archive."}</p>{sources.find(source => source.id === company)?.mode === "manual" && <a className="ink-button" href={sources.find(source => source.id === company)?.blog_url} target="_blank" rel="noopener noreferrer">Visit publisher <ArrowRight size={13} /></a>}{feed === "following" && !profile.follows.length ? <a className="ink-button" href="/companies">Choose companies</a> : view === "trending" && period !== "archive" ? <button className="ink-button" onClick={() => setPeriod("archive")}>Explore the archive</button> : <button className="text-button" onClick={() => { clearFilters(); if (!["personal", "latest", "following"].includes(feed) && !customFeed) setFeed("personal"); }}>Clear filters</button>}</div>}
        {error && <div className="feed-error-state" role="alert"><p>{error}</p><button className="text-button" onClick={retryFeed}>Try again</button></div>}
        {loading && <p className="feed-status" role="status"><LoaderCircle size={15} className="spinning" /> Gathering blogs…</p>}
        {!!ordered.length && <><FeedPagination current={page.page??pageNumber} total={page.totalPages??Math.max(1,Math.ceil(page.total/12))} loading={loading} onChange={goToPage}/><p className="pagination-caption">Page {page.page??pageNumber} of {page.totalPages??Math.max(1,Math.ceil(page.total/12))} · {page.total.toLocaleString()} blogs</p></>}
      </>}
      <footer className="paper-footer">
        <a className="footer-sources" href="/companies"><span>{sources.length} companies.<br />One reading room.</span><ArrowRight size={18} strokeWidth={1.5} aria-hidden="true" /></a>
        <p className="footer-note">Excerpts here.<br />Full blogs at the source.<br /><a href="/privacy">Privacy & data</a></p>
      </footer>
    </main>
    {dialogOpen && <Suspense fallback={null}><FeedDialog topicOptions={topicOptions} open={dialogOpen} onClose={() => setDialogOpen(false)} profile={profile} sources={sources} onSave={saveFeed} onPreferences={updateProfile} editingFeed={editingFeed} onDelete={(id) => { const deleted = profile.customFeeds.find(item => item.id === id); if (!updateProfile({ customFeeds: profile.customFeeds.filter((edition) => edition.id !== id) })) return false; if (feed === id) setFeed("personal"); setDeletedFeed(deleted ?? null); return true; }} /></Suspense>}
  </div>;
}
