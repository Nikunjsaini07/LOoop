import { getCurrentUser, AuthenticationError } from '@/lib/server/auth';
import { database, isSameOrigin, jsonError } from '@/lib/server/store';
import { ValidationError } from '@/lib/server/core';
import { saveReaderReport } from '@/lib/server/reader-reports';
export async function POST(request: Request) {
  if (!isSameOrigin(request)) return jsonError('This request must come from Readwell', 403);
  if (!request.headers.get('content-type')?.includes('application/json')) return jsonError('Send a JSON report', 415);
  try {
    const user = await getCurrentUser(request);
    if (!user) return jsonError('Sign in to report a blog', 401);
    const body = await request.text();
    if (body.length > 2000) return jsonError('Report is too long', 413);
    const result = await saveReaderReport(database(), user.userId, JSON.parse(body));
    return Response.json({ saved: true, ...result }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof AuthenticationError) return jsonError(error.message, 401);
    if (error instanceof ValidationError || error instanceof SyntaxError) return jsonError(error.message, 400);
    console.error(JSON.stringify({ event: 'readwell.report.failed', reason: error instanceof Error ? error.message : 'Unknown error' }));
    return jsonError('Your report could not be saved. Your draft is still here; try again.', 503);
  }
}
