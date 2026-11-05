import { OUTFITS } from '../game/data';
import type { Worker, Candidate } from '../game/types';

const hex = (n: number): string => `#${n.toString(16).padStart(6, '0')}`;

const cache = new Map<string, HTMLCanvasElement>();

/** Draw a stylised head-and-shoulders portrait on a canvas. Deterministic per worker seed. */
export function portrait(w: Pick<Worker | Candidate, 'seed' | 'outfit' | 'name'>, size = 64): HTMLCanvasElement {
  const key = `${w.seed}-${w.outfit}-${size}`;
  const hit = cache.get(key);
  if (hit) return copy(hit);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const c = document.createElement('canvas');
  c.width = size * dpr;
  c.height = size * dpr;
  const g = c.getContext('2d')!;
  g.scale(dpr, dpr);
  const [top, , accent, skin, hair] = OUTFITS[w.outfit % OUTFITS.length];
  const s = w.seed;
  const r = (n: number) => ((s >>> (n % 28)) & 15) / 15; // 0..1 pseudo-random per feature

  // Background: room-light gradient.
  const bg = g.createLinearGradient(0, 0, size, size);
  bg.addColorStop(0, '#1e1729');
  bg.addColorStop(1, '#2a1830');
  g.fillStyle = bg;
  g.fillRect(0, 0, size, size);
  // Rim light.
  const rim = g.createRadialGradient(size * 0.8, size * 0.1, 2, size * 0.8, size * 0.1, size * 0.9);
  rim.addColorStop(0, hex(accent) + 'aa');
  rim.addColorStop(1, 'transparent');
  g.fillStyle = rim;
  g.fillRect(0, 0, size, size);

  const cx = size / 2;
  // Shoulders / top.
  g.fillStyle = hex(top);
  g.beginPath();
  g.moveTo(cx - size * 0.42, size);
  g.quadraticCurveTo(cx - size * 0.4, size * 0.68, cx, size * 0.66);
  g.quadraticCurveTo(cx + size * 0.4, size * 0.68, cx + size * 0.42, size);
  g.closePath();
  g.fill();
  // Collar highlight.
  g.fillStyle = 'rgba(255,244,236,0.12)';
  g.beginPath();
  g.ellipse(cx, size * 0.72, size * 0.12, size * 0.05, 0, 0, Math.PI * 2);
  g.fill();

  // Neck.
  g.fillStyle = shade(skin, -0.12);
  g.fillRect(cx - size * 0.08, size * 0.52, size * 0.16, size * 0.18);

  // Head.
  const headW = size * (0.26 + r(3) * 0.05);
  const headH = size * (0.32 + r(5) * 0.04);
  const hy = size * 0.4;
  g.fillStyle = hex(skin);
  g.beginPath();
  g.ellipse(cx, hy, headW, headH, 0, 0, Math.PI * 2);
  g.fill();
  // Cheek light from the left (room light).
  const face = g.createRadialGradient(cx - headW * 0.5, hy - headH * 0.3, 2, cx, hy, headW * 1.6);
  face.addColorStop(0, 'rgba(255,244,236,0.22)');
  face.addColorStop(1, 'rgba(0,0,0,0.18)');
  g.fillStyle = face;
  g.beginPath();
  g.ellipse(cx, hy, headW, headH, 0, 0, Math.PI * 2);
  g.fill();

  // Hair.
  g.fillStyle = hex(hair);
  const style = Math.floor(r(9) * 4);
  g.beginPath();
  if (style === 0) {
    g.ellipse(cx, hy - headH * 0.55, headW * 1.05, headH * 0.55, 0, Math.PI, Math.PI * 2);
  } else if (style === 1) {
    g.ellipse(cx, hy - headH * 0.35, headW * 1.12, headH * 0.75, 0, Math.PI * 0.95, Math.PI * 2.05);
    g.rect(cx - headW * 1.1, hy - headH * 0.4, headW * 0.3, headH * 0.9);
    g.rect(cx + headW * 0.8, hy - headH * 0.4, headW * 0.3, headH * 0.9);
  } else if (style === 2) {
    g.ellipse(cx, hy - headH * 0.7, headW * 0.95, headH * 0.5, 0, 0, Math.PI * 2);
  } else {
    g.ellipse(cx, hy - headH * 0.5, headW * 1.08, headH * 0.6, 0, Math.PI, Math.PI * 2);
    g.rect(cx - headW * 1.08, hy - headH * 0.5, headW * 2.16, headH * 0.35);
  }
  g.fill();

  // Eyes.
  const ey = hy - headH * 0.05;
  const ex = headW * 0.42;
  g.fillStyle = '#fff4ec';
  g.beginPath();
  g.ellipse(cx - ex, ey, headW * 0.17, headH * 0.1, 0, 0, Math.PI * 2);
  g.ellipse(cx + ex, ey, headW * 0.17, headH * 0.1, 0, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#1a1016';
  g.beginPath();
  g.arc(cx - ex + 1, ey, headW * 0.09, 0, Math.PI * 2);
  g.arc(cx + ex + 1, ey, headW * 0.09, 0, Math.PI * 2);
  g.fill();
  // Brows.
  g.strokeStyle = hex(hair);
  g.lineWidth = Math.max(1, size * 0.02);
  g.lineCap = 'round';
  g.beginPath();
  g.moveTo(cx - ex - headW * 0.18, ey - headH * 0.22);
  g.lineTo(cx - ex + headW * 0.18, ey - headH * 0.26);
  g.moveTo(cx + ex - headW * 0.18, ey - headH * 0.26);
  g.lineTo(cx + ex + headW * 0.18, ey - headH * 0.22);
  g.stroke();
  // Nose and mouth.
  g.strokeStyle = shade(skin, -0.3);
  g.beginPath();
  g.moveTo(cx, ey + headH * 0.1);
  g.lineTo(cx - headW * 0.08, ey + headH * 0.32);
  g.stroke();
  g.strokeStyle = shade(skin, -0.45);
  g.lineWidth = Math.max(1, size * 0.025);
  g.beginPath();
  g.moveTo(cx - headW * 0.25, ey + headH * 0.52);
  g.quadraticCurveTo(cx, ey + headH * (0.6 + r(13) * 0.12), cx + headW * 0.25, ey + headH * 0.52);
  g.stroke();

  // Accent: earring / glasses for some.
  if (r(17) > 0.6) {
    g.strokeStyle = hex(accent);
    g.lineWidth = Math.max(1, size * 0.02);
    g.beginPath();
    g.ellipse(cx - ex, ey, headW * 0.24, headH * 0.16, 0, 0, Math.PI * 2);
    g.ellipse(cx + ex, ey, headW * 0.24, headH * 0.16, 0, 0, Math.PI * 2);
    g.moveTo(cx - ex + headW * 0.24, ey);
    g.lineTo(cx + ex - headW * 0.24, ey);
    g.stroke();
  }
  cache.set(key, c);
  return copy(c);
}

/** cloneNode() does not copy a canvas bitmap, so draw it onto a fresh canvas. */
function copy(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}

function shade(color: number, amt: number): string {
  const r = (color >> 16) & 255;
  const g = (color >> 8) & 255;
  const b = color & 255;
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v + 255 * amt)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}
