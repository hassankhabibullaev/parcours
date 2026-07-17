import { db, type SavedWord } from './db';
import { drawWeighted, recordDrillResult } from './struggle';

export function shuffle<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

export interface DrawOptions {
  /** Which shelf to draw from: 0 = currently learning (default), 1 = learned. */
  learned?: 0 | 1;
  /** Drills that show the translation as a prompt need it to be non-empty. */
  requireTranslation?: boolean;
}

/**
 * The words a drill can draw from — session sizing is computed from this
 * pool's size before drawing (see matchSessionCount / blankSessionCount).
 */
export async function loadPracticePool({
  learned = 0,
  requireTranslation = false,
}: DrawOptions = {}): Promise<SavedWord[]> {
  let pool = await db.savedWords.where('learned').equals(learned).toArray();
  if (requireTranslation) pool = pool.filter((w) => w.translation.trim());
  return pool;
}

/**
 * Draw `limit` words from a pool, struggle-weighted (the words missed most
 * often and seen least recently come up first) — the same algorithm the
 * conjugation drill uses to pick verbs (see lib/struggle.ts) — and additionally
 * biased toward words far from graduating (progressBoost), so practice
 * concentrates on the ones with the fewest progress dots rather than the ones
 * about to be learnt.
 */
export function drawFromPool(pool: SavedWord[], limit: number): Promise<SavedWord[]> {
  return drawWeighted('word', pool, (w) => w.id, limit, progressBoost);
}

/** Case-normalize but keep accents (exact match check). */
function normalizeCase(text: string): string {
  return text.trim().toLowerCase().replace(/’/g, "'").replace(/\s+/g, ' ');
}

/** Fully fold accents/ligatures for the tolerant check. */
export function foldAccents(text: string): string {
  return normalizeCase(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/œ/g, 'oe')
    .replace(/æ/g, 'ae');
}

export type AnswerGrade = 'correct' | 'accents' | 'wrong';

/**
 * Grade a typed answer: exact (ignoring case) → correct; matching once accents
 * are stripped → 'accents' (counts as right, but the accented form is shown).
 */
export function gradeAnswer(input: string, accepted: string[]): AnswerGrade {
  const exact = normalizeCase(input);
  if (accepted.some((a) => normalizeCase(a) === exact)) return 'correct';
  const folded = foldAccents(input);
  if (accepted.some((a) => foldAccents(a) === folded)) return 'accents';
  return 'wrong';
}

/* ——— Session sizing (shared rules) ———
   Every drill needs at least MIN_PRACTICE_WORDS in its pool to open. */

export const MIN_PRACTICE_WORDS = 5;

export const MATCH_WORDS_PER_SESSION = 5;
export const MATCH_MAX_SESSIONS = 6;

/**
 * Word Match: 5 words per session, up to 6 sessions, the word count rounded
 * down to the nearest multiple of 5 —
 * `sessions = min(6, floor(pool / 5))`. 0 means the drill is gated.
 */
export function matchSessionCount(poolSize: number): number {
  return Math.min(MATCH_MAX_SESSIONS, Math.floor(poolSize / MATCH_WORDS_PER_SESSION));
}

export const BLANK_MIN_SESSIONS = 5;
export const BLANK_MAX_SESSIONS = 10;

/**
 * One-word-per-session drills (Fill in the Blank, Listen & Type,
 * Listen & Choose): `sessions = clamp(pool, 5, 10)`.
 * Below 5 words the drill is gated (returns 0).
 */
export function blankSessionCount(poolSize: number): number {
  if (poolSize < BLANK_MIN_SESSIONS) return 0;
  return Math.min(BLANK_MAX_SESSIONS, poolSize);
}

/* ——— Learnt-shelf progression ——— */

/** The four practice modes. Every mode runs on BOTH shelves (learning and
 *  learned) — the shelf picks the pool, the mode picks the streak it feeds. */
export type DrillKind = 'match' | 'blank' | 'listen' | 'choose';
export const DRILL_KINDS: DrillKind[] = ['match', 'blank', 'listen', 'choose'];

/** Which shelf a drill route runs on (`/vocabulary/:mode/:shelf`). */
export type VocabShelf = 'learning' | 'learned';
export const SHELF_FLAG: Record<VocabShelf, 0 | 1> = { learning: 0, learned: 1 };

export function parseShelf(raw: string | undefined): VocabShelf | null {
  return raw === 'learning' || raw === 'learned' ? raw : null;
}

/** The `practiceResults.mode` string for one round: mode key, with a
 *  '-learned' suffix when the round ran on the learnt shelf. */
export function roundMode(kind: DrillKind, shelf: VocabShelf): string {
  return shelf === 'learned' ? `${kind}-learned` : kind;
}

/** Correct *days* that clear each mode. A word must clear EVERY mode — pass
 *  it at least twice in each of the four — to graduate to the learnt shelf. */
export const PASSES_PER_MODE = 2;
export const LEARNT_STREAKS: Record<DrillKind, number> = {
  match: PASSES_PER_MODE,
  blank: PASSES_PER_MODE,
  listen: PASSES_PER_MODE,
  choose: PASSES_PER_MODE,
};
/** Total progress dots a word shows (all modes), used for draw biasing. */
export const TOTAL_DOTS = DRILL_KINDS.reduce((n, k) => n + LEARNT_STREAKS[k], 0);
/** A streak survives one miss; it resets after this many consecutive misses. */
export const MISS_RUN_RESET = 2;

/** The SavedWord field names backing one mode's counters. */
export const streakKey = (k: DrillKind) => `${k}Streak` as const;
export const missKey = (k: DrillKind) => `${k}MissRun` as const;
const dayKey = (k: DrillKind) => `${k}StreakDay` as const;

/** One mode's correct-day streak (match falls back to the legacy counter). */
export function streakOf(w: SavedWord, kind: DrillKind): number {
  if (kind === 'match') return w.matchStreak ?? w.streak ?? 0;
  return w[streakKey(kind)] ?? 0;
}

/**
 * A word is learnt only once EVERY mode is cleared — at least two correct
 * days in each of Word Match, Fill in the Blank, Listen & Type and
 * Listen & Choose. Clearing some modes but not others is not enough.
 */
export function hasGraduated(streaks: Record<DrillKind, number>): boolean {
  return DRILL_KINDS.every((k) => streaks[k] >= LEARNT_STREAKS[k]);
}

/** How strongly the draw favours words with fewer progress dots (0 = off). */
export const PROGRESS_BIAS = 2;

/**
 * Draw-weight multiplier that concentrates practice on words far from
 * graduating: a word with no lit dots is favoured most (1 + PROGRESS_BIAS×), one
 * about to be learnt least (≈1×). It multiplies the struggle weight — struggle
 * and spacing still apply on top.
 */
export function progressBoost(w: SavedWord): number {
  const lit = DRILL_KINDS.reduce(
    (n, k) => n + Math.min(streakOf(w, k), LEARNT_STREAKS[k]),
    0,
  );
  return 1 + PROGRESS_BIAS * ((TOTAL_DOTS - lit) / TOTAL_DOTS);
}

/**
 * Local calendar day (YYYY-MM-DD) used to day-gate streak progression, so a
 * word can advance at most once per day. Local time on purpose: "a new day"
 * should mean the learner's day, not UTC.
 */
export function dayStamp(ts: number = Date.now()): string {
  const d = new Date(ts);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Update a word's learning progress after one practice answer.
 *
 * Every mode keeps an independent streak that counts distinct *days* the word
 * was answered right, not answers within a day: a correct answer advances a
 * streak only the first time that mode is cleared on a given calendar day;
 * further correct answers the same day hold it steady. A word graduates to
 * the learnt shelf only once EVERY mode is cleared — at least two correct
 * days in each (see hasGraduated). One wrong answer is forgiven — the streak
 * holds; two consecutive wrong answers reset that mode's streak (clearing its
 * day so the same day can start fresh) and, since a learnt word now fails the
 * every-mode test, send it back to the learning shelf.
 */
export async function recordWordResult(
  word: SavedWord,
  correct: boolean,
  kind: DrillKind,
): Promise<void> {
  const sKey = streakKey(kind);
  const mKey = missKey(kind);
  const dKey = dayKey(kind);
  const missRun = word[mKey] ?? 0;
  const today = dayStamp();

  // Resulting per-mode streaks after this answer (start from current).
  const streaks = Object.fromEntries(
    DRILL_KINDS.map((k) => [k, streakOf(word, k)]),
  ) as Record<DrillKind, number>;

  const patch: Partial<SavedWord> = { updatedAt: Date.now() };
  if (correct) {
    patch[mKey] = 0;
    // At most one advance per calendar day: only count this correct answer if
    // the streak hasn't already ticked up today.
    if (word[dKey] !== today) {
      streaks[kind] += 1;
      patch[sKey] = streaks[kind];
      patch[dKey] = today;
      // Graduate only when EVERY mode is cleared, never on some alone.
      if (hasGraduated(streaks)) patch.learned = 1;
    }
  } else {
    const run = missRun + 1;
    patch[mKey] = run;
    if (run >= MISS_RUN_RESET) {
      patch[sKey] = 0;
      patch[mKey] = 0; // the reset consumed the run
      patch[dKey] = ''; // clear the day so a later correct today restarts at 1
      patch.learned = 0; // dropping any mode below threshold un-learns it
    }
  }
  await db.savedWords.update(word.id, patch);
  // Feed the struggle-weighted draw so missed words resurface sooner.
  await recordDrillResult('word', word.id, correct);
}

export async function recordRound(
  tool: 'vocabulary' | 'conjugation',
  mode: string,
  score: number,
  total: number,
  tense: string | null = null,
): Promise<void> {
  const now = Date.now();
  await db.practiceResults.add({
    id: crypto.randomUUID(),
    tool,
    mode,
    tense,
    score,
    total,
    finishedAt: now,
    updatedAt: now,
  });
}
