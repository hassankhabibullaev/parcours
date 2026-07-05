/**
 * App-wide sound effects — synthesized with the Web Audio API (no assets,
 * works offline), fail-soft everywhere. Layout delegates one click sound to
 * every button/link (uiClick) and word look-up (wordTap); the drills add the
 * typing, success and error sounds. The on/off preference is a device-local
 * UI setting, so it lives in localStorage rather than the synced Dexie store.
 * The key predates the app-wide adoption; it stays so the preference survives.
 */

const STORAGE_KEY = 'conjugation-sfx';

let ctx: AudioContext | null = null;
let out: GainNode | null = null;

let enabled = true;
try {
  enabled = localStorage.getItem(STORAGE_KEY) !== 'off';
} catch {
  /* storage unavailable (private mode) — keep the default */
}

export function sfxEnabled(): boolean {
  return enabled;
}

export function setSfxEnabled(on: boolean): void {
  enabled = on;
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off');
  } catch {
    /* ignore */
  }
  // The toggle itself is a user gesture — the right moment to unlock audio.
  if (on) unlock();
}

function ensure(): AudioContext | null {
  if (!enabled) return null;
  if (ctx && ctx.state === 'closed') {
    ctx = null;
    out = null;
    unlockBufferPlayed = false;
  }
  if (!ctx) {
    const AC =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    out = ctx.createGain();
    out.gain.value = 0.8;
    out.connect(ctx.destination);
  }
  // Anything but running needs a resume — iOS also parks the context in a
  // non-standard « interrupted » state when the (home-screen) app is
  // backgrounded or the screen locks.
  if (ctx.state !== 'running') void ctx.resume();
  return ctx;
}

/*
 * iOS unlock. WebKit only lets an AudioContext start when resume() runs
 * inside a genuine user gesture, and a home-screen launch always begins with
 * a locked audio session — but the first sound here is often the typewriter
 * reveal, fired from a timer, not a gesture. So every tap (re)unlocks the
 * context; the listeners stay attached because an interruption (background,
 * screen lock) re-suspends it. The one-sample buffer on first unlock fully
 * opens the session on older WebKit, which needs a source started in-gesture.
 */
let unlockBufferPlayed = false;

function unlock(): void {
  if (!enabled) return;
  const c = ensure();
  if (!c || unlockBufferPlayed) return;
  try {
    const src = c.createBufferSource();
    src.buffer = c.createBuffer(1, 1, c.sampleRate);
    src.connect(c.destination);
    src.start(0);
    unlockBufferPlayed = true;
  } catch {
    /* fail-soft like every other sound */
  }
}

for (const type of ['pointerdown', 'touchend', 'click'] as const) {
  window.addEventListener(type, unlock, { capture: true, passive: true });
}
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && ctx && ctx.state !== 'running') void ctx.resume();
});

const midi = (n: number): number => 440 * 2 ** ((n - 69) / 12);

/** Soft UI tick — the one click sound for every button and link in the app.
    (Word tokens get wordTap; accent keys and match tiles keep their own.) */
export function uiClick(): void {
  const c = ensure();
  if (!c || !out) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(1350, t);
  o.frequency.exponentialRampToValueAtTime(950, t + 0.035);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.16, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + 0.08);
}

/** Muted paper tap — every word look-up (article tokens, phrase selections). */
export function wordTap(): void {
  const c = ensure();
  if (!c || !out) return;
  const t = c.currentTime;
  const o = c.createOscillator();
  o.type = 'triangle';
  o.frequency.setValueAtTime(620, t);
  o.frequency.exponentialRampToValueAtTime(430, t + 0.05);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.15, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.09);
  o.connect(g);
  g.connect(out);
  o.start(t);
  o.stop(t + 0.1);
}

/** Typewriter clack — a short burst of band-passed noise. */
export function keyClick(): void {
  const c = ensure();
  if (!c || !out) return;
  const t = c.currentTime;
  const len = Math.floor(c.sampleRate * 0.04);
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.exp(-i / (len * 0.25));
  const src = c.createBufferSource();
  src.buffer = buf;
  const bp = c.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 1700 + Math.random() * 900;
  bp.Q.value = 4;
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.002);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.055);
  src.connect(bp);
  bp.connect(g);
  g.connect(out);
  src.start(t);
  src.stop(t + 0.06);
}

/** Bright ascending bell arpeggio — every blank in the exercise landed. */
export function successChime(): void {
  const c = ensure();
  if (!c || !out) return;
  const t = c.currentTime;
  [72, 76, 79, 84].forEach((n, i) => {
    if (!out) return;
    const at = t + i * 0.06;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = midi(n);
    const h = c.createOscillator();
    h.type = 'triangle';
    h.frequency.value = midi(n) * 2;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.22, at + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.5);
    o.connect(g);
    h.connect(g);
    g.connect(out);
    o.start(at);
    h.start(at);
    o.stop(at + 0.55);
    h.stop(at + 0.55);
  });
}

/** Small rising two-note blip — one matched pair (quieter than the chime). */
export function matchDing(): void {
  const c = ensure();
  if (!c || !out) return;
  const t = c.currentTime;
  [79, 84].forEach((n, i) => {
    if (!out) return;
    const at = t + i * 0.05;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = midi(n);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.14, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.18);
    o.connect(g);
    g.connect(out);
    o.start(at);
    o.stop(at + 0.2);
  });
}

/** Low falling buzz — the editor's red pen. */
export function errorBuzz(): void {
  const c = ensure();
  if (!c || !out) return;
  const t = c.currentTime;
  [220, 165].forEach((f) => {
    if (!out) return;
    const o = c.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(f, t);
    o.frequency.exponentialRampToValueAtTime(f * 0.6, t + 0.26);
    const lp = c.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 900;
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
    o.connect(lp);
    lp.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + 0.32);
  });
}

/** Completion flourish — an ascending run into a held major chord. */
export function fanfare(): void {
  const c = ensure();
  if (!c || !out) return;
  const t = c.currentTime;
  [60, 64, 67, 72, 76].forEach((n, i) => {
    if (!out) return;
    const at = t + i * 0.11;
    const o = c.createOscillator();
    o.type = 'triangle';
    o.frequency.value = midi(n);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.2, at + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.4);
    o.connect(g);
    g.connect(out);
    o.start(at);
    o.stop(at + 0.45);
  });
  const at = t + 5 * 0.11;
  [72, 76, 79, 84].forEach((n) => {
    if (!out) return;
    const o = c.createOscillator();
    o.type = 'sine';
    o.frequency.value = midi(n);
    const h = c.createOscillator();
    h.type = 'triangle';
    h.frequency.value = midi(n);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(0.16, at + 0.03);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 1.3);
    o.connect(g);
    h.connect(g);
    g.connect(out);
    o.start(at);
    h.start(at);
    o.stop(at + 1.4);
    h.stop(at + 1.4);
  });
}
