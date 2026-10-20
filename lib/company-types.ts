import type { Article } from "./types";

export type CompanySummary = {
  id: string;
  name: string;
  blogUrl: string;
  blogCount: number;
  followers: number;
  bookmarks: number;
  readLogs: number;
  topics: string[];
  latestArticle: Article | null;
};

export type CompanyDirectory = {
  companies: CompanySummary[];
  updatedAt: string;
  /** False means public counts are unavailable, rather than confirmed zero. */
  communityAvailable: boolean;
};
