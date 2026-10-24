import BlogReader from '@/components/BlogReader';
import { backendFetch, loadFeed } from '../backend';
import { readingLocation } from '../reading-location';
import type { Source } from '../types';

type ReaderView = 'home' | 'trending' | 'profile';

export async function renderReader(initialView: ReaderView, search: Record<string, string | string[] | undefined> = {}) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) if (typeof value === 'string') params.set(key, value);
  const location = readingLocation(params);
  if (initialView === 'profile') {
    let sourcesList: Source[] = [];
    try {
      const response = await backendFetch('/api/sources');
      if (response.ok) {
        const result = (await response.json()) as { sources: Source[] };
        sourcesList = result.sources || [];
      }
    } catch {
      // Keep resilient even during startup
    }
    const snapshot = new Date().toISOString();
    return <BlogReader initialLocation={location} initialView="profile" initial={{ articles: [], sources: sourcesList, total: 0, hasMore: false, nextCursor: null, snapshot, updatedAt: snapshot }} />;
  }
  const query = new URLSearchParams({ pageSize: '12', page: String(location.page), period: location.period,
    mode: initialView === 'trending' ? 'trending' : ['latest', 'following'].includes(location.feed) ? location.feed : 'personal' });
  if (location.q) query.set('q', location.q);
  if (location.company) query.set('company', location.company);
  if (location.topic) query.set('topic', location.topic);
  if (initialView === 'home' && location.signal !== 'All') query.set('signal', location.signal);
  // Account editions are restored by the client using a verified Clerk token.
  // Public rendering must never request another reader's private edition.
  if (location.feed === 'following' || !['personal', 'latest', 'following'].includes(location.feed)) query.set('company', '__none__');
  const initial = await loadFeed(query);
  return <BlogReader initialLocation={location} initialView={initialView} initial={initial} />;
}
