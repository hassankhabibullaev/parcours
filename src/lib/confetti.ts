/**
 * Full-screen confetti burst on a self-removing canvas — the conjugation
 * round-summary celebration. No dependencies; runs ~2.8s and cleans up.
 * Colors are the nine tense identities plus the editor's red.
 */

const COLORS = [
  '#5b9438',
  '#c89018',
  '#b02828',
  '#d86060',
  '#5d8fbe',
  '#23446e',
  '#a978c0',
  '#542670',
  '#b3362a',
];

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  size: number;
  rot: number;
  vr: number;
  color: string;
  rect: boolean;
}

export function confettiBurst(): void {
  if (typeof document === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;

  const canvas = document.createElement('canvas');
  canvas.style.cssText =
    'position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:999;';
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const W = window.innerWidth;
  const H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  document.body.appendChild(canvas);

  // Three cannons: centre plus the two lower corners angled inward.
  const cannons = [
    { x: W * 0.5, y: H * 0.3, spread: 14, vy: -13, vx: 0 },
    { x: W * 0.08, y: H * 0.95, spread: 10, vy: -17, vx: 6 },
    { x: W * 0.92, y: H * 0.95, spread: 10, vy: -17, vx: -6 },
  ];
  const parts: Particle[] = [];
  for (const cn of cannons) {
    for (let i = 0; i < 60; i++) {
      parts.push({
        x: cn.x,
        y: cn.y,
        vx: cn.vx + (Math.random() - 0.5) * cn.spread,
        vy: cn.vy - Math.random() * 6,
        g: 0.28 + Math.random() * 0.22,
        size: 5 + Math.random() * 7,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.35,
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
        rect: Math.random() < 0.5,
      });
    }
  }

  const FRAMES = 170;
  let frame = 0;
  function tick() {
    if (!ctx) return;
    ctx.clearRect(0, 0, W, H);
    const fade = frame > FRAMES * 0.6 ? Math.max(0, 1 - (frame - FRAMES * 0.6) / (FRAMES * 0.4)) : 1;
    for (const p of parts) {
      p.vy += p.g;
      p.vx *= 0.992;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.rect) ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.55);
      else {
        ctx.beginPath();
        ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
    frame += 1;
    if (frame < FRAMES) requestAnimationFrame(tick);
    else canvas.remove();
  }
  requestAnimationFrame(tick);
}
