import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { SavedWord } from '../lib/db';
import {
  MIN_PRACTICE_WORDS,
  SHELF_FLAG,
  blankSessionCount,
  drawFromPool,
  loadPracticePool,
  parseShelf,
  recordRound,
  recordWordResult,
  roundMode,
  shuffle,
} from '../lib/practice';
import { vocabThemeVars } from '../lib/vocabThemes';
import { canSpeak, speakFrench } from '../lib/speech';
import { useAutoSpeak } from '../lib/useAutoSpeak';
import { errorBuzz, successChime } from '../lib/sound';
import { useAuth } from '../components/AuthProvider';
import { GuestNotice } from '../components/AuthGate';
import DrillHeader from '../components/DrillHeader';
import DrillTopline from '../components/DrillTopline';
import DrillResults from '../components/DrillResults';
import SoundPill from '../components/SoundPill';
import { SpeakerIcon } from '../components/icons';

const BACK_TO = '/vocabulary?tab=practice';

/** How many meanings are offered per question (the answer + distractors). */
const CHOICE_COUNT = 4;

/** The pause after the right meaning is picked — long enough to read the
    revealed word — before the next question mounts. */
const ADVANCE_MS = 1200;

interface Miss {
  word: SavedWord;
  user: string;
}

/** The answer plus up to three distractor meanings drawn from the same pool
    (distinct once case-folded, so two identical glosses can't both appear). */
function buildOptions(word: SavedWord, pool: SavedWord[]): string[] {
  const seen = new Set([word.translation.trim().toLowerCase()]);
  const distractors: string[] = [];
  for (const w of shuffle(pool)) {
    if (w.id === word.id) continue;
    const t = w.translation.trim();
    const key = t.toLowerCase();
    if (!t || seen.has(key)) continue;
    seen.add(key);
    distractors.push(t);
    if (distractors.length >= CHOICE_COUNT - 1) break;
  }
  return shuffle([word.translation, ...distractors]);
}

/**
 * Listen & Choose (`/vocabulary/choose/:shelf`) — the word is spoken aloud
 * and the learner picks its meaning from four. Only meanings are on screen —
 * never the French forms they belong to — so nothing gives away a word the
 * learner should recall themselves. One word per question,
 * `sessions = clamp(pool, 5, 10)`, on either shelf. A wrong pick is struck
 * out and the learner keeps trying; only the first pick counts. Without any
 * speech support the prompt degrades to showing the word itself.
 */
export default function ChooseSessionPage() {
  const { user } = useAuth();
  const { shelf: shelfParam } = useParams();
  const shelf = parseShelf(shelfParam);
  const title = shelf === 'learned' ? 'Listen & Choose · Review' : 'Listen & Choose';
  const themeVars = vocabThemeVars('choose');

  const [words, setWords] = useState<SavedWord[] | null>(null);
  const [pool, setPool] = useState<SavedWord[]>([]);
  const [poolSize, setPoolSize] = useState(0);
  const [index, setIndex] = useState(0);
  const [wrongPicks, setWrongPicks] = useState<Set<string>>(new Set());
  const [solved, setSolved] = useState(false);
  const [score, setScore] = useState(0);
  const [missed, setMissed] = useState<Miss[]>([]);
  const [finished, setFinished] = useState(false);

  function reset() {
    setWords(null);
    setIndex(0);
    setWrongPicks(new Set());
    setSolved(false);
    setScore(0);
    setMissed([]);
    setFinished(false);
  }

  async function draw(): Promise<{ pool: SavedWord[]; drawn: SavedWord[] }> {
    const full = await loadPracticePool({
      learned: SHELF_FLAG[shelf!],
      requireTranslation: true,
    });
    const sessions = blankSessionCount(full.length);
    const drawn = sessions > 0 ? await drawFromPool(full, sessions) : [];
    return { pool: full, drawn };
  }

  async function start() {
    reset();
    const { pool: full, drawn } = await draw();
    setPoolSize(full.length);
    setPool(full);
    setWords(drawn);
  }

  useEffect(() => {
    // StrictMode double-runs this effect in dev; cancel the stale draw so a
    // late resolve can't swap the word list mid-round.
    if (!shelf) return;
    let cancelled = false;
    reset();
    draw().then(({ pool: full, drawn }) => {
      if (cancelled) return;
      setPoolSize(full.length);
      setPool(full);
      setWords(drawn);
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelf]);

  const word = words?.[index];
  const options = useMemo(
    () => (word ? buildOptions(word, pool) : []),
    [word, pool],
  );

  // The prompt IS the audio — it plays as soon as the question mounts (and is
  // NOT gated by the sound-effects pill). The big button replays it.
  useAutoSpeak(word?.lemma, !finished && !!word);

  /* The right pick advances on its own after a pause long enough to read the
     revealed word; everything is frozen (pointer-events off) until then. */
  useEffect(() => {
    if (finished || !solved) return;
    const timer = window.setTimeout(() => next(), ADVANCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solved, finished]);

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

  const total = words.length;
  if (total === 0) {
    return (
      <>
        <DrillHeader title={title} backTo={BACK_TO} backLabel="Vocabulary" />
        <div className="card">
          <p style={{ margin: '0 0 6px' }}>
            {shelf === 'learned'
              ? `The review opens once you have ${MIN_PRACTICE_WORDS} words on the learnt shelf`
              : `Listen & Choose opens once you have ${MIN_PRACTICE_WORDS} words in your learning pile`}{' '}
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
    return (
      <>
        <DrillHeader title={title} backTo={BACK_TO} backLabel="Vocabulary" />
        <div style={themeVars}>
          <DrillResults
            score={score}
            total={total}
            items={missed.map((m) => ({
              title: m.word.lemma,
              yours: m.user,
              correct: m.word.translation,
            }))}
            onRetry={start}
          />
        </div>
      </>
    );
  }

  if (!word) return null;
  const isLast = index + 1 >= total;
  const progressPct = ((index + (solved ? 1 : 0)) / total) * 100;

  function pick(option: string) {
    if (!word || solved || wrongPicks.has(option)) return;
    const right = option === word.translation;
    // Score, the review list and the learning streak only count the first pick.
    if (wrongPicks.size === 0) {
      void recordWordResult(word, right, 'choose');
      if (right) setScore((s) => s + 1);
      else setMissed((m) => [...m, { word, user: option }]);
    }
    if (right) {
      successChime();
      setSolved(true);
    } else {
      errorBuzz();
      setWrongPicks((prev) => new Set([...prev, option]));
    }
  }

  function next() {
    if (isLast) {
      recordRound('vocabulary', roundMode('choose', shelf!), score, total);
      setFinished(true);
    } else {
      setIndex((i) => i + 1);
      setWrongPicks(new Set());
      setSolved(false);
    }
  }

  return (
    <div
      className="conj-drill"
      style={solved ? { ...themeVars, pointerEvents: 'none' } : themeVars}
      aria-busy={solved}
    >
      <DrillTopline backTo={BACK_TO} backLabel="Vocabulary" title={title}>
        <span className="hud-pill hud-pill--live" key={`score-${score}`}>
          ✓ <strong>{score}</strong>
        </span>
        <SoundPill />
      </DrillTopline>
      <div className="conj-progress">
        <div className="conj-progress__fill" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="card conj-stage" key={index}>
        <div className="conj-stage__head">
          <span className="conj-tense-badge">Pick the meaning</span>
          <span className="conj-stage__counter">
            N° {index + 1}/{total}
          </span>
        </div>

        <div className="listen-stage">
          {canSpeak() ? (
            <>
              <button
                type="button"
                className="listen-play"
                onClick={() => speakFrench(word.lemma)}
                aria-label="Play the word again"
              >
                <SpeakerIcon />
              </button>
              <p className="listen-stage__sub">Listen, then pick what it means</p>
            </>
          ) : (
            /* No speech support at all — degrade to showing the word. */
            <p className="vocab-prompt">{word.lemma}</p>
          )}
          {solved && (
            <p className="listen-answer">
              {word.lemma} <span>« {word.translation} »</span>
            </p>
          )}
        </div>

        <div className="choice-list">
          {options.map((option) => {
            const state = solved
              ? option === word.translation
                ? ' choice--correct'
                : ''
              : wrongPicks.has(option)
                ? ' choice--wrong'
                : '';
            return (
              <button
                type="button"
                key={option}
                className={`choice${state}`}
                onClick={() => pick(option)}
              >
                {option}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
