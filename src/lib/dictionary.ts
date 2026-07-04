import { db } from './db';

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

/** English Wiktionary definitions of a French term (CORS-friendly, no key). */
async function fetchWiktionary(term: string): Promise<string[]> {
  const url = `https://en.wiktionary.org/api/rest_v1/page/definition/${encodeURIComponent(term)}?redirect=true`;
  const res = await fetch(url);
  if (!res.ok) return [];
  const data: Record<string, { partOfSpeech?: string; definitions?: { definition?: string }[] }[]> =
    await res.json();
  const defs: string[] = [];
  for (const entry of data.fr ?? []) {
    for (const d of entry.definitions ?? []) {
      const text = stripHtml(d.definition ?? '');
      if (!text) continue;
      defs.push(entry.partOfSpeech ? `(${entry.partOfSpeech.toLowerCase()}) ${text}` : text);
      if (defs.length >= 3) return defs;
    }
  }
  return defs;
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
 * Look up a French term (single word lemma or phrase). Results are cached in
 * IndexedDB, so anything seen once keeps working offline.
 */
export async function lookup(term: string): Promise<LookupResult> {
  const key = term.toLowerCase();
  const cached = await db.lookupCache.get(key);
  if (cached) return { term, translation: cached.translation, definition: cached.definition };

  const [translated, defs] = await Promise.all([
    fetchTranslation(term).catch(() => null),
    fetchWiktionary(key).catch(() => [] as string[]),
  ]);

  const definition = defs.join('\n');
  // A concise Wiktionary gloss ("to eat", "star") beats machine translation,
  // which mangles bare infinitives; fall back to MyMemory for the rest.
  const firstDef = defs[0]?.replace(/^\([^)]*\)\s*/, '') ?? '';
  const translation =
    firstDef && firstDef.length <= 40 ? firstDef : (translated ?? firstDef);

  if (translation || definition) {
    await db.lookupCache.put({ term: key, translation, definition, updatedAt: Date.now() });
  }
  return { term, translation, definition };
}
