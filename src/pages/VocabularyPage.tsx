import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SavedWord } from '../lib/db';
import { lookup } from '../lib/dictionary';
import { searchDictionary } from '../lib/dictionarySearch';
import { deleteSavedWord } from '../lib/db';
import { canSpeak, speakFrench } from '../lib/speech';
import { LEARNT_STREAKS, blankStreakOf, matchStreakOf } from '../lib/practice';
import SectionTabs from '../components/SectionTabs';
import VocabDrills from '../components/VocabDrills';
import WordModal, { type LookupRequest } from '../components/WordModal';
import {
  CheckCircleIcon,
  CheckIcon,
  CloseIcon,
  EditIcon,
  SpeakerIcon,
  TrashIcon,
  UndoIcon,
} from '../components/icons';

type Tab = 'learn' | 'practice';
type Shelf = 'all' | 'learning' | 'learned';

interface ModalState {
  request: LookupRequest;
  saved?: SavedWord;
}

/**
 * Vocabulary — two tabs. Learn holds the dictionary search and the lexicon
 * (Learning/Learned as pill filters); Practice lists the three word drills.
 * The active tab lives in the URL (`?tab=practice`) so drill back links can
 * return here.
 */
export default function VocabularyPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get('tab') === 'practice' ? 'practice' : 'learn';

  return (
    <>
      <h2 className="page-heading">Vocabulary</h2>
      <SectionTabs<Tab>
        ariaLabel="Vocabulary"
        tabs={[
          { key: 'learn', label: 'Learn' },
          { key: 'practice', label: 'Practice' },
        ]}
        active={tab}
        onSelect={(t) => setParams(t === 'practice' ? { tab: 'practice' } : {}, { replace: true })}
      />
      {tab === 'learn' ? <LearnTab /> : <VocabDrills />}
    </>
  );
}

function LearnTab() {
  const words = useLiveQuery(() => db.savedWords.orderBy('addedAt').reverse().toArray(), []);

  const [query, setQuery] = useState('');
  const [shelf, setShelf] = useState<Shelf>('all');
  const [modal, setModal] = useState<ModalState | null>(null);

  // Inline editing of a word's first-line translation. `editingRef` mirrors
  // `editingId` synchronously so a blur fired by unmount can't double-commit
  // (or resurrect a just-cancelled edit).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const editingRef = useRef<string | null>(null);

  // Debounce the search so the per-result translation fetches don't fire on
  // every keystroke.
  const trimmed = query.trim();
  const [debounced, setDebounced] = useState('');
  useEffect(() => {
    const t = window.setTimeout(() => setDebounced(trimmed), 250);
    return () => window.clearTimeout(t);
  }, [trimmed]);

  const results = useMemo(() => (debounced ? searchDictionary(debounced) : []), [debounced]);

  // Short translations for search results, shown inline without any tap:
  // saved words and the drilled verbs have one locally; the rest are fetched
  // once (the lookup itself caches in IndexedDB).
  const [glosses, setGlosses] = useState<Record<string, string>>({});
  const requestedRef = useRef(new Set<string>());
  const savedByLemma = useMemo(
    () => new Map((words ?? []).map((w) => [w.lemma, w])),
    [words],
  );
  useEffect(() => {
    let cancelled = false;
    for (const r of results) {
      if (r.meaning || savedByLemma.has(r.lemma) || requestedRef.current.has(r.lemma)) continue;
      requestedRef.current.add(r.lemma);
      lookup(r.lemma).then((res) => {
        if (!cancelled) setGlosses((g) => ({ ...g, [r.lemma]: res.translation }));
      });
    }
    return () => {
      cancelled = true;
    };
  }, [results, savedByLemma]);

  if (!words) return null;

  const learning = words.filter((w) => !w.learned);
  const learnt = words.filter((w) => w.learned);
  const shown = shelf === 'learning' ? learning : shelf === 'learned' ? learnt : words;

  function openSavedWord(w: SavedWord) {
    setModal({
      request: { display: w.display || w.lemma, term: w.lemma, sentence: w.sentence, articleId: w.articleId },
      saved: w,
    });
  }

  function openSearchResult(lemma: string) {
    const saved = savedByLemma.get(lemma);
    setModal({
      request: { display: lemma, term: lemma, sentence: saved?.sentence ?? '', articleId: saved?.articleId ?? null },
      saved,
    });
  }

  function toggleLearned(w: SavedWord) {
    // Manual override of the automatic progression — align both exercise
    // streaks so the dots (and the next practice answer) agree with the shelf.
    db.savedWords.update(w.id, {
      learned: w.learned ? 0 : 1,
      matchStreak: w.learned ? 0 : LEARNT_STREAKS.match,
      blankStreak: w.learned ? 0 : LEARNT_STREAKS.blank,
      matchMissRun: 0,
      blankMissRun: 0,
      updatedAt: Date.now(),
    });
  }

  function remove(w: SavedWord) {
    if (window.confirm(`Remove “${w.lemma}” from your lexicon?`)) {
      deleteSavedWord(w.id);
    }
  }

  function startEdit(w: SavedWord) {
    editingRef.current = w.id;
    setEditingId(w.id);
    setDraft(w.translation ?? '');
  }

  /** Commit the drafted translation (only the first-line gloss is editable). */
  function commitEdit(w: SavedWord) {
    if (editingRef.current !== w.id) return; // already closed by cancel/save
    editingRef.current = null;
    const next = draft.trim();
    if (next !== (w.translation ?? '')) {
      db.savedWords.update(w.id, { translation: next, updatedAt: Date.now() });
    }
    setEditingId(null);
  }

  function cancelEdit() {
    editingRef.current = null;
    setEditingId(null);
  }

  function wordRow(w: SavedWord) {
    const editing = editingId === w.id;
    // One dot per required correct day, split by exercise:
    // 3 green for Word Match, 2 blue for Fill in the Blank.
    const matchOn = Math.min(matchStreakOf(w), LEARNT_STREAKS.match);
    const blankOn = Math.min(blankStreakOf(w), LEARNT_STREAKS.blank);
    return (
      <div key={w.id} className={`word-row${w.learned ? ' word-row--learned' : ''}`}>
        {editing ? (
          <div className="word-row__main">
            <span className="word-row__word">{w.lemma}</span>
            <input
              className="word-row__edit"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  commitEdit(w);
                } else if (e.key === 'Escape') {
                  e.preventDefault();
                  cancelEdit();
                }
              }}
              onBlur={() => commitEdit(w)}
              autoFocus
              placeholder="Translation"
              aria-label={`Edit translation of ${w.lemma}`}
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
            />
          </div>
        ) : (
          /* The word itself opens the same detail modal as in articles. */
          <button
            type="button"
            className="word-row__main word-row__main--tap"
            onClick={() => openSavedWord(w)}
            aria-label={`Open ${w.lemma}`}
          >
            <span className="word-row__word">{w.lemma}</span>
            <span className="word-row__translation">{w.translation || '—'}</span>
          </button>
        )}
        {editing ? (
          <div className="word-row__icons">
            {/* preventDefault keeps the input focused so its onClick (not the
                input's blur) decides the outcome — critical for Cancel. */}
            <button
              className="icon-btn icon-btn--learned"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => commitEdit(w)}
              aria-label="Save translation"
              title="Save"
            >
              <CheckIcon />
            </button>
            <button
              className="icon-btn"
              onMouseDown={(e) => e.preventDefault()}
              onClick={cancelEdit}
              aria-label="Cancel edit"
              title="Cancel"
            >
              <CloseIcon />
            </button>
          </div>
        ) : (
          <>
            {!w.learned && (
              <span
                className="word-dots"
                title={`Word Match ${matchOn}/${LEARNT_STREAKS.match} · Fill in the Blank ${blankOn}/${LEARNT_STREAKS.blank}`}
              >
                {Array.from({ length: LEARNT_STREAKS.match }, (_, i) => (
                  <span
                    key={`m${i}`}
                    className={`word-dot word-dot--match${i < matchOn ? ' word-dot--on' : ''}`}
                  />
                ))}
                {Array.from({ length: LEARNT_STREAKS.blank }, (_, i) => (
                  <span
                    key={`b${i}`}
                    className={`word-dot word-dot--blank${i < blankOn ? ' word-dot--on' : ''}`}
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
                className="icon-btn"
                onClick={() => startEdit(w)}
                aria-label={`Edit translation of ${w.lemma}`}
                title="Edit translation"
              >
                <EditIcon />
              </button>
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
          </>
        )}
      </div>
    );
  }

  const shelves: { key: Shelf; label: string; n: number }[] = [
    { key: 'all', label: 'All', n: words.length },
    { key: 'learning', label: 'Learning', n: learning.length },
    { key: 'learned', label: 'Learned', n: learnt.length },
  ];

  return (
    <>
      <input
        className="text-input lexicon-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Look up a word…"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        lang="fr"
      />

      {trimmed &&
        (results.length > 0 ? (
          <div className="dict-results">
            {results.map((r) => {
              const saved = savedByLemma.get(r.lemma);
              const gloss = saved?.translation || r.meaning || glosses[r.lemma];
              return (
                <button
                  type="button"
                  key={r.lemma}
                  className="dict-result"
                  onClick={() => openSearchResult(r.lemma)}
                >
                  <span className="dict-result__main">
                    <span className="dict-result__word">{r.lemma}</span>
                    <span className="dict-result__meaning">
                      {gloss ?? <span className="dict-result__loading">…</span>}
                    </span>
                  </span>
                  {saved && <span className="dict-result__added">Saved ✓</span>}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="form-notice">No matches in the dictionary.</p>
        ))}

      {words.length === 0 ? (
        <div className="card" style={{ marginTop: 12 }}>
          <p style={{ margin: '0 0 12px' }}>
            Save words by tapping them while you read, or look one up above.
          </p>
          <Link className="btn btn--accent" to="/reading">
            Open the library
          </Link>
        </div>
      ) : (
        <>
          <div className="level-counts" role="group" aria-label="Filter by shelf">
            {shelves.map((s) => (
              <button
                key={s.key}
                type="button"
                className={`level-count${shelf === s.key ? ' level-count--active' : ''}`}
                aria-pressed={shelf === s.key}
                onClick={() => setShelf(s.key)}
              >
                {s.label} <span className="level-count__n">{s.n}</span>
              </button>
            ))}
          </div>

          {shown.length > 0 ? (
            shown.map(wordRow)
          ) : (
            <p className="lex-group__empty">
              {shelf === 'learned'
                ? `Words land here after you get them right on ${LEARNT_STREAKS.match} separate days in Word Match or ${LEARNT_STREAKS.blank} in Fill in the Blank — or mark one learnt yourself.`
                : 'Nothing in rotation — save words while you read.'}
            </p>
          )}
        </>
      )}

      {modal && (
        <WordModal request={modal.request} saved={modal.saved} onClose={() => setModal(null)} />
      )}
    </>
  );
}
