import type { Profile } from './types.ts';
import { toggleReadLog } from './server/core.ts';

export type ReadingIntent = { kind: 'bookmark' | 'read' | 'follow' | 'feedback' | 'customize'; id: string; active: boolean; value?: 'useful' | 'not-relevant' };
const KEY = 'readwell:pending-reading-action';
export function rememberIntent(intent: ReadingIntent) {
  try { window.sessionStorage.setItem(KEY, JSON.stringify({ ...intent, at: Date.now() })); } catch { /* Returning to the original control still works. */ }
}
export function takeIntent(): ReadingIntent | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    window.sessionStorage.removeItem(KEY);
    const item = JSON.parse(raw);
    if (!['bookmark', 'read', 'follow', 'feedback', 'customize'].includes(item.kind) || typeof item.id !== 'string' || !/^[\w-]{1,80}$/.test(item.id) || typeof item.active !== 'boolean' || !Number.isFinite(item.at) || item.at > Date.now() || Date.now() - item.at > 10 * 60 * 1000) return null;
    if (item.kind === 'feedback' && !['useful', 'not-relevant'].includes(item.value)) return null;
    return item;
  } catch { return null; }
}
export function applyIntent(profile: Profile, intent: ReadingIntent): Profile {
  if (intent.kind === 'customize') return profile;
  const change = (list: string[]) => intent.active ? [...new Set([...list, intent.id])] : list.filter(id => id !== intent.id);
  if (intent.kind === 'bookmark') return { ...profile, bookmarks: change(profile.bookmarks) };
  if (intent.kind === 'follow') return { ...profile, follows: change(profile.follows) };
  if (intent.kind === 'read') return profile.readLogs.some(log => log.articleId === intent.id) === intent.active ? profile : toggleReadLog(profile, intent.id);
  return { ...profile, recommendationFeedback: [
    ...(intent.active && intent.value ? [{ articleId: intent.id, value: intent.value, at: new Date().toISOString() }] : []),
    ...(profile.recommendationFeedback ?? []).filter(row => row.articleId !== intent.id),
  ].slice(0, 500) };
}
