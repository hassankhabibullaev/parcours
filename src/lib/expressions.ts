import { EXPRESSIONS, REFLEXIVE_GLOSSES, REFLEXIVE_LEMMA_FIX } from '../data/expressions';
import { lemmaOf, normalizeWord, tokenize, type Token } from './lemmatize';

/**
 * Fixed-expression detection for the reading view: tapping any word inside a
 * known expression looks up the whole phrase (« grâce à » → "thanks to")
 * instead of the word alone. Two detectors run over each sentence:
 *
 *  1. the curated expression list (data/expressions.ts), matched greedily
 *     leftmost-longest — an expression token matches a sentence word's surface
 *     or its lemma (so infinitives match conjugated forms and « qu' » matches
 *     que), and de/à also match their contractions (du/des/d', au/aux);
 *  2. a generic reflexive rule: « se/s' + verb » (plus the past « s'est +
 *     participle ») becomes the reflexive infinitive — « se trouve » →
 *     se trouver, whose meaning differs from bare trouver.
 *
 * A match never crosses punctuation. Matching is pure lookup — no network.
 */
export interface ExpressionMatch {
  /** Canonical expression: the lookup term and the lexicon lemma. */
  term: string;
  /** Curated first-line translation, '' when the dictionary should answer. */
  gloss: string;
  /** The expression exactly as it appears in the sentence. */
  text: string;
}

interface Pattern {
  term: string;
  gloss: string;
  tokens: string[];
}

/** Curated patterns indexed by first token (longest first per bucket). */
const BY_FIRST = new Map<string, Pattern[]>();
for (const { expr, gloss, match } of EXPRESSIONS) {
  const tokens =
    match ??
    tokenize(expr)
      .filter((t) => t.word)
      .map((t) => normalizeWord(t.word!));
  if (tokens.length < 2) continue; // single words need no phrase treatment
  const bucket = BY_FIRST.get(tokens[0]) ?? [];
  bucket.push({ term: expr, gloss, tokens });
  BY_FIRST.set(tokens[0], bucket);
}
for (const bucket of BY_FIRST.values()) bucket.sort((a, b) => b.tokens.length - a.tokens.length);

/**
 * de/à contract with a following article (« près du sol » = près de + le sol),
 * so a locution's FINAL de/à accepts the contracted forms too. Only the final
 * token: inside the fixed unit there is no noun phrase to contract with, and
 * accepting them there misreads « du nouveau modèle » as de nouveau ("again").
 */
const DE_FORMS = new Set(['de', 'du', 'des', 'd']);
const A_FORMS = new Set(['à', 'au', 'aux']);

/** Every French infinitive ends in -er/-ir/-re/-oir; nothing else does. */
function verbShaped(lemma: string): boolean {
  return /(?:er|ir|re|oir)$/.test(lemma);
}

function tokenMatches(expected: string, surface: string, lemma: string, last: boolean): boolean {
  if (expected === surface) return true;
  // The lemma stands in for the surface only where inflection genuinely varies
  // a fixed expression: a conjugated verb (« a besoin de » → avoir) or an
  // elision (« qu' » → que). Noun/adjective inflection must NOT match — that
  // would misread « aux nouvelles technologies » as à nouveau ("again").
  if (expected === lemma && (verbShaped(lemma) || lemma.startsWith(surface))) return true;
  if (last && expected === 'de') return DE_FORMS.has(surface);
  if (last && expected === 'à') return A_FORMS.has(surface);
  return false;
}

/** « se lever » but « s'appeler » — the clitic elides before a vowel or h. */
function reflexiveOf(lemma: string): string {
  return /^[aeiouyhàâéèêëîïôùû]/.test(lemma) ? `s'${lemma}` : `se ${lemma}`;
}

interface RunWord {
  /** Index into the sentence's full token array. */
  ti: number;
  token: Token;
  surface: string;
  lemma: string;
}

/**
 * Find every expression in a tokenized sentence. Returns a map from each word
 * token covered by a match to that match (the same object for all its words).
 * `lemmas` is the sentence's context-aware lemma map from `lemmatizeTokens`.
 */
export function findExpressions(
  tokens: Token[],
  lemmas: Map<Token, string>,
): Map<Token, ExpressionMatch> {
  const out = new Map<Token, ExpressionMatch>();

  // Words grouped into punctuation-bounded runs (whitespace doesn't split).
  const runs: RunWord[][] = [];
  let run: RunWord[] = [];
  tokens.forEach((t, ti) => {
    if (t.word) {
      const surface = normalizeWord(t.word);
      run.push({ ti, token: t, surface, lemma: lemmas.get(t) ?? lemmaOf(t.word) });
    } else if (/\S/.test(t.text)) {
      if (run.length) runs.push(run);
      run = [];
    }
  });
  if (run.length) runs.push(run);

  const record = (words: RunWord[], term: string, gloss: string) => {
    const text = tokens
      .slice(words[0].ti, words[words.length - 1].ti + 1)
      .map((t) => t.text)
      .join('');
    const match: ExpressionMatch = { term, gloss, text };
    for (const w of words) out.set(w.token, match);
  };

  for (const words of runs) {
    let i = 0;
    while (i < words.length) {
      const { surface, lemma } = words[i];

      // Curated expressions: candidates whose first token this word can be.
      const keys = surface === lemma ? [surface] : [surface, lemma];
      let matched: Pattern | null = null;
      for (const key of keys) {
        for (const p of BY_FIRST.get(key) ?? []) {
          if (matched && p.tokens.length <= matched.tokens.length) continue;
          if (i + p.tokens.length > words.length) continue;
          const n = p.tokens.length;
          if (
            p.tokens.every((t, j) =>
              tokenMatches(t, words[i + j].surface, words[i + j].lemma, j === n - 1),
            )
          ) {
            matched = p;
          }
        }
      }
      if (matched) {
        record(words.slice(i, i + matched.tokens.length), matched.term, matched.gloss);
        i += matched.tokens.length;
        continue;
      }

      // Generic reflexive: se/s' + verb, or se/s' + être-form + participle
      // (« s'est formée » → se former). The verb-shape guard keeps pronouns
      // out — Lefff lemmatises « il/y/en » to grammatical tags, not words.
      if ((surface === 'se' || surface === 's') && i + 1 < words.length) {
        const v = words[i + 1];
        let verb: string | null = null;
        let span = 2;
        if (v.lemma === 'être') {
          const p = words[i + 2];
          if (p && p.lemma !== p.surface && verbShaped(p.lemma)) {
            verb = p.lemma;
            span = 3;
          }
        } else if (verbShaped(v.lemma)) {
          verb = v.lemma;
        }
        if (verb) {
          const term = reflexiveOf(REFLEXIVE_LEMMA_FIX[verb] ?? verb);
          record(words.slice(i, i + span), term, REFLEXIVE_GLOSSES[term] ?? '');
          i += span;
          continue;
        }
      }

      i += 1;
    }
  }
  return out;
}
