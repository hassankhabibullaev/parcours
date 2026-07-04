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

export function generateDeviceCode(): string {
  const first = pick(WORDS);
  let second = pick(WORDS);
  while (second === first) second = pick(WORDS);
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  const num = String(buf[0] % 100).padStart(2, '0');
  return `${first}-${second}-${num}`;
}

export async function getOrCreateDeviceCode(): Promise<string> {
  const existing = await getKV('deviceCode');
  if (existing) return existing;
  const code = generateDeviceCode();
  await setKV('deviceCode', code);
  return code;
}
