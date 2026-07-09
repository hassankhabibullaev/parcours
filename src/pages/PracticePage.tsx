import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import type { SavedWord } from '../lib/db';
import {
  drawPracticeWords,
  gradeAnswer,
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

const ROUND_SIZE = 10;
const ACCENT_KEYS = ['à', 'é', 'è', 'ê', 'î', 'û', 'ç'];

/**
 * Where the word sits in its saved sentence. Non-null only for words saved
 * from an article whose sentence still contains the form the learner met —
 * those get the fill-in-the-blank exercise; everything else (dictionary-search
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

export default function PracticePage() {
  const { user } = useAuth();
  const [words, setWords] = useState<SavedWord[] | null>(null);
  const [index, setIndex] = useState(0);
  const [value, setValue] = useState('');
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [score, setScore] = useState(0);
  const [missed, setMissed] = useState<Miss[]>([]);
  const [finished, setFinished] = useState(false);
  const [revealed, setRevealed] = useState(false);
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
    setScore(0);
    setMissed([]);
    setFinished(false);
    setRevealed(false);
  }

  async function start() {
    reset();
    setWords(await drawPracticeWords(ROUND_SIZE, { requireTranslation: true }));
  }

  useEffect(() => {
    // StrictMode double-runs this effect in dev; cancel the stale draw so a
    // late resolve can't swap the word list mid-round.
    let cancelled = false;
    reset();
    drawPracticeWords(ROUND_SIZE, { requireTranslation: true }).then((drawn) => {
      if (!cancelled) setWords(drawn);
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

  if (!user) {
    return (
      <>
        <DrillHeader title="Fill in the Blank" backTo="/practice?tab=vocabulary" backLabel="Practice" />
        <GuestNotice message="Log in or create a free account to save words and practise them here." />
      </>
    );
  }

  if (!words) return <DrillHeader title="Fill in the Blank" backTo="/practice?tab=vocabulary" backLabel="Practice" />;

  const total = words.length;
  if (total === 0) {
    return (
      <>
        <DrillHeader title="Fill in the Blank" backTo="/practice?tab=vocabulary" backLabel="Practice" />
        <div className="card">
          <p style={{ margin: '0 0 12px' }}>
            Nothing to practise yet — save words while you read, or add them from the dictionary
            search.
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
        <DrillHeader title="Fill in the Blank" backTo="/practice?tab=vocabulary" backLabel="Practice" />
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
  const grade = verdict?.grade ?? null;
  const isLast = index + 1 >= total;
  const progressPct = ((index + (verdict ? 1 : 0)) / total) * 100;

  function check() {
    if (!word) return;
    const v = gradeInput(value, word);
    setVerdict(v);
    void recordWordResult(word, v.grade !== 'wrong');
    if (v.grade === 'wrong') {
      setMissed((m) => [...m, { word, user: value.trim() }]);
      errorBuzz();
    } else {
      setScore((s) => s + 1);
      successChime();
    }
  }

  function next() {
    if (isLast) {
      recordRound('vocabulary', 'practice', score, total);
      setFinished(true);
    } else {
      setIndex((i) => i + 1);
      setValue('');
      setVerdict(null);
      setRevealed(false);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (verdict !== null) next();
    else if (!rendering && value.trim()) check();
  }

  /** Insert an accented character at the caret of the input. */
  function insertAccent(ch: string) {
    const el = inputRef.current;
    if (!el || verdict !== null) return;
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
    <div className="conj-drill" style={themeVars}>
      <DrillTopline backTo="/practice?tab=vocabulary" backLabel="Practice" title="Fill in the Blank">
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
                className={`vocab-blank${verdict ? ` vocab-blank--filled vocab-blank--${verdict.grade}` : ''}`}
              >
                {verdict ? split.found : ''}
              </span>
              {split.after}
            </p>
            {revealed ? (
              <p className="vocab-hint">« {word.translation} »</p>
            ) : (
              <button
                type="button"
                className="vocab-reveal"
                onClick={() => setRevealed(true)}
              >
                Show translation
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
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key.length === 1 || e.key === 'Backspace') keyClick();
              }}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              readOnly={verdict !== null}
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
            {(grade === 'wrong' || grade === 'accents') && (
              <span
                className={`conj-field__tag${grade === 'accents' ? ' conj-field__tag--soft' : ''}`}
              >
                {word.display}
              </span>
            )}
          </div>

          {verdict?.baseForm && grade !== 'wrong' && (
            <p className="feedback feedback--accents">
              Right word, but that’s the base form — here it was <strong>{word.display}</strong>
            </p>
          )}
          {grade === 'wrong' && word.lemma !== word.display.toLowerCase() && (
            <p className="feedback feedback--wrong">Base form: {word.lemma}</p>
          )}

          <div
            className={`conj-accents${!focused || verdict !== null ? ' conj-accents--dim' : ''}`}
          >
            <span className="conj-accents__lbl">Accents</span>
            {ACCENT_KEYS.map((ch) => (
              <button
                type="button"
                className="accent-key"
                key={ch}
                disabled={verdict !== null}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertAccent(ch)}
              >
                {ch}
              </button>
            ))}
          </div>

          <div className="conj-actions">
            {verdict === null ? (
              <button
                className="btn btn--primary"
                type="submit"
                disabled={rendering || !value.trim()}
              >
                Check <span className="kbd-hint">⏎</span>
              </button>
            ) : (
              <button className="btn btn--accent" type="submit" autoFocus>
                {isLast ? 'Finish' : 'Next →'} <span className="kbd-hint">⏎</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
