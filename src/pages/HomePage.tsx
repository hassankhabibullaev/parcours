import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { articles } from '../data/content';
import SyncModal from '../components/SyncModal';
import { SyncIcon } from '../components/icons';

function timeAgo(ms: number): string {
  const s = Math.round((Date.now() - ms) / 1000);
  if (s < 60) return 'just now';
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return `${Math.round(h / 24)} d ago`;
}

const dayKey = (t: number) => new Date(t).toDateString();

/**
 * Consecutive days with at least one finished round, counting back from today.
 * A day without practice only breaks the streak once it is over — so the
 * streak reads "alive" all day before the first round.
 */
function practiceStreak(finishedAts: number[]): number {
  const days = new Set(finishedAts.map(dayKey));
  const cursor = new Date();
  if (!days.has(dayKey(cursor.getTime()))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (days.has(dayKey(cursor.getTime()))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export default function HomePage() {
  const words = useLiveQuery(() => db.savedWords.toArray(), []) ?? [];
  const progress = useLiveQuery(() => db.articleProgress.toArray(), []) ?? [];
  const rounds = useLiveQuery(() => db.practiceResults.toArray(), []) ?? [];
  const lastSyncAt = useLiveQuery(() => db.kv.get('lastSyncAt'), [])?.value;
  const syncCode = useLiveQuery(() => db.kv.get('syncCode'), [])?.value;

  const [syncOpen, setSyncOpen] = useState(false);

  const learnt = words.filter((w) => w.learned === 1).length;
  const readIds = new Set(progress.filter((p) => p.read === 1).map((p) => p.articleId));
  const streak = practiceStreak(rounds.map((r) => r.finishedAt));

  const nextArticle = articles.find((a) => !readIds.has(a.id));
  const nextProgress = nextArticle
    ? progress.find((p) => p.articleId === nextArticle.id)
    : undefined;
  const nextStarted = (nextProgress?.position ?? 0) > 0.02;

  const stats = [
    {
      value: readIds.size,
      label: 'Articles read',
      fill: readIds.size / articles.length,
      foot: `of ${articles.length} in the library`,
    },
    {
      value: words.length,
      label: 'Words saved',
      fill: words.length ? learnt / words.length : 0,
      foot: `${learnt} learnt`,
    },
    {
      value: rounds.length,
      label: 'Practice rounds',
      fill: Math.min(streak / 7, 1),
      foot:
        streak >= 2 ? `${streak}-day streak` : streak === 1 ? 'practised today' : 'no streak yet',
    },
  ];

  return (
    <>
      <h2 className="page-heading">Home</h2>
      <p className="page-subheading">Your French, one edition at a time.</p>

      <div className="section-label">Your progression</div>
      <div className="stat-row">
        {stats.map((s) => (
          <div className="stat" key={s.label}>
            <div className="stat__value">{s.value}</div>
            <div className="stat__label">{s.label}</div>
            <div className="stat__bar">
              <div className="stat__bar-fill" style={{ width: `${s.fill * 100}%` }} />
            </div>
            <div className="stat__foot">{s.foot}</div>
          </div>
        ))}
      </div>

      <div className="section-label">À la une</div>
      {nextArticle ? (
        <div className="card card--flag">
          <div style={{ marginBottom: 4 }}>
            <span className={`level-badge level-badge--${nextArticle.cefr_level}`}>
              {nextArticle.cefr_level}
            </span>
            {nextStarted && <span className="progress-stamp"> In progress</span>}
          </div>
          <h3 style={{ margin: '0 0 2px', fontSize: 19 }}>{nextArticle.title}</h3>
          <p style={{ margin: '0 0 12px', color: 'var(--ink-soft)', fontStyle: 'italic', fontSize: 14 }}>
            {nextArticle.title_en}
          </p>
          <Link className="btn btn--accent" to={`/reading/${nextArticle.id}`}>
            Read next
          </Link>
        </div>
      ) : (
        <div className="card card--flag">
          <h3 style={{ margin: '0 0 2px', fontSize: 19 }}>Every story read — bravo !</h3>
          <p style={{ margin: '0 0 12px', color: 'var(--ink-soft)', fontSize: 14 }}>
            You have been through the whole library. Reread a favourite, or drill what you saved.
          </p>
          <Link className="btn btn--accent" to="/reading">
            Open the library
          </Link>
        </div>
      )}

      <div className="section-label">Sync</div>
      <div className="card sync-row">
        <p className="sync-row__status">
          {syncCode
            ? 'Linked with another device.'
            : lastSyncAt
              ? `Backed up · synced ${timeAgo(Number(lastSyncAt))}.`
              : 'Progress lives only on this device.'}
        </p>
        <button className="btn btn--primary" onClick={() => setSyncOpen(true)}>
          <SyncIcon className="btn__icon" /> Sync
        </button>
      </div>

      {syncOpen && <SyncModal onClose={() => setSyncOpen(false)} />}
    </>
  );
}
