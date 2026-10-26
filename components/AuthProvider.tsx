'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { signInPath } from '@/lib/auth-path';
import { rememberIntent, type ReadingIntent } from '@/lib/reading-intent';
import type { Session, User } from '@supabase/supabase-js';

type AuthRequest = (url: string, init?: RequestInit) => Promise<Response>;
const AuthRequestContext = createContext<AuthRequest | null>(null);
const AuthReadyContext = createContext(false);
const AccountIdContext = createContext<string | null | undefined>(undefined);
const AuthUserContext = createContext<User | null>(null);

export function useAuthReady() { return useContext(AuthReadyContext); }
export function useAccountId() { return useContext(AccountIdContext); }
export function useCurrentUser() { return useContext(AuthUserContext); }

export function useAuth() {
  const isLoaded = useContext(AuthReadyContext);
  const userId = useContext(AccountIdContext);
  return {
    isLoaded,
    isSignedIn: Boolean(userId),
    userId: userId ?? null,
  };
}

export function useClerk() {
  return {
    signOut: async (_opts?: { redirectUrl?: string }) => {
      void _opts;
      await supabase.auth.signOut();
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/');
    },
    openUserProfile: () => {
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.assign('/profile');
    },
  };
}

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

export function ClerkLoading(_props: { _children?: ReactNode; children?: ReactNode }) {
  void _props;
  return null;
}

export function ClerkFailed(_props: { _children?: ReactNode; children?: ReactNode }) {
  void _props;
  return null;
}

export function ClerkLoaded({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export default function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    let mounted = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      setSession(data.session);
      setReady(true);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      if (!mounted) return;
      setSession(currentSession);
      setReady(true);
      if (currentSession && typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
        const cleanUrl = new URL(window.location.href);
        cleanUrl.hash = '';
        cleanUrl.searchParams.delete('auth');
        const query = cleanUrl.searchParams.toString();
        window.history.replaceState(null, '', cleanUrl.pathname + (query ? `?${query}` : ''));
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const request = useCallback<AuthRequest>(async (url, init) => {
    if (!ready) throw new Error('Your session is still loading');
    if (new URL(url, window.location.origin).origin !== window.location.origin) throw new Error('Account requests must stay on Readwell');
    
    // Always get the freshest session token from Supabase
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    const userId = data.session?.user?.id;

    if (userId && !token) throw new Error('Your session needs to be refreshed');
    const headers = new Headers(init?.headers);
    if (token) headers.set('Authorization', `Bearer ${token}`);
    const response = await fetch(url, { ...init, headers, credentials: 'same-origin' });
    if (userId && response.status === 401) throw new Error('Your session expired. Sign in again.');
    return response;
  }, [ready]);

  const userId = ready ? session?.user?.id ?? null : undefined;

  return (
    <AuthReadyContext.Provider value={ready}>
      <AccountIdContext.Provider value={userId}>
        <AuthUserContext.Provider value={session?.user ?? null}>
          <AuthRequestContext.Provider key={session?.user?.id ?? 'guest'} value={request}>
            {children}
          </AuthRequestContext.Provider>
        </AuthUserContext.Provider>
      </AccountIdContext.Provider>
    </AuthReadyContext.Provider>
  );
}
