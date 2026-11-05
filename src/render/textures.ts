import { Rectangle, Texture, type Container, type Renderer } from 'pixi.js';

/** Enforces a per-tier texture budget (in megapixels) for cached render textures. */
export class TextureBudget {
  used = 0;
  constructor(public readonly limitMP: number) {}
  /** Pick a resolution for a w×h cached texture that keeps us under budget. */
  resolutionFor(w: number, h: number, wanted: number): number {
    let res = wanted;
    while (res > 0.5) {
      const mp = (w * res * (h * res)) / 1e6;
      if (this.used + mp <= this.limitMP) {
        this.used += mp;
        return res;
      }
      res /= 2;
    }
    this.used += (w * h * 0.25) / 1e6;
    return 0.5;
  }
  release(w: number, h: number, res: number): void {
    this.used = Math.max(0, this.used - (w * res * (h * res)) / 1e6);
  }
}

export function bake(renderer: Renderer, budget: TextureBudget, target: Container, w: number, h: number, wanted: number): Texture {
  const resolution = budget.resolutionFor(w, h, wanted);
  return renderer.generateTexture({ target, resolution, antialias: false, frame: new Rectangle(0, 0, w, h) });
}

const canvasCache = new Map<string, Texture>();

/** Soft radial light texture (white, alpha falloff). Tint it to colour the light. */
export function radialTexture(size = 256, inner = 0.0, power = 1.6): Texture {
  const key = `radial-${size}-${inner}-${power}`;
  const hit = canvasCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(size / 2, size / 2, inner * size * 0.5, size / 2, size / 2, size / 2);
  for (let i = 0; i <= 10; i++) {
    const t = i / 10;
    const a = Math.pow(1 - t, power);
    grad.addColorStop(t, `rgba(255,255,255,${a.toFixed(3)})`);
  }
  g.fillStyle = grad;
  g.fillRect(0, 0, size, size);
  const tex = Texture.from(c);
  canvasCache.set(key, tex);
  return tex;
}

/** Vertical gradient texture from an array of [offset, cssColor] stops. */
export function gradientTexture(stops: [number, string][], w = 2, h = 256, key?: string): Texture {
  const k = key ?? `grad-${stops.map((s) => s.join(':')).join('|')}`;
  const hit = canvasCache.get(k);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, 0, h);
  for (const [o, col] of stops) grad.addColorStop(o, col);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const tex = Texture.from(c);
  canvasCache.set(k, tex);
  return tex;
}

/** Horizontal streak used for lens flares. */
export function streakTexture(w = 256, h = 16): Texture {
  const key = `streak-${w}-${h}`;
  const hit = canvasCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const grad = g.createLinearGradient(0, 0, w, 0);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.5, 'rgba(255,255,255,1)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  const v = g.createLinearGradient(0, 0, 0, h);
  v.addColorStop(0, 'rgba(0,0,0,1)');
  v.addColorStop(0.5, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  const tex = Texture.from(c);
  canvasCache.set(key, tex);
  return tex;
}

/** Small noise tile for subtle surface texture. */
export function noiseTexture(size = 128): Texture {
  const key = `noise-${size}`;
  const hit = canvasCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  let seed = 1234567;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const v = 128 + ((seed >>> 24) - 128) * 0.5;
    img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = Texture.from(c);
  canvasCache.set(key, tex);
  return tex;
}

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const clamp01 = (v: number): number => Math.max(0, Math.min(1, v));

export function lerpColor(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  return (Math.round(lerp(ar, br, t)) << 16) | (Math.round(lerp(ag, bg, t)) << 8) | Math.round(lerp(ab, bb, t));
}

export function shade(color: number, amt: number): number {
  const f = (v: number) => Math.max(0, Math.min(255, Math.round(v * (1 + amt))));
  return (f((color >> 16) & 255) << 16) | (f((color >> 8) & 255) << 8) | f(color & 255);
}

/** Deterministic hash → 0..1 */
export function hash(n: number): number {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
