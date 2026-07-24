import catalogData from '../data/bookCatalog.json';
import { splitSentences, tokenize, type Sentence } from './lemmatize';
import type { ArticleProgress } from './db';
import type { CefrLevel } from '../data/content';

/**
 * The Books shelf (Reading → Books): six public-domain novels, parsed into
 * chapters by scripts/build-books.py. The bundled catalog carries every
 * book's metadata and chapter list (so the library and contents pages render
 * instantly, offline included); the chapter TEXTS live in per-book JSON
 * files under /books/, fetched on first open and kept in Cache Storage —
 * the same pattern as the lemmatizer's lexicon. Reading progress reuses the
 * articleProgress table with string keys (`book:<bookId>:<chapterIndex>`),
 * so book positions sync across devices with no schema or server change.
 */

export interface BookChapterMeta {
  /** « Chapitre IV », « Avant-propos », or a story's own title (Lupin). */
  label: string;
  /** Mixed-case descriptive title, for the books that have them. */
  title: string | null;
  /** « Première partie » / « Deuxième partie » (Vingt mille lieues only). */
  section: string | null;
  /** [k, n] when an over-long source chapter was split into n parts. */
  part: [number, number] | null;
  words: number;
}

export interface BookMeta {
  id: string;
  gutenbergId: number;
  title: string;
  author: string;
  level: CefrLevel;
  words: number;
  chapters: BookChapterMeta[];
}

export interface BookChapter extends BookChapterMeta {
  /** Chapter text; paragraphs separated by blank lines. */
  content: string;
}

export interface BookContent extends Omit<BookMeta, 'chapters'> {
  chapters: BookChapter[];
}

export const books = catalogData as BookMeta[];

export function getBook(id: string | undefined): BookMeta | undefined {
  return books.find((b) => b.id === id);
}

/** The articleProgress key for one chapter (string keys mark book rows). */
export function chapterKey(bookId: string, chapterIndex: number): string {
  return `book:${bookId}:${chapterIndex}`;
}

/** Same reading-speed rule as the articles (data/content.ts). */
export function readingMinutes(words: number): number {
  return Math.max(1, Math.round(words / 150));
}

/** Display name for a chapter row: label, plus the part when split. */
export function chapterName(chapter: BookChapterMeta): string {
  return chapter.part ? `${chapter.label} · ${chapter.part[0]}/${chapter.part[1]}` : chapter.label;
}

export interface BookProgress {
  read: number;
  total: number;
  /** Any chapter opened beyond a glance, or marked read. */
  started: boolean;
  /** First unread chapter index — where « Continue » goes; -1 when done. */
  nextIndex: number;
}

/** Fold the progress rows into one book's read/continue state. */
export function bookProgress(book: BookMeta, rows: ArticleProgress[]): BookProgress {
  const byIndex = new Map<number, ArticleProgress>();
  const prefix = `book:${book.id}:`;
  for (const row of rows) {
    if (typeof row.articleId === 'string' && row.articleId.startsWith(prefix)) {
      byIndex.set(Number(row.articleId.slice(prefix.length)), row);
    }
  }
  let read = 0;
  let started = false;
  let nextIndex = -1;
  book.chapters.forEach((_, i) => {
    const row = byIndex.get(i);
    if (row?.read === 1) read += 1;
    else if (nextIndex === -1) nextIndex = i;
    if (row && (row.read === 1 || row.position > 0.02)) started = true;
  });
  return { read, total: book.chapters.length, started, nextIndex };
}

/**
 * Book paragraphs are real (blank-line separated in the generated JSON), so
 * the chapter view renders them as-is — unlike articles, whose single text
 * block is re-chunked by buildParagraphs.
 */
export function chapterParagraphs(content: string): Sentence[][] {
  return content
    .split('\n\n')
    .map((p) => splitSentences(p).map((s) => ({ text: s, tokens: tokenize(s) })))
    .filter((p) => p.length > 0);
}

/* ——— Chapter-text loading (fetch once, then Cache Storage) ——— */

// Bump when scripts/build-books.py output changes shape or content, or
// returning readers keep their cached older copy (same rule as the
// lemmatizer's LEXICON_CACHE).
const BOOKS_CACHE = 'parcours-books-v1';

async function purgeStaleBookCaches(): Promise<void> {
  try {
    for (const key of await caches.keys()) {
      if (key.startsWith('parcours-books-') && key !== BOOKS_CACHE) {
        await caches.delete(key);
      }
    }
  } catch {
    /* best-effort cleanup */
  }
}

const inFlight = new Map<string, Promise<BookContent>>();

/** Load one book's chapter texts — network on first open, cache after. */
export function loadBook(id: string): Promise<BookContent> {
  let promise = inFlight.get(id);
  if (!promise) {
    promise = fetchBook(id).catch((err) => {
      // Let a failed load (offline, first open) be retried later.
      inFlight.delete(id);
      throw err;
    });
    inFlight.set(id, promise);
  }
  return promise;
}

async function fetchBook(id: string): Promise<BookContent> {
  const path = `/books/${encodeURIComponent(id)}.json`;
  let cache: Cache | null = null;
  try {
    await purgeStaleBookCaches();
    cache = await caches.open(BOOKS_CACHE);
    const hit = await cache.match(path);
    if (hit) return (await hit.json()) as BookContent;
  } catch {
    cache = null; // Cache Storage unavailable (private mode) — fetch plain.
  }
  const res = await fetch(path);
  if (!res.ok) throw new Error(`book ${id}: ${res.status}`);
  if (cache) {
    try {
      await cache.put(path, res.clone());
    } catch {
      /* quota exceeded etc. — reading still works, just not offline */
    }
  }
  return (await res.json()) as BookContent;
}
