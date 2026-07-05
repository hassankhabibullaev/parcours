import { db, getKV, setKV, type Tombstone } from './db';
import { getOrCreateDeviceCode } from './deviceCode';

/**
 * Device sync. The active code names a shared bucket on the server
 * (functions/api/sync). `syncNow()` pushes this device's whole local state,
 * receives the last-write-wins merge of every device on that code, and applies
 * it — so linked devices converge. See the README's Sync section.
 */

// kv keys that describe THIS device and must never be uploaded or overwritten.
const LOCAL_KEYS = new Set(['deviceCode', 'syncCode', 'lastSyncAt']);

const AUTO_THROTTLE_MS = 20_000;
let lastAuto = 0;
let inFlight: Promise<SyncResult> | null = null;

export interface SyncResult {
  ok: boolean;
  words: number;
  error?: string;
}

interface SyncPayload {
  savedWords: unknown[];
  articleProgress: unknown[];
  practiceResults: unknown[];
  kv: unknown[];
  tombstones: Tombstone[];
  updatedAt: number;
}

/** The code this device currently syncs under (a linked code, or its own). */
export async function getActiveCode(): Promise<string> {
  return (await getKV('syncCode')) ?? getOrCreateDeviceCode();
}

/** True once this device has synced at least once (drives auto-sync on load). */
export async function isSyncEnabled(): Promise<boolean> {
  return (await getKV('lastSyncAt')) != null;
}

export async function isLinked(): Promise<boolean> {
  const linked = await getKV('syncCode');
  if (!linked) return false;
  return linked !== (await getOrCreateDeviceCode());
}

/** Point this device at another device's code and merge immediately. */
export async function linkDevice(code: string): Promise<SyncResult> {
  await setKV('syncCode', code);
  return syncNow();
}

/** Stop syncing: forget the linked code and the sync-enabled flag. Local data stays. */
export async function unlink(): Promise<void> {
  await db.kv.bulkDelete(['syncCode', 'lastSyncAt']);
}

/** Sync only if enabled and not synced very recently — safe to call on every mount. */
export async function autoSync(): Promise<void> {
  if (!(await isSyncEnabled())) return;
  if (Date.now() - lastAuto < AUTO_THROTTLE_MS) return;
  lastAuto = Date.now();
  try {
    await syncNow();
  } catch {
    /* fail-soft: offline or endpoint unavailable */
  }
}

/** Push local state, pull the merged result, apply it. One at a time. */
export function syncNow(): Promise<SyncResult> {
  if (inFlight) return inFlight;
  inFlight = doSync().finally(() => {
    inFlight = null;
  });
  return inFlight;
}

async function doSync(): Promise<SyncResult> {
  const code = await getActiveCode();

  const [savedWords, articleProgress, practiceResults, kvAll, tombstones] = await Promise.all([
    db.savedWords.toArray(),
    db.articleProgress.toArray(),
    db.practiceResults.toArray(),
    db.kv.toArray(),
    db.tombstones.toArray(),
  ]);
  const kv = kvAll.filter((e) => !LOCAL_KEYS.has(e.key));

  let merged: SyncPayload;
  try {
    const res = await fetch(`/api/sync/${encodeURIComponent(code)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ savedWords, articleProgress, practiceResults, kv, tombstones }),
    });
    if (!res.ok) throw new Error(`sync failed (${res.status})`);
    merged = (await res.json()) as SyncPayload;
  } catch (err) {
    return { ok: false, words: savedWords.length, error: (err as Error).message };
  }

  await applyMerged(merged);
  await setKV('lastSyncAt', String(Date.now()));
  lastAuto = Date.now();
  return { ok: true, words: merged.savedWords.length };
}

async function applyMerged(merged: SyncPayload): Promise<void> {
  await db.transaction(
    'rw',
    [db.savedWords, db.articleProgress, db.practiceResults, db.kv, db.tombstones],
    async () => {
      // Remove words another device deleted (tombstone not older than the row).
      for (const t of merged.tombstones) {
        if (t.table !== 'savedWords') continue;
        const row = await db.savedWords.get(t.recordId);
        if (row && row.updatedAt <= t.deletedAt) await db.savedWords.delete(t.recordId);
      }
      await db.savedWords.bulkPut(merged.savedWords as never);
      await db.articleProgress.bulkPut(merged.articleProgress as never);
      await db.practiceResults.bulkPut(merged.practiceResults as never);
      const kvRows = (merged.kv as { key: string }[]).filter((e) => !LOCAL_KEYS.has(e.key));
      await db.kv.bulkPut(kvRows as never);
      await db.tombstones.bulkPut(merged.tombstones);
    },
  );
}
