-- Add public engineering/developer publications without changing existing content or profiles.
INSERT INTO companies(id,name,blog_url) VALUES
  ('linear','Linear','https://linear.app/now'),
  ('planetscale','PlanetScale','https://planetscale.com/blog'),
  ('posthog','PostHog','https://posthog.com/blog')
ON CONFLICT(id) DO UPDATE SET name=excluded.name,blog_url=excluded.blog_url;

INSERT INTO sources(id,company_id,mode,blog_url,feed_urls,include_url_regex,exclude_url_regex) VALUES
  ('linear','linear','feed','https://linear.app/now','["https://linear.app/rss/now.xml"]',NULL,NULL),
  ('planetscale','planetscale','feed','https://planetscale.com/blog','["https://planetscale.com/blog/feed.atom"]',NULL,NULL),
  ('posthog','posthog','feed','https://posthog.com/blog','["https://posthog.com/rss.xml"]','^https://posthog\.com/blog/[^/?#]+',NULL)
ON CONFLICT(id) DO UPDATE SET mode=excluded.mode,blog_url=excluded.blog_url,feed_urls=excluded.feed_urls,
  include_url_regex=excluded.include_url_regex,exclude_url_regex=excluded.exclude_url_regex;
