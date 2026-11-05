import * as THREE from 'three';
import type { Box2 } from './world';
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

  constructor() {
    this.rig = buildHuman(OUTFITS[0]);
    this.mesh = this.rig.group;
  }

  /** moveX/moveY are camera-relative (-1..1). */
  update(dt: number, moveX: number, moveY: number, run: boolean, camYaw: number, solids: Box2[], cars: Car[], t: number): void {
    if (this.inCar) {
      this.pos.copy(this.inCar.pos);
      this.mesh.visible = false;
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
      this.vel.lerp(dir.multiplyScalar(speed), Math.min(1, dt * 8));
    } else this.vel.lerp(new THREE.Vector3(), Math.min(1, dt * 10));
    this.pos.addScaledVector(this.vel, dt);
    const r = this.radius;
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
    const lim = 335;
    this.pos.x = THREE.MathUtils.clamp(this.pos.x, -lim, lim);
    this.pos.z = THREE.MathUtils.clamp(this.pos.z, -lim, lim);
    this.rig.animate(t, this.vel.length(), dt);
    this.mesh.position.copy(this.pos);
    this.mesh.position.y = 0.3;
    this.mesh.rotation.y = this.heading;
  }
}
