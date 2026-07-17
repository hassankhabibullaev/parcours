import type { CSSProperties } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { TENSES, verbMeanings, verbs } from '../data/content';
import { TENSE_GUIDES } from '../data/tenseGuide';
import { TENSE_THEMES } from '../lib/tenseThemes';
import { pronounDisplayFull, tenseLabel } from '../lib/conjugation';
import { clearVerb, getStruggles } from '../lib/conjStruggles';
import { confirmTock } from '../lib/sound';
import { canSpeak, speakFrench } from '../lib/speech';
import { SpeakerIcon } from '../components/icons';

/** The eight dataset slots in display order. */
const SLOT_PRONOUNS = ['je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles'];

/**
 * The needs-work study page (`/conjugation/study/:infinitive`) — where a kept
 * verb gets fixed. One card per flagged tense, most-kept first: how the tense
 * is built (formation + endings from the tense guide, with a link to the full
 * guide), then this verb's own forms in that tense. Below, the learner can
 * take the short focused drill on exactly these tenses, and — their call
 * alone — mark the verb learned, which clears it off the list.
 */
export default function StudyPage() {
  const { infinitive } = useParams();
  const navigate = useNavigate();
  const verb = infinitive && verbs[infinitive] ? infinitive : null;
  const struggles = useLiveQuery(() => getStruggles(), []);

  if (!verb) return <Navigate to="/conjugation" replace />;
  if (!struggles) return null; // first live-query tick
  const entries = struggles.filter((s) => s.verb === verb);
  // Nothing flagged (cleared elsewhere, or a stale link) — back to the list.
  if (entries.length === 0) return <Navigate to="/conjugation" replace />;

  function markLearned() {
    void clearVerb(verb!);
    confirmTock();
    navigate('/conjugation');
  }

  return (
    <>
      <div className="article-topbar">
        <Link to="/conjugation" className="article-topbar__back">
          ← Conjugation
        </Link>
      </div>
      <h2 className="page-heading verb-title">
        {verb}
        {canSpeak() && (
          <button
            className="modal__speak"
            onClick={() => speakFrench(verb)}
            aria-label={`Pronounce ${verb}`}
          >
            <SpeakerIcon />
          </button>
        )}
        <span className="verb-title__meaning">{verbMeanings[verb]}</span>
      </h2>
      <p className="study-lede">
        {entries.length === 1
          ? 'One tense of this verb is on your needs-work list.'
          : `${entries.length} tenses of this verb are on your needs-work list.`}{' '}
        Read how each is built, take the short drill, and mark the verb learned
        once it sticks.
      </p>

      {entries.map((e) => {
        const theme = TENSE_THEMES[e.tense];
        const guide = TENSE_GUIDES[e.tense];
        const row = verbs[verb][e.tense];
        return (
          <div
            className="card conj-table"
            key={e.tense}
            style={{ '--tc': theme.color, '--tc-wash': theme.wash } as CSSProperties}
          >
            <div className="conj-table__head">
              {tenseLabel(e.tense)}
              <span className="conj-table__head-en">
                {TENSES.find((t) => t.key === e.tense)?.labelEn}
              </span>
            </div>
            <div className="study-rule">
              <p className="study-rule__formation">{guide.formation}</p>
              {guide.endings?.map((set) => (
                <p className="study-rule__endings" key={set.label}>
                  <strong>{set.label}:</strong> {set.forms.join(' · ')}
                </p>
              ))}
              <Link className="study-rule__more" to={`/conjugation/guide/${e.tense}`}>
                Full guide →
              </Link>
            </div>
            <div className="conj-table__rows conj-table__rows--split">
              {SLOT_PRONOUNS.map((pronoun, slot) => (
                <div className="conj-table__row" key={slot}>
                  <span className="conj-table__pronoun">
                    {pronounDisplayFull(pronoun, e.tense, row[slot].split('|')[0])}
                  </span>
                  <span className="conj-table__form">{row[slot].split('|').join(' / ')}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <div className="study-actions">
        <Link
          className="btn btn--primary btn--full"
          to={`/conjugation/focus/${encodeURIComponent(verb)}`}
        >
          Start the focused drill
        </Link>
        <button type="button" className="btn btn--accent btn--full" onClick={markLearned}>
          Mark {verb} as learned
        </button>
        <Link
          className="btn btn--ghost btn--full"
          to={`/conjugation/verb/${encodeURIComponent(verb)}`}
        >
          All nine tenses →
        </Link>
      </div>
    </>
  );
}
