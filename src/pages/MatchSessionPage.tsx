import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { SavedWord } from '../lib/db';
import { drawPracticeWords, recordRound, recordWordResult } from '../lib/practice';
import { vocabThemeVars } from '../lib/vocabThemes';
import { successChime } from '../lib/sound';
import DrillHeader from '../components/DrillHeader';
import DrillTopline from '../components/DrillTopline';
import DrillResults from '../components/DrillResults';
import SoundPill from '../components/SoundPill';
import MatchBoard from '../components/MatchBoard';

const ROUNDS = 5;
const MIN_WORDS = 20;

const SESSIONS = {
  learn: {
    title: 'Word Match',
    mode: 'learn',
    learned: 0,
    // 20 words → 5 boards of 4 pairs.
    target: 20,
    gate: 'Word Match opens once you have 20 words in your learning pile',
    gateHint: 'Save words while you read, or add them from the dictionary search.',
  },
  remember: {
    title: 'Remember?',
    mode: 'remember',
    learned: 1,
    // Up to 30 words → 5 boards of 6 pairs (fewer pairs per board below 30).
    target: 30,
    gate: 'Remember? opens once you have 20 words on the learnt shelf',
    gateHint: 'Keep practising — words graduate there after three correct answers in a row.',
  },
} as const;

export type MatchSessionKind = keyof typeof SESSIONS;

/** Split into ROUNDS boards, sizes as even as possible (larger boards first). */
function splitRounds(words: SavedWord[]): SavedWord[][] {
  const out: SavedWord[][] = [];
  const base = Math.floor(words.length / ROUNDS);
  let extra = words.length % ROUNDS;
  let i = 0;
  for (let r = 0; r < ROUNDS; r++) {
    const size = base + (extra-- > 0 ? 1 : 0);
    out.push(words.slice(i, i + size));
    i += size;
  }
  return out;
}

export default function MatchSessionPage({ kind }: { kind: MatchSessionKind }) {
  const session = SESSIONS[kind];
  const themeVars = vocabThemeVars(kind);

  const [words, setWords] = useState<SavedWord[] | null>(null);
  const [round, setRound] = useState(0);
  const [misses, setMisses] = useState(0);
  const [missedIds, setMissedIds] = useState<Set<string>>(new Set());
  const [finished, setFinished] = useState(false);

  function reset() {
    setWords(null);
    setRound(0);
    setMisses(0);
    setMissedIds(new Set());
    setFinished(false);
  }

  async function start() {
    reset();
    setWords(
      await drawPracticeWords(session.target, {
        learned: session.learned,
        requireTranslation: true,
      }),
    );
  }

  useEffect(() => {
    // StrictMode double-runs this effect in dev; a stale draw resolving late
    // would swap `words` under a mounted board — and the progress written in
    // completeRound must match the pairs the learner actually saw.
    let cancelled = false;
    reset();
    drawPracticeWords(session.target, { learned: session.learned, requireTranslation: true }).then(
      (drawn) => {
        if (!cancelled) setWords(drawn);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [kind]);

  if (!words) return <DrillHeader title={session.title} backTo="/practice?tab=vocabulary" backLabel="Practice" />;

  if (words.length < MIN_WORDS) {
    return (
      <>
        <DrillHeader title={session.title} backTo="/practice?tab=vocabulary" backLabel="Practice" />
        <div className="card">
          <p style={{ margin: '0 0 6px' }}>
            {session.gate} — you have {words.length} so far.
          </p>
          <p style={{ margin: '0 0 12px', color: 'var(--ink-soft)' }}>{session.gateHint}</p>
          <Link className="btn btn--accent" to={kind === 'learn' ? '/reading' : '/vocabulary'}>
            {kind === 'learn' ? 'Open the library' : 'Back to vocabulary'}
          </Link>
        </div>
      </>
    );
  }

  if (finished) {
    const missedWords = words.filter((w) => missedIds.has(w.id));
    return (
      <>
        <DrillHeader title={session.title} backTo="/practice?tab=vocabulary" backLabel="Practice" />
        <div style={themeVars}>
          <DrillResults
            score={words.length - missedWords.length}
            total={words.length}
            items={missedWords.map((w) => ({ title: w.lemma, correct: w.translation }))}
            onRetry={start}
          />
        </div>
      </>
    );
  }

  const boards = splitRounds(words);

  function completeRound(ids: Set<string>) {
    // One board = one practice answer per word on it: clean → streak grows,
    // missed → back to still-learning.
    for (const w of boards[round]) void recordWordResult(w, !ids.has(w.id));
    setMissedIds((prev) => new Set([...prev, ...ids]));
    if (round + 1 >= ROUNDS) {
      const allMissed = new Set([...missedIds, ...ids]);
      recordRound('vocabulary', session.mode, words!.length - allMissed.size, words!.length);
      setFinished(true);
    } else {
      successChime();
      setRound((r) => r + 1);
    }
  }

  return (
    <div className="conj-drill" style={themeVars}>
      <DrillTopline backTo="/practice?tab=vocabulary" backLabel="Practice" title={session.title}>
        <span className="hud-pill hud-pill--live" key={`miss-${misses}`}>
          ✕ <strong>{misses}</strong>
        </span>
        <SoundPill />
      </DrillTopline>
      <div className="conj-progress">
        <div className="conj-progress__fill" style={{ width: `${(round / ROUNDS) * 100}%` }} />
      </div>

      <div className="card conj-stage" key={round}>
        <div className="conj-stage__head">
          <span className="conj-tense-badge">Match the pairs</span>
          <span className="conj-stage__counter">
            N° {round + 1}/{ROUNDS}
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
