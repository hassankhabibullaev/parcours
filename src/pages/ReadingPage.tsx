import { useEffect, useLayoutEffect, useRef, useState, type MouseEvent } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { articles, type Article, type CefrLevel } from '../data/content';
import { db } from '../lib/db';
import { setArticleRead } from '../lib/articleProgress';
import { confirmTock } from '../lib/sound';
import { useAuthGate } from '../components/AuthGate';
import { useUserLevel } from '../lib/settings';
import SectionTabs from '../components/SectionTabs';
import { CheckCircleIcon, UndoIcon } from '../components/icons';

type Tab = 'unread' | 'read';

const LEVELS = [...new Set(articles.map((a) => a.cefr_level))].sort() as CefrLevel[];
const levelColor = (level: CefrLevel) => `var(--level-${level.toLowerCase()})`;

export default function ReadingPage() {
  const { requireAuth } = useAuthGate();
  const [tab, setTab] = useState<Tab>('unread');
  // Active CEFR level filter, or 'all'. Tapping a level chip narrows the list.
  const [level, setLevel] = useState<CefrLevel | 'all'>('all');

  // The default filter follows the level set in Profile → Settings (unset →
  // All). It loads async from the store, so apply it once it arrives — unless
  // the learner has already tapped a chip on this visit.
  const userLevel = useUserLevel();
  const levelTouchedRef = useRef(false);
  useEffect(() => {
    if (userLevel === undefined || levelTouchedRef.current) return;
    setLevel(userLevel === '' ? 'all' : userLevel);
  }, [userLevel]);
  const pickLevel = (next: CefrLevel | 'all') => {
    levelTouchedRef.current = true;
    setLevel(next);
  };

  // The list always starts at the top — coming back from a long article (or
  // from "Mark as read") must not inherit the article's scroll offset.
  useLayoutEffect(() => window.scrollTo(0, 0), []);

  // A just-marked article keeps its old spot while its card is stamped read,
  // then sinks away and settles into the read group. Triggered either by
  // navigation state (from the article view) or by the inline toggle.
  const location = useLocation();
  const navigate = useNavigate();
  const [justRead, setJustRead] = useState<number | null>(
    () => (location.state as { justRead?: number } | null)?.justRead ?? null,
  );
  const [sinking, setSinking] = useState(false);
  useEffect(() => {
    if (justRead === null) return;
    // Clear the one-shot justRead flag so a refresh/back doesn't replay the
    // send-off animation — but do it THROUGH React Router. A raw
    // window.history.replaceState wipes React Router's navigation bookkeeping
    // (history.state.idx), which then breaks later back/forward transitions and
    // leaves pages blank until a hard refresh.
    navigate(location.pathname + location.search, { replace: true, state: null });
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
      // Marking read is personal progress — guests are prompted to sign in.
      if (!requireAuth('read')) return;
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

      <SectionTabs<Tab>
        ariaLabel="Reading list"
        tabs={[
          { key: 'unread', label: 'Not read', count: unread.length },
          { key: 'read', label: 'Read', count: read.length },
        ]}
        active={tab}
        onSelect={setTab}
      />

      <div className="level-counts" role="group" aria-label="Filter by level">
        <button
          type="button"
          className={`level-count level-count--all${level === 'all' ? ' level-count--active' : ''}`}
          aria-pressed={level === 'all'}
          onClick={() => pickLevel('all')}
        >
          All <span className="level-count__n">{shown.length}</span>
        </button>
        {levelCounts.map(({ level: lvl, n }) => (
          <button
            key={lvl}
            type="button"
            className={`level-count${n === 0 ? ' level-count--empty' : ''}${level === lvl ? ' level-count--active' : ''}`}
            aria-pressed={level === lvl}
            onClick={() => pickLevel(level === lvl ? 'all' : lvl)}
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
