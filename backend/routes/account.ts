import { AuthenticationError, getCurrentUser } from '@/lib/server/auth';
import { database, isSameOrigin, jsonError } from '@/lib/server/store';
import { deleteIdentity } from '@/lib/server/auth';
import { deleteReadingData } from '@/lib/server/account-data';
import { articleId } from '@/lib/server/core';

export async function GET(request: Request) {
  try {
    const user = await getCurrentUser(request);
    if (!user) return jsonError('Sign in to download your reading data', 401);
    const db = database();
    const row = await db.prepare('SELECT data,version,updated_at FROM profiles WHERE user_id=?').bind(user.userId).first<{data:string;version:number;updated_at:string}>();
    const reader = await articleId(`readzz-reader:${user.userId}`);
    const activity = await db.prepare('SELECT article_id,kind,active,occurred_at FROM engagements WHERE reader_id=? ORDER BY occurred_at DESC').bind(reader).all();
    const reports = await db.prepare("SELECT article_id,kind,detail,created_at FROM reader_reports WHERE reader_id=? ORDER BY created_at DESC").bind(reader).all();
    return Response.json({ reports: reports.results, format: 'readwell-export-v1', exportedAt: new Date().toISOString(), profile: row ? JSON.parse(row.data) : null, publicActivity: activity.results }, { headers: {
      'Cache-Control': 'private, no-store', 'Vary': 'Authorization', 'Content-Disposition': 'attachment; filename="readwell-reading-data.json"',
    } });
  } catch (error) { return jsonError(error instanceof AuthenticationError ? error.message : 'Your reading data could not be downloaded. Try again.', error instanceof AuthenticationError ? 401 : 503); }
}

export async function DELETE(request: Request) {
  if (!isSameOrigin(request)) return jsonError('This request must come from Readwell', 403);
  if (!request.headers.get('content-type')?.includes('application/json')) return jsonError('Send a JSON confirmation', 415);
  try {
    const user = await getCurrentUser(request);
    if (!user) return jsonError('Sign in to delete your reading data', 401);
    const text = await request.text();
    if (text.length > 200) return jsonError('Confirmation is too long', 413);
    const body = JSON.parse(text);
    if (!['DELETE MY READING DATA', 'DELETE MY ACCOUNT'].includes(body?.confirmation)) return jsonError('Type DELETE MY READING DATA to confirm', 400);
    await deleteReadingData(database(), user.userId);
    if (body.confirmation === 'DELETE MY ACCOUNT') {
      try { await deleteIdentity(user.userId); }
      catch { return Response.json({ error: 'Your reading data was deleted, but the sign-in account could not be deleted. Try deleting the account again.', readingDataDeleted: true }, { status: 503, headers: { 'Cache-Control': 'private, no-store' } }); }
    }
    return Response.json({ deleted: true }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch (error) {
    if (error instanceof SyntaxError) return jsonError('Invalid confirmation', 400);
    return jsonError(error instanceof AuthenticationError ? error.message : 'Your reading data could not be deleted. Try again.', error instanceof AuthenticationError ? 401 : 503);
  }
}
