import { env } from 'cloudflare:workers';
import * as articles from '../backend/routes/articles';
import * as companies from '../backend/routes/companies';
import * as sources from '../backend/routes/sources';
import * as profile from '../backend/routes/profile';
import * as engagement from '../backend/routes/engagement';
import * as account from '../backend/routes/account';
import * as reports from '../backend/routes/reports';
import * as refresh from '../backend/routes/refresh';
import * as health from '../backend/routes/health';
import * as ready from '../backend/routes/ready';
import * as webhook from '../backend/routes/webhooks/clerk';
import { loadArticle } from '../lib/server/store';
import { secureResponse } from '../lib/response-headers';
import { dispatchApi } from '../backend/router';

const routes = {
  '/api/articles': articles, '/api/companies': companies, '/api/sources': sources,
  '/api/profile': profile, '/api/engagement': engagement, '/api/account': account,
  '/api/reports': reports, '/api/refresh': refresh, '/api/health': health,
  '/api/ready': ready, '/api/webhooks/clerk': webhook,
};

const worker = {
  async fetch(request: Request) {
    try {
      const response = await dispatchApi(request, routes, env.READWELL_PROXY_SECRET, loadArticle);
      return secureResponse(response, request.url);
    } catch {
      return Response.json({ error: 'The article service is temporarily unavailable.' }, { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
  },
};

export default worker;
