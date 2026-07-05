import { useEffect, useLayoutEffect, useState, type MouseEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { articles, type Article, type CefrLevel } from '../data/content';
import { db } from '../lib/db';
import { setArticleRead } from '../lib/articleProgress';
import { CheckCircleIcon, UndoIcon } from '../components/icons';

type Filter = 'all' | CefrLevel | 'read';

export default function ReadingPage() {
  const levels = [...new Set(articles.map((a) => a.cefr_level))].sort();
  const [filter, setFilter] = useState<Filter>('all');

  // The list always starts at the top — coming back from a long article (or
  // from "Mark as read") must not inherit the article's scroll offset.
  useLayoutEffect(() => window.scrollTo(0, 0), []);

  // A just-marked article keeps its old spot while its card is stamped read,
  // then sinks away and settles into the read group. Triggered either by
  // navigation state (from the article view) or by the inline toggle.
  const location = useLocation();
  const [justRead, setJustRead] = useState<number | null>(
    () => (location.state as { justRead?: number } | null)?.justRead ?? null,
  );
  const [sinking, setSinking] = useState(false);
  useEffect(() => {
    if (justRead === null) return;
    window.history.replaceState({}, ''); // don't replay on back/refresh
    const sink = window.setTimeout(() => setSinking(true), 1000);
    const settle = window.setTimeout(() => {
      setJustRead(null);
      setSinking(false);
    }, 1600);
    return () => {
      window.clearTimeout(sink);
      window.clearTimeout(settle);
    };
  }, [justRead]);

  const progress = useLiveQuery(() => db.articleProgress.toArray(), []) ?? [];
  const progressById = new Map(progress.map((p) => [p.articleId, p]));
  const isRead = (id: number) => progressById.get(id)?.read === 1;

  const shown =
    filter === 'all'
      ? articles
      : filter === 'read'
        ? articles.filter((a) => isRead(a.id))
        : articles.filter((a) => a.cefr_level === filter);

  // Unread up top, read below a divider (corpus order within each group). The
  // just-read article counts as unread until its send-off animation ends.
  const isSettledRead = (id: number) => isRead(id) && id !== justRead;
  const unread = shown.filter((a) => !isSettledRead(a.id));
  const read = shown.filter((a) => isSettledRead(a.id));

  function toggleRead(e: MouseEvent, article: Article) {
    // The button lives inside the card's <Link> — don't open the article.
    e.preventDefault();
    e.stopPropagation();
    if (isRead(article.id)) {
      setArticleRead(article.id, false);
    } else {
      setArticleRead(article.id, true);
      setSinking(false);
      setJustRead(article.id);
    }
  }

  const renderCard = (article: Article) => {
    const p = progressById.get(article.id);
    const marking = article.id === justRead;
    const cardClass = [
      'card article-card',
      p?.read && !marking ? 'article-card--read' : '',
      marking ? 'article-card--just-read' : '',
      marking && sinking ? 'article-card--sinking' : '',
    ]
      .filter(Boolean)
      .join(' ');
    return (
      <Link key={article.id} to={`/reading/${article.id}`} className={cardClass}>
        <div className="article-card__top">
          <span className={`level-badge level-badge--${article.cefr_level}`}>
            {article.cefr_level}
          </span>
          <span className="article-card__top-right">
            {p?.read ? (
              <span className={`already-stamp${marking ? ' already-stamp--in' : ''}`}>
                Already read
              </span>
            ) : p && p.position > 0.02 ? (
              <span className="progress-stamp">In progress</span>
            ) : null}
            <button
              className="icon-btn article-card__toggle"
              onClick={(e) => toggleRead(e, article)}
              aria-label={p?.read ? 'Mark as unread' : 'Mark as read'}
              title={p?.read ? 'Mark as unread' : 'Mark as read'}
            >
              {p?.read ? <UndoIcon /> : <CheckCircleIcon />}
            </button>
          </span>
        </div>
        <h3 className="article-card__title">{article.title}</h3>
        <p className="article-card__subtitle">{article.title_en}</p>
        <p className="article-card__meta">
          {article.word_count} words · {article.readingMinutes} min read
        </p>
      </Link>
    );
  };

  return (
    <>
      <h2 className="page-heading">Reading</h2>
      <p className="page-subheading">Stories for every level — tap any word to look it up.</p>

      <div className="chip-row">
        <button
          className={`chip${filter === 'all' ? ' chip--active' : ''}`}
          onClick={() => setFilter('all')}
        >
          All
        </button>
        {levels.map((l) => (
          <button
            key={l}
            className={`chip${filter === l ? ' chip--active' : ''}`}
            onClick={() => setFilter(l)}
          >
            {l}
          </button>
        ))}
        <button
          className={`chip${filter === 'read' ? ' chip--active' : ''}`}
          onClick={() => setFilter('read')}
        >
          Read
        </button>
      </div>

      {unread.map(renderCard)}

      {read.length > 0 && unread.length > 0 && (
        <div className="read-divider">Already read</div>
      )}

      {read.map(renderCard)}
    </>
  );
}
