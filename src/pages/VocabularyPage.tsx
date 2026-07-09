import { useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, deleteSavedWord, type SavedWord } from '../lib/db';
import { lookup } from '../lib/dictionary';
import { searchDictionary } from '../lib/dictionarySearch';
import { saveWord } from '../lib/vocab';
import { confirmTock } from '../lib/sound';
import { canSpeak, speakFrench } from '../lib/speech';
import { LEARNT_STREAK } from '../lib/practice';
import {
  CheckCircleIcon,
  CheckIcon,
  CloseIcon,
  EditIcon,
  PlusIcon,
  SpeakerIcon,
  TrashIcon,
  UndoIcon,
} from '../components/icons';

type Tab = 'learning' | 'learned';

export default function VocabularyPage() {
  const words = useLiveQuery(() => db.savedWords.orderBy('addedAt').reverse().toArray(), []);

  const [query, setQuery] = useState('');
  const [addingLemma, setAddingLemma] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>('learning');

  // Inline editing of a word's first-line translation. `editingRef` mirrors
  // `editingId` synchronously so a blur fired by unmount can't double-commit
  // (or resurrect a just-cancelled edit).
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const editingRef = useRef<string | null>(null);

  if (!words) return null;

  const learning = words.filter((w) => !w.learned);
  const learnt = words.filter((w) => w.learned);
  const savedLemmas = new Set(words.map((w) => w.lemma));

  const trimmed = query.trim();
  const results = trimmed ? searchDictionary(trimmed) : [];

  const shown = tab === 'learning' ? learning : learnt;

  async function addFromDictionary(lemma: string) {
    if (addingLemma) return;
    setAddingLemma(lemma);
    try {
      // Translation is fetched online (fail-soft — the word is saved either way).
      const { translation, definition } = await lookup(lemma);
      await saveWord({ lemma, display: lemma, translation, definition, sentence: '', articleId: null });
      confirmTock();
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
    return (
      <div key={w.id} className={`word-row${w.learned ? ' word-row--learned' : ''}`}>
        <div className="word-row__main">
          <span className="word-row__word">{w.lemma}</span>
          {editing ? (
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
          ) : (
            <span className="word-row__translation">{w.translation || '—'}</span>
          )}
        </div>
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

  return (
    <>
      <h2 className="page-heading">Vocabulary</h2>
      <p className="page-subheading">
        Your growing word collection — tap words as you read, or search below.
      </p>

      <input
        className="text-input lexicon-search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the dictionary to add a word…"
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
          <div className="seg-tabs" role="tablist" aria-label="Lexicon">
            <button
              role="tab"
              aria-selected={tab === 'learning'}
              className={`seg-tab${tab === 'learning' ? ' seg-tab--active' : ''}`}
              onClick={() => setTab('learning')}
            >
              Learning <span className="seg-tab__count">{learning.length}</span>
            </button>
            <button
              role="tab"
              aria-selected={tab === 'learned'}
              className={`seg-tab${tab === 'learned' ? ' seg-tab--active' : ''}`}
              onClick={() => setTab('learned')}
            >
              Learned <span className="seg-tab__count">{learnt.length}</span>
            </button>
          </div>

          {shown.length > 0 ? (
            shown.map(wordRow)
          ) : (
            <p className="lex-group__empty">
              {tab === 'learning'
                ? 'Nothing in rotation — save words while you read.'
                : `Words move here after ${LEARNT_STREAK} correct answers in a row.`}
            </p>
          )}
        </>
      )}
    </>
  );
}
