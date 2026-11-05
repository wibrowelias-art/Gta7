import * as THREE from 'three';
import { Rng } from '../game/rng';
import { buildHuman, OUTFITS, type HumanRig } from './human';
import type { Car } from './vehicle';
import { BLOCK, CELL, CITY_HALF, GRID, SIDEWALK } from './world';
import type { Solid3 } from './props';

type Mode = 'walk' | 'jog' | 'talk' | 'sit' | 'phone' | 'flee' | 'hit';

export interface Npc {
  rig: HumanRig;
  mesh: THREE.Group;
  pos: THREE.Vector3;
  heading: number;
  speed: number;
  loop: THREE.Vector2[];
  idx: number;
  mode: Mode;
  modeT: number;
  phase: number;
  hit: number;
  vel: THREE.Vector3;
  /** For talk groups: the spot and who to face. */
  spot: THREE.Vector2 | null;
  seatHeading: number;
}

/** Pedestrians with lives: walking loops, joggers, chatting groups, people sitting at cafés, phones, and panic when cars come at them. */
export class Npcs {
  list: Npc[] = [];
  hits = 0;
  private rng: Rng;

  constructor(private scene: THREE.Scene, count: number, hangouts: { x: number; z: number }[], seats: { x: number; z: number; heading: number }[], seed = 5) {
    this.rng = new Rng(seed);
    let hi = 0;
    let si = 0;
    for (let i = 0; i < count; i++) {
      const roll = this.rng.next();
      if (roll < 0.22 && hi < hangouts.length * 3) {
        const h = hangouts[Math.floor(hi / 3) % hangouts.length];
        const a = (hi % 3) * 2.1 + this.rng.next() * 0.5;
        this.spawn('talk', new THREE.Vector2(h.x + Math.cos(a) * 0.9, h.z + Math.sin(a) * 0.9), new THREE.Vector2(h.x, h.z));
        hi++;
      } else if (roll < 0.34 && si < seats.length) {
        const s = seats[si++];
        this.spawn('sit', new THREE.Vector2(s.x, s.z), null, s.heading);
      } else if (roll < 0.44) this.spawn('jog');
      else if (roll < 0.52) this.spawn('phone');
      else this.spawn('walk');
    }
  }

  private spawn(mode: Mode, at?: THREE.Vector2, spot: THREE.Vector2 | null = null, seatHeading = 0): void {
    const bx = this.rng.int(0, GRID - 1);
    const bz = this.rng.int(0, GRID - 1);
    const cx = -CITY_HALF + bx * CELL + CELL / 2;
    const cz = -CITY_HALF + bz * CELL + CELL / 2;
    const r = BLOCK / 2 + SIDEWALK - 1.6;
    const loop = [new THREE.Vector2(cx - r, cz - r), new THREE.Vector2(cx + r, cz - r), new THREE.Vector2(cx + r, cz + r), new THREE.Vector2(cx - r, cz + r)];
    if (this.rng.chance(0.5)) loop.reverse();
    const base = this.rng.pick(OUTFITS);
    const rig = buildHuman({ ...base, top: this.rng.chance(0.5) ? base.top : this.rng.pick(OUTFITS).top, skin: this.rng.pick(OUTFITS).skin, cap: mode === 'jog' ? this.rng.chance(0.6) : base.cap });
    const idx = this.rng.int(0, 3);
    const start = at ?? loop[idx].clone().lerp(loop[(idx + 1) % 4], this.rng.next());
    const n: Npc = {
      rig,
      mesh: rig.group,
      pos: new THREE.Vector3(start.x, 0, start.y),
      heading: this.rng.next() * Math.PI * 2,
      speed: mode === 'jog' ? this.rng.range(3.2, 4.2) : this.rng.range(1.0, 1.7),
      loop,
      idx: (idx + 1) % 4,
      mode,
      modeT: this.rng.range(4, 14),
      phase: this.rng.next() * 10,
      hit: 0,
      vel: new THREE.Vector3(),
      spot,
      seatHeading,
    };
    rig.group.position.set(n.pos.x, 0.3, n.pos.z);
    rig.group.scale.setScalar(0.94 + this.rng.next() * 0.12);
    this.scene.add(rig.group);
    this.list.push(n);
  }

  update(dt: number, t: number, cars: Car[], playerPos: THREE.Vector3, horn: boolean, solids: Solid3[]): void {
    for (const n of this.list) {
      const r = n.rig;
      if (n.mode === 'hit') {
        n.hit += dt;
        n.pos.addScaledVector(n.vel, dt);
        n.vel.multiplyScalar(Math.pow(0.05, dt));
        n.mesh.position.set(n.pos.x, Math.max(0.3, 0.3 + Math.sin(Math.min(Math.PI, n.hit * 3)) * 1.2), n.pos.z);
        n.mesh.rotation.x = Math.min(Math.PI / 2, n.hit * 4);
        if (n.hit > 7) {
          n.hit = 0;
          n.mode = 'walk';
          n.mesh.rotation.x = 0;
          const s = n.loop[n.idx];
          n.pos.set(s.x, 0, s.y);
        }
        continue;
      }
      // Danger: a fast car heading our way, or the player's horn nearby → flee.
      let threat: Car | null = null;
      for (const c of cars) {
        const dx = n.pos.x - c.pos.x;
        const dz = n.pos.z - c.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 14) continue;
        const sp = c.vel.length();
        const closing = (c.vel.x * dx + c.vel.z * dz) / (d || 1);
        if ((sp > 6 && closing > 3 && d < 12) || (horn && d < 10 && !c.ai)) {
          threat = c;
          break;
        }
        // Run over.
        if (d < c.radius + 0.5 && sp > 2.5) {
          n.mode = 'hit';
          n.hit = 0.01;
          n.vel.set((dx / d) * sp * 0.8 + c.vel.x * 0.5, 0, (dz / d) * sp * 0.8 + c.vel.z * 0.5);
          if (!c.ai) this.hits++;
          break;
        }
      }
      if (n.mode === 'hit') continue;
      if (threat && n.mode !== 'flee') {
        n.mode = 'flee';
        n.modeT = 2.5 + this.rng.next() * 2;
        (n as any).__prev = (n as any).__prev ?? 'walk';
      }
      n.modeT -= dt;
      let moveSpeed = 0;
      switch (n.mode) {
        case 'flee': {
          const src = (n as any).__threatPos as THREE.Vector3 | undefined;
          const from: THREE.Vector3 = threat ? threat.pos : src ?? playerPos;
          (n as any).__threatPos = from.clone();
          const away = Math.atan2(n.pos.x - from.x, n.pos.z - from.z);
          n.heading = lerpAngle(n.heading, away + Math.sin(t * 3 + n.phase) * 0.3, Math.min(1, dt * 8));
          moveSpeed = 5.2;
          if (n.modeT <= 0 && !threat) {
            n.mode = 'walk';
            n.modeT = this.rng.range(6, 16);
          }
          break;
        }
        case 'walk':
        case 'jog': {
          const target = n.loop[n.idx];
          const dx = target.x - n.pos.x;
          const dz = target.y - n.pos.z;
          if (Math.hypot(dx, dz) < 0.6) n.idx = (n.idx + 1) % 4;
          else n.heading = lerpAngle(n.heading, Math.atan2(dx, dz), Math.min(1, dt * 6));
          moveSpeed = n.mode === 'jog' ? n.speed : n.speed;
          if (n.mode === 'walk' && n.modeT <= 0) {
            // Occasionally stop to look at the phone or a shop window.
            n.mode = 'phone';
            n.modeT = this.rng.range(3, 8);
          }
          break;
        }
        case 'phone': {
          if (n.modeT <= 0) {
            n.mode = 'walk';
            n.modeT = this.rng.range(8, 20);
          }
          break;
        }
        case 'talk': {
          if (n.spot) n.heading = lerpAngle(n.heading, Math.atan2(n.spot.x - n.pos.x, n.spot.y - n.pos.z), Math.min(1, dt * 3));
          break;
        }
        case 'sit':
          n.heading = n.seatHeading;
          break;
      }
      if (moveSpeed > 0) {
        n.pos.x += Math.sin(n.heading) * moveSpeed * dt;
        n.pos.z += Math.cos(n.heading) * moveSpeed * dt;
        // Slide around props.
        for (const s of solids) {
          if (s.minX > n.pos.x + 2 || s.maxX < n.pos.x - 2 || s.minZ > n.pos.z + 2 || s.maxZ < n.pos.z - 2) continue;
          const cx = THREE.MathUtils.clamp(n.pos.x, s.minX, s.maxX);
          const cz = THREE.MathUtils.clamp(n.pos.z, s.minZ, s.maxZ);
          const ddx = n.pos.x - cx;
          const ddz = n.pos.z - cz;
          const d2 = ddx * ddx + ddz * ddz;
          if (d2 < 0.2) {
            const d = Math.sqrt(d2) || 0.001;
            n.pos.x += (ddx / d) * (0.45 - d);
            n.pos.z += (ddz / d) * (0.45 - d);
          }
        }
        // Keep clear of the player.
        const pdx = n.pos.x - playerPos.x;
        const pdz = n.pos.z - playerPos.z;
        const pd = Math.hypot(pdx, pdz);
        if (pd < 0.9 && pd > 1e-3) {
          n.pos.x += (pdx / pd) * (0.9 - pd);
          n.pos.z += (pdz / pd) * (0.9 - pd);
        }
      }
      // Pose.
      r.animate(t + n.phase, moveSpeed, dt);
      if (n.mode === 'phone') {
        r.armR.rotation.x = -1.2;
        r.foreR.rotation.x = -1.6;
        r.head.rotation.x = 0.45;
      } else if (n.mode === 'talk') {
        const g = Math.sin(t * 2.2 + n.phase);
        r.armR.rotation.x = -0.5 + g * 0.25;
        r.foreR.rotation.x = -1.2 + Math.sin(t * 3.1 + n.phase) * 0.3;
        r.armL.rotation.x = -0.2;
        r.foreL.rotation.x = -0.9;
        r.head.rotation.y = Math.sin(t * 0.9 + n.phase) * 0.2;
        r.torso.rotation.y = Math.sin(t * 0.6 + n.phase) * 0.08;
      } else if (n.mode === 'sit') {
        r.hips.position.y = 0.62;
        r.legL.rotation.x = 1.5;
        r.legR.rotation.x = 1.5;
        r.shinL.rotation.x = -1.5;
        r.shinR.rotation.x = -1.5;
        r.armL.rotation.x = -0.6;
        r.armR.rotation.x = -0.6;
        r.foreL.rotation.x = -1.1;
        r.foreR.rotation.x = -1.1;
        r.torso.rotation.x = 0.05;
      } else if (n.mode === 'flee') {
        r.armL.rotation.x = -1.4 + Math.sin(t * 14 + n.phase) * 0.6;
        r.armR.rotation.x = -1.4 - Math.sin(t * 14 + n.phase) * 0.6;
        r.head.rotation.y = Math.sin(t * 4) * 0.4;
      }
      n.mesh.position.set(n.pos.x, 0.3, n.pos.z);
      n.mesh.rotation.y = n.heading;
    }
  }
}

function lerpAngle(a: number, b: number, k: number): number {
  let d = b - a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  return a + d * k;
}
