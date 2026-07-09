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
 * Words for a practice round, drawn struggle-weighted (the words missed most
 * often and seen least recently come up first) — the same algorithm the
 * conjugation drill uses to pick verbs. See lib/struggle.ts.
 */
export async function drawPracticeWords(
  limit: number,
  { learned = 0, requireTranslation = false }: DrawOptions = {},
): Promise<SavedWord[]> {
  let pool = await db.savedWords.where('learned').equals(learned).toArray();
  if (requireTranslation) pool = pool.filter((w) => w.translation.trim());
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

/** A word graduates to the learnt shelf after this many correct answers in a row. */
export const LEARNT_STREAK = 3;

/**
 * Update a word's learning progress after one practice answer. Correct
 * answers grow the streak and promote the word to learnt at LEARNT_STREAK;
 * any miss resets the streak and sends the word back to still-learning.
 */
export async function recordWordResult(word: SavedWord, correct: boolean): Promise<void> {
  const streak = correct ? (word.streak ?? 0) + 1 : 0;
  const learned: 0 | 1 = correct ? (streak >= LEARNT_STREAK ? 1 : word.learned) : 0;
  await db.savedWords.update(word.id, { streak, learned, updatedAt: Date.now() });
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
