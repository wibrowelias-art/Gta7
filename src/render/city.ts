import { Container, Graphics, Sprite, type Renderer, type Texture } from 'pixi.js';
import type { Atmosphere } from './sky';
import { bake, hash, lerp, lerpColor, radialTexture, shade, streakTexture, TextureBudget } from './textures';
import type { TierConfig } from './quality';

export const CITY_W = 4200; // world width covered by the skyline layers

const NEON = [0xff3d8b, 0xff8a3d, 0xffc857, 0x2ee6c8, 0x3fd0ff, 0x8b5cf6, 0x3dff8f];

/** A skyline layer: baked silhouette (day) + baked lit windows (night) + animated neon signs. */
class Skyline {
  readonly view = new Container();
  private dayS: Sprite;
  private nightS: Sprite;
  private signs: { s: Sprite; flare: Sprite; phase: number; color: number }[] = [];
  constructor(renderer: Renderer, budget: TextureBudget, private readonly depth: number, seed: number, cfg: TierConfig) {
    const h = depth < 0.5 ? 900 : 620;
    const day = new Graphics();
    const night = new Graphics();
    const base = lerpColor(0x1a1226, 0x0c0814, depth);
    let x = -200;
    let i = 0;
    while (x < CITY_W + 200) {
      const w = 60 + hash(seed + i) * 140 * (1.2 - depth);
      const bh = (120 + hash(seed + i * 3) * 520) * (depth < 0.5 ? 1.25 : 0.8);
      const col = shade(base, (hash(seed + i * 5) - 0.5) * 0.3);
      day.rect(x, h - bh, w, bh).fill(col);
      // Rooftop details: antenna, water tank, setbacks.
      if (hash(seed + i * 7) > 0.6) day.rect(x + w * 0.5 - 2, h - bh - 30 - hash(i) * 40, 4, 30 + hash(i) * 40).fill(shade(col, 0.1));
      if (hash(seed + i * 11) > 0.7) day.rect(x + w * 0.2, h - bh - 18, w * 0.3, 18).fill(shade(col, 0.15));
      // Side light (sunset rim) baked as a lighter strip on the right edge.
      day.rect(x + w - 3, h - bh, 3, bh).fill({ color: 0xff8a3d, alpha: 0.18 });
      // Windows.
      const cols = Math.max(2, Math.floor(w / 14));
      const rows = Math.max(3, Math.floor(bh / 18));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const wx = x + 5 + c * ((w - 10) / cols);
          const wy = h - bh + 8 + r * ((bh - 12) / rows);
          const on = hash(seed * 3 + i * 131 + r * 17 + c * 7) > 0.45;
          day.rect(wx, wy, 6 * (1.1 - depth * 0.5), 8 * (1.1 - depth * 0.5)).fill({ color: 0x2b2a3d, alpha: 0.9 });
          if (on) {
            const warm = hash(seed + r * 3 + c * 5 + i);
            night.rect(wx, wy, 6 * (1.1 - depth * 0.5), 8 * (1.1 - depth * 0.5)).fill({ color: warm > 0.5 ? 0xffc857 : warm > 0.2 ? 0xfff4ec : 0x3fd0ff, alpha: 0.5 + hash(i + r + c) * 0.5 });
          }
        }
      }
      // Neon sign on some towers (mid layer only).
      if (depth >= 0.5 && hash(seed + i * 13) > 0.72 && cfg.flyers > 0) {
        const color = NEON[Math.floor(hash(seed + i * 17) * NEON.length)];
        const sw = Math.min(w - 10, 24 + hash(i) * 30);
        const sx = x + w / 2;
        const sy = h - bh + 20 + hash(i * 3) * 30;
        night.roundRect(sx - sw / 2, sy - 5, sw, 10, 3).fill({ color, alpha: 0.95 });
        const glow = new Sprite(radialTexture(128, 0, 2.2));
        glow.anchor.set(0.5);
        glow.tint = color;
        glow.blendMode = 'add';
        glow.position.set(sx, sy);
        glow.scale.set(0.5 + sw / 60);
        const flare = new Sprite(streakTexture());
        flare.anchor.set(0.5);
        flare.tint = color;
        flare.blendMode = 'add';
        flare.position.set(sx, sy);
        flare.scale.set(0.35 + sw / 80, 0.35);
        this.signs.push({ s: glow, flare, phase: hash(i * 29) * 6.28, color });
      }
      x += w + 6 + hash(seed + i * 19) * 30;
      i++;
    }
    const dayT: Texture = bake(renderer, budget, day, CITY_W + 400, h, 1);
    const nightT: Texture = bake(renderer, budget, night, CITY_W + 400, h, 1);
    this.dayS = new Sprite(dayT);
    this.nightS = new Sprite(nightT);
    this.dayS.position.set(-200, -h);
    this.nightS.position.set(-200, -h);
    this.nightS.blendMode = 'add';
    this.view.addChild(this.dayS, this.nightS);
    for (const s of this.signs) {
      s.s.y -= h;
      s.flare.y -= h;
      s.s.x -= 200;
      s.flare.x -= 200;
      this.view.addChild(s.s, s.flare);
    }
    day.destroy();
    night.destroy();
  }
  update(t: number, atm: Atmosphere): void {
    const night = 1 - atm.daylight;
    // Haze: far buildings fade toward the horizon colour by day.
    this.dayS.tint = lerpColor(0xffffff, atm.skyHorizon, (1 - this.depth) * 0.55 * atm.daylight + atm.rain * 0.3);
    this.dayS.alpha = 1;
    this.nightS.alpha = Math.max(0.05, night) * (0.6 + 0.4 * this.depth);
    for (const s of this.signs) {
      const flick = 0.8 + 0.2 * Math.sin(t * 7 + s.phase) + (Math.sin(t * 23 + s.phase * 3) > 0.97 ? -0.4 : 0);
      s.s.alpha = (0.35 + night * 0.5) * flick;
      s.flare.alpha = (0.15 + night * 0.45) * flick;
      s.flare.scale.x = (0.4 + 0.1 * Math.sin(t * 1.3 + s.phase)) * 1.5;
    }
  }
}

interface Car {
  s: Sprite;
  light: Sprite;
  speed: number;
  dir: number;
  lane: number;
}
interface Flyer {
  view: Container;
  speed: number;
  dir: number;
  y: number;
  heli: boolean;
  blink: number;
}

/** City layers: far skyline, mid skyline with palms and signs, street with traffic and wet reflections, flying traffic. */
export class City {
  readonly far = new Container();
  readonly mid = new Container();
  readonly near = new Container();
  readonly air = new Container();
  private farLine: Skyline;
  private midLine: Skyline;
  private cars: Car[] = [];
  private flyers: Flyer[] = [];
  private street: Graphics;
  private wet: Sprite;
  private hazeNear: Sprite;
  private rainDrops: Graphics[] = [];
  private rainLayer = new Container();
  private palms: Container[] = [];

  constructor(renderer: Renderer, budget: TextureBudget, cfg: TierConfig, buildingW: number) {
    this.farLine = new Skyline(renderer, budget, 0.2, 11, cfg);
    this.farLine.view.scale.set(0.5);
    this.far.addChild(this.farLine.view);
    this.midLine = new Skyline(renderer, budget, 0.6, 29, cfg);
    this.midLine.view.scale.set(0.72);
    this.mid.addChild(this.midLine.view);
    // Palms along the mid layer.
    for (let i = 0; i < 14; i++) {
      const p = palm(hash(i * 3) * 40 + 70, i);
      p.x = -100 + i * (CITY_W / 13) + hash(i) * 120;
      p.y = 0;
      this.mid.addChild(p);
      this.palms.push(p);
    }
    // Street.
    this.street = new Graphics();
    const sw = CITY_W + 800;
    this.street.rect(-400, 0, sw, 3000).fill(0x0d0a14);
    this.street.rect(-400, 260, sw, 40).fill({ color: 0x1b1424, alpha: 0.6 }); // far kerb
    this.street.rect(-400, 0, sw, 14).fill(0x1b1424); // kerb
    this.street.rect(-400, 14, sw, 4).fill({ color: 0xffc857, alpha: 0.35 });
    for (let x = -400; x < sw; x += 60) this.street.rect(x, 120, 30, 4).fill({ color: 0xfff4ec, alpha: 0.35 });
    // Pavement in front of our building.
    this.street.rect(-80, 0, buildingW + 160, 30).fill(0x1c1526);
    this.near.addChild(this.street);
    // Wet reflection strip: a soft mirror of the horizon glow.
    this.wet = new Sprite(radialTexture(256, 0, 1.2));
    this.wet.anchor.set(0.5, 0);
    this.wet.blendMode = 'add';
    this.wet.position.set(buildingW / 2, 20);
    this.wet.scale.set(14, 0.9);
    this.near.addChild(this.wet);
    // Cars.
    for (let i = 0; i < cfg.traffic; i++) {
      const dir = i % 2 ? 1 : -1;
      const lane = i % 2 ? 150 : 190;
      const body = new Graphics().roundRect(-18, -8, 36, 12, 4).fill(NEON[i % NEON.length]).roundRect(-10, -14, 18, 8, 3).fill(0x1a1420).rect(-18, 2, 36, 3).fill(0x0a0710);
      const tex = renderer.generateTexture({ target: body, resolution: 1 });
      body.destroy();
      const s = new Sprite(tex);
      s.anchor.set(0.5, 1);
      s.scale.set(dir, 1);
      const light = new Sprite(radialTexture(64, 0, 2));
      light.anchor.set(0.5);
      light.blendMode = 'add';
      light.scale.set(1.4, 0.5);
      s.x = hash(i * 5) * CITY_W;
      s.y = lane;
      this.cars.push({ s, light, speed: 160 + hash(i) * 120, dir, lane });
      this.near.addChild(light, s);
    }
    // Flying traffic.
    for (let i = 0; i < cfg.flyers; i++) {
      const heli = i % 3 === 0;
      const view = new Container();
      const g = new Graphics();
      if (heli) {
        g.ellipse(0, 0, 22, 9).fill(0x1e1729).rect(14, -4, 28, 4).fill(0x1e1729).rect(-30, -14, 60, 2).fill(0x34283f);
      } else {
        g.roundRect(-20, -6, 40, 10, 5).fill(0x241c2e).rect(-22, -2, 44, 3).fill(NEON[(i + 2) % NEON.length]);
      }
      view.addChild(g);
      const l1 = new Sprite(radialTexture(64, 0, 2));
      l1.anchor.set(0.5);
      l1.blendMode = 'add';
      l1.tint = 0xff4458;
      l1.scale.set(0.4);
      l1.x = -20;
      const l2 = new Sprite(radialTexture(64, 0, 2));
      l2.anchor.set(0.5);
      l2.blendMode = 'add';
      l2.tint = 0x3dff8f;
      l2.scale.set(0.4);
      l2.x = 20;
      view.addChild(l1, l2);
      const y = -(600 + hash(i * 7) * 500);
      view.position.set(hash(i * 11) * CITY_W, y);
      this.flyers.push({ view, speed: heli ? 40 + hash(i) * 20 : 90 + hash(i) * 60, dir: i % 2 ? 1 : -1, y, heli, blink: hash(i) * 6 });
      this.air.addChild(view);
    }
    // Heat haze / ground fog.
    this.hazeNear = new Sprite(radialTexture(256, 0, 1));
    this.hazeNear.anchor.set(0.5, 1);
    this.hazeNear.position.set(buildingW / 2, 40);
    this.hazeNear.scale.set(18, 1.6);
    this.hazeNear.blendMode = 'add';
    this.mid.addChild(this.hazeNear);
    // Rain.
    if (cfg.rain) {
      for (let i = 0; i < 160; i++) {
        const d = new Graphics().rect(0, 0, 1.2, 18 + hash(i) * 14).fill({ color: 0xc2d8ff, alpha: 0.35 });
        d.position.set(hash(i * 3) * 2400 - 600, hash(i * 5) * 1600 - 1400);
        this.rainDrops.push(d);
        this.rainLayer.addChild(d);
      }
      this.rainLayer.visible = false;
      this.air.addChild(this.rainLayer);
    }
  }

  update(dt: number, t: number, atm: Atmosphere, camX: number, reduced: boolean): void {
    this.farLine.update(t, atm);
    this.midLine.update(t, atm);
    const night = 1 - atm.daylight;
    this.street.tint = lerpColor(0x5a5a70, 0xffffff, atm.ambient);
    this.wet.tint = lerpColor(atm.skyHorizon, 0xff3d8b, night * 0.5);
    this.wet.alpha = 0.12 + atm.rain * 0.35 + night * 0.1;
    this.hazeNear.tint = lerpColor(atm.skyHorizon, 0xff8a3d, atm.warmth);
    this.hazeNear.alpha = (0.08 + atm.warmth * 0.14) * (1 - atm.rain) + atm.rain * 0.12;
    this.hazeNear.scale.y = 1.6 + Math.sin(t * 0.7) * 0.08;
    for (const p of this.palms) {
      p.rotation = Math.sin(t * 0.8 + p.x * 0.01) * 0.02 * (1 + atm.rain * 2);
      p.tint = lerpColor(0x0c0a16, 0x2a3a2a, atm.daylight * 0.8);
    }
    if (!reduced) {
      for (const c of this.cars) {
        c.s.x += c.dir * c.speed * dt;
        if (c.dir > 0 && c.s.x > CITY_W + 300) c.s.x = -300;
        if (c.dir < 0 && c.s.x < -300) c.s.x = CITY_W + 300;
        c.light.position.set(c.s.x + c.dir * 22, c.lane - 6);
        c.light.tint = 0xfff4ec;
        c.light.alpha = 0.25 + night * 0.6;
        c.s.tint = lerpColor(0x404050, 0xffffff, atm.ambient);
      }
      for (const f of this.flyers) {
        f.view.x += f.dir * f.speed * dt;
        if (f.dir > 0 && f.view.x > CITY_W + 400) f.view.x = -400;
        if (f.dir < 0 && f.view.x < -400) f.view.x = CITY_W + 400;
        f.view.y = f.y + Math.sin(t * 0.6 + f.blink) * 12;
        f.view.scale.x = f.dir;
        const blink = Math.sin(t * 6 + f.blink) > 0.5 ? 1 : 0.2;
        (f.view.children[1] as Sprite).alpha = blink * (0.4 + night * 0.6);
        (f.view.children[2] as Sprite).alpha = (1.2 - blink) * (0.4 + night * 0.6);
      }
    }
    if (this.rainDrops.length) {
      this.rainLayer.visible = atm.rain > 0.02;
      if (this.rainLayer.visible && !reduced) {
        this.rainLayer.alpha = atm.rain;
        for (const d of this.rainDrops) {
          d.y += dt * 1400;
          d.x -= dt * 180;
          if (d.y > 300) {
            d.y = -1400 - hash(d.x) * 200;
            d.x = camX + (hash(d.y) - 0.5) * 2400;
          }
        }
      }
    }
  }
}

function palm(height: number, seed: number): Container {
  const c = new Container();
  const g = new Graphics();
  g.moveTo(0, 0).bezierCurveTo(6, -height * 0.4, -4, -height * 0.7, 2, -height).stroke({ width: 6, color: 0x1a1424, cap: 'round' });
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * 0.42 + (hash(seed + i) - 0.5) * 0.2;
    const len = 34 + hash(seed * 3 + i) * 18;
    g.moveTo(2, -height).quadraticCurveTo(2 + Math.cos(a) * len * 0.6, -height + Math.sin(a) * len * 0.3 - 10, 2 + Math.cos(a) * len, -height + Math.sin(a) * len + 18).stroke({ width: 4, color: 0x18212a, cap: 'round' });
  }
  c.addChild(g);
  return c;
}

export { lerp };
