import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { getOrCreateDeviceCode, normalizeCode } from '../lib/deviceCode';
import { linkDevice, syncNow, unlink } from '../lib/sync';

type Status = { kind: 'idle' | 'syncing' | 'ok' | 'error'; message?: string };

function timeAgo(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

export default function SyncCard() {
  const [deviceCode, setDeviceCode] = useState<string | null>(null);
  useEffect(() => {
    getOrCreateDeviceCode().then(setDeviceCode);
  }, []);

  const syncCode = useLiveQuery(() => db.kv.get('syncCode'), [])?.value;
  const lastSyncAt = useLiveQuery(() => db.kv.get('lastSyncAt'), [])?.value;

  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [linkInput, setLinkInput] = useState('');
  const [copied, setCopied] = useState(false);

  const activeCode = syncCode ?? deviceCode ?? '· · ·';
  const linked = Boolean(syncCode && deviceCode && syncCode !== deviceCode);
  const busy = status.kind === 'syncing';

  async function runSync() {
    setStatus({ kind: 'syncing' });
    const r = await syncNow();
    setStatus(r.ok ? { kind: 'ok' } : { kind: 'error', message: r.error ?? 'Sync failed.' });
  }

  async function runLink() {
    const code = normalizeCode(linkInput);
    if (!code) {
      setStatus({ kind: 'error', message: 'Enter a code like plume-gazette-marge-42.' });
      return;
    }
    if (code === deviceCode) {
      setStatus({ kind: 'error', message: 'That’s this device’s own code.' });
      return;
    }
    setStatus({ kind: 'syncing' });
    const r = await linkDevice(code);
    setStatus(r.ok ? { kind: 'ok' } : { kind: 'error', message: r.error ?? 'Sync failed.' });
    if (r.ok) setLinkInput('');
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(activeCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the code is visible anyway */
    }
  }

  function statusLine() {
    if (status.kind === 'syncing') return 'Syncing…';
    if (status.kind === 'error') return status.message;
    if (lastSyncAt) return `Synced ${timeAgo(Number(lastSyncAt))}`;
    return 'Not syncing yet — sync to back up this device.';
  }

  return (
    <div className="card">
      <p style={{ margin: '0 0 2px', color: 'var(--ink-soft)', fontSize: 14 }}>
        {linked
          ? 'Linked with another device. Progress merges automatically.'
          : 'Progress lives on this device. Share this code to link another device.'}
      </p>

      <button className="desk-code desk-code--btn" onClick={copyCode} title="Copy code">
        {activeCode}
        <span className="desk-code__copy">{copied ? 'copied ✓' : 'tap to copy'}</span>
      </button>

      <div className="sync-actions">
        <button className="btn btn--primary" onClick={runSync} disabled={busy}>
          {busy ? 'Syncing…' : 'Sync now'}
        </button>
        {linked && (
          <button className="btn btn--ghost" onClick={() => unlink()} disabled={busy}>
            Unlink
          </button>
        )}
      </div>

      <p
        className="sync-status"
        style={{ color: status.kind === 'error' ? 'var(--accent-deep)' : 'var(--ink-faint)' }}
      >
        {statusLine()}
      </p>

      {!linked && (
        <div className="sync-link">
          <input
            className="text-input"
            value={linkInput}
            onChange={(e) => setLinkInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && runLink()}
            placeholder="Enter another device’s code…"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
          />
          <button className="btn btn--accent" onClick={runLink} disabled={busy || !linkInput.trim()}>
            Link
          </button>
        </div>
      )}
    </div>
  );
}
