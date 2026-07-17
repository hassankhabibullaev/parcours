import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import type { SavedWord } from '../lib/db';
import {
  MIN_PRACTICE_WORDS,
  SHELF_FLAG,
  blankSessionCount,
  drawFromPool,
  gradeAnswer,
  loadPracticePool,
  parseShelf,
  recordRound,
  recordWordResult,
  roundMode,
  type AnswerGrade,
} from '../lib/practice';
import { vocabThemeVars } from '../lib/vocabThemes';
import { canSpeak, speakFrench } from '../lib/speech';
import { useAutoSpeak } from '../lib/useAutoSpeak';
import { errorBuzz, keyClick, successChime } from '../lib/sound';
import { useAuth } from '../components/AuthProvider';
import { GuestNotice } from '../components/AuthGate';
import DrillHeader from '../components/DrillHeader';
import DrillTopline from '../components/DrillTopline';
import DrillResults from '../components/DrillResults';
import SoundPill from '../components/SoundPill';
import { SpeakerIcon } from '../components/icons';

const BACK_TO = '/vocabulary?tab=practice';
const ACCENT_KEYS = ['à', 'é', 'è', 'ê', 'î', 'û', 'ç'];

/** Auto-advance delay after a correct session; longer when the accent note
    or the revealed answer is on screen so the learner can actually read it. */
const ADVANCE_MS = 1100;
const ADVANCE_NOTE_MS = 1700;

interface Miss {
  word: SavedWord;
  user: string;
}

/**
 * Listen & Type (`/vocabulary/listen/:shelf`) — dictation: the word is spoken
 * aloud (nothing spoils it on screen), the learner types what they heard.
 * One word per session, `sessions = clamp(pool, 5, 10)`, on either shelf.
 * Grading is accent-tolerant like every other drill; the translation appears
 * as confirmation once the word is solved or revealed. Without any speech
 * support the prompt degrades to showing the word itself.
 */
export default function ListenSessionPage() {
  const { user } = useAuth();
  const { shelf: shelfParam } = useParams();
  const shelf = parseShelf(shelfParam);
  const title = shelf === 'learned' ? 'Listen & Type · Review' : 'Listen & Type';
  const themeVars = vocabThemeVars('listen');

  const [words, setWords] = useState<SavedWord[] | null>(null);
  const [poolSize, setPoolSize] = useState(0);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState('');
  const [grade, setGrade] = useState<AnswerGrade | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [missed, setMissed] = useState<Miss[]>([]);
  const [finished, setFinished] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  function reset() {
    setWords(null);
    setIndex(0);
    setValue('');
    setGrade(null);
    setAttempted(false);
    setAnswerRevealed(false);
    setScore(0);
    setMissed([]);
    setFinished(false);
  }

  async function draw(): Promise<{ pool: number; drawn: SavedWord[] }> {
    const pool = await loadPracticePool({
      learned: SHELF_FLAG[shelf!],
      requireTranslation: true,
    });
    const sessions = blankSessionCount(pool.length);
    const drawn = sessions > 0 ? await drawFromPool(pool, sessions) : [];
    return { pool: pool.length, drawn };
  }

  async function start() {
    reset();
    const { pool, drawn } = await draw();
    setPoolSize(pool);
    setWords(drawn);
  }

  useEffect(() => {
    // StrictMode double-runs this effect in dev; cancel the stale draw so a
    // late resolve can't swap the word list mid-round.
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
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shelf]);

  const word = words?.[index];

  // The prompt IS the audio — it plays as soon as the question mounts (and
  // is NOT gated by the sound-effects pill: muting the sfx shouldn't strike
  // the exercise itself). The big button replays it.
  useAutoSpeak(word?.lemma, !finished && !!word);

  useEffect(() => {
    if (word && !finished) inputRef.current?.focus();
  }, [word, finished]);

  const solved = grade === 'correct' || grade === 'accents';

  /* A correct session advances on its own after a short pause; the input is
     read-only by then and the action button renders disabled. */
  useEffect(() => {
    if (finished || !solved) return;
    const timer = window.setTimeout(
      () => next(),
      grade === 'accents' ? ADVANCE_NOTE_MS : ADVANCE_MS,
    );
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
              : `Listen & Type opens once you have ${MIN_PRACTICE_WORDS} words in your learning pile`}{' '}
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
              title: `« ${m.word.translation} »`,
              yours: m.user,
              correct: m.word.lemma,
            }))}
            onRetry={start}
          />
        </div>
      </>
    );
  }

  if (!word) return null;
  const isLast = index + 1 >= total;
  const done = solved || answerRevealed;
  const progressPct = ((index + (done ? 1 : 0)) / total) * 100;

  function check() {
    if (!word) return;
    const g = gradeAnswer(value, [word.lemma]);
    setGrade(g);
    if (!attempted) {
      // Score, the review list and the learning streak only count the first attempt.
      setAttempted(true);
      void recordWordResult(word, g !== 'wrong', 'listen');
      if (g === 'wrong') setMissed((m) => [...m, { word, user: value.trim() }]);
      else setScore((s) => s + 1);
    }
    if (g === 'wrong') errorBuzz();
    else successChime();
  }

  function next() {
    if (isLast) {
      recordRound('vocabulary', roundMode('listen', shelf!), score, total);
      setFinished(true);
    } else {
      setIndex((i) => i + 1);
      setValue('');
      setGrade(null);
      setAttempted(false);
      setAnswerRevealed(false);
    }
  }

  function reveal() {
    setAnswerRevealed(true);
    setGrade((g) => g ?? 'wrong');
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (solved) return; // auto-advance owns the transition
    if (answerRevealed) next();
    else if (value.trim()) check();
  }

  /** Insert an accented character at the caret of the input. */
  function insertAccent(ch: string) {
    const el = inputRef.current;
    if (!el || done) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    setValue((v) => v.slice(0, start) + ch + v.slice(end));
    keyClick();
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + 1, start + 1);
    });
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
          <span className="conj-tense-badge">Dictation</span>
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
              <p className="listen-stage__sub">Listen, then type what you hear</p>
            </>
          ) : (
            /* No speech support at all — degrade to showing the word. */
            <>
              <p className="vocab-prompt">{word.lemma}</p>
              <p className="listen-stage__sub">type the word</p>
            </>
          )}
          {done && (
            <p className="listen-answer">
              {word.lemma} <span>« {word.translation} »</span>
            </p>
          )}
        </div>

        <form onSubmit={handleSubmit}>
          <div className="conj-field vocab-field">
            <input
              ref={inputRef}
              className={`conj-input${grade ? ` conj-input--${grade}` : ''}`}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                // Typing again after a miss clears the wrong stamp — a fresh try.
                if (grade === 'wrong' && !answerRevealed) setGrade(null);
              }}
              onKeyDown={(e) => {
                if (e.key.length === 1 || e.key === 'Backspace') keyClick();
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              readOnly={done}
              placeholder="ce que vous entendez…"
              aria-label="The word you heard"
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              lang="fr"
            />
            {grade && (
              <span className={`conj-field__icon conj-field__icon--${grade}`}>
                {grade === 'wrong' ? '✕' : '✓'}
              </span>
            )}
            {/* The accented spelling appears only when earned (accent nudge) —
                a genuinely wrong answer is revealed in the answer line above. */}
            {grade === 'accents' && (
              <span className="conj-field__tag conj-field__tag--soft">{word.lemma}</span>
            )}
          </div>

          <div className={`conj-accents${!focused || done ? ' conj-accents--dim' : ''}`}>
            <span className="conj-accents__lbl">Accents</span>
            {ACCENT_KEYS.map((ch) => (
              <button
                type="button"
                className="accent-key"
                key={ch}
                disabled={done}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertAccent(ch)}
              >
                {ch}
              </button>
            ))}
          </div>

          <div className="conj-actions">
            {solved ? (
              <button className="btn btn--accent" type="button" disabled>
                {isLast ? 'Finish' : 'Next →'}
              </button>
            ) : answerRevealed ? (
              <button className="btn btn--accent" type="submit" autoFocus>
                {isLast ? 'Finish' : 'Next →'} <span className="kbd-hint">⏎</span>
              </button>
            ) : (
              <>
                <button className="btn btn--primary" type="submit" disabled={!value.trim()}>
                  {grade === 'wrong' || attempted ? 'Check again' : 'Check'}{' '}
                  <span className="kbd-hint">⏎</span>
                </button>
                {attempted && (
                  <button className="btn btn--ghost" type="button" onClick={reveal}>
                    Reveal answer
                  </button>
                )}
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
