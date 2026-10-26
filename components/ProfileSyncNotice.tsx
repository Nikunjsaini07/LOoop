"use client";

import type { Profile } from '@/lib/types';

type Props = {
  profile: Profile;
  ready: boolean;
  accountVerified: boolean;
  storageLabel: string;
  syncStatus: string;
  mutationError: string;
  recovery?: Profile | null;
  retrySync: () => void;
  resolveRecovery?: (restore: boolean) => void;
};

export default function ProfileSyncNotice({
  ready,
  accountVerified,
  storageLabel,
  syncStatus,
  mutationError,
  retrySync,
}: Props) {
  if (!ready || (!accountVerified && !mutationError && syncStatus !== 'error')) return null;

  if (!mutationError && syncStatus !== 'error' && syncStatus !== 'syncing' && storageLabel !== 'Available in this session') return null;
  if (!mutationError && syncStatus === 'syncing') return <p className="sync-saving" role="status">Saving changes…</p>;

  const isFailedToFetch = mutationError?.toLowerCase().includes('failed to fetch');
  const displayMessage = isFailedToFetch
    ? 'Unable to connect to the server. Your reading data is saved on this device.'
    : (mutationError || storageLabel);

  return (
    <div className={`sync-notice${syncStatus === 'error' || mutationError ? ' sync-needs-attention' : ''}`}>
      <p role={mutationError ? 'alert' : 'status'}>{displayMessage}</p>
      {syncStatus === 'error' && (
        <button className="text-button" onClick={retrySync}>
          Try syncing again
        </button>
      )}
    </div>
  );
}
