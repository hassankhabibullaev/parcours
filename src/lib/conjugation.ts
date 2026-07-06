import { TENSES, verbList, verbMeanings, verbs, type TenseKey } from '../data/content';
import { shuffle } from './practice';

export const SESSION_SIZE = 10;
export const PROMPTS_PER_EXERCISE = 3;

type Person = 1 | 2 | 3;
type GrammaticalNumber = 'sg' | 'pl';

interface PronounDef {
  label: string;
  /** Column in the dataset's 8-form rows; « on » shares the « il » column. */
  slot: number;
  person: Person;
  num: GrammaticalNumber;
}

const PRONOUN_DEFS: PronounDef[] = [
  { label: 'je', slot: 0, person: 1, num: 'sg' },
  { label: 'tu', slot: 1, person: 2, num: 'sg' },
  { label: 'il', slot: 2, person: 3, num: 'sg' },
  { label: 'elle', slot: 3, person: 3, num: 'sg' },
  { label: 'on', slot: 2, person: 3, num: 'sg' },
  { label: 'nous', slot: 4, person: 1, num: 'pl' },
  { label: 'vous', slot: 5, person: 2, num: 'pl' },
  { label: 'ils', slot: 6, person: 3, num: 'pl' },
  { label: 'elles', slot: 7, person: 3, num: 'pl' },
];

/**
 * Valid person layouts for one exercise: three distinct person×number
 * categories, all three persons represented, both numbers present
 * (two singular + one plural, or one singular + two plural).
 */
const PERSON_COMBOS: { sg: Person[]; pl: Person[] }[] = [
  { sg: [1, 2], pl: [3] },
  { sg: [1, 3], pl: [2] },
  { sg: [2, 3], pl: [1] },
  { sg: [1], pl: [2, 3] },
  { sg: [2], pl: [1, 3] },
  { sg: [3], pl: [1, 2] },
];

const ALL_TENSE_KEYS: TenseKey[] = TENSES.map((t) => t.key);

export interface ConjugationPrompt {
  tense: TenseKey;
  pronoun: string;
  slot: number;
  /**
   * All acceptable answers — être-verbs store gender/number agreement
   * variants pipe-separated in the dataset ("es passé|es passée").
   */
  answers: string[];
}

export interface Exercise {
  verb: string;
  meaning: string;
  prompts: ConjugationPrompt[];
}

function leastUsed(candidates: PronounDef[], usage: Map<string, number>): PronounDef {
  const min = Math.min(...candidates.map((c) => usage.get(c.label)!));
  return shuffle(candidates.filter((c) => usage.get(c.label)! === min))[0];
}

/**
 * Three pronouns for one exercise: every valid person layout is resolved to
 * its least-used pronouns, then the cheapest layout wins (random tie-break) —
 * this keeps the session-wide distribution balanced instead of purely random.
 */
function pickPronouns(usage: Map<string, number>): PronounDef[] {
  const options = PERSON_COMBOS.map((combo) => {
    const picks = [
      ...combo.sg.map((person) =>
        leastUsed(PRONOUN_DEFS.filter((p) => p.person === person && p.num === 'sg'), usage),
      ),
      ...combo.pl.map((person) =>
        leastUsed(PRONOUN_DEFS.filter((p) => p.person === person && p.num === 'pl'), usage),
      ),
    ];
    const cost = picks.reduce((sum, p) => sum + usage.get(p.label)!, 0);
    return { picks, cost };
  });
  const minCost = Math.min(...options.map((o) => o.cost));
  const chosen = shuffle(options.filter((o) => o.cost === minCost))[0];
  for (const p of chosen.picks) usage.set(p.label, usage.get(p.label)! + 1);
  return chosen.picks;
}

/**
 * Deal three distinct tenses from a running deck. The deck is a shuffled
 * permutation of all nine tenses, refilled when it runs out, so tenses spread
 * as evenly as the arithmetic allows across a session (30 slots / 9 tenses ≈
 * every tense 3–4 times) and never repeat within an exercise.
 */
function drawTenses(deck: TenseKey[], count: number): { picked: TenseKey[]; deck: TenseKey[] } {
  const rest = [...deck];
  const picked: TenseKey[] = [];
  while (picked.length < count) {
    let idx = rest.findIndex((t) => !picked.includes(t));
    if (idx === -1) {
      rest.push(...shuffle(ALL_TENSE_KEYS));
      idx = rest.findIndex((t) => !picked.includes(t));
    }
    picked.push(rest[idx]);
    rest.splice(idx, 1);
  }
  return { picked, deck: rest };
}

export function buildSession(mode: TenseKey | 'mixed'): Exercise[] {
  const sessionVerbs = shuffle(verbList).slice(0, SESSION_SIZE);
  const usage = new Map(PRONOUN_DEFS.map((p) => [p.label, 0]));
  let deck: TenseKey[] = [];

  return sessionVerbs.map((verb) => {
    const pronouns = pickPronouns(usage);
    let tenses: TenseKey[];
    if (mode === 'mixed') {
      const drawn = drawTenses(deck, PROMPTS_PER_EXERCISE);
      tenses = drawn.picked;
      deck = drawn.deck;
    } else {
      tenses = Array(PROMPTS_PER_EXERCISE).fill(mode);
    }
    const pairedTenses = shuffle(tenses);
    const prompts = pronouns.map((p, i) => ({
      tense: pairedTenses[i],
      pronoun: p.label,
      slot: p.slot,
      answers: verbs[verb][pairedTenses[i]][p.slot].split('|'),
    }));
    return { verb, meaning: verbMeanings[verb] ?? '', prompts: shuffle(prompts) };
  });
}

const VOWEL_START = /^[aâàeéèêëiîïoôöuûüh]/i;

/**
 * « je » elides before a vowel; the subjunctive is prompted with « que ».
 * « que nous / que vous » are contracted to « q. nous / q. vous » so the
 * pronoun column stays narrow (every other subjunctive form already elides).
 */
export function pronounDisplay(pronoun: string, tense: TenseKey, answer: string): string {
  const elided = pronoun === 'je' && VOWEL_START.test(answer);
  const base = elided ? "j'" : pronoun;
  if (tense !== 'subjonctif') return base;
  if (elided) return "que j'";
  if (['il', 'elle', 'on', 'ils', 'elles'].includes(pronoun)) return `qu'${pronoun}`;
  if (pronoun === 'nous' || pronoun === 'vous') return `q. ${pronoun}`;
  return `que ${pronoun}`;
}

export function tenseLabel(key: TenseKey): string {
  return TENSES.find((t) => t.key === key)?.label ?? key;
}

/** Compact tense name for the tight mixed-drill row chip. */
export function tenseAbbr(key: TenseKey): string {
  return TENSES.find((t) => t.key === key)?.abbr ?? key;
}
