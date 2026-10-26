import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { safeReturnPath } from '@/lib/auth-path';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const returnTo = safeReturnPath(
    requestUrl.searchParams.get('return_to') || requestUrl.searchParams.get('next') || '/'
  );

  if (code) {
    const supabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env.SUPABASE_URL ||
      'https://bkfxvxkdasxqlmzyjpoz.supabase.co';
    const supabaseAnonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_ANON_KEY ||
      'sb_publishable_OYbHXFEQ1JCkjB_5NCIeXQ_QqUTQB7N';

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

  // When using Supabase OAuth or magic links with hash-based tokens (#access_token=...),
  // the fragment is only accessible client-side in the browser and is never sent to the server.
  // We return a client-side bridge that inspects the hash fragment and completes authentication.
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Authenticating… | Readwell</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      background: #faf9f6;
      color: #1a1a1a;
    }
    .spinner {
      width: 28px;
      height: 28px;
      border: 3px solid rgba(0,0,0,0.1);
      border-top-color: #1a1a1a;
      border-radius: 50%;
      animation: spin 0.7s linear infinite;
      margin-bottom: 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    .label { font-size: 15px; font-weight: 500; }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <div class="label">Completing sign-in…</div>
  <script>
    (function() {
      var hash = window.location.hash || '';
      var search = window.location.search || '';
      var searchParams = new URLSearchParams(search);
      var hashParams = new URLSearchParams(hash.startsWith('#') ? hash.slice(1) : hash);
      var returnTo = ${JSON.stringify(returnTo)};

      var error = hashParams.get('error') || searchParams.get('error');
      var errorDesc = hashParams.get('error_description') || searchParams.get('error_description');

      if (error) {
        window.location.replace('/sign-in?error=' + encodeURIComponent(errorDesc || error));
        return;
      }

      if (hash && (hash.indexOf('access_token') !== -1 || hash.indexOf('refresh_token') !== -1)) {
        var sep = returnTo.indexOf('?') !== -1 ? '&' : '?';
        window.location.replace(returnTo + sep + 'auth=success' + hash);
        return;
      }

      window.location.replace('/sign-in?error=auth_callback_failed');
    })();
  </script>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
