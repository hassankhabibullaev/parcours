import type { CSSProperties } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { TENSES, verbMeanings, verbs } from '../data/content';
import { TENSE_THEMES } from '../lib/tenseThemes';
import { pronounDisplayFull } from '../lib/conjugation';
import { canSpeak, speakFrench } from '../lib/speech';
import { SpeakerIcon } from '../components/icons';

/** The eight dataset slots in display order. */
const SLOT_PRONOUNS = ['je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles'];

/**
 * One verb's complete conjugation — all nine drilled tenses, straight from
 * the dataset (pipe-separated être-agreement variants shown as « … / … »).
 */
export default function VerbPage() {
  const { infinitive } = useParams();
  const verb = infinitive && verbs[infinitive] ? infinitive : null;
  if (!verb) return <Navigate to="/conjugation" replace />;

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

      {TENSES.map((t) => {
        const theme = TENSE_THEMES[t.key];
        const row = verbs[verb][t.key];
        return (
          <div
            className="card conj-table"
            key={t.key}
            style={{ '--tc': theme.color, '--tc-wash': theme.wash } as CSSProperties}
          >
            <div className="conj-table__head">
              {t.label}
              <span className="conj-table__head-en">{t.labelEn}</span>
            </div>
            <div className="conj-table__rows conj-table__rows--split">
              {SLOT_PRONOUNS.map((pronoun, slot) => (
                <div className="conj-table__row" key={slot}>
                  <span className="conj-table__pronoun">
                    {pronounDisplayFull(pronoun, t.key, row[slot].split('|')[0])}
                  </span>
                  <span className="conj-table__form">{row[slot].split('|').join(' / ')}</span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </>
  );
}
