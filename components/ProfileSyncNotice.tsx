"use client";

import { useState } from 'react';
import type { Profile } from '@/lib/types';
import { downloadJson } from '@/lib/download-json';

type Props = {
  profile: Profile; ready: boolean; accountVerified: boolean; storageLabel: string;
  syncStatus: string; mutationError: string; recovery: Profile | null;
  retrySync: () => void; resolveRecovery: (restore: boolean) => void;
};

export default function ProfileSyncNotice({ profile, ready, accountVerified, storageLabel, syncStatus, mutationError, recovery, retrySync, resolveRecovery }: Props) {
  const [reviewed, setReviewed] = useState(false);
  if (!ready || (!accountVerified && !mutationError && syncStatus !== 'error')) return null;
  if (recovery) return <section className="sync-notice recovery-notice" aria-labelledby="recovery-title">
    <h2 id="recovery-title">Choose which reading copy to keep</h2>
    <p>Your account changed elsewhere. Your unsynced device copy is safe. Reading is available while you review it.</p>
    <table><caption className="sr-only">Compare your reading copies</caption><thead><tr><th>Reading data</th><th>Account</th><th>Device</th></tr></thead><tbody>
      <tr><th>Bookmarks</th><td>{profile.bookmarks.length}</td><td>{recovery.bookmarks.length}</td></tr>
      <tr><th>Read logs</th><td>{profile.readLogs.length}</td><td>{recovery.readLogs.length}</td></tr>
      <tr><th>Followed companies</th><td>{profile.follows.length}</td><td>{recovery.follows.length}</td></tr>
      <tr><th>Custom feeds</th><td>{profile.customFeeds.length}</td><td>{recovery.customFeeds.length}</td></tr>
    </tbody></table>
    <div className="sync-actions"><button className="text-button" onClick={() => downloadJson('readwell-account-copy.json', profile)}>Download account copy</button><button className="text-button" onClick={() => downloadJson('readwell-device-copy.json', recovery)}>Download device copy</button></div>
    <label className="recovery-confirm"><input type="checkbox" checked={reviewed} onChange={event => setReviewed(event.target.checked)} />I reviewed both copies. Restoring the device copy replaces the account’s reading data.</label>
    <div className="sync-actions"><button className="ink-button" onClick={() => { resolveRecovery(false); setReviewed(false); }}>Keep account copy</button><button className="ink-button" disabled={!reviewed} onClick={() => { resolveRecovery(true); setReviewed(false); }}>Restore device copy</button></div>
    {mutationError && <p role="alert">{mutationError}</p>}
  </section>;
  if (!mutationError && syncStatus !== 'error' && syncStatus !== 'syncing' && storageLabel !== 'Available in this session') return null;
  if (!mutationError && syncStatus === 'syncing') return <p className="sync-saving" role="status">Saving changes…</p>;
  return <div className={`sync-notice${syncStatus === 'error' || mutationError ? ' sync-needs-attention' : ''}`}>
    <p role={mutationError ? 'alert' : 'status'}>{mutationError || storageLabel}</p>
    {syncStatus === 'error' && <button className="text-button" onClick={retrySync}>Try syncing again</button>}
  </div>;
}
