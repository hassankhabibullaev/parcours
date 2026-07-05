import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { getOrCreateDeviceCode, normalizeCode } from '../lib/deviceCode';
import { linkDevice, syncNow, unlink } from '../lib/sync';
import { errorBuzz, successChime } from '../lib/sound';
import { ExportIcon, ImportIcon } from './icons';

type View = 'menu' | 'import' | 'export';
type Status = { kind: 'idle' | 'busy' | 'ok' | 'error'; message?: string };

interface SyncModalProps {
  onClose: () => void;
}

/**
 * The sync dialog: pick a direction, deal in codes. "Export" publishes this
 * device's progress and shows the code to type elsewhere; "Import" points this
 * device at another device's code and merges immediately. Both directions end
 * with the two devices sharing one bucket that auto-syncs from then on.
 */
export default function SyncModal({ onClose }: SyncModalProps) {
  const [view, setView] = useState<View>('menu');
  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [codeInput, setCodeInput] = useState('');
  const [copied, setCopied] = useState(false);

  const [deviceCode, setDeviceCode] = useState<string | null>(null);
  useEffect(() => {
    getOrCreateDeviceCode().then(setDeviceCode);
  }, []);

  const syncCode = useLiveQuery(() => db.kv.get('syncCode'), [])?.value;
  const activeCode = syncCode ?? deviceCode ?? '· · ·';
  const linked = Boolean(syncCode && deviceCode && syncCode !== deviceCode);
  const busy = status.kind === 'busy';

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** Outcome statuses come with the app's shared success/error sounds. */
  function report(next: Status) {
    if (next.kind === 'ok') successChime();
    else if (next.kind === 'error') errorBuzz();
    setStatus(next);
  }

  function show(next: View) {
    setStatus({ kind: 'idle' });
    setCopied(false);
    setView(next);
    // Publishing on entry means the code on screen is already redeemable.
    if (next === 'export') {
      setStatus({ kind: 'busy', message: 'Publishing this device’s progress…' });
      syncNow().then((r) =>
        report(
          r.ok
            ? { kind: 'ok', message: 'Ready — enter this code on your other device.' }
            : { kind: 'error', message: r.error ?? 'Could not reach the sync service.' },
        ),
      );
    }
  }

  async function runImport() {
    const code = normalizeCode(codeInput);
    if (!code) {
      report({ kind: 'error', message: 'Codes look like plume-gazette-marge-42.' });
      return;
    }
    if (code === deviceCode) {
      report({ kind: 'error', message: 'That’s this device’s own code.' });
      return;
    }
    setStatus({ kind: 'busy', message: 'Importing…' });
    const r = await linkDevice(code);
    report(
      r.ok
        ? { kind: 'ok', message: `Done — ${r.words} words merged. Devices stay in sync from now on.` }
        : { kind: 'error', message: r.error ?? 'Could not reach the sync service.' },
    );
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Sync devices"
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>

        {view === 'menu' && (
          <>
            <h3 className="modal__heading">Sync devices</h3>
            <p className="modal__lede">
              {linked
                ? 'This device is linked — progress merges automatically.'
                : 'Move your progress between phones and computers.'}
            </p>

            <button className="sync-option" onClick={() => show('import')}>
              <ImportIcon className="sync-option__icon" />
              <span>
                <span className="sync-option__title">Import from another device</span>
                <span className="sync-option__hint">
                  Enter the code shown on your other device.
                </span>
              </span>
            </button>
            <button className="sync-option" onClick={() => show('export')}>
              <ExportIcon className="sync-option__icon" />
              <span>
                <span className="sync-option__title">Export to another device</span>
                <span className="sync-option__hint">
                  Get this device’s code to enter over there.
                </span>
              </span>
            </button>

            {linked && (
              <button
                className="btn btn--ghost modal__footer-btn"
                onClick={async () => {
                  await unlink();
                }}
              >
                Unlink this device
              </button>
            )}
          </>
        )}

        {view === 'import' && (
          <>
            <button className="modal__back" onClick={() => show('menu')}>
              ← Back
            </button>
            <h3 className="modal__heading">Import</h3>
            <p className="modal__lede">
              On your other device, choose <em>Export</em> and type its code here. Nothing is
              overwritten — the two histories merge.
            </p>
            <input
              className="text-input"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !busy && runImport()}
              placeholder="plume-gazette-marge-42"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              autoFocus
            />
            <div className="modal__actions">
              {status.kind === 'ok' ? (
                <button className="btn btn--primary" onClick={onClose}>
                  Done
                </button>
              ) : (
                <button
                  className="btn btn--accent"
                  onClick={runImport}
                  disabled={busy || !codeInput.trim()}
                >
                  {busy ? 'Importing…' : 'Import'}
                </button>
              )}
            </div>
          </>
        )}

        {view === 'export' && (
          <>
            <button className="modal__back" onClick={() => show('menu')}>
              ← Back
            </button>
            <h3 className="modal__heading">Export</h3>
            <p className="modal__lede">
              On your other device, choose <em>Import</em> and enter this code:
            </p>
            <button className="desk-code desk-code--btn" onClick={copyCode} title="Copy code">
              {activeCode}
              <span className="desk-code__copy">{copied ? 'copied ✓' : 'tap to copy'}</span>
            </button>
          </>
        )}

        {status.message && (view !== 'import' || status.kind !== 'idle') && (
          <p
            className="sync-status"
            style={{ color: status.kind === 'error' ? 'var(--accent-deep)' : 'var(--ink-faint)' }}
          >
            {status.message}
          </p>
        )}
      </div>
    </div>
  );
}
