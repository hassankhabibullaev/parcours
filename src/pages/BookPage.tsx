import { useLayoutEffect } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { bookProgress, chapterKey, chapterName, getBook, readingMinutes } from '../lib/books';
import { CheckCircleIcon } from '../components/icons';

/**
 * One book's contents page: title, progress, a Continue shortcut to the
 * first unread chapter, and the full chapter list with read stamps — the
 * "where did I leave off" view. Chapter texts aren't needed here; everything
 * renders from the bundled catalog.
 */
export default function BookPage() {
  const { bookId } = useParams();
  const book = getBook(bookId);

  const rows = useLiveQuery(() => db.articleProgress.toArray(), []) ?? [];

  // Contents always opens at the top — never inherits a chapter's scroll.
  useLayoutEffect(() => window.scrollTo(0, 0), []);

  if (!book) {
    return (
      <>
        <h2 className="page-heading">Book not found</h2>
        <Link className="btn btn--ghost" to="/reading?tab=books">
          ← Back to the library
        </Link>
      </>
    );
  }

  const progress = bookProgress(book, rows);
  const rowByKey = new Map(rows.map((r) => [r.articleId, r]));
  const continueTo =
    progress.nextIndex >= 0 ? `/reading/book/${book.id}/${progress.nextIndex + 1}` : null;

  let lastSection: string | null = null;

  return (
    <>
      <div className="article-topbar">
        <Link to="/reading?tab=books" className="article-topbar__back">
          ← Library
        </Link>
        <span className={`level-badge level-badge--${book.level}`}>{book.level}</span>
      </div>

      <h2 className="article-title">{book.title}</h2>
      <p className="article-subtitle">{book.author}</p>
      <p className="article-meta">
        {book.chapters.length} chapters · {book.words.toLocaleString('en-US')} words
        {progress.read > 0 && (
          <span className="read-stamp">
            {' '}
            · {progress.read === progress.total ? 'All read ✓' : `${progress.read} read ✓`}
          </span>
        )}
      </p>

      {continueTo && (
        <Link className="btn btn--accent book-continue" to={continueTo}>
          {progress.started || progress.read > 0
            ? `Continue — ${chapterName(book.chapters[progress.nextIndex])}`
            : 'Start reading'}
        </Link>
      )}

      {book.chapters.map((chapter, i) => {
        const row = rowByKey.get(chapterKey(book.id, i));
        const read = row?.read === 1;
        const started = !read && (row?.position ?? 0) > 0.02;
        const sectionLabel =
          chapter.section && chapter.section !== lastSection ? chapter.section : null;
        lastSection = chapter.section;
        return (
          <span key={i}>
            {sectionLabel && <div className="section-label">{sectionLabel}</div>}
            <Link
              className={`chapter-row${read ? ' chapter-row--read' : ''}`}
              to={`/reading/book/${book.id}/${i + 1}`}
            >
              <span className="chapter-row__main">
                <span className="chapter-row__label">{chapterName(chapter)}</span>
                {chapter.title && <span className="chapter-row__title">{chapter.title}</span>}
              </span>
              <span className="chapter-row__side">
                {read ? (
                  <CheckCircleIcon />
                ) : started ? (
                  <span className="progress-stamp">In progress</span>
                ) : (
                  `${readingMinutes(chapter.words)} min`
                )}
              </span>
            </Link>
          </span>
        );
      })}
    </>
  );
}
