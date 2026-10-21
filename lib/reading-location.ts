export type ReadingLocation = {
  feed: string; q: string; company: string; topic: string; signal: string;
  period: 'today' | 'week' | 'archive'; page: number; edition: string;
};
export function readingLocation(params = new URLSearchParams()): ReadingLocation {
  const page = Number(params.get('page') || 1);
  const edition = params.get('edition') || '';
  return {
    feed: (params.get('feed') || 'personal').slice(0, 80), q: (params.get('q') || '').trim().slice(0, 200),
    company: (params.get('company') || '').slice(0, 80), topic: (params.get('topic') || '').slice(0, 80),
    signal: (params.get('signal') || 'All').slice(0, 80),
    period: params.get('period') === 'week' ? 'week' : params.get('period') === 'archive' ? 'archive' : 'today',
    page: Number.isInteger(page) && page > 0 && page <= 100000 ? page : 1,
    edition: /^[\da-f-]{36}$/i.test(edition) ? edition : '',
  };
}
export function readingParams(location: ReadingLocation, trending = false) {
  const params = new URLSearchParams();
  if (trending) { if (location.period !== 'today') params.set('period', location.period); }
  else {
    if (location.feed !== 'personal') params.set('feed', location.feed);
    for (const key of ['q', 'company', 'topic'] as const) if (location[key]) params.set(key, location[key]);
    if (location.signal !== 'All') params.set('signal', location.signal);
  }
  if (location.page > 1) params.set('page', String(location.page));
  if (location.edition) params.set('edition', location.edition);
  return params;
}
export function articlePath(id: string, returnTo: string) {
  return `/articles/${encodeURIComponent(id)}?return_to=${encodeURIComponent(returnTo)}`;
}
