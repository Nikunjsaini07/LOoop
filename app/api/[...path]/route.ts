import { handleDirectApi } from '@/lib/server/direct-api';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = handleDirectApi;
export const POST = handleDirectApi;
export const DELETE = handleDirectApi;
