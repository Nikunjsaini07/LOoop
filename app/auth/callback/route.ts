import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const returnTo = requestUrl.searchParams.get('return_to') || requestUrl.searchParams.get('next') || '/';

  if (code) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseAnonKey) {
      console.error('Supabase configuration missing in auth callback');
      return NextResponse.redirect(`${requestUrl.origin}/sign-in?error=config_error`);
    }

    const cookieStore = await cookies();
    const supabase = createServerClient(
      supabaseUrl,
      supabaseAnonKey,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            try {
              cookiesToSet.forEach(({ name, value, options }) =>
                cookieStore.set(name, value, options)
              );
            } catch {
              // Ignore when called in contexts where cookies can't be mutated
            }
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (error) {
      console.error('Supabase auth exchange error:', error.message);
      return NextResponse.redirect(`${requestUrl.origin}/sign-in?error=auth_exchange_failed`);
    }

    // Successful authentication - redirect to return path
    const forwardedHost = request.headers.get('x-forwarded-host');
    const isLocalEnv = process.env.NODE_ENV === 'development';
    
    if (isLocalEnv) {
      return NextResponse.redirect(`${requestUrl.origin}${returnTo}`);
    } else if (forwardedHost) {
      return NextResponse.redirect(`https://${forwardedHost}${returnTo}`);
    } else {
      return NextResponse.redirect(`${requestUrl.origin}${returnTo}`);
    }
  }

  // No code provided - redirect to sign-in with error
  return NextResponse.redirect(`${requestUrl.origin}/sign-in?error=auth_callback_failed`);
}
