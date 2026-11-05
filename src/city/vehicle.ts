import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import type { Box2 } from './world';
import { radialSpriteTexture, CITY_HALF } from './world';

export interface CarInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
}

export type CarKind = 'sedan' | 'hatch' | 'sports' | 'van' | 'taxi';
export const CAR_COLORS = [0xd9d9d9, 0x2a2a2a, 0x8a1c1c, 0x1f3a6a, 0xc9c0a8, 0x6a6a6a, 0x2f5a3a, 0xffffff, 0x4a3a7a, 0xb86a2a];

const tmp = new THREE.Vector3();

/** Arcade car with a bevelled low-poly body in several silhouettes. */
export class Car {
  mesh = new THREE.Group();
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  heading = 0;
  steer = 0;
  radius = 1.45;
  input: CarInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  wheels: THREE.Object3D[] = [];
  frontWheels: THREE.Group[] = [];
  body = new THREE.Group();
  headlights: THREE.SpotLight[] = [];
  tailMat: THREE.MeshStandardMaterial;
  headMat: THREE.MeshStandardMaterial;
  drifting = 0;
  bump = 0;
  ai = false;
  lightsOn = false;
  color: number;
  kind: CarKind;
  lastHit = 0;
  private roll = 0;
  private pitch = 0;
  private glows: THREE.Sprite[] = [];
  driver: THREE.Group;

  constructor(color: number, withShadowLights = false, realLights = true, kind: CarKind = 'sedan') {
    this.color = color;
    this.kind = kind;
    const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.3, metalness: 0.6, clearcoat: 0.9, clearcoatRoughness: 0.12 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x1a1a1e, roughness: 0.6, metalness: 0.3 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x1c2733, roughness: 0.08, metalness: 0.8, transparent: true, opacity: 0.88 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xd8d8e0, roughness: 0.2, metalness: 1 });
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0x8a1010, emissive: 0xff2030, emissiveIntensity: 0.2 });
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xfff4ec, emissive: 0xfff0d0, emissiveIntensity: 0.1 });
    const b = this.body;
    const sh = (m: THREE.Mesh) => {
      m.castShadow = true;
      m.receiveShadow = true;
      return m;
    };
    // Silhouette parameters per kind.
    const P = {
      sedan: { len: 4.6, wid: 1.86, lowH: 0.56, cabinZ: -0.2, cabinL: 2.1, cabinH: 0.55, hoodL: 1.5, trunkL: 1.1 },
      hatch: { len: 4.0, wid: 1.78, lowH: 0.56, cabinZ: -0.35, cabinL: 2.3, cabinH: 0.6, hoodL: 1.2, trunkL: 0.3 },
      sports: { len: 4.4, wid: 1.9, lowH: 0.48, cabinZ: -0.45, cabinL: 1.7, cabinH: 0.46, hoodL: 1.9, trunkL: 0.7 },
      van: { len: 5.0, wid: 1.95, lowH: 0.8, cabinZ: -0.5, cabinL: 3.6, cabinH: 0.9, hoodL: 0.8, trunkL: 0.0 },
      taxi: { len: 4.6, wid: 1.86, lowH: 0.56, cabinZ: -0.2, cabinL: 2.1, cabinH: 0.55, hoodL: 1.5, trunkL: 1.1 },
    }[kind];
    const lower = sh(new THREE.Mesh(new RoundedBoxGeometry(P.wid, P.lowH, P.len, 3, 0.12), paint));
    lower.position.y = 0.42 + P.lowH / 2;
    b.add(lower);
    // Hood and trunk as slightly narrower, lower slabs with a rake.
    const hood = sh(new THREE.Mesh(new RoundedBoxGeometry(P.wid - 0.1, 0.22, P.hoodL, 2, 0.08), paint));
    hood.position.set(0, 0.42 + P.lowH + 0.08, P.len / 2 - P.hoodL / 2 - 0.1);
    hood.rotation.x = 0.06;
    b.add(hood);
    if (P.trunkL > 0.2) {
      const trunk = sh(new THREE.Mesh(new RoundedBoxGeometry(P.wid - 0.1, 0.24, P.trunkL, 2, 0.08), paint));
      trunk.position.set(0, 0.42 + P.lowH + 0.1, -P.len / 2 + P.trunkL / 2 + 0.1);
      b.add(trunk);
    }
    // Cabin: glass block with paint pillars and roof.
    const cabin = sh(new THREE.Mesh(new RoundedBoxGeometry(P.wid - 0.22, P.cabinH, P.cabinL, 3, 0.14), glass));
    cabin.position.set(0, 0.42 + P.lowH + P.cabinH / 2 + 0.05, P.cabinZ);
    b.add(cabin);
    const roof = sh(new THREE.Mesh(new RoundedBoxGeometry(P.wid - 0.3, 0.1, P.cabinL - 0.3, 2, 0.04), paint));
    roof.position.set(0, cabin.position.y + P.cabinH / 2, P.cabinZ);
    b.add(roof);
    for (const z of [P.cabinZ + P.cabinL / 2 - 0.06, P.cabinZ - P.cabinL / 2 + 0.06]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(P.wid - 0.24, P.cabinH - 0.1, 0.1), dark);
      pillar.position.set(0, cabin.position.y, z);
      b.add(pillar);
    }
    // Wheel arches (dark recesses) so the wheels sit inside the body.
    const archGeo = new THREE.TorusGeometry(0.42, 0.05, 6, 16);
    for (const [sx, sz] of [[-1, 1.45], [1, 1.45], [-1, -1.45], [1, -1.45]] as const) {
      const arch = new THREE.Mesh(archGeo, dark);
      arch.rotation.y = Math.PI / 2;
      arch.position.set(sx * (P.wid / 2 - 0.02), 0.44, sz * (P.len / 4.6));
      b.add(arch);
    }
    // Bumpers, grille, mirrors, plates, exhaust.
    const bumperF = new THREE.Mesh(new RoundedBoxGeometry(P.wid + 0.02, 0.28, 0.32, 2, 0.08), dark);
    bumperF.position.set(0, 0.42, P.len / 2 - 0.05);
    const bumperB = bumperF.clone();
    bumperB.position.z = -P.len / 2 + 0.05;
    b.add(bumperF, bumperB);
    const grille = new THREE.Mesh(new THREE.BoxGeometry(P.wid * 0.5, 0.2, 0.05), chrome);
    grille.position.set(0, 0.42 + P.lowH * 0.6, P.len / 2 + 0.02);
    b.add(grille);
    for (const sx of [-1, 1]) {
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.12, 0.16), paint);
      mirror.position.set(sx * (P.wid / 2 + 0.1), cabin.position.y - 0.05, P.cabinZ + P.cabinL / 2 - 0.1);
      b.add(mirror);
      const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.3, 8), chrome);
      ex.rotation.x = Math.PI / 2;
      ex.position.set(sx * 0.5, 0.32, -P.len / 2 - 0.05);
      b.add(ex);
    }
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.02), new THREE.MeshStandardMaterial({ color: 0xf2f2f2 }));
    plate.position.set(0, 0.5, -P.len / 2 - 0.1);
    b.add(plate);
    if (kind === 'taxi') {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.3), new THREE.MeshStandardMaterial({ color: 0xffd04a, emissive: 0xffc830, emissiveIntensity: 0.6 }));
      sign.position.set(0, roof.position.y + 0.14, P.cabinZ);
      b.add(sign);
    }
    // Lights.
    for (const sx of [-0.62, 0.62]) {
      const h = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.18, 0.1, 2, 0.04), this.headMat);
      h.position.set(sx * (P.wid / 1.86), 0.42 + P.lowH * 0.75, P.len / 2 + 0.03);
      b.add(h);
      const t = new THREE.Mesh(new RoundedBoxGeometry(0.5, 0.16, 0.1, 2, 0.04), this.tailMat);
      t.position.set(sx * (P.wid / 1.86), 0.42 + P.lowH * 0.8, -P.len / 2 - 0.03);
      b.add(t);
      const glowTex = radialSpriteTexture();
      const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff0d0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.position.set(sx * (P.wid / 1.86), 0.42 + P.lowH * 0.75, P.len / 2 + 0.12);
      g.scale.set(1.3, 0.9, 1);
      b.add(g);
      const r = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff2a3a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false }));
      r.position.set(sx * (P.wid / 1.86), 0.42 + P.lowH * 0.8, -P.len / 2 - 0.12);
      r.scale.set(1.1, 0.7, 1);
      b.add(r);
      this.glows.push(g, r);
    }
    for (const sx of realLights ? [-0.62, 0.62] : []) {
      const sl = new THREE.SpotLight(0xfff0d0, 0, 48, 0.5, 0.5, 1.3);
      sl.position.set(sx, 0.8, P.len / 2);
      sl.target.position.set(sx * 1.5, -0.6, 20);
      sl.castShadow = withShadowLights && sx > 0;
      if (sl.castShadow) {
        sl.shadow.mapSize.set(1024, 1024);
        sl.shadow.bias = -0.0005;
      }
      b.add(sl, sl.target);
      this.headlights.push(sl);
    }
    // Driver: head and shoulders behind the wheel, visible through the glass.
    this.driver = new THREE.Group();
    const skinM = new THREE.MeshStandardMaterial({ color: [0xe3b08a, 0xc98a5a, 0xa8714c, 0xf1c6a7][Math.abs(color) % 4], roughness: 0.6 });
    const shirtM = new THREE.MeshStandardMaterial({ color: [0x2a2a2a, 0x9a9a9a, 0x3a5a8a, 0x7a2e2e][Math.abs(color >> 4) % 4], roughness: 0.8 });
    const torso = new THREE.Mesh(new RoundedBoxGeometry(0.42, 0.5, 0.26, 2, 0.06), shirtM);
    torso.position.set(-0.38, 0.42 + P.lowH + 0.2, P.cabinZ + 0.1);
    const head = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.24, 0.22, 2, 0.06), skinM);
    head.position.set(-0.38, torso.position.y + 0.42, P.cabinZ + 0.1);
    const hair = new THREE.Mesh(new RoundedBoxGeometry(0.21, 0.09, 0.23, 2, 0.04), new THREE.MeshStandardMaterial({ color: 0x1a1016, roughness: 0.9 }));
    hair.position.set(-0.38, head.position.y + 0.12, P.cabinZ + 0.1);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 16), dark);
    wheel.position.set(-0.38, 0.42 + P.lowH + 0.3, P.cabinZ + 0.75);
    wheel.rotation.x = -0.9;
    this.driver.add(torso, head, hair, wheel);
    this.driver.visible = false;
    b.add(this.driver);
    this.mesh.add(b);
    // Wheels.
    const tyre = new THREE.MeshStandardMaterial({ color: 0x151518, roughness: 0.9 });
    const rim = new THREE.MeshStandardMaterial({ color: 0xcfcfd8, roughness: 0.25, metalness: 1 });
    for (const [sx, sz] of [[-1, 1.45], [1, 1.45], [-1, -1.45], [1, -1.45]] as const) {
      const hub = new THREE.Group();
      const w = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 20), tyre));
      w.rotation.z = Math.PI / 2;
      const rimM = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.28, 10), rim);
      rimM.rotation.z = Math.PI / 2;
      const spokes = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.06), tyre);
      hub.add(w, rimM, spokes);
      const steerGroup = new THREE.Group();
      steerGroup.position.set(sx * (P.wid / 2 - 0.08), 0.37, sz * (P.len / 4.6));
      steerGroup.add(hub);
      this.mesh.add(steerGroup);
      this.wheels.push(hub);
      if (sz > 0) this.frontWheels.push(steerGroup);
    }
    this.radius = P.len * 0.32;
  }

  get forward(): THREE.Vector3 {
    return tmp.set(Math.sin(this.heading), 0, Math.cos(this.heading));
  }
  get speed(): number {
    const f = this.forward;
    return this.vel.x * f.x + this.vel.z * f.z;
  }
  get kmh(): number {
    return Math.abs(this.speed) * 3.6;
  }

  setLights(on: boolean): void {
    this.lightsOn = on;
    for (const l of this.headlights) l.intensity = on ? 70 : 0;
    this.headMat.emissiveIntensity = on ? 3 : 0.1;
    this.glows.forEach((g, i) => ((g.material as THREE.SpriteMaterial).opacity = on ? (i % 2 ? 0.45 : 0.75) : 0));
  }

  place(x: number, z: number, heading: number): void {
    this.pos.set(x, 0, z);
    this.heading = heading;
    this.vel.set(0, 0, 0);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = heading;
  }

  update(dt: number, solids: Box2[], others: Car[]): void {
    const inp = this.input;
    const fwd = new THREE.Vector3(Math.sin(this.heading), 0, Math.cos(this.heading));
    const right = new THREE.Vector3(fwd.z, 0, -fwd.x);
    const vF = this.vel.dot(fwd);
    const vR = this.vel.dot(right);
    const maxSpeed = (this as any).__maxOverride ?? (this.ai ? 16 : this.kind === 'sports' ? 52 : this.kind === 'van' ? 36 : 44);
    let accel = 0;
    if (inp.throttle > 0) accel += (vF < 0 ? 22 : (this.kind === 'sports' ? 19 : 15) * (1 - Math.max(0, vF) / maxSpeed) + 3) * inp.throttle;
    if (inp.brake > 0) accel -= vF > 0.5 ? 28 * inp.brake : 9 * inp.brake;
    if (inp.handbrake && inp.throttle === 0 && inp.brake === 0) accel -= THREE.MathUtils.clamp(vF / dt, -14, 14);
    accel -= vF * 0.08 + Math.sign(vF) * 0.6;
    let nvF = vF + accel * dt;
    if (Math.abs(nvF) < 0.05 && inp.throttle === 0 && inp.brake === 0) nvF = 0;
    nvF = THREE.MathUtils.clamp(nvF, -12, maxSpeed);
    const steerTarget = inp.steer * (0.55 - 0.32 * Math.min(1, Math.abs(vF) / 30));
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 10);
    const turnRate = (nvF / 3.2) * Math.tan(this.steer) * (inp.handbrake ? 1.35 : 1);
    this.heading += turnRate * dt;
    const grip = inp.handbrake ? 1.4 : 7.5;
    let nvR = vR - vR * Math.min(1, grip * dt);
    if (inp.handbrake && Math.abs(nvF) > 6) nvR += -Math.sign(this.steer) * Math.abs(nvF) * 0.5 * dt * Math.abs(this.steer) * 2;
    this.drifting = Math.min(1, Math.abs(nvR) / 6);
    fwd.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    right.set(fwd.z, 0, -fwd.x);
    this.vel.copy(fwd).multiplyScalar(nvF).addScaledVector(right, nvR);
    this.pos.addScaledVector(this.vel, dt);
    // Capsule collision against buildings.
    const r = 1.1;
    for (const b of solids) {
      if (b.minX > this.pos.x + 6 || b.maxX < this.pos.x - 6 || b.minZ > this.pos.z + 6 || b.maxZ < this.pos.z - 6) continue;
      for (const k of [1.4, -1.4]) {
        const px = this.pos.x + fwd.x * k;
        const pz = this.pos.z + fwd.z * k;
        const cx = THREE.MathUtils.clamp(px, b.minX, b.maxX);
        const cz = THREE.MathUtils.clamp(pz, b.minZ, b.maxZ);
        const dx = px - cx;
        const dz = pz - cz;
        const d2 = dx * dx + dz * dz;
        if (d2 < r * r) {
          const d = Math.sqrt(d2) || 0.001;
          const nx = d2 > 1e-6 ? dx / d : -fwd.x * Math.sign(k);
          const nz = d2 > 1e-6 ? dz / d : -fwd.z * Math.sign(k);
          const push = r - d;
          this.pos.x += nx * push;
          this.pos.z += nz * push;
          const vn = this.vel.x * nx + this.vel.z * nz;
          if (vn < 0) {
            const impact = -vn;
            this.vel.x -= nx * vn * 1.4;
            this.vel.z -= nz * vn * 1.4;
            this.vel.multiplyScalar(0.7);
            this.heading += (nx * fwd.z - nz * fwd.x) * 0.08 * Math.sign(k);
            this.bump = Math.min(1, this.bump + impact / 12);
            this.lastHit = impact;
          }
        }
      }
    }
    for (const o of others) {
      if (o === this) continue;
      const dx = this.pos.x - o.pos.x;
      const dz = this.pos.z - o.pos.z;
      const d = Math.hypot(dx, dz);
      const min = this.radius + o.radius;
      if (d < min && d > 1e-4) {
        const nx = dx / d;
        const nz = dz / d;
        const push = (min - d) * 0.5;
        this.pos.x += nx * push;
        this.pos.z += nz * push;
        o.pos.x -= nx * push;
        o.pos.z -= nz * push;
        const rel = (this.vel.x - o.vel.x) * nx + (this.vel.z - o.vel.z) * nz;
        if (rel < 0) {
          this.vel.x -= nx * rel * 0.8;
          this.vel.z -= nz * rel * 0.8;
          o.vel.x += nx * rel * 0.8;
          o.vel.z += nz * rel * 0.8;
          this.bump = Math.min(1, this.bump + -rel / 10);
          o.bump = Math.min(1, o.bump + -rel / 10);
          this.lastHit = -rel;
        }
      }
    }
    // The city ends at the ring road; a kerb keeps everyone inside.
    const lim = CITY_HALF + 6;
    if (Math.abs(this.pos.x) > lim) {
      this.pos.x = Math.sign(this.pos.x) * lim;
      this.vel.x *= -0.3;
      this.bump = Math.min(1, this.bump + 0.3);
    }
    if (Math.abs(this.pos.z) > lim) {
      this.pos.z = Math.sign(this.pos.z) * lim;
      this.vel.z *= -0.3;
      this.bump = Math.min(1, this.bump + 0.3);
    }
    const targetRoll = -nvR * 0.012 - this.steer * nvF * 0.004;
    const targetPitch = -accel * 0.006;
    this.roll += (targetRoll - this.roll) * Math.min(1, dt * 6);
    this.pitch += (targetPitch - this.pitch) * Math.min(1, dt * 6);
    this.bump *= Math.pow(0.02, dt);
    this.mesh.position.copy(this.pos);
    this.mesh.rotation.y = this.heading;
    this.body.rotation.z = this.roll + Math.sin(performance.now() * 0.05) * this.bump * 0.05;
    this.body.rotation.x = this.pitch;
    this.body.position.y = Math.sin(performance.now() * 0.04) * this.bump * 0.08;
    const spin = (nvF * dt) / 0.36;
    for (const w of this.wheels) w.rotation.x += spin;
    for (const fw of this.frontWheels) fw.rotation.y = this.steer;
    this.tailMat.emissiveIntensity = inp.brake > 0 || inp.handbrake ? 3 : this.lightsOn ? 1.0 : 0.15;
  }
}
