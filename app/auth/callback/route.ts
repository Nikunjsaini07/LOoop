import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const returnTo = requestUrl.searchParams.get('return_to') || requestUrl.searchParams.get('next') || '/';

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://bkfxvxkdasxqlmzyjpoz.supabase.co',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'sb_publishable_OYbHXFEQ1JCkjB_5NCIeXQ_QqUTQB7N',
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
    if (!error) {
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
  }

  // URL to redirect to after sign in process completes or fails
  return NextResponse.redirect(`${requestUrl.origin}/sign-in?error=auth_callback_failed`);
}
