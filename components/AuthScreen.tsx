'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, ArrowRight, LoaderCircle, RefreshCw } from 'lucide-react';
import Link from './PageLink';
import BrandLogo from './BrandLogo';
import ThemeToggle from './ThemeToggle';
import { safeReturnPath } from '@/lib/auth-path';
import { supabase } from '@/lib/supabase';
import { ClerkLoading, ClerkFailed, ClerkLoaded, useAuth } from './AuthProvider';

function subscribeLocation(callback: () => void) {
  window.addEventListener('popstate', callback);
  return () => window.removeEventListener('popstate', callback);
}
const returnPath = () => safeReturnPath(new URLSearchParams(window.location.search).get('return_to'));

function AuthLoading({ failed = false }: { failed?: boolean }) {
  const [needsRetry, setNeedsRetry] = useState(failed);
  useEffect(() => {
    if (failed) return;
    const timer = window.setTimeout(() => setNeedsRetry(true), 4000);
    return () => window.clearTimeout(timer);
  }, [failed]);
  return (
    <div className="auth-loading" role="status" aria-live="polite">
      <div className="auth-loading-state">
        <LoaderCircle size={22} className={failed ? 'auth-spinner is-stalled' : 'auth-spinner'} aria-hidden="true" />
        <div>
          <p className="auth-loading-label">{failed ? 'Sign-in couldn’t load' : 'Loading secure sign-in…'}</p>
          <p className="auth-loading-sub">{failed ? 'The identity service was blocked or could not be reached.' : 'Setting up a private reader session…'}</p>
        </div>
      </div>
      {needsRetry && (
        <div className="auth-retry">
          <p>{failed ? 'Check your connection and try again.' : 'You can try again or keep browsing below.'}</p>
          <button type="button" onClick={() => window.location.reload()}>
            <RefreshCw size={15} aria-hidden="true" />Try again
          </button>
        </div>
      )}
    </div>
  );
}

function getInitialAuthError(): string | null {
  if (typeof window === 'undefined') return null;
  const hash = window.location.hash || '';
  if (hash && (hash.includes('access_token') || hash.includes('refresh_token'))) {
    return null;
  }
  const params = new URLSearchParams(window.location.search);
  const urlError = params.get('error');
  if (!urlError) return null;
  if (urlError === 'auth_callback_failed') {
    return 'Sign in was interrupted. Please try again.';
  }
  if (urlError === 'auth_exchange_failed') {
    return 'Could not verify your sign-in with Google. Please try again.';
  }
  return decodeURIComponent(urlError);
}

export default function AuthScreen({ mode = 'sign-in' }: { mode?: 'sign-in' | 'sign-up' }) {
  const returnTo = useSyncExternalStore(subscribeLocation, returnPath, () => '/profile');
  const auth = typeof useAuth === 'function' ? useAuth() : { isLoaded: false, isSignedIn: false };
  const { isLoaded, isSignedIn } = auth;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(getInitialAuthError);

  // If already signed in, immediately redirect to return destination
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      window.location.replace(returnTo || '/');
    }
  }, [isLoaded, isSignedIn, returnTo]);

  // Handle pending hash tokens on initial load
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const hash = window.location.hash || '';
    if (hash && (hash.includes('access_token') || hash.includes('refresh_token'))) {
      if (typeof supabase !== 'undefined' && supabase.auth) {
        supabase.auth.getSession().then(({ data }) => {
          if (data?.session) {
            window.location.replace(returnTo || '/');
          }
        });
      }
    }
  }, [returnTo]);

  const browseTo = /^\/(profile|settings)(\/|\?|#|$)/.test(returnTo) ? '/' : returnTo;

  const handleGoogleSignIn = async () => {
    if (busy) return;
    setError(null);
    setBusy(true);

    try {
      const redirectTo = `${window.location.origin}/auth/callback?return_to=${encodeURIComponent(returnTo || '/')}`;
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
        },
      });

      if (oauthError) {
        throw oauthError;
      }

      if (data?.url) {
        window.location.assign(data.url);
      }
    } catch (err) {
      console.error('Google OAuth error:', err);
      const message = err instanceof Error ? err.message : 'Failed to connect with Google.';
      setError(message);
      setBusy(false);
    }
  };

  return (
    <main className="auth-page">
      <header className="auth-header">
        <Link className="wordmark" href="/" aria-label="Readwell home"><BrandLogo />Readwell</Link>
        <ThemeToggle />
      </header>
      <div className="auth-content">
        <Link className="auth-back" href={browseTo}><ArrowLeft size={14} aria-hidden="true" />Back to reading</Link>
        <div className="auth-card-tray tray">
          <section className="auth-card sheet" aria-labelledby="auth-title">
            <div className="issue-pill auth-pill"><span></span>Your reading space</div>
            <h1 id="auth-title">{mode === 'sign-up' ? 'A shelf of your own.' : 'Welcome back.'}</h1>
            <p className="auth-intro">Sign in to save good blogs, follow your favorite companies, and pick up where you left off.</p>

            <div className="auth-form">
              <ClerkLoading><AuthLoading /></ClerkLoading>
              <ClerkFailed><AuthLoading failed /></ClerkFailed>
              <ClerkLoaded>
                <div className="supabase-auth-form">
                  {error && <div className="supabase-error" role="alert">{error}</div>}

                  <div className="supabase-oauth-group">
                    <button
                      type="button"
                      className="supabase-oauth-btn supabase-oauth-google"
                      onClick={handleGoogleSignIn}
                      disabled={busy}
                    >
                      {busy ? (
                        <LoaderCircle size={18} className="auth-spinner" aria-hidden="true" />
                      ) : (
                        <svg viewBox="0 0 24 24" aria-hidden="true">
                          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                        </svg>
                      )}
                      <span>{busy ? 'Connecting to Google…' : 'Sign in with Google'}</span>
                    </button>
                  </div>
                </div>
              </ClerkLoaded>
            </div>
          </section>
        </div>
        <Link className="auth-guest" href={browseTo}>Just here to read? <span>Browse blogs<ArrowRight size={14} aria-hidden="true" /></span></Link>
        <p className="auth-privacy">Your reading library is private. <Link href="/privacy">Privacy details</Link></p>
      </div>
    </main>
  );
}
