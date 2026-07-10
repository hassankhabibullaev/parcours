import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { SavedWord } from '../lib/db';
import {
  MIN_PRACTICE_WORDS,
  blankSessionCount,
  drawFromPool,
  gradeAnswer,
  loadPracticePool,
  recordRound,
  recordWordResult,
  type AnswerGrade,
} from '../lib/practice';
import { vocabThemeVars } from '../lib/vocabThemes';
import { errorBuzz, keyClick, successChime } from '../lib/sound';
import { useAuth } from '../components/AuthProvider';
import { GuestNotice } from '../components/AuthGate';
import DrillHeader from '../components/DrillHeader';
import DrillTopline from '../components/DrillTopline';
import DrillResults from '../components/DrillResults';
import SoundPill from '../components/SoundPill';

const BACK_TO = '/vocabulary?tab=practice';
const ACCENT_KEYS = ['à', 'é', 'è', 'ê', 'î', 'û', 'ç'];

/** Auto-advance delay after a correct session; longer when a base-form or
    accent note is on screen so the learner can actually read it. */
const ADVANCE_MS = 900;
const ADVANCE_NOTE_MS = 1700;

/**
 * Where the word sits in its saved sentence. Non-null only for words saved
 * from an article whose sentence still contains the form the learner met —
 * those get the fill-in-the-blank exercise; everything else (word-lookup
 * adds have `sentence: ''`) gets the translate exercise.
 */
interface SentenceSplit {
  before: string;
  /** The occurrence as written in the sentence (may be capitalized). */
  found: string;
  after: string;
}

function splitSentence(word: SavedWord): SentenceSplit | null {
  if (!word.sentence) return null;
  const escaped = word.display.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m = word.sentence.match(new RegExp(escaped, 'i'));
  if (!m || m.index === undefined) return null;
  return {
    before: word.sentence.slice(0, m.index),
    found: m[0],
    after: word.sentence.slice(m.index + m[0].length),
  };
}

interface Verdict {
  grade: AnswerGrade;
  /** The learner typed the lemma where the sentence used an inflected form. */
  baseForm: boolean;
}

/**
 * The form the learner met (`display`, usually conjugated) is the expected
 * answer; the bare lemma also counts, but gets a base-form warning. Both
 * checks stay accent-tolerant. « Il fait chaud » → "fait" ✓, "faire" ✓ with
 * warning, anything else ✗.
 */
function gradeInput(value: string, word: SavedWord): Verdict {
  const surface = gradeAnswer(value, [word.display]);
  if (surface !== 'wrong') return { grade: surface, baseForm: false };
  const base = gradeAnswer(value, [word.lemma]);
  if (base !== 'wrong') return { grade: base, baseForm: true };
  return { grade: 'wrong', baseForm: false };
}

interface Miss {
  word: SavedWord;
  user: string;
}

/**
 * Fill in the Blank — one word per session, `sessions = clamp(pool, 5, 10)`.
 * A wrong answer never shows the solution outright: the learner retries as
 * often as they like, with a separate « Reveal answer » escape hatch. A
 * correct session auto-advances after a short frozen pause.
 */
export default function PracticePage() {
  const { user } = useAuth();
  const [words, setWords] = useState<SavedWord[] | null>(null);
  const [poolSize, setPoolSize] = useState(0);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState('');
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [attempted, setAttempted] = useState(false);
  const [answerRevealed, setAnswerRevealed] = useState(false);
  const [score, setScore] = useState(0);
  const [missed, setMissed] = useState<Miss[]>([]);
  const [finished, setFinished] = useState(false);
  const [hintShown, setHintShown] = useState(false);
  const [typed, setTyped] = useState('');
  const [rendering, setRendering] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const themeVars = vocabThemeVars('practice');

  function reset() {
    setWords(null);
    setIndex(0);
    setValue('');
    setVerdict(null);
    setAttempted(false);
    setAnswerRevealed(false);
    setScore(0);
    setMissed([]);
    setFinished(false);
    setHintShown(false);
  }

  async function draw(): Promise<{ pool: number; drawn: SavedWord[] }> {
    const pool = await loadPracticePool({ requireTranslation: true });
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
  }, []);

  const word = words?.[index];
  const split = useMemo(() => (word ? splitSentence(word) : null), [word]);

  /* Typewriter reveal of the translate prompt; sentence prompts appear whole. */
  useEffect(() => {
    if (!word || finished) return;
    if (splitSentence(word)) {
      setTyped('');
      setRendering(false);
      inputRef.current?.focus();
      return;
    }
    const text = word.translation;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setTyped(text);
      setRendering(false);
      inputRef.current?.focus();
      return;
    }
    setTyped('');
    setRendering(true);
    let i = 0;
    const timer = window.setInterval(() => {
      i += 1;
      setTyped(text.slice(0, i));
      keyClick();
      if (i >= text.length) {
        window.clearInterval(timer);
        setRendering(false);
        inputRef.current?.focus();
      }
    }, 30);
    return () => window.clearInterval(timer);
  }, [word, finished]);

  const grade = verdict?.grade ?? null;
  const solved = grade === 'correct' || grade === 'accents';

  /* A correct session advances on its own after a short pause; the input is
     read-only by then and the action button renders disabled. */
  useEffect(() => {
    if (finished || !solved) return;
    const note = verdict?.baseForm || grade === 'accents';
    const timer = window.setTimeout(() => next(), note ? ADVANCE_NOTE_MS : ADVANCE_MS);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [solved, finished]);

  if (!user) {
    return (
      <>
        <DrillHeader title="Fill in the Blank" backTo={BACK_TO} backLabel="Vocabulary" />
        <GuestNotice message="Sign in with your email to save words and practise them here." />
      </>
    );
  }

  if (!words) return <DrillHeader title="Fill in the Blank" backTo={BACK_TO} backLabel="Vocabulary" />;

  const total = words.length;
  if (total === 0) {
    return (
      <>
        <DrillHeader title="Fill in the Blank" backTo={BACK_TO} backLabel="Vocabulary" />
        <div className="card">
          <p style={{ margin: '0 0 6px' }}>
            Fill in the Blank opens once you have {MIN_PRACTICE_WORDS} words in your learning pile
            — you have {poolSize} so far.
          </p>
          <p style={{ margin: '0 0 12px', color: 'var(--ink-soft)' }}>
            Save words while you read, or add them from the word lookup.
          </p>
          <Link className="btn btn--accent" to="/reading">
            Open the library
          </Link>
        </div>
      </>
    );
  }

  if (finished) {
    return (
      <>
        <DrillHeader title="Fill in the Blank" backTo={BACK_TO} backLabel="Vocabulary" />
        <div style={themeVars}>
          <DrillResults
            score={score}
            total={total}
            items={missed.map((m) => ({
              title: m.word.translation,
              meta:
                m.word.lemma !== m.word.display.toLowerCase()
                  ? `base form: ${m.word.lemma}`
                  : undefined,
              yours: m.user,
              correct: m.word.display,
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
    const v = gradeInput(value, word);
    setVerdict(v);
    if (!attempted) {
      // Score, the review list and the learning streak only count the first attempt.
      setAttempted(true);
      void recordWordResult(word, v.grade !== 'wrong', 'blank');
      if (v.grade === 'wrong') setMissed((m) => [...m, { word, user: value.trim() }]);
      else setScore((s) => s + 1);
    }
    if (v.grade === 'wrong') errorBuzz();
    else successChime();
  }

  function next() {
    if (isLast) {
      recordRound('vocabulary', 'practice', score, total);
      setFinished(true);
    } else {
      setIndex((i) => i + 1);
      setValue('');
      setVerdict(null);
      setAttempted(false);
      setAnswerRevealed(false);
      setHintShown(false);
    }
  }

  function reveal() {
    setAnswerRevealed(true);
    setVerdict((v) => v ?? { grade: 'wrong', baseForm: false });
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (solved) return; // auto-advance owns the transition
    if (answerRevealed) next();
    else if (!rendering && value.trim()) check();
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

  const inputLocked = done;
  const showWrongState = grade === 'wrong';

  return (
    <div
      className="conj-drill"
      style={solved ? { ...themeVars, pointerEvents: 'none' } : themeVars}
      aria-busy={solved}
    >
      <DrillTopline backTo={BACK_TO} backLabel="Vocabulary" title="Fill in the Blank">
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
          <span className="conj-tense-badge">{split ? 'Fill the blank' : 'Translate'}</span>
          <span className="conj-stage__counter">
            N° {index + 1}/{total}
          </span>
        </div>

        {split ? (
          <>
            <p className="vocab-sentence">
              {split.before}
              <span
                className={`vocab-blank${done ? ` vocab-blank--filled vocab-blank--${solved ? grade : 'revealed'}` : ''}`}
              >
                {done ? split.found : ''}
              </span>
              {split.after}
            </p>
            {hintShown ? (
              <p className="vocab-hint">« {word.translation} »</p>
            ) : (
              <button type="button" className="vocab-reveal" onClick={() => setHintShown(true)}>
                Show hint in English
              </button>
            )}
          </>
        ) : (
          <>
            <p className={`vocab-prompt${rendering ? ' is-typing' : ''}`}>{typed || ' '}</p>
            <p className="vocab-prompt__sub">translate into French</p>
          </>
        )}

        <form onSubmit={handleSubmit}>
          <div className="conj-field vocab-field">
            <input
              ref={inputRef}
              className={`conj-input${grade ? ` conj-input--${grade}` : ''}`}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                // Typing again after a miss clears the wrong stamp — a fresh try.
                if (verdict?.grade === 'wrong' && !answerRevealed) setVerdict(null);
              }}
              onKeyDown={(e) => {
                if (e.key.length === 1 || e.key === 'Backspace') keyClick();
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              readOnly={inputLocked}
              placeholder="en français…"
              aria-label={split ? 'The missing word' : `French for “${word.translation}”`}
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
            {/* The correct answer appears only when earned (accent nudge) or
                explicitly requested — never as a side effect of being wrong. */}
            {(grade === 'accents' || answerRevealed) && (
              <span
                className={`conj-field__tag${grade === 'accents' ? ' conj-field__tag--soft' : ''}`}
              >
                {word.display}
              </span>
            )}
          </div>

          {verdict?.baseForm && solved && (
            <p className="feedback feedback--accents">
              Right word, but that’s the base form — here it was <strong>{word.display}</strong>
            </p>
          )}
          {answerRevealed && word.lemma !== word.display.toLowerCase() && (
            <p className="feedback feedback--wrong">Base form: {word.lemma}</p>
          )}

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
                <button
                  className="btn btn--primary"
                  type="submit"
                  disabled={rendering || !value.trim()}
                >
                  {showWrongState || attempted ? 'Check again' : 'Check'}{' '}
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
