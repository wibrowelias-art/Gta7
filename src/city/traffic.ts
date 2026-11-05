import * as THREE from 'three';
import { Rng } from '../game/rng';
import { Car, CAR_COLORS } from './vehicle';
import { buildHuman } from './player';
import { BLOCK, CELL, CITY_HALF, GRID, LANE, SIDEWALK, type Box2, type World } from './world';

interface Driver {
  car: Car;
  axis: 'x' | 'z';
  dir: 1 | -1;
  lanePos: number; // target perpendicular coordinate
  targetSpeed: number;
  nextTurnAt: number | null; // intersection coordinate along the axis where a turn decision happens
}

export interface Ped {
  mesh: THREE.Group;
  parts: ReturnType<typeof buildHuman>;
  pos: THREE.Vector3;
  heading: number;
  speed: number;
  /** Block corners (sidewalk loop) the pedestrian walks around. */
  loop: THREE.Vector2[];
  idx: number;
  walkT: number;
  hit: number; // seconds since being hit (0 = fine)
  vel: THREE.Vector3;
}

const SKINS = [0xe3b08a, 0xc98a5a, 0x8d5a3c, 0xf5d7c3, 0x6b4229, 0xd29a74];
const CLOTHES = [0xff3d8b, 0xff8a3d, 0xffc857, 0x2ee6c8, 0x3fd0ff, 0x8b5cf6, 0x3dff8f, 0xfff4ec, 0x3a2b4a, 0x241c2e];

export class Traffic {
  drivers: Driver[] = [];
  peds: Ped[] = [];
  cars: Car[] = [];
  private rng: Rng;
  hits = 0;

  constructor(private scene: THREE.Scene, private world: World, carCount: number, pedCount: number, seed = 3) {
    this.rng = new Rng(seed);
    for (let i = 0; i < carCount; i++) this.spawnCar();
    for (let i = 0; i < pedCount; i++) this.spawnPed();
  }

  private laneOffset(axis: 'x' | 'z', dir: 1 | -1): number {
    // Right-hand traffic: lane centre sits to the right of the road centre line.
    // axis x, dir +1 → right = -z ; axis z, dir +1 → right = +x.
    return axis === 'x' ? -dir * (LANE / 2 + 0.3) : dir * (LANE / 2 + 0.3);
  }

  private spawnCar(): void {
    const car = new Car(this.rng.pick(CAR_COLORS), false, false);
    car.ai = true;
    const axis: 'x' | 'z' = this.rng.chance(0.5) ? 'x' : 'z';
    const dir: 1 | -1 = this.rng.chance(0.5) ? 1 : -1;
    const roads = axis === 'x' ? this.world.roadsZ : this.world.roadsX;
    const roadCoord = this.rng.pick(roads);
    const along = this.rng.range(-CITY_HALF + 10, CITY_HALF - 10);
    const lanePos = roadCoord + this.laneOffset(axis, dir);
    if (axis === 'x') car.place(along, lanePos, dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    else car.place(lanePos, along, dir > 0 ? 0 : Math.PI);
    this.scene.add(car.mesh);
    this.cars.push(car);
    this.drivers.push({ car, axis, dir, lanePos, targetSpeed: this.rng.range(9, 14), nextTurnAt: null });
  }

  private spawnPed(): void {
    const bx = this.rng.int(0, GRID - 1);
    const bz = this.rng.int(0, GRID - 1);
    const cx = -CITY_HALF + bx * CELL + CELL / 2;
    const cz = -CITY_HALF + bz * CELL + CELL / 2;
    const r = BLOCK / 2 + SIDEWALK - 1.6;
    const loop = [new THREE.Vector2(cx - r, cz - r), new THREE.Vector2(cx + r, cz - r), new THREE.Vector2(cx + r, cz + r), new THREE.Vector2(cx - r, cz + r)];
    if (this.rng.chance(0.5)) loop.reverse();
    const parts = buildHuman(this.rng.pick(CLOTHES), this.rng.pick(CLOTHES), this.rng.pick(SKINS), this.rng.chance(0.5) ? 0x1a1016 : 0x5a2a1a);
    const idx = this.rng.int(0, 3);
    const start = loop[idx].clone().lerp(loop[(idx + 1) % 4], this.rng.next());
    const ped: Ped = { mesh: parts.group, parts, pos: new THREE.Vector3(start.x, 0.3, start.y), heading: 0, speed: this.rng.range(1.1, 1.8), loop, idx: (idx + 1) % 4, walkT: this.rng.next() * 10, hit: 0, vel: new THREE.Vector3() };
    parts.group.position.copy(ped.pos);
    parts.group.scale.setScalar(0.95 + this.rng.next() * 0.12);
    this.scene.add(parts.group);
    this.peds.push(ped);
  }

  update(dt: number, playerCar: Car | null, allCars: Car[], solids: Box2[], t: number): void {
    const roads = this.world;
    for (const d of this.drivers) {
      const c = d.car;
      const along = d.axis === 'x' ? c.pos.x : c.pos.z;
      const perp = d.axis === 'x' ? c.pos.z : c.pos.x;
      // Look ahead for cars in the same lane; slow down behind them.
      let speedCap = d.targetSpeed;
      for (const o of allCars) {
        if (o === c) continue;
        const oAlong = d.axis === 'x' ? o.pos.x : o.pos.z;
        const oPerp = d.axis === 'x' ? o.pos.z : o.pos.x;
        const ahead = (oAlong - along) * d.dir;
        if (ahead > 0 && ahead < 14 && Math.abs(oPerp - perp) < 2.4) speedCap = Math.min(speedCap, Math.max(0, (ahead - 5) * 1.2));
      }
      // Decide turns at intersections.
      const crossings = d.axis === 'x' ? roads.roadsX : roads.roadsZ;
      if (d.nextTurnAt === null) {
        const next = crossings.filter((v) => (v - along) * d.dir > 2).sort((a, b) => Math.abs(a - along) - Math.abs(b - along))[0];
        d.nextTurnAt = next ?? null;
        if (d.nextTurnAt === null) {
          // Edge of the city: turn around.
          d.dir = -d.dir as 1 | -1;
          const roadCoord = d.lanePos - this.laneOffset(d.axis, (-d.dir) as 1 | -1);
          d.lanePos = roadCoord + this.laneOffset(d.axis, d.dir);
        }
      } else if ((d.nextTurnAt - along) * d.dir <= 0.5) {
        const crossing = d.nextTurnAt;
        d.nextTurnAt = null;
        const roll = this.rng.next();
        if (roll < 0.45) {
          // Turn: new axis, new direction; the old perpendicular road coordinate is the new road.
          const oldRoadCoord = d.lanePos - this.laneOffset(d.axis, d.dir);
          const newDir: 1 | -1 = roll < 0.22 ? 1 : -1;
          const newAxis: 'x' | 'z' = d.axis === 'x' ? 'z' : 'x';
          // Don't drive off the map.
          const limit = CITY_HALF - 5;
          const willHit = newDir > 0 ? oldRoadCoord + 20 > limit : oldRoadCoord - 20 < -limit;
          if (!willHit) {
            d.axis = newAxis;
            d.dir = newDir;
            d.lanePos = crossing + this.laneOffset(newAxis, newDir);
            if (newAxis === 'x') c.pos.x = oldRoadCoord;
            else c.pos.z = oldRoadCoord;
          }
        }
      }
      // Slow for turns and keep lane.
      const curAlong = d.axis === 'x' ? c.pos.x : c.pos.z;
      const curPerp = d.axis === 'x' ? c.pos.z : c.pos.x;
      const laneErr = d.lanePos - curPerp;
      if (Math.abs(laneErr) > 0.8) speedCap = Math.min(speedCap, 7);
      const desired = d.axis === 'x' ? (d.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : d.dir > 0 ? 0 : Math.PI;
      // Steering toward lane: heading = desired + correction.
      const corr = THREE.MathUtils.clamp(laneErr * (d.axis === 'x' ? -d.dir : d.dir) * 0.25, -0.6, 0.6);
      let dh = desired + corr - c.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      c.input.steer = THREE.MathUtils.clamp(dh * 2.5, -1, 1);
      const spd = c.speed;
      c.input.throttle = spd < speedCap ? 0.7 : 0;
      c.input.brake = spd > speedCap + 1.5 ? 0.8 : 0;
      c.input.handbrake = false;
      // Yield to the player bearing down.
      if (playerCar) {
        const dx = playerCar.pos.x - c.pos.x;
        const dz = playerCar.pos.z - c.pos.z;
        if (Math.hypot(dx, dz) < 10 && playerCar.kmh > 40) c.input.brake = 1;
      }
      void curAlong;
      c.update(dt, solids, allCars);
      // Respawn far-away wrecks if stuck off-map.
      if (Math.abs(c.pos.x) > CITY_HALF + 30 || Math.abs(c.pos.z) > CITY_HALF + 30) {
        this.scene.remove(c.mesh);
        this.cars.splice(this.cars.indexOf(c), 1);
        this.drivers.splice(this.drivers.indexOf(d), 1);
        this.spawnCar();
      }
    }
    // Pedestrians.
    for (const p of this.peds) {
      if (p.hit > 0) {
        p.hit += dt;
        p.pos.addScaledVector(p.vel, dt);
        p.vel.multiplyScalar(Math.pow(0.05, dt));
        p.mesh.position.copy(p.pos);
        p.mesh.rotation.x = Math.min(Math.PI / 2, p.hit * 4);
        p.mesh.position.y = Math.max(0.3, 0.3 + Math.sin(Math.min(Math.PI, p.hit * 3)) * 1.2);
        if (p.hit > 6) {
          p.hit = 0;
          p.mesh.rotation.x = 0;
          const start = p.loop[p.idx];
          p.pos.set(start.x, 0.3, start.y);
        }
        continue;
      }
      const target = p.loop[p.idx];
      const dx = target.x - p.pos.x;
      const dz = target.y - p.pos.z;
      const d = Math.hypot(dx, dz);
      if (d < 0.5) p.idx = (p.idx + 1) % 4;
      else {
        const th = Math.atan2(dx, dz);
        let dh = th - p.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        p.heading += dh * Math.min(1, dt * 6);
        p.pos.x += Math.sin(p.heading) * p.speed * dt;
        p.pos.z += Math.cos(p.heading) * p.speed * dt;
      }
      p.walkT += dt * (3 + p.speed * 2);
      const swing = Math.sin(p.walkT) * 0.7;
      p.parts.legL.rotation.x = swing;
      p.parts.legR.rotation.x = -swing;
      p.parts.armL.rotation.x = -swing * 0.7;
      p.parts.armR.rotation.x = swing * 0.7;
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.y = p.heading;
      // Hit by a car.
      for (const c of allCars) {
        const cdx = p.pos.x - c.pos.x;
        const cdz = p.pos.z - c.pos.z;
        const cd = Math.hypot(cdx, cdz);
        if (cd < c.radius + 0.5) {
          const sp = c.vel.length();
          if (sp > 2.5) {
            p.hit = 0.01;
            p.vel.set((cdx / cd) * sp * 0.8 + c.vel.x * 0.5, 0, (cdz / cd) * sp * 0.8 + c.vel.z * 0.5);
            if (!c.ai) this.hits++;
          } else {
            p.pos.x += (cdx / cd) * 0.3;
            p.pos.z += (cdz / cd) * 0.3;
          }
        }
      }
    }
    void t;
  }
}
