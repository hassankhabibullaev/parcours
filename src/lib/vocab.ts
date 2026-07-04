import { db, type SavedWord } from './db';

export interface SaveWordInput {
  lemma: string;
  display: string;
  translation: string;
  definition: string;
  sentence: string;
  articleId: number | null;
}

/** Save a word/phrase to the lexicon; no-op if the lemma is already saved. */
export async function saveWord(input: SaveWordInput): Promise<SavedWord> {
  const existing = await db.savedWords.where('lemma').equals(input.lemma).first();
  if (existing) return existing;
  const now = Date.now();
  const word: SavedWord = {
    id: crypto.randomUUID(),
    ...input,
    learned: 0,
    addedAt: now,
    updatedAt: now,
  };
  await db.savedWords.add(word);
  return word;
}
