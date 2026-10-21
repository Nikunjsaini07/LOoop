import { proxyApi } from '@/lib/server/api-proxy';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = proxyApi;
export const POST = proxyApi;
export const DELETE = proxyApi;
