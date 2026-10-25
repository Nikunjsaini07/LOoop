import { env } from './env.ts';

export class AuthenticationError extends Error {}

export async function getCurrentUser(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization) return null;
  if (!/^Bearer \S+$/i.test(authorization)) throw new AuthenticationError('Invalid session');
  const token = authorization.replace(/^Bearer\s+/i, '');

  const supabaseUrl = (typeof env.SUPABASE_URL === 'string' ? env.SUPABASE_URL : undefined) || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bkfxvxkdasxqlmzyjpoz.supabase.co';
  const supabaseKey = (typeof env.SUPABASE_ANON_KEY === 'string' ? env.SUPABASE_ANON_KEY : undefined) || process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_OYbHXFEQ1JCkjB_5NCIeXQ_QqUTQB7N';

  const { createClient } = await import('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseKey, { auth: { persistSession: false } });
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new AuthenticationError('Your session expired. Sign in again.');
  const email = user.email ?? '';
  const fullName = (user.user_metadata?.full_name as string) || (user.user_metadata?.name as string) || null;
  return { userId: user.id, email, fullName, displayName: fullName || email || 'Reader' };
}

export async function deleteIdentity(verifiedUserId: string) {
  const supabaseUrl = (typeof env.SUPABASE_URL === 'string' ? env.SUPABASE_URL : undefined) || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseSecret = (typeof env.SUPABASE_SERVICE_ROLE_KEY === 'string' ? env.SUPABASE_SERVICE_ROLE_KEY : undefined) || process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!supabaseUrl || !supabaseSecret) {
    throw new Error('Supabase admin configuration is incomplete. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
  }

  const { createClient } = await import('@supabase/supabase-js');
  const admin = createClient(supabaseUrl, supabaseSecret, { auth: { persistSession: false } });
  await admin.auth.admin.deleteUser(verifiedUserId);
}
