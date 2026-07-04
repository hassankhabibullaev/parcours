import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { TENSES, type TenseKey } from '../data/content';
import {
  buildSession,
  pronounDisplay,
  tenseLabel,
  PROMPTS_PER_EXERCISE,
  type Exercise,
} from '../lib/conjugation';
import { gradeAnswer, recordRound, type AnswerGrade } from '../lib/practice';
import { MIXED_STRIPE, TENSE_THEMES } from '../lib/tenseThemes';
import { errorBuzz, keyClick, successChime } from '../lib/sound';
import DrillHeader from '../components/DrillHeader';
import DrillTopline from '../components/DrillTopline';
import DrillResults from '../components/DrillResults';
import SoundPill from '../components/SoundPill';

const BLANK = () => Array(PROMPTS_PER_EXERCISE).fill('') as string[];
const ACCENT_KEYS = ['à', 'é', 'è', 'ê', 'î', 'û', 'ç'];

/** A blank missed on its first grading — kept for the end-of-round review. */
interface Miss {
  verb: string;
  tense: TenseKey;
  pronoun: string;
  user: string;
  correct: string;
}

export default function ConjugationDrillPage() {
  const { tense } = useParams();
  const mode: TenseKey | 'mixed' | undefined =
    tense === 'mixed' ? 'mixed' : TENSES.find((t) => t.key === tense)?.key;

  const [session, setSession] = useState<Exercise[]>(() => (mode ? buildSession(mode) : []));
  const [exIndex, setExIndex] = useState(0);
  const [values, setValues] = useState<string[]>(BLANK());
  const [grades, setGrades] = useState<AnswerGrade[] | null>(null);
  const [score, setScore] = useState(0);
  const [missed, setMissed] = useState<Miss[]>([]);
  const [finished, setFinished] = useState(false);
  const [typed, setTyped] = useState('');
  const [rendering, setRendering] = useState(true);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const exercise: Exercise | undefined = session[exIndex];

  /* Typewriter reveal of the verb; Check stays disabled until it finishes. */
  useEffect(() => {
    if (finished || !exercise) return;
    const word = exercise.verb;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setTyped(word);
      setRendering(false);
      inputRefs.current[0]?.focus();
      return;
    }
    setTyped('');
    setRendering(true);
    let i = 0;
    const timer = window.setInterval(() => {
      i += 1;
      setTyped(word.slice(0, i));
      keyClick();
      if (i >= word.length) {
        window.clearInterval(timer);
        setRendering(false);
        inputRefs.current[0]?.focus();
      }
    }, 50);
    return () => window.clearInterval(timer);
  }, [exercise, finished]);

  if (!mode) return <Navigate to="/conjugation" replace />;

  const title = mode === 'mixed' ? 'Mixed drill' : tenseLabel(mode);
  const total = session.length * PROMPTS_PER_EXERCISE;
  const allFilled = values.every((v) => v.trim() !== '');
  /** Wrong answers block Next: the learner retypes them until all pass. */
  const hasWrong = grades !== null && grades.some((g) => g === 'wrong');
  const isLast = exIndex + 1 >= session.length;
  const progressPct = session.length
    ? ((exIndex + (grades ? 1 : 0)) / session.length) * 100
    : 0;

  const themeVars = (
    mode === 'mixed'
      ? { '--tc': 'var(--ink)', '--tc-wash': 'rgba(33, 29, 22, 0.05)', '--stripe': MIXED_STRIPE }
      : {
          '--tc': TENSE_THEMES[mode].color,
          '--tc-wash': TENSE_THEMES[mode].wash,
          '--stripe': `linear-gradient(90deg, ${TENSE_THEMES[mode].color}, ${TENSE_THEMES[mode].color})`,
        }
  ) as CSSProperties;

  function start() {
    setSession(buildSession(mode!));
    setExIndex(0);
    setValues(BLANK());
    setGrades(null);
    setScore(0);
    setMissed([]);
    setFinished(false);
    setTyped('');
    setRendering(true);
    setFocusedIdx(null);
  }

  function check() {
    const ex = exercise;
    if (!ex) return;
    const firstTry = grades === null;
    // Re-checks only regrade the still-wrong fields; passed ones keep their grade.
    const gs = ex.prompts.map((p, i) =>
      grades === null || grades[i] === 'wrong'
        ? gradeAnswer(values[i], p.answers)
        : grades[i],
    );
    if (firstTry) {
      // Score and the review list only count the first attempt.
      let sc = score;
      const newlyMissed: Miss[] = [];
      gs.forEach((g, i) => {
        const p = ex.prompts[i];
        if (g === 'wrong') {
          newlyMissed.push({
            verb: ex.verb,
            tense: p.tense,
            pronoun: pronounDisplay(p.pronoun, p.tense, p.answers[0]),
            user: values[i].trim(),
            correct: p.answers.join(' / '),
          });
        } else {
          sc += 1;
        }
      });
      setScore(sc);
      if (newlyMissed.length) setMissed((m) => [...m, ...newlyMissed]);
    }
    setGrades(gs);
    const stillWrong = gs.findIndex((g) => g === 'wrong');
    if (stillWrong >= 0) {
      errorBuzz();
      requestAnimationFrame(() => inputRefs.current[stillWrong]?.focus());
    } else {
      successChime();
    }
  }

  function next() {
    if (isLast) {
      recordRound('conjugation', 'typing', score, total, mode!);
      setFinished(true);
    } else {
      setExIndex((i) => i + 1);
      setValues(BLANK());
      setGrades(null);
      setTyped('');
      setRendering(true);
      setFocusedIdx(null);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (grades && !hasWrong) next();
    else if (!rendering && allFilled) check();
  }

  /** Enter walks to the next empty editable field first; submits when all filled. */
  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>, i: number) {
    if (e.key.length === 1 || e.key === 'Backspace') keyClick();
    if (e.key !== 'Enter' || (grades && !hasWrong)) return;
    const editable = (j: number) => grades === null || grades[j] === 'wrong';
    const order = [...Array(PROMPTS_PER_EXERCISE).keys()];
    const nextEmpty =
      order.slice(i + 1).find((j) => editable(j) && !values[j].trim()) ??
      order.slice(0, i).find((j) => editable(j) && !values[j].trim());
    if (nextEmpty !== undefined) {
      e.preventDefault();
      inputRefs.current[nextEmpty]?.focus();
    }
  }

  /** Insert an accented character at the caret of the focused input. */
  function insertAccent(ch: string) {
    const i = focusedIdx;
    if (i === null || (grades !== null && grades[i] !== 'wrong')) return;
    const el = inputRefs.current[i];
    if (!el) return;
    const start = el.selectionStart ?? el.value.length;
    const end = el.selectionEnd ?? start;
    setValues((v) => v.map((x, j) => (j === i ? x.slice(0, start) + ch + x.slice(end) : x)));
    keyClick();
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + 1, start + 1);
    });
  }

  if (finished) {
    return (
      <>
        <DrillHeader title={title} backTo="/conjugation" backLabel="Conjugation" />
        <div style={themeVars}>
          <DrillResults
            score={score}
            total={total}
            unit="form"
            items={missed.map((m) => ({
              title: m.pronoun,
              meta: (
                <>
                  {m.verb} · <span className="conj-review__tense">{tenseLabel(m.tense)}</span>
                </>
              ),
              yours: m.user,
              correct: m.correct,
              color: TENSE_THEMES[m.tense].color,
            }))}
            onRetry={start}
            backTo="/conjugation"
            backLabel="Back to conjugation"
          />
        </div>
      </>
    );
  }

  if (!exercise) return null;

  return (
    <div className="conj-drill" style={themeVars}>
      <DrillTopline backTo="/conjugation" backLabel="Conjugation" title={title}>
        <span className="hud-pill hud-pill--live" key={`score-${score}`}>
          ✓ <strong>{score}</strong>
        </span>
        <SoundPill />
      </DrillTopline>
      <div className="conj-progress">
        <div className="conj-progress__fill" style={{ width: `${progressPct}%` }} />
      </div>

      <div className="card conj-stage" key={exIndex}>
        <div className="conj-stage__head">
          <div className="conj-stage__title">
            {mode !== 'mixed' && (
              <span className="conj-tense-badge">{tenseLabel(mode)}</span>
            )}
            <span className={`conj-verb__inf${rendering ? ' is-typing' : ''}`}>
              {typed || ' '}
            </span>
            <span className="conj-verb__meaning">{exercise.meaning}</span>
          </div>
          <span className="conj-stage__counter">
            N° {exIndex + 1}/{session.length}
          </span>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="conj-rows">
            {exercise.prompts.map((p, i) => {
              const g = grades?.[i] ?? null;
              const theme = TENSE_THEMES[p.tense];
              return (
                <div
                  className="conj-row"
                  key={i}
                  style={{ '--tc': theme.color, '--tc-wash': theme.wash } as CSSProperties}
                >
                  <div className="conj-row__lead">
                    <span className="conj-row__pronoun">
                      {pronounDisplay(p.pronoun, p.tense, p.answers[0])}
                    </span>
                    {mode === 'mixed' && (
                      <span className="conj-row__tense">{tenseLabel(p.tense)}</span>
                    )}
                  </div>
                  <div className="conj-field">
                    <input
                      ref={(el) => {
                        inputRefs.current[i] = el;
                      }}
                      className={`conj-input${g ? ` conj-input--${g}` : ''}`}
                      data-tense={p.tense}
                      data-slot={p.slot}
                      value={values[i]}
                      onChange={(e) =>
                        setValues((v) => v.map((x, j) => (j === i ? e.target.value : x)))
                      }
                      onKeyDown={(e) => handleKeyDown(e, i)}
                      onFocus={() => setFocusedIdx(i)}
                      onBlur={() => setFocusedIdx((cur) => (cur === i ? null : cur))}
                      readOnly={grades !== null && g !== 'wrong'}
                      placeholder="…"
                      aria-label={`${pronounDisplay(p.pronoun, p.tense, p.answers[0])} — ${tenseLabel(p.tense)}`}
                      autoCapitalize="none"
                      autoCorrect="off"
                      autoComplete="off"
                      spellCheck={false}
                      lang="fr"
                    />
                    {g && (
                      <span className={`conj-field__icon conj-field__icon--${g}`}>
                        {g === 'wrong' ? '✕' : '✓'}
                      </span>
                    )}
                    {(g === 'wrong' || g === 'accents') && (
                      <span
                        className={`conj-field__tag${g === 'accents' ? ' conj-field__tag--soft' : ''}`}
                      >
                        {p.answers.join(' / ')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div
            className={`conj-accents${
              focusedIdx === null || (grades !== null && grades[focusedIdx] !== 'wrong')
                ? ' conj-accents--dim'
                : ''
            }`}
          >
            <span className="conj-accents__lbl">Accents</span>
            {ACCENT_KEYS.map((ch) => (
              <button
                type="button"
                className="accent-key"
                key={ch}
                disabled={
                  focusedIdx === null ||
                  (grades !== null && grades[focusedIdx] !== 'wrong')
                }
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => insertAccent(ch)}
              >
                {ch}
              </button>
            ))}
          </div>

          <div className="conj-actions">
            {grades === null || hasWrong ? (
              <button
                key="check"
                className="btn btn--primary"
                type="submit"
                disabled={rendering || !allFilled}
              >
                {hasWrong ? 'Check again' : 'Check'} <span className="kbd-hint">⏎</span>
              </button>
            ) : (
              <button key="next" className="btn btn--accent" type="submit" autoFocus>
                {isLast ? 'Finish' : 'Next →'} <span className="kbd-hint">⏎</span>
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
