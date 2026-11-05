import * as THREE from 'three';
import type { Box2 } from './world';
import type { Car } from './vehicle';

/** Builds a low-poly humanoid with separately animatable limbs. */
export function buildHuman(top: number, bottom: number, skin: number, hair: number): { group: THREE.Group; legL: THREE.Group; legR: THREE.Group; armL: THREE.Group; armR: THREE.Group; head: THREE.Group } {
  const g = new THREE.Group();
  const matTop = new THREE.MeshStandardMaterial({ color: top, roughness: 0.75 });
  const matBottom = new THREE.MeshStandardMaterial({ color: bottom, roughness: 0.8 });
  const matSkin = new THREE.MeshStandardMaterial({ color: skin, roughness: 0.6 });
  const matHair = new THREE.MeshStandardMaterial({ color: hair, roughness: 0.9 });
  const limb = (w: number, h: number, mat: THREE.Material, y: number, x: number) => {
    const grp = new THREE.Group();
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w), mat);
    m.position.y = -h / 2;
    m.castShadow = true;
    grp.add(m);
    grp.position.set(x, y, 0);
    return grp;
  };
  const legL = limb(0.22, 0.85, matBottom, 0.88, -0.14);
  const legR = limb(0.22, 0.85, matBottom, 0.88, 0.14);
  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.7, 0.3), matTop);
  torso.position.y = 1.23;
  torso.castShadow = true;
  const armL = limb(0.16, 0.7, matTop, 1.55, -0.38);
  const armR = limb(0.16, 0.7, matTop, 1.55, 0.38);
  const head = new THREE.Group();
  const face = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.38, 0.34), matSkin);
  face.castShadow = true;
  const hairM = new THREE.Mesh(new THREE.BoxGeometry(0.37, 0.16, 0.37), matHair);
  hairM.position.y = 0.16;
  head.add(face, hairM);
  head.position.y = 1.8;
  g.add(legL, legR, torso, armL, armR, head);
  return { group: g, legL, legR, armL, armR, head };
}

export class Player {
  mesh: THREE.Group;
  pos = new THREE.Vector3(0, 0, 0);
  heading = 0;
  vel = new THREE.Vector3();
  inCar: Car | null = null;
  private parts: ReturnType<typeof buildHuman>;
  private walkT = 0;
  radius = 0.45;

  constructor() {
    this.parts = buildHuman(0xff3d8b, 0x1e1729, 0xe3b08a, 0x1a1016);
    this.mesh = this.parts.group;
  }

  /** moveX/moveY are camera-relative (-1..1). */
  update(dt: number, moveX: number, moveY: number, run: boolean, camYaw: number, solids: Box2[], cars: Car[]): void {
    if (this.inCar) {
      this.pos.copy(this.inCar.pos);
      this.mesh.visible = false;
      return;
    }
    this.mesh.visible = true;
    const len = Math.hypot(moveX, moveY);
    const speed = (run ? 7.5 : 4.2) * Math.min(1, len);
    if (len > 0.05) {
      // Camera-relative direction.
      const dir = new THREE.Vector3(moveX, 0, moveY).applyAxisAngle(new THREE.Vector3(0, 1, 0), camYaw).normalize();
      const targetHeading = Math.atan2(dir.x, dir.z);
      let dh = targetHeading - this.heading;
      dh = Math.atan2(Math.sin(dh), Math.cos(dh));
      this.heading += dh * Math.min(1, dt * 14);
      this.vel.lerp(dir.multiplyScalar(speed), Math.min(1, dt * 10));
    } else this.vel.lerp(new THREE.Vector3(), Math.min(1, dt * 12));
    this.pos.addScaledVector(this.vel, dt);
    // Collisions.
    const r = this.radius;
    for (const b of solids) {
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
    // Animate.
    const v = this.vel.length();
    this.walkT += dt * (4 + v * 1.4) * Math.min(1, v / 1.5);
    const swing = Math.sin(this.walkT) * Math.min(1, v / 3) * 0.8;
    this.parts.legL.rotation.x = swing;
    this.parts.legR.rotation.x = -swing;
    this.parts.armL.rotation.x = -swing * 0.8;
    this.parts.armR.rotation.x = swing * 0.8;
    this.parts.head.rotation.y = Math.sin(this.walkT * 0.3) * 0.08;
    this.mesh.position.copy(this.pos);
    this.mesh.position.y = 0.3 + Math.abs(Math.sin(this.walkT)) * Math.min(1, v / 3) * 0.06;
    this.mesh.rotation.y = this.heading;
  }
}
