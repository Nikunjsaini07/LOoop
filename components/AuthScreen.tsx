'use client';

import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, LoaderCircle, RefreshCw } from 'lucide-react';
import Link from './PageLink';
import BrandLogo from './BrandLogo';
import ThemeToggle from './ThemeToggle';
import { safeReturnPath } from '@/lib/auth-path';
import { supabase } from '@/lib/supabase';
import { ClerkLoading, ClerkFailed, ClerkLoaded } from './AuthProvider';

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

export default function AuthScreen({ mode: initialMode }: { mode: 'sign-in' | 'sign-up' }) {
  const returnTo = useSyncExternalStore(subscribeLocation, returnPath, () => '/profile');
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    setMode(initialMode);
    setError(null);
    setSuccess(null);
    setBusy(false);
  }, [initialMode]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const switchMode = (nextMode: 'sign-in' | 'sign-up') => {
    setMode(nextMode);
    setError(null);
    setSuccess(null);
    setFullName('');
    setBusy(false);
    if (typeof window !== 'undefined') {
      const targetUrl = new URL(window.location.href);
      targetUrl.pathname = nextMode === 'sign-up' ? '/sign-up' : '/sign-in';
      window.history.pushState({}, '', targetUrl);
    }
  };

  const signingIn = mode === 'sign-in';
  const browseTo = /^\/(profile|settings)(\/|\?|#|$)/.test(returnTo) ? '/' : returnTo;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setSuccess(null);

    const cleanEmail = email.trim();
    if (!cleanEmail) {
      setError('Please enter your email address.');
      return;
    }
    if (!signingIn && !fullName.trim()) {
      setError('Please enter your full name.');
      return;
    }
    if (!password) {
      setError('Please enter a password.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setBusy(true);

    try {
      if (signingIn) {
        console.log('Attempting sign in for:', cleanEmail);
        const { data, error: signInError } = await supabase.auth.signInWithPassword({
          email: cleanEmail,
          password,
        });
        
        if (signInError) {
          console.error('Sign in error:', signInError);
          throw signInError;
        }
        
        console.log('Sign in successful, session:', data.session);
        console.log('Redirecting to:', returnTo || '/');
        
        // Wait a bit for the session to be set in cookies
        await new Promise(resolve => setTimeout(resolve, 500));
        window.location.href = returnTo || '/';
      } else {
        const callbackUrl = `${window.location.origin}/auth/callback?return_to=${encodeURIComponent(returnTo || '/')}`;
        console.log('Sign up callback URL:', callbackUrl);
        
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: cleanEmail,
          password,
          options: {
            emailRedirectTo: callbackUrl,
            data: {
              full_name: fullName.trim(),
              name: fullName.trim(),
            },
          },
        });
        
        if (signUpError) {
          console.error('Sign up error:', signUpError);
          throw signUpError;
        }
        
        console.log('Sign up result:', data);
        
        if (data.session) {
          console.log('Session created immediately, redirecting');
          await new Promise(resolve => setTimeout(resolve, 500));
          window.location.href = returnTo || '/';
        } else if (data.user && !data.user.confirmed_at) {
          setSuccess('Account created! Please check your email (including Spam/Junk) to verify your account before signing in.');
        } else {
          setSuccess('Account created! You can now sign in.');
        }
      }
    } catch (err) {
      console.error('Auth error:', err);
      const message = err instanceof Error ? err.message : 'Authentication failed. Please try again.';
      setError(message);
    } finally {
      setBusy(false);
    }
  };

  const handleOAuth = async (provider: 'google') => {
    if (busy) return;
    setError(null);
    setSuccess(null);
    setBusy(true);

    try {
      const redirectTo = `${window.location.origin}/auth/callback?return_to=${encodeURIComponent(returnTo || '/')}`;
      console.log('OAuth redirect URL:', redirectTo);
      console.log('Initiating OAuth with provider:', provider);
      
      const { data, error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
        },
      });
      
      if (oauthError) {
        console.error('OAuth error:', oauthError);
        throw oauthError;
      }
      
      console.log('OAuth initiated successfully:', data);
      // The browser will redirect automatically to Google
    } catch (err) {
      console.error('OAuth exception:', err);
      const message = err instanceof Error ? err.message : `Failed to connect with ${provider}.`;
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
            <h1 id="auth-title">{signingIn ? 'Welcome back.' : 'A shelf of your own.'}</h1>
            <p className="auth-intro">Save good blogs, follow your favorite companies, and pick up where you left off.</p>
          
          <div className="auth-form">
            <ClerkLoading><AuthLoading /></ClerkLoading>
            <ClerkFailed><AuthLoading failed /></ClerkFailed>
            <ClerkLoaded>
              <form onSubmit={handleSubmit} className="supabase-auth-form">
                {error && <div className="supabase-error" role="alert">{error}</div>}
                {success && <div className="supabase-success" role="status">{success}</div>}
                
                <div className="supabase-oauth-group">
                  <button type="button" className="supabase-oauth-btn" onClick={() => handleOAuth('google')} disabled={busy}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
                    <span>Continue with Google</span>
                  </button>
                </div>

                <div className="supabase-divider" role="separator">
                  <span>or with email</span>
                </div>
                
                {!signingIn && (
                  <div className="supabase-field">
                    <label htmlFor="auth-name">Full name</label>
                    <input
                      id="auth-name"
                      type="text"
                      required
                      autoComplete="name"
                      className="supabase-input"
                      placeholder="e.g. Jane Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      disabled={busy}
                    />
                  </div>
                )}

                <div className="supabase-field">
                  <label htmlFor="auth-email">Email address</label>
                  <input
                    id="auth-email"
                    type="email"
                    required
                    autoComplete="email"
                    className="supabase-input"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={busy}
                  />
                </div>

                <div className="supabase-field">
                  <label htmlFor="auth-password">Password</label>
                  <input
                    id="auth-password"
                    type="password"
                    required
                    autoComplete={signingIn ? 'current-password' : 'new-password'}
                    className="supabase-input"
                    placeholder="At least 6 characters"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                    minLength={6}
                  />
                </div>

                <button type="submit" className="supabase-submit" disabled={busy || !email.trim() || !password || (!signingIn && !fullName.trim())}>
                  {busy && <LoaderCircle size={16} className="auth-spinner" aria-hidden="true" />}
                  <span>{signingIn ? (busy ? 'Signing in…' : 'Sign in') : (busy ? 'Creating account…' : 'Create account')}</span>
                </button>
              </form>

              <div className="supabase-toggle">
                {signingIn ? (
                  <>
                    Don&apos;t have an account?{' '}
                    <Link
                      href={returnTo && returnTo !== '/' ? `/sign-up?return_to=${encodeURIComponent(returnTo)}` : '/sign-up'}
                      className="auth-toggle-link"
                      onClick={(e) => {
                        e.preventDefault();
                        switchMode('sign-up');
                      }}
                    >
                      Sign up
                    </Link>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <Link
                      href={returnTo && returnTo !== '/' ? `/sign-in?return_to=${encodeURIComponent(returnTo)}` : '/sign-in'}
                      className="auth-toggle-link"
                      onClick={(e) => {
                        e.preventDefault();
                        switchMode('sign-in');
                      }}
                    >
                      Sign in
                    </Link>
                  </>
                )}
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
