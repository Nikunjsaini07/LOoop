import type { Article, ArticlePage } from './types';
import type { CompanyDirectory } from './company-types';

// This module is imported by server components and route handlers only.
export function backendSettings(settings = process.env) {
  const value = settings.READWELL_API_URL;
  const secret = settings.READWELL_PROXY_SECRET;
  if (!value || !secret || secret.length < 32) throw new Error('Set READWELL_API_URL and READWELL_PROXY_SECRET on the Vercel project.');
  const url = new URL(value);
  const local = !settings.VERCEL && ['localhost', '127.0.0.1'].includes(url.hostname);
  if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('READWELL_API_URL must be the HTTPS origin of your Cloudflare API Worker.');
  }
  return { origin: url.origin, secret };
}

export async function backendFetch(path: string, init: RequestInit = {}) {
  if (!path.startsWith('/api/') || path.includes('\\') || path.includes('#')) throw new Error('Invalid backend path');
  const { origin, secret } = backendSettings();
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

export const loadCompanyDirectory = () => backendJson<CompanyDirectory>('/api/companies');
export const loadFeed = (params: URLSearchParams) => backendJson<ArticlePage>(`/api/articles?${params}`);
export async function loadArticle(id: string): Promise<Article | null> {
  const response = await backendFetch(`/api/articles/${encodeURIComponent(id)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error('The article archive is temporarily unavailable.');
  return response.json() as Promise<Article>;
}
