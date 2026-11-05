import * as THREE from 'three';
import { Rng } from '../game/rng';
import { Car, CAR_COLORS } from './vehicle';
import type { CarKind } from './vehicle';
import { CITY_HALF, LANE, type Box2, type World } from './world';

interface Driver {
  car: Car;
  axis: 'x' | 'z';
  dir: 1 | -1;
  lanePos: number; // target perpendicular coordinate
  targetSpeed: number;
  nextTurnAt: number | null; // intersection coordinate along the axis where a turn decision happens
}


export interface Police {
  car: Car;
  bar: THREE.Mesh[];
}

export class Traffic {
  drivers: Driver[] = [];
  cars: Car[] = [];
  police: Police[] = [];
  private rng: Rng;
  hits = 0;
  /** Set when the player rams a traffic car hard. */
  rammed = 0;

  constructor(private scene: THREE.Scene, private world: World, carCount: number, seed = 3) {
    this.rng = new Rng(seed);
    for (let i = 0; i < carCount; i++) this.spawnCar();
  }

  private laneOffset(axis: 'x' | 'z', dir: 1 | -1): number {
    // Right-hand traffic: lane centre sits to the right of the road centre line.
    // axis x, dir +1 → right = -z ; axis z, dir +1 → right = +x.
    return axis === 'x' ? -dir * (LANE / 2 + 0.3) : dir * (LANE / 2 + 0.3);
  }

  private spawnCar(): void {
    const kind: CarKind = this.rng.pick(['sedan', 'sedan', 'hatch', 'van', 'taxi', 'sports', 'bus'] as CarKind[]);
    const car = new Car(kind === 'taxi' ? 0xf2c230 : this.rng.pick(CAR_COLORS), false, false, kind);
    car.ai = true;
    const axis: 'x' | 'z' = this.rng.chance(0.5) ? 'x' : 'z';
    const dir: 1 | -1 = this.rng.chance(0.5) ? 1 : -1;
    const roads = axis === 'x' ? this.world.roadsZ : this.world.roadsX;
    const roadCoord = this.rng.pick(roads);
    const along = this.rng.range(-CITY_HALF + 10, CITY_HALF - 10);
    const lanePos = roadCoord + this.laneOffset(axis, dir);
    if (axis === 'x') car.place(along, lanePos, dir > 0 ? Math.PI / 2 : -Math.PI / 2);
    else car.place(lanePos, along, dir > 0 ? 0 : Math.PI);
    car.driver.visible = true;
    this.scene.add(car.mesh);
    this.cars.push(car);
    this.drivers.push({ car, axis, dir, lanePos, targetSpeed: this.rng.range(9, 14), nextTurnAt: null });
  }

  /** The closest car to a point within `radius`, or null. */
  nearestCar(p: THREE.Vector3, radius: number, exclude: Car | null): Car | null {
    let best: Car | null = null;
    let bd = radius;
    for (const c of this.cars) {
      if (c === exclude) continue;
      const d = Math.hypot(c.pos.x - p.x, c.pos.z - p.z);
      if (d < bd) {
        bd = d;
        best = c;
      }
    }
    return best;
  }

  /** The player takes this car: its AI driver bails out. */
  release(car: Car): void {
    const i = this.drivers.findIndex((d) => d.car === car);
    if (i >= 0) this.drivers.splice(i, 1);
    const pi = this.police.findIndex((p) => p.car === car);
    if (pi >= 0) this.police.splice(pi, 1);
  }

  /** Spawn a police cruiser on a road some distance from the player. */
  spawnPolice(near: THREE.Vector3): void {
    const car = new Car(0xf2f2f2, false, false, 'sedan');
    car.ai = true;
    const axis: 'x' | 'z' = this.rng.chance(0.5) ? 'x' : 'z';
    const roads = axis === 'x' ? this.world.roadsZ : this.world.roadsX;
    const roadCoord = roads.reduce((a, b) => (Math.abs(b - (axis === 'x' ? near.z : near.x)) < Math.abs(a - (axis === 'x' ? near.z : near.x)) ? b : a));
    const along = (axis === 'x' ? near.x : near.z) + (this.rng.chance(0.5) ? 1 : -1) * this.rng.range(70, 110);
    const a = THREE.MathUtils.clamp(along, -CITY_HALF + 10, CITY_HALF - 10);
    if (axis === 'x') car.place(a, roadCoord + 1.8, near.x > a ? Math.PI / 2 : -Math.PI / 2);
    else car.place(roadCoord + 1.8, a, near.z > a ? 0 : Math.PI);
    // Livery: blue doors band + roof light bar.
    const band = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.26, 2.4), new THREE.MeshLambertMaterial({ color: 0x1f3f8a}));
    band.position.set(0, 0.86, 0);
    car.body.add(band);
    const bar: THREE.Mesh[] = [];
    for (const [sx, col] of [[-0.3, 0x3060ff], [0.3, 0xff2030]] as const) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.3), new THREE.MeshLambertMaterial({ color: col, emissive: col, emissiveIntensity: 0.2 }));
      l.position.set(sx, 1.72, -0.2);
      car.body.add(l);
      bar.push(l);
    }
    car.setLights(true);
    car.driver.visible = true;
    this.scene.add(car.mesh);
    this.cars.push(car);
    this.police.push({ car, bar });
  }

  removePolice(): void {
    for (const p of this.police) {
      this.scene.remove(p.car.mesh);
      this.cars.splice(this.cars.indexOf(p.car), 1);
    }
    this.police = [];
  }

  update(dt: number, playerCar: Car | null, allCars: Car[], solids: Box2[], t: number, chaseTarget: THREE.Vector3 | null): void {
    const roads = this.world;
    // Police: chase and ram the target.
    for (const p of this.police) {
      const c = p.car;
      const flash = Math.sin(t * 14) > 0;
      (p.bar[0].material as THREE.MeshLambertMaterial).emissiveIntensity = flash ? 4 : 0.2;
      (p.bar[1].material as THREE.MeshLambertMaterial).emissiveIntensity = flash ? 0.2 : 4;
      if (chaseTarget) {
        const dx = chaseTarget.x - c.pos.x;
        const dz = chaseTarget.z - c.pos.z;
        const dist = Math.hypot(dx, dz);
        let dh = Math.atan2(dx, dz) - c.heading;
        dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        const behind = Math.abs(dh) > Math.PI * 0.6;
        c.input.steer = THREE.MathUtils.clamp(dh * 2.2, -1, 1);
        c.input.throttle = behind && dist < 12 ? 0 : 1;
        c.input.brake = behind && dist < 12 ? 0.8 : 0;
        c.input.handbrake = false;
        (c as any).__maxOverride = 34;
      }
      c.update(dt, solids, allCars);
    }
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
      // Traffic lights: stop short of the crossing when our axis is red (unless already inside the box).
      const crossingsAll = d.axis === 'x' ? roads.roadsX : roads.roadsZ;
      const otherCoord = d.axis === 'x' ? c.pos.z : c.pos.x;
      const otherRoads = d.axis === 'x' ? roads.roadsZ : roads.roadsX;
      const myRoad = otherRoads.reduce((a, b) => (Math.abs(b - otherCoord) < Math.abs(a - otherCoord) ? b : a));
      for (const cr of crossingsAll) {
        const ahead = (cr - along) * d.dir;
        if (ahead > 10 && ahead < 26) {
          const green = d.axis === 'x' ? roads.lightXGreen(cr, myRoad, t) : !roads.lightXGreen(myRoad, cr, t);
          if (!green) speedCap = Math.min(speedCap, Math.max(0, (ahead - 11) * 1.4));
        }
      }
      // Decide turns at intersections.
      const crossings = crossingsAll;
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
      const before = c.lastHit;
      c.lastHit = 0;
      void before;
      void curAlong;
      // Stop for pedestrians on the road right ahead, and for the player on foot.
      c.update(dt, solids, allCars);
      if (c.lastHit > 7 && playerCar && Math.hypot(playerCar.pos.x - c.pos.x, playerCar.pos.z - c.pos.z) < 5) this.rammed++;
      // Respawn far-away wrecks if stuck off-map.
      if (Math.abs(c.pos.x) > CITY_HALF + 30 || Math.abs(c.pos.z) > CITY_HALF + 30) {
        this.scene.remove(c.mesh);
        this.cars.splice(this.cars.indexOf(c), 1);
        this.drivers.splice(this.drivers.indexOf(d), 1);
        this.spawnCar();
      }
    }
  }

  setLights(on: boolean): void {
    for (const c of this.cars) c.setLights(on);
  }
}
