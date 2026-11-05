import * as THREE from 'three';
import { Rng } from '../game/rng';
import { CELL, CITY_HALF, GRID, ROAD, SIDEWALK, radialSpriteTexture } from './world';

export interface Mission {
  kind: 'delivery' | 'race' | 'taxi';
  title: string;
  detail: string;
  targets: THREE.Vector3[];
  idx: number;
  reward: number;
  timeLeft: number;
  total: number;
}

const DELIVERY_ITEMS = ['a box of vinyl', 'hot ramen', 'a neon sign', 'studio tapes', 'surfboards', 'a crate of mangoes', 'a wedding cake', 'pool cues'];
const PLACES = ['the Palm Lounge', 'Club 88', 'the noodle bar', 'the arcade', 'the motel', 'the vinyl shop', 'the tattoo parlour', 'the cinema'];

/** Mission chain: deliveries, taxi runs and checkpoint races. Rewards cash; fails on timeout. */
export class Missions {
  current: Mission | null = null;
  cash = 0;
  completed = 0;
  marker: THREE.Group;
  private beam: THREE.Mesh;
  private ring: THREE.Mesh;
  private rng = new Rng(99);
  onEvent: (e: { type: 'start' | 'checkpoint' | 'complete' | 'fail'; text: string; amount?: number }) => void = () => {};
  private cooldown = 0;

  constructor(scene: THREE.Scene) {
    this.marker = new THREE.Group();
    this.beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.6, 60, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffc857, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    this.beam.position.y = 30;
    this.ring = new THREE.Mesh(new THREE.RingGeometry(2.2, 3.2, 40), new THREE.MeshBasicMaterial({ color: 0xffc857, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.35;
    const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: radialSpriteTexture(), color: 0xffc857, transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
    glow.scale.set(10, 10, 1);
    glow.position.y = 1;
    this.marker.add(this.beam, this.ring, glow);
    this.marker.visible = false;
    scene.add(this.marker);
  }

  /** A random point on a sidewalk corner next to a road, away from `from`. */
  private randomPoint(from: THREE.Vector3, minDist: number): THREE.Vector3 {
    for (let i = 0; i < 40; i++) {
      const bx = this.rng.int(0, GRID - 1);
      const bz = this.rng.int(0, GRID - 1);
      const cx = -CITY_HALF + bx * CELL + CELL / 2;
      const cz = -CITY_HALF + bz * CELL + CELL / 2;
      const side = this.rng.int(0, 3);
      const off = CELL / 2 - SIDEWALK - ROAD / 2 + 3; // on the road edge next to the sidewalk
      const p = side === 0 ? new THREE.Vector3(cx + off, 0, cz + this.rng.range(-20, 20)) : side === 1 ? new THREE.Vector3(cx - off, 0, cz + this.rng.range(-20, 20)) : side === 2 ? new THREE.Vector3(cx + this.rng.range(-20, 20), 0, cz + off) : new THREE.Vector3(cx + this.rng.range(-20, 20), 0, cz - off);
      if (p.distanceTo(from) > minDist) return p;
    }
    return new THREE.Vector3(0, 0, 0);
  }

  start(from: THREE.Vector3): void {
    const roll = this.rng.next();
    let m: Mission;
    if (roll < 0.5) {
      const target = this.randomPoint(from, 120);
      const dist = target.distanceTo(from);
      m = { kind: 'delivery', title: 'Delivery', detail: `Bring ${this.rng.pick(DELIVERY_ITEMS)} to ${this.rng.pick(PLACES)}`, targets: [target], idx: 0, reward: Math.round(dist * 2.2), timeLeft: 20 + dist / 9, total: 0 };
    } else if (roll < 0.8) {
      const pickup = this.randomPoint(from, 90);
      const drop = this.randomPoint(pickup, 150);
      const dist = from.distanceTo(pickup) + pickup.distanceTo(drop);
      m = { kind: 'taxi', title: 'Taxi run', detail: 'Pick up the fare, then take them to ' + this.rng.pick(PLACES), targets: [pickup, drop], idx: 0, reward: Math.round(dist * 2.6), timeLeft: 30 + dist / 9, total: 0 };
    } else {
      const targets: THREE.Vector3[] = [];
      let last = from;
      for (let i = 0; i < 4; i++) {
        const p = this.randomPoint(last, 100);
        targets.push(p);
        last = p;
      }
      let dist = 0;
      last = from;
      for (const p of targets) {
        dist += last.distanceTo(p);
        last = p;
      }
      m = { kind: 'race', title: 'Street race', detail: 'Hit all 4 checkpoints before the clock runs out', targets, idx: 0, reward: Math.round(dist * 3.5), timeLeft: dist / 12 + 15, total: 0 };
    }
    m.total = m.timeLeft;
    this.current = m;
    this.marker.visible = true;
    this.marker.position.copy(m.targets[0]);
    this.onEvent({ type: 'start', text: `${m.title}: ${m.detail}` });
  }

  get target(): THREE.Vector3 | null {
    return this.current ? this.current.targets[this.current.idx] : null;
  }

  update(dt: number, playerPos: THREE.Vector3, t: number, inCar: boolean): void {
    this.ring.rotation.z = t * 0.8;
    (this.ring.material as THREE.MeshBasicMaterial).opacity = 0.6 + Math.sin(t * 4) * 0.3;
    this.beam.scale.set(1 + Math.sin(t * 3) * 0.08, 1, 1 + Math.sin(t * 3) * 0.08);
    if (!this.current) {
      this.cooldown -= dt;
      if (this.cooldown <= 0 && inCar) this.start(playerPos);
      return;
    }
    const m = this.current;
    m.timeLeft -= dt;
    const target = m.targets[m.idx];
    if (playerPos.distanceTo(target) < 4.5) {
      m.idx++;
      if (m.idx >= m.targets.length) {
        const bonus = Math.round(m.reward * Math.max(0, m.timeLeft / m.total) * 0.5);
        this.cash += m.reward + bonus;
        this.completed++;
        this.onEvent({ type: 'complete', text: `${m.title} complete! +$${m.reward}${bonus ? ` (+$${bonus} time bonus)` : ''}`, amount: m.reward + bonus });
        this.current = null;
        this.marker.visible = false;
        this.cooldown = 4;
      } else {
        this.marker.position.copy(m.targets[m.idx]);
        this.onEvent({ type: 'checkpoint', text: m.kind === 'taxi' ? 'Fare on board. Go!' : `Checkpoint ${m.idx}/${m.targets.length}` });
      }
    } else if (m.timeLeft <= 0) {
      this.onEvent({ type: 'fail', text: `${m.title} failed. Too slow!` });
      this.current = null;
      this.marker.visible = false;
      this.cooldown = 5;
    }
  }
}
