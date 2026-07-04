import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { getOrCreateDeviceCode } from '../lib/deviceCode';
import { getArticle } from '../data/content';

export default function HomePage() {
  const wordsSaved = useLiveQuery(() => db.savedWords.count(), []) ?? 0;
  const articlesRead =
    useLiveQuery(() => db.articleProgress.where('read').equals(1).count(), []) ?? 0;
  const roundsDone = useLiveQuery(() => db.practiceResults.count(), []) ?? 0;

  const lastOpened = useLiveQuery(
    () => db.articleProgress.orderBy('lastOpenedAt').reverse().first(),
    [],
  );
  const lastArticle = lastOpened ? getArticle(lastOpened.articleId) : undefined;

  const [deviceCode, setDeviceCode] = useState<string | null>(null);
  useEffect(() => {
    getOrCreateDeviceCode().then(setDeviceCode);
  }, []);

  return (
    <>
      <h2 className="page-heading">The Desk</h2>
      <p className="page-subheading">Your French, one edition at a time.</p>

      <div className="section-label">À la une</div>
      {lastArticle ? (
        <div className="card card--flag">
          <div style={{ marginBottom: 4 }}>
            <span className={`level-badge level-badge--${lastArticle.cefr_level}`}>
              {lastArticle.cefr_level}
            </span>
          </div>
          <h3 style={{ margin: '0 0 2px', fontSize: 19 }}>{lastArticle.title}</h3>
          <p style={{ margin: '0 0 12px', color: 'var(--ink-soft)', fontStyle: 'italic', fontSize: 14 }}>
            {lastArticle.title_en}
          </p>
          <Link className="btn btn--accent" to={`/reading/${lastArticle.id}`}>
            Continue reading
          </Link>
        </div>
      ) : (
        <div className="card card--flag">
          <h3 style={{ margin: '0 0 2px', fontSize: 19 }}>Nothing on the desk yet</h3>
          <p style={{ margin: '0 0 12px', color: 'var(--ink-soft)', fontSize: 14 }}>
            Open the library and pick your first article — tap any word while you read to
            look it up and save it.
          </p>
          <Link className="btn btn--accent" to="/reading">
            Open the library
          </Link>
        </div>
      )}

      <div className="section-label">Your progression</div>
      <div className="stat-row">
        <div className="stat">
          <div className="stat__value">{wordsSaved}</div>
          <div className="stat__label">Words saved</div>
        </div>
        <div className="stat">
          <div className="stat__value">{articlesRead}</div>
          <div className="stat__label">Articles read</div>
        </div>
        <div className="stat">
          <div className="stat__value">{roundsDone}</div>
          <div className="stat__label">Practice rounds</div>
        </div>
      </div>

      <div className="section-label">Your desk code</div>
      <div className="card">
        <p style={{ margin: 0, color: 'var(--ink-soft)', fontSize: 14 }}>
          Progress is stored on this device and works fully offline. Enter this code on
          another device to link them and share your progress.
        </p>
        <strong className="desk-code">{deviceCode ?? '· · ·'}</strong>
        <p style={{ margin: 0, color: 'var(--ink-faint)', fontFamily: 'var(--sans)', fontSize: 12 }}>
          Device linking arrives in a later edition.
        </p>
      </div>
    </>
  );
}
