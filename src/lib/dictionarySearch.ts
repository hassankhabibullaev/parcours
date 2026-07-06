import lemmaTable from '../data/lemmas.json';
import { articles, verbMeanings, verbList } from '../data/content';
import { lemmaOf, tokenize, onLexiconReady } from './lemmatize';
import { foldAccents } from './practice';

export interface DictEntry {
  lemma: string;
  /** Offline gloss when we have one (the 100 drilled verbs), else null. */
  meaning: string | null;
}

/**
 * The app's own dictionary: every lemma reachable from the bundled content —
 * the article corpus (each token run through lemmaOf), every surface form in
 * lemmas.json, and the 100 conjugation infinitives. Searching an inflected
 * form surfaces its lemma (« mangeons » → manger), which is what gets added
 * to the vocabulary.
 *
 * Keys are lemmas as displayed; values are the accent-folded strings that
 * should match them (the lemma itself + all known inflections). Built lazily
 * on the first search (~30k corpus tokens, one-time).
 */
let index: Map<string, Set<string>> | null = null;

// Corpus tokens are indexed through lemmaOf, so a better lexicon means a better
// index — drop the cached one when the full lexicon finishes loading.
onLexiconReady(() => {
  index = null;
});

function addForm(map: Map<string, Set<string>>, lemma: string, form: string) {
  let forms = map.get(lemma);
  if (!forms) {
    forms = new Set();
    map.set(lemma, forms);
  }
  forms.add(foldAccents(form));
}

function buildIndex(): Map<string, Set<string>> {
  const map = new Map<string, Set<string>>();
  for (const infinitive of verbList) addForm(map, infinitive, infinitive);
  for (const [form, lemma] of Object.entries(lemmaTable as Record<string, string>)) {
    addForm(map, lemma, lemma);
    addForm(map, lemma, form);
  }
  for (const article of articles) {
    for (const token of tokenize(article.content)) {
      if (!token.word) continue;
      const word = token.word.toLowerCase();
      addForm(map, lemmaOf(word), word);
    }
  }
  return map;
}

/**
 * Real-time search. Rank: exact form match, then prefix, then substring
 * (substring only from 3 chars to keep short queries quiet); shorter lemmas
 * first within a rank.
 */
export function searchDictionary(query: string, limit = 8): DictEntry[] {
  const q = foldAccents(query);
  if (!q) return [];
  if (!index) index = buildIndex();

  const scored: { lemma: string; score: number }[] = [];
  for (const [lemma, forms] of index) {
    let best = Infinity;
    for (const form of forms) {
      if (form === q) {
        best = 0;
        break;
      }
      if (form.startsWith(q)) best = Math.min(best, 1);
      else if (q.length >= 3 && form.includes(q)) best = Math.min(best, 2);
    }
    if (best < Infinity) scored.push({ lemma, score: best });
  }

  scored.sort(
    (a, b) =>
      a.score - b.score ||
      a.lemma.length - b.lemma.length ||
      a.lemma.localeCompare(b.lemma, 'fr'),
  );
  return scored.slice(0, limit).map(({ lemma }) => ({
    lemma,
    meaning: verbMeanings[lemma] ?? null,
  }));
}
