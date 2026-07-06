/**
 * Pronunciation. Online, words are spoken by Google Translate's French voice
 * (natural, female) via its free TTS endpoint — the local Web Speech voices
 * sound robotic on most devices. Offline (or if the endpoint fails) we fall
 * back to speechSynthesis, preferring the most natural female fr-FR voice
 * installed on the device.
 *
 * iOS Home-Screen (standalone PWA) note: WebKit only lets a media element play
 * audio that loads *after* the tap once the element has been unlocked inside a
 * genuine user gesture. A fresh `new Audio(url)` per word is tolerated in
 * Safari but blocked in standalone mode — so we keep ONE reusable element,
 * prime it on real gestures (a silent clip, just like sound.ts primes the
 * AudioContext), and swap its `src` for every word.
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

function getPlayer(): HTMLAudioElement | null {
  if (typeof Audio === 'undefined') return null;
  if (!player) {
    player = new Audio();
    player.preload = 'auto';
    // Keep iOS from promoting playback into its fullscreen media UI. NOTE: we
    // deliberately do NOT set crossOrigin — Google's endpoint sends no CORS
    // headers, and a plain <audio> element may load cross-origin media anyway.
    player.setAttribute('playsinline', '');
  }
  return player;
}

/** Prime the reusable element on a real gesture so later remote playback is
    allowed. The clip is silent, so playing it unmuted makes no sound but opens
    the audio session. Idempotent — once opened, iOS keeps the element unlocked. */
function unlockPlayback(): void {
  const el = getPlayer();
  if (!el || unlocked) return;
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
  el.src = `https://translate.google.com/translate_tts?ie=UTF-8&tl=fr-FR&client=tw-ob&q=${encodeURIComponent(
    text,
  )}`;
  let fellBack = false;
  const fallBack = () => {
    if (fellBack) return;
    fellBack = true;
    speakWithSynthesis(text);
  };
  el.onerror = fallBack;
  el.play().catch(fallBack);
}
