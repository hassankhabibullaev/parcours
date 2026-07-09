import { useEffect, useLayoutEffect, useState, type MouseEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { articles, type Article, type CefrLevel } from '../data/content';
import { db } from '../lib/db';
import { setArticleRead } from '../lib/articleProgress';
import { successChime } from '../lib/sound';
import { CheckCircleIcon, UndoIcon } from '../components/icons';

type Tab = 'unread' | 'read';

const LEVELS = [...new Set(articles.map((a) => a.cefr_level))].sort() as CefrLevel[];
const levelColor = (level: CefrLevel) => `var(--level-${level.toLowerCase()})`;

export default function ReadingPage() {
  const [tab, setTab] = useState<Tab>('unread');

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

  // The just-read article counts as unread until its send-off animation ends.
  const isSettledRead = (id: number) => isRead(id) && id !== justRead;
  const unread = articles.filter((a) => !isSettledRead(a.id));
  const read = articles.filter((a) => isSettledRead(a.id));
  const shown = tab === 'unread' ? unread : read;

  // Article count per CEFR level within the active tab (A1: 5, B2: 12 …).
  const levelCounts = LEVELS.map((level) => ({
    level,
    n: shown.filter((a) => a.cefr_level === level).length,
  }));

  function toggleRead(e: MouseEvent, article: Article) {
    // The button lives inside the card's <Link> — don't open the article.
    e.preventDefault();
    e.stopPropagation();
    if (isRead(article.id)) {
      setArticleRead(article.id, false);
    } else {
      successChime();
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

      <div className="seg-tabs" role="tablist" aria-label="Reading list">
        <button
          role="tab"
          aria-selected={tab === 'unread'}
          className={`seg-tab${tab === 'unread' ? ' seg-tab--active' : ''}`}
          onClick={() => setTab('unread')}
        >
          Unread <span className="seg-tab__count">{unread.length}</span>
        </button>
        <button
          role="tab"
          aria-selected={tab === 'read'}
          className={`seg-tab${tab === 'read' ? ' seg-tab--active' : ''}`}
          onClick={() => setTab('read')}
        >
          Read <span className="seg-tab__count">{read.length}</span>
        </button>
      </div>

      <div className="level-counts">
        {levelCounts.map(({ level, n }) => (
          <span key={level} className={`level-count${n === 0 ? ' level-count--empty' : ''}`}>
            <span className="level-count__dot" style={{ ['--lc' as string]: levelColor(level) }} />
            {level}: <span className="level-count__n">{n}</span>
          </span>
        ))}
      </div>

      {shown.length > 0 ? (
        shown.map(renderCard)
      ) : (
        <div className="card">
          <p style={{ margin: 0 }}>
            {tab === 'unread'
              ? 'Every story read — bravo ! Reread a favourite from the Read tab.'
              : 'No articles marked read yet. Finish one and it lands here.'}
          </p>
        </div>
      )}
    </>
  );
}
