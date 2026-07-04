import { useEffect, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { fanfare } from '../lib/sound';
import { confettiBurst } from '../lib/confetti';

export interface ReviewItem {
  /** The prompt the learner saw (pronoun, translation, word…). */
  title: string;
  meta?: ReactNode;
  /** The learner's wrong answer, when there was a typed one. */
  yours?: string;
  correct: string;
  /** Per-item accent color (conjugation tints items by tense). */
  color?: string;
}

interface DrillResultsProps {
  score: number;
  total: number;
  items: ReviewItem[];
  onRetry: () => void;
  backTo?: string;
  backLabel?: string;
  /** What one review item is called: « form » for conjugation, « word » here. */
  unit?: string;
}

function summaryLines(pct: number): { headline: string; message: string } {
  if (pct === 1)
    return { headline: 'Sans faute !', message: 'The edition goes to press untouched.' };
  if (pct >= 0.8)
    return { headline: 'Très bien', message: 'A few pencil marks, then straight to print.' };
  if (pct >= 0.5)
    return { headline: 'Pas mal', message: 'One more read-through before the presses roll.' };
  return { headline: 'Courage', message: 'Tomorrow is another edition.' };
}

/**
 * End-of-session results card shared by every drill: gradient score, French
 * headline, review list, fanfare + confetti on mount. Theming comes from the
 * --tc/--stripe CSS vars set by a wrapping element.
 */
export default function DrillResults({
  score,
  total,
  items,
  onRetry,
  backTo = '/vocabulary',
  backLabel = 'Back to vocabulary',
  unit = 'word',
}: DrillResultsProps) {
  useEffect(() => {
    fanfare();
    confettiBurst();
  }, []);

  const { headline, message } = summaryLines(total ? score / total : 0);

  return (
    <div className="card conj-results">
      <p className="conj-results__eyebrow">— Bilan de la séance —</p>
      <h3 className="conj-results__headline">{headline}</h3>
      <p className="conj-results__score">
        {score}
        <span> / {total}</span>
      </p>
      <p className="conj-results__msg">{message}</p>

      {items.length > 0 ? (
        <div className="conj-review">
          <div className="section-label">
            To review · {items.length} {unit}
            {items.length > 1 ? 's' : ''}
          </div>
          {items.map((m, i) => (
            <div
              className="conj-review__item"
              key={i}
              style={m.color ? ({ '--tc': m.color } as React.CSSProperties) : undefined}
            >
              <div className="conj-review__prompt">
                <span className="conj-review__pronoun">{m.title}</span>
                {m.meta && <span className="conj-review__meta">{m.meta}</span>}
              </div>
              <div className="conj-review__answers">
                {m.yours !== undefined && (
                  <>
                    <span className="conj-review__yours">{m.yours || '—'}</span>
                    <span className="conj-review__arrow">→</span>
                  </>
                )}
                <span className="conj-review__correct">{m.correct}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="conj-results__clean">Sans la moindre faute. Chapeau !</p>
      )}

      <div className="drill-actions">
        <button className="btn btn--accent" onClick={onRetry}>
          Retry
        </button>
        <Link className="btn btn--ghost" to={backTo}>
          {backLabel}
        </Link>
      </div>
    </div>
  );
}
