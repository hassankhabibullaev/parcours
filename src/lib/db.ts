import Dexie, { type EntityTable } from 'dexie';

/**
 * One shared, local-first store for all three tools. Every record carries
 * `updatedAt` so a later sync stage can merge devices with last-write-wins.
 * Boolean flags are stored as 0 | 1 because IndexedDB cannot index booleans.
 */

export interface SavedWord {
  id: string;
  /** Dictionary base form — the key used to highlight all inflections. */
  lemma: string;
  /** The word or phrase exactly as the learner saw/entered it. */
  display: string;
  translation: string;
  definition: string;
  /** The sentence the word appeared in, if saved from an article. */
  sentence: string;
  articleId: number | null;
  learned: 0 | 1;
  /**
   * Legacy single correct-streak counter (pre per-exercise split). Migrated
   * into matchStreak on first load (lib/migrate.ts); kept only so old synced
   * records still parse.
   */
  streak?: number;
  /**
   * Per-exercise progression, driving the automatic move to the learnt shelf:
   * Word Match / Remember? promote at 3 consecutive correct, Fill in the
   * Blank at 2 — two independent counters (hitting either promotes). A single
   * miss is forgiven; a streak only resets (and a learnt word only demotes)
   * after two consecutive misses, tracked by the missRun counters.
   * None are indexed; absent on old records (read as 0).
   */
  matchStreak?: number;
  matchMissRun?: number;
  blankStreak?: number;
  blankMissRun?: number;
  addedAt: number;
  updatedAt: number;
}

export interface ArticleProgress {
  articleId: number;
  read: 0 | 1;
  /** Scroll position within the article, 0..1. */
  position: number;
  lastOpenedAt: number;
  updatedAt: number;
}

export interface PracticeResult {
  id: string;
  tool: 'vocabulary' | 'conjugation';
  /** e.g. 'learn', 'practice', 'remember', 'typing' */
  mode: string;
  /** Conjugation only: which tense the round covered ('mixed' allowed). */
  tense: string | null;
  score: number;
  total: number;
  finishedAt: number;
  updatedAt: number;
}

export interface KVEntry {
  key: string;
  value: string;
  updatedAt: number;
}

/** Cached dictionary lookups — never synced, purely a network saver. */
export interface LookupCacheEntry {
  term: string;
  translation: string;
  definition: string;
  updatedAt: number;
}

/**
 * A record of a deletion, so sync can propagate it (a plain delete would just
 * be re-created from another device). `key` is `${table}:${recordId}`.
 */
export interface Tombstone {
  key: string;
  table: string;
  recordId: string;
  deletedAt: number;
}

/**
 * Per-item practice performance, driving the struggle-weighted draw shared by
 * the vocabulary and conjugation drills (see lib/struggle.ts). Device-local —
 * NOT synced (like lookupCache): it is a local refinement of *which* items to
 * surface, while the graded progress itself (streaks, rounds) does sync.
 * `key` is `${kind}:${itemId}`; `itemId` is a saved-word id or a verb infinitive.
 */
export interface DrillStat {
  key: string;
  kind: 'word' | 'verb';
  itemId: string;
  attempts: number;
  correct: number;
  /** Exponentially-weighted recent error rate, 0 (always right) … 1 (always wrong). */
  errorRate: number;
  lastSeenAt: number;
  updatedAt: number;
}

// The IndexedDB name predates the rename to Parcours; changing it would
// silently orphan existing local progress, so it stays.
export const db = new Dexie('redaction') as Dexie & {
  savedWords: EntityTable<SavedWord, 'id'>;
  articleProgress: EntityTable<ArticleProgress, 'articleId'>;
  practiceResults: EntityTable<PracticeResult, 'id'>;
  kv: EntityTable<KVEntry, 'key'>;
  lookupCache: EntityTable<LookupCacheEntry, 'term'>;
  tombstones: EntityTable<Tombstone, 'key'>;
  drillStats: EntityTable<DrillStat, 'key'>;
};

db.version(1).stores({
  savedWords: 'id, lemma, learned, addedAt',
  articleProgress: 'articleId, read, lastOpenedAt',
  practiceResults: 'id, tool, finishedAt',
  kv: 'key',
});

db.version(2).stores({
  lookupCache: 'term',
});

db.version(3).stores({
  tombstones: 'key',
});

db.version(4).stores({
  drillStats: 'key, kind',
});

/** Delete a saved word and leave a tombstone so the deletion syncs across devices. */
export async function deleteSavedWord(id: string): Promise<void> {
  await db.transaction('rw', db.savedWords, db.tombstones, async () => {
    await db.savedWords.delete(id);
    await db.tombstones.put({
      key: `savedWords:${id}`,
      table: 'savedWords',
      recordId: id,
      deletedAt: Date.now(),
    });
  });
}

export async function getKV(key: string): Promise<string | null> {
  const entry = await db.kv.get(key);
  return entry?.value ?? null;
}

export async function setKV(key: string, value: string): Promise<void> {
  await db.kv.put({ key, value, updatedAt: Date.now() });
}
