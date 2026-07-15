import { db, getKV, setKV } from './db';
import type { TenseKey } from '../data/content';

/**
 * The conjugation "needs work" list: every verb×tense pair the learner has
 * missed in the typing drill. Shown on the Conjugation → Learn tab so practice
 * can target the exact forms that are still shaky.
 *
 * An entry is cleared in exactly two ways — regular practice sessions never
 * clear one (they only add or re-flag):
 *   1. the learner removes it by hand (an accidental slip that means nothing);
 *   2. the learner passes a short **focused drill** on that verb
 *      (/conjugation/focus/:infinitive): one verb across several tenses and
 *      pronouns, its flagged tenses drilled hardest. A flagged tense whose
 *      prompts are all right on the first attempt of that round is cleared; a
 *      miss keeps it (and bumps its miss count).
 *
 * Stored as a single JSON blob in the synced `kv` store (key `conjStruggles`)
 * rather than a new table, so it rides the existing last-write-wins kv sync
 * with no schema or server change. Older blobs carried a `streak` field from
 * the retired three-in-a-row clearing rule; it parses harmlessly and is
 * dropped on the next write.
 */

const KV_KEY = 'conjStruggles';

export interface StruggleEntry {
  verb: string;
  tense: TenseKey;
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

async function save(store: Store): Promise<void> {
  await setKV(KV_KEY, JSON.stringify(store));
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

/** The tenses currently flagged for one verb — the focused drill's targets. */
export async function flaggedTensesFor(verb: string): Promise<TenseKey[]> {
  const store = await load();
  return Object.values(store)
    .filter((e) => e.verb === verb)
    .sort((a, b) => b.misses - a.misses)
    .map((e) => e.tense);
}

/** Manual dismissal — the learner judged the flag an accidental slip. */
export async function removeStruggle(verb: string, tense: TenseKey): Promise<void> {
  const store = await load();
  delete store[keyOf(verb, tense)];
  await save(store);
}

/** Aggregate one round's first-attempt prompt results per tense: a tense
    counts as passed only if every one of its prompts was right. */
function foldByTense(prompts: { tense: TenseKey; correct: boolean }[]): Map<TenseKey, boolean> {
  const byTense = new Map<TenseKey, boolean>();
  for (const { tense, correct } of prompts) {
    byTense.set(tense, (byTense.get(tense) ?? true) && correct);
  }
  return byTense;
}

/**
 * Fold one regular-drill exercise's first-attempt results into the list.
 * Regular practice only ever ADDS to the list: a missed verb×tense is flagged
 * (or its miss count bumped); a correct one changes nothing — clearing happens
 * only through the focused drill or manual removal.
 */
export async function recordConjResults(
  verb: string,
  prompts: { tense: TenseKey; correct: boolean }[],
): Promise<void> {
  if (!prompts.length) return;
  const store = await load();
  const now = Date.now();
  let dirty = false;
  for (const [tense, correct] of foldByTense(prompts)) {
    if (correct) continue;
    const k = keyOf(verb, tense);
    const entry = store[k];
    if (entry) {
      entry.misses += 1;
      entry.updatedAt = now;
    } else {
      store[k] = { verb, tense, misses: 1, updatedAt: now };
    }
    dirty = true;
  }
  if (dirty) await save(store);
}

export interface FocusOutcome {
  /** Flagged tenses whose prompts were all right first try — now cleared. */
  cleared: TenseKey[];
  /** Tenses still flagged after the round: missed flagged ones, plus any
      newly flagged by a slip on a tense that wasn't on the list. */
  kept: TenseKey[];
}

/**
 * Resolve a finished focused round for one verb against its flagged tenses.
 * Every first-attempt prompt of the round is folded per tense, then:
 * flagged + fully correct → cleared off the list; flagged + missed → kept,
 * miss count bumped; a miss on a tense that wasn't flagged adds it (a slip in
 * a focused round is as real as one in a regular session). Flagged tenses the
 * round didn't cover (it covers all of them by construction) are left alone.
 */
export async function resolveFocusResults(
  verb: string,
  prompts: { tense: TenseKey; correct: boolean }[],
): Promise<FocusOutcome> {
  const store = await load();
  const now = Date.now();
  const outcome: FocusOutcome = { cleared: [], kept: [] };
  for (const [tense, correct] of foldByTense(prompts)) {
    const k = keyOf(verb, tense);
    const entry = store[k];
    if (correct) {
      if (entry) {
        delete store[k];
        outcome.cleared.push(tense);
      }
    } else if (entry) {
      entry.misses += 1;
      entry.updatedAt = now;
      outcome.kept.push(tense);
    } else {
      store[k] = { verb, tense, misses: 1, updatedAt: now };
      outcome.kept.push(tense);
    }
  }
  await save(store);
  return outcome;
}
