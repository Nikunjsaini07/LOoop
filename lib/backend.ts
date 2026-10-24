import type { Article, ArticlePage, Source } from './types';
import type { CompanyDirectory } from './company-types';
import seedData from './server/seed.json';
import { aggregateCompanyArchive } from './server/companies';
import { handleDirectApi } from './server/direct-api';

// This module is imported by server components and route handlers only.
export function backendSettings(settings = process.env) {
  const value = settings.READWELL_API_URL;
  const secret = settings.READWELL_PROXY_SECRET;
  if (!value) return null;
  if (!secret || secret.length < 32) throw new Error('Set READWELL_API_URL and READWELL_PROXY_SECRET on the Vercel project.');
  const url = new URL(value);
  const local = !settings.VERCEL && ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('READWELL_API_URL must be the HTTPS origin of your Cloudflare API Worker.');
  }
  return { origin: url.origin, secret };
}

export async function backendFetch(path: string, init: RequestInit = {}): Promise<Response> {
  if (!path.startsWith('/api/') || path.includes('\\') || path.includes('#')) throw new Error('Invalid backend path');

  const settings = backendSettings();

  // If no external worker is configured, handle directly in-process without network hops.
  if (!settings) {
    const localOrigin = process.env.APP_ORIGIN || 'http://127.0.0.1:5173';
    const url = new URL(path, localOrigin);
    const request = new Request(url, {
      ...init,
      headers: new Headers(init.headers),
    });
    return handleDirectApi(request);
  }

  const { origin, secret } = settings;
  const url = new URL(path, origin);
  if (url.origin !== origin || !url.pathname.startsWith('/api/')) throw new Error('Invalid backend path');
  const headers = new Headers(init.headers);
  headers.set('X-Readwell-Proxy-Secret', secret);
  const isPublicGet = (!init.method || init.method === 'GET') && !headers.has('Authorization');
  return fetch(url, {
    ...init,
    headers,
    redirect: 'manual',
    signal: init.signal ?? AbortSignal.timeout(25000),
    ...(isPublicGet ? { next: { revalidate: 180 } } : { cache: 'no-store' }),
  });
}

export async function backendJson<T>(path: string): Promise<T> {
  const response = await backendFetch(path);
  if (!response.ok) throw new Error(`The article service is unavailable (${response.status}).`);
  return response.json() as Promise<T>;
}

export async function loadCompanyDirectory(): Promise<CompanyDirectory> {
  try {
    return await backendJson<CompanyDirectory>('/api/companies');
  } catch {
    return aggregateCompanyArchive(seedData.sources as Source[], seedData.articles as Article[], seedData.updatedAt);
  }
}

export async function loadFeed(params: URLSearchParams): Promise<ArticlePage> {
  try {
    return await backendJson<ArticlePage>(`/api/articles?${params}`);
  } catch {
    const snapshot = new Date().toISOString();
    return {
      articles: seedData.articles as Article[],
      sources: seedData.sources as Source[],
      total: (seedData.articles as Article[]).length,
      hasMore: false,
      nextCursor: null,
      snapshot,
      updatedAt: seedData.updatedAt,
      rankingBasis: 'freshness',
      rankingVersion: 3,
      contentVersion: '0',
      topicCatalog: [],
      page: 1,
      pageSize: 24,
      totalPages: 1,
    };
  }
}

export async function loadArticle(id: string): Promise<Article | null> {
  try {
    const response = await backendFetch(`/api/articles/${encodeURIComponent(id)}`);
    if (response.status === 404) return null;
    if (!response.ok) throw new Error('The article archive is temporarily unavailable.');
    return response.json() as Promise<Article>;
  } catch {
    const fallback = (seedData.articles as Article[]).find((a) => a.id === id) ?? null;
    return fallback ? { ...fallback, stale: true } : null;
  }
}
