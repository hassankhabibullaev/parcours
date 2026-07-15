/**
 * Struggle-weighted item selection — the ONE algorithm shared by both the
 * vocabulary and conjugation drills (a task requirement: the two must behave the
 * same). Instead of drawing items uniformly at random, it favours the items the
 * learner gets wrong more often and hasn't seen in a while, so practice
 * concentrates on the material that needs it.
 *
 * Each drilled item (a saved word, or a verb infinitive) keeps a small
 * `drillStats` row: an exponentially-weighted recent error rate and the time it
 * was last seen. The weight combines the two — struggle first, spacing second —
 * over a floor that keeps every item in the running.
 */

import { db, type DrillStat } from './db';

export type StatKind = 'word' | 'verb';

/** How fast the recent error rate reacts to the latest answer (0..1). */
const ALPHA = 0.4;
/** Unseen items sit mid-scale, so new material surfaces to be assessed. */
const NEW_ERROR_RATE = 0.5;
/** An item counts as fully "due" (max spacing boost) after about a day. */
const DUE_HOURS = 24;

const WEIGHT_FLOOR = 0.15; // every item keeps a chance
const WEIGHT_ERROR = 1.0; // struggle dominates
const WEIGHT_RECENCY = 0.6; // spacing nudges

/** The draw weight for one item given its stats (higher = more likely). */
export function struggleWeight(stat: DrillStat | undefined, now = Date.now()): number {
  const errorRate = stat ? stat.errorRate : NEW_ERROR_RATE;
  const lastSeenAt = stat?.lastSeenAt ?? 0;
  const hours = (now - lastSeenAt) / 3_600_000;
  const recency = Math.min(1, hours / DUE_HOURS);
  return WEIGHT_FLOOR + WEIGHT_ERROR * errorRate + WEIGHT_RECENCY * recency;
}

/** Weighted sample without replacement — draws `limit` distinct items. */
export function weightedSample<T>(items: T[], weightOf: (t: T) => number, limit: number): T[] {
  const pool = items.map((item) => ({ item, w: Math.max(1e-6, weightOf(item)) }));
  const out: T[] = [];
  const n = Math.min(limit, pool.length);
  while (out.length < n) {
    let total = 0;
    for (const p of pool) total += p.w;
    let r = Math.random() * total;
    let idx = 0;
    while (idx < pool.length - 1) {
      r -= pool[idx].w;
      if (r <= 0) break;
      idx++;
    }
    out.push(pool[idx].item);
    pool.splice(idx, 1);
  }
  return out;
}

/** All stats of one kind, keyed by itemId for quick lookup during a draw. */
export async function loadStats(kind: StatKind): Promise<Map<string, DrillStat>> {
  const rows = await db.drillStats.where('kind').equals(kind).toArray();
  return new Map(rows.map((s) => [s.itemId, s]));
}

/** Record one graded answer, updating the item's error rate and last-seen time. */
export async function recordDrillResult(
  kind: StatKind,
  itemId: string,
  correct: boolean,
): Promise<void> {
  const key = `${kind}:${itemId}`;
  const now = Date.now();
  const existing = await db.drillStats.get(key);
  const prevRate = existing ? existing.errorRate : NEW_ERROR_RATE;
  const errorRate = prevRate * (1 - ALPHA) + (correct ? 0 : 1) * ALPHA;
  await db.drillStats.put({
    key,
    kind,
    itemId,
    attempts: (existing?.attempts ?? 0) + 1,
    correct: (existing?.correct ?? 0) + (correct ? 1 : 0),
    errorRate,
    lastSeenAt: now,
    updatedAt: now,
  });
}

/**
 * Draw `count` items (of one kind) from `items`, struggle-weighted. An optional
 * `boostOf` multiplies each item's struggle weight — the vocabulary draw uses it
 * to favour words far from graduating; conjugation passes none (unchanged).
 */
export async function drawWeighted<T>(
  kind: StatKind,
  items: T[],
  idOf: (t: T) => string,
  count: number,
  boostOf?: (t: T) => number,
): Promise<T[]> {
  const stats = await loadStats(kind);
  const now = Date.now();
  return weightedSample(
    items,
    (item) => {
      const base = struggleWeight(stats.get(idOf(item)), now);
      return boostOf ? base * boostOf(item) : base;
    },
    count,
  );
}
