import { Container, Graphics, Sprite, Text } from 'pixi.js';
import { OUTFITS, ROOMS } from '../game/data';
import type { GameState, Room, Worker } from '../game/types';
import { FH, WB, floorY } from './building';
import { hash, lerp, lerpColor, radialTexture, shade } from './textures';

export const WORKER_H = 92;

type Anim = 'highfive' | 'stomp' | 'celebrate' | 'stretch' | null;

/** A lightweight skeletal rig built from containers: legs, torso, arms and head pivot around joints. */
export class WorkerView {
  readonly view = new Container();
  private body = new Container();
  private legL = new Container();
  private legR = new Container();
  private armL = new Container();
  private armR = new Container();
  private foreL = new Container();
  private foreR = new Container();
  private head = new Container();
  private eyes: Graphics;
  private mouth: Graphics;
  private rim: Graphics;
  private shadow: Graphics;
  private glow: Sprite;
  private reflection: Sprite;
  private tag: Container;
  private tagText: Text;
  private tagBg: Graphics;
  private moodDot: Graphics;
  private phase: number;
  private walkT = 0;
  private blinkT = 0;
  private lookT = 0;
  private lookDir = 0;
  private stretchT = 0;
  private facing = 1;
  private anim: Anim = null;
  private animT = 0;
  x: number;
  y: number;
  private vx = 0;
  private vy = 0;
  private sinceStateChange = 0;
  private prevState: Worker['state'];

  constructor(public worker: Worker, dpr: number) {
    const [top, bottom, accent, skin, hair] = OUTFITS[worker.outfit % OUTFITS.length];
    this.phase = hash(worker.seed) * 100;
    this.x = worker.x * WB;
    this.y = floorY(worker.floor);
    this.prevState = worker.state;
    const r = (n: number) => hash(worker.seed + n * 31);

    // Shadow and floor reflection.
    this.shadow = new Graphics().ellipse(0, 0, 16, 4).fill({ color: 0x000000, alpha: 0.45 });
    this.reflection = new Sprite(radialTexture(64, 0, 1));
    this.reflection.anchor.set(0.5, 0);
    this.reflection.tint = top;
    this.reflection.alpha = 0.16;
    this.reflection.scale.set(0.55, 0.5);
    this.reflection.blendMode = 'add';
    this.view.addChild(this.shadow, this.reflection, this.body);

    // Legs (pivot at hip, y = -44).
    const legW = 7;
    const legLen = 40;
    const leg = (color: number) => {
      const c = new Container();
      const g = new Graphics();
      g.roundRect(-legW / 2, 0, legW, legLen * 0.55, 3).fill(color); // thigh
      g.roundRect(-legW / 2 + 0.5, legLen * 0.5, legW - 1, legLen * 0.5, 3).fill(shade(color, -0.12)); // shin
      g.roundRect(-legW / 2 - 1, legLen - 3, legW + 5, 5, 2).fill(0x14101a); // shoe
      g.rect(-legW / 2 + 2, legLen - 3, legW + 1, 1).fill({ color: accent, alpha: 0.9 }); // shoe accent
      c.addChild(g);
      c.position.set(0, -44);
      return c;
    };
    this.legL = leg(bottom);
    this.legR = leg(shade(bottom, -0.08));
    this.legL.x = -4;
    this.legR.x = 4;

    // Torso: outfit variants per seed (jacket, hoodie, tee, shirt+tie).
    const torso = new Graphics();
    const variant = Math.floor(r(1) * 4);
    torso.roundRect(-12, -78, 24, 36, 7).fill(top); // chest/waist
    torso.rect(-12, -58, 24, 16).fill(shade(top, -0.08));
    if (variant === 0) {
      // Jacket with lapels.
      torso.poly([-12, -78, -4, -78, -1, -60, -12, -62]).fill(shade(top, -0.25));
      torso.poly([12, -78, 4, -78, 1, -60, 12, -62]).fill(shade(top, -0.25));
      torso.rect(-1, -78, 2, 30).fill(0xfff4ec);
    } else if (variant === 1) {
      // Hoodie: pocket and drawstrings.
      torso.roundRect(-8, -56, 16, 10, 3).fill(shade(top, -0.18));
      torso.rect(-3, -76, 1.5, 12).fill(0xfff4ec).rect(2, -76, 1.5, 12).fill(0xfff4ec);
    } else if (variant === 2) {
      // Tee with print.
      torso.circle(0, -66, 5).fill({ color: accent, alpha: 0.9 });
    } else {
      // Shirt and tie.
      torso.poly([-1.5, -78, 1.5, -78, 3, -60, 0, -56, -3, -60]).fill(accent);
      torso.rect(-12, -78, 24, 3).fill(shade(top, 0.2));
    }
    // Belt.
    torso.rect(-12, -46, 24, 3).fill(0x14101a).rect(-2, -46, 4, 3).fill(accent);
    // Side shading (right side darker = light from the left/room light).
    torso.rect(6, -78, 6, 36).fill({ color: 0x000000, alpha: 0.18 });
    // Neck.
    torso.rect(-4, -84, 8, 7).fill(shade(skin, -0.1));

    // Arms (pivot at shoulder, y = -74).
    const arm = (side: number): [Container, Container] => {
      const c = new Container();
      const upper = new Graphics();
      upper.roundRect(-3.5, 0, 7, 17, 3).fill(shade(top, side > 0 ? -0.15 : 0.05)); // upper arm
      const fore = new Container();
      const fg = new Graphics();
      fg.circle(0, 0, 3.2).fill(shade(top, side > 0 ? -0.18 : 0)); // elbow
      fg.roundRect(-3, 0, 6, 15, 3).fill(variant === 2 ? shade(skin, 0) : shade(top, side > 0 ? -0.22 : -0.02)); // forearm / sleeve
      fg.circle(0, 16, 3.5).fill(skin); // hand
      fore.addChild(fg);
      fore.position.set(0, 16);
      c.addChild(upper, fore);
      c.position.set(side * 11, -74);
      return [c, fore];
    };
    [this.armL, this.foreL] = arm(-1);
    [this.armR, this.foreR] = arm(1);

    // Head (pivot at neck, y = -84).
    this.head.position.set(0, -84);
    const face = new Graphics();
    face.ellipse(0, -9, 8.5, 10).fill(skin);
    face.ellipse(2, -9, 6.5, 9.5).fill({ color: 0x000000, alpha: 0.08 }); // cheek shade on the far side
    face.rect(-1, -2, 4, 1.2).fill({ color: shade(skin, -0.25), alpha: 0.8 }); // chin line
    face.ellipse(-8, -8, 1.6, 2.4).fill(shade(skin, -0.08)); // ear
    // Hair (varies).
    const hs = Math.floor(r(2) * 5);
    const hg = new Graphics();
    if (hs === 0) hg.ellipse(0, -14, 9, 6).fill(hair).rect(-9, -14, 4, 8).fill(hair);
    else if (hs === 1) hg.ellipse(0, -13, 9.5, 7.5).fill(hair).rect(-9.5, -13, 19, 6).fill(hair).rect(-9.5, -8, 3, 10).fill(hair).rect(6.5, -8, 3, 10).fill(hair);
    else if (hs === 2) hg.ellipse(0, -16, 8, 6).fill(hair);
    else if (hs === 3) hg.ellipse(0, -15, 10, 7).fill(hair).rect(-10, -15, 20, 4).fill(hair).ellipse(0, -20, 6, 4).fill(hair);
    else hg.ellipse(0, -13, 9, 6).fill(hair).rect(-9, -13, 18, 3).fill(hair).rect(-9, -12, 2, 6).fill(hair);
    // Eyes, brows, mouth.
    this.eyes = new Graphics();
    this.eyes.ellipse(-3.5, -10, 1.9, 1.3).fill(0xfff4ec).ellipse(3.5, -10, 1.9, 1.3).fill(0xfff4ec);
    this.eyes.circle(-3.2, -10, 1).fill(0x1a1016).circle(3.8, -10, 1).fill(0x1a1016);
    this.eyes.position.set(0, 0);
    const brows = new Graphics().moveTo(-5.5, -13).lineTo(-1.5, -13.5).moveTo(1.5, -13.5).lineTo(5.5, -13).stroke({ width: 1, color: hair, cap: 'round' });
    this.mouth = new Graphics().moveTo(-2.5, -4).quadraticCurveTo(0, -2.5, 2.5, -4).stroke({ width: 1, color: shade(skin, -0.45), cap: 'round' });
    // Accessories.
    const acc = new Graphics();
    if (r(3) > 0.65) acc.ellipse(-3.5, -10, 3, 2.2).stroke({ width: 0.8, color: accent }).ellipse(3.5, -10, 3, 2.2).stroke({ width: 0.8, color: accent }).moveTo(-0.5, -10).lineTo(0.5, -10).stroke({ width: 0.8, color: accent });
    if (r(4) > 0.75) acc.roundRect(-10, -14, 20, 4, 2).fill(0x1a1016).circle(-9, -9, 2.5).fill(0x1a1016).circle(9, -9, 2.5).fill(0x1a1016); // headphones
    if (r(5) > 0.8) acc.circle(-8, -5, 1).fill(0xffc857); // earring
    this.head.addChild(face, this.eyes, brows, this.mouth, hg, acc);

    // Rim light outline (tinted to the room light each frame).
    this.rim = new Graphics();
    this.rim.moveTo(-12, -76).lineTo(-12, -44).stroke({ width: 1.5, color: 0xffffff, alpha: 0.7, cap: 'round' });
    this.rim.moveTo(-8, -18).lineTo(-8.5, -8).stroke({ width: 1.2, color: 0xffffff, alpha: 0.6, cap: 'round' });
    this.rim.y = 0;
    this.rim.alpha = 0.5;

    // Screen glow on the face while typing.
    this.glow = new Sprite(radialTexture(64, 0, 2));
    this.glow.anchor.set(0.5);
    this.glow.blendMode = 'add';
    this.glow.position.set(6, -92);
    this.glow.scale.set(0.5);
    this.glow.alpha = 0;

    this.body.addChild(this.legL, this.legR, torso, this.armL, this.armR, this.head, this.rim, this.glow);

    // Name tag.
    this.tag = new Container();
    this.tagText = new Text({ text: worker.name.toUpperCase(), style: { fontFamily: 'Barlow Condensed', fontWeight: '700', fontSize: 15, fill: 0xfff4ec, letterSpacing: 1.5 }, resolution: Math.min(2, dpr) });
    this.tagText.anchor.set(0.5);
    this.tagBg = new Graphics();
    this.moodDot = new Graphics();
    this.tag.addChild(this.tagBg, this.tagText, this.moodDot);
    this.tag.position.set(0, -WORKER_H - 16);
    this.view.addChild(this.tag);
    this.drawTag(0x3dff8f);
  }

  private drawTag(color: number): void {
    const w = this.tagText.width + 16;
    this.tagBg.clear().roundRect(-w / 2, -10, w, 20, 6).fill({ color: 0x0a0710, alpha: 0.62 }).roundRect(-w / 2, -10, w, 20, 6).stroke({ width: 1, color: 0xfff4ec, alpha: 0.14 });
    this.moodDot.clear().circle(w / 2 - 4, -6, 3).fill(color);
  }

  play(anim: Anim): void {
    this.anim = anim;
    this.animT = 0;
  }

  update(dt: number, t: number, w: Worker, s: GameState, room: Room | undefined, zoom: number, reduced: boolean): void {
    this.worker = w;
    this.sinceStateChange += dt;
    if (w.state !== this.prevState) {
      this.prevState = w.state;
      this.sinceStateChange = 0;
      if (w.state === 'celebrate') this.play('celebrate');
      if (w.state === 'stomp') this.play('stomp');
    }
    // Target position from the sim; elevator riders slide between floors.
    const tx = w.x * WB;
    let ty = floorY(w.floor);
    let inElevator = false;
    if (w.state === 'elevator') {
      const target = s.rooms.find((r) => r.id === w.targetRoomId);
      if (target) {
        const total = 0.28 * Math.abs(target.floor - w.floor) + 0.1;
        const p = 1 - Math.max(0, Math.min(1, w.stateTimer / total));
        const e = p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2;
        ty = floorY(lerp(w.floor, target.floor, e));
        inElevator = true;
      }
    }
    // Smooth acceleration / deceleration toward the target.
    const stiff = reduced ? 60 : 18;
    const ax = (tx - this.x) * stiff - this.vx * 2 * Math.sqrt(stiff);
    this.vx += ax * dt;
    this.x += this.vx * dt;
    if (inElevator) this.y = ty;
    else {
      this.vy = (ty - this.y) * 12;
      this.y += this.vy * dt;
      if (Math.abs(ty - this.y) < 0.5) this.y = ty;
    }
    if (Math.abs(tx - this.x) < 0.3 && Math.abs(this.vx) < 2) {
      this.x = tx;
      this.vx = 0;
    }
    const speed = Math.abs(this.vx);
    const walking = speed > 6;
    if (walking) this.facing = this.vx > 0 ? 1 : -1;
    else if (room && w.state === 'work') this.facing = w.x < (room.slot + 0.5) / 3 + 0.1 ? 1 : -1;

    this.view.position.set(this.x, this.y);
    this.view.zIndex = this.y;
    this.view.visible = !inElevator || true;
    this.body.scale.x = this.facing;
    this.body.alpha = inElevator ? 0.85 : 1;

    // Animation.
    const ph = this.phase;
    let bob = 0;
    let legA = 0;
    let armA = 0;
    let headA = 0;
    let bodyScaleY = 1;
    let armRaiseL = 0;
    let armRaiseR = 0;
    let foreBendL = 0;
    let foreBendR = 0;
    let lean = 0;
    if (walking) {
      this.walkT += dt * Math.min(14, 4 + speed / 12);
      legA = Math.sin(this.walkT) * 0.65 * Math.min(1, speed / 90);
      armA = -legA * 0.8;
      bob = Math.abs(Math.sin(this.walkT)) * 2.2;
      lean = this.facing * 0.04 * Math.min(1, speed / 120);
    } else {
      // Idle breathing.
      bodyScaleY = 1 + Math.sin(t * 2.1 + ph) * 0.012;
      bob = Math.sin(t * 2.1 + ph) * 0.6;
      if (w.state === 'work' && room && room.type !== 'bar') {
        // Typing: forearms forward with a jitter; face lit by the screen.
        armRaiseL = -0.55 + Math.sin(t * 16 + ph) * 0.05;
        armRaiseR = -0.5 + Math.cos(t * 15 + ph) * 0.05;
        foreBendL = -1.1 + Math.sin(t * 16 + ph) * 0.1;
        foreBendR = -1.15 + Math.cos(t * 15 + ph) * 0.1;
        lean = this.facing * 0.06;
        headA = 0.12 * this.facing;
      } else if (w.state === 'rest' || (room?.type === 'bar' && w.state === 'work')) {
        // Leaning at the bar / taking a pool shot now and then.
        const shot = (t * 0.6 + ph) % 6 < 0.8;
        armRaiseL = shot ? -1.5 : -0.4;
        armRaiseR = shot ? -1.3 : -0.3;
        foreBendL = shot ? -0.4 : -0.9;
        foreBendR = shot ? -0.2 : -0.8;
        lean = shot ? this.facing * 0.22 : this.facing * 0.08;
        bob += shot ? -2 : 0;
      } else if (w.state === 'meeting') {
        armRaiseL = -0.3;
        armRaiseR = -0.3 + Math.sin(t * 2 + ph) * 0.3;
        foreBendL = -1.2;
        foreBendR = -1.0 + Math.sin(t * 2 + ph) * 0.3;
        headA = Math.sin(t * 0.8 + ph) * 0.08;
      }
    }
    // Stretch when tired.
    if (w.energy < 32 && !walking && w.state === 'work') {
      this.stretchT += dt;
      const cycle = this.stretchT % 9;
      if (cycle < 1.4) {
        const k = Math.sin((cycle / 1.4) * Math.PI);
        armRaiseL = -3.0 * k - 0.2;
        armRaiseR = -3.1 * k - 0.2;
        bodyScaleY = 1 + 0.04 * k;
        lean = 0;
      }
    }
    // Look around occasionally.
    this.lookT -= dt;
    if (this.lookT <= 0) {
      this.lookT = 2 + hash(t + ph) * 5;
      this.lookDir = (hash(t * 3 + ph) - 0.5) * 2;
    }
    const look = walking ? 0 : this.lookDir * 0.12;
    // Blink.
    this.blinkT -= dt;
    if (this.blinkT <= 0) this.blinkT = 2.5 + hash(t * 7 + ph) * 3.5;
    const blink = this.blinkT < 0.12 ? 0.1 : 1;

    // One-shot animations.
    if (this.anim) {
      this.animT += dt;
      const k = this.animT;
      if (this.anim === 'celebrate') {
        const j = Math.max(0, Math.sin(k * 7)) * 10;
        bob -= j;
        armRaiseL = -2.8 + Math.sin(k * 14) * 0.3;
        armRaiseR = -2.9 - Math.sin(k * 14) * 0.3;
        if (k > 1.4) this.anim = null;
      } else if (this.anim === 'highfive') {
        armRaiseR = -2.6 * Math.sin(Math.min(1, k * 2) * Math.PI);
        bob -= Math.max(0, Math.sin(k * 6)) * 4;
        if (k > 0.9) this.anim = null;
      } else if (this.anim === 'stomp') {
        const st = Math.max(0, Math.sin(k * 10));
        bob += st * 3;
        bodyScaleY = 1 - st * 0.08;
        legA = Math.sin(k * 10) * 0.3;
        headA = -0.15 * this.facing;
        lean = (Math.random() - 0.5) * 0.06;
        if (k > 1.2) this.anim = null;
      } else if (this.anim === 'stretch') {
        const kk = Math.sin(Math.min(1, k / 1.2) * Math.PI);
        armRaiseL = -3 * kk;
        armRaiseR = -3 * kk;
        if (k > 1.2) this.anim = null;
      }
    }

    this.body.y = -bob;
    this.body.scale.y = bodyScaleY;
    this.body.rotation = lean;
    this.legL.rotation = legA;
    this.legR.rotation = -legA;
    this.armL.rotation = armRaiseL || armA;
    this.armR.rotation = armRaiseR || -armA;
    this.foreL.rotation = foreBendL || (walking ? -0.35 : -0.15);
    this.foreR.rotation = foreBendR || (walking ? -0.35 : -0.15);
    this.head.rotation = headA + look * 0.5;
    this.eyes.x = look * 2;
    this.eyes.scale.y = blink;
    this.shadow.scale.set(1 - bob * 0.02, 1);
    this.shadow.alpha = inElevator ? 0 : 0.45;
    this.reflection.alpha = inElevator ? 0 : 0.14;

    // Mouth follows mood.
    const moodK = (w.mood - 50) / 50;
    this.mouth.clear().moveTo(-2.5, -4).quadraticCurveTo(0, -4 + moodK * 2.2, 2.5, -4).stroke({ width: 1, color: 0x5a3a2a, cap: 'round' });

    // Room light rim and typing glow.
    const light = room ? ROOMS[room.type].light : 0xffc857;
    this.rim.tint = light;
    this.rim.alpha = room ? 0.6 : 0.3;
    this.glow.tint = light;
    this.glow.alpha = w.state === 'work' && room && room.type !== 'bar' && !walking ? 0.35 + Math.sin(t * 9 + ph) * 0.08 : 0;
    this.glow.x = 6;

    // Name tag keeps a readable size at any zoom.
    const tagScale = Math.min(1.6, Math.max(0.9, 1 / zoom));
    this.tag.scale.set(tagScale);
    this.tag.y = -WORKER_H - 14 * tagScale - bob;
    const dotColor = w.wantsRaise ? 0xff4458 : w.mood < 45 ? 0xff8a3d : w.energy < 25 ? 0x3fd0ff : 0x3dff8f;
    if ((this.moodDot as any).__c !== dotColor) {
      (this.moodDot as any).__c = dotColor;
      this.drawTag(dotColor);
    }
    this.tag.alpha = inElevator ? 0.4 : 1;
    void FH;
    void lerpColor;
  }
}
