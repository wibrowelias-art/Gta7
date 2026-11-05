import * as THREE from 'three';
import { CITY_HALF, type Box2, type World } from './world';
import type { Car } from './vehicle';
import { buildHuman, OUTFITS, type HumanRig } from './human';

export { buildHuman };

export class Player {
  mesh: THREE.Group;
  pos = new THREE.Vector3(0, 0, 0);
  heading = 0;
  vel = new THREE.Vector3();
  inCar: Car | null = null;
  rig: HumanRig;
  radius = 0.45;
  /** Vertical: current ground height, vertical velocity, and whether we are on the train roof. */
  groundY = 0;
  vy = 0;
  onTrain = false;
  airborne = false;
  /** Parkour state: 'vault' | 'climb' | 'roll' with a timer, plus a jump request flag. */
  action: 'none' | 'vault' | 'climb' | 'roll' = 'none';
  actionT = 0;
  private actionFrom = new THREE.Vector3();
  private actionTo = new THREE.Vector3();
  wantJump = false;
  private fallFrom = 0;

  constructor() {
    this.rig = buildHuman(OUTFITS[0]);
    this.mesh = this.rig.group;
  }

  /** moveX/moveY are camera-relative (-1..1). */
  update(dt: number, moveX: number, moveY: number, run: boolean, camYaw: number, solids: Box2[], cars: Car[], t: number, world: World): void {
    if (this.inCar) {
      this.pos.copy(this.inCar.pos);
      this.mesh.visible = false;
      this.groundY = 0;
      return;
    }
    this.mesh.visible = true;
    const len = Math.hypot(moveX, moveY);
    const speed = (run ? 7.2 : 3.6) * Math.min(1, len);
    if (len > 0.05) {
      const dir = new THREE.Vector3(moveX, 0, moveY).applyAxisAngle(new THREE.Vector3(0, 1, 0), camYaw).normalize();
      const targetHeading = Math.atan2(dir.x, dir.z);
      let dh = targetHeading - this.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      this.heading += dh * Math.min(1, dt * 12);
      this.vel.lerp(dir.multiplyScalar(speed), Math.min(1, dt * (this.airborne ? 1.5 : 8)));
    } else this.vel.lerp(new THREE.Vector3(), Math.min(1, dt * (this.airborne ? 0.5 : 10)));
    const prev = this.pos.clone();
    this.pos.addScaledVector(this.vel, dt);

    // Moving platform: the train roof carries you.
    const tr = world.trainRoof;
    const roofY = tr.y;
    const onRoofXZ = this.pos.x > tr.minX && this.pos.x < tr.maxX && this.pos.z > tr.minZ && this.pos.z < tr.maxZ;
    const wasOnTrain = this.onTrain;
    this.onTrain = onRoofXZ && this.pos.y >= roofY - 0.8 && this.pos.y <= roofY + 1.5;
    if (this.onTrain) this.pos.addScaledVector(world.trainVel, dt);
    if (wasOnTrain && !this.onTrain) this.vel.add(world.trainVel.clone().multiplyScalar(0.8));

    // ---- Parkour: scripted moves take over the body for a moment. ----
    if (this.action !== 'none') {
      this.actionT += dt;
      const dur = this.action === 'vault' ? 0.55 : this.action === 'climb' ? 0.8 : 0.6;
      const k = Math.min(1, this.actionT / dur);
      if (this.action !== 'roll') {
        const e = k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
        this.pos.lerpVectors(this.actionFrom, this.actionTo, e);
        this.pos.y = THREE.MathUtils.lerp(this.actionFrom.y, this.actionTo.y, e) + (this.action === 'vault' ? Math.sin(k * Math.PI) * 0.9 : Math.sin(k * Math.PI) * 0.25);
      } else this.pos.addScaledVector(this.vel, dt);
      this.posePark(k, t);
      if (k >= 1) {
        this.action = 'none';
        this.vy = 0;
      }
      this.mesh.position.set(this.pos.x, this.pos.y + 0.03, this.pos.z);
      this.mesh.rotation.y = this.heading;
      return;
    }
    const moving = this.vel.length() > 1.2;
    const fx = Math.sin(this.heading);
    const fz = Math.cos(this.heading);
    // Vault: a low obstacle (≤ 1.3 m) directly ahead while moving.
    if (moving && !this.airborne && !this.onTrain) {
      const ax = this.pos.x + fx * 0.9;
      const az = this.pos.z + fz * 0.9;
      for (const o of world.obstacles) {
        if (ax < o.minX - 0.2 || ax > o.maxX + 0.2 || az < o.minZ - 0.2 || az > o.maxZ + 0.2) continue;
        const h = o.h - this.pos.y;
        if (h > 0.5 && h <= 1.6) {
          const depth = Math.max(o.maxX - o.minX, o.maxZ - o.minZ);
          const over = Math.min(depth, 2.6) + 1.2;
          this.actionFrom.copy(this.pos);
          this.actionTo.set(this.pos.x + fx * over, world.heightAt(this.pos.x + fx * over, this.pos.z + fz * over, this.pos.y), this.pos.z + fz * over);
          // If the far side is blocked, land on top instead.
          const topY = o.h;
          if (over > depth + 1.1 && Math.abs(this.actionTo.y - this.pos.y) > 1.5) this.actionTo.set(this.pos.x + fx * (depth * 0.5 + 0.6), topY, this.pos.z + fz * (depth * 0.5 + 0.6));
          this.action = 'vault';
          this.actionT = 0;
          break;
        }
      }
    }
    // Climb: jump toward a ledge 1.3–2.6 m above your feet and mantle onto it.
    if (this.action === 'none' && this.wantJump && !this.airborne && !this.onTrain) {
      const ax = this.pos.x + fx * 0.8;
      const az = this.pos.z + fz * 0.8;
      let best: { y: number } | null = null;
      for (const p of world.platforms) {
        if (ax < p.minX - 0.3 || ax > p.maxX + 0.3 || az < p.minZ - 0.3 || az > p.maxZ + 0.3) continue;
        const py = p.ramp ? Math.max(p.ramp.y0, p.ramp.y1) : p.y;
        const h = py - this.pos.y;
        if (h > 1.2 && h <= 3.0 && (!best || py < best.y)) best = { y: py };
      }
      for (const o of world.obstacles) {
        if (ax < o.minX - 0.3 || ax > o.maxX + 0.3 || az < o.minZ - 0.3 || az > o.maxZ + 0.3) continue;
        const h = o.h - this.pos.y;
        if (h > 1.2 && h <= 3.0 && (!best || o.h < best.y)) best = { y: o.h };
      }
      if (best) {
        this.actionFrom.copy(this.pos);
        this.actionTo.set(this.pos.x + fx * 1.1, best.y, this.pos.z + fz * 1.1);
        this.action = 'climb';
        this.actionT = 0;
        this.wantJump = false;
      }
    }
    // Plain jump.
    if (this.action === 'none' && this.wantJump && !this.airborne) {
      this.vy = 6.8;
      this.pos.y += 0.06;
      this.airborne = true;
      this.fallFrom = this.pos.y;
    }
    this.wantJump = false;
    if (this.action !== 'none') {
      this.mesh.position.set(this.pos.x, this.pos.y + 0.03, this.pos.z);
      return;
    }
    if (this.airborne) this.fallFrom = Math.max(this.fallFrom, this.pos.y);

    // Ground: street, platforms, or the train roof.
    let ground = world.heightAt(this.pos.x, this.pos.z, this.pos.y);
    if (this.onTrain) ground = Math.max(ground, roofY);
    // Fenced platform edges: stay on unless you are walking onto a ramp or platform at the same height.
    const prevGround = this.groundY;
    for (const p of world.platforms) {
      if (!p.fenced) continue;
      const wasOn = prev.x >= p.minX && prev.x <= p.maxX && prev.z >= p.minZ && prev.z <= p.maxZ;
      const isOn = this.pos.x >= p.minX && this.pos.x <= p.maxX && this.pos.z >= p.minZ && this.pos.z <= p.maxZ;
      if (wasOn && !isOn && Math.abs(prevGround - (p.ramp ? prevGround : p.y)) < 1.5 && ground < prevGround - 1.5 && !this.onTrain) {
        // Stepping off a drop: block unless another walkable surface continues.
        this.pos.x = THREE.MathUtils.clamp(this.pos.x, p.minX, p.maxX);
        this.pos.z = THREE.MathUtils.clamp(this.pos.z, p.minZ, p.maxZ);
        ground = world.heightAt(this.pos.x, this.pos.z, this.pos.y);
      }
    }
    // Gravity.
    if (this.pos.y > ground + 0.05) {
      this.vy -= 22 * dt;
      this.pos.y += this.vy * dt;
      this.airborne = true;
      if (this.pos.y <= ground) {
        this.pos.y = ground;
        this.vy = 0;
        this.airborne = false;
        if (this.fallFrom - ground > 3 && this.vel.length() > 1) {
          this.action = 'roll';
          this.actionT = 0;
        }
        this.fallFrom = ground;
      }
    } else {
      this.pos.y = ground;
      this.vy = 0;
      this.airborne = false;
    }
    this.groundY = ground;

    // Collisions only matter at street level (buildings) or with thin posts.
    const r = this.radius;
    if (this.pos.y < 1.5) {
      for (const b of solids) {
        if (b.minX > this.pos.x + 3 || b.maxX < this.pos.x - 3 || b.minZ > this.pos.z + 3 || b.maxZ < this.pos.z - 3) continue;
        const cx = THREE.MathUtils.clamp(this.pos.x, b.minX, b.maxX);
        const cz = THREE.MathUtils.clamp(this.pos.z, b.minZ, b.maxZ);
        const dx = this.pos.x - cx;
        const dz = this.pos.z - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          if (d2 > 1e-6) {
            const d = Math.sqrt(d2);
            this.pos.x += (dx / d) * (r - d);
            this.pos.z += (dz / d) * (r - d);
          } else {
            // Inside the box: leave through the nearest face.
            const dl = this.pos.x - b.minX, dr = b.maxX - this.pos.x, dn = this.pos.z - b.minZ, df = b.maxZ - this.pos.z;
            const m = Math.min(dl, dr, dn, df);
            if (m === dl) this.pos.x = b.minX - r;
            else if (m === dr) this.pos.x = b.maxX + r;
            else if (m === dn) this.pos.z = b.minZ - r;
            else this.pos.z = b.maxZ + r;
          }
        }
      }
      for (const c of cars) {
        const dx = this.pos.x - c.pos.x;
        const dz = this.pos.z - c.pos.z;
        const d = Math.hypot(dx, dz);
        const min = r + c.radius + 0.3;
        if (d < min && d > 1e-4) {
          this.pos.x += (dx / d) * (min - d);
          this.pos.z += (dz / d) * (min - d);
        }
      }
    }
    const lim = this.onTrain ? CITY_HALF + 400 : CITY_HALF + 8;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -lim, lim);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -lim, lim);
    this.rig.hips.rotation.x = 0;
    this.rig.animate(t, this.airborne ? 0 : this.vel.length(), dt);
    if (this.airborne) {
      // Jump pose: knees up, arms back.
      const r = this.rig;
      r.legL.rotation.x = 0.9;
      r.legR.rotation.x = 0.4;
      r.shinL.rotation.x = -1.4;
      r.shinR.rotation.x = -0.9;
      r.armL.rotation.x = 0.6;
      r.armR.rotation.x = 0.6;
      r.torso.rotation.x = 0.15;
    }
    if (this.onTrain) {
      // Surfing crouch: knees bent, arms out for balance.
      this.rig.hips.position.y = 0.72;
      this.rig.legL.rotation.set(0.9, 0, 0.35);
      this.rig.legR.rotation.set(0.9, 0, -0.35);
      this.rig.shinL.rotation.x = -1.5;
      this.rig.shinR.rotation.x = -1.5;
      this.rig.armL.rotation.set(-0.3, 0, 1.35 + Math.sin(t * 2) * 0.12);
      this.rig.armR.rotation.set(-0.3, 0, -1.35 - Math.sin(t * 2.3) * 0.12);
      this.rig.foreL.rotation.x = -0.2;
      this.rig.foreR.rotation.x = -0.2;
      this.rig.torso.rotation.x = 0.3;
      this.rig.head.rotation.x = -0.25;
    }
    this.mesh.position.copy(this.pos);
    this.mesh.position.y = this.pos.y + 0.03;
    this.mesh.rotation.y = this.heading;
  }

  /** Body poses for vault / climb / roll, k = 0..1 through the move. */
  private posePark(k: number, t: number): void {
    const r = this.rig;
    const s = Math.sin(k * Math.PI);
    if (this.action === 'vault') {
      // Speed vault: plant one hand, tuck legs to the side.
      r.torso.rotation.x = 0.9 * s;
      r.armL.rotation.x = -1.6 * s;
      r.foreL.rotation.x = -0.2;
      r.armR.rotation.x = 0.6 * s;
      r.legL.rotation.x = 1.6 * s;
      r.legR.rotation.x = 1.1 * s;
      r.shinL.rotation.x = -1.7 * s;
      r.shinR.rotation.x = -1.2 * s;
      r.hips.rotation.y = 0.5 * s;
      r.hips.position.y = 0.95;
    } else if (this.action === 'climb') {
      // Ledge grab then push up: arms overhead, then torso over, then legs.
      const up = Math.min(1, k * 1.6);
      r.armL.rotation.x = -3.0 + up * 2.2;
      r.armR.rotation.x = -3.0 + up * 2.2;
      r.foreL.rotation.x = -0.3 - up * 0.6;
      r.foreR.rotation.x = -0.3 - up * 0.6;
      r.torso.rotation.x = 0.6 * (1 - up) + 0.5 * s;
      r.legL.rotation.x = 1.2 * s;
      r.legR.rotation.x = 0.6 * (1 - Math.abs(k - 0.5) * 2);
      r.shinL.rotation.x = -1.4 * s;
      r.shinR.rotation.x = -0.8 * s;
      r.hips.position.y = 0.95;
    } else {
      // Shoulder roll: tuck and rotate the whole body forward.
      r.torso.rotation.x = 1.2;
      r.head.rotation.x = 0.6;
      r.legL.rotation.x = 1.8;
      r.legR.rotation.x = 1.8;
      r.shinL.rotation.x = -2.2;
      r.shinR.rotation.x = -2.2;
      r.armL.rotation.x = -1.0;
      r.armR.rotation.x = -1.0;
      r.hips.rotation.x = k * Math.PI * 2;
      r.hips.position.y = 0.5 + Math.abs(Math.sin(k * Math.PI)) * 0.2;
    }
    void t;
  }
}
