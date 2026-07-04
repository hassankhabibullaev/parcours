/**
 * Pronunciation. Online, words are spoken by Google Translate's French voice
 * (natural, female) via its free TTS endpoint — the local Web Speech voices
 * sound robotic on most devices. Offline (or if the endpoint fails) we fall
 * back to speechSynthesis, preferring the most natural female fr-FR voice
 * installed on the device.
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

let player: HTMLAudioElement | null = null;

export function speakFrench(text: string) {
  if (!navigator.onLine) {
    speakWithSynthesis(text);
    return;
  }
  player?.pause();
  const audio = new Audio(
    `https://translate.google.com/translate_tts?ie=UTF-8&tl=fr-FR&client=tw-ob&q=${encodeURIComponent(text)}`,
  );
  player = audio;
  let fellBack = false;
  const fallBack = () => {
    if (fellBack) return;
    fellBack = true;
    speakWithSynthesis(text);
  };
  audio.onerror = fallBack;
  audio.play().catch(fallBack);
}
