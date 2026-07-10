import type { CSSProperties } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { TENSES, verbs, type TenseKey } from '../data/content';
import { TENSE_GUIDES } from '../data/tenseGuide';
import { TENSE_THEMES } from '../lib/tenseThemes';
import { pronounDisplayFull, tenseLabel } from '../lib/conjugation';

/** The eight dataset slots in display order. */
const SLOT_PRONOUNS = ['je', 'tu', 'il', 'elle', 'nous', 'vous', 'ils', 'elles'];

/**
 * One tense's reference page: when to use it, how to build it, the endings,
 * live example tables rendered straight from the drilled verb dataset, and
 * the traps — with a jump into that tense's typing drill.
 */
export default function TenseGuidePage() {
  const { tense } = useParams();
  const key = TENSES.find((t) => t.key === tense)?.key as TenseKey | undefined;
  if (!key) return <Navigate to="/conjugation" replace />;

  const guide = TENSE_GUIDES[key];
  const theme = TENSE_THEMES[key];
  const meta = TENSES.find((t) => t.key === key)!;
  const themeVars = { '--tc': theme.color, '--tc-wash': theme.wash } as CSSProperties;

  return (
    <div style={themeVars}>
      <div className="article-topbar">
        <Link to="/conjugation" className="article-topbar__back">
          ← Conjugation
        </Link>
        <span className="conj-tense-badge">{meta.labelEn}</span>
      </div>
      <h2 className="page-heading">{guideTitle(key)}</h2>

      <div className="section-label">When to use it</div>
      <ul className="guide-usage">
        {guide.usage.map((u, i) => (
          <li key={i}>{u}</li>
        ))}
      </ul>

      <div className="section-label">How to build it</div>
      <div className="card guide-formation">{guide.formation}</div>
      {guide.endings && (
        <div className="guide-endings">
          {guide.endings.map((set) => (
            <div className="guide-endings__row" key={set.label}>
              <span className="guide-endings__label">{set.label}</span>
              <span className="guide-endings__forms">
                {set.forms.map((f, i) => (
                  <span className="guide-endings__chip" key={i}>
                    {f}
                  </span>
                ))}
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="section-label">Examples</div>
      {guide.examples.map((ex, i) => (
        <p className="guide-example" key={i}>
          <span className="guide-example__fr">« {ex.fr} »</span>
          <span className="guide-example__en">{ex.en}</span>
        </p>
      ))}

      <div className="section-label">In full</div>
      <div className="guide-tables">
        {guide.modelVerbs
          .filter((v) => verbs[v]?.[key])
          .map((v) => (
            <div className="card conj-table" key={v}>
              <div className="conj-table__head">{v}</div>
              <div className="conj-table__rows conj-table__rows--split">
                {SLOT_PRONOUNS.map((pronoun, slot) => (
                  <div className="conj-table__row" key={slot}>
                    <span className="conj-table__pronoun">
                      {pronounDisplayFull(pronoun, key, verbs[v][key][slot].split('|')[0])}
                    </span>
                    <span className="conj-table__form">
                      {verbs[v][key][slot].split('|').join(' / ')}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>

      <div className="section-label">Watch out</div>
      <ul className="guide-usage guide-usage--traps">
        {guide.exceptions.map((e, i) => (
          <li key={i}>{e}</li>
        ))}
      </ul>

      <Link className="btn btn--accent guide-practice" to={`/conjugation/${key}`}>
        Practise {tenseLabel(key)} →
      </Link>
    </div>
  );
}

function guideTitle(key: TenseKey): string {
  return TENSES.find((t) => t.key === key)?.label ?? key;
}
