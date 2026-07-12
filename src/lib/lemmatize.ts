import coreTable from '../data/lemmas.json';

/**
 * Surface-form → lemma lookup. Seeded synchronously with a small BUNDLED core
 * (every conjugated form of the drilled verbs) so common verbs work on first
 * paint, then augmented by the FULL Lefff-derived lexicon (~400k forms) that
 * `loadLexicon()` fetches once and caches. A form we've never seen lemmatises
 * to itself, which is already correct for adverbs, base nouns and adjectives —
 * so the fallback never invents a word.
 *
 * The full lexicon also carries, per form, which READINGS it has (noun /
 * adjective / finite verb / participles / infinitive) and the lemma each
 * nominal or adjectival reading should use. `lemmatizeTokens` walks a sentence
 * left to right with a small noun-phrase state machine and picks the reading
 * the context calls for — « le livre » → livre, « je livre » → livrer,
 * « la porte ouverte » → ouvert, « on a cours » → cours, « il est guide » →
 * guide. Until the lexicon has loaded only the defaults are available; the
 * article view re-renders via `onLexiconReady`.
 */
const LEMMAS = new Map<string, string>(Object.entries(coreTable as Record<string, string>));

/** Nominal-reading lemma when it differs from the default (« livre », « nouvelle »). */
const NOUN_LEMMA = new Map<string, string>();
/** Adjectival-reading lemma when it differs from the default (« ouvert »). */
const ADJ_LEMMA = new Map<string, string>();
/**
 * Reading flags per form — n(oun) a(djective) f(inite verb) p(ast participle)
 * g(present participle) i(nfinitive). Absent = the form isn't in the Lefff
 * (foreign words, names), which the rules read as "probably a noun".
 */
const FLAGS = new Map<string, string>();

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

/* ——— Curated function-word classes for the contextual rules ———
   These are closed classes; the open classes (nouns, adjectives, verbs) come
   from the lexicon's per-form flags. All sets hold normalizeWord() output
   (lowercased, trailing apostrophe dropped: « l' » → "l"). */

/** Words that open a noun phrase: articles, partitives, demonstratives,
    possessives, contracted prepositions and noun-phrase quantifiers. */
const DETERMINERS = new Set([
  'le', 'la', 'les', 'l', 'un', 'une', 'des', 'du', 'de', 'd',
  'ce', 'cet', 'cette', 'ces', 'au', 'aux',
  'mon', 'ma', 'mes', 'ton', 'ta', 'tes', 'son', 'sa', 'ses',
  'notre', 'nos', 'votre', 'vos', 'leur', 'leurs',
  'quel', 'quelle', 'quels', 'quelles', 'chaque', 'plusieurs', 'quelques',
  'certains', 'certaines', 'divers', 'diverses', 'différents', 'différentes',
]);

/**
 * The determiners that double as object pronouns (« la porte » the door vs.
 * « il la ferme » he closes it, « leur maison » vs « il leur parle »). Before
 * one of these the noun-phrase rule only fires when NOT itself preceded by a
 * verb-marking word (CLITIC_MARKERS), so « il la ferme » stays the verb.
 */
const CLITIC_DETERMINERS = new Set(['le', 'la', 'les', 'l', 'leur']);

/** Dictionary form shown for a tapped determiner — the Lefff's own det
    lemmas are grammatical artifacts, so this small map is curated. */
const DET_LEMMA: Record<string, string> = {
  la: 'le', les: 'le', l: 'le', des: 'un', une: 'un',
  du: 'de', d: 'de', au: 'à', aux: 'à',
  ma: 'mon', mes: 'mon', ta: 'ton', tes: 'ton', sa: 'son', ses: 'son',
  nos: 'notre', vos: 'votre', leurs: 'leur',
  cet: 'ce', cette: 'ce', ces: 'ce',
  quelle: 'quel', quels: 'quel', quelles: 'quel',
  certaines: 'certain', certains: 'certain', diverses: 'divers',
  différentes: 'différent', différents: 'différent',
};

/** Words that, before a clitic determiner or « en », mark it as an object
 *  pronoun + verb rather than an article + noun (« il la ferme », « il en a »). */
const CLITIC_MARKERS = new Set([
  'je', 'j', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles',
  'me', 'm', 'te', 't', 'se', 's', 'ne', 'n', 'y', 'lui', 'c', 'qui',
]);

/** True articles — the only openers that turn a following être/avoir form
    nominal (« l'est », « un as », « l'être humain »). */
const ARTICLE_OPENERS = new Set(['le', 'la', 'les', 'l', 'un', 'une']);

/** Subject/object clitics and relative « qui »: the next word is a verb. */
const SUBJECT_CLITICS = new Set([
  'je', 'j', 'tu', 'il', 'elle', 'on', 'nous', 'vous', 'ils', 'elles',
  'me', 'm', 'te', 't', 'se', 's', 'ne', 'n', 'y', 'lui', 'c', 'qui',
  'cela', 'ça', 'ceci', 'chacun', 'chacune',
]);

/** Prepositions open a noun phrase — a finite verb can't follow one. « à » and
    « de »-forms admit infinitives, which is harmless: a form that is both an
    infinitive and a noun keeps the same lemma either way (« le dîner »). */
const PREPOSITIONS = new Set([
  'à', 'en', 'dans', 'par', 'pour', 'sur', 'sous', 'chez', 'vers', 'avec',
  'sans', 'entre', 'contre', 'pendant', 'durant', 'depuis', 'malgré', 'parmi',
  'selon', 'dès', 'après', 'avant', 'derrière', 'devant', 'jusque', 'hors',
  'envers', 'sauf', 'outre', 'concernant', 'voici', 'voilà',
]);

/** Cardinal numbers quantify like determiners (« deux livres »). Hyphenated
    composites are checked part by part (« dix-huit », « vingt-et-un »). */
const NUMBER_WORDS = new Set([
  'un', 'une', 'deux', 'trois', 'quatre', 'cinq', 'six', 'sept', 'huit',
  'neuf', 'dix', 'onze', 'douze', 'treize', 'quatorze', 'quinze', 'seize',
  'vingt', 'vingts', 'trente', 'quarante', 'cinquante', 'soixante',
  'cent', 'cents', 'mille', 'et',
]);

function isNumberWord(w: string): boolean {
  if (w === 'un' || w === 'une' || w === 'et') return false; // determiners/conj alone
  return w.split('-').every((part) => NUMBER_WORDS.has(part));
}

/** Finite forms of être (+ être/étant): what follows sits in attribute
    position — an adjective, a noun, or the participle of an être-verb. */
const ETRE_FORMS = new Set([
  'suis', 'es', 'est', 'sommes', 'êtes', 'sont',
  'étais', 'était', 'étions', 'étiez', 'étaient',
  'serai', 'seras', 'sera', 'serons', 'serez', 'seront',
  'serais', 'serait', 'serions', 'seriez', 'seraient',
  'fus', 'fut', 'fûmes', 'fûtes', 'furent',
  'sois', 'soit', 'soyons', 'soyez', 'soient', 'fusse', 'fût',
  'être', 'étant',
]);

/** Finite forms of avoir (+ avoir/ayant): a following participle is the
    compound past; a following non-participle noun reading is a noun
    (« on a cours »— a finite verb can't follow the auxiliary). */
const AVOIR_FORMS = new Set([
  'ai', 'as', 'a', 'avons', 'avez', 'ont',
  'avais', 'avait', 'avions', 'aviez', 'avaient',
  'aurai', 'auras', 'aura', 'aurons', 'aurez', 'auront',
  'aurais', 'aurait', 'aurions', 'auriez', 'auraient',
  'eus', 'eut', 'eûmes', 'eûtes', 'eurent',
  'aie', 'aies', 'ait', 'ayons', 'ayez', 'aient',
  'ayant', 'avoir',
]);

/** Other copulas (checked by default lemma): what follows is an attribute
    (« il reste calme », « elle semble fatiguée »). */
const COPULA_LEMMAS = new Set(['sembler', 'paraître', 'devenir', 'rester', 'demeurer']);

/** Verbs whose compound past takes être — after « est/était/… » their
    participle is the verb (« il est passé »), not an adjective. */
const ETRE_VERB_LEMMAS = new Set([
  'aller', 'venir', 'revenir', 'devenir', 'redevenir', 'parvenir', 'survenir',
  'arriver', 'partir', 'repartir', 'rester', 'retourner', 'tomber', 'retomber',
  'monter', 'remonter', 'descendre', 'redescendre', 'entrer', 'rentrer',
  'sortir', 'ressortir', 'mourir', 'naître', 'renaître', 'décéder', 'apparaître',
]);

/** Adverbs that sit transparently inside the patterns above — between a
    determiner and its noun (« une très longue marche »), après être (« est
    déjà parti »), after avoir (« a bien mangé ») — without ending them. */
const TRANSPARENT_ADVS = new Set([
  'très', 'si', 'plus', 'moins', 'assez', 'trop', 'bien', 'mal', 'vraiment',
  'plutôt', 'aussi', 'encore', 'déjà', 'toujours', 'jamais', 'souvent',
  'parfois', 'presque', 'seulement', 'tellement', 'tant', 'beaucoup', 'peu',
  'pas', 'point', 'guère', 'tout', 'toute', 'tous', 'toutes',
]);

/** Conjunctions and connectives that end every pattern — after them the
    context is a fresh clause. */
const CONJUNCTIONS = new Set([
  'et', 'ou', 'mais', 'donc', 'or', 'ni', 'car', 'que', 'quand', 'comme',
  'puis', 'ensuite', 'alors', 'pourtant', 'cependant', 'toutefois', 'ainsi',
  'parce', 'quoique', 'lorsque', 'puisque', 'tandis', 'sinon', 'quoi', 'dont',
  'où',
]);

/**
 * The closed set of adjectives that precede their noun (BAGS + ordinals +
 * a few common others), checked by DEFAULT lemma so every inflection matches
 * (« belle » → beau). Inside « det _ noun » these read as adjectives; other
 * adjective-capable words there are the noun head (French adjectives follow
 * the noun by default).
 */
const PRENOMINAL_LEMMAS = new Set([
  'beau', 'bon', 'bref', 'grand', 'gros', 'faux', 'haut', 'jeune', 'joli',
  'long', 'mauvais', 'meilleur', 'moindre', 'nouveau', 'petit', 'vieux',
  'vrai', 'premier', 'second', 'deuxième', 'troisième', 'quatrième',
  'cinquième', 'sixième', 'septième', 'huitième', 'neuvième', 'dixième',
  'dernier', 'autre', 'même', 'tel', 'seul', 'double', 'demi', 'pauvre',
  'propre', 'ancien', 'cher', 'court', 'vaste', 'plein', 'futur', 'simple',
  'certain', 'fort',
]);

export function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/’/g, "'").replace(/'$/, '');
}

/**
 * Dictionary base form of a surface word (falls back to the word itself).
 *
 * `prev` is the word immediately before it (null across punctuation/at a
 * boundary). When it's a determiner and `word` has a distinct nominal lemma,
 * the word is read as a noun — « le livre » → livre, not livrer. This is the
 * context-FREE entry point (dictionary search, expression fallback); article
 * sentences go through `lemmatizeTokens`, which applies the full rule set.
 */
export function lemmaOf(word: string, prev?: string | null): string {
  const w = normalizeWord(word);
  if (w in ELISIONS) return ELISIONS[w];
  if (prev != null) {
    const noun = NOUN_LEMMA.get(w);
    if (noun && DETERMINERS.has(normalizeWord(prev))) return noun;
  }
  return LEMMAS.get(w) ?? w;
}

/* ——— Sentence-level disambiguation ——— */

interface WordInfo {
  raw: string;
  w: string;
  flags: string;
  known: boolean;
}

/** The next word in the sentence, unless punctuation intervenes. */
function nextWordInfo(tokens: Token[], from: number): WordInfo | null {
  for (let i = from; i < tokens.length; i++) {
    const t = tokens[i];
    if (t.word) {
      const w = normalizeWord(t.word);
      return { raw: t.word, w, flags: FLAGS.get(w) ?? '', known: FLAGS.has(w) || LEMMAS.has(w) };
    }
    if (/\S/.test(t.text)) return null; // punctuation breaks the pattern
  }
  return null;
}

function isFunctionWord(w: string): boolean {
  return (
    w in ELISIONS ||
    DETERMINERS.has(w) ||
    PREPOSITIONS.has(w) ||
    SUBJECT_CLITICS.has(w) ||
    CONJUNCTIONS.has(w) ||
    TRANSPARENT_ADVS.has(w) ||
    ETRE_FORMS.has(w) ||
    AVOIR_FORMS.has(w) ||
    isNumberWord(w)
  );
}

/** Can `info` be the noun (or a further adjective) of an ongoing noun phrase? */
function looksNominal(info: WordInfo | null): boolean {
  if (!info) return false;
  if (isFunctionWord(info.w)) return false;
  if (/^[A-ZÀ-ÝŒ]/.test(info.raw)) return true; // « la jeune Marie »
  if (!info.known) return true; // not in the lexicon — foreign word or name
  return info.flags.includes('n') || info.flags.includes('a');
}

/**
 * Lemmatise a sentence's tokens in context, so each verb/noun/adjective
 * homograph gets the reading its position calls for. A small state machine
 * walks the words:
 *
 *   - determiners, numbers and prepositions open a noun phrase: the words
 *     inside it read nominally (« le livre » → livre, « deux cours » → cours,
 *     « en marche » → marche), with the closed prenominal-adjective set kept
 *     adjectival before the head (« la belle porte » → porte) and post-head
 *     adjectives resolved as adjectives (« la porte ouverte » → ouvert);
 *   - a word after the noun phrase that can't be an adjective is the clause's
 *     verb again (« la marche rapide fatigue » → fatiguer);
 *   - subject/object clitics mark the next word as a verb (« je livre » →
 *     livrer, « il la ferme » → fermer);
 *   - être and the copulas put what follows in attribute position: adjective
 *     (« il est ferme » → ferme), noun (« il est guide » → guide), or the
 *     participle of an être-verb (« elle est passée » → passer);
 *   - after avoir, a participle is the compound past (« a marché » →
 *     marcher) and a non-participle noun reading is a noun (« on a cours »);
 *   - a capitalized word mid-sentence is a proper noun and heads a phrase
 *     (« Marie porte une robe » → porter);
 *   - « en » + present participle stays the gérondif (« en passant »).
 *
 * Returns a map keyed by the WORD token objects — safe because the article
 * view's `groupTokens` re-uses those same objects. Punctuation between two
 * words breaks every pattern; plain whitespace does not.
 */
export function lemmatizeTokens(tokens: Token[]): Map<Token, string> {
  const out = new Map<Token, string>();

  /** Noun-phrase state: closed / just opened by det-prep-number / head seen. */
  let np: 'none' | 'open' | 'head' = 'none';
  /** What opened the phrase — 'en' gates the gérondif exception. */
  let opener = '';
  /** Attribute/auxiliary position: after être-copulas / after avoir. */
  let aux: 'none' | 'attr' | 'avoir' = 'none';
  /** The être form was preceded by se/s' — a following participle is the
      reflexive compound past (« s'est formée » → former), not an adjective. */
  let reflexive = false;
  /** The previous word marks this one as a verb (subject/object clitic). */
  let marker = false;
  let prev: string | null = null;
  let sawFirstWord = false;

  const reset = () => {
    np = 'none';
    opener = '';
    aux = 'none';
    marker = false;
    reflexive = false;
  };

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (!t.word) {
      if (/\S/.test(t.text)) {
        reset();
        prev = null;
      }
      continue;
    }

    const w = normalizeWord(t.word);
    const sentenceInitial = !sawFirstWord;
    sawFirstWord = true;
    const prevMarks = marker || (prev !== null && CLITIC_MARKERS.has(prev));
    marker = false;

    const flags = FLAGS.get(w) ?? '';
    const hasN = flags.includes('n');
    const hasA = flags.includes('a');
    const hasVerb = /[fpgi]/.test(flags);
    const D = w in ELISIONS ? ELISIONS[w] : LEMMAS.get(w) ?? w;
    const N = NOUN_LEMMA.get(w) ?? D;
    const A = ADJ_LEMMA.get(w) ?? D;

    let lemma = D;

    if (w in ELISIONS) {
      // « l' » is a determiner unless a clitic marker precedes (« il l'ouvre »);
      // « d' » opens a phrase like de; the rest are subject/object clitics or
      // conjunctions (« j' », « qu' »).
      if (w === 'l') {
        if (prevMarks) {
          reset();
          marker = true;
        } else {
          np = 'open';
          opener = w;
          aux = 'none';
        }
      } else if (w === 'd') {
        np = 'open';
        opener = w;
        aux = 'none';
      } else if (w === 'qu' || w === 'jusqu' || w === 'lorsqu' || w === 'puisqu') {
        reset();
      } else {
        reset();
        marker = true;
      }
    } else if (ETRE_FORMS.has(w) || AVOIR_FORMS.has(w)) {
      // « est/a/… » are always the verb — except directly after an article,
      // where a nominal reading wins (« l'est », « un as »). Only articles:
      // after a preposition they stay verbal (« après avoir récolté »,
      // « avant d'être mangé »).
      if (np === 'open' && hasN && ARTICLE_OPENERS.has(opener)) {
        lemma = N;
        np = 'head';
      } else {
        const pn = prev !== null ? normalizeWord(prev) : null;
        reset();
        aux = ETRE_FORMS.has(w) ? 'attr' : 'avoir';
        reflexive = aux === 'attr' && (pn === 's' || pn === 'se');
      }
    } else if (DETERMINERS.has(w) && !(CLITIC_DETERMINERS.has(w) && prevMarks)) {
      lemma = DET_LEMMA[w] ?? D;
      np = 'open';
      opener = w;
      aux = 'none';
    } else if (CLITIC_DETERMINERS.has(w) && prevMarks) {
      // Object pronoun (« il la ferme », « il leur parle ») — a verb follows.
      lemma = DET_LEMMA[w] ?? D;
      reset();
      marker = true;
    } else if (w === 'en' && prevMarks) {
      // Adverbial clitic (« il en a »), not the preposition.
      reset();
      marker = true;
    } else if (PREPOSITIONS.has(w)) {
      np = 'open';
      opener = w;
      aux = 'none';
    } else if (isNumberWord(w)) {
      np = 'open';
      opener = 'num';
      aux = 'none';
    } else if (SUBJECT_CLITICS.has(w)) {
      // Pronouns are their own lemma (« cela » is not celer "to conceal").
      lemma = w in ELISIONS ? ELISIONS[w] : w;
      reset();
      marker = true;
    } else if (TRANSPARENT_ADVS.has(w) && !(np === 'open' && hasN)) {
      // Transparent inside a pattern (« une très longue marche », « est déjà
      // parti ») — but « le bien », « le tout » stay nouns (fall through).
      // As adverbs they are their own lemma (« plus » is not plaire).
      lemma = w;
    } else if (CONJUNCTIONS.has(w)) {
      // Conjunctions are their own lemma (« mais » is not the plural of mai).
      lemma = w in ELISIONS ? ELISIONS[w] : w;
      reset();
    } else if (/^[A-ZÀ-ÝŒ]/.test(t.word) && !sentenceInitial) {
      // Proper noun mid-sentence: itself, heading a phrase (« Marie porte »).
      lemma = w;
      np = 'head';
      opener = '';
      aux = 'none';
    } else if (aux === 'attr') {
      // Attribute position after être/copulas.
      if (flags.includes('p') && (reflexive || ETRE_VERB_LEMMAS.has(D))) {
        const wasCopula = COPULA_LEMMAS.has(D);
        reset(); // compound past: « elle est passée », « s'est formée »
        if (wasCopula) aux = 'attr'; // « est devenue célèbre »
      } else if (hasA) {
        lemma = A; // « il est ferme » → ferme
        reset();
      } else if (hasN) {
        lemma = N; // « il est guide » → guide
        reset();
        np = 'head';
      } else {
        reset();
      }
    } else if (aux === 'avoir') {
      if (flags.includes('p')) {
        reset(); // « il a marché » → marcher
        if (COPULA_LEMMAS.has(D)) aux = 'attr'; // « il a semblé fatigué »
      } else if (hasN) {
        lemma = N; // « on a cours » → cours
        reset();
        np = 'head';
      } else {
        reset();
      }
    } else if (np === 'open') {
      if (opener === 'en' && flags.includes('g')) {
        reset(); // gérondif: « en passant » → passer
      } else if (
        (PRENOMINAL_LEMMAS.has(D) || (hasA && !hasN)) &&
        looksNominal(nextWordInfo(tokens, i + 1))
      ) {
        lemma = A; // prenominal adjective — the head is still coming
      } else if (hasN) {
        lemma = N; // the noun head: « le livre », « la belle porte »
        np = 'head';
      } else if (hasA) {
        lemma = A; // adjective as head: « les nouvelles » handled above via N
        np = 'head';
      } else if (hasVerb) {
        reset(); // verb-only after a determiner — bail out to the default
        if (COPULA_LEMMAS.has(D)) aux = 'attr';
      } else {
        np = 'head'; // unknown word — assume it's the noun (« le wifi »)
      }
    } else if (np === 'head') {
      const isFinite = flags.includes('f');
      if (hasA && isFinite) {
        // « une poigne ferme » vs « la porte ferme mal » — a following
        // determiner/clitic/adverb marks the verb reading, and so does a
        // bare-noun object (« le site fait partie de… » → faire).
        const next = nextWordInfo(tokens, i + 1);
        const nw = next?.w ?? '';
        const verbish =
          next !== null &&
          (DETERMINERS.has(nw) ||
            SUBJECT_CLITICS.has(nw) ||
            TRANSPARENT_ADVS.has(nw) ||
            isNumberWord(nw) ||
            (next.flags.includes('n') && !isFunctionWord(nw)));
        if (verbish) {
          reset();
          if (COPULA_LEMMAS.has(D)) aux = 'attr';
        } else {
          lemma = A; // post-nominal adjective: « la porte ouverte »
        }
      } else if (hasA && !hasVerb) {
        lemma = A;
      } else if (hasA) {
        lemma = A; // participle after the head: « la semaine passée » → passé
      } else if (hasN && hasVerb) {
        reset(); // the clause's verb: « la marche rapide fatigue » → fatiguer
        if (COPULA_LEMMAS.has(D)) aux = 'attr'; // « la demande reste forte »
      } else if (hasN) {
        lemma = N; // apposition/compound — a noun with no verb reading
      } else if (hasVerb) {
        reset(); // « les cours commencent » → commencer
        if (COPULA_LEMMAS.has(D)) aux = 'attr'; // « la Terre devient chaude »
      }
    } else {
      // No pattern is open: the default (verb-preferred) lemma. A copula puts
      // the next word in attribute position (« il reste calme »); a
      // sentence-initial capitalized word directly followed by a finite verb
      // is a bare-noun subject — usually a name (« Marie porte une robe »,
      // « Paris est magnifique »), never an imperative (those are followed by
      // an object, not a finite verb).
      if (flags.includes('f') && COPULA_LEMMAS.has(D)) {
        reset();
        aux = 'attr';
      } else if (sentenceInitial && /^[A-ZÀ-ÝŒ]/.test(t.word)) {
        const next = nextWordInfo(tokens, i + 1);
        if (
          next &&
          (ETRE_FORMS.has(next.w) || AVOIR_FORMS.has(next.w) || next.flags.includes('f'))
        ) {
          lemma = w; // « Paris est magnifique » — paris, not pari
          np = 'head';
        } else if (hasN && !hasVerb) {
          np = 'head';
        }
      } else if (hasN && !hasVerb) {
        np = 'head'; // bare noun subject — adjectives may follow
      }
    }

    out.set(t, lemma);
    prev = t.word;
  }
  return out;
}

/* ——— Full lexicon: lazy-loaded, cached, offline ——— */

const LEXICON_PATH = `${import.meta.env.BASE_URL}lemmas-fr.txt`;
// v3: the file format is now "form⇥flags⇥default⇥noun⇥adj" (reading flags +
// per-reading lemmas for the contextual rules). The bump forces returning
// users off their cached older copy; `purgeStaleLexiconCaches` frees it.
const LEXICON_CACHE = 'parcours-lexicon-v3';

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
      // Intern the flag strings — ~30 distinct combinations across 400k rows.
      const interned = new Map<string, string>();
      for (const line of text.split('\n')) {
        // "form⇥flags⇥default⇥noun⇥adj", empty trailing fields trimmed.
        const cols = line.split('\t');
        if (cols.length < 2 || !cols[0]) continue;
        const form = cols[0];
        if (cols[1]) {
          let f = interned.get(cols[1]);
          if (f === undefined) {
            f = cols[1];
            interned.set(f, f);
          }
          FLAGS.set(form, f);
        }
        if (cols[2]) LEMMAS.set(form, cols[2]);
        if (cols[3]) NOUN_LEMMA.set(form, cols[3]);
        if (cols[4]) ADJ_LEMMA.set(form, cols[4]);
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
