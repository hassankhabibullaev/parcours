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
 * conjugation drill uses to pick verbs. See lib/struggle.ts.
 */
export function drawFromPool(pool: SavedWord[], limit: number): Promise<SavedWord[]> {
  return drawWeighted('word', pool, (w) => w.id, limit);
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
 * Word Match & Remember?: 5 words per session, up to 6 sessions, the word
 * count rounded down to the nearest multiple of 5 —
 * `sessions = min(6, floor(pool / 5))`. 0 means the drill is gated.
 */
export function matchSessionCount(poolSize: number): number {
  return Math.min(MATCH_MAX_SESSIONS, Math.floor(poolSize / MATCH_WORDS_PER_SESSION));
}

export const BLANK_MIN_SESSIONS = 5;
export const BLANK_MAX_SESSIONS = 10;

/**
 * Fill in the Blank: one word per session, `sessions = clamp(pool, 5, 10)`.
 * Below 5 words the drill is gated (returns 0).
 */
export function blankSessionCount(poolSize: number): number {
  if (poolSize < BLANK_MIN_SESSIONS) return 0;
  return Math.min(BLANK_MAX_SESSIONS, poolSize);
}

/* ——— Learnt-shelf progression ——— */

export type DrillKind = 'match' | 'blank';

/** Consecutive correct answers that promote a word, per exercise family. */
export const LEARNT_STREAKS: Record<DrillKind, number> = { match: 3, blank: 2 };
/** A streak survives one miss; it resets after this many consecutive misses. */
export const MISS_RUN_RESET = 2;

export const matchStreakOf = (w: SavedWord): number => w.matchStreak ?? w.streak ?? 0;
export const blankStreakOf = (w: SavedWord): number => w.blankStreak ?? 0;

/** 0..1 progress toward automatic promotion — the closer of the two tracks. */
export function promotionProgress(w: SavedWord): number {
  return Math.min(
    1,
    Math.max(matchStreakOf(w) / LEARNT_STREAKS.match, blankStreakOf(w) / LEARNT_STREAKS.blank),
  );
}

/**
 * Update a word's learning progress after one practice answer.
 *
 * Word Match / Remember? and Fill in the Blank keep independent streaks
 * (promoting at 3 and 2 consecutive correct respectively — hitting either
 * threshold promotes). One wrong answer is forgiven — the streak holds; two
 * consecutive wrong answers reset that exercise's streak and send a learnt
 * word back to the learning shelf.
 */
export async function recordWordResult(
  word: SavedWord,
  correct: boolean,
  kind: DrillKind,
): Promise<void> {
  const streakKey = kind === 'match' ? 'matchStreak' : 'blankStreak';
  const missKey = kind === 'match' ? 'matchMissRun' : 'blankMissRun';
  const streak = kind === 'match' ? matchStreakOf(word) : blankStreakOf(word);
  const missRun = word[missKey] ?? 0;

  const patch: Partial<SavedWord> = { updatedAt: Date.now() };
  if (correct) {
    const next = streak + 1;
    patch[streakKey] = next;
    patch[missKey] = 0;
    if (next >= LEARNT_STREAKS[kind]) patch.learned = 1;
  } else {
    const run = missRun + 1;
    patch[missKey] = run;
    if (run >= MISS_RUN_RESET) {
      patch[streakKey] = 0;
      patch[missKey] = 0; // the reset consumed the run
      patch.learned = 0;
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
