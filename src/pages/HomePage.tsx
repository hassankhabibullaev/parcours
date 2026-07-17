import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { articles } from '../data/content';
import { useAuthGate } from '../components/AuthGate';
import { useUserLevel } from '../lib/settings';
import { VOCAB_THEMES } from '../lib/vocabThemes';
import { MIXED_BLOB } from '../lib/tenseThemes';
import { LexiconIcon } from '../components/icons';

const vocabBlob = (mode: keyof typeof VOCAB_THEMES) =>
  `linear-gradient(135deg, ${VOCAB_THEMES[mode].blob} 0%, transparent 70%)`;

/** The four practice quick-launches — each jumps straight into a drill (the
    vocab ones on the learning shelf; the full mirrored set, including the
    learnt-shelf reviews, lives in Vocabulary → Practice). */
const QUICK_LAUNCH = [
  { to: '/conjugation/mixed', kicker: 'Verbs · mixed', name: 'Conjugation', tc: 'var(--ink)', blob: MIXED_BLOB },
  { to: '/vocabulary/match/learning', kicker: 'Match · pairs', name: 'Word Match', tc: VOCAB_THEMES.match.color, blob: vocabBlob('match') },
  { to: '/vocabulary/blank/learning', kicker: 'Type · recall', name: 'Fill in the Blank', tc: VOCAB_THEMES.blank.color, blob: vocabBlob('blank') },
  { to: '/vocabulary/listen/learning', kicker: 'Audio · dictation', name: 'Listen & Type', tc: VOCAB_THEMES.listen.color, blob: vocabBlob('listen') },
];

export default function HomePage() {
  const { requireAuth } = useAuthGate();
  const words = useLiveQuery(() => db.savedWords.toArray(), []) ?? [];
  const progress = useLiveQuery(() => db.articleProgress.toArray(), []) ?? [];
  const level = useUserLevel();

  const learnt = words.filter((w) => w.learned === 1).length;
  const readIds = new Set(progress.filter((p) => p.read === 1).map((p) => p.articleId));

  // The suggestion draws from the learner's level when one is set (exact-level
  // match); once that level is read out, fall back to the whole library rather
  // than showing nothing.
  const unread = articles.filter((a) => !readIds.has(a.id));
  const nextArticle = (level ? unread.find((a) => a.cefr_level === level) : undefined) ?? unread[0];
  const nextProgress = nextArticle
    ? progress.find((p) => p.articleId === nextArticle.id)
    : undefined;
  const nextStarted = (nextProgress?.position ?? 0) > 0.02;

  return (
    <>
      <h2 className="page-heading">Home</h2>

      {/* Zero the label's own top margin so the first section sits as close
          under the heading as the tab row does on the other pages. */}
      <div className="section-label" style={{ marginTop: 0 }}>
        Read next
      </div>
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
            {nextStarted ? 'Keep reading' : 'Read next'}
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

      <div className="section-label">Vocabulary</div>
      <Link className="card home-vocab" to="/vocabulary">
        <LexiconIcon className="home-vocab__icon" />
        <span className="home-vocab__text">
          <span className="home-vocab__count">
            {words.length} {words.length === 1 ? 'word' : 'words'} saved
          </span>
          <span className="home-vocab__sub">
            {learnt} learnt · tap to review your collection
          </span>
        </span>
        <span className="home-vocab__chev" aria-hidden>
          →
        </span>
      </Link>

      <div className="section-label">Practice</div>
      <div className="drill-grid">
        {QUICK_LAUNCH.map((q) => {
          // Conjugation is open to everyone; the vocab drills need saved words,
          // so a guest tapping one gets the sign-in prompt instead.
          const gated = q.to.startsWith('/vocabulary');
          return (
            <Link
              key={q.to}
              className="drill-card"
              to={q.to}
              style={{ '--tc': q.tc, '--tc-blob': q.blob } as CSSProperties}
              onClick={(e) => {
                if (gated && !requireAuth('practice')) e.preventDefault();
              }}
            >
              <span className="drill-card__kicker">{q.kicker}</span>
              <span className="drill-card__name">{q.name}</span>
            </Link>
          );
        })}
      </div>
    </>
  );
}
