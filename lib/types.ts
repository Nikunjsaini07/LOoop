export type Article = {
  id: string;
  company_id: string;
  company: string;
  title: string;
  url: string;
  summary: string;
  published_at: string | null;
  discovered_at: string;
  topics: string[];
  recommendationReason?: string;
  recommendationLane?: "recent" | "archive" | "discovery";
  engagement?: { reads: number; saves: number };
  windowEngagement?: { reads: number; saves: number };
  discovery?: boolean;
  stale?: boolean;
};

export type Source = {
  id: string;
  company: string;
  blog_url: string;
  feed_urls: string[];
  notes: string;
  mode: "feed" | "listing" | "manual";
  include_url_regex?: string;
  exclude_url_regex?: string;
};

export type CustomFeed = {
  id: string;
  name: string;
  companies: string[];
  topics: string[];
  exclude: string[];
};

export type ActivityDay = {
  date: string;
  count: number;
  opens: number;
  saves: number;
  reads: number;
};

/** An explicit user report; opening the publisher's link does not create a read log. */
export type ReadLog = {
  articleId: string;
  readAt: string;
};

export type Profile = {
  name: string;
  bio: string;
  follows: string[];
  interests: string[];
  customFeeds: CustomFeed[];
  bookmarks: string[];
  readLogs: ReadLog[];
  lastOpened?: { articleId: string; openedAt: string };
  activity: ActivityDay[];
  recommendationFeedback?: { articleId: string; value: "useful" | "not-relevant"; at: string }[];
};

export type ArticlePage = {
  articles: Article[];
  degraded?: boolean;
  sources: Source[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
  snapshot: string;
  updatedAt: string;
  rankingBasis?: "personal" | "engagement" | "freshness" | "latest";
  rankingVersion?: number;
  contentVersion?: string;
  topicCatalog?: { id: string; name: string; parent_id: string | null }[];
  page?: number;
  pageSize?: number;
  totalPages?: number;
  edition?: string;
  communitySummary?: { reads: number; saves: number; stories: number; companies: number };
};

export { TOPICS } from "./topics";
