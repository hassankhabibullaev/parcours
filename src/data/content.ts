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

export const articles: Article[] = (articlesJson as RawArticle[]).map((a) => ({
  ...a,
  cefr_level: a.cefr_level as CefrLevel,
  readingMinutes: Math.max(1, Math.round(a.word_count / 150)),
}));

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

export const PRONOUNS = ['je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles'] as const;

interface RawVerbData {
  verbs: Record<string, Record<string, ConjugationRow>>;
  meanings: Record<string, string>;
}

const rawVerbs = verbsJson as RawVerbData;

export const verbs = rawVerbs.verbs as Record<string, Record<TenseKey, ConjugationRow>>;
export const verbMeanings = rawVerbs.meanings;
export const verbList = Object.keys(verbs);

export const TENSES: { key: TenseKey; label: string; labelEn: string }[] = [
  { key: 'present', label: 'Présent', labelEn: 'Present' },
  { key: 'imparfait', label: 'Imparfait', labelEn: 'Imperfect' },
  { key: 'passeCompose', label: 'Passé composé', labelEn: 'Perfect' },
  { key: 'plusQueParfait', label: 'Plus-que-parfait', labelEn: 'Pluperfect' },
  { key: 'futur', label: 'Futur simple', labelEn: 'Future' },
  { key: 'futurAnterieur', label: 'Futur antérieur', labelEn: 'Future perfect' },
  { key: 'conditionnel', label: 'Conditionnel présent', labelEn: 'Conditional' },
  { key: 'conditionnelPasse', label: 'Conditionnel passé', labelEn: 'Past conditional' },
  { key: 'subjonctif', label: 'Subjonctif', labelEn: 'Subjunctive' },
];
