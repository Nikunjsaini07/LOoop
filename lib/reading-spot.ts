import type { Profile } from './types';

/** Reading history wins over suggestions, even before its article is loaded. */
export function readingSpot(profile: Profile): { articleId: string; kind: 'read' | 'opened' | 'saved'; at?: string } | null {
  const lastRead = profile.readLogs.reduce<Profile['readLogs'][number] | undefined>((latest, log) => !latest || Date.parse(log.readAt) > Date.parse(latest.readAt) ? log : latest, undefined);
  const opened = profile.lastOpened;
  if (opened && (!lastRead || Date.parse(opened.openedAt) > Date.parse(lastRead.readAt))) return { articleId: opened.articleId, kind: 'opened', at: opened.openedAt };
  if (lastRead) return { articleId: lastRead.articleId, kind: 'read', at: lastRead.readAt };
  const articleId = profile.bookmarks.at(-1);
  return articleId ? { articleId, kind: 'saved' } : null;
}
