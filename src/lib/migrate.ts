import { db, getKV, setKV } from './db';
import { isFormOfGloss, looksLikeVerbDefinition, normalizeGloss } from './dictionary';

/**
 * One-shot local data passes, run at boot (fire-and-forget from main.tsx).
 * Each is guarded by a kv flag so it runs once per device; the updated
 * records then sync outward with fresh `updatedAt`s.
 */
export async function runMigrations(): Promise<void> {
  try {
    await splitStreaks();
    await normalizeStoredTranslations();
  } catch {
    /* fail-soft: a migration must never block the app from booting */
  }
}

/**
 * The single legacy `streak` counter becomes the Word-Match streak (that is
 * where it mostly came from); Fill-in-the-Blank starts its own counter fresh.
 */
async function splitStreaks(): Promise<void> {
  if (await getKV('migStreakSplitV1')) return;
  const words = await db.savedWords.toArray();
  const now = Date.now();
  for (const w of words) {
    if (w.matchStreak === undefined && (w.streak ?? 0) > 0) {
      await db.savedWords.update(w.id, { matchStreak: w.streak, updatedAt: now });
    }
  }
  await setKV('migStreakSplitV1', '1');
}

/**
 * Data pass for translation consistency (stored words were saved before the
 * per-POS template existed): re-derive first-line translations that are
 * grammatical cross-references ("present participle of …") from the stored
 * definition, then normalize every translation to the shared template
 * (verbs "to ___", qualifiers stripped). The lookup cache is cleared so
 * future lookups re-fetch through the new normalizer.
 */
async function normalizeStoredTranslations(): Promise<void> {
  if (await getKV('migGlossV1')) return;
  const words = await db.savedWords.toArray();
  const now = Date.now();
  for (const w of words) {
    const verb = looksLikeVerbDefinition(w.lemma, w.definition);
    const properNoun = /^[A-ZÀÂÇÉÈÊËÎÏÔÙÛÜ]/.test(w.lemma);
    let candidate = w.translation;
    if (!candidate.trim() || isFormOfGloss(candidate)) {
      const meaningLine = w.definition
        .split('\n')
        .map((line) => line.replace(/^\([^)]*\)\s*/, '').trim())
        .find((line) => line && !isFormOfGloss(line));
      candidate = meaningLine ?? candidate;
    }
    const next = candidate ? normalizeGloss(candidate, { verb, properNoun }) : candidate;
    if (next && next !== w.translation) {
      await db.savedWords.update(w.id, { translation: next, updatedAt: now });
    }
  }
  await db.lookupCache.clear();
  await setKV('migGlossV1', '1');
}
