import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import { LEARNT_STREAKS, MIN_PRACTICE_WORDS } from '../lib/practice';
import { VOCAB_THEMES, type VocabMode } from '../lib/vocabThemes';
import { useAuthGate } from './AuthGate';

const DRILLS: {
  mode: VocabMode;
  to: string;
  kicker: string;
  name: string;
  hint: string;
  /** Which shelf feeds this drill (0 = learning, 1 = learned). */
  pool: 0 | 1;
}[] = [
  {
    mode: 'learn',
    to: '/vocabulary/learn',
    kicker: 'Match · new',
    name: 'Word Match',
    hint: 'Pair fresh words with their meanings',
    pool: 0,
  },
  {
    mode: 'practice',
    to: '/vocabulary/practice',
    kicker: 'Type · recall',
    name: 'Fill in the Blank',
    hint: 'Fill the blank, or translate',
    pool: 0,
  },
  {
    mode: 'remember',
    to: '/vocabulary/remember',
    kicker: 'Match · review',
    name: 'Remember?',
    hint: 'Still know what you’ve learnt?',
    pool: 1,
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
 * Remember?), rendered inside Vocabulary's Practice tab. Every drill needs at
 * least MIN_PRACTICE_WORDS words in its pool; short pools disable the card.
 * All three draw their items struggle-weighted (lib/struggle.ts).
 */
export default function VocabDrills() {
  const { requireAuth } = useAuthGate();
  const counts = useLiveQuery(async () => {
    const words = await db.savedWords.toArray();
    const usable = words.filter((w) => w.translation.trim());
    return {
      0: usable.filter((w) => !w.learned).length,
      1: usable.filter((w) => w.learned).length,
    } as Record<0 | 1, number>;
  }, []);

  return (
    <>
      <div className="drill-grid">
        {DRILLS.map((d, i) => {
          const pool = counts?.[d.pool] ?? 0;
          const locked = pool < MIN_PRACTICE_WORDS;
          return (
            <Link
              key={d.mode}
              className={`drill-card${locked ? ' drill-card--locked' : ''}`}
              to={d.to}
              aria-disabled={locked}
              style={drillCardStyle(d.mode, i)}
              onClick={(e) => {
                // Below the 5-word minimum the drill can't run; guests are
                // prompted to sign in instead of navigating into an empty drill.
                if (locked) {
                  e.preventDefault();
                  return;
                }
                if (!requireAuth('practice')) e.preventDefault();
              }}
            >
              <span className="drill-card__kicker">{d.kicker}</span>
              <span className="drill-card__name">{d.name}</span>
              <span className="drill-card__hint">
                {locked
                  ? `Needs ${MIN_PRACTICE_WORDS} ${d.pool === 1 ? 'learnt' : 'saved'} words — ${pool} so far`
                  : d.hint}
              </span>
            </Link>
          );
        })}
      </div>
      <p className="drill-note">
        Words graduate after you get them right on {LEARNT_STREAKS.match} separate days in Word
        Match or {LEARNT_STREAKS.blank} in Fill in the Blank — each day counts once, one slip is
        forgiven, two in a row reset the run.
      </p>
    </>
  );
}
