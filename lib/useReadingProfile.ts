"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Article, Profile } from "./types";
import { emptyProfile, sanitizeProfile, toggleReadLog as toggleProfileReadLog } from "./server/core";
import { announceEngagement } from "./community-events";

type SyncStatus = "local" | "syncing" | "synced" | "error";
type StoredProfile = { format: 1; owner: string; profile: Profile; serverVersion: number; dirty: boolean };
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
  const [profile, setProfile] = useState<Profile>(() => emptyProfile());
  const [ready, setReady] = useState(false);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");
  const [storageLabel, setStorageLabel] = useState("Loading your reading profile");
  const current = useRef<Profile>(emptyProfile());
  const isReady = useRef(false);
  const owner = useRef<string | null>(null);
  const storageWorks = useRef(true);
  const serverVersion = useRef(0);
  const revision = useRef(0);
  const dirty = useRef(false);
  const conflicted = useRef(false);
  const remote = useRef(false);
  const scheduleSave = useRef<() => void>(() => undefined);
  const persistCopy = useRef<() => void>(() => undefined);
  const communityQueue = useRef<Promise<unknown>>(Promise.resolve());
  const [communityStatus, setCommunityStatus] = useState<"idle" | "synced" | "error">("idle");

  useEffect(() => {
    let active = true;
    let saving = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const controller = new AbortController();
    const storageKey = () => owner.current ? `${PREFIX}${encodeURIComponent(owner.current)}` : null;

    function label(status: SyncStatus) {
      if (!active) return;
      setSyncStatus(status);
      setStorageLabel(!storageWorks.current || !owner.current ? "Available in this session"
        : owner.current === ANONYMOUS ? "Saved on this device"
          : conflicted.current ? "Device copy · account sync conflict"
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
        const value: StoredProfile = { format: 1, owner: owner.current!, profile: current.current, serverVersion: serverVersion.current, dirty: dirty.current };
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch { storageWorks.current = false; }
    }
    persistCopy.current = persist;

    function queue() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { timer = null; void flush(); }, 450);
    }
    scheduleSave.current = queue;

    async function flush() {
      if (!active || !isReady.current || !remote.current || conflicted.current || saving || !dirty.current) return;
      saving = true;
      const savedRevision = revision.current;
      const savedProfile = current.current;
      let succeeded = false;
      label("syncing");
      try {
        const response = await fetch("/api/profile", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ profile: savedProfile, version: serverVersion.current, owner: owner.current }),
          signal: controller.signal, credentials: "same-origin",
        });
        if (!active) return;
        if (response.status === 409) {
          // Keep this account's device copy; do not retry with a newly fetched version.
          conflicted.current = true;
          persist();
          label("error");
          return;
        }
        if (response.status === 401) remote.current = false;
        if (!response.ok) throw new Error("Profile sync failed");
        const result = await response.json() as { profile: Profile; version: number; user?: { id: string } };
        if (!active) return;
        if (result.user?.id !== owner.current || !Number.isInteger(result.version) || result.version < 1) throw new Error("Profile identity changed");
        const normalized = validate(result.profile);
        serverVersion.current = result.version;
        succeeded = true;
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
      } catch {
        if (active) { persist(); label("error"); }
      } finally {
        saving = false;
        if (active && !conflicted.current && remote.current && dirty.current && (succeeded || revision.current > savedRevision)) queue();
      }
    }

    async function initialize() {
      try {
        const response = await fetch("/api/profile", { signal: controller.signal, credentials: "same-origin", cache: "no-store" });
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
          const result = await response.json() as { profile: Profile; version: number; user?: { id: string } };
          if (!active) return;
          if (typeof result.user?.id !== "string" || !result.user.id || result.user.id.length > 250 || !Number.isInteger(result.version) || result.version < 0) throw new Error("Invalid account profile");
          owner.current = result.user.id;
          const key = storageKey()!;
          const local = readCopy(key, owner.current);
          const serverProfile = validate(result.profile);
          serverVersion.current = result.version;
          remote.current = true;
          // An interrupted navigation can cancel a queued save. Resume only the confirmed
          // owner's device copy based on exactly this server version; CAS still guards it.
          if (local?.dirty && local.serverVersion === result.version) {
            current.current = local.profile;
            dirty.current = true;
            persist();
            label("syncing");
            queue();
          } else {
            // A changed server version wins. Keep the pending copy separately without replay.
            let retained = false;
            if (local?.dirty) {
              try { window.localStorage.setItem(`${key}:unsynced`, JSON.stringify(local)); retained = true; }
              catch { storageWorks.current = false; }
            }
            current.current = serverProfile;
            dirty.current = false;
            persist();
            label("synced");
            if (retained && active) { setSyncStatus("error"); setStorageLabel("Account loaded · unsynced device copy retained"); }
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
        if (active) { isReady.current = true; setProfile(current.current); setReady(true); }
      }
    }
    void initialize();
    return () => {
      active = false;
      isReady.current = false;
      if (timer) clearTimeout(timer);
      // The synchronous device copy is already current even if a save was still pending.
      controller.abort();
      scheduleSave.current = () => undefined;
      persistCopy.current = () => undefined;
    };
  }, []);

  const commit = useCallback((next: Profile) => {
    if (!isReady.current) return;
    try {
      const validated = validate(next);
      current.current = validated;
      revision.current += 1;
      dirty.current = remote.current || owner.current !== ANONYMOUS;
      setProfile(validated);
      persistCopy.current();
      if (!storageWorks.current || !owner.current) setStorageLabel("Available in this session");
      else if (owner.current === ANONYMOUS) setStorageLabel("Saved on this device");
      else if (conflicted.current) setStorageLabel("Device copy · account sync conflict");
      else if (!remote.current) setStorageLabel("Saved on this device · sync unavailable");
      else setStorageLabel("Saved on this device · syncing");
      setSyncStatus(conflicted.current || (!remote.current && owner.current !== ANONYMOUS) ? "error" : remote.current ? "syncing" : "local");
      if (remote.current && !conflicted.current) scheduleSave.current();
    } catch { setSyncStatus("error"); }
  }, []);

  const updateProfile = useCallback((patch: Partial<Profile>) => {
    if (isReady.current) commit({ ...current.current, ...patch });
  }, [commit]);

  const shareAction = useCallback((articleId: string, kind: "read" | "save", active: boolean) => {
    if (!isReady.current || !owner.current || (owner.current !== ANONYMOUS && (!remote.current || conflicted.current))) return;
    const expectedOwner = owner.current;
    communityQueue.current = communityQueue.current.catch(() => undefined).then(async () => {
      if (owner.current !== expectedOwner || (expectedOwner !== ANONYMOUS && !remote.current)) return;
      const response = await fetch("/api/engagement", { method: "POST", credentials: "same-origin", keepalive: true,
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner: expectedOwner===ANONYMOUS?null:expectedOwner, articleId, kind, active }) });
      if (!response.ok) throw new Error("Community activity could not be synced");
      const result = await response.json() as {stats?:{reads:number;saves:number}};
      if (result.stats && owner.current===expectedOwner) announceEngagement(articleId,result.stats);
      setCommunityStatus("synced");
    }).catch(() => { if (owner.current === expectedOwner) setCommunityStatus("error"); });
  }, []);

  const recordOpen = useCallback((article: Article) => {
    if (isReady.current && article.id) commit(addActivity(current.current, "opens"));
  }, [commit]);

  const toggleBookmark = useCallback((article: Article) => {
    if (!isReady.current) return;
    const existing = current.current;
    const saved = existing.bookmarks.includes(article.id);
    const next = { ...existing, bookmarks: saved ? existing.bookmarks.filter((id) => id !== article.id) : [...existing.bookmarks, article.id] };
    commit(saved ? next : addActivity(next, "saves"));
    shareAction(article.id, "save", !saved);
  }, [commit, shareAction]);

  // Read status is explicitly reported by the reader, independently of link opens.
  const toggleReadLog = useCallback((article: Article) => {
    if (!isReady.current) return;
    try { const wasRead = current.current.readLogs.some(log => log.articleId === article.id); commit(toggleProfileReadLog(current.current, article.id)); shareAction(article.id, "read", !wasRead); }
    catch (error) { setSyncStatus("error"); throw error; }
  }, [commit, shareAction]);

  return { profile, ready, storageLabel, syncStatus, communityStatus, profileOwner: owner.current === ANONYMOUS ? null : owner.current, accountVerified: Boolean(remote.current && owner.current && owner.current !== ANONYMOUS), updateProfile, recordOpen, toggleBookmark, toggleReadLog };
}
