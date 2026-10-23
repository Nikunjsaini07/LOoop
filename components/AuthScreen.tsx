'use client';

import { useEffect, useState, useSyncExternalStore, type FormEvent } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, LoaderCircle, RefreshCw } from 'lucide-react';
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
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const signingIn = mode === 'sign-in';
  const browseTo = /^\/(profile|settings)(\/|\?|#|$)/.test(returnTo) ? '/' : returnTo;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    setSuccess(null);
    setBusy(true);

    try {
      if (signingIn) {
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) throw signInError;
        window.location.assign(returnTo || '/');
      } else {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        });
        if (signUpError) throw signUpError;
        if (data.session) {
          window.location.assign(returnTo || '/');
        } else {
          setSuccess('Account created! If email confirmation is enabled, check your inbox.');
        }
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Authentication failed. Please try again.';
      setError(message);
    } finally {
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
        <Link className="auth-back" href={browseTo}><ArrowLeft size={15} aria-hidden="true" />Back to reading</Link>
        <section className="auth-card" aria-labelledby="auth-title">
          <span className="auth-bookmark" aria-hidden="true"><Bookmark size={20} strokeWidth={1.5} /></span>
          <p className="auth-eyebrow">Your reading space</p>
          <h1 id="auth-title">{signingIn ? 'Welcome back.' : 'A shelf of your own.'}</h1>
          <p className="auth-intro">Save good stories, follow your favorite companies, and pick up where you left off.</p>
          
          <div className="auth-form">
            <ClerkLoading><AuthLoading /></ClerkLoading>
            <ClerkFailed><AuthLoading failed /></ClerkFailed>
            <ClerkLoaded>
              <form onSubmit={handleSubmit} className="supabase-auth-form">
                {error && <div className="supabase-error" role="alert">{error}</div>}
                {success && <div className="supabase-success" role="status">{success}</div>}
                
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
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={busy}
                    minLength={6}
                  />
                </div>

                <button type="submit" className="supabase-submit" disabled={busy}>
                  {busy && <LoaderCircle size={16} className="auth-spinner" aria-hidden="true" />}
                  <span>{signingIn ? (busy ? 'Signing in…' : 'Sign in') : (busy ? 'Creating account…' : 'Create account')}</span>
                </button>

                <div className="supabase-toggle">
                  {signingIn ? (
                    <>
                      Don&apos;t have an account?{' '}
                      <a role="button" tabIndex={0} onClick={() => { setMode('sign-up'); setError(null); setSuccess(null); }}>
                        Sign up
                      </a>
                    </>
                  ) : (
                    <>
                      Already have an account?{' '}
                      <a role="button" tabIndex={0} onClick={() => { setMode('sign-in'); setError(null); setSuccess(null); }}>
                        Sign in
                      </a>
                    </>
                  )}
                </div>
              </form>
            </ClerkLoaded>
          </div>
        </section>
        <Link className="auth-guest" href={browseTo}>Just here to read? <span>Browse stories<ArrowRight size={15} aria-hidden="true" /></span></Link>
        <p className="auth-privacy">Your reading library is private. <Link href="/privacy">Privacy details</Link></p>
      </div>
    </main>
  );
}
