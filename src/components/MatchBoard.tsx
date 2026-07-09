import { useRef, useState } from 'react';
import type { SavedWord } from '../lib/db';
import { shuffle } from '../lib/practice';
import { errorBuzz, keyClick, matchDing } from '../lib/sound';

interface Tile {
  id: string;
  text: string;
}

interface MatchBoardProps {
  /** The pairs on this board. The parent remounts (new key) per exercise. */
  words: SavedWord[];
  /** Fired on every wrong pair. */
  onMiss: () => void;
  /** Fired once when the board is cleared, with the ids missed on it. */
  onComplete: (missedIds: Set<string>) => void;
}

/**
 * One match-pairs board (French lemma ↔ translation). Game state lives in
 * refs (authoritative, immune to render timing — two taps can land faster
 * than a state commit); React state below only mirrors it for display.
 */
export default function MatchBoard({ words, onMiss, onComplete }: MatchBoardProps) {
  const [left] = useState<Tile[]>(() =>
    shuffle(words.map((w) => ({ id: w.id, text: w.lemma }))),
  );
  const [right] = useState<Tile[]>(() =>
    shuffle(words.map((w) => ({ id: w.id, text: w.translation }))),
  );

  const selLeftRef = useRef<string | null>(null);
  const selRightRef = useRef<string | null>(null);
  const matchedRef = useRef<Set<string>>(new Set());
  const missedIdsRef = useRef<Set<string>>(new Set());
  const lockRef = useRef(false);

  const [selLeft, setSelLeft] = useState<string | null>(null);
  const [selRight, setSelRight] = useState<string | null>(null);
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [wrongFlash, setWrongFlash] = useState<[string, string] | null>(null);

  function syncDisplay() {
    setSelLeft(selLeftRef.current);
    setSelRight(selRightRef.current);
    setMatched(new Set(matchedRef.current));
  }

  function judge() {
    const l = selLeftRef.current;
    const r = selRightRef.current;
    if (!l || !r) return;
    if (l === r) {
      matchDing();
      matchedRef.current.add(l);
      selLeftRef.current = null;
      selRightRef.current = null;
      syncDisplay();
      if (matchedRef.current.size === words.length) {
        lockRef.current = true;
        // A short beat so the last pair is seen fading before the next board.
        window.setTimeout(() => onComplete(missedIdsRef.current), 400);
      }
    } else {
      missedIdsRef.current.add(l);
      missedIdsRef.current.add(r);
      lockRef.current = true;
      errorBuzz();
      onMiss();
      setWrongFlash([l, r]);
      syncDisplay();
      window.setTimeout(() => {
        selLeftRef.current = null;
        selRightRef.current = null;
        lockRef.current = false;
        setWrongFlash(null);
        syncDisplay();
      }, 450);
    }
  }

  function pickLeft(id: string) {
    if (lockRef.current || matchedRef.current.has(id)) return;
    keyClick();
    selLeftRef.current = id;
    syncDisplay();
    judge();
  }

  function pickRight(id: string) {
    if (lockRef.current || matchedRef.current.has(id)) return;
    keyClick();
    selRightRef.current = id;
    syncDisplay();
    judge();
  }

  function tileClass(id: string, selected: boolean, flashId: string | undefined) {
    let cls = 'match-tile';
    if (matched.has(id)) cls += ' match-tile--matched';
    else if (flashId === id) cls += ' match-tile--wrong';
    else if (selected) cls += ' match-tile--selected';
    return cls;
  }

  return (
    // --rows drives the grid: both columns share the same row tracks, so a
    // translation that wraps to two lines grows its row on BOTH sides and the
    // two columns stay aligned (see .match-board in global.css).
    <div className="match-board" style={{ ['--rows' as string]: words.length }}>
      <div className="match-col">
        {left.map((t) => (
          <button
            key={t.id}
            className={tileClass(t.id, selLeft === t.id, wrongFlash?.[0])}
            onClick={() => pickLeft(t.id)}
          >
            {t.text}
          </button>
        ))}
      </div>
      <div className="match-col">
        {right.map((t) => (
          <button
            key={t.id}
            className={tileClass(t.id, selRight === t.id, wrongFlash?.[1])}
            onClick={() => pickRight(t.id)}
          >
            {t.text}
          </button>
        ))}
      </div>
    </div>
  );
}
