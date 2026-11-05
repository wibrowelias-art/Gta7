import { Container, Graphics, Sprite, Text, type Renderer, type Texture } from 'pixi.js';
import { ROOMS } from '../game/data';
import { ELEVATOR_X, SLOT_X } from '../game/sim';
import type { GameState, Room, RoomType } from '../game/types';
import type { Atmosphere } from './sky';
import { bake, hash, lerp, lerpColor, radialTexture, shade, streakTexture, TextureBudget } from './textures';
import type { TierConfig } from './quality';

export const WB = 760; // building width in world units
export const FH = 190; // floor height
export const SLAB = 14; // floor slab thickness
export const ELEV_W = 64;

export const roomRect = (r: Room): { x: number; y: number; w: number; h: number } => {
  const [a, b] = SLOT_X[r.slot];
  return { x: a * WB, y: -(r.floor + 1) * FH, w: (b - a) * WB, h: FH - SLAB };
};
export const floorY = (floor: number): number => -floor * FH; // y of the walkable floor line

const textStyle = (size: number, fill: number) => ({ fontFamily: 'Barlow Condensed', fontWeight: '700' as const, fontSize: size, fill, letterSpacing: 2 });

/* ------------------------------------------------------------------ */
/* Furniture painters. Each draws into a Graphics at origin (0,0)=room */
/* top-left, w×h = room interior. Level adds props and materials.      */
/* ------------------------------------------------------------------ */

type Painter = (g: Graphics, w: number, h: number, level: number, seed: number) => void;

const WALL = 0x1b1426;
const WALL_LIT = 0x241a31;
const FLOOR = 0x120d1a;

function shell(g: Graphics, w: number, h: number, level: number, light: number): void {
  // Back wall with a subtle gradient band and skirting; level 3 adds glass-wall highlights.
  g.rect(0, 0, w, h).fill(level >= 3 ? shade(WALL_LIT, 0.08) : WALL);
  g.rect(0, 0, w, h * 0.55).fill({ color: WALL_LIT, alpha: 0.6 });
  g.rect(0, h - 8, w, 8).fill(shade(WALL, -0.3));
  // Windows: three panes showing the city behind (left transparent by not filling).
  const pw = w * 0.2;
  for (let i = 0; i < 3; i++) {
    const x = w * 0.12 + i * (pw + w * 0.1);
    g.rect(x, 18, pw, h * 0.42).cut();
    g.rect(x - 3, 15, pw + 6, 3).fill(shade(WALL, 0.4));
    g.rect(x - 3, 15, 3, h * 0.42 + 6).fill(shade(WALL, 0.4));
    g.rect(x + pw, 15, 3, h * 0.42 + 6).fill(shade(WALL, 0.4));
    g.rect(x - 3, 18 + h * 0.42, pw + 6, 3).fill(shade(WALL, 0.4));
  }
  // Glossy floor.
  g.rect(0, h - 26, w, 26).fill(level >= 2 ? 0x16111f : FLOOR);
  g.rect(0, h - 26, w, 2).fill({ color: light, alpha: 0.25 });
  // Ceiling light fixtures.
  const lamps = level + 1;
  for (let i = 0; i < lamps; i++) {
    const x = (w / (lamps + 1)) * (i + 1);
    g.rect(x - 18, 2, 36, 4).fill(0x34283f);
    g.rect(x - 16, 6, 32, 2).fill({ color: light, alpha: 0.9 });
  }
  // Wall poster.
  g.roundRect(w - 46, 24, 30, 40, 3).fill(0x241c2e).rect(w - 42, 28, 22, 24).fill({ color: light, alpha: 0.35 }).rect(w - 42, 54, 22, 6).fill({ color: 0xfff4ec, alpha: 0.5 });
}

function desk(g: Graphics, x: number, y: number, w: number, accent: number, withMonitor = true, seed = 0): void {
  // Desk top, legs, cable mess, mug, monitor + keyboard.
  g.rect(x, y, w, 5).fill(0x3a2b4a).rect(x + 2, y + 5, 4, 26).fill(0x2a1e36).rect(x + w - 6, y + 5, 4, 26).fill(0x2a1e36);
  g.rect(x, y + 1, w, 1).fill({ color: 0xfff4ec, alpha: 0.18 });
  if (withMonitor) {
    g.rect(x + w * 0.3, y - 22, w * 0.42, 18).fill(0x0c0812).rect(x + w * 0.49, y - 4, w * 0.06, 4).fill(0x241c2e).rect(x + w * 0.42, y, w * 0.2, 2).fill(0x34283f);
    g.rect(x + w * 0.32, y - 20, w * 0.38, 14).fill({ color: accent, alpha: 0.12 });
    g.rect(x + w * 0.12, y - 3, w * 0.14, 3).fill(0x2f2440); // keyboard
  }
  g.roundRect(x + w * 0.82, y - 6, 6, 6, 1).fill(0xffc857); // mug
  // Cables.
  g.moveTo(x + w * 0.5, y + 5).bezierCurveTo(x + w * 0.5, y + 25, x + w * 0.7 + hash(seed) * 10, y + 20, x + w * 0.75, y + 31).stroke({ width: 1.2, color: 0x0a0710, alpha: 0.9 });
  g.moveTo(x + w * 0.48, y + 5).bezierCurveTo(x + w * 0.4, y + 24, x + w * 0.3 - hash(seed + 1) * 10, y + 26, x + w * 0.2, y + 31).stroke({ width: 1.2, color: 0x0a0710, alpha: 0.9 });
  // Papers / clutter.
  g.rect(x + w * 0.05, y - 2, 10, 2).fill({ color: 0xfff4ec, alpha: 0.6 });
  g.rect(x + w * 0.68, y - 3, 8, 3).fill({ color: 0x2ee6c8, alpha: 0.5 });
}

function plant(g: Graphics, x: number, y: number, size = 1): void {
  g.roundRect(x - 7 * size, y - 10 * size, 14 * size, 10 * size, 2).fill(0x3b2a2a);
  for (let i = 0; i < 5; i++) {
    const a = -Math.PI / 2 + (i - 2) * 0.5;
    g.moveTo(x, y - 9 * size).lineTo(x + Math.cos(a) * 16 * size, y - 9 * size + Math.sin(a) * 16 * size).stroke({ width: 4 * size, color: 0x2f8f5a, cap: 'round' });
  }
}

function chair(g: Graphics, x: number, y: number, color = 0x2b2140): void {
  g.roundRect(x - 7, y - 14, 14, 16, 3).fill(color).rect(x - 1, y + 2, 2, 8).fill(0x3a2b4a).rect(x - 8, y + 10, 16, 2).fill(0x3a2b4a);
}

function vending(g: Graphics, x: number, y: number, accent: number): void {
  g.roundRect(x, y - 54, 26, 54, 3).fill(0x241c2e).rect(x + 3, y - 50, 20, 32).fill(0x0c0812);
  for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) g.rect(x + 5 + c * 6, y - 48 + r * 10, 4, 6).fill([0xff3d8b, 0xffc857, 0x2ee6c8][(r + c) % 3]);
  g.rect(x + 3, y - 14, 20, 8).fill({ color: accent, alpha: 0.5 });
}

const PAINTERS: Record<RoomType, Painter> = {
  command(g, w, h, level, seed) {
    shell(g, w, h, level, ROOMS.command.light);
    // Long table + chairs; big wall screen with milestone chart.
    g.roundRect(w * 0.2, h - 58, w * 0.6, 8, 3).fill(0x3a2b4a).rect(w * 0.3, h - 50, 6, 24).fill(0x2a1e36).rect(w * 0.68, h - 50, 6, 24).fill(0x2a1e36);
    for (let i = 0; i < 2 + level; i++) chair(g, w * 0.25 + i * (w * 0.5) / (1 + level), h - 60, 0x2b2140);
    g.roundRect(w * 0.32, h * 0.18, w * 0.36, h * 0.28, 3).fill(0x0c0812);
    g.rect(w * 0.34, h * 0.2, w * 0.32, h * 0.24).fill({ color: 0xffc857, alpha: 0.08 });
    for (let i = 0; i < 6; i++) g.rect(w * 0.36 + i * w * 0.05, h * 0.42 - i * 5 - 4, w * 0.03, i * 5 + 4).fill({ color: 0xffc857, alpha: 0.6 });
    plant(g, w * 0.08, h - 26, 1.1);
    if (level >= 2) g.rect(w * 0.05, h - 90, w * 0.9, 1).fill({ color: 0xffc857, alpha: 0.4 }); // brass rail
    if (level >= 3) {
      g.roundRect(w * 0.84, h - 70, 14, 44, 2).fill(0x5a4a1f).rect(w * 0.84, h - 70, 14, 2).fill(0xffc857); // trophy cabinet
    }
    void seed;
  },
  factory(g, w, h, level, seed) {
    shell(g, w, h, level, ROOMS.factory.light);
    // Printing press / conveyor; robotic arm at level 2+; shelves of stock.
    g.roundRect(w * 0.12, h - 60, w * 0.5, 34, 4).fill(0x2a2036).rect(w * 0.14, h - 64, w * 0.46, 6).fill(0x3a2b4a);
    for (let i = 0; i < 6; i++) g.rect(w * 0.15 + i * w * 0.075, h - 62, w * 0.04, 3).fill({ color: 0xff8a3d, alpha: 0.7 });
    g.rect(w * 0.12, h - 30, w * 0.5, 4).fill(0x1a1424);
    // Shelves with boxes.
    for (let r = 0; r < 3; r++) {
      g.rect(w * 0.7, h - 36 - r * 28, w * 0.26, 3).fill(0x3a2b4a);
      for (let c = 0; c < 3; c++) if (hash(seed + r * 3 + c) > 0.3) g.rect(w * 0.71 + c * w * 0.085, h - 52 - r * 28, w * 0.07, 16).fill(c % 2 ? 0x6b4a2a : 0x7a5530);
    }
    if (level >= 2) {
      g.moveTo(w * 0.4, h - 64).lineTo(w * 0.36, h - 100).lineTo(w * 0.5, h - 118).stroke({ width: 6, color: 0x34283f, cap: 'round', join: 'round' });
      g.circle(w * 0.5, h - 118, 5).fill(0xff8a3d);
    }
    if (level >= 3) {
      g.rect(w * 0.1, h - 70, w * 0.54, 2).fill({ color: 0xff8a3d, alpha: 0.6 });
      g.rect(w * 0.05, 70, 6, h - 96).fill(0x2a2036); // pipes
      g.rect(w * 0.05, 70, w * 0.9, 6).fill(0x2a2036);
    }
    desk(g, w * 0.66, h - 30, w * 0.3, 0xff8a3d, true, seed);
  },
  shop(g, w, h, level, seed) {
    shell(g, w, h, level, ROOMS.shop.light);
    // Counter with register, clothing rail, mannequin, vending machine.
    g.roundRect(w * 0.08, h - 56, w * 0.36, 30, 3).fill(0x2a2036).rect(w * 0.08, h - 58, w * 0.36, 4).fill(0x3a2b4a);
    g.rect(w * 0.3, h - 72, 16, 14).fill(0x0c0812).rect(w * 0.31, h - 70, 14, 8).fill({ color: 0x3dff8f, alpha: 0.5 }); // register
    g.rect(w * 0.55, h - 100, 2, 74).fill(0x3a2b4a).rect(w * 0.95, h - 100, 2, 74).fill(0x3a2b4a).rect(w * 0.55, h - 100, w * 0.4, 3).fill(0x3a2b4a);
    for (let i = 0; i < 6; i++) g.roundRect(w * 0.58 + i * w * 0.06, h - 96, w * 0.045, 34, 2).fill([0xff3d8b, 0x2ee6c8, 0xffc857, 0x8b5cf6, 0xff8a3d, 0xfff4ec][i]);
    if (level >= 2) vending(g, w * 0.02, h - 26, 0xff3d8b);
    if (level >= 3) {
      g.roundRect(w * 0.12, h - 110, w * 0.3, 40, 4).fill({ color: 0xff3d8b, alpha: 0.15 }); // neon sign box
      g.rect(w * 0.14, h - 100, w * 0.26, 3).fill({ color: 0xff3d8b, alpha: 0.9 });
    }
    void seed;
  },
  treasury(g, w, h, level, seed) {
    shell(g, w, h, level, ROOMS.treasury.light);
    desk(g, w * 0.08, h - 30, w * 0.36, 0x3dff8f, true, seed);
    desk(g, w * 0.5, h - 30, w * 0.36, 0x3dff8f, true, seed + 1);
    // Vault door.
    g.circle(w * 0.9, h - 70, 22).fill(0x2b2140).circle(w * 0.9, h - 70, 16).fill(0x34283f).circle(w * 0.9, h - 70, 5).fill(0xffc857);
    for (let i = 0; i < 4; i++) g.rect(w * 0.9 - 1, h - 70 - 14, 2, 10).fill(0xffc857);
    // Ticker screen.
    g.rect(w * 0.1, h * 0.14, w * 0.5, 14).fill(0x0c0812);
    for (let i = 0; i < 10; i++) g.rect(w * 0.12 + i * w * 0.048, h * 0.14 + 3 + hash(seed + i) * 6, 3, 8 - hash(seed + i) * 6).fill(i % 3 ? 0x3dff8f : 0xff4458);
    if (level >= 2) g.rect(0, h - 28, w, 2).fill({ color: 0xffc857, alpha: 0.35 });
    if (level >= 3) for (let i = 0; i < 3; i++) g.rect(w * 0.62 + i * 10, h - 44, 8, 14).fill(0xffc857);
  },
  bar(g, w, h, level, seed) {
    shell(g, w, h, level, ROOMS.bar.light);
    // Bar counter with bottles, pool table (level 2+), neon.
    g.roundRect(w * 0.6, h - 60, w * 0.36, 34, 4).fill(0x2a1e36).rect(w * 0.6, h - 62, w * 0.36, 4).fill(0x5a3a2a);
    g.rect(w * 0.62, h - 112, w * 0.32, 3).fill(0x3a2b4a).rect(w * 0.62, h - 90, w * 0.32, 3).fill(0x3a2b4a);
    for (let i = 0; i < 7; i++) g.roundRect(w * 0.63 + i * w * 0.045, h - 128 + (i % 2) * 2, 6, 16, 2).fill([0xff3d8b, 0x2ee6c8, 0xffc857, 0x3fd0ff, 0x8b5cf6, 0xff8a3d, 0x3dff8f][i]);
    for (let i = 0; i < 2 + Math.min(1, level - 1); i++) g.roundRect(w * 0.64 + i * 24, h - 44, 8, 8, 2).fill(0xffc857);
    // Pool table.
    g.roundRect(w * 0.08, h - 56, w * 0.42, 24, 4).fill(0x5a3a2a).rect(w * 0.1, h - 54, w * 0.38, 20).fill(0x1f7a55);
    g.rect(w * 0.12, h - 30, 4, 10).fill(0x3a2b4a).rect(w * 0.44, h - 30, 4, 10).fill(0x3a2b4a);
    for (let i = 0; i < 6; i++) g.circle(w * 0.14 + i * w * 0.05, h - 44 + (i % 2) * 6, 2.2).fill([0xfff4ec, 0xff4458, 0xffc857, 0x3fd0ff, 0x1a1016, 0xff8a3d][i]);
    g.moveTo(w * 0.1, h - 52).lineTo(w * 0.3, h - 36).stroke({ width: 2, color: 0xd9b48a });
    if (level >= 2) {
      g.roundRect(w * 0.12, h * 0.16, w * 0.3, 22, 4).fill({ color: 0x8b5cf6, alpha: 0.2 });
      g.rect(w * 0.14, h * 0.16 + 8, w * 0.26, 5).fill({ color: 0xff3d8b, alpha: 0.9 });
    }
    if (level >= 3) {
      vending(g, w * 0.52, h - 26, 0x8b5cf6);
      plant(g, w * 0.04, h - 26, 1.2);
    }
    void seed;
  },
  server(g, w, h, level, seed) {
    shell(g, w, h, level, ROOMS.server.light);
    const racks = 2 + level;
    for (let i = 0; i < racks; i++) {
      const x = w * 0.08 + i * (w * 0.78) / racks;
      const rw = (w * 0.78) / racks - 8;
      g.roundRect(x, h - 118, rw, 92, 3).fill(0x16111f).rect(x + 2, h - 116, rw - 4, 88).fill(0x0c0812);
      for (let r = 0; r < 8; r++) {
        g.rect(x + 4, h - 112 + r * 10, rw - 8, 7).fill(r % 2 ? 0x1e1729 : 0x241c2e);
        g.rect(x + 6, h - 110 + r * 10, 8, 2).fill({ color: 0x3fd0ff, alpha: 0.25 });
      }
    }
    g.rect(0, h - 26, w, 26).fill({ color: 0x0b1620, alpha: 0.9 }); // raised floor
    for (let i = 0; i < Math.floor(w / 20); i++) g.rect(i * 20, h - 26, 1, 26).fill({ color: 0x3fd0ff, alpha: 0.08 });
    if (level >= 2) g.rect(w * 0.1, 60, w * 0.8, 6).fill(0x1b1426); // cable tray
    if (level >= 3) for (let i = 0; i < 3; i++) g.rect(w * 0.2 + i * w * 0.25, 66, 4, h - 120).fill({ color: 0x3fd0ff, alpha: 0.25 }); // coolant pipes
    void seed;
  },
  studio(g, w, h, level, seed) {
    shell(g, w, h, level, ROOMS.studio.light);
    // Ring light, camera on tripod, backdrop, editing desk.
    g.roundRect(w * 0.55, 30, w * 0.4, h - 86, 4).fill({ color: 0x2ee6c8, alpha: 0.12 });
    g.circle(w * 0.3, h - 96, 22).stroke({ width: 5, color: 0xfff4ec, alpha: 0.9 }).rect(w * 0.3 - 2, h - 74, 4, 48).fill(0x34283f);
    g.moveTo(w * 0.42, h - 26).lineTo(w * 0.45, h - 70).lineTo(w * 0.48, h - 26).stroke({ width: 2, color: 0x34283f });
    g.roundRect(w * 0.4, h - 80, 14, 10, 2).fill(0x1a1420).circle(w * 0.41, h - 75, 2).fill(0xff4458);
    desk(g, w * 0.04, h - 30, w * 0.34, 0x2ee6c8, true, seed);
    if (level >= 2) g.roundRect(w * 0.6, h - 50, w * 0.3, 12, 3).fill(0x2a1e36).rect(w * 0.62, h - 48, w * 0.26, 3).fill({ color: 0x2ee6c8, alpha: 0.6 }); // light bar
    if (level >= 3) {
      for (let i = 0; i < 4; i++) g.circle(w * 0.6 + i * w * 0.1, 40, 4).fill(0xfff4ec); // stage lights
      g.rect(w * 0.56, 36, w * 0.38, 2).fill(0x34283f);
    }
  },
  lab(g, w, h, level, seed) {
    shell(g, w, h, level, ROOMS.lab.light);
    g.roundRect(w * 0.08, h - 58, w * 0.84, 32, 3).fill(0x2a2036).rect(w * 0.08, h - 60, w * 0.84, 4).fill(0xd9d2e0);
    for (let i = 0; i < 4 + level; i++) {
      const x = w * 0.12 + i * (w * 0.76) / (4 + level);
      g.roundRect(x, h - 78, 8, 18, 2).fill({ color: [0x2ee6c8, 0xff3d8b, 0xffc857, 0x3fd0ff, 0x8b5cf6, 0x3dff8f, 0xff8a3d][i % 7], alpha: 0.75 });
      g.rect(x + 1, h - 82, 6, 4).fill(0xd9d2e0);
    }
    g.roundRect(w * 0.6, h * 0.16, w * 0.3, h * 0.22, 3).fill(0x0c0812).rect(w * 0.62, h * 0.18, w * 0.26, h * 0.18).fill({ color: 0xffc857, alpha: 0.1 });
    for (let i = 0; i < 5; i++) g.circle(w * 0.64 + i * w * 0.05, h * 0.3 - hash(seed + i) * 14, 2).fill(0xffc857);
    if (level >= 2) g.roundRect(w * 0.1, 40, w * 0.3, 24, 3).fill(0x1a1420).rect(w * 0.12, 44, w * 0.26, 16).fill({ color: 0x3fd0ff, alpha: 0.2 }); // fume hood
    if (level >= 3) g.rect(w * 0.08, h - 30, w * 0.84, 2).fill({ color: 0xffc857, alpha: 0.5 });
  },
};

/* ------------------------------------------------------------------ */
/* Room view: baked texture + dynamic elements                          */
/* ------------------------------------------------------------------ */

export class RoomView {
  readonly view = new Container();
  readonly rect: { x: number; y: number; w: number; h: number };
  private base: Sprite;
  private reflection: Sprite | null = null;
  private cone: Sprite;
  private shaft: Graphics;
  private screens: Sprite[] = [];
  private leds: Sprite[] = [];
  private sign: Text;
  private signGlow: Sprite;
  private flare: Sprite;
  private glassTint: Graphics;
  level: number;
  private texture: Texture;

  constructor(private readonly renderer: Renderer, private readonly budget: TextureBudget, public room: Room, cfg: TierConfig, dpr: number) {
    this.rect = roomRect(room);
    this.level = room.level;
    const { x, y, w, h } = this.rect;
    this.view.position.set(x, y);
    this.texture = this.bakeTexture(dpr);
    this.base = new Sprite(this.texture);
    this.base.width = w;
    this.base.height = h;
    this.view.addChild(this.base);

    // Floor reflection: mirrored copy of the lower part of the room, faded.
    if (cfg.reflections) {
      this.reflection = new Sprite(this.texture);
      this.reflection.width = w;
      this.reflection.height = h;
      this.reflection.scale.y *= -0.35;
      this.reflection.position.set(0, h + h * 0.35);
      this.reflection.alpha = 0.16;
      const mask = new Graphics().rect(0, h - 26, w, 26).fill(0xffffff);
      this.reflection.mask = mask;
      this.view.addChild(mask, this.reflection);
    }
    // Glass tint over windows.
    this.glassTint = new Graphics();
    this.view.addChild(this.glassTint);
    // Volumetric shaft from the windows to the floor.
    this.shaft = new Graphics();
    this.shaft.blendMode = 'add';
    this.view.addChild(this.shaft);
    // Light cone.
    this.cone = new Sprite(radialTexture(256, 0, 1.4));
    this.cone.anchor.set(0.5, 0.2);
    this.cone.blendMode = 'add';
    this.cone.tint = ROOMS[room.type].light;
    this.cone.position.set(w / 2, 8);
    this.cone.scale.set(w / 180, h / 160);
    this.view.addChild(this.cone);
    // Dynamic screens and LEDs.
    this.buildDynamics(room.type, w, h);
    // Sign above the door frame.
    this.sign = new Text({ text: ROOMS[room.type].name.toUpperCase(), style: { ...textStyle(18, ROOMS[room.type].light), dropShadow: { color: ROOMS[room.type].light, blur: 6, distance: 0, alpha: 0.8 } }, resolution: Math.min(2, dpr) });
    this.sign.anchor.set(0.5, 1);
    this.sign.position.set(w / 2, h + SLAB - 2);
    this.signGlow = new Sprite(radialTexture(128, 0, 2.5));
    this.signGlow.anchor.set(0.5);
    this.signGlow.blendMode = 'add';
    this.signGlow.tint = ROOMS[room.type].light;
    this.signGlow.position.set(w / 2, h + SLAB - 12);
    this.signGlow.scale.set(1.2, 0.3);
    this.flare = new Sprite(streakTexture());
    this.flare.anchor.set(0.5);
    this.flare.blendMode = 'add';
    this.flare.tint = ROOMS[room.type].light;
    this.flare.position.set(w / 2, h + SLAB - 12);
    this.flare.scale.set(0.6, 0.3);
    this.view.addChild(this.signGlow, this.flare, this.sign);
  }

  private bakeTexture(dpr: number): Texture {
    const { w, h } = this.rect;
    const g = new Graphics();
    const S = 1.28; // props are drawn at a larger scale so desks and chairs read against 92px-tall workers
    g.scale.set(S);
    PAINTERS[this.room.type](g, w / S, h / S, this.level, this.room.slot * 7 + this.room.floor * 13);
    const tex = bake(this.renderer, this.budget, g, w, h, Math.min(2, dpr));
    g.destroy();
    return tex;
  }

  private buildDynamics(type: RoomType, wIn: number, hIn: number): void {
    const S = 1.28;
    const w = wIn / S;
    const h = hIn / S;
    for (const s of this.screens) s.destroy();
    for (const l of this.leds) l.destroy();
    this.screens = [];
    this.leds = [];
    const screen = (x: number, y: number, sw: number, sh: number, color: number) => {
      const s = new Sprite(screenFrames(this.renderer, color)[0]);
      s.position.set(x * S, y * S);
      s.width = sw * S;
      s.height = sh * S;
      s.blendMode = 'add';
      (s as any).__frames = screenFrames(this.renderer, color);
      (s as any).__phase = hash(x + y) * 10;
      this.screens.push(s);
      this.view.addChild(s);
    };
    const led = (x: number, y: number, color: number) => {
      const l = new Sprite(radialTexture(32, 0, 1.5));
      l.anchor.set(0.5);
      l.position.set(x * S, y * S);
      l.scale.set(0.3);
      l.tint = color;
      l.blendMode = 'add';
      (l as any).__phase = hash(x * 3 + y) * 10;
      this.leds.push(l);
      this.view.addChild(l);
    };
    switch (type) {
      case 'command':
        screen(w * 0.34, h * 0.2, w * 0.32, h * 0.24, 0xffc857);
        break;
      case 'factory':
        screen(w * 0.66 + w * 0.3 * 0.32, h - 30 - 20, w * 0.3 * 0.38, 14, 0xff8a3d);
        for (let i = 0; i < 6; i++) led(w * 0.15 + i * w * 0.075 + w * 0.02, h - 60, 0xff8a3d);
        break;
      case 'shop':
        screen(w * 0.31, h - 70, 14, 8, 0x3dff8f);
        led(w * 0.27, h - 100, 0xff3d8b);
        break;
      case 'treasury':
        screen(w * 0.08 + w * 0.36 * 0.32, h - 50, w * 0.36 * 0.38, 14, 0x3dff8f);
        screen(w * 0.5 + w * 0.36 * 0.32, h - 50, w * 0.36 * 0.38, 14, 0x3dff8f);
        screen(w * 0.1, h * 0.14, w * 0.5, 14, 0x3dff8f);
        break;
      case 'bar':
        for (let i = 0; i < 7; i++) led(w * 0.63 + i * w * 0.045 + 3, h - 128, [0xff3d8b, 0x2ee6c8, 0xffc857, 0x3fd0ff, 0x8b5cf6, 0xff8a3d, 0x3dff8f][i]);
        break;
      case 'server': {
        const racks = 2 + this.level;
        for (let i = 0; i < racks; i++) {
          const x = w * 0.08 + i * (w * 0.78) / racks;
          for (let r = 0; r < 8; r++) led(x + 10, h - 108 + r * 10, r % 3 === 0 ? 0x3dff8f : 0x3fd0ff);
        }
        break;
      }
      case 'studio':
        screen(w * 0.04 + w * 0.34 * 0.32, h - 50, w * 0.34 * 0.38, 14, 0x2ee6c8);
        led(w * 0.41, h - 75, 0xff4458);
        break;
      case 'lab':
        screen(w * 0.62, h * 0.18, w * 0.26, h * 0.18, 0xffc857);
        break;
    }
  }

  /** Rebuild when the level changes (upgrades visibly change the room). */
  sync(room: Room, dpr: number): void {
    this.room = room;
    if (room.level !== this.level) {
      this.level = room.level;
      const { w, h } = this.rect;
      this.budget.release(w, h, Math.min(2, dpr));
      const old = this.texture;
      this.texture = this.bakeTexture(dpr);
      this.base.texture = this.texture;
      if (this.reflection) this.reflection.texture = this.texture;
      old.destroy(true);
      this.buildDynamics(room.type, w, h);
      this.view.setChildIndex(this.sign, this.view.children.length - 1);
    }
  }

  update(t: number, atm: Atmosphere, cfg: TierConfig, hovered: boolean): void {
    const { w, h } = this.rect;
    const light = ROOMS[this.room.type].light;
    const night = 1 - atm.daylight;
    const lvl = this.level;
    // Interior gets a touch brighter per level; exterior daylight bleeds in through the windows.
    this.base.tint = lerpColor(lerpColor(0x9a90a8, 0xffffff, 0.55 + lvl * 0.15), light, 0.08);
    this.cone.alpha = (0.18 + lvl * 0.06) * (0.7 + night * 0.5) + (hovered ? 0.12 : 0);
    this.cone.scale.x = (w / 180) * (1 + Math.sin(t * 0.9 + this.rect.x) * 0.01);
    // Shaft: warm during the day, tracking the sun; faint at night from the city glow.
    this.shaft.clear();
    const sunShift = (atm.sunX - 0.5) * -90;
    const S = 1.28;
    const pw = w * 0.2;
    const wy = 18 * S;
    const wh = (h / S) * 0.42 * S;
    for (let i = 0; i < 3; i++) {
      const x = w * 0.12 + i * (pw + w * 0.1);
      this.shaft.poly([x, wy, x + pw, wy, x + pw + sunShift * 0.5, h - 10, x + sunShift * 0.5 - 10, h - 10]).fill({ color: lerpColor(0xffd8b0, 0xff8a3d, atm.warmth), alpha: cfg.shafts ? (0.05 + atm.daylight * 0.08 + atm.warmth * 0.06) * (1 - atm.rain * 0.7) : 0 });
    }
    this.glassTint.clear();
    for (let i = 0; i < 3; i++) {
      const x = w * 0.12 + i * (pw + w * 0.1);
      this.glassTint.rect(x, wy, pw, wh).fill({ color: lerpColor(atm.skyHorizon, 0x3fd0ff, 0.3), alpha: 0.12 + atm.rain * 0.2 });
    }
    // Screens cycle frames; LEDs blink.
    for (const s of this.screens) {
      const frames = (s as any).__frames as Texture[];
      const idx = Math.floor((t * 2 + (s as any).__phase) % frames.length);
      s.texture = frames[idx];
      s.alpha = 0.6 + 0.25 * Math.sin(t * 12 + (s as any).__phase);
    }
    for (const l of this.leds) {
      const p = (l as any).__phase as number;
      const blink = this.room.type === 'server' ? (Math.sin(t * 9 + p * 7) > 0.2 ? 1 : 0.15) : 0.7 + 0.3 * Math.sin(t * 3 + p);
      l.alpha = blink * (0.5 + night * 0.4);
    }
    const flick = 0.85 + 0.15 * Math.sin(t * 5 + this.rect.x);
    this.signGlow.alpha = (0.25 + night * 0.4) * flick;
    this.flare.alpha = (0.18 + night * 0.45) * flick * (cfg.bloom ? 1 : 0.6);
    this.flare.scale.x = 0.55 + 0.08 * Math.sin(t * 1.7 + this.rect.x);
    this.sign.alpha = 0.95;
  }
}

const frameCache = new Map<number, Texture[]>();
function screenFrames(renderer: Renderer, color: number): Texture[] {
  const hit = frameCache.get(color);
  if (hit) return hit;
  const frames: Texture[] = [];
  for (let f = 0; f < 6; f++) {
    const g = new Graphics();
    g.rect(0, 0, 64, 32).fill({ color, alpha: 0.18 });
    for (let i = 0; i < 7; i++) {
      const hgt = 4 + hash(f * 11 + i * 3 + color) * 22;
      g.rect(4 + i * 8.5, 30 - hgt, 6, hgt).fill({ color, alpha: 0.75 });
    }
    g.rect(4, 4 + ((f * 5) % 20), 56, 1.5).fill({ color: 0xfff4ec, alpha: 0.6 });
    frames.push(renderer.generateTexture({ target: g, resolution: 1 }));
    g.destroy();
  }
  frameCache.set(color, frames);
  return frames;
}

/* ------------------------------------------------------------------ */
/* Building shell, elevator, roof sign                                 */
/* ------------------------------------------------------------------ */

export class Building {
  readonly view = new Container();
  readonly roomsLayer = new Container();
  readonly workersLayer = new Container();
  readonly frontLayer = new Container();
  private shell = new Graphics();
  private roof = new Container();
  private roofSign: Text | null = null;
  private roofGlow: Sprite;
  private pod: Container;
  private doorL: Graphics;
  private doorR: Graphics;
  private doorOpen = 0;
  private slots = new Map<string, Graphics>();
  private rooms = new Map<string, RoomView>();
  private floors = 0;
  private company = '';
  private lobbyLights: Sprite[] = [];

  constructor(private readonly renderer: Renderer, private readonly budget: TextureBudget, private cfg: TierConfig, private dpr: number) {
    this.view.addChild(this.shell, this.roomsLayer);
    this.pod = new Container();
    const podBody = new Graphics().roundRect(0, 0, ELEV_W - 8, FH - SLAB - 10, 4).fill(0x1a1424).rect(2, 2, ELEV_W - 12, FH - SLAB - 14).fill(0x2a2036).rect(4, 4, ELEV_W - 16, 3).fill({ color: 0xffc857, alpha: 0.8 });
    this.pod.addChild(podBody);
    this.doorL = new Graphics().rect(0, 0, (ELEV_W - 8) / 2, FH - SLAB - 10).fill(0x3a2b4a).rect((ELEV_W - 8) / 2 - 2, 0, 2, FH - SLAB - 10).fill(0xffc857);
    this.doorR = new Graphics().rect(0, 0, (ELEV_W - 8) / 2, FH - SLAB - 10).fill(0x3a2b4a).rect(0, 0, 2, FH - SLAB - 10).fill(0xffc857);
    this.doorR.x = (ELEV_W - 8) / 2;
    this.view.addChild(this.pod, this.workersLayer, this.frontLayer);
    this.frontLayer.addChild(this.doorL, this.doorR);
    this.roofGlow = new Sprite(radialTexture(256, 0, 2));
    this.roofGlow.anchor.set(0.5);
    this.roofGlow.blendMode = 'add';
    this.roofGlow.tint = 0xff3d8b;
    this.view.addChild(this.roof);
    this.roof.addChild(this.roofGlow);
  }

  get roomViews(): Map<string, RoomView> {
    return this.rooms;
  }

  sync(s: GameState): void {
    // Rooms.
    const seen = new Set<string>();
    for (const r of s.rooms) {
      seen.add(r.id);
      let rv = this.rooms.get(r.id);
      if (!rv) {
        rv = new RoomView(this.renderer, this.budget, r, this.cfg, this.dpr);
        this.rooms.set(r.id, rv);
        this.roomsLayer.addChild(rv.view);
      } else rv.sync(r, this.dpr);
    }
    for (const [id, rv] of this.rooms) {
      if (!seen.has(id)) {
        rv.view.destroy({ children: true });
        this.rooms.delete(id);
      }
    }
    if (s.floors !== this.floors || s.company !== this.company || this.slots.size !== s.floors * 3 - s.rooms.length) {
      this.floors = s.floors;
      this.company = s.company;
      this.drawShell(s);
    }
  }

  private drawShell(s: GameState): void {
    const g = this.shell;
    g.clear();
    const floors = s.floors;
    const top = -floors * FH;
    // Plinth and lobby.
    g.rect(-30, 0, WB + 60, 24).fill(0x16111f).rect(-30, 0, WB + 60, 3).fill({ color: 0xffc857, alpha: 0.4 });
    // Outer walls and slabs.
    g.rect(-16, top - 10, 16, floors * FH + 10).fill(0x1e1729).rect(WB, top - 10, 16, floors * FH + 10).fill(0x1e1729);
    g.rect(-16, top - 10, 4, floors * FH + 10).fill({ color: 0xff8a3d, alpha: 0.25 }); // sunset rim
    for (let f = 0; f <= floors; f++) {
      const y = -f * FH;
      g.rect(-16, y - SLAB, WB + 32, SLAB).fill(0x241c2e).rect(-16, y - SLAB, WB + 32, 2).fill({ color: 0xfff4ec, alpha: 0.08 });
    }
    // Elevator shaft.
    const ex = ELEVATOR_X * WB - ELEV_W / 2;
    g.rect(ex - 4, top - SLAB, ELEV_W + 8, floors * FH + SLAB).fill(0x120d1a).rect(ex - 4, top - SLAB, 3, floors * FH + SLAB).fill(0x34283f).rect(ex + ELEV_W + 1, top - SLAB, 3, floors * FH + SLAB).fill(0x34283f);
    for (let f = 0; f < floors; f++) {
      const y = -(f + 1) * FH;
      g.rect(ex + ELEV_W / 2 - 1, y, 2, FH - SLAB).fill({ color: 0x2ee6c8, alpha: 0.15 }); // guide rail
      g.rect(ex, y + 6, ELEV_W, 6).fill(0x1e1729).rect(ex + 8, y + 8, 14, 2).fill({ color: 0xffc857, alpha: 0.8 }); // floor indicator
    }
    // Empty slots: dashed outlines with a "build" marker.
    for (const sl of this.slots.values()) sl.destroy();
    this.slots.clear();
    for (let f = 0; f < floors; f++) {
      for (let slot = 0; slot < 3; slot++) {
        if (s.rooms.some((r) => r.floor === f && r.slot === slot)) continue;
        const [a, b] = SLOT_X[slot];
        const x = a * WB;
        const w = (b - a) * WB;
        const y = -(f + 1) * FH;
        const sg = new Graphics();
        sg.rect(x, y, w, FH - SLAB).fill(0x0f0b16);
        // Bare concrete, exposed studs, a plus sign.
        for (let i = 1; i < 5; i++) sg.rect(x + (w / 5) * i, y + 10, 2, FH - SLAB - 20).fill({ color: 0x241c2e, alpha: 0.8 });
        sg.roundRect(x + w / 2 - 22, y + (FH - SLAB) / 2 - 22, 44, 44, 10).stroke({ width: 2, color: 0xffc857, alpha: 0.6 });
        sg.rect(x + w / 2 - 10, y + (FH - SLAB) / 2 - 2, 20, 4).fill({ color: 0xffc857, alpha: 0.8 }).rect(x + w / 2 - 2, y + (FH - SLAB) / 2 - 10, 4, 20).fill({ color: 0xffc857, alpha: 0.8 });
        this.slots.set(`${f}-${slot}`, sg);
        this.roomsLayer.addChildAt(sg, 0);
      }
    }
    // Roof: parapet, antenna, water tank, neon company sign.
    this.roof.removeChildren();
    this.roof.addChild(this.roofGlow);
    const rg = new Graphics();
    rg.rect(-20, top - SLAB - 8, WB + 40, 8).fill(0x2a2036);
    rg.rect(WB * 0.78, top - SLAB - 60, 50, 52).fill(0x1e1729).rect(WB * 0.78, top - SLAB - 60, 50, 4).fill(0x34283f);
    rg.rect(WB * 0.1, top - SLAB - 110, 4, 102).fill(0x34283f);
    rg.circle(WB * 0.1 + 2, top - SLAB - 112, 3).fill(0xff4458);
    rg.rect(WB * 0.2, top - SLAB - 20, 20, 12).fill(0x1e1729).rect(WB * 0.26, top - SLAB - 16, 16, 8).fill(0x1e1729);
    this.roof.addChild(rg);
    this.roofSign = new Text({ text: (s.company || 'NEON HQ').toUpperCase(), style: { ...textStyle(54, 0xff3d8b), dropShadow: { color: 0xff3d8b, blur: 14, distance: 0, alpha: 0.9 } }, resolution: Math.min(2, this.dpr) });
    this.roofSign.anchor.set(0.5, 1);
    this.roofSign.position.set(WB / 2, top - SLAB - 14);
    const frame = new Graphics().rect(WB / 2 - this.roofSign.width / 2 - 16, top - SLAB - 14 - this.roofSign.height - 6, this.roofSign.width + 32, this.roofSign.height + 10).stroke({ width: 2, color: 0x34283f });
    for (let i = 0; i < 4; i++) frame.rect(WB / 2 - this.roofSign.width / 2 - 12 + i * ((this.roofSign.width + 24) / 3), top - SLAB - 14, 3, 6).fill(0x34283f);
    this.roof.addChild(frame, this.roofSign);
    this.roofGlow.position.set(WB / 2, top - SLAB - 14 - this.roofSign.height / 2);
    this.roofGlow.scale.set(this.roofSign.width / 120, 0.9);
    // Lobby lights.
    for (const l of this.lobbyLights) l.destroy();
    this.lobbyLights = [];
    for (let i = 0; i < 2; i++) {
      const l = new Sprite(radialTexture(128, 0, 2));
      l.anchor.set(0.5);
      l.blendMode = 'add';
      l.tint = 0xffc857;
      l.position.set(i ? WB + 8 : -8, -40);
      l.scale.set(0.8);
      this.frontLayer.addChild(l);
      this.lobbyLights.push(l);
    }
  }

  setQuality(cfg: TierConfig, dpr: number): void {
    this.cfg = cfg;
    this.dpr = dpr;
  }

  update(t: number, s: GameState, atm: Atmosphere, hoveredRoom: string | null): void {
    const night = 1 - atm.daylight;
    this.shell.tint = lerpColor(0x7a6f88, 0xffffff, atm.ambient);
    for (const rv of this.rooms.values()) rv.update(t, atm, this.cfg, hoveredRoom === rv.room.id);
    const flick = 0.85 + 0.15 * Math.sin(t * 3.1) + (Math.sin(t * 17) > 0.98 ? -0.3 : 0);
    this.roofGlow.alpha = (0.25 + night * 0.5) * flick;
    if (this.roofSign) this.roofSign.alpha = 0.9 + 0.1 * flick;
    for (const l of this.lobbyLights) l.alpha = 0.3 + night * 0.5;
    // Elevator pod follows riders; doors open when someone is boarding.
    let podFloor = 0;
    let boarding = false;
    let riders = 0;
    for (const w of s.workers) {
      if (w.state === 'elevator') {
        const target = s.rooms.find((r) => r.id === w.targetRoomId);
        if (target) {
          const total = 0.28 * Math.abs(target.floor - w.floor) + 0.1;
          const p = 1 - Math.max(0, Math.min(1, w.stateTimer / total));
          podFloor += lerp(w.floor, target.floor, easeInOut(p));
          riders++;
          if (p < 0.08 || p > 0.92) boarding = true;
        }
      } else if (w.state === 'walk' && Math.abs(w.x - ELEVATOR_X) < 0.02) {
        boarding = true;
        if (!riders) podFloor = w.floor;
      }
    }
    if (riders) podFloor /= riders;
    else if (!boarding) podFloor = (this.pod as any).__restFloor ?? 0;
    (this.pod as any).__restFloor = podFloor;
    const ex = ELEVATOR_X * WB - ELEV_W / 2 + 4;
    const py = -(podFloor + 1) * FH + 5;
    this.pod.position.set(ex, lerp(this.pod.y || py, py, 0.2));
    this.doorOpen = lerp(this.doorOpen, boarding ? 1 : 0, 0.15);
    const half = (ELEV_W - 8) / 2;
    this.doorL.position.set(ex - half * 0.9 * this.doorOpen, this.pod.y);
    this.doorR.position.set(ex + half + half * 0.9 * this.doorOpen, this.pod.y);
  }
}

function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

export { hash };
