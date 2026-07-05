import { getKV, setKV } from './db';

// Editor's-desk vocabulary, deliberately accent-free so the code is easy to
// type on any keyboard.
const WORDS = [
  'encre', 'plume', 'presse', 'papier', 'crayon', 'marge', 'lettre', 'phrase',
  'verbe', 'journal', 'colonne', 'feuille', 'cahier', 'bureau', 'stylo', 'texte',
  'ligne', 'prose', 'conte', 'fable', 'article', 'kiosque', 'page', 'titre',
  'mot', 'virgule', 'chapitre', 'gazette', 'brouillon', 'archive', 'dossier', 'tampon',
];

function pick<T>(list: T[]): T {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return list[buf[0] % list.length];
}

/**
 * A memorable code like `plume-gazette-marge-42`. Three distinct words plus a
 * two-digit number (~3M combinations) — enough entropy to name a sync bucket.
 */
export function generateDeviceCode(): string {
  const words: string[] = [];
  while (words.length < 3) {
    const w = pick(WORDS);
    if (!words.includes(w)) words.push(w);
  }
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const num = String(buf[0] % 100).padStart(2, '0');
  return `${words.join('-')}-${num}`;
}

/** This device's own code (its identity), created once and kept in `kv`. */
export async function getOrCreateDeviceCode(): Promise<string> {
  const existing = await getKV('deviceCode');
  if (existing) return existing;
  const code = generateDeviceCode();
  await setKV('deviceCode', code);
  return code;
}

/** Loose validation for a code typed in to link another device. */
export function normalizeCode(input: string): string | null {
  const code = input.trim().toLowerCase().replace(/\s+/g, '-');
  return /^[a-z]+(-[a-z]+)+-\d{2}$/.test(code) ? code : null;
}
