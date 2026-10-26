"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Article, Profile } from "./types";
import { emptyProfile, sanitizeProfile, toggleReadLog as toggleProfileReadLog } from "./server/core";
import { applyIntent, takeIntent } from "./reading-intent";
import { announceEngagement } from "./community-events";
import { useAuthReady, useAuthRequest, useRequireAccount, useAccountId } from "@/components/AuthProvider";

type SyncStatus = "local" | "syncing" | "synced" | "error";
type StoredProfile = { format: 1; owner: string; profile: Profile; serverVersion: number; generation?: number; dirty: boolean };
const PREFIX = "scroll:reading-profile:v1:";
const ANONYMOUS = "anonymous";

function validate(value: unknown): Profile {
  // Validate the complete shape without bundling the server's article/source archive.
  const item = value && typeof value === "object" ? value as Partial<Profile> : {};
  const companies = new Set<string>();
  if (Array.isArray(item.follows)) for (const id of item.follows) if (typeof id === "string") companies.add(id);
  if (Array.isArray(item.customFeeds)) for (const feed of item.customFeeds) {
    if (Array.isArray(feed?.companies)) for (const id of feed.companies) if (typeof id === "string") companies.add(id);
  }
  return sanitizeProfile(value, emptyProfile(), companies);
}

function ensureStorageBudget(profile: Profile) {
  if (JSON.stringify(profile).length > 480000) throw new Error("Your reading library is full. Download your reading data and remove older entries before adding more.");
}

function addActivity(profile: Profile, kind: "opens" | "saves"): Profile {
  const date = new Date().toISOString().slice(0, 10);
  const days = profile.activity.map((day) => ({ ...day, reads: day.reads ?? 0 }));
  const day = days.find((row) => row.date === date) ?? { date, count: 0, opens: 0, saves: 0, reads: 0 };
  day[kind] += 1;
  day.count = day.opens + day.saves + day.reads;
  if (!days.some((row) => row.date === date)) days.push(day);
  return { ...profile, activity: days.sort((a, b) => a.date.localeCompare(b.date)).slice(-400) };
}

export function useReadingProfile() {
  const authReady = useAuthReady();
  const authRequest = useAuthRequest();
  const accountId = useAccountId();
  const requireAccount = useRequireAccount();
  const [profile, setProfile] = useState<Profile>(() => emptyProfile());
  const [ready, setReady] = useState(false);
  const [identity, setIdentity] = useState<{ owner: string | null; verified: boolean }>({ owner: null, verified: false });
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");
  const [storageLabel, setStorageLabel] = useState("Loading your reading profile");
  const current = useRef<Profile>(emptyProfile());
  const isReady = useRef(false);
  const owner = useRef<string | null>(null);
  const storageWorks = useRef(true);
  const serverVersion = useRef(0);
  const accountGeneration = useRef(0);
  const revision = useRef(0);
  const dirty = useRef(false);
  const conflicted = useRef(false);
  const remote = useRef(false);
  const scheduleSave = useRef<() => void>(() => undefined);
  const persistCopy = useRef<() => void>(() => undefined);
  const retrySave = useRef<() => void>(() => undefined);
  const resolveCopy = useRef<(restore: boolean) => void>(() => undefined);
  const recoveryCopy = useRef<StoredProfile | null>(null);
  const [recovery, setRecovery] = useState<Profile | null>(null);
  const [pendingCustomize, setPendingCustomize] = useState(false);
  const [mutationError, setMutationError] = useState("");
  const [communityStatus, setCommunityStatus] = useState<"idle" | "synced" | "error">("idle");

  useEffect(() => {
    if (!authReady) return;
    let active = true;
    let saving = false;
    let retries = 0;
    let refreshing = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();
    const storageKey = () => owner.current ? `${PREFIX}${encodeURIComponent(owner.current)}` : null;

    function label(status: SyncStatus) {
      if (!active) return;
      const profileOwner = owner.current === ANONYMOUS ? null : owner.current;
      const verified = Boolean(remote.current && profileOwner);
      setIdentity((previous) => previous.owner === profileOwner && previous.verified === verified ? previous : { owner: profileOwner, verified });
      setSyncStatus(status);
      setStorageLabel(!storageWorks.current || !owner.current ? "Available in this session"
        : owner.current === ANONYMOUS ? "Sign in to save your reading"
          : status === "error" ? "Saved on this device · sync unavailable"
            : status === "synced" ? "Synced to your account" : "Saved on this device · syncing");
    }

    function readCopy(key: string, expectedOwner: string): StoredProfile | null {
      try {
        const raw = window.localStorage.getItem(key);
        if (!raw || raw.length > 500000) return null;
        const stored = JSON.parse(raw) as StoredProfile;
        if (stored.format !== 1 || stored.owner !== expectedOwner || !Number.isInteger(stored.serverVersion) || stored.serverVersion < 0) return null;
        return { ...stored, profile: validate(stored.profile), dirty: stored.dirty === true };
      } catch (error) {
        // Corrupted JSON is ignored. A browser storage denial switches to session memory.
        if (!(error instanceof SyntaxError) && error instanceof DOMException) storageWorks.current = false;
        return null;
      }
    }

    function persist() {
      const key = storageKey();
      if (!key || !storageWorks.current) return;
      try {
        const value: StoredProfile = { format: 1, owner: owner.current!, profile: current.current, serverVersion: serverVersion.current, generation: accountGeneration.current, dirty: dirty.current };
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch { storageWorks.current = false; }
    }
    persistCopy.current = persist;

    function queue(delay = 450) {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; void flush(); }, delay);
    }
    scheduleSave.current = () => { retries = 0; queue(); };
    retrySave.current = () => { retries = 0; if (conflicted.current) void refreshAccount(true); else if (remote.current) void flush(); else void initialize(); };

    async function flush() {
      if (!active || !isReady.current || !remote.current || conflicted.current || saving || !dirty.current) return;
      saving = true;
      const savedRevision = revision.current;
      const savedProfile = current.current;
      let succeeded = false;
      label("syncing");
      try {
        const response = await authRequest("/api/profile", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: savedProfile, version: serverVersion.current, generation: accountGeneration.current, owner: owner.current }),
          signal: controller.signal, credentials: "same-origin",
        });
        if (!active) return;
        if (response.status === 409) {
          try {
            const freshResp = await authRequest("/api/profile", { signal: controller.signal, cache: "no-store" });
            if (freshResp.ok) {
              const fresh = await freshResp.json() as { profile: Profile; version: number; generation?: number };
              serverVersion.current = fresh.version;
              accountGeneration.current = fresh.generation ?? 0;
              current.current = mergeProfiles(validate(fresh.profile), current.current);
              dirty.current = true;
              persist();
              queue(200);
              return;
            }
          } catch {}
          dirty.current = true;
          persist();
          label("error");
          return;
        }
        if (response.status === 401) remote.current = false;
        if (!response.ok) {
          const problem = await response.json().catch(() => ({})) as { error?: string };
          if (response.status < 500) retries = 3;
          throw new Error(problem.error || "Your changes could not be synced. Try again.");
        }
        const result = await response.json() as { profile: Profile; version: number; generation?: number; user?: { id: string }; stats?: Record<string, { reads: number; saves: number }> };
        if (!active) return;
        if (result.user?.id !== owner.current || !Number.isInteger(result.version) || result.version < 1) throw new Error("Profile identity changed");
        const normalized = validate(result.profile);
        serverVersion.current = result.version;
        accountGeneration.current = result.generation ?? 0;
        succeeded = true;
        retries = 0;
        setMutationError("");
        for (const [id, stats] of Object.entries(result.stats ?? {})) announceEngagement(id, stats);
        setCommunityStatus("synced");
        if (revision.current === savedRevision) {
          current.current = normalized;
          dirty.current = false;
          setProfile(normalized);
          persist();
          label("synced");
        } else {
          // A slower response must not replace a bookmark/edit made while it was in flight.
          persist();
          label("syncing");
        }
      } catch (error) {
        const message = error instanceof Error
          ? (error.message.includes("Failed to fetch") ? "Unable to reach the server. Your reading is saved on this device." : error.message)
          : "Your changes could not be synced.";
        if (active) { persist(); label("error"); setMutationError(message); }
      } finally {
        saving = false;
        if (active && !conflicted.current && remote.current && dirty.current) {
          if (succeeded || revision.current > savedRevision) queue();
          else if (retries < 3) queue(1000 * 2 ** retries++);
        }
      }
    }

function hasMeaningfulReadingData(p: Profile | null | undefined): boolean {
  if (!p) return false;
  return Boolean(
    (p.bookmarks && p.bookmarks.length > 0) ||
    (p.readLogs && p.readLogs.length > 0) ||
    (p.follows && p.follows.length > 0) ||
    (p.customFeeds && p.customFeeds.length > 0)
  );
}

function areProfilesEqual(a: Profile | null | undefined, b: Profile | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  if (!hasMeaningfulReadingData(a) && !hasMeaningfulReadingData(b) && (a.name || '') === (b.name || '') && (a.bio || '') === (b.bio || '')) return true;
  return (
    JSON.stringify(a.bookmarks) === JSON.stringify(b.bookmarks) &&
    JSON.stringify(a.readLogs) === JSON.stringify(b.readLogs) &&
    JSON.stringify(a.follows) === JSON.stringify(b.follows) &&
    JSON.stringify(a.customFeeds) === JSON.stringify(b.customFeeds) &&
    (a.name || '') === (b.name || '') &&
    (a.bio || '') === (b.bio || '')
  );}

function mergeProfiles(base: Profile, incoming: Profile): Profile {
  const bookmarks = Array.from(new Set([...(base.bookmarks || []), ...(incoming.bookmarks || [])]));
  const readLogMap = new Map<string, (typeof base.readLogs)[0]>();
  for (const log of [...(base.readLogs || []), ...(incoming.readLogs || [])]) {
    const existing = readLogMap.get(log.articleId);
    if (!existing || new Date(log.readAt).getTime() > new Date(existing.readAt).getTime()) {
      readLogMap.set(log.articleId, log);
    }
  }
  const readLogs = Array.from(readLogMap.values());
  const follows = Array.from(new Set([...(base.follows || []), ...(incoming.follows || [])]));
  const feedMap = new Map<string, (typeof base.customFeeds)[0]>();
  for (const feed of [...(base.customFeeds || []), ...(incoming.customFeeds || [])]) {
    if (!feedMap.has(feed.id)) {
      feedMap.set(feed.id, feed);
    }
  }
  const customFeeds = Array.from(feedMap.values());
  const ratingsMap = new Map<string, NonNullable<typeof base.recommendationFeedback>[0]>();
  for (const rating of [...(base.recommendationFeedback || []), ...(incoming.recommendationFeedback || [])]) {
    const existing = ratingsMap.get(rating.articleId);
    if (!existing || new Date(rating.at).getTime() > new Date(existing.at).getTime()) {
      ratingsMap.set(rating.articleId, rating);
    }
  }
  const recommendationFeedback = Array.from(ratingsMap.values()).slice(0, 500);

  return {
    ...base,
    bookmarks,
    readLogs,
    follows,
    customFeeds,
    recommendationFeedback,
    name: base.name || incoming.name || "",
    bio: base.bio || incoming.bio || "",
  };
}

    async function refreshAccount(preserve = false) {
      if (!active || !remote.current || refreshing) return;
      refreshing = true;
      const expectedOwner = owner.current;
      const before = revision.current;
      try {
        const response = await authRequest("/api/profile", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error("Could not check your account. Try again when you’re online.");
        const result = await response.json() as { profile: Profile; version: number; generation?: number; user?: { id: string } };
        if (!active || owner.current !== expectedOwner || result.user?.id !== expectedOwner) return;
        if (!Number.isInteger(result.version) || result.version < 0) throw new Error("Invalid account version");
        if (!preserve && result.version === serverVersion.current && (result.generation ?? 0) === accountGeneration.current) return;
        if (revision.current !== before || (dirty.current && !preserve)) { void flush(); return; }
        if (preserve && dirty.current && (result.generation ?? 0) === accountGeneration.current) {
          if (hasMeaningfulReadingData(current.current) && !areProfilesEqual(current.current, result.profile)) {
            current.current = mergeProfiles(validate(result.profile), current.current);
            serverVersion.current = result.version;
            accountGeneration.current = result.generation ?? 0;
            dirty.current = true;
            persist();
            queue(200);
            return;
          }
        }
        current.current = validate(result.profile);
        serverVersion.current = result.version;
        accountGeneration.current = result.generation ?? 0;
        dirty.current = false;
        conflicted.current = false;
        setProfile(current.current);
        persist();
        label("synced");
        const key = storageKey();
        if (key) { try { window.localStorage.removeItem(`${key}:unsynced`); } catch {} }
      } catch (error) {
        const message = error instanceof Error
          ? (error.message.includes("Failed to fetch") ? "Unable to reach the server. Your reading is saved on this device." : error.message)
          : "Account check failed.";
        if (active) { label("error"); setMutationError(message); }
      }
      finally { refreshing = false; }
    }

    resolveCopy.current = () => {
      recoveryCopy.current = null;
      setRecovery(null);
      const key = storageKey();
      if (key) { try { window.localStorage.removeItem(`${key}:unsynced`); } catch {} }
    };

    async function initialize() {
      try {
        if (accountId === null) {
          // Signed-out visits do not create or restore a synthetic reader profile.
          owner.current = ANONYMOUS;
          remote.current = false;
          dirty.current = false;
          current.current = emptyProfile();
          label("local");
          return;
        }
        const response = await authRequest("/api/profile", { signal: controller.signal, credentials: "same-origin", cache: "no-store" });
        if (!active) return;
        if (response.status === 401) {
          owner.current = ANONYMOUS;
          const local = readCopy(`${PREFIX}${ANONYMOUS}`, ANONYMOUS);
          current.current = local?.profile ?? emptyProfile();
          remote.current = false;
          dirty.current = false;
          persist();
          label("local");
        } else {
          if (!response.ok) throw new Error("Account profile unavailable");
          const result = await response.json() as { profile: Profile; version: number; generation?: number; user?: { id: string } };
          if (!active) return;
          if (typeof result.user?.id !== "string" || !result.user.id || result.user.id.length > 250 || !Number.isInteger(result.version) || result.version < 0) throw new Error("Invalid account profile");
          owner.current = result.user.id;
          const key = storageKey()!;
          const local = readCopy(key, owner.current);
          const serverProfile = validate(result.profile);
          serverVersion.current = result.version;
          accountGeneration.current = result.generation ?? 0;
          remote.current = true;
          try { window.localStorage.removeItem(`${key}:unsynced`); } catch {}

          if (local?.dirty && (local.generation ?? 0) === accountGeneration.current && hasMeaningfulReadingData(local.profile) && !areProfilesEqual(local.profile, serverProfile)) {
            const merged = mergeProfiles(serverProfile, local.profile);
            current.current = merged;
            dirty.current = true;
            persist();
            label("syncing");
            queue();
          } else if (local?.dirty && local.serverVersion === result.version && (local.generation ?? 0) === accountGeneration.current) {
            current.current = local.profile;
            dirty.current = true;
            persist();
            label("syncing");
            queue();
          } else {
            current.current = serverProfile;
            dirty.current = false;
            persist();
            label("synced");
          }
        }
      } catch {
        if (!active) return;
        // Without a confirmed identity, do not expose any previously signed-in account's cache.
        owner.current = null;
        remote.current = false;
        storageWorks.current = false;
        current.current = emptyProfile();
        label("error");
      } finally {
        if (active) {
          if (remote.current && !recoveryCopy.current) {
            const intent = takeIntent();
            if (intent?.kind === "customize") setPendingCustomize(true);
            else if (intent) {
              try { const next = validate(applyIntent(current.current, intent)); ensureStorageBudget(next); current.current = next; dirty.current = true; persist(); label("syncing"); queue(); }
              catch (error) { setMutationError(error instanceof Error ? error.message : "Finish your action again."); }
            }
          }
          isReady.current = true; setProfile(current.current); setReady(true);
        }
      }
    }
    void initialize();
    const reconnect = () => { retries = 0; if (dirty.current) void flush(); else if (remote.current) void refreshAccount(); else void initialize(); };
    const changedElsewhere = (event: StorageEvent) => { if (event.key === storageKey()) reconnect(); };
    window.addEventListener("online", reconnect);
    window.addEventListener("focus", reconnect);
    window.addEventListener("storage", changedElsewhere);
    return () => {
      window.removeEventListener("online", reconnect);
      window.removeEventListener("focus", reconnect);
      window.removeEventListener("storage", changedElsewhere);
      retrySave.current = () => undefined;
      resolveCopy.current = () => undefined;
      active = false;
      isReady.current = false;
      if (timer) clearTimeout(timer);
      // The synchronous device copy is already current even if a save was still pending.
      controller.abort();
      scheduleSave.current = () => undefined;
      persistCopy.current = () => undefined;
    };
  }, [authReady, authRequest, accountId]);

  const commit = useCallback((next: Profile) => {
    if (!isReady.current) return false;
    if (!owner.current) { setMutationError("Your account has not loaded. Try syncing again before making changes."); return false; }
    try {
      const validated = validate(next);
      ensureStorageBudget(validated);
      setMutationError("");
      current.current = validated;
      revision.current += 1;
      dirty.current = remote.current || owner.current !== ANONYMOUS;
      setProfile(validated);
      persistCopy.current();
      if (!storageWorks.current || !owner.current) setStorageLabel("Available in this session");
      else if (owner.current === ANONYMOUS) setStorageLabel("Saved on this device");
      else if (!remote.current) setStorageLabel("Saved on this device · sync unavailable");
      else setStorageLabel("Saved on this device · syncing");
      setSyncStatus(!remote.current && owner.current !== ANONYMOUS ? "error" : remote.current ? "syncing" : "local");
      if (remote.current) scheduleSave.current();
      return true;
    } catch (error) {
      setMutationError(error instanceof Error ? error.message : "Your change could not be saved.");
      return false;
    }
  }, []);

  const updateProfile = useCallback((patch: Partial<Profile>) => {
    return isReady.current && requireAccount() ? commit({ ...current.current, ...patch }) : false;
  }, [commit, requireAccount]);


  const recordOpen = useCallback((article: Article) => {
    if (isReady.current && owner.current && owner.current !== ANONYMOUS && article.id) commit(addActivity({ ...current.current, lastOpened: { articleId: article.id, openedAt: new Date().toISOString() } }, "opens"));
  }, [commit]);

  const toggleBookmark = useCallback((article: Article) => {
    if (!requireAccount({ kind: "bookmark", id: article.id, active: !current.current.bookmarks.includes(article.id) })) return false;
    if (!isReady.current) return false;
    const existing = current.current;
    const saved = existing.bookmarks.includes(article.id);
    const next = { ...existing, bookmarks: saved ? existing.bookmarks.filter((id) => id !== article.id) : [...existing.bookmarks, article.id] };
    return commit(saved ? next : addActivity(next, "saves"));
  }, [commit, requireAccount]);

  // Read status is explicitly reported by the reader, independently of link opens.
  const toggleReadLog = useCallback((article: Article) => {
    if (!requireAccount({ kind: "read", id: article.id, active: !current.current.readLogs.some(log => log.articleId === article.id) })) return false;
    if (!isReady.current) return false;
    try { return commit(toggleProfileReadLog(current.current, article.id)); }
    catch (error) { setMutationError(error instanceof Error ? error.message : "Your reading log could not be updated."); return false; }
  }, [commit, requireAccount]);

  const rateRecommendation = useCallback((article: Article, value: "useful" | "not-relevant") => {
    if (!requireAccount({ kind: "feedback", id: article.id, active: true, value })) return false;
    if (!isReady.current) return false;
    const ratings = current.current.recommendationFeedback ?? [];
    const previous = ratings.find(item => item.articleId === article.id);
    const rest = ratings.filter(item => item.articleId !== article.id);
    commit({ ...current.current, recommendationFeedback: (previous?.value === value ? rest : [{articleId:article.id,value,at:new Date().toISOString()},...rest]).slice(0,500) });
  }, [commit,requireAccount]);

  const dismissCustomize = useCallback(() => setPendingCustomize(false), []);
  return { profile, ready, storageLabel, syncStatus, communityStatus, mutationError, recovery, pendingCustomize, dismissCustomize,
    retrySync: () => retrySave.current(), resolveRecovery: (restore: boolean) => resolveCopy.current(restore), profileOwner: identity.owner, accountVerified: identity.verified, updateProfile, recordOpen, toggleBookmark, toggleReadLog, rateRecommendation };
}
