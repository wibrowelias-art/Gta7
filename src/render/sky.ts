import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { gradientTexture, hash, lerp, lerpColor, radialTexture } from './textures';

export interface Atmosphere {
  hour: number;
  /** 0 = full night, 1 = full day. */
  daylight: number;
  /** Warmth of the light (sunrise/sunset peaks). */
  warmth: number;
  rain: number; // 0..1
  skyTop: number;
  skyHorizon: number;
  sunX: number; // 0..1 across the sky
  sunY: number; // 0 = horizon, 1 = zenith
  ambient: number; // multiplier for exterior brightness
  windowGlow: number; // 0..1 interior glow visible from outside
}

interface Key {
  h: number;
  top: number;
  hor: number;
}

// Time-of-day sky keyframes. Warm sunset-and-neon palette.
const KEYS: Key[] = [
  { h: 0, top: 0x07050f, hor: 0x2a1040 },
  { h: 4.5, top: 0x0a0716, hor: 0x33153f },
  { h: 6, top: 0x3a1d4f, hor: 0xff8a3d },
  { h: 7.5, top: 0x5a4a8a, hor: 0xffc08a },
  { h: 10, top: 0x5b86c9, hor: 0xffe0bd },
  { h: 14, top: 0x6a95d4, hor: 0xffe4c4 },
  { h: 17, top: 0x6a4f93, hor: 0xffa36b },
  { h: 18.5, top: 0x5a1f5e, hor: 0xff5f6d },
  { h: 19.5, top: 0x2f1348, hor: 0xff3d8b },
  { h: 21, top: 0x120a22, hor: 0x5a1f5e },
  { h: 24, top: 0x07050f, hor: 0x2a1040 },
];

export function atmosphere(clock: number): Atmosphere {
  const hour = clock % 24;
  const day = Math.floor(clock / 24);
  let a = KEYS[0];
  let b = KEYS[1];
  for (let i = 0; i < KEYS.length - 1; i++) {
    if (hour >= KEYS[i].h && hour <= KEYS[i + 1].h) {
      a = KEYS[i];
      b = KEYS[i + 1];
      break;
    }
  }
  const t = (hour - a.h) / (b.h - a.h || 1);
  const daylight = smooth(hour, 5.5, 8) * (1 - smooth(hour, 17.5, 20.5));
  const warmth = Math.max(bump(hour, 6.8, 2.2), bump(hour, 18.6, 2.4));
  // Rain: deterministic per day, in a late-afternoon window on ~30% of days.
  const rainDay = hash(day * 7 + 3) > 0.7;
  const rainStart = 13 + hash(day * 13) * 5;
  const rain = rainDay ? smooth(hour, rainStart, rainStart + 1) * (1 - smooth(hour, rainStart + 3, rainStart + 4.5)) : 0;
  const sunX = (hour - 5) / 15;
  const sunY = Math.sin(Math.PI * Math.min(1, Math.max(0, sunX)));
  return {
    hour,
    daylight,
    warmth,
    rain,
    skyTop: lerpColor(lerpColor(a.top, b.top, t), 0x3a3a48, rain * 0.5),
    skyHorizon: lerpColor(lerpColor(a.hor, b.hor, t), 0x6b6b78, rain * 0.5),
    sunX,
    sunY,
    ambient: lerp(0.28, 1, daylight) * (1 - rain * 0.25),
    windowGlow: 1 - daylight * 0.85,
  };
}

function smooth(x: number, a: number, b: number): number {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function bump(x: number, c: number, w: number): number {
  const d = Math.abs(x - c) / w;
  return d >= 1 ? 0 : 1 - d * d * (3 - 2 * d);
}

const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Sky dome: gradient, sun/moon, stars and drifting clouds. Screen-aligned (no parallax). */
export class Sky {
  readonly view = new Container();
  private grad: Sprite;
  private stars = new Container();
  private sun: Sprite;
  private sunCore: Sprite;
  private moon: Graphics;
  private clouds: { s: Sprite; speed: number; depth: number }[] = [];
  private lastKey = '';
  private w = 1;
  private h = 1;

  constructor(private readonly reduced: boolean) {
    this.grad = new Sprite(Texture.WHITE);
    this.view.addChild(this.grad);
    // Stars.
    for (let i = 0; i < 120; i++) {
      const g = new Graphics().circle(0, 0, 0.6 + hash(i) * 1.1).fill({ color: 0xfff4ec, alpha: 0.5 + hash(i + 50) * 0.5 });
      g.x = hash(i + 7);
      g.y = hash(i + 99) * 0.55;
      this.stars.addChild(g);
    }
    this.view.addChild(this.stars);
    this.sun = new Sprite(radialTexture(256, 0, 2.6));
    this.sun.anchor.set(0.5);
    this.sun.blendMode = 'add';
    this.sunCore = new Sprite(radialTexture(128, 0.55, 8));
    this.sunCore.anchor.set(0.5);
    this.view.addChild(this.sun, this.sunCore);
    this.moon = new Graphics().circle(0, 0, 22).fill(0xf3eef7).circle(-7, -5, 4).fill({ color: 0xd9d2e0 }).circle(6, 7, 3).fill({ color: 0xd9d2e0 }).circle(8, -8, 2).fill({ color: 0xd9d2e0 });
    this.view.addChild(this.moon);
    // Clouds: soft overlapping blobs baked into one texture via Graphics.
    for (let i = 0; i < 9; i++) {
      const s = new Sprite(cloudTexture(i));
      s.anchor.set(0.5);
      const depth = 0.4 + hash(i + 31) * 0.6;
      s.scale.set(depth * 1.6);
      this.clouds.push({ s, speed: (4 + hash(i + 3) * 6) * depth, depth });
      s.x = hash(i + 11) * 2000 - 200;
      s.y = 40 + hash(i + 21) * 220 * depth;
      this.view.addChild(s);
    }
  }

  resize(w: number, h: number): void {
    this.w = w;
    this.h = h;
    void this.h;
    this.grad.width = w;
    this.grad.height = h;
    let i = 0;
    for (const st of this.stars.children) {
      st.x = hash(i + 7) * w;
      st.y = hash(i + 99) * h * 0.55;
      i++;
    }
  }

  /** @param horizonY screen y of the far horizon. */
  update(dt: number, atm: Atmosphere, horizonY: number): void {
    const key = `${Math.round(atm.hour * 6)}-${Math.round(atm.rain * 4)}`;
    if (key !== this.lastKey) {
      this.lastKey = key;
      const top = hex(atm.skyTop);
      const hor = hex(atm.skyHorizon);
      const mid = hex(lerpColor(atm.skyTop, atm.skyHorizon, 0.55));
      this.grad.texture = gradientTexture([[0, top], [0.55, mid], [0.9, hor], [1, hor]], 2, 256, `sky-${key}`);
    }
    const night = 1 - atm.daylight;
    this.stars.alpha = Math.max(0, night - 0.2) * (1 - atm.rain);
    // Sun arc.
    const sunScreenX = lerp(-0.1, 1.1, atm.sunX) * this.w;
    const sunScreenY = horizonY - atm.sunY * horizonY * 0.9;
    this.sun.position.set(sunScreenX, sunScreenY);
    this.sunCore.position.set(sunScreenX, sunScreenY);
    const sunVisible = atm.sunX > -0.05 && atm.sunX < 1.05;
    const sunSize = lerp(1.4, 0.9, atm.sunY) * Math.max(this.w, 600) * 0.0022;
    this.sun.scale.set(sunSize * 2.6);
    this.sunCore.scale.set(sunSize * 0.55);
    this.sun.tint = lerpColor(0xffc857, 0xff5f6d, atm.warmth);
    this.sunCore.tint = lerpColor(0xfff4ec, 0xffb37a, atm.warmth);
    this.sun.alpha = sunVisible ? lerp(0.35, 0.75, atm.warmth) * (1 - atm.rain * 0.8) : 0;
    this.sunCore.alpha = sunVisible ? 1 - atm.rain * 0.7 : 0;
    // Moon follows the opposite arc.
    const moonX = ((atm.hour + 12) % 24 - 5) / 15;
    this.moon.position.set(lerp(-0.1, 1.1, moonX) * this.w, horizonY - Math.sin(Math.PI * Math.min(1, Math.max(0, moonX))) * horizonY * 0.8);
    this.moon.alpha = night * (moonX > 0 && moonX < 1 ? 1 : 0) * (1 - atm.rain * 0.6);
    // Clouds.
    const cloudTint = lerpColor(lerpColor(0x241630, 0xffe2c8, atm.daylight), 0xff9a7a, atm.warmth * 0.6);
    for (const c of this.clouds) {
      if (!this.reduced) c.s.x += dt * c.speed;
      if (c.s.x > this.w + 300) c.s.x = -300;
      c.s.y = horizonY * (0.15 + 0.55 * c.depth) - 40 * c.depth;
      c.s.tint = lerpColor(cloudTint, 0x8a8a96, atm.rain);
      c.s.alpha = 0.22 + atm.rain * 0.4;
    }
  }
}

function cloudTexture(seed: number): Texture {
  const c = document.createElement('canvas');
  c.width = 320;
  c.height = 120;
  const g = c.getContext('2d')!;
  for (let i = 0; i < 7; i++) {
    const x = 60 + hash(seed * 10 + i) * 200;
    const y = 50 + hash(seed * 17 + i) * 40;
    const r = 30 + hash(seed * 23 + i) * 40;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(255,255,255,0.9)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0, 0, c.width, c.height);
  }
  return Texture.from(c);
}
