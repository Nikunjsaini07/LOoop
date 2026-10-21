import type { Article } from '../lib/types';

type Handler = (request: Request) => Promise<Response>;
type Routes = Record<string, { GET?: Handler; POST?: Handler; DELETE?: Handler }>;

async function matchesSecret(actual: string | null, expected: string) {
  if (!actual || actual.length > 512) return false;
  const digest = (value: string) => crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  const [left, right] = await Promise.all([digest(actual), digest(expected)]);
  const a = new Uint8Array(left), b = new Uint8Array(right);
  let difference = 0;
  for (let index = 0; index < a.length; index++) difference |= a[index] ^ b[index];
  return difference === 0;
}

export async function dispatchApi(request: Request, routes: Routes, secret: string | undefined, loadArticle: (id: string) => Promise<Article | null>) {
  const path = new URL(request.url).pathname;
  const error = (message: string, status: number) => Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });
  // Clerk signs its webhook independently. Every other endpoint is Vercel-only.
  if (path !== '/api/webhooks/clerk') {
    if (!secret || secret.length < 32) return error('The API connection is not configured.', 503);
    if (!await matchesSecret(request.headers.get('x-readwell-proxy-secret'), secret)) return error('Unauthorized API connection', 401);
  }
  const detail = path.match(/^\/api\/articles\/([^/]+)$/);
  if (detail) {
    if (request.method !== 'GET') return error('Method not allowed', 405);
    let id;
    try { id = decodeURIComponent(detail[1]); } catch { return error('Invalid article ID', 400); }
    if (id.length > 200 || /[/\\]/.test(id)) return error('Invalid article ID', 400);
    const article = await loadArticle(id);
    return article ? Response.json(article, { headers: { 'Cache-Control': 'no-store' } }) : error('Article not found', 404);
  }
  const route = routes[path];
  if (!route) return error('API endpoint not found', 404);
  const handler = route[request.method as keyof typeof route];
  if (!handler) return new Response(null, { status: 405, headers: { Allow: Object.keys(route).filter(key => ['GET', 'POST', 'DELETE'].includes(key)).join(', '), 'Cache-Control': 'no-store' } });
  return handler(request);
}
