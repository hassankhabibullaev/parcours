import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { LEARNT_STREAK } from '../lib/practice';
import { VOCAB_THEMES, type VocabMode } from '../lib/vocabThemes';
import { useAuthGate } from './AuthGate';

const DRILLS: { mode: VocabMode; to: string; kicker: string; name: string; hint: string }[] = [
  {
    mode: 'learn',
    to: '/vocabulary/learn',
    kicker: 'Match · new',
    name: 'Word Match',
    hint: 'Pair fresh words with their meanings',
  },
  {
    mode: 'practice',
    to: '/vocabulary/practice',
    kicker: 'Type · recall',
    name: 'Fill in the Blank',
    hint: 'Fill the blank, or translate',
  },
  {
    mode: 'remember',
    to: '/vocabulary/remember',
    kicker: 'Match · review',
    name: 'Remember?',
    hint: 'Still know what you’ve learnt?',
  },
];

function drillCardStyle(mode: VocabMode, index: number): CSSProperties {
  const t = VOCAB_THEMES[mode];
  return {
    '--tc': t.color,
    '--tc-blob': `linear-gradient(135deg, ${t.blob} 0%, transparent 70%)`,
    animationDelay: `${index * 45}ms`,
  } as CSSProperties;
}

/**
 * The three vocabulary drill launchers (Word Match / Fill in the Blank /
 * Remember?), rendered inside the Practice hub's Vocabulary tab. All three draw
 * their items struggle-weighted (lib/struggle.ts).
 */
export default function VocabDrills() {
  const { requireAuth } = useAuthGate();
  return (
    <>
      <div className="drill-grid">
        {DRILLS.map((d, i) => (
          <Link
            key={d.mode}
            className="drill-card"
            to={d.to}
            style={drillCardStyle(d.mode, i)}
            onClick={(e) => {
              // Vocabulary drills need saved words — prompt guests instead of
              // navigating into an unusable drill.
              if (!requireAuth('practice')) e.preventDefault();
            }}
          >
            <span className="drill-card__kicker">{d.kicker}</span>
            <span className="drill-card__name">{d.name}</span>
            <span className="drill-card__hint">{d.hint}</span>
          </Link>
        ))}
      </div>
      <p className="drill-note">
        Words graduate after {LEARNT_STREAK} correct answers in a row — a miss sends them back.
      </p>
    </>
  );
}
