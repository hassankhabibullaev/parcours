import type { TenseKey } from '../data/content';

/**
 * Visual identity per tense. Tenses in one family share a hue (past = reds,
 * future = blues, conditional = mauves), light → dark within the family.
 * `color` is the saturated identity (stripes, badges, focus rings), `blob`
 * the pale gradient tint on picker cards, `wash` a translucent background
 * tint, `hint` the English meaning cue shown on the picker card.
 */
export interface TenseTheme {
  color: string;
  blob: string;
  wash: string;
  hint: string;
}

function rgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function theme(color: string, blob: string, hint: string): TenseTheme {
  return { color, blob, wash: rgba(color, 0.11), hint };
}

export const TENSE_THEMES: Record<TenseKey, TenseTheme> = {
  present: theme('#5b9438', '#bcdca0', 'I do · I am doing'),
  passeCompose: theme('#d86060', '#f8d4d4', 'I did · I have done'),
  imparfait: theme('#b02828', '#e89090', 'I was doing · I used to do'),
  plusQueParfait: theme('#5b1010', '#c05050', 'I had done'),
  futur: theme('#5d8fbe', '#d4e4f4', 'I will do'),
  futurAnterieur: theme('#23446e', '#92b4d4', 'I will have done'),
  conditionnel: theme('#a978c0', '#ead4f0', 'I would do'),
  conditionnelPasse: theme('#542670', '#b890c8', 'I would have done'),
  subjonctif: theme('#c89018', '#f5d878', '(that) I do'),
};

/** Picker layout: tenses grouped by family, in teaching order. */
export const TENSE_FAMILIES: {
  label: string;
  labelEn: string;
  color: string;
  tenses: TenseKey[];
}[] = [
  { label: 'Présent', labelEn: 'Present', color: '#5b9438', tenses: ['present'] },
  {
    label: 'Passé',
    labelEn: 'Past',
    color: '#b02828',
    tenses: ['passeCompose', 'imparfait', 'plusQueParfait'],
  },
  { label: 'Futur', labelEn: 'Future', color: '#23446e', tenses: ['futur', 'futurAnterieur'] },
  {
    label: 'Conditionnel',
    labelEn: 'Conditional',
    color: '#542670',
    tenses: ['conditionnel', 'conditionnelPasse'],
  },
  { label: 'Subjonctif', labelEn: 'Subjunctive', color: '#c89018', tenses: ['subjonctif'] },
];

/** Rainbow identity for the mixed drill — one stop per tense family. */
export const MIXED_STRIPE =
  'linear-gradient(90deg, #5b9438 0%, #c89018 22%, #b02828 50%, #23446e 76%, #542670 100%)';

export const MIXED_BLOB =
  'linear-gradient(135deg, #bcdca0 0%, #f5d878 18%, #f2c4c4 36%, #cfdff0 56%, #e0c8e8 72%, transparent 90%)';
