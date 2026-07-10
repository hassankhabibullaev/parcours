import { useMemo, useState, type CSSProperties } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { TENSES, verbList, verbMeanings } from '../data/content';
import { TENSE_THEMES } from '../lib/tenseThemes';
import { foldAccents } from '../lib/practice';
import SectionTabs from '../components/SectionTabs';
import ConjugationPicker from '../components/ConjugationPicker';

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
