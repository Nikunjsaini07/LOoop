'use client';

import { ClerkFailed, ClerkLoaded, ClerkLoading, SignIn, SignUp } from '@clerk/react';
import { useEffect, useState, useSyncExternalStore } from 'react';
import { ArrowLeft, ArrowRight, Bookmark, LoaderCircle, RefreshCw } from 'lucide-react';
import Link from './PageLink';
import BrandLogo from './BrandLogo';
import ThemeToggle from './ThemeToggle';
import { safeReturnPath } from '@/lib/auth-path';

function subscribeLocation(callback: () => void) {
  window.addEventListener('popstate', callback);
  return () => window.removeEventListener('popstate', callback);
}
const returnPath = () => safeReturnPath(new URLSearchParams(window.location.search).get('return_to'));

export function AuthLoading({ failed = false }: { failed?: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 10000);
    return () => window.clearTimeout(timer);
  }, []);
  const needsRetry = failed || slow;
  return <div className="auth-loading">
    <div className="auth-loading-preview" aria-hidden="true">
      <span /><span /><i /><span />
    </div>
    <div className="auth-loading-message" role="status" aria-live="polite">
      {!needsRetry && <LoaderCircle size={17} className="auth-spinner" aria-hidden="true" />}
      <p>{failed ? 'Sign-in couldn’t load.' : slow ? 'Sign-in is taking longer than usual.' : 'Loading secure sign-in…'}</p>
    </div>
    {needsRetry && <div className="auth-retry">
      <p>{failed ? 'Check your connection and try again.' : 'You can try again or keep browsing below.'}</p>
      <button type="button" onClick={() => window.location.reload()}><RefreshCw size={15} aria-hidden="true" />Try again</button>
    </div>}
  </div>;
}

export default function AuthScreen({ mode }: { mode: 'sign-in' | 'sign-up' }) {
  const returnTo = useSyncExternalStore(subscribeLocation, returnPath, () => '/profile');
  const signingIn = mode === 'sign-in';
  // Keep the return destination for account actions; guest browsing must stay public.
  const browseTo = /^\/(profile|settings)(\/|\?|#|$)/.test(returnTo) ? '/' : returnTo;
  const appearance = { elements: { header: { display: 'none' }, cardBox: { maxWidth: '100%', border: 'none', borderRadius: '0', boxShadow: 'none' }, card: { padding: '0', border: 'none', borderRadius: '0', boxShadow: 'none', background: 'transparent' }, socialButtonsBlockButton: { minHeight: '44px' }, socialButtonsIconButton: { minHeight: '44px' }, formFieldInput: { minHeight: '44px' }, formButtonPrimary: { minHeight: '44px' }, footer: { background: 'transparent', backgroundImage: 'none' } } };
  return <main className="auth-page">
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
          <ClerkLoaded>{signingIn
            ? <SignIn appearance={appearance} routing="hash" signUpUrl={`/sign-up?return_to=${encodeURIComponent(returnTo)}`} forceRedirectUrl={returnTo} fallback={<AuthLoading />} />
            : <SignUp appearance={appearance} routing="hash" signInUrl={`/sign-in?return_to=${encodeURIComponent(returnTo)}`} forceRedirectUrl={returnTo} fallback={<AuthLoading />} />}</ClerkLoaded>
        </div>
      </section>
      <Link className="auth-guest" href={browseTo}>Just here to read? <span>Browse stories<ArrowRight size={15} aria-hidden="true" /></span></Link>
      <p className="auth-privacy">Your reading library is private. <Link href="/privacy">Privacy details</Link></p>
    </div>
  </main>;
}
