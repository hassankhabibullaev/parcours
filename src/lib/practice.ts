import { db, type SavedWord } from './db';
import { recordDrillResult } from './struggle';

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

/** Share of a session reserved for words still missing today's dot in the mode. */
export const FRESH_DRAW_SHARE = 0.8;

/**
 * Draw `limit` words for ONE practice mode. 80% of the session comes from
 * words that haven't earned today's dot in this mode — never practised today,
 * or practised but the dot was knocked off by a mistake (both can still earn
 * it back today). The remaining 20% is drawn from the whole pool regardless
 * of today's history, so already-done words keep resurfacing occasionally.
 * Both picks are uniform random; when the fresh bucket runs short the rest of
 * the pool fills the gap, and the final order is shuffled.
 */
export function drawFromPool(pool: SavedWord[], limit: number, kind: DrillKind): SavedWord[] {
  const dKey = dayKey(kind);
  const today = dayStamp();
  const fresh = shuffle(pool.filter((w) => w[dKey] !== today));
  const target = Math.min(Math.round(limit * FRESH_DRAW_SHARE), fresh.length);
  const out = fresh.slice(0, target);
  const taken = new Set(out.map((w) => w.id));
  const rest = shuffle(pool.filter((w) => !taken.has(w.id)));
  out.push(...rest.slice(0, limit - out.length));
  return shuffle(out);
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

/** Correct *days* (dots) that clear each mode: 3 for Word Match, 2 for the
 *  rest. A word must clear EVERY mode to graduate to the learnt shelf — and
 *  since a mode earns at most one dot per day, that's at least 3 days. */
export const LEARNT_STREAKS: Record<DrillKind, number> = {
  match: 3,
  blank: 2,
  listen: 2,
  choose: 2,
};
/** Total progress dots a word shows (all modes), shown in the lexicon lede. */
export const TOTAL_DOTS = DRILL_KINDS.reduce((n, k) => n + LEARNT_STREAKS[k], 0);

/** The SavedWord field names backing one mode's counters. */
export const streakKey = (k: DrillKind) => `${k}Streak` as const;
const dayKey = (k: DrillKind) => `${k}StreakDay` as const;

/** One mode's correct-day streak (match falls back to the legacy counter). */
export function streakOf(w: SavedWord, kind: DrillKind): number {
  if (kind === 'match') return w.matchStreak ?? w.streak ?? 0;
  return w[streakKey(kind)] ?? 0;
}

/**
 * A word is learnt only once EVERY mode is cleared — three correct days in
 * Word Match and two in each of Fill in the Blank, Listen & Type and
 * Listen & Choose. Clearing some modes but not others is not enough.
 */
export function hasGraduated(streaks: Record<DrillKind, number>): boolean {
  return DRILL_KINDS.every((k) => streaks[k] >= LEARNT_STREAKS[k]);
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
 * Every mode keeps its own dots, one per correct *day*: a correct answer
 * earns today's dot for that mode unless it's already been earned — NEVER
 * more than one dot per mode per day, so a word can't race to learnt in one
 * sitting (Word Match alone takes three separate days). A mistake can only
 * cost TODAY's dot: if this mode earned one today it is knocked off and can
 * be earned back by a later correct answer the same day — every extra earn
 * first requires a loss, so the net gain per day still can't exceed one dot.
 * Dots banked on previous days are never lost. A word is learnt only while
 * EVERY mode holds its full dot count (see hasGraduated); a mistake that
 * takes back a mode's just-earned graduating dot sends a learnt word back to
 * the learning shelf (it can graduate again the same day by winning the dot
 * back).
 */
export async function recordWordResult(
  word: SavedWord,
  correct: boolean,
  kind: DrillKind,
): Promise<void> {
  const sKey = streakKey(kind);
  const dKey = dayKey(kind);
  const today = dayStamp();

  // Resulting per-mode streaks after this answer (start from current).
  const streaks = Object.fromEntries(
    DRILL_KINDS.map((k) => [k, streakOf(word, k)]),
  ) as Record<DrillKind, number>;

  const patch: Partial<SavedWord> = { updatedAt: Date.now() };
  if (correct) {
    // At most one dot per calendar day: only count this correct answer if
    // today's dot for this mode isn't already earned.
    if (word[dKey] !== today) {
      streaks[kind] += 1;
      patch[sKey] = streaks[kind];
      patch[dKey] = today;
      // Graduate only when EVERY mode is cleared, never on some alone.
      if (hasGraduated(streaks)) patch.learned = 1;
    }
  } else if (word[dKey] === today) {
    // A mistake can only ever cost TODAY's dot. If this mode earned one
    // today, knock it off and clear the day gate so it can be won back by a
    // later correct answer the same day. Dots banked on previous days are
    // never touched — with today's dot unearned there is nothing to lose,
    // and the day gate is already open for a later correct answer.
    if (streaks[kind] > 0) {
      streaks[kind] -= 1;
      patch[sKey] = streaks[kind];
    }
    patch[dKey] = '';
    // Dropping any mode below its threshold un-learns the word.
    if (!hasGraduated(streaks)) patch.learned = 0;
  }
  await db.savedWords.update(word.id, patch);
  // Keep per-word attempt stats up to date (error rate + last seen).
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
