import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { TENSES, verbList, verbMeanings } from '../data/content';
import { TENSE_THEMES } from '../lib/tenseThemes';
import { foldAccents } from '../lib/practice';
import { tenseLabel } from '../lib/conjugation';
import { clearVerb, getStruggles, type StruggleEntry } from '../lib/conjStruggles';
import SectionTabs from '../components/SectionTabs';
import ConjugationPicker from '../components/ConjugationPicker';
import { CloseIcon } from '../components/icons';

type Tab = 'learn' | 'practice';

/**
 * Conjugation — two tabs. Learn is the reference shelf: the rules of every
 * drilled tense (formation, endings, examples, traps) and the full list of
 * drilled verbs, each opening its complete conjugation. Practice holds the
 * tense picker for the typing drill. The active tab lives in the URL
 * (`?tab=practice`) so a drill's back link can return here.
 */
export default function ConjugationPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'practice' ? 'practice' : 'learn';

  return (
    <>
      <h2 className="page-heading">Conjugation</h2>
      <SectionTabs<Tab>
        ariaLabel="Conjugation"
        tabs={[
          { key: 'learn', label: 'Learn' },
          { key: 'practice', label: 'Practice' },
        ]}
        active={tab}
        onSelect={(t) => setParams(t === 'practice' ? { tab: 'practice' } : {}, { replace: true })}
      />
      {tab === 'learn' ? <LearnTab /> : <ConjugationPicker />}
    </>
  );
}

function LearnTab() {
  const [query, setQuery] = useState('');

  const verbs = useMemo(() => {
    const q = foldAccents(query.trim());
    if (!q) return verbList;
    return verbList.filter(
      (v) =>
        foldAccents(v).includes(q) ||
        foldAccents(verbMeanings[v] ?? '').includes(q),
    );
  }, [query]);

  return (
    <>
      <NeedsWorkSection />
      <div className="section-label">Tenses &amp; rules</div>
      <div className="learn-list">
        {TENSES.map((t) => (
          <Link
            key={t.key}
            className="learn-row"
            to={`/conjugation/guide/${t.key}`}
            style={{ '--tc': TENSE_THEMES[t.key].color } as CSSProperties}
          >
            <span className="learn-row__dot" aria-hidden />
            <span className="learn-row__title">{t.label}</span>
            <span className="learn-row__sub">{TENSE_THEMES[t.key].hint}</span>
            <span className="learn-row__chev" aria-hidden>
              →
            </span>
          </Link>
        ))}
      </div>

      <div className="section-label">Verbs · {verbList.length}</div>
      <input
        className="text-input lexicon-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Find a verb — French or English…"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        lang="fr"
      />
      {verbs.length > 0 ? (
        <div className="learn-list">
          {verbs.map((v) => (
            <Link
              key={v}
              className="learn-row"
              to={`/conjugation/verb/${encodeURIComponent(v)}`}
            >
              <span className="learn-row__title">{v}</span>
              <span className="learn-row__sub">{verbMeanings[v]}</span>
              <span className="learn-row__chev" aria-hidden>
                →
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="form-notice">No verb matches — the drill set has {verbList.length}.</p>
      )}
    </>
  );
}

/**
 * The needs-work list: the verbs the learner chose to keep after slipping on
 * them in the typing drill (the « Keep » button on a round's results — see
 * lib/conjStruggles.ts). Hidden when there's nothing kept. One row per verb,
 * wearing a badge per flagged tense; tapping it opens the verb's **study
 * page** (rules for the shaky tenses + a short focused drill + « Mark as
 * learned »). The ✕ drops the verb without ceremony.
 */
function NeedsWorkSection() {
  const struggles = useLiveQuery(() => getStruggles(), []);
  if (!struggles || struggles.length === 0) return null;

  // Group per verb, preserving the most-kept-first ordering of the entries.
  const byVerb = new Map<string, StruggleEntry[]>();
  for (const s of struggles) {
    const list = byVerb.get(s.verb);
    if (list) list.push(s);
    else byVerb.set(s.verb, [s]);
  }

  return (
    <>
      <div className="section-label">Needs work · {byVerb.size}</div>
      <p className="needs-work__lede">
        Verbs you kept after practice. Tap one to read its rules with the shaky
        tenses front and centre, take a short drill, and mark it learned once it
        sticks — or ✕ to drop it.
      </p>
      <div className="learn-list">
        {[...byVerb.entries()].map(([verb, entries]) => {
          const theme = TENSE_THEMES[entries[0].tense];
          return (
            <div
              key={verb}
              className="learn-row needs-work__row"
              style={{ '--tc': theme.color, '--tc-wash': theme.wash } as CSSProperties}
            >
              <Link
                className="needs-work__main"
                to={`/conjugation/study/${encodeURIComponent(verb)}`}
                aria-label={`Study ${verb} — ${entries.map((e) => tenseLabel(e.tense)).join(', ')}`}
              >
                <span className="needs-work__verb">
                  {verb}
                  <span className="needs-work__meaning">{verbMeanings[verb]}</span>
                </span>
                <span className="needs-work__badges">
                  {entries.map((e) => (
                    <span
                      key={e.tense}
                      className="conj-tense-badge needs-work__tense"
                      style={{ '--tc': TENSE_THEMES[e.tense].color } as CSSProperties}
                    >
                      {tenseLabel(e.tense)}
                    </span>
                  ))}
                </span>
                <span className="learn-row__chev" aria-hidden>
                  →
                </span>
              </Link>
              <button
                type="button"
                className="icon-btn needs-work__remove"
                onClick={() => clearVerb(verb)}
                aria-label={`Drop ${verb} from the needs-work list`}
                title="Drop from the list"
              >
                <CloseIcon />
              </button>
            </div>
          );
        })}
      </div>
    </>
  );
}
