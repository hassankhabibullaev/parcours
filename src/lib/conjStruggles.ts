import { db, getKV, setKV } from './db';
import type { TenseKey } from '../data/content';

/**
 * The conjugation "needs work" list: verb×tense pairs the learner has chosen
 * to keep after slipping on them in the typing drill. Shown on the
 * Conjugation → Learn tab so practice can target the exact forms that are
 * still shaky.
 *
 * The list is entirely learner-curated:
 *   – a pair gets ON the list only through the « Keep » button next to a miss
 *     on a drill's results screen (addStruggle) — nothing is flagged
 *     automatically;
 *   – a pair comes OFF the list only by hand: the row's ✕ (removeStruggle for
 *     one tense) or « Mark as learned » on the verb's study page (clearVerb).
 * The study page (/conjugation/study/:infinitive) shows the flagged tenses'
 * rules and tables and offers a short focused drill; the drill reports how
 * the round went but never edits the list itself — the learner decides when
 * a verb is learned.
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
  /** How many rounds' results this pair was kept from — orders the list. */
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

/** The current needs-work list, most-kept first. Reads the synced kv blob;
    call inside a `useLiveQuery(() => …, [])` to re-render as buttons update it. */
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

/** The tenses currently flagged for one verb — the study page's cards and the
    focused drill's targets, most-kept first. */
export async function flaggedTensesFor(verb: string): Promise<TenseKey[]> {
  const store = await load();
  return Object.values(store)
    .filter((e) => e.verb === verb)
    .sort((a, b) => b.misses - a.misses)
    .map((e) => e.tense);
}

/** Keep a missed pair for future study — the results screen's « Keep »
    button. Keeping an already-kept pair bumps its count instead. */
export async function addStruggle(verb: string, tense: TenseKey): Promise<void> {
  const store = await load();
  const k = keyOf(verb, tense);
  const now = Date.now();
  const entry = store[k];
  if (entry) {
    entry.misses += 1;
    entry.updatedAt = now;
  } else {
    store[k] = { verb, tense, misses: 1, updatedAt: now };
  }
  await save(store);
}

/** Drop one flagged tense — the needs-work row's per-tense dismissal. */
export async function removeStruggle(verb: string, tense: TenseKey): Promise<void> {
  const store = await load();
  delete store[keyOf(verb, tense)];
  await save(store);
}

/** Mark a verb learned: clear every one of its flagged tenses. The learner's
    call — the study page and the focused drill's results offer it. */
export async function clearVerb(verb: string): Promise<void> {
  const store = await load();
  let dirty = false;
  for (const k of Object.keys(store)) {
    if (store[k].verb === verb) {
      delete store[k];
      dirty = true;
    }
  }
  if (dirty) await save(store);
}
