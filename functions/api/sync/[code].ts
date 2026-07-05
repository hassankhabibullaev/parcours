/**
 * Device-sync endpoint for Parcours.
 *
 * A "sync code" (the device / group code shown on the dashboard) is the key to a
 * shared bucket in KV. A device POSTs its full local state; the server merges it
 * with the stored bucket using last-write-wins (by `updatedAt`, and `deletedAt`
 * for tombstones) and returns the merged state, which the device then applies.
 * Two devices that use the same code therefore converge on the same progress.
 *
 * The code is the only secret — anyone who knows it can read/write that bucket.
 * That is by design (like a shared passphrase); codes carry ~3M combinations.
 */

interface KV {
  get(key: string, type: 'json'): Promise<unknown>;
  put(key: string, value: string): Promise<void>;
}
interface Env {
  SYNC_KV: KV;
}
type Ctx = { request: Request; env: Env; params: { code: string | string[] } };

// Tables that sync, and the primary key each is keyed by.
const PKS = {
  savedWords: 'id',
  articleProgress: 'articleId',
  practiceResults: 'id',
  kv: 'key',
} as const;
type Table = keyof typeof PKS;
const TABLES = Object.keys(PKS) as Table[];

type Row = Record<string, unknown> & { updatedAt?: number };
type Tombstone = { table: string; recordId: string; deletedAt: number };
type Bucket = {
  savedWords: Record<string, Row>;
  articleProgress: Record<string, Row>;
  practiceResults: Record<string, Row>;
  kv: Record<string, Row>;
  tombstones: Record<string, Tombstone>;
  updatedAt: number;
};

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function emptyBucket(): Bucket {
  return {
    savedWords: {},
    articleProgress: {},
    practiceResults: {},
    kv: {},
    tombstones: {},
    updatedAt: 0,
  };
}

function validCode(code: string | string[]): code is string {
  return typeof code === 'string' && code.length >= 4 && code.length <= 80;
}

/** Merge one incoming table into the bucket, last-write-wins by updatedAt. */
function mergeTable(target: Record<string, Row>, incoming: unknown, pk: string): void {
  if (!Array.isArray(incoming)) return;
  for (const row of incoming as Row[]) {
    if (!row || typeof row !== 'object') continue;
    const key = String(row[pk]);
    if (key === 'undefined') continue;
    const cur = target[key];
    if (!cur || (row.updatedAt ?? 0) >= (cur.updatedAt ?? 0)) target[key] = row;
  }
}

/** Fold the client payload into the stored bucket and drop tombstoned rows. */
function merge(bucket: Bucket, body: Record<string, unknown>): Bucket {
  for (const table of TABLES) mergeTable(bucket[table], body[table], PKS[table]);

  const incomingTombs = Array.isArray(body.tombstones) ? (body.tombstones as Tombstone[]) : [];
  for (const t of incomingTombs) {
    if (!t || typeof t.table !== 'string' || t.recordId == null) continue;
    const key = `${t.table}:${t.recordId}`;
    const cur = bucket.tombstones[key];
    if (!cur || (t.deletedAt ?? 0) >= cur.deletedAt) {
      bucket.tombstones[key] = { table: t.table, recordId: String(t.recordId), deletedAt: t.deletedAt ?? 0 };
    }
  }

  // A tombstone hides any row of the same identity that isn't newer than it.
  for (const key of Object.keys(bucket.tombstones)) {
    const t = bucket.tombstones[key];
    const table = bucket[t.table as Table];
    const row = table?.[t.recordId];
    if (row && (row.updatedAt ?? 0) <= t.deletedAt) delete table[t.recordId];
  }

  bucket.updatedAt = Date.now();
  return bucket;
}

/** Serialize the bucket back to the array shape the client expects. */
function toPayload(bucket: Bucket) {
  return {
    savedWords: Object.values(bucket.savedWords),
    articleProgress: Object.values(bucket.articleProgress),
    practiceResults: Object.values(bucket.practiceResults),
    kv: Object.values(bucket.kv),
    tombstones: Object.values(bucket.tombstones),
    updatedAt: bucket.updatedAt,
  };
}

export const onRequestOptions = () => new Response(null, { headers: CORS });

export const onRequestGet = async ({ env, params }: Ctx): Promise<Response> => {
  if (!validCode(params.code)) return json({ error: 'bad code' }, 400);
  const bucket = ((await env.SYNC_KV.get(params.code, 'json')) as Bucket) ?? emptyBucket();
  return json(toPayload(bucket));
};

export const onRequestPost = async ({ request, env, params }: Ctx): Promise<Response> => {
  if (!validCode(params.code)) return json({ error: 'bad code' }, 400);
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'bad json' }, 400);
  }
  const bucket = ((await env.SYNC_KV.get(params.code, 'json')) as Bucket) ?? emptyBucket();
  const merged = merge(bucket, body);
  await env.SYNC_KV.put(params.code, JSON.stringify(merged));
  return json(toPayload(merged));
};
