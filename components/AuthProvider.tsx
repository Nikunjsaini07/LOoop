'use client';

import { ClerkProvider, useAuth, useClerk } from '@clerk/react';
import { createContext, useCallback, useContext, type ReactNode } from 'react';
import { signInPath } from '@/lib/auth-path';
import { rememberIntent, type ReadingIntent } from '@/lib/reading-intent';

type AuthRequest = (url: string, init?: RequestInit) => Promise<Response>;
const AuthRequestContext = createContext<AuthRequest | null>(null);
const AuthReadyContext = createContext(false);
const AccountIdContext = createContext<string | null | undefined>(undefined);
export function useAuthReady() { return useContext(AuthReadyContext); }
export function useAccountId() { return useContext(AccountIdContext); }

export function useRequireAccount() {
  const { isLoaded, isSignedIn } = useAuth();
  return useCallback((intent?: ReadingIntent) => {
    if (!isLoaded) return false;
    if (isSignedIn) return true;
    if (intent) rememberIntent(intent);
    window.location.assign(signInPath(window.location.pathname + window.location.search + window.location.hash));
    return false;
  }, [isLoaded, isSignedIn]);
}

export function useAuthRequest() {
  const request = useContext(AuthRequestContext);
  if (!request) throw new Error('Reading profiles require AuthProvider');
  return request;
}

function SessionBoundary({ children }: { children: ReactNode }) {
  const { isLoaded, userId, sessionId, getToken } = useAuth();
  const clerk = useClerk();
  const request = useCallback<AuthRequest>(async (url, init) => {
    if (!isLoaded) throw new Error('Your session is still loading');
    if (new URL(url, window.location.origin).origin !== window.location.origin) throw new Error('Account requests must stay on Readwell');
    // A queued save from the previous account must never obtain the new account's token.
    if (clerk.session?.id !== (sessionId ?? undefined)) throw new Error('Your reading account changed');
    const token = userId ? await getToken() : null;
    if (clerk.session?.id !== (sessionId ?? undefined)) throw new Error('Your reading account changed');
    if (userId && !token) throw new Error('Your session needs to be refreshed');
    const headers = new Headers(init?.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(url, { ...init, headers, credentials: 'same-origin' });
    // A signed-in account with an expired/rejected session must not become a guest cache.
    if (userId && response.status === 401) throw new Error('Your session expired. Sign in again.');
    return response;
  }, [clerk, isLoaded, sessionId, userId, getToken]);

  return <AuthReadyContext.Provider value={isLoaded}>
    <AccountIdContext.Provider value={isLoaded ? userId ?? null : undefined}>
      <AuthRequestContext.Provider key={sessionId ?? 'guest'} value={request}>{children}</AuthRequestContext.Provider>
    </AccountIdContext.Provider>
  </AuthReadyContext.Provider>;
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  return <ClerkProvider publishableKey={process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY!}
    signInUrl="/sign-in" signUpUrl="/sign-up" afterSignOutUrl="/"
    signInFallbackRedirectUrl="/profile" signUpFallbackRedirectUrl="/profile"
    appearance={{ options: { unsafe_disableDevelopmentModeWarnings: process.env.NODE_ENV === 'development' }, variables: { colorPrimary: 'var(--control-selected)', colorPrimaryForeground: 'var(--control-selected-ink)', colorBackground: 'var(--paper)', colorForeground: 'var(--ink)', colorMuted: 'var(--tray)', colorMutedForeground: 'var(--muted)', fontFamily: 'Geist, Arial, sans-serif', borderRadius: '12px' }, elements: { rootBox: { width: '100%' }, cardBox: { width: '100%', maxWidth: '400px', boxShadow: 'none', border: '1px solid var(--line)' }, card: { boxShadow: 'none', border: '1px solid var(--line)' }, headerTitle: { fontFamily: 'Cal Sans, Arial, sans-serif', fontWeight: 400 }, formButtonPrimary: 'readwell-auth-button' } }}>
    <SessionBoundary>{children}</SessionBoundary>
  </ClerkProvider>;
}
