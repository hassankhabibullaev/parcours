import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { SavedWord } from '../lib/db';
import {
  MATCH_WORDS_PER_SESSION,
  MIN_PRACTICE_WORDS,
  SHELF_FLAG,
  drawFromPool,
  loadPracticePool,
  matchSessionCount,
  parseShelf,
  recordRound,
  recordWordResult,
  roundMode,
} from '../lib/practice';
import { vocabThemeVars } from '../lib/vocabThemes';
import { successChime } from '../lib/sound';
import { useAuth } from '../components/AuthProvider';
import { GuestNotice } from '../components/AuthGate';
import DrillHeader from '../components/DrillHeader';
import DrillTopline from '../components/DrillTopline';
import DrillResults from '../components/DrillResults';
import SoundPill from '../components/SoundPill';
import MatchBoard from '../components/MatchBoard';

const BACK_TO = '/vocabulary?tab=practice';

/** The pause between a completed board and the next one mounting — buttons
    are frozen for its duration so a stray double-tap can't skip state. */
const ADVANCE_MS = 900;

/** Chunk the drawn words into boards of MATCH_WORDS_PER_SESSION. */
function splitRounds(words: SavedWord[], rounds: number): SavedWord[][] {
  const out: SavedWord[][] = [];
  for (let r = 0; r < rounds; r++) {
    out.push(words.slice(r * MATCH_WORDS_PER_SESSION, (r + 1) * MATCH_WORDS_PER_SESSION));
  }
  return out;
}

/**
 * Word Match (`/vocabulary/match/:shelf`) — 5 words per session, up to 6
 * sessions (`sessions = min(6, floor(pool / 5))`), on either shelf. Wrong
 * pairs simply stay on the board to retry; a cleanly finished board
 * auto-advances after a short frozen pause.
 */
export default function MatchSessionPage() {
  const { user } = useAuth();
  const { shelf: shelfParam } = useParams();
  const shelf = parseShelf(shelfParam);
  const title = shelf === 'learned' ? 'Word Match · Review' : 'Word Match';
  const themeVars = vocabThemeVars('match');

  const [words, setWords] = useState<SavedWord[] | null>(null);
  const [poolSize, setPoolSize] = useState(0);
  const [round, setRound] = useState(0);
  const [misses, setMisses] = useState(0);
  const [missedIds, setMissedIds] = useState<Set<string>>(new Set());
  const [finished, setFinished] = useState(false);
  const [advancing, setAdvancing] = useState(false);
  const advanceTimer = useRef<number | null>(null);

  function reset() {
    setWords(null);
    setRound(0);
    setMisses(0);
    setMissedIds(new Set());
    setFinished(false);
    setAdvancing(false);
  }

  async function draw(): Promise<{ pool: number; drawn: SavedWord[] }> {
    const pool = await loadPracticePool({
      learned: SHELF_FLAG[shelf!],
      requireTranslation: true,
    });
    const sessions = matchSessionCount(pool.length);
    const drawn =
      sessions > 0 ? await drawFromPool(pool, sessions * MATCH_WORDS_PER_SESSION, 'match') : [];
    return { pool: pool.length, drawn };
  }

  useEffect(() => {
    // StrictMode double-runs this effect in dev; a stale draw resolving late
    // would swap `words` under a mounted board — and the progress written in
    // completeRound must match the pairs the learner actually saw.
    if (!shelf) return;
    let cancelled = false;
    reset();
    draw().then(({ pool, drawn }) => {
      if (cancelled) return;
      setPoolSize(pool);
      setWords(drawn);
    });
    return () => {
      cancelled = true;
      if (advanceTimer.current !== null) window.clearTimeout(advanceTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelf]);

  if (!shelf) return <Navigate to={BACK_TO} replace />;

  if (!user) {
    return (
      <>
        <DrillHeader title={title} backTo={BACK_TO} backLabel="Vocabulary" />
        <GuestNotice message="Sign in with your email to save words and practise them here." />
      </>
    );
  }

  if (!words) return <DrillHeader title={title} backTo={BACK_TO} backLabel="Vocabulary" />;

  const rounds = matchSessionCount(poolSize);

  if (rounds === 0) {
    return (
      <>
        <DrillHeader title={title} backTo={BACK_TO} backLabel="Vocabulary" />
        <div className="card">
          <p style={{ margin: '0 0 6px' }}>
            {shelf === 'learned'
              ? `The review opens once you have ${MIN_PRACTICE_WORDS} words on the learnt shelf`
              : `Word Match opens once you have ${MIN_PRACTICE_WORDS} words in your learning pile`}{' '}
            — you have {poolSize} so far.
          </p>
          <p style={{ margin: '0 0 12px', color: 'var(--ink-soft)' }}>
            {shelf === 'learned'
              ? 'Keep practising — words graduate there through correct answers.'
              : 'Save words while you read, or add them from the word lookup.'}
          </p>
          <Link className="btn btn--accent" to={shelf === 'learned' ? '/vocabulary' : '/reading'}>
            {shelf === 'learned' ? 'Back to vocabulary' : 'Open the library'}
          </Link>
        </div>
      </>
    );
  }

  if (finished) {
    const missedWords = words.filter((w) => missedIds.has(w.id));
    return (
      <>
        <DrillHeader title={title} backTo={BACK_TO} backLabel="Vocabulary" />
        <div style={themeVars}>
          <DrillResults
            score={words.length - missedWords.length}
            total={words.length}
            items={missedWords.map((w) => ({ title: w.lemma, correct: w.translation }))}
            onRetry={() => {
              reset();
              void draw().then(({ pool, drawn }) => {
                setPoolSize(pool);
                setWords(drawn);
              });
            }}
          />
        </div>
      </>
    );
  }

  const boards = splitRounds(words, rounds);

  function completeRound(ids: Set<string>) {
    // One board = one practice answer per word on it (match-streak track):
    // clean → streak grows, missed → the miss run advances.
    for (const w of boards[round]) void recordWordResult(w, !ids.has(w.id), 'match');
    setMissedIds((prev) => new Set([...prev, ...ids]));
    if (round + 1 >= rounds) {
      const allMissed = new Set([...missedIds, ...ids]);
      recordRound(
        'vocabulary',
        roundMode('match', shelf!),
        words!.length - allMissed.size,
        words!.length,
      );
      setFinished(true);
    } else {
      // Auto-advance to the next session after a short pause; everything is
      // frozen (pointer-events off) until the new board mounts.
      successChime();
      setAdvancing(true);
      advanceTimer.current = window.setTimeout(() => {
        setAdvancing(false);
        setRound((r) => r + 1);
      }, ADVANCE_MS);
    }
  }

  return (
    <div
      className="conj-drill"
      style={advancing ? { ...themeVars, pointerEvents: 'none' } : themeVars}
      aria-busy={advancing}
    >
      <DrillTopline backTo={BACK_TO} backLabel="Vocabulary" title={title}>
        <span className="hud-pill hud-pill--live" key={`miss-${misses}`}>
          ✕ <strong>{misses}</strong>
        </span>
        <SoundPill />
      </DrillTopline>
      <div className="conj-progress">
        <div
          className="conj-progress__fill"
          style={{ width: `${((round + (advancing ? 1 : 0)) / rounds) * 100}%` }}
        />
      </div>

      <div className="card conj-stage" key={round}>
        <div className="conj-stage__head">
          <span className="conj-tense-badge">Match the pairs</span>
          <span className="conj-stage__counter">
            N° {round + 1}/{rounds}
          </span>
        </div>
        <div className="vocab-board">
          <MatchBoard
            key={round}
            words={boards[round]}
            onMiss={() => setMisses((m) => m + 1)}
            onComplete={completeRound}
          />
        </div>
      </div>
    </div>
  );
}
