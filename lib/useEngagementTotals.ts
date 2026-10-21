"use client";

import { useEffect, useState } from "react";
import type { Article } from "./types";
import { COMMUNITY_EVENT, type CommunityTotals } from "./community-events";

export function useEngagementTotals(articles: Article[]) {
  const [live, setLive] = useState<Record<string, CommunityTotals>>({});
  const idsKey = [...new Set(articles.map(article => article.id))].sort().join(",");
  const needsInitialRefresh = articles.some(article => !article.engagement);

  useEffect(() => {
    if (!idsKey) return;
    const controller = new AbortController();
    let sequence = 0;
    const refresh = async () => {
      if (document.visibilityState === "hidden") return;
      const current = ++sequence;
      try {
        const ids = idsKey.split(",");
        const batches = await Promise.all(Array.from({ length: Math.ceil(ids.length / 100) }, async (_, index) => {
          const response = await fetch(`/api/engagement?${new URLSearchParams({ids:ids.slice(index*100,index*100+100).join(",")})}`, {cache:"no-store",signal:controller.signal});
          if (!response.ok) throw new Error("Community totals unavailable");
          return (await response.json() as {stats:Record<string,CommunityTotals>}).stats;
        }));
        if (!controller.signal.aborted && current === sequence) setLive(previous => Object.assign({}, previous, ...batches));
      } catch { /* Keep the last confirmed totals readable during a network failure. */ }
    };
    const changed = (event: Event) => {
      const detail = (event as CustomEvent<{articleId:string;stats:CommunityTotals}>).detail;
      if (!detail?.stats || !idsKey.split(",").includes(detail.articleId)) return;
      sequence += 1; // A response started before this action must not overwrite its confirmed totals.
      setLive(previous => ({...previous,[detail.articleId]:detail.stats}));
    };
    // Ranked pages already carry confirmed totals; refresh them on events and the timer.
    if (needsInitialRefresh) void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    window.addEventListener(COMMUNITY_EVENT,changed);
    window.addEventListener("focus",refresh);
    document.addEventListener("visibilitychange",refresh);
    return () => { controller.abort(); window.clearInterval(timer); window.removeEventListener(COMMUNITY_EVENT,changed); window.removeEventListener("focus",refresh); document.removeEventListener("visibilitychange",refresh); };
  },[idsKey, needsInitialRefresh]);

  return Object.fromEntries(articles.map(article => [article.id,live[article.id] ?? article.engagement]));
}
