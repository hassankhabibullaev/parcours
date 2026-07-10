import { useEffect, useState } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, type SavedWord } from '../lib/db';
import { lookup, type LookupResult } from '../lib/dictionary';
import { canSpeak, speakFrench } from '../lib/speech';
import { useAutoSpeak } from '../lib/useAutoSpeak';
import { lookupSpeechEnabled } from '../lib/settings';
import { errorBuzz, confirmTock } from '../lib/sound';
import { saveWord } from '../lib/vocab';
import { useAuthGate } from './AuthGate';
import { SpeakerIcon } from './icons';

export interface LookupRequest {
  /** What the learner tapped or selected, as it appeared. */
  display: string;
  /** What to look up and save: the lemma for words, the phrase itself otherwise. */
  term: string;
  sentence: string;
  articleId: number | null;
}

interface WordModalProps {
  request: LookupRequest;
  /**
   * The already-saved record when opened from the vocabulary list: its stored
   * translation/definition/sentence are shown as-is (no online lookup) and
   * the save action is omitted — the word is in the lexicon already.
   */
  saved?: SavedWord;
  onClose: () => void;
}

export default function WordModal({ request, saved, onClose }: WordModalProps) {
  const { display, term, sentence, articleId } = request;
  const { requireAuth } = useAuthGate();

  const [result, setResult] = useState<LookupResult | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    // A saved word already carries its content — no network round-trip.
    if (saved) {
      setResult({ term, translation: saved.translation, definition: saved.definition });
      setFailed(false);
      return;
    }
    let cancelled = false;
    setResult(null);
    setFailed(false);
    lookup(term).then((r) => {
      if (cancelled) return;
      setResult(r);
      if (!r.translation && !r.definition) {
        setFailed(true);
        errorBuzz();
      }
    });
    return () => {
      cancelled = true;
    };
  }, [term, saved]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Pronounce the term automatically when the modal opens (and again for each
  // newly tapped word, since this instance is reused). The tap that opened the
  // modal has already primed the audio element, so playback is allowed on iOS.
  // The learner can turn this off in Profile → Settings.
  useAutoSpeak(term, lookupSpeechEnabled());

  const alreadySaved = useLiveQuery(
    () => db.savedWords.where('lemma').equals(term).first(),
    [term],
  );

  // Secondary glosses: the stored definition lines, POS tags stripped,
  // minus whatever already serves as the main translation.
  const translation = result?.translation ?? '';
  const additional = [
    ...new Set(
      (result?.definition ?? '')
        .split('\n')
        .map((line) => line.replace(/^\([^)]*\)\s*/, '').trim())
        .filter((line) => line && line.toLowerCase() !== translation.toLowerCase()),
    ),
  ];

  async function handleSave() {
    if (!result) return;
    // Saving builds a personal vocabulary — guests are prompted to sign in. Close
    // this lookup first so the sign-in prompt isn't stacked on top of it.
    if (!requireAuth('vocab')) {
      onClose();
      return;
    }
    await saveWord({
      lemma: term,
      display,
      translation: result.translation,
      definition: result.definition,
      sentence,
      articleId,
    });
    confirmTock();
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Dictionary: ${term}`}
        onClick={(e) => e.stopPropagation()}
      >
        <button className="modal__close" onClick={onClose} aria-label="Close">
          ×
        </button>

        <div className="modal__term">
          {term}
          {canSpeak() && (
            <button
              className="modal__speak"
              onClick={() => speakFrench(term)}
              aria-label="Pronounce"
            >
              <SpeakerIcon />
            </button>
          )}
        </div>

        {result === null ? (
          /* Skeleton while the dictionary is fetching — mirrors the real layout. */
          <div aria-hidden="true">
            <div className="skeleton skeleton--gloss" />
            <div className="modal__extra">
              <div className="skeleton skeleton--line" style={{ width: '82%' }} />
              <div className="skeleton skeleton--line" style={{ width: '64%' }} />
            </div>
            {sentence && <div className="skeleton skeleton--sentence" />}
            <div className="modal__actions">
              <div className="skeleton skeleton--btn" />
            </div>
          </div>
        ) : (
          <>
            <div className="modal__translation">
              {failed ? 'Could not reach the dictionary.' : translation || '—'}
            </div>
            {additional.length > 0 && (
              <div className="modal__extra">
                {additional.map((gloss, i) => (
                  <div key={i}>{gloss}</div>
                ))}
              </div>
            )}
            {sentence && <blockquote className="modal__sentence">{sentence}</blockquote>}

            {/* Opened from the vocabulary list: the word is saved by definition —
                same layout, just no save action. */}
            {!saved && (
              <div className="modal__actions">
                {alreadySaved ? (
                  <span className="btn btn--ghost modal__saved">In your vocabulary ✓</span>
                ) : (
                  <button className="btn btn--primary" onClick={handleSave} disabled={failed}>
                    Add to Vocabulary
                  </button>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
