import { db } from './db';
import { verbList } from '../data/content';

export interface LookupResult {
  term: string;
  /** Short English gloss, '' if nothing could be fetched. */
  translation: string;
  /** Longer dictionary definition(s), '' if unavailable. */
  definition: string;
}

function stripHtml(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim();
}

interface WiktSense {
  /** Lower-cased part of speech ('verb', 'noun', …). */
  pos: string;
  text: string;
}

/** English Wiktionary definitions of a French term (CORS-friendly, no key). */
async function fetchWiktionary(term: string): Promise<WiktSense[]> {
  const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(term)}?redirect=true`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data: Record<string, { partOfSpeech?: string; definitions?: { definition?: string }[] }[]> =
    await res.json();
  const senses: WiktSense[] = [];
  for (const entry of data.fr ?? []) {
    for (const d of entry.definitions ?? []) {
      const text = stripHtml(d.definition ?? '');
      if (!text) continue;
      senses.push({ pos: (entry.partOfSpeech ?? '').toLowerCase(), text });
      if (senses.length >= 4) return senses;
    }
  }
  return senses;
}

/** Concise FR→EN machine translation — also handles multi-word phrases. */
async function fetchTranslation(term: string): Promise<string | null> {
  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(term)}&langpair=fr|en`;
  const res = await fetch(url);
  if (!res.ok) return null;
  const data = await res.json();
  const text: unknown = data?.responseData?.translatedText;
  if (data?.responseStatus !== 200 || typeof text !== 'string' || !text.trim()) return null;
  return text.trim();
}

/**
 * True for Wiktionary's grammatical cross-references — "present participle of
 * regarder", "feminine plural of grand" — which describe a word form, not its
 * meaning. They never make a good first-line translation.
 */
export function isFormOfGloss(text: string): boolean {
  return /\b(?:participle|inflection|conjugation|singular|plural|feminine|masculine|gerund|(?:past|present)\s+tense|form)\s+of\s+/i.test(
    text,
  );
}

/**
 * One first-line template per part of speech, applied wherever a translation
 * is produced or stored: verbs always read "to ___" ("to obtain", never
 * "obtain"), everything else is a bare gloss with qualifiers stripped
 * ("to watch (something)" → "to watch"; "(informal) buddy" → "buddy").
 * Only the first sense is kept — the full detail stays in `definition`.
 */
export function normalizeGloss(raw: string, opts: { verb: boolean; properNoun?: boolean }): string {
  let g = raw.trim();
  g = g.replace(/^\([^)]*\)\s*/, ''); // leading "(transitive)" qualifier
  g = g.replace(/\s*\([^)]*\)/g, ''); // inline "(something)" qualifiers
  g = g.replace(/\s*\[[^\]]*\]/g, ''); // bracketed editorial notes
  g = g.split(/[;·]/)[0]; // first sense
  g = g.split(',')[0]; // first synonym of that sense
  g = g.replace(/\s+/g, ' ').trim().replace(/[.,:!]+$/, '');
  if (!g) return '';
  if (opts.verb) {
    g = `to ${g.replace(/^to\s+/i, '')}`;
  } else if (!opts.properNoun && /^[A-Z]/.test(g) && g.slice(1) === g.slice(1).toLowerCase()) {
    // Machine translation Title-cases ordinary words; looked-up French words
    // are lowercase unless they really are proper nouns (the caller checks).
    g = g[0].toLowerCase() + g.slice(1);
  }
  return g;
}

/** Best-effort POS check used when only stored text is available (migrations). */
export function looksLikeVerbDefinition(term: string, definition: string): boolean {
  if (verbList.includes(term.toLowerCase())) return true;
  const firstMeaning = definition
    .split('\n')
    .find((line) => line.trim() && !isFormOfGloss(line));
  return /^\(verb\)/i.test((firstMeaning ?? definition.split('\n')[0] ?? '').trim());
}

/**
 * Look up a French term (single word lemma or phrase). Results are cached in
 * IndexedDB, so anything seen once keeps working offline. The first-line
 * translation follows one structure per part of speech (see normalizeGloss).
 */
export async function lookup(term: string): Promise<LookupResult> {
  const key = term.toLowerCase();
  const cached = await db.lookupCache.get(key);
  if (cached) return { term, translation: cached.translation, definition: cached.definition };

  const [translated, senses] = await Promise.all([
    fetchTranslation(term).catch(() => null),
    fetchWiktionary(key).catch(() => [] as WiktSense[]),
  ]);

  const definition = senses.map((s) => (s.pos ? `(${s.pos}) ${s.text}` : s.text)).join('\n');
  const properNoun = /^[A-ZÀÂÇÉÈÊËÎÏÔÙÛÜ]/.test(term.trim());

  // The main gloss: the first Wiktionary sense that states a meaning (skipping
  // "participle of …" style form references), templated by its own POS. A
  // concise dictionary gloss beats machine translation, which mangles bare
  // infinitives; fall back to MyMemory when Wiktionary has nothing usable.
  const main = senses.find((s) => !isFormOfGloss(s.text));
  let translation = '';
  if (main) {
    translation = normalizeGloss(main.text, { verb: main.pos === 'verb', properNoun });
  }
  if (!translation || translation.length > 48) {
    const fallback = translated ?? main?.text ?? senses[0]?.text ?? '';
    const isVerb = main ? main.pos === 'verb' : verbList.includes(key);
    const normalized = fallback ? normalizeGloss(fallback, { verb: isVerb, properNoun }) : '';
    translation = normalized || translation;
  }

  if (translation || definition) {
    await db.lookupCache.put({ term: key, translation, definition, updatedAt: Date.now() });
  }
  return { term, translation, definition };
}
