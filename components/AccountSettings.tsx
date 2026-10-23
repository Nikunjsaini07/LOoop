"use client";

import { useState } from 'react';
import { useClerk, useAuthRequest } from './AuthProvider';
import { useReadingProfile } from '@/lib/useReadingProfile';
import { downloadJson } from '@/lib/download-json';
import SiteHeader from './SiteHeader';
import ProfileAccess from './ProfileAccess';
import ProfileSyncNotice from './ProfileSyncNotice';

export default function AccountSettings() {
  const request = useAuthRequest(), clerk = useClerk(), reading = useReadingProfile();
  const [busy, setBusy] = useState(''), [message, setMessage] = useState(''), [confirmation, setConfirmation] = useState(''), [deleteIdentity, setDeleteIdentity] = useState(false);
  const download = async () => {
    setBusy('download'); setMessage('');
    try {
      const response = await request('/api/account');
      if (!response.ok) throw new Error('Your reading data could not be downloaded. Try again.');
      const value = await response.json() as Record<string, unknown>;
      downloadJson('readwell-reading-data.json', { ...value, deviceCopy: reading.profile, unsyncedCopy: reading.recovery });
      setMessage('Your export includes the account data and your current device copy.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Download failed.'); }
    finally { setBusy(''); }
  };
  const remove = async () => {
    setBusy('delete'); setMessage('');
    try {
      const response = await request('/api/account', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirmation }) });
      if (!response.ok) { const problem = await response.json() as { error?: string }; throw new Error(problem.error || "Your data could not be deleted. Try again."); }
      // Clear only the confirmed account, then sign out to stop stale open tabs
      // from obtaining a live session token and restoring a pending profile.
      if (reading.profileOwner) {
        const key = `scroll:reading-profile:v1:${encodeURIComponent(reading.profileOwner)}`;
        try { localStorage.removeItem(key); localStorage.removeItem(`${key}:unsynced`); } catch { /* Server deletion succeeded. */ }
      }
      try { await clerk.signOut({ redirectUrl: '/' }); }
      catch { window.location.replace("/"); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Deletion failed.'); setBusy(''); }
  };
  return <div className="publication"><a className="skip-link" href="#account-settings">Skip to reading data</a><SiteHeader active="profile" /><main id="account-settings" className="reading-main settings-main"><ProfileAccess>
    <header><p className="eyebrow">Your account</p><h1>Reading data & privacy</h1><p>Your reading belongs to you. Download it, review what is shared, or start again.</p></header>
    <ProfileSyncNotice {...reading} />
    <section className="settings-card"><h2>What Readwell stores</h2><p>Your name, bio, followed companies, interests, custom feeds, bookmarks, reading logs, activity days, and recommendation feedback are linked to your account. Recommendation feedback is private.</p><p>Bookmarks and explicit read logs contribute to aggregate public counts and Trending. Other readers do not see your personal library. Opening a publisher’s website does not mark a story as read.</p><p>Device copies remain in this browser to recover interrupted saves. Activity days use UTC and are kept for up to 400 days. Read logs and bookmarks remain until removed, subject to the limits shown below.</p><p>Limits: 4,000 bookmarks, 2,000 read logs, 30 custom feeds, and 500 recommendation ratings. Readwell does not send your account profile to an embedding service.</p></section>
    <section className="settings-card"><h2>Download your reading data</h2><p>Get a JSON copy of your account reading data and any pending changes on this device.</p><button className="ink-button" disabled={!!busy || !reading.accountVerified} onClick={download}>{busy === 'download' ? 'Preparing download…' : 'Download reading data'}</button></section>
    <section className="settings-card"><h2>Sign-in and security</h2><p>Manage your email address, connected sign-in methods, and active sessions with the account provider.</p><button className="ink-button" onClick={() => clerk.openUserProfile()}>Manage account</button></section>
    <section className="settings-card"><h2>Delete your reading data</h2><p>This removes your profile, follows, custom feeds, bookmarks, read logs, recommendation feedback, and contributions to public counts. It cannot be undone. Download a copy first if you want to keep it.</p><p>You will be signed out afterward. This operation applies to the database serving this app.</p><label className="recovery-confirm"><input type="checkbox" checked={deleteIdentity} onChange={event => { setDeleteIdentity(event.target.checked); setConfirmation(""); }} />Also permanently delete my sign-in account.</label><label className="settings-confirm">Type {deleteIdentity ? "DELETE MY ACCOUNT" : "DELETE MY READING DATA"}<input value={confirmation} onChange={event => setConfirmation(event.target.value)} autoComplete="off" spellCheck={false} /></label><button className="ink-button" disabled={!!busy || confirmation !== (deleteIdentity ? 'DELETE MY ACCOUNT' : 'DELETE MY READING DATA') || !reading.accountVerified || reading.syncStatus === 'syncing'} onClick={remove}>{busy === 'delete' ? 'Deleting reading data…' : deleteIdentity ? 'Delete account permanently' : 'Delete reading data and sign out'}</button></section>
    {message && <p className="sync-notice" role="status">{message}</p>}
    <footer className="paper-footer"><a href="/profile">Back to your reading</a><a href="/privacy">Privacy details</a></footer>
  </ProfileAccess></main></div>;
}
