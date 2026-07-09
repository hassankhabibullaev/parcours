import { db, getKV, setKV, type Tombstone } from './db';

/**
 * Account sync. The active code names a shared bucket on the server
 * (functions/api/sync). It is derived from the signed-in email (see lib/auth.ts)
 * and stored in kv as `syncCode`. `syncNow()` pushes this device's whole local
 * state, receives the last-write-wins merge, and applies it — so every device
 * signed in with the same email converges. See the README's Sync section.
 */

// kv keys that are device-local and must never be uploaded or overwritten.
const LOCAL_KEYS = new Set(['syncCode', 'lastSyncAt']);

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

/** The account bucket this device syncs under (empty when signed out). */
export async function getActiveCode(): Promise<string> {
  return (await getKV('syncCode')) ?? '';
}

/** True once this device has synced at least once (drives auto-sync on load). */
export async function isSyncEnabled(): Promise<boolean> {
  return (await getKV('lastSyncAt')) != null;
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
  // Never reject: a thrown error here used to leave the UI stuck on "Syncing…".
  try {
    const code = await getActiveCode();
    if (!code) return { ok: false, words: 0, error: 'Not signed in.' };

    const [savedWords, articleProgress, practiceResults, kvAll, tombstones] = await Promise.all([
      db.savedWords.toArray(),
      db.articleProgress.toArray(),
      db.practiceResults.toArray(),
      db.kv.toArray(),
      db.tombstones.toArray(),
    ]);
    const kv = kvAll.filter((e) => !LOCAL_KEYS.has(e.key));

    const res = await fetch(`/api/sync/${encodeURIComponent(code)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ savedWords, articleProgress, practiceResults, kv, tombstones }),
    });
    if (!res.ok) throw new Error(`sync failed (${res.status})`);
    const merged = (await res.json()) as SyncPayload;

    await applyMerged(merged);
    await setKV('lastSyncAt', String(Date.now()));
    lastAuto = Date.now();
    return { ok: true, words: merged.savedWords.length };
  } catch (err) {
    return { ok: false, words: 0, error: (err as Error).message };
  }
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
      // Older server versions returned tombstones without `key` (the primary
      // key here) — bulkPut then threw and aborted the whole apply. Rebuild it.
      await db.tombstones.bulkPut(
        merged.tombstones.map((t) => ({ ...t, key: t.key ?? `${t.table}:${t.recordId}` })),
      );
    },
  );
}
