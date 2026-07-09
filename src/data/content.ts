import articlesJson from '../../articles_corpus.json';
import verbsJson from '../../conjugation_verbs.json';

export type CefrLevel = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';

export interface Article {
  id: number;
  cefr_level: CefrLevel;
  title: string;
  title_en: string;
  word_count: number;
  content: string;
  /** Estimated reading time at a learner's pace (~150 wpm). */
  readingMinutes: number;
}

interface RawArticle {
  id: number;
  cefr_level: string;
  title: string;
  title_en: string;
  word_count: number;
  content: string;
}

/** CEFR order for sorting; anything unexpected sorts last. */
const LEVEL_ORDER: Record<string, number> = { A1: 0, A2: 1, B1: 2, B2: 3, C1: 4, C2: 5 };

// The corpus JSON was grown in increments, so its articles are interleaved by
// level (a block of A1s, then A2s, … then more A1s from the next batch). Order
// them by CEFR level (then id) once here so every consumer that iterates
// `articles` — the reading list above all — walks A1→A2→B1→B2 cleanly.
export const articles: Article[] = (articlesJson as RawArticle[])
  .map((a) => ({
    ...a,
    cefr_level: a.cefr_level as CefrLevel,
    readingMinutes: Math.max(1, Math.round(a.word_count / 150)),
  }))
  .sort(
    (a, b) =>
      (LEVEL_ORDER[a.cefr_level] ?? 99) - (LEVEL_ORDER[b.cefr_level] ?? 99) || a.id - b.id,
  );

export function getArticle(id: number): Article | undefined {
  return articles.find((a) => a.id === id);
}

export type TenseKey =
  | 'present'
  | 'imparfait'
  | 'futur'
  | 'passeCompose'
  | 'plusQueParfait'
  | 'futurAnterieur'
  | 'conditionnel'
  | 'conditionnelPasse'
  | 'subjonctif';

/** Eight slots: je, tu, il, elle, nous, vous, ils, elles. */
export type ConjugationRow = string[];

interface RawVerbData {
  verbs: Record<string, Record<string, ConjugationRow>>;
  meanings: Record<string, string>;
}

const rawVerbs = verbsJson as RawVerbData;

export const verbs = rawVerbs.verbs as Record<string, Record<TenseKey, ConjugationRow>>;
export const verbMeanings = rawVerbs.meanings;
export const verbList = Object.keys(verbs);

/**
 * `label` is the full name (tense picker, drill header, results review);
 * `abbr` is a standard, compact form for the tight mixed-drill row chip so the
 * tense column can stay narrow and leave more room for the answer input.
 */
export const TENSES: { key: TenseKey; label: string; abbr: string; labelEn: string }[] = [
  { key: 'present', label: 'Présent', abbr: 'Présent', labelEn: 'Present' },
  { key: 'imparfait', label: 'Imparfait', abbr: 'Imparfait', labelEn: 'Imperfect' },
  { key: 'passeCompose', label: 'Passé composé', abbr: 'Passé comp.', labelEn: 'Perfect' },
  { key: 'plusQueParfait', label: 'Plus-que-parfait', abbr: 'P.-q.-parf.', labelEn: 'Pluperfect' },
  { key: 'futur', label: 'Futur simple', abbr: 'Futur', labelEn: 'Future' },
  { key: 'futurAnterieur', label: 'Futur antérieur', abbr: 'Futur ant.', labelEn: 'Future perfect' },
  { key: 'conditionnel', label: 'Conditionnel présent', abbr: 'Cond. prés.', labelEn: 'Conditional' },
  { key: 'conditionnelPasse', label: 'Conditionnel passé', abbr: 'Cond. passé', labelEn: 'Past conditional' },
  { key: 'subjonctif', label: 'Subjonctif', abbr: 'Subjonctif', labelEn: 'Subjunctive' },
];
