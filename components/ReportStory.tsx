"use client";
import { useEffect, useRef, useState } from 'react';
import { useAccountId, useAuthRequest, useRequireAccount } from './AuthProvider';

export default function ReportStory({ articleId }: { articleId: string }) {
  const [open, setOpen] = useState(false), [kind, setKind] = useState('broken-link'), [detail, setDetail] = useState(''), [message, setMessage] = useState(''), [busy, setBusy] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), request = useAuthRequest(), requireAccount = useRequireAccount(), account = useAccountId();
  useEffect(() => { if (open) dialog.current?.showModal(); else dialog.current?.close(); }, [open]);
  return <><button className="text-button" onClick={() => { if (requireAccount()) { setMessage(''); setOpen(true); } }}>Report a blog issue</button><dialog ref={dialog} className="feed-dialog report-dialog" aria-labelledby="report-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)}><form className="feed-dialog-form" onSubmit={async event => {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      const response = await request('/api/reports', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ articleId, kind, detail }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || 'Report could not be saved.');
      setDetail(''); setMessage('Your report has been saved for review. Thank you.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Report could not be saved.'); }
    finally { setBusy(false); }
  }}><h2 id="report-title">Help keep this blog accurate</h2><p className="section-description">Report publisher-link or metadata problems. Your report is private and linked to your account. Do not include passwords or other sensitive information.</p><label className="feed-field">Issue<select value={kind} onChange={event => setKind(event.target.value)}><option value="broken-link">Original link does not work</option><option value="incorrect-topic">Topic is incorrect</option><option value="missing-excerpt">Excerpt is missing or inaccurate</option><option value="other">Another blog issue</option></select></label><label className="feed-field">Details (optional)<textarea value={detail} onChange={event => setDetail(event.target.value)} maxLength={1000} rows={4} /></label>{message && <p className="feed-error" role="status">{message}</p>}<footer className="feed-dialog-footer"><button className="text-button" type="button" onClick={() => setOpen(false)}>Close</button><button className="ink-button" disabled={busy || !account} type="submit">{busy ? 'Saving report…' : 'Save report'}</button></footer></form></dialog></>;
}
