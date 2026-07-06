import { useEffect, useRef } from 'react';
import { canSpeak, speakFrench } from './speech';

/**
 * Speak `text` aloud once, a short beat after it settles on screen — used to
 * auto-pronounce a looked-up word, a drilled verb, or an article headline as
 * soon as it appears. Pass `ready = false` while a typewriter reveal is still
 * running so the voice waits for the finished word.
 *
 * Fires once per distinct `text` (and only while `ready`), so re-renders and
 * StrictMode's double-invoked effect can't double-speak; the pending timer is
 * cleared if `text` changes or the component unmounts before it fires.
 */
export function useAutoSpeak(
  text: string | null | undefined,
  ready = true,
  delayMs = 300,
): void {
  const spokenFor = useRef<string | null>(null);
  useEffect(() => {
    if (!ready || !text || !canSpeak()) return;
    if (spokenFor.current === text) return;
    const id = window.setTimeout(() => {
      spokenFor.current = text;
      speakFrench(text);
    }, delayMs);
    return () => window.clearTimeout(id);
  }, [text, ready, delayMs]);
}
