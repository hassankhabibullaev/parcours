import { useEffect, useLayoutEffect, useState, type MouseEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { articles, type Article, type CefrLevel } from '../data/content';
import { db } from '../lib/db';
import { setArticleRead } from '../lib/articleProgress';
import { confirmTock } from '../lib/sound';
import { CheckCircleIcon, UndoIcon } from '../components/icons';

type Tab = 'unread' | 'read';

const LEVELS = [...new Set(articles.map((a) => a.cefr_level))].sort() as CefrLevel[];
const levelColor = (level: CefrLevel) => `var(--level-${level.toLowerCase()})`;

export default function ReadingPage() {
  const [tab, setTab] = useState<Tab>('unread');
  // Active CEFR level filter, or 'all'. Tapping a level chip narrows the list.
  const [level, setLevel] = useState<CefrLevel | 'all'>('all');

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
  const levelCounts = LEVELS.map((lvl) => ({
    level: lvl,
    n: shown.filter((a) => a.cefr_level === lvl).length,
  }));

  // The visible list = active tab, then narrowed to the chosen level (if any).
  const visible = level === 'all' ? shown : shown.filter((a) => a.cefr_level === level);

  function toggleRead(e: MouseEvent, article: Article) {
    // The button lives inside the card's <Link> — don't open the article.
    e.preventDefault();
    e.stopPropagation();
    if (isRead(article.id)) {
      setArticleRead(article.id, false);
    } else {
      confirmTock();
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
          Not read <span className="seg-tab__count">{unread.length}</span>
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

      <div className="level-counts" role="group" aria-label="Filter by level">
        <button
          type="button"
          className={`level-count level-count--all${level === 'all' ? ' level-count--active' : ''}`}
          aria-pressed={level === 'all'}
          onClick={() => setLevel('all')}
        >
          All <span className="level-count__n">{shown.length}</span>
        </button>
        {levelCounts.map(({ level: lvl, n }) => (
          <button
            key={lvl}
            type="button"
            className={`level-count${n === 0 ? ' level-count--empty' : ''}${level === lvl ? ' level-count--active' : ''}`}
            aria-pressed={level === lvl}
            onClick={() => setLevel((cur) => (cur === lvl ? 'all' : lvl))}
          >
            <span className="level-count__dot" style={{ ['--lc' as string]: levelColor(lvl) }} />
            {lvl}: <span className="level-count__n">{n}</span>
          </button>
        ))}
      </div>

      {visible.length > 0 ? (
        visible.map(renderCard)
      ) : (
        <div className="card">
          <p style={{ margin: 0 }}>
            {level !== 'all'
              ? `No ${level} ${tab === 'unread' ? 'unread' : 'read'} articles${tab === 'unread' ? ' — every one at this level is read.' : ' yet.'}`
              : tab === 'unread'
                ? 'Every story read — bravo ! Reread a favourite from the Read tab.'
                : 'No articles marked read yet. Finish one and it lands here.'}
          </p>
        </div>
      )}
    </>
  );
}
