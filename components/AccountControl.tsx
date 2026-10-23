'use client';
import { useAuth, useClerk } from '@/components/AuthProvider';
import { useEffect, useId, useRef, useState, type MouseEvent } from 'react';
import Link from './PageLink';
import { ChevronDown, LogOut, UserRound, Settings }  from 'lucide-react';

export default function AccountControl({ active, onProfileNavigate }: {
  active: boolean;
  onProfileNavigate?: (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const { isSignedIn } = useAuth();
  const clerk = useClerk();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const firstItem = useRef<HTMLAnchorElement>(null);
  useEffect(() => {
    if (!open) return;
    const dismiss = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  const signOut = async () => {
    if (busy) return;
    setBusy(true);
    setError('');
    try { await clerk.signOut({ redirectUrl: '/' }); }
    catch {
      setBusy(false);
      setError('Could not sign out. Please try again.');
    }
  };
  if (!isSignedIn) return null;
  return <div className="profile-nav" ref={root}
    onPointerEnter={event => { if (event.pointerType === 'mouse') setOpen(true); }}
    onPointerLeave={event => { if (event.pointerType === 'mouse') setOpen(false); }}
    onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}
    onKeyDown={event => {
      if (event.key === 'Escape') { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    }}>
    <button type="button" ref={trigger} className={'nav-item profile-nav-trigger' + (active ? ' is-active' : '')}
      aria-expanded={open} aria-controls={id} onClick={() => setOpen(value => !value)}
      onKeyDown={event => {
        if (event.key === 'ArrowDown') {
          event.preventDefault();
          setOpen(true);
          requestAnimationFrame(() => firstItem.current?.focus());
        }
      }}>
      Profile <ChevronDown size={12} aria-hidden="true" />
    </button>
    {open && <div className="profile-dropdown" id={id}>
      <div className="profile-dropdown-panel" role="group" aria-label="Profile options">
        <Link ref={firstItem} className="profile-dropdown-item" href="/profile" aria-current={active ? 'page' : undefined}
          onClick={event => { setOpen(false); onProfileNavigate?.(event); }}>
          <UserRound size={14} aria-hidden="true" /> View profile
        </Link>
        <Link className="profile-dropdown-item" href="/settings" onClick={() => setOpen(false)}><Settings size={14} aria-hidden="true" />Reading data & privacy</Link>
        <button type="button" className="profile-dropdown-item" disabled={busy} onClick={signOut}>
          <LogOut size={14} aria-hidden="true" />{busy ? 'Signing out…' : 'Sign out'}
        </button>
        {error && <p className="profile-dropdown-error" role="alert">{error}</p>}
      </div>
    </div>}
  </div>;
}
