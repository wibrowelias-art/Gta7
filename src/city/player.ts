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
    const tr = world.train.position;
    const roofY = 13.65;
    const onRoofXZ = this.pos.x > tr.x - 8.3 && this.pos.x < tr.x + world.trainLen - 8.3 && Math.abs(this.pos.z - tr.z) < 1.45;
    const wasOnTrain = this.onTrain;
    this.onTrain = onRoofXZ && this.pos.y >= roofY - 0.6;
    if (this.onTrain) this.pos.addScaledVector(world.trainVel, dt);
    if (wasOnTrain && !this.onTrain) this.vel.add(world.trainVel.clone().multiplyScalar(0.8));

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
          const d = Math.sqrt(d2) || 0.001;
          const nx = d2 > 1e-6 ? dx / d : 1;
          const nz = d2 > 1e-6 ? dz / d : 0;
          this.pos.x += nx * (r - d);
          this.pos.z += nz * (r - d);
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
    const lim = CITY_HALF + 8;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -lim, lim);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -lim, lim);
    this.rig.animate(t, this.airborne ? 0 : this.vel.length(), dt);
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
    this.mesh.position.y = this.pos.y + 0.3;
    this.mesh.rotation.y = this.heading;
  }
}
