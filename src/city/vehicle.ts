import * as THREE from 'three';
import type { Box2 } from './world';
import { radialSpriteTexture } from './world';

export interface CarInput {
  throttle: number;
  brake: number;
  steer: number; // -1..1
  handbrake: boolean;
}

export const CAR_COLORS = [0xff3d8b, 0xff8a3d, 0xffc857, 0x2ee6c8, 0x3fd0ff, 0x8b5cf6, 0x3dff8f, 0xfff4ec, 0x1e1729, 0xff4458, 0x8a8a9a];

const tmp = new THREE.Vector3();

/** Arcade car: 2D rigid body on the road plane with drift, plus a lit low-poly mesh. */
export class Car {
  mesh = new THREE.Group();
  pos = new THREE.Vector3();
  vel = new THREE.Vector3();
  heading = 0;
  steer = 0;
  radius = 1.45;
  length = 4.4;
  width = 2.0;
  input: CarInput = { throttle: 0, brake: 0, steer: 0, handbrake: false };
  wheels: THREE.Mesh[] = [];
  frontWheels: THREE.Group[] = [];
  body: THREE.Group;
  headlights: THREE.SpotLight[] = [];
  tailMat: THREE.MeshStandardMaterial;
  headMat: THREE.MeshStandardMaterial;
  underglow: THREE.Mesh;
  drifting = 0;
  bump = 0; // body shake after collisions
  ai = false;
  lightsOn = true;
  color: number;
  // Suspension visual state.
  private roll = 0;
  private pitch = 0;
  lastHit = 0;

  constructor(color: number, withShadowLights = false, realLights = true) {
    this.color = color;
    const paint = new THREE.MeshPhysicalMaterial({ color, roughness: 0.25, metalness: 0.7, clearcoat: 1, clearcoatRoughness: 0.08 });
    const dark = new THREE.MeshStandardMaterial({ color: 0x14121a, roughness: 0.5, metalness: 0.4 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x1a2030, roughness: 0.05, metalness: 0.9, transparent: true, opacity: 0.85 });
    const chrome = new THREE.MeshStandardMaterial({ color: 0xdddde6, roughness: 0.15, metalness: 1 });
    this.tailMat = new THREE.MeshStandardMaterial({ color: 0xff2a3a, emissive: 0xff2030, emissiveIntensity: 1.2 });
    this.headMat = new THREE.MeshStandardMaterial({ color: 0xfff4ec, emissive: 0xfff0d0, emissiveIntensity: 3.5 });
    const body = new THREE.Group();
    this.body = body;
    // Lower body with a slight wedge: box + sloped hood via two boxes.
    const lower = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.62, 4.4), paint);
    lower.position.y = 0.62;
    lower.castShadow = true;
    lower.receiveShadow = true;
    body.add(lower);
    const hood = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.3, 1.4), paint);
    hood.position.set(0, 0.98, 1.3);
    hood.rotation.x = 0.08;
    hood.castShadow = true;
    body.add(hood);
    const trunk = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.34, 1.0), paint);
    trunk.position.set(0, 0.98, -1.55);
    trunk.castShadow = true;
    body.add(trunk);
    // Cabin.
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.6, 2.0), glass);
    cabin.position.set(0, 1.3, -0.15);
    cabin.castShadow = true;
    body.add(cabin);
    const roofM = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 1.7), paint);
    roofM.position.set(0, 1.62, -0.15);
    body.add(roofM);
    const pillars = new THREE.Mesh(new THREE.BoxGeometry(1.72, 0.62, 0.12), dark);
    pillars.position.set(0, 1.3, 0.82);
    body.add(pillars);
    // Bumpers, sills, grille.
    const sillL = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.25, 3.6), dark);
    sillL.position.set(-1.02, 0.4, 0);
    const sillR = sillL.clone();
    sillR.position.x = 1.02;
    body.add(sillL, sillR);
    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.3, 0.3), dark);
    bumperF.position.set(0, 0.45, 2.2);
    const bumperB = bumperF.clone();
    bumperB.position.z = -2.2;
    body.add(bumperF, bumperB);
    const grille = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.22, 0.05), chrome);
    grille.position.set(0, 0.72, 2.22);
    body.add(grille);
    // Lights.
    for (const sx of [-0.7, 0.7]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.08), this.headMat);
      h.position.set(sx, 0.78, 2.22);
      body.add(h);
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.08), this.tailMat);
      t.position.set(sx, 0.82, -2.22);
      body.add(t);
    }
    // Headlight spotlights (real light on the road ahead). Only the player's car gets these: real lights are per-pixel cost.
    for (const sx of realLights ? [-0.7, 0.7] : []) {
      const sl = new THREE.SpotLight(0xfff0d0, 60, 45, 0.55, 0.5, 1.4);
      sl.position.set(sx, 0.8, 2.1);
      sl.target.position.set(sx * 1.6, -0.5, 18);
      sl.castShadow = withShadowLights && sx > 0;
      if (sl.castShadow) {
        sl.shadow.mapSize.set(1024, 1024);
        sl.shadow.bias = -0.0005;
      }
      body.add(sl, sl.target);
      this.headlights.push(sl);
    }
    // Headlight glow sprites + taillight glow.
    const glowTex = radialSpriteTexture();
    for (const sx of [-0.7, 0.7]) {
      const g = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xfff0d0, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.position.set(sx, 0.78, 2.3);
      g.scale.set(1.4, 1.0, 1);
      body.add(g);
      const r = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xff2a3a, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      r.position.set(sx, 0.82, -2.3);
      r.scale.set(1.2, 0.8, 1);
      body.add(r);
    }
    // Underglow (neon strip under the car) reflecting on wet asphalt.
    this.underglow = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 5.4), new THREE.MeshBasicMaterial({ map: glowTex, color, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.underglow.rotation.x = -Math.PI / 2;
    this.underglow.position.y = 0.06;
    body.add(this.underglow);
    this.mesh.add(body);
    // Wheels.
    const tyre = new THREE.MeshStandardMaterial({ color: 0x101014, roughness: 0.9 });
    const rim = new THREE.MeshStandardMaterial({ color: 0xcfcfd8, roughness: 0.2, metalness: 1 });
    for (const [sx, sz] of [[-0.95, 1.4], [0.95, 1.4], [-0.95, -1.4], [0.95, -1.4]] as const) {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.28, 18), tyre);
      w.rotation.z = Math.PI / 2;
      w.castShadow = true;
      const rimM = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.3, 10), rim);
      rimM.rotation.z = Math.PI / 2;
      const hub = new THREE.Group();
      hub.add(w, rimM);
      hub.position.set(sx, 0.36, sz);
      const steerGroup = new THREE.Group();
      steerGroup.position.copy(hub.position);
      hub.position.set(0, 0, 0);
      steerGroup.add(hub);
      this.mesh.add(steerGroup);
      this.wheels.push(w);
      (w as any).__rim = rimM;
      if (sz > 0) this.frontWheels.push(steerGroup);
    }
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
    for (const l of this.headlights) l.intensity = on ? 60 : 0;
    this.headMat.emissiveIntensity = on ? 3.5 : 0.1;
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
    const maxSpeed = this.ai ? 16 : 46; // m/s (~165 km/h)
    // Engine / brakes.
    let accel = 0;
    if (inp.throttle > 0) accel += (vF < 0 ? 22 : 16 * (1 - Math.max(0, vF) / maxSpeed) + 3) * inp.throttle;
    if (inp.brake > 0) accel -= vF > 0.5 ? 28 * inp.brake : 9 * inp.brake; // brake, or reverse
    if (inp.handbrake && inp.throttle === 0 && inp.brake === 0) accel -= THREE.MathUtils.clamp(vF / dt, -14, 14); // parking brake holds the car
    // Drag and rolling resistance.
    accel -= vF * 0.08 + Math.sign(vF) * 0.6;
    let nvF = vF + accel * dt;
    if (Math.abs(nvF) < 0.05 && inp.throttle === 0 && inp.brake === 0) nvF = 0;
    nvF = THREE.MathUtils.clamp(nvF, -12, maxSpeed);
    // Steering: tighter at low speed, limited at high speed.
    const steerTarget = inp.steer * (0.55 - 0.32 * Math.min(1, Math.abs(vF) / 30));
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 10);
    const turnRate = (nvF / 3.2) * Math.tan(this.steer) * (inp.handbrake ? 1.35 : 1);
    this.heading += turnRate * dt;
    // Lateral grip: drift when handbraking or sliding hard.
    const grip = inp.handbrake ? 1.4 : 7.5;
    let nvR = vR - vR * Math.min(1, grip * dt);
    if (inp.handbrake && Math.abs(nvF) > 6) nvR += -Math.sign(this.steer) * Math.abs(nvF) * 0.5 * dt * Math.abs(this.steer) * 2;
    this.drifting = Math.min(1, Math.abs(nvR) / 6);
    // Recompose velocity in the new heading frame.
    fwd.set(Math.sin(this.heading), 0, Math.cos(this.heading));
    right.set(fwd.z, 0, -fwd.x);
    this.vel.copy(fwd).multiplyScalar(nvF).addScaledVector(right, nvR);
    this.pos.addScaledVector(this.vel, dt);
    // Collisions with buildings: the car is a capsule made of two circles (nose and tail).
    const r = 1.15;
    for (const b of solids) {
      if (b.minX > this.pos.x + 6 || b.maxX < this.pos.x - 6 || b.minZ > this.pos.z + 6 || b.maxZ < this.pos.z - 6) continue;
      for (const k of [1.45, -1.45]) {
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
            // Glancing hits nudge the heading so the car slides along the wall instead of sticking.
            this.heading += (nx * fwd.z - nz * fwd.x) * 0.08 * Math.sign(k);
            this.bump = Math.min(1, this.bump + impact / 12);
            this.lastHit = impact;
          }
        }
      }
    }
    // Car vs car.
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
    // World bounds.
    const lim = 330;
    if (Math.abs(this.pos.x) > lim) {
      this.pos.x = Math.sign(this.pos.x) * lim;
      this.vel.x *= -0.3;
    }
    if (Math.abs(this.pos.z) > lim) {
      this.pos.z = Math.sign(this.pos.z) * lim;
      this.vel.z *= -0.3;
    }
    // Visuals: body roll/pitch from lateral and longitudinal acceleration.
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
    for (const w of this.wheels) {
      w.rotation.x += spin;
      ((w as any).__rim as THREE.Mesh).rotation.x = w.rotation.x;
    }
    for (const fw of this.frontWheels) fw.rotation.y = this.steer;
    this.tailMat.emissiveIntensity = inp.brake > 0 || inp.handbrake ? 4 : this.lightsOn ? 1.2 : 0.1;
  }
}
