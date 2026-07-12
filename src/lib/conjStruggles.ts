import { db, getKV, setKV } from './db';
import type { TenseKey } from '../data/content';

/**
 * The conjugation "needs work" list: every verb×tense pair the learner has
 * missed in the typing drill, kept until they get that pair right three times
 * in a row. Shown on the Conjugation → Learn tab so practice can target the
 * exact forms that are still shaky.
 *
 * Stored as a single JSON blob in the synced `kv` store (key `conjStruggles`)
 * rather than a new table, so it rides the existing last-write-wins kv sync
 * with no schema or server change. One drill exercise is one trial per pair:
 * the pair counts as correct only when every prompt for it was right first try
 * (an accent slip still counts as correct, matching the drill's scoring).
 */

const KV_KEY = 'conjStruggles';

/** Consecutive correct trials that clear a verb×tense from the list. */
export const CONJ_MASTERY_STREAK = 3;

export interface StruggleEntry {
  verb: string;
  tense: TenseKey;
  /** Consecutive correct trials since the last miss (0…CONJ_MASTERY_STREAK-1). */
  streak: number;
  /** Total times this pair has been missed — orders the list. */
  misses: number;
  updatedAt: number;
}

type Store = Record<string, StruggleEntry>;

const keyOf = (verb: string, tense: TenseKey) => `${verb}|${tense}`;

function parse(raw: string | null): Store {
  if (!raw) return {};
  try {
    const obj = JSON.parse(raw) as Store;
    return obj && typeof obj === 'object' ? obj : {};
  } catch {
    return {};
  }
}

async function load(): Promise<Store> {
  return parse(await getKV(KV_KEY));
}

/** The current needs-work list, most-missed first. Reads the synced kv blob;
    call inside a `useLiveQuery(() => …, [])` to re-render as the drill updates it. */
export async function getStruggles(): Promise<StruggleEntry[]> {
  const store = await load();
  return Object.values(store).sort(
    (a, b) => b.misses - a.misses || b.updatedAt - a.updatedAt,
  );
}

/** Live-query source: the raw kv row, so dexie-react-hooks tracks changes. */
export function conjStrugglesRow() {
  return db.kv.get(KV_KEY);
}

/**
 * Fold one exercise's first-attempt prompt results into the list. Results are
 * aggregated per tense first (a single-tense drill fires three prompts for the
 * same pair — one wrong makes the whole pair a miss this round), then each
 * verb×tense is advanced: a correct trial bumps the streak and clears the pair
 * at CONJ_MASTERY_STREAK; a miss resets the streak and (re)adds the pair.
 */
export async function recordConjResults(
  verb: string,
  prompts: { tense: TenseKey; correct: boolean }[],
): Promise<void> {
  if (!prompts.length) return;
  const byTense = new Map<TenseKey, boolean>();
  for (const { tense, correct } of prompts) {
    byTense.set(tense, (byTense.get(tense) ?? true) && correct);
  }

  const store = await load();
  const now = Date.now();
  for (const [tense, correct] of byTense) {
    const k = keyOf(verb, tense);
    const entry = store[k];
    if (correct) {
      if (entry) {
        entry.streak += 1;
        entry.updatedAt = now;
        if (entry.streak >= CONJ_MASTERY_STREAK) delete store[k];
      }
    } else if (entry) {
      entry.streak = 0;
      entry.misses += 1;
      entry.updatedAt = now;
    } else {
      store[k] = { verb, tense, streak: 0, misses: 1, updatedAt: now };
    }
  }
  await setKV(KV_KEY, JSON.stringify(store));
}
