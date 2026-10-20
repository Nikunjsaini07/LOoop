export type CommunityTotals = { reads: number; saves: number };
export const COMMUNITY_EVENT = "readzz:community-updated";

export function announceEngagement(articleId: string, stats: CommunityTotals) {
  if (typeof window !== "undefined" && typeof window.dispatchEvent === "function") {
    window.dispatchEvent(new CustomEvent(COMMUNITY_EVENT, { detail: { articleId, stats } }));
  }
}
