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
  activity: ActivityDay[];
};

export type ArticlePage = {
  articles: Article[];
  sources: Source[];
  total: number;
  hasMore: boolean;
  nextCursor: string | null;
  snapshot: string;
  updatedAt: string;
};

export const TOPICS = [
  "AI & ML", "Systems", "Data", "Infrastructure", "Security", "Frontend", "Mobile", "Product",
] as const;
