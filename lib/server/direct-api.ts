import * as articles from '@/backend/routes/articles';
import * as companies from '@/backend/routes/companies';
import * as sources from '@/backend/routes/sources';
import * as profile from '@/backend/routes/profile';
import * as engagement from '@/backend/routes/engagement';
import * as account from '@/backend/routes/account';
import * as reports from '@/backend/routes/reports';
import * as refresh from '@/backend/routes/refresh';
import * as health from '@/backend/routes/health';
import * as ready from '@/backend/routes/ready';
import { loadArticle } from '@/lib/server/store';
import { secureResponse } from '@/lib/response-headers';

type Handler = (request: Request) => Promise<Response>;
type RouteModule = { GET?: Handler; POST?: Handler; DELETE?: Handler };

const routes: Record<string, RouteModule> = {
  '/api/articles': articles,
  '/api/companies': companies,
  '/api/sources': sources,
  '/api/profile': profile,
  '/api/engagement': engagement,
  '/api/account': account,
  '/api/reports': reports,
  '/api/refresh': refresh,
  '/api/health': health,
  '/api/ready': ready,
};

export async function handleDirectApi(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const error = (message: string, status: number) =>
    Response.json({ error: message }, { status, headers: { 'Cache-Control': 'no-store' } });

  try {
    // 1. Article detail route: /api/articles/:id
    const articleMatch = path.match(/^\/api\/articles\/([^/]+)$/);
    if (articleMatch) {
      if (request.method !== 'GET') return error('Method not allowed', 405);
      let id: string;
      try {
        id = decodeURIComponent(articleMatch[1]);
      } catch {
        return error('Invalid article ID', 400);
      }
      if (id.length > 200 || /[/\\]/.test(id)) return error('Invalid article ID', 400);
      const article = await loadArticle(id);
      const resp = article
        ? Response.json(article, { headers: { 'Cache-Control': 'no-store' } })
        : error('Article not found', 404);
      return secureResponse(resp, request.url);
    }

    // 2. Direct route match
    const route = routes[path];
    if (!route) return error('API endpoint not found', 404);

    const handler = route[request.method as keyof RouteModule];
    if (!handler) {
      return new Response(null, {
        status: 405,
        headers: {
          Allow: Object.keys(route)
            .filter((key) => ['GET', 'POST', 'DELETE'].includes(key))
            .join(', '),
          'Cache-Control': 'no-store',
        },
      });
    }

    const response = await handler(request);
    return secureResponse(response, request.url);
  } catch (err) {
    console.error('Direct API error:', err);
    return error('The article service is temporarily unavailable.', 503);
  }
}
