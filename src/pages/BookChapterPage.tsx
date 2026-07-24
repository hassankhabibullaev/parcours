import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { upsertArticleProgress } from '../lib/articleProgress';
import {
  chapterKey,
  chapterName,
  chapterParagraphs,
  getBook,
  loadBook,
  readingMinutes,
  type BookContent,
} from '../lib/books';
import { keyClick, confirmTock } from '../lib/sound';
import { useAutoSpeak } from '../lib/useAutoSpeak';
import { titleSpeechEnabled } from '../lib/settings';
import { useAuth } from '../components/AuthProvider';
import { useAuthGate } from '../components/AuthGate';
import ReaderBody from '../components/ReaderBody';
import WordModal, { type LookupRequest } from '../components/WordModal';

function currentScrollPosition(): number {
  const el = document.documentElement;
  const max = el.scrollHeight - el.clientHeight;
  return max > 0 ? Math.min(1, Math.max(0, el.scrollTop / max)) : 0;
}

/**
 * One book chapter, read exactly like an article: typewriter heading, every
 * word a one-tap lookup, learning words highlighted, scroll position and the
 * read flag remembered per chapter (signed-in), and « Mark as read » flowing
 * straight into the next chapter. The chapter texts arrive via loadBook
 * (fetched once per book, then cached for offline).
 */
export default function BookChapterPage() {
  const { bookId, chapter } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { requireAuth } = useAuthGate();

  const book = getBook(bookId);
  const index = Number(chapter) - 1; // chapters are 1-based in the URL
  const meta = book && Number.isInteger(index) ? book.chapters[index] : undefined;
  const key = book && meta ? chapterKey(book.id, index) : '';

  // The whole book's texts load in one go (then come from Cache Storage), so
  // flipping to the next chapter is instant.
  const [content, setContent] = useState<BookContent | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0); // bump to retry after a failure
  useEffect(() => {
    if (!book) return;
    let cancelled = false;
    setFailed(false);
    loadBook(book.id).then(
      (b) => {
        if (!cancelled) setContent(b);
      },
      () => {
        if (!cancelled) setFailed(true);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [book?.id, attempt]);

  const text = content?.chapters[index]?.content;
  const paragraphs = useMemo(() => (text ? chapterParagraphs(text) : []), [text]);

  const progress = useLiveQuery(
    () => (key ? db.articleProgress.get(key) : undefined),
    [key],
  );

  const [lookup, setLookup] = useState<LookupRequest | null>(null);

  // Typewriter reveal of the chapter heading — the article view's animation.
  const heading = meta ? chapterName(meta) : '';
  const [typed, setTyped] = useState('');
  const [rendering, setRendering] = useState(true);
  useEffect(() => {
    if (!heading) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setTyped(heading);
      setRendering(false);
      return;
    }
    setTyped('');
    setRendering(true);
    let i = 0;
    const timer = window.setInterval(() => {
      i += 1;
      setTyped(heading.slice(0, i));
      keyClick();
      if (i >= heading.length) {
        window.clearInterval(timer);
        setRendering(false);
      }
    }, 30);
    return () => window.clearInterval(timer);
  }, [heading]);

  // Read the chapter's French title aloud once the heading finishes typing
  // (books with plain numbered chapters have nothing worth speaking).
  useAutoSpeak(meta?.title ?? undefined, !rendering && titleSpeechEnabled());

  // Record the visit and restore the saved scroll position — once per
  // chapter, and only after the text has rendered (the page needs its full
  // height before a 0..1 position means anything).
  const restoredForRef = useRef('');
  const ready = paragraphs.length > 0;
  useEffect(() => {
    if (!key || !ready || restoredForRef.current === key) return;
    restoredForRef.current = key;
    // Guests read freely but leave no trace: nothing is written and there is
    // no saved position to restore, so just open at the top.
    if (!user) {
      window.scrollTo(0, 0);
      return;
    }
    db.articleProgress.get(key).then((p) => {
      upsertArticleProgress(key, {});
      if (p && p.position > 0 && !p.read) {
        const el = document.documentElement;
        window.scrollTo(0, p.position * (el.scrollHeight - el.clientHeight));
      } else {
        window.scrollTo(0, 0);
      }
    });
  }, [key, ready, user]);

  // Remember how far the learner scrolled (throttled + on leave) — signed-in only.
  useEffect(() => {
    if (!key || !ready || !user) return;
    let timer: number | null = null;
    const save = () => upsertArticleProgress(key, { position: currentScrollPosition() });
    const onScroll = () => {
      if (timer !== null) return;
      timer = window.setTimeout(() => {
        timer = null;
        save();
      }, 1000);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      if (timer !== null) window.clearTimeout(timer);
      save();
    };
  }, [key, ready, user]);

  if (!book || !meta) {
    return (
      <>
        <h2 className="page-heading">Chapter not found</h2>
        <Link className="btn btn--ghost" to="/reading?tab=books">
          ← Back to the library
        </Link>
      </>
    );
  }

  const isRead = progress?.read === 1;
  const nextTo =
    index + 1 < book.chapters.length ? `/reading/book/${book.id}/${index + 2}` : null;

  return (
    <>
      <div className="article-topbar">
        <Link to={`/reading/book/${book.id}`} className="article-topbar__back">
          ← {book.title}
        </Link>
        <span className={`level-badge level-badge--${book.level}`}>{book.level}</span>
      </div>

      <h2 className="article-title" aria-label={heading}>
        <span className="article-title__ghost" aria-hidden>
          {heading}
        </span>
        <span className={`article-title__typed${rendering ? ' is-typing' : ''}`} aria-hidden>
          {typed}
        </span>
      </h2>
      {meta.title && <p className="article-subtitle">{meta.title}</p>}
      <p className="article-meta">
        {meta.section && <>{meta.section} · </>}
        {meta.words.toLocaleString('en-US')} words · {readingMinutes(meta.words)} min read
        {isRead && <span className="read-stamp"> · Read ✓</span>}
      </p>

      {ready ? (
        <ReaderBody paragraphs={paragraphs} articleId={null} onLookup={setLookup} dropCap />
      ) : failed ? (
        <div className="card">
          <p style={{ margin: '0 0 12px' }}>
            Could not load the book — it downloads once, then reads offline. Check the
            connection and try again.
          </p>
          <button className="btn btn--accent" onClick={() => setAttempt((n) => n + 1)}>
            Retry
          </button>
        </div>
      ) : (
        /* Skeleton paragraphs while the book downloads. */
        <div aria-hidden="true">
          {[92, 100, 96, 88, 100, 94].map((w, i) => (
            <div key={i} className="skeleton skeleton--line" style={{ width: `${w}%` }} />
          ))}
        </div>
      )}

      {ready && (
        <div className="article-end">
          {isRead ? (
            <>
              {nextTo && (
                <Link className="btn btn--accent" to={nextTo}>
                  Next chapter →
                </Link>
              )}
              <button
                className="btn btn--ghost"
                onClick={() => upsertArticleProgress(key, { read: 0 })}
              >
                Mark as unread
              </button>
            </>
          ) : (
            <button
              className="btn btn--accent"
              onClick={async () => {
                // Marking read is personal progress — guests are prompted to sign in.
                if (!requireAuth('read')) return;
                confirmTock();
                await upsertArticleProgress(key, { read: 1, position: 1 });
                // Flow straight on: next chapter, or back to the contents
                // when the book is done.
                navigate(nextTo ?? `/reading/book/${book.id}`);
              }}
            >
              Mark as read ✓{nextTo ? ' — next chapter' : ''}
            </button>
          )}
        </div>
      )}

      {lookup && <WordModal request={lookup} onClose={() => setLookup(null)} />}
    </>
  );
}
