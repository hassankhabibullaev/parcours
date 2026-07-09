import coreTable from '../data/lemmas.json';

/**
 * Surface-form → lemma lookup. Seeded synchronously with a small BUNDLED core
 * (every conjugated form of the drilled verbs) so common verbs work on first
 * paint, then augmented by the FULL Lefff-derived lexicon (~350k forms) that
 * `loadLexicon()` fetches once and caches. A form we've never seen lemmatises
 * to itself, which is already correct for adverbs, base nouns and adjectives —
 * so the fallback never invents a word.
 */
const LEMMAS = new Map<string, string>(Object.entries(coreTable as Record<string, string>));

/**
 * Noun/adjective lemma for verb/noun HOMOGRAPHS (« livre » → livrer in LEMMAS,
 * but livre-the-book here). Populated from the full lexicon's third column; used
 * only when local context says the word is a noun (see `lemmaOf`'s `prev`).
 */
const HOMOGRAPH_NOUN = new Map<string, string>();

/**
 * Elision prefixes that get split off before lookup: l'étoile → l' + étoile.
 * Words like « aujourd'hui » or « quelqu'un » are NOT split because their
 * prefix is not in this set.
 */
const ELISIONS: Record<string, string> = {
  l: 'le',
  d: 'de',
  j: 'je',
  n: 'ne',
  m: 'me',
  t: 'te',
  s: 'se',
  c: 'ce',
  qu: 'que',
  jusqu: 'jusque',
  lorsqu: 'lorsque',
  puisqu: 'puisque',
};

/**
 * Words that, immediately before a homograph, mark it as a NOUN (so we take the
 * nominal lemma, not the verb one): articles, partitives, demonstratives,
 * possessives, contracted prepositions and common noun-phrase quantifiers.
 * Normalised the same way as `prev` below (lowercased, trailing apostrophe
 * dropped, so « l' »→"l", « d' »→"d"). Object-pronoun uses of le/la/les (« je le
 * mange ») are rarer in learner texts than article uses (« le livre »), so
 * they're accepted here — the determiner→noun rule is high-precision on the
 * cases the corpus actually contains.
 */
const DETERMINERS = new Set([
  'le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd',
  'ce', 'cet', 'cette', 'ces', 'au', 'aux',
  'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses',
  'notre', 'nos', 'votre', 'vos', 'leur', 'leurs',
  'quel', 'quelle', 'quels', 'quelles', 'chaque', 'plusieurs', 'quelques',
]);

/**
 * The determiners that double as object pronouns (« la porte » the door vs.
 * « il la ferme » he closes it). Before one of these the determiner→noun rule
 * only fires when NOT itself preceded by a verb-marking pronoun (below), so
 * « il la ferme » stays the verb while « la ferme » stays the noun.
 */
const CLITIC_DETERMINERS = new Set(['le', 'la', 'les', 'l']);

/** Pronouns that, before a clitic determiner, mark it as an object pronoun +
 *  verb rather than an article + noun (« il/elle/je … le/la/les <verb> »). */
const CLITIC_MARKERS = new Set([
  'je', 'j', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles',
  'me', 'm', 'te', 'se', 's', 'ne', 'n', 'qui',
]);

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/’/g, "'").replace(/'$/, '');
}

/**
 * Dictionary base form of a surface word (falls back to the word itself).
 *
 * `prev` is the word immediately before it (null across punctuation/at a
 * boundary). When it's a determiner and `word` is a verb/noun homograph, the
 * word is read as a noun — « le livre » → livre, not livrer — instead of the
 * lexicon's verb-biased default; every other case keeps the default.
 */
export function lemmaOf(word: string, prev?: string | null): string {
  const w = normalizeWord(word);
  if (w in ELISIONS) return ELISIONS[w];
  if (prev != null) {
    const noun = HOMOGRAPH_NOUN.get(w);
    if (noun && DETERMINERS.has(normalizeWord(prev))) return noun;
  }
  return LEMMAS.get(w) ?? w;
}

/**
 * Lemmatise a sentence's tokens with left-context, so verb/noun homographs are
 * disambiguated by the preceding word (« le livre » → livre, « je livre » →
 * livrer). Returns a map keyed by the WORD token objects — safe because the
 * article view's `groupTokens` re-uses those same objects. Punctuation between
 * two words breaks the adjacency (a determiner only binds the word right after
 * it); plain whitespace does not.
 */
export function lemmatizeTokens(tokens: Token[]): Map<Token, string> {
  const out = new Map<Token, string>();
  let prev: string | null = null;
  let prev2: string | null = null;
  for (const t of tokens) {
    if (t.word) {
      // Drop the context when the preceding le/la/les is really an object
      // pronoun (« il la ferme »), so the homograph stays a verb by default.
      const pn = prev ? normalizeWord(prev) : null;
      const clitic =
        pn != null &&
        CLITIC_DETERMINERS.has(pn) &&
        prev2 != null &&
        CLITIC_MARKERS.has(normalizeWord(prev2));
      out.set(t, lemmaOf(t.word, clitic ? null : prev));
      prev2 = prev;
      prev = t.word;
    } else if (/\S/.test(t.text)) {
      prev = null; // punctuation — not a determiner, and it ends the phrase
      prev2 = null;
    }
  }
  return out;
}

/* ——— Full lexicon: lazy-loaded, cached, offline ——— */

const LEXICON_PATH = `${import.meta.env.BASE_URL}lemmas-fr.txt`;
// v2: the file format gained a third column (the homograph noun override). The
// bump forces returning users off their cached 2-column copy so they pick up
// context disambiguation; `purgeStaleLexiconCaches` frees the orphaned v1.
const LEXICON_CACHE = 'parcours-lexicon-v2';

let ready = false;
let loading: Promise<void> | null = null;
const readyCallbacks = new Set<() => void>();

export function isLexiconReady(): boolean {
  return ready;
}

/** Subscribe to full-lexicon readiness (fires once). Returns an unsubscribe. */
export function onLexiconReady(cb: () => void): () => void {
  if (ready) {
    cb();
    return () => {};
  }
  readyCallbacks.add(cb);
  return () => readyCallbacks.delete(cb);
}

/** Delete lexicon caches from older builds (superseded by the current version),
    so a stale-format copy is never read and its storage isn't leaked. */
async function purgeStaleLexiconCaches(): Promise<void> {
  try {
    for (const key of await caches.keys()) {
      if (key.startsWith('parcours-lexicon-') && key !== LEXICON_CACHE) {
        await caches.delete(key);
      }
    }
  } catch {
    /* best-effort cleanup */
  }
}

async function fetchLexicon(): Promise<string | null> {
  try {
    if (typeof caches !== 'undefined') {
      await purgeStaleLexiconCaches();
      // Cache Storage keeps it available offline after the first online load,
      // and out of the synced Dexie store (this is device-local, never synced).
      const cache = await caches.open(LEXICON_CACHE);
      const hit = await cache.match(LEXICON_PATH);
      if (hit) return hit.text();
      const res = await fetch(LEXICON_PATH);
      if (!res.ok) return null;
      await cache.put(LEXICON_PATH, res.clone());
      return res.text();
    }
    const res = await fetch(LEXICON_PATH);
    return res.ok ? res.text() : null;
  } catch {
    return null;
  }
}

/** Load and merge the full lexicon. Safe to call repeatedly; retries a failed
    (e.g. offline) load on the next call. */
export function loadLexicon(): Promise<void> {
  if (ready) return Promise.resolve();
  if (!loading) {
    loading = (async () => {
      const text = await fetchLexicon();
      if (text === null) {
        loading = null; // let a later call (e.g. once online) try again
        return;
      }
      for (const line of text.split('\n')) {
        // "form\tlemma" or, for a verb/noun homograph, "form\tverb\tnoun".
        const t1 = line.indexOf('\t');
        if (t1 <= 0) continue;
        const t2 = line.indexOf('\t', t1 + 1);
        if (t2 < 0) {
          LEMMAS.set(line.slice(0, t1), line.slice(t1 + 1));
        } else {
          LEMMAS.set(line.slice(0, t1), line.slice(t1 + 1, t2));
          HOMOGRAPH_NOUN.set(line.slice(0, t1), line.slice(t2 + 1));
        }
      }
      ready = true;
      readyCallbacks.forEach((cb) => cb());
      readyCallbacks.clear();
    })();
  }
  return loading;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void loadLexicon());
}

export interface Token {
  /** Exact text slice to render. */
  text: string;
  /** The tappable word, or null for spaces/punctuation. */
  word: string | null;
}

export interface Sentence {
  text: string;
  tokens: Token[];
}

const LETTER = "A-Za-zÀ-ÖØ-öø-ÿŒœÆæ";
const WORD_RE = new RegExp(`[${LETTER}]+(?:['’][${LETTER}]+)?(?:-[${LETTER}]+)*`, 'g');

function pushWord(tokens: Token[], match: string) {
  const apos = match.search(/['’]/);
  if (apos > 0 && apos < match.length - 1) {
    const prefix = match.slice(0, apos).toLowerCase();
    if (prefix in ELISIONS) {
      // Split « l'étoile » into two tappable words.
      tokens.push({ text: match.slice(0, apos + 1), word: match.slice(0, apos + 1) });
      tokens.push({ text: match.slice(apos + 1), word: match.slice(apos + 1) });
      return;
    }
  }
  tokens.push({ text: match, word: match });
}

export function tokenize(text: string): Token[] {
  const tokens: Token[] = [];
  let last = 0;
  for (const m of text.matchAll(WORD_RE)) {
    const index = m.index ?? 0;
    if (index > last) tokens.push({ text: text.slice(last, index), word: null });
    pushWord(tokens, m[0]);
    last = index + m[0].length;
  }
  if (last < text.length) tokens.push({ text: text.slice(last), word: null });
  return tokens;
}

/** Split article text into sentences (keeps their punctuation). */
export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?…])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * The corpus stores each article as one continuous block; group sentences
 * into paragraphs of a readable length for the article view.
 */
export function buildParagraphs(text: string, targetChars = 340): Sentence[][] {
  const sentences = splitSentences(text).map((s) => ({ text: s, tokens: tokenize(s) }));
  const paragraphs: Sentence[][] = [];
  let current: Sentence[] = [];
  let size = 0;
  for (const sentence of sentences) {
    current.push(sentence);
    size += sentence.text.length;
    if (size >= targetChars) {
      paragraphs.push(current);
      current = [];
      size = 0;
    }
  }
  if (current.length) paragraphs.push(current);
  return paragraphs;
}
