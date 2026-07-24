/**
 * Pronunciation. Online, words are spoken by Google Translate's French voice
 * (natural, female), fetched through our OWN same-origin proxy (`/api/tts`, a
 * Pages Function) — Google refuses a direct cross-origin request.
 *
 * The clip is decoded and played through the app's shared Web Audio
 * AudioContext (see sound.ts), NOT an <audio>/<video> element. That is the fix
 * for two iOS problems at once:
 *   1. A media element that plays audible sound registers a Now Playing session,
 *      which hijacks the phone's media controls and pops the Dynamic Island.
 *      Web Audio makes no such session, so pronunciation stays silent to the OS.
 *   2. The AudioContext already has robust iOS handling — a gesture-based unlock
 *      and a foreground/route-change resume — so playback no longer dies after
 *      the app is backgrounded (which used to need a full restart to recover).
 * Once the context is unlocked, a buffer can start from any async callback, so
 * fetch-then-decode-then-play works even for auto-pronounced words (no gesture).
 *
 * Offline (or if the proxy fails, e.g. `npm run dev` where Pages Functions don't
 * run) we fall back to speechSynthesis, preferring the most natural female fr-FR
 * voice on the device. Voices are warmed at load so the first utterance isn't the
 * robotic default, and speechSynthesis is primed on a real gesture so even a rare
 * async fallback can still speak on iOS.
 */

import { getAudioContext } from './sound';

/** Known natural-sounding female French voices, best first. */
const VOICE_PREFERENCE = [
  'amélie',
  'amelie',
  'audrey',
  'aurélie',
  'aurelie',
  'denise',
  'eloise',
  'vivienne',
  'marie',
  'céline',
  'celine',
  'hortense',
  'julie',
  'charlotte',
  'google français',
  'google french',
];

function pickFrenchVoice(): SpeechSynthesisVoice | null {
  const french = speechSynthesis.getVoices().filter((v) => v.lang.startsWith('fr'));
  if (french.length === 0) return null;
  const score = (v: SpeechSynthesisVoice) => {
    const name = v.name.toLowerCase();
    let s = 0;
    if (v.lang === 'fr-FR') s += 4;
    const rank = VOICE_PREFERENCE.findIndex((hint) => name.includes(hint));
    if (rank >= 0) s += 100 - rank;
    if (/enhanced|premium|natural|neural/.test(name)) s += 20;
    return s;
  };
  return [...french].sort((a, b) => score(b) - score(a))[0];
}

export function canSpeak(): boolean {
  const hasWebAudio =
    typeof window !== 'undefined' &&
    ('AudioContext' in window || 'webkitAudioContext' in window);
  return hasWebAudio || 'speechSynthesis' in window;
}

// Warm the voice list. getVoices() is empty until the engine loads the voices,
// which is why the very first fallback utterance used the robotic default —
// nudging it here (and again on `voiceschanged`) means pickFrenchVoice() has a
// populated list to choose from by the time anyone taps.
if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
  const warm = () => void speechSynthesis.getVoices();
  warm();
  speechSynthesis.addEventListener?.('voiceschanged', warm);
}

function speakWithSynthesis(text: string) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'fr-FR';
  const voice = pickFrenchVoice();
  if (voice) utterance.voice = voice;
  utterance.rate = 0.9;
  speechSynthesis.speak(utterance);
}

/* ——— iOS-safe playback of the online (Google) voice via Web Audio ——— */

let ttsPrimed = false;

/** Prime speechSynthesis inside a real gesture: a volume-0 utterance is
    inaudible but opens the speech session, so a later async fallback (a proxy
    error mid-session) can still speak on iOS instead of failing silently. The
    AudioContext itself is unlocked by sound.ts's own gesture listeners. */
function primeSynthesis(): void {
  if (ttsPrimed || !('speechSynthesis' in window)) return;
  ttsPrimed = true;
  try {
    const u = new SpeechSynthesisUtterance(' ');
    u.volume = 0;
    speechSynthesis.speak(u);
  } catch {
    ttsPrimed = false;
  }
}

if (typeof window !== 'undefined') {
  for (const type of ['pointerdown', 'touchend', 'click'] as const) {
    window.addEventListener(type, primeSynthesis, { capture: true, passive: true });
  }
}

// The clip currently playing, so a rapid second tap can cut it off cleanly.
let current: AudioBufferSourceNode | null = null;
// Decoded clips are tiny and words repeat; keep them so re-taps are instant.
const clipCache = new Map<string, AudioBuffer>();

export function speakFrench(text: string) {
  const ctx = getAudioContext();
  // Offline, or no Web Audio: speak with the device voice synchronously so a
  // speaker-button tap still voices inside its gesture.
  if (!navigator.onLine || !ctx) {
    speakWithSynthesis(text);
    return;
  }
  void playThroughWebAudio(text, ctx);
}

async function playThroughWebAudio(text: string, ctx: AudioContext): Promise<void> {
  try {
    let buffer = clipCache.get(text);
    if (!buffer) {
      // Same-origin proxy (functions/api/tts.ts) — a direct Google URL is what
      // WebKit refuses. In `npm run dev` the Pages Function isn't served, so this
      // 404s/errors and we fall back to the device voice below.
      const res = await fetch(`/api/tts?tl=fr-FR&q=${encodeURIComponent(text)}`);
      if (!res.ok) throw new Error(`tts ${res.status}`);
      const data = await res.arrayBuffer();
      // Re-grab the context: sound.ts may have swapped in a fresh one while
      // the clip downloaded (audio-session recovery after an interruption).
      buffer = await (getAudioContext() ?? ctx).decodeAudioData(data);
      // AudioBuffers are plain PCM, safe to reuse across rebuilt contexts.
      clipCache.set(text, buffer);
    }
    // Play through the CURRENT context, not the one captured before the async
    // work — after an interruption the old reference renders only silence.
    const live = getAudioContext() ?? ctx;
    if (live.state !== 'running') {
      // iOS parks the context « interrupted » on background; make sure it's
      // live. On a dead session resume() can hang forever, so don't wait on
      // it — if the context still isn't running, throw to the device voice
      // rather than queueing a start() nobody will hear.
      await Promise.race([live.resume(), new Promise((r) => setTimeout(r, 700))]);
      // Re-read (widened): resume() mutates state behind TS's narrowing.
      if ((live.state as AudioContextState) !== 'running')
        throw new Error('audio session unavailable');
    }
    // Cut off any clip still playing (rapid re-taps). Guarded: stopping an
    // already-finished source must not fall through to the synthesis fallback.
    try {
      current?.stop();
    } catch {
      /* already stopped */
    }
    const src = live.createBufferSource();
    src.buffer = buffer;
    src.connect(live.destination);
    src.onended = () => {
      if (current === src) current = null;
    };
    current = src;
    src.start();
  } catch {
    // Proxy unreachable / decode failed / dead session — device voice instead.
    speakWithSynthesis(text);
  }
}
