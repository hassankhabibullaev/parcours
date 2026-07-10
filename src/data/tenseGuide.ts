import type { TenseKey } from './content';

/**
 * The Learn tab's grammar content: one guide per drilled tense — when to use
 * it, how it's built, the ending sets, a couple of examples and the traps.
 * Static teaching text lives here; the live conjugation rows shown next to it
 * are rendered from the real verb dataset (`modelVerbs`), so the guide can
 * never drift from what the drills grade.
 */

export interface EndingSet {
  /** e.g. "-er verbs (parler)" or "all verbs". */
  label: string;
  /** Six endings in je/tu/il/nous/vous/ils order. */
  forms: string[];
}

export interface TenseGuide {
  tense: TenseKey;
  /** When to reach for this tense. */
  usage: string[];
  /** How it's built, in one line. */
  formation: string;
  endings?: EndingSet[];
  examples: { fr: string; en: string }[];
  exceptions: string[];
  /** Verbs from the drilled dataset rendered as live example tables. */
  modelVerbs: string[];
}

export const TENSE_GUIDES: Record<TenseKey, TenseGuide> = {
  present: {
    tense: 'present',
    usage: [
      'What is happening now, or happens regularly (habits, routines).',
      'General truths and facts.',
      'A near future in everyday speech (« J’arrive ! »).',
    ],
    formation: 'Drop the infinitive ending, then add the endings for the verb’s group.',
    endings: [
      { label: '-er verbs (parler)', forms: ['-e', '-es', '-e', '-ons', '-ez', '-ent'] },
      { label: '-ir verbs (finir)', forms: ['-is', '-is', '-it', '-issons', '-issez', '-issent'] },
      { label: '-re verbs (vendre)', forms: ['-s', '-s', '—', '-ons', '-ez', '-ent'] },
    ],
    examples: [
      { fr: 'Je parle français tous les jours.', en: 'I speak French every day.' },
      { fr: 'Nous finissons à midi.', en: 'We finish at noon.' },
    ],
    exceptions: [
      'être, avoir, aller and faire are fully irregular — learn them by heart.',
      'Spelling glue before -ons: nous mangeons, nous commençons.',
      'Boot verbs shift their stem: acheter → j’achète, appeler → j’appelle, préférer → je préfère.',
    ],
    modelVerbs: ['parler', 'finir', 'être', 'avoir'],
  },
  imparfait: {
    tense: 'imparfait',
    usage: [
      'Background and description in the past (weather, feelings, scenery).',
      'Habits — “used to do”.',
      'An ongoing action another event interrupts (« Je lisais quand… »).',
    ],
    formation: 'Take the nous form of the présent, drop -ons, add the imparfait endings.',
    endings: [{ label: 'all verbs', forms: ['-ais', '-ais', '-ait', '-ions', '-iez', '-aient'] }],
    examples: [
      { fr: 'Quand j’étais petit, je jouais dehors.', en: 'When I was little, I used to play outside.' },
      { fr: 'Il faisait beau ce matin.', en: 'The weather was nice this morning.' },
    ],
    exceptions: [
      'être is the only irregular stem: ét- (j’étais, tu étais…).',
      'The softening spellings stay before a: je mangeais, je commençais.',
    ],
    modelVerbs: ['parler', 'être'],
  },
  passeCompose: {
    tense: 'passeCompose',
    usage: [
      'Completed events — “did / has done”.',
      'A sequence of actions that moves a story forward.',
    ],
    formation:
      'Présent of avoir (or être) + past participle: -er → -é, -ir → -i, -re → -u.',
    endings: [
      { label: 'with avoir', forms: ['most verbs'] },
      { label: 'with être', forms: ['movement & change verbs', 'all reflexives'] },
    ],
    examples: [
      { fr: 'J’ai fini mes devoirs.', en: 'I finished my homework.' },
      { fr: 'Elle est arrivée hier.', en: 'She arrived yesterday — être agrees!' },
    ],
    exceptions: [
      'With être the participle agrees: elle est partie, ils sont partis.',
      'Irregular participles: être → été, avoir → eu, faire → fait, prendre → pris, mettre → mis, dire → dit, écrire → écrit, ouvrir → ouvert, voir → vu, boire → bu, lire → lu, venir → venu, devoir → dû.',
    ],
    modelVerbs: ['parler', 'aller'],
  },
  plusQueParfait: {
    tense: 'plusQueParfait',
    usage: [
      'A past action before another past action — “had done”.',
      'Regrets with si seulement (« Si seulement j’avais su ! »).',
    ],
    formation: 'Imparfait of avoir (or être) + past participle.',
    examples: [
      { fr: 'J’avais déjà mangé quand il est arrivé.', en: 'I had already eaten when he arrived.' },
      { fr: 'Elle était partie avant la pluie.', en: 'She had left before the rain.' },
    ],
    exceptions: ['Same auxiliary choice and agreement rules as the passé composé.'],
    modelVerbs: ['parler', 'partir'],
  },
  futur: {
    tense: 'futur',
    usage: [
      'Plans and predictions — “will do”.',
      'After quand / dès que when the main clause is future.',
    ],
    formation:
      'The whole infinitive + endings (drop the final -e of -re verbs) — a future stem always ends in r.',
    endings: [{ label: 'all verbs', forms: ['-ai', '-as', '-a', '-ons', '-ez', '-ont'] }],
    examples: [
      { fr: 'Je parlerai avec elle demain.', en: 'I will speak with her tomorrow.' },
      { fr: 'Quand tu arriveras, appelle-moi.', en: 'When you arrive, call me.' },
    ],
    exceptions: [
      'Irregular stems: être → ser-, avoir → aur-, aller → ir-, faire → fer-, venir → viendr-, voir → verr-, pouvoir → pourr-, devoir → devr-, savoir → saur-, vouloir → voudr-, envoyer → enverr-.',
    ],
    modelVerbs: ['parler', 'être'],
  },
  futurAnterieur: {
    tense: 'futurAnterieur',
    usage: [
      'What will already be done by a future moment — “will have done”.',
      'A guess about the past (« Il aura oublié. » — he must have forgotten).',
    ],
    formation: 'Futur simple of avoir (or être) + past participle.',
    examples: [
      { fr: 'J’aurai fini avant midi.', en: 'I will have finished before noon.' },
      { fr: 'Elle sera partie quand tu arriveras.', en: 'She will have left by the time you arrive.' },
    ],
    exceptions: ['Same auxiliary choice and agreement rules as the passé composé.'],
    modelVerbs: ['finir', 'partir'],
  },
  conditionnel: {
    tense: 'conditionnel',
    usage: [
      '“Would do” — wishes and softened statements.',
      'Politeness: « Je voudrais un café. »',
      'Hypotheses: si + imparfait → conditionnel.',
    ],
    formation: 'Future stem + imparfait endings.',
    endings: [{ label: 'all verbs', forms: ['-ais', '-ais', '-ait', '-ions', '-iez', '-aient'] }],
    examples: [
      { fr: 'Si j’avais le temps, je voyagerais.', en: 'If I had time, I would travel.' },
      { fr: 'Tu pourrais m’aider ?', en: 'Could you help me?' },
    ],
    exceptions: [
      'Any verb with an irregular future stem keeps it here: être → serais, aller → irais, pouvoir → pourrais…',
    ],
    modelVerbs: ['parler', 'vouloir'],
  },
  conditionnelPasse: {
    tense: 'conditionnelPasse',
    usage: [
      '“Would have done” — missed possibilities.',
      'Regrets and reproaches: « J’aurais dû… » — I should have…',
      'Unreal past: si + plus-que-parfait → conditionnel passé.',
    ],
    formation: 'Conditionnel présent of avoir (or être) + past participle.',
    examples: [
      { fr: 'J’aurais aimé venir.', en: 'I would have liked to come.' },
      { fr: 'Si tu avais appelé, elle serait venue.', en: 'If you had called, she would have come.' },
    ],
    exceptions: [
      'Same auxiliary choice and agreement rules as the passé composé.',
      'j’aurais dû + infinitive = “I should have…”.',
    ],
    modelVerbs: ['aimer', 'venir'],
  },
  subjonctif: {
    tense: 'subjonctif',
    usage: [
      'After expressions of necessity, wish, doubt or emotion: il faut que, je veux que, bien que…',
      'Always introduced by que — it never stands alone.',
    ],
    formation:
      'Take the ils form of the présent, drop -ent, add the endings (nous / vous borrow their imparfait forms).',
    endings: [{ label: 'all verbs', forms: ['-e', '-es', '-e', '-ions', '-iez', '-ent'] }],
    examples: [
      { fr: 'Il faut que je parte.', en: 'I have to leave.' },
      { fr: 'Je veux que tu finisses.', en: 'I want you to finish.' },
    ],
    exceptions: [
      'Memorize: être → que je sois, avoir → que j’aie, aller → que j’aille, faire → que je fasse, pouvoir → que je puisse, savoir → que je sache, vouloir → que je veuille.',
    ],
    modelVerbs: ['finir', 'être'],
  },
};
