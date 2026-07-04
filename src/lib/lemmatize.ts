import lemmaTable from '../data/lemmas.json';

const LEMMAS = lemmaTable as Record<string, string>;

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

/** Dictionary base form of a surface word (falls back to the word itself). */
export function lemmaOf(word: string): string {
  const w = word.toLowerCase().replace(/’/g, "'").replace(/'$/, '');
  if (w in ELISIONS) return ELISIONS[w];
  return LEMMAS[w] ?? w;
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
