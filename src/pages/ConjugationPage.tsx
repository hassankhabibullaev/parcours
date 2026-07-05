import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { TENSES, type TenseKey } from '../data/content';
import { MIXED_BLOB, MIXED_STRIPE, TENSE_FAMILIES, TENSE_THEMES } from '../lib/tenseThemes';

function cardStyle(key: TenseKey, index: number): CSSProperties {
  const t = TENSE_THEMES[key];
  return {
    '--tc': t.color,
    '--tc-blob': `linear-gradient(135deg, ${t.blob} 0%, transparent 70%)`,
    animationDelay: `${index * 45}ms`,
  } as CSSProperties;
}

export default function ConjugationPage() {
  const meta = new Map(TENSES.map((t) => [t.key, t]));
  let cardIndex = 0;

  return (
    <>
      <h2 className="page-heading">Conjugation</h2>
      <p className="page-subheading">
        Nine tenses to master — accent slips are forgiven.
      </p>

      <div className="tense-family" style={{ '--tc': MIXED_STRIPE } as CSSProperties}>
        Tous les temps · All tenses
      </div>
      <Link
        className="tense-card tense-card--mixed"
        to="/conjugation/mixed"
        style={
          {
            '--tc': MIXED_STRIPE,
            '--tc-blob': MIXED_BLOB,
            animationDelay: `${cardIndex++ * 45}ms`,
          } as CSSProperties
        }
      >
        <span className="tense-card__kicker">Start here · the real test</span>
        <span className="tense-card__name">Mixed drill</span>
        <span className="tense-card__hint">
          10 verbs · all nine tenses shuffled through one session
        </span>
      </Link>

      {TENSE_FAMILIES.map((family) => (
        <section key={family.label}>
          <div className="tense-family" style={{ '--tc': family.color } as CSSProperties}>
            {family.label} · {family.labelEn}
          </div>
          <div className="tense-row">
            {family.tenses.map((key) => {
              const t = meta.get(key)!;
              return (
                <Link
                  key={key}
                  className="tense-card"
                  to={`/conjugation/${key}`}
                  style={cardStyle(key, cardIndex++)}
                >
                  <span className="tense-card__kicker">{t.labelEn}</span>
                  <span className="tense-card__name">{t.label}</span>
                  <span className="tense-card__hint">{TENSE_THEMES[key].hint}</span>
                </Link>
              );
            })}
          </div>
        </section>
      ))}
    </>
  );
}
