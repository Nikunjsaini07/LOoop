'use client';

import { useAuth } from '@/components/AuthProvider';
import { useEffect, type ReactNode } from 'react';
import { signInPath } from '@/lib/auth-path';
import { LoaderCircle } from 'lucide-react';

export default function ProfileAccess({ children }: { children: ReactNode }) {
  const { isLoaded, isSignedIn } = useAuth();
  useEffect(() => {
    if (isLoaded && !isSignedIn) window.location.replace(signInPath(window.location.pathname + window.location.search + window.location.hash));
  }, [isLoaded, isSignedIn]);

  if (!isLoaded) {
    return (
      <div className="profile-access-loading" role="status" aria-live="polite">
        <LoaderCircle size={22} className="auth-spinner" aria-hidden="true" />
        <p>Loading your reading desk…</p>
      </div>
    );
  }

  return isSignedIn ? <>{children}</> : null;
}
