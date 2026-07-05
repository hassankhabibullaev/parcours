import { useState, type CSSProperties, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteSavedWord, type SavedWord } from '../lib/db';
import { lookup } from '../lib/dictionary';
import { searchDictionary } from '../lib/dictionarySearch';
import { saveWord } from '../lib/vocab';
import { successChime } from '../lib/sound';
import { canSpeak, speakFrench } from '../lib/speech';
import { LEARNT_STREAK } from '../lib/practice';
import { VOCAB_THEMES, type VocabMode } from '../lib/vocabThemes';
import {
  CheckCircleIcon,
  PlusIcon,
  SpeakerIcon,
  TrashIcon,
  UndoIcon,
} from '../components/icons';

const DRILLS: { mode: VocabMode; to: string; kicker: string; name: string; hint: string }[] = [
  {
    mode: 'learn',
    to: '/vocabulary/learn',
    kicker: 'Match · new',
    name: 'Learn',
    hint: 'Pair fresh words with their meanings',
  },
  {
    mode: 'practice',
    to: '/vocabulary/practice',
    kicker: 'Type · recall',
    name: 'Practice',
    hint: 'Fill the blank, or translate',
  },
  {
    mode: 'remember',
    to: '/vocabulary/remember',
    kicker: 'Match · review',
    name: 'Remember?',
    hint: 'Still know what you’ve learnt?',
  },
];

function drillCardStyle(mode: VocabMode, index: number): CSSProperties {
  const t = VOCAB_THEMES[mode];
  return {
    '--tc': t.color,
    '--tc-blob': `linear-gradient(135deg, ${t.blob} 0%, transparent 70%)`,
    animationDelay: `${index * 45}ms`,
  } as CSSProperties;
}

/** Collapsible lexicon group («Still Learning (42)») with a colored count. */
function LexGroup({
  title,
  count,
  color,
  empty,
  children,
}: {
  title: string;
  count: number;
  color: string;
  empty: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  return (
    <section className="lex-group" style={{ '--gc': color } as CSSProperties}>
      <button className="lex-group__head" onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        <span>{title}</span>
        <span className="lex-group__count">{count}</span>
        <span className="lex-group__rule" />
        <span className={`lex-group__chev${open ? '' : ' lex-group__chev--closed'}`}>▾</span>
      </button>
      {open && (count === 0 ? <p className="lex-group__empty">{empty}</p> : children)}
    </section>
  );
}

export default function VocabularyPage() {
  const words = useLiveQuery(() => db.savedWords.orderBy('addedAt').reverse().toArray(), []);

  const [query, setQuery] = useState('');
  const [addingLemma, setAddingLemma] = useState<string | null>(null);

  if (!words) return null;

  const learning = words.filter((w) => !w.learned);
  const learnt = words.filter((w) => w.learned);
  const savedLemmas = new Set(words.map((w) => w.lemma));

  const trimmed = query.trim();
  const results = trimmed ? searchDictionary(trimmed) : [];

  async function addFromDictionary(lemma: string) {
    if (addingLemma) return;
    setAddingLemma(lemma);
    try {
      // Translation is fetched online (fail-soft — the word is saved either way).
      const { translation, definition } = await lookup(lemma);
      await saveWord({ lemma, display: lemma, translation, definition, sentence: '', articleId: null });
      successChime();
    } finally {
      setAddingLemma(null);
    }
  }

  function toggleLearned(w: SavedWord) {
    // Manual override of the automatic progression — align the streak so the
    // dots (and the next practice answer) agree with the new shelf.
    db.savedWords.update(w.id, {
      learned: w.learned ? 0 : 1,
      streak: w.learned ? 0 : LEARNT_STREAK,
      updatedAt: Date.now(),
    });
  }

  function remove(w: SavedWord) {
    if (window.confirm(`Remove “${w.lemma}” from your lexicon?`)) {
      deleteSavedWord(w.id);
    }
  }

  function wordRow(w: SavedWord) {
    return (
      <div key={w.id} className={`word-row${w.learned ? ' word-row--learned' : ''}`}>
        <div className="word-row__main">
          <span className="word-row__word">{w.lemma}</span>
          <span className="word-row__translation">{w.translation || '—'}</span>
        </div>
        {!w.learned && (
          <span
            className="word-dots"
            title={`${Math.min(w.streak ?? 0, LEARNT_STREAK)}/${LEARNT_STREAK} correct in a row`}
          >
            {Array.from({ length: LEARNT_STREAK }, (_, i) => (
              <span
                key={i}
                className={`word-dot${i < (w.streak ?? 0) ? ' word-dot--on' : ''}`}
              />
            ))}
          </span>
        )}
        <div className="word-row__icons">
          {canSpeak() && (
            <button
              className="icon-btn"
              onClick={() => speakFrench(w.lemma)}
              aria-label={`Listen to ${w.lemma}`}
              title="Listen"
            >
              <SpeakerIcon />
            </button>
          )}
          <button
            className={`icon-btn${w.learned ? ' icon-btn--learned' : ''}`}
            onClick={() => toggleLearned(w)}
            aria-label={w.learned ? `Move ${w.lemma} back to learning` : `Mark ${w.lemma} learnt`}
            title={w.learned ? 'Back to learning' : 'Mark learnt'}
          >
            {w.learned ? <UndoIcon /> : <CheckCircleIcon />}
          </button>
          <button
            className="icon-btn icon-btn--danger"
            onClick={() => remove(w)}
            aria-label={`Remove ${w.lemma}`}
            title="Remove"
          >
            <TrashIcon />
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <h2 className="page-heading">Vocabulary</h2>
      <p className="page-subheading">
        Your growing word collection — drill it in three ways.
      </p>

      <div className="section-label">Practice</div>
      <div className="drill-grid">
        {DRILLS.map((d, i) => (
          <Link key={d.mode} className="drill-card" to={d.to} style={drillCardStyle(d.mode, i)}>
            <span className="drill-card__kicker">{d.kicker}</span>
            <span className="drill-card__name">{d.name}</span>
            <span className="drill-card__hint">{d.hint}</span>
          </Link>
        ))}
      </div>
      <p className="drill-note">
        Words graduate after {LEARNT_STREAK} correct answers in a row — a miss sends them back.
      </p>

      <div className="section-label">Lexicon</div>

      <input
        className="text-input lexicon-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the dictionary…"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        lang="fr"
      />

      {trimmed &&
        (results.length > 0 ? (
          <div className="dict-results">
            {results.map((r) => (
              <div key={r.lemma} className="dict-result">
                <div className="dict-result__main">
                  <span className="dict-result__word">{r.lemma}</span>
                  {r.meaning && <span className="dict-result__meaning">{r.meaning}</span>}
                </div>
                {savedLemmas.has(r.lemma) ? (
                  <span className="dict-result__added">In your vocabulary ✓</span>
                ) : (
                  <button
                    className="icon-btn icon-btn--add"
                    onClick={() => addFromDictionary(r.lemma)}
                    disabled={addingLemma !== null}
                    aria-label={`Add ${r.lemma} to vocabulary`}
                    title="Add to vocabulary"
                  >
                    {addingLemma === r.lemma ? '…' : <PlusIcon />}
                  </button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="form-notice">No matches in the dictionary.</p>
        ))}

      {words.length === 0 ? (
        <div className="card" style={{ marginTop: 12 }}>
          <p style={{ margin: '0 0 12px' }}>
            Save words by tapping them while you read, or search the dictionary above.
          </p>
          <Link className="btn btn--accent" to="/reading">
            Open the library
          </Link>
        </div>
      ) : (
        <>
          <LexGroup
            title="Still Learning"
            count={learning.length}
            color="var(--accent)"
            empty="Nothing in rotation — save words while you read."
          >
            {learning.map(wordRow)}
          </LexGroup>
          <LexGroup
            title="Learnt"
            count={learnt.length}
            color="var(--level-a1)"
            empty={`Words move here after ${LEARNT_STREAK} correct answers in a row.`}
          >
            {learnt.map(wordRow)}
          </LexGroup>
        </>
      )}
    </>
  );
}
