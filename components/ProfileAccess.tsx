'use client';

import { useAuth } from '@/components/AuthProvider';
import { useEffect, type ReactNode } from 'react';
import { signInPath } from '@/lib/auth-path';

export default function ProfileAccess({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  useEffect(() => {
    if (isLoaded && !isSignedIn) window.location.replace(signInPath(window.location.pathname + window.location.search + window.location.hash));
  }, [isLoaded, isSignedIn]);
  return isLoaded && isSignedIn ? children : null;
}
