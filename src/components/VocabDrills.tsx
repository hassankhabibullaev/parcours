import type { CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../lib/db';
import {
  DRILL_KINDS,
  MIN_PRACTICE_WORDS,
  PASSES_PER_MODE,
  type VocabShelf,
} from '../lib/practice';
import { VOCAB_MODE_NAMES, VOCAB_THEMES, type VocabMode } from '../lib/vocabThemes';
import { useAuthGate } from './AuthGate';

/** Launcher copy per mode; every mode runs on both shelves. */
const MODE_CARDS: Record<
  VocabMode,
  { kicker: string; hint: Record<VocabShelf, string> }
> = {
  match: {
    kicker: 'Match · pairs',
    hint: {
      learning: 'Pair fresh words with their meanings',
      learned: 'Still know every pair?',
    },
  },
  blank: {
    kicker: 'Type · recall',
    hint: {
      learning: 'Fill the blank, or translate',
      learned: 'Blanks and translations, from memory',
    },
  },
  listen: {
    kicker: 'Audio · dictation',
    hint: {
      learning: 'Hear a word, spell it out',
      learned: 'Dictation on what you’ve learnt',
    },
  },
  choose: {
    kicker: 'Audio · meaning',
    hint: {
      learning: 'Hear a word, pick its meaning',
      learned: 'Meanings by ear, no text to lean on',
    },
  },
};

const SHELVES: { shelf: VocabShelf; label: string; short: string }[] = [
  { shelf: 'learning', label: 'Still learning', short: 'saved' },
  { shelf: 'learned', label: 'Learned', short: 'learnt' },
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
 * The vocabulary drill launchers, rendered inside Vocabulary's Practice tab:
 * the four modes (Word Match / Fill in the Blank / Listen & Type /
 * Listen & Choose), mirrored across two clearly-separated sections — one per
 * shelf. Every drill needs at least MIN_PRACTICE_WORDS words in its shelf's
 * pool; short pools disable the card. All modes draw their items
 * struggle-weighted (lib/struggle.ts).
 */
export default function VocabDrills() {
  const { requireAuth } = useAuthGate();
  const counts = useLiveQuery(async () => {
    const words = await db.savedWords.toArray();
    const usable = words.filter((w) => w.translation.trim());
    return {
      learning: usable.filter((w) => !w.learned).length,
      learned: usable.filter((w) => w.learned).length,
    } as Record<VocabShelf, number>;
  }, []);

  return (
    <>
      {SHELVES.map(({ shelf, label, short }) => {
        const pool = counts?.[shelf] ?? 0;
        const locked = pool < MIN_PRACTICE_WORDS;
        return (
          <div key={shelf}>
            <div className="section-label">
              {label} · {pool}
            </div>
            <div className="drill-grid">
              {DRILL_KINDS.map((mode, i) => (
                <Link
                  key={`${mode}-${shelf}`}
                  className={`drill-card${locked ? ' drill-card--locked' : ''}`}
                  to={`/vocabulary/${mode}/${shelf}`}
                  aria-disabled={locked}
                  style={drillCardStyle(mode, i)}
                  onClick={(e) => {
                    // Below the 5-word minimum the drill can't run; guests are
                    // prompted to sign in instead of entering an empty drill.
                    if (locked) {
                      e.preventDefault();
                      return;
                    }
                    if (!requireAuth('practice')) e.preventDefault();
                  }}
                >
                  <span className="drill-card__kicker">{MODE_CARDS[mode].kicker}</span>
                  <span className="drill-card__name">{VOCAB_MODE_NAMES[mode]}</span>
                  <span className="drill-card__hint">
                    {locked
                      ? `Needs ${MIN_PRACTICE_WORDS} ${short} words — ${pool} so far`
                      : MODE_CARDS[mode].hint[shelf]}
                  </span>
                </Link>
              ))}
            </div>
          </div>
        );
      })}
      <p className="drill-note">
        A word graduates once you get it right on {PASSES_PER_MODE} separate days in{' '}
        <em>each</em> of the four modes — every day counts once, one slip is forgiven, two in a
        row reset that mode's run. Learned words play by the same rules: two slips in a row
        send one back to Still learning.
      </p>
    </>
  );
}
