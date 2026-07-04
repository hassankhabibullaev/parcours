import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { articles, type CefrLevel } from '../data/content';
import { db } from '../lib/db';

type Filter = 'all' | CefrLevel | 'read';

export default function ReadingPage() {
  const levels = [...new Set(articles.map((a) => a.cefr_level))].sort();
  const [filter, setFilter] = useState<Filter>('all');

  // Arriving from "Mark as read": the article keeps its old spot while its
  // card is stamped read, then sinks away and settles into the read group.
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
  // Unread first; read articles sink to the bottom (stable sort keeps corpus
  // order). The just-read article holds its old spot until its send-off ends.
  const ordered = [...shown].sort(
    (a, b) =>
      (isRead(a.id) && a.id !== justRead ? 1 : 0) -
      (isRead(b.id) && b.id !== justRead ? 1 : 0),
  );

  return (
    <>
      <h2 className="page-heading">Reading</h2>
      <p className="page-subheading">Tap any word while you read to look it up and save it.</p>

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

      {ordered.map((article) => {
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
              {p?.read ? (
                <span className={`read-stamp${marking ? ' read-stamp--in' : ''}`}>Read ✓</span>
              ) : p && p.position > 0.02 ? (
                <span className="progress-stamp">In progress</span>
              ) : null}
            </div>
            <h3 className="article-card__title">{article.title}</h3>
            <p className="article-card__subtitle">{article.title_en}</p>
            <p className="article-card__meta">
              {article.word_count} words · {article.readingMinutes} min read
            </p>
          </Link>
        );
      })}
    </>
  );
}
