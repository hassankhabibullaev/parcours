import {
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { TENSES, verbs, type TenseKey } from '../data/content';
import {
  buildFocusSession,
  buildSession,
  selectDrillVerbs,
  pronounDisplay,
  tenseLabel,
  tenseAbbr,
  PROMPTS_PER_EXERCISE,
  type Exercise,
} from '../lib/conjugation';
import { gradeAnswer, recordRound, type AnswerGrade } from '../lib/practice';
import { recordDrillResult } from '../lib/struggle';
import { addStruggle, clearVerb, flaggedTensesFor, getStruggles } from '../lib/conjStruggles';
import { MIXED_STRIPE, TENSE_THEMES } from '../lib/tenseThemes';
import { confirmTock, errorBuzz, keyClick, sfxEnabled, successChime } from '../lib/sound';
import { useAutoSpeak } from '../lib/useAutoSpeak';
import DrillHeader from '../components/DrillHeader';
import DrillTopline from '../components/DrillTopline';
import DrillResults from '../components/DrillResults';
import SoundPill from '../components/SoundPill';

const BLANK = () => Array(PROMPTS_PER_EXERCISE).fill('') as string[];
const NO_REVEAL = () => Array(PROMPTS_PER_EXERCISE).fill(false) as boolean[];
const ACCENT_KEYS = ['à', 'é', 'è', 'ê', 'î', 'û', 'ç'];
/** Back target: the Conjugation section's Practice tab. */
const CONJ_BACK = '/conjugation?tab=practice';

/** Auto-advance delay after a fully correct exercise; longer when an accent
    correction is on screen so the learner can actually read it. */
const ADVANCE_MS = 900;
const ADVANCE_ACCENTS_MS = 1700;

/** A blank missed on its first grading — kept for the end-of-round review. */
interface Miss {
  verb: string;
  tense: TenseKey;
  pronoun: string;
  user: string;
  correct: string;
}

/** How a focus round went, per flagged tense — display only: the round never
    edits the needs-work list itself (the learner marks the verb learned). */
interface FocusSummary {
  clean: TenseKey[];
  shaky: TenseKey[];
}

export default function ConjugationDrillPage() {
  const { tense, infinitive } = useParams();
  // /conjugation/focus/:infinitive — the needs-work fixing drill: one verb,
  // its flagged tenses drilled hardest. Renders like the mixed drill (a tense
  // chip per row) but resolves the needs-work list at the end instead of
  // feeding it per exercise.
  const focusVerb = infinitive && verbs[infinitive] ? infinitive : undefined;
  const mode: TenseKey | 'mixed' | undefined = focusVerb
    ? 'mixed'
    : tense === 'mixed'
      ? 'mixed'
      : TENSES.find((t) => t.key === tense)?.key;

  const [session, setSession] = useState<Exercise[]>([]);
  const [loading, setLoading] = useState(true);
  const [exIndex, setExIndex] = useState(0);
  const [values, setValues] = useState<string[]>(BLANK());
  // A wrong answer's correction stays blurred until the learner taps to reveal
  // it (per prompt), so the answer isn't handed over the moment they slip.
  const [revealed, setRevealed] = useState<boolean[]>(NO_REVEAL());
  const [grades, setGrades] = useState<AnswerGrade[] | null>(null);
  const [score, setScore] = useState(0);
  const [missed, setMissed] = useState<Miss[]>([]);
  const [finished, setFinished] = useState(false);
  const [typed, setTyped] = useState('');
  const [rendering, setRendering] = useState(true);
  const [focusedIdx, setFocusedIdx] = useState<number | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  // Focus mode: every first-attempt prompt result of the round, folded per
  // tense at the end into a report (a flagged tense must be clean across the
  // WHOLE round to count as clean, even when it spans exercises).
  const focusLog = useRef<{ tense: TenseKey; correct: boolean }[]>([]);
  const [flagged, setFlagged] = useState<TenseKey[]>([]);
  const [outcome, setOutcome] = useState<FocusSummary | null>(null);

  const exercise: Exercise | undefined = session[exIndex];

  /* Draw this session's verbs struggle-weighted, then build the exercises.
     Async because the weighting reads per-verb stats from IndexedDB; the
     cancelled flag keeps StrictMode's double-run from swapping the deck.
     Focus mode instead reads the verb's flagged tenses and builds its
     single-verb session from them. */
  useEffect(() => {
    if (!mode) return;
    let cancelled = false;
    setLoading(true);
    if (focusVerb) {
      flaggedTensesFor(focusVerb).then((tenses) => {
        if (cancelled) return;
        focusLog.current = [];
        setFlagged(tenses);
        setSession(buildFocusSession(focusVerb, tenses));
        setLoading(false);
      });
    } else {
      selectDrillVerbs().then((drawn) => {
        if (cancelled) return;
        setSession(buildSession(mode, drawn));
        setLoading(false);
      });
    }
    return () => {
      cancelled = true;
    };
  }, [mode, focusVerb]);

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

  /* Pronounce the infinitive once it finishes typing (the conjugated answers
     stay hidden, so this doesn't give the drill away). The drill's speaker pill
     mutes it along with the other drill sounds. */
  useAutoSpeak(exercise?.verb, !rendering && !finished && sfxEnabled());

  /* A fully correct exercise advances on its own after a short pause; inputs
     are already read-only by then and the action button renders disabled. */
  useEffect(() => {
    if (finished || grades === null || grades.some((g) => g === 'wrong')) return;
    const delay = grades.some((g) => g === 'accents') ? ADVANCE_ACCENTS_MS : ADVANCE_MS;
    const timer = window.setTimeout(() => next(), delay);
    return () => window.clearTimeout(timer);
  }, [grades, finished]);

  // An unknown tense — or an unknown verb on the focus route — goes back.
  if (!mode || (infinitive && !focusVerb)) return <Navigate to={CONJ_BACK} replace />;

  /** Focus drills return to the Learn tab (where the needs-work list lives). */
  const backTo = focusVerb ? '/conjugation' : CONJ_BACK;
  const title = focusVerb ? `Focus · ${focusVerb}` : mode === 'mixed' ? 'Mixed drill' : tenseLabel(mode);

  if (loading) {
    return <DrillHeader title={title} backTo={backTo} backLabel="Conjugation" />;
  }
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
      // Feed the struggle-weighted verb draw: a verb counts as "got it" only
      // when every prompt for it was right first try.
      void recordDrillResult('verb', ex.verb, newlyMissed.length === 0);
      if (focusVerb) {
        // Focus mode holds its results until the round ends (see next()) —
        // a flagged tense must be clean across all its prompts to report clean.
        focusLog.current.push(
          ...gs.map((g, i) => ({
            tense: ex.prompts[i].tense,
            correct: g !== 'wrong', // accents count as correct, matching the score
          })),
        );
      }
      // Regular rounds no longer feed the needs-work list automatically — the
      // results screen offers a « Keep » button per miss instead (RetainNote).
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
      if (focusVerb) {
        // Fold the whole round's first attempts per tense for the report —
        // display only, the list itself is the learner's to edit.
        const byTense = new Map<TenseKey, boolean>();
        for (const { tense, correct } of focusLog.current) {
          byTense.set(tense, (byTense.get(tense) ?? true) && correct);
        }
        const drilled = flagged.filter((t) => byTense.has(t));
        setOutcome({
          clean: drilled.filter((t) => byTense.get(t)),
          shaky: [...byTense.keys()].filter((t) => !byTense.get(t)),
        });
        recordRound('conjugation', 'focus', score, total);
      } else {
        recordRound('conjugation', 'typing', score, total, mode!);
      }
      setFinished(true);
    } else {
      setExIndex((i) => i + 1);
      setValues(BLANK());
      setRevealed(NO_REVEAL());
      setGrades(null);
      setTyped('');
      setRendering(true);
      setFocusedIdx(null);
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    // All-correct exercises advance on their own timer — ignore submits then.
    if (grades && !hasWrong) return;
    if (!rendering && allFilled) check();
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
        <DrillHeader title={title} backTo={backTo} backLabel="Conjugation" />
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
            note={
              focusVerb ? (
                outcome && <FocusNote verb={focusVerb} outcome={outcome} />
              ) : (
                <RetainNote misses={missed} />
              )
            }
            backTo={backTo}
            backLabel="Back to conjugation"
          />
        </div>
      </>
    );
  }

  if (!exercise) return null;

  return (
    <div className="conj-drill" style={themeVars}>
      <DrillTopline backTo={backTo} backLabel="Conjugation" title={title}>
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
                  {mode === 'mixed' && (
                    <span className="conj-row__tense">{tenseAbbr(p.tense)}</span>
                  )}
                  {(() => {
                    const pd = pronounDisplay(p.pronoun, p.tense, p.answers[0]);
                    return (
                      <span
                        className={`conj-row__pronoun${pd.length > 5 ? ' conj-row__pronoun--sm' : ''}`}
                      >
                        {pd}
                      </span>
                    );
                  })()}
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
                    {/* Accent slips count as correct, so the corrected form is
                        shown outright (green). A genuinely wrong answer stays
                        blurred until the learner taps to reveal it. */}
                    {g === 'accents' && (
                      <span className="conj-field__tag conj-field__tag--soft">
                        {p.answers.join(' / ')}
                      </span>
                    )}
                    {g === 'wrong' &&
                      (revealed[i] ? (
                        <span className="conj-field__tag">{p.answers.join(' / ')}</span>
                      ) : (
                        <button
                          type="button"
                          className="conj-field__tag conj-field__tag--blur"
                          onClick={() =>
                            setRevealed((r) => r.map((x, j) => (j === i ? true : x)))
                          }
                          aria-label="Reveal the correct answer"
                        >
                          <span className="conj-field__tag-text" aria-hidden>
                            {p.answers.join(' / ')}
                          </span>
                          <span className="conj-field__reveal">Reveal</span>
                        </button>
                      ))}
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
              <button key="next" className="btn btn--accent" type="button" disabled>
                {isLast ? 'Finish' : 'Next →'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

/**
 * « Keep » buttons for a regular round's misses — the only way a verb×tense
 * pair gets onto the needs-work list. Pairs are deduplicated (a verb missed
 * on two pronouns of one tense is one row); a pair already on the list shows
 * as kept. Keeping is quiet and reversible — the list lives on
 * Conjugation → Learn, where each verb opens its study page.
 */
function RetainNote({ misses }: { misses: Miss[] }) {
  const struggles = useLiveQuery(() => getStruggles(), []);
  const pairs: { verb: string; tense: TenseKey }[] = [];
  const seen = new Set<string>();
  for (const m of misses) {
    const k = `${m.verb}|${m.tense}`;
    if (seen.has(k)) continue;
    seen.add(k);
    pairs.push({ verb: m.verb, tense: m.tense });
  }
  if (pairs.length === 0) return null;

  const kept = new Set((struggles ?? []).map((s) => `${s.verb}|${s.tense}`));

  return (
    <div className="retain">
      <p className="retain__lede">
        Worth working on? Keep a verb and it lands under Conjugation → Learn,
        with its rules and a short focused drill.
      </p>
      {pairs.map(({ verb, tense }) => {
        const isKept = kept.has(`${verb}|${tense}`);
        const theme = TENSE_THEMES[tense];
        return (
          <div
            className="retain__row"
            key={`${verb}|${tense}`}
            style={{ '--tc': theme.color, '--tc-wash': theme.wash } as CSSProperties}
          >
            <span className="retain__verb">{verb}</span>
            <span className="conj-tense-badge">{tenseLabel(tense)}</span>
            <button
              type="button"
              className={`retain__btn${isKept ? ' retain__btn--kept' : ''}`}
              disabled={isKept}
              onClick={() => {
                confirmTock();
                void addStruggle(verb, tense);
              }}
            >
              {isKept ? '✓ Kept' : '+ Keep'}
            </button>
          </div>
        );
      })}
    </div>
  );
}

/**
 * A focus round's report: which flagged tenses came out clean this round and
 * which still wobbled — plus the one decision that's the learner's alone,
 * marking the verb learned (clears it off the needs-work list).
 */
function FocusNote({ verb, outcome }: { verb: string; outcome: FocusSummary }) {
  const navigate = useNavigate();
  return (
    <div className="focus-outcome">
      {outcome.clean.length > 0 && (
        <p className="focus-outcome__line focus-outcome__line--cleared">
          ✓ Clean this round: <strong>{outcome.clean.map(tenseLabel).join(' · ')}</strong>
        </p>
      )}
      {outcome.shaky.length > 0 && (
        <p className="focus-outcome__line">
          Still shaky: <strong>{outcome.shaky.map(tenseLabel).join(' · ')}</strong> —{' '}
          <Link
            className="focus-outcome__study"
            to={`/conjugation/study/${encodeURIComponent(verb)}`}
          >
            reread the rules
          </Link>{' '}
          and take another run.
        </p>
      )}
      <p className="focus-outcome__line focus-outcome__line--hint">
        You decide when it's stuck — marking it learned clears {verb} from the list.
      </p>
      <button
        type="button"
        className="btn btn--primary btn--full"
        onClick={() => {
          void clearVerb(verb);
          confirmTock();
          navigate('/conjugation');
        }}
      >
        Mark {verb} as learned
      </button>
    </div>
  );
}
