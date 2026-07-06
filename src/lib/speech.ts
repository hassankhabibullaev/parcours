/**
 * Pronunciation. Online, words are spoken by Google Translate's French voice
 * (natural, female) — but fetched through our OWN same-origin proxy
 * (`/api/tts`, a Pages Function), NOT the endpoint directly. That indirection is
 * the whole fix for iOS: WebKit refuses cross-origin TTS media in Safari and the
 * Home-Screen PWA, so the direct request errored and the app fell silent. Worse,
 * the old fallback to speechSynthesis ran inside that async error handler —
 * outside the tap gesture — which iOS also blocks, so nothing spoke at all.
 * Same-origin audio plays from the unlocked element with no CORS/referrer dance.
 *
 * Offline (or if the proxy fails) we fall back to speechSynthesis, preferring the
 * most natural female fr-FR voice installed on the device. The offline branch is
 * taken synchronously inside the click, so iOS still speaks. Voices are warmed at
 * load so the first utterance isn't the robotic default, and speechSynthesis is
 * primed on real gestures too, so even a rare async fallback can still speak.
 *
 * iOS unlock: WebKit only lets a media element play audio that loads *after* the
 * tap once the element has been primed inside a genuine user gesture. So we keep
 * ONE reusable element, prime it on real gestures (a silent clip, just like
 * sound.ts primes the AudioContext), and swap its `src` for every word.
 */

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
  return 'speechSynthesis' in window || typeof Audio !== 'undefined';
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

/* ——— iOS-safe playback of the online (Google) voice ——— */

/** A 200-sample silent WAV — priming the reusable element with this inside a
    real gesture is what opens the audio session on iOS standalone. */
const SILENT_WAV =
  'data:audio/wav;base64,UklGRuwAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YcgAAACAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgA==';

let player: HTMLAudioElement | null = null;
let unlocked = false;
let ttsPrimed = false;

function getPlayer(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (!player) {
    player = new Audio();
    player.preload = 'auto';
    // Keep iOS from promoting playback into its fullscreen media UI. The proxy
    // is same-origin, so no crossOrigin dance is needed.
    player.setAttribute('playsinline', '');
  }
  return player;
}

/** Prime the reusable element on a real gesture so later remote playback is
    allowed. The clip is silent, so playing it unmuted makes no sound but opens
    the audio session. Idempotent — once opened, iOS keeps the element unlocked. */
function unlockPlayback(): void {
  const el = getPlayer();
  if (el && !unlocked) {
    unlocked = true;
    try {
      el.src = SILENT_WAV;
      el.play().catch((err: DOMException) => {
        // A real pronunciation swaps src and aborts this silent play — fine, the
        // gesture already opened the session. Only a genuine block warrants retry.
        if (err?.name !== 'AbortError') unlocked = false;
      });
    } catch {
      unlocked = false;
    }
  }
  // Prime speechSynthesis inside the gesture too. A volume-0 utterance is
  // inaudible but opens the speech session, so a later async fallback (proxy
  // error mid-session) can still speak on iOS instead of failing silently.
  if (!ttsPrimed && 'speechSynthesis' in window) {
    ttsPrimed = true;
    try {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      speechSynthesis.speak(u);
    } catch {
      ttsPrimed = false;
    }
  }
}

if (typeof window !== 'undefined') {
  for (const type of ['pointerdown', 'touchend', 'click'] as const) {
    window.addEventListener(type, unlockPlayback, { capture: true, passive: true });
  }
}

export function speakFrench(text: string) {
  const el = getPlayer();
  if (!navigator.onLine || !el) {
    speakWithSynthesis(text);
    return;
  }
  el.pause();
  // Same-origin proxy (functions/api/tts.ts) — a direct Google URL here is what
  // WebKit refused. In dev the Pages Function isn't served, so the element errors
  // and we fall back to speechSynthesis below.
  el.src = `/api/tts?tl=fr-FR&q=${encodeURIComponent(text)}`;
  let fellBack = false;
  const fallBack = () => {
    if (fellBack) return;
    fellBack = true;
    speakWithSynthesis(text);
  };
  el.onerror = fallBack;
  el.play().catch(fallBack);
}
