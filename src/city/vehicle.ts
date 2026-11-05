import * as THREE from 'three';
import type { Box2 } from './world';
import { radialSpriteTexture, CITY_HALF, blobShadow } from './world';

export interface CarInput {
  throttle: number;
  brake: number;
  steer: number;
  handbrake: boolean;
}

export type CarKind = 'sedan' | 'hatch' | 'sports' | 'van' | 'taxi' | 'bike' | 'bus';
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
  tailMat: THREE.MeshLambertMaterial;
  headMat: THREE.MeshLambertMaterial;
  drifting = 0;
  bump = 0;
  ai = false;
  lightsOn = false;
  color: number;
  kind: CarKind;
  lastHit = 0;
  /** Ground height under the vehicle (0.3 when parked on a sidewalk). */
  baseY = 0;
  private roll = 0;
  private pitch = 0;
  private glows: THREE.Sprite[] = [];
  driver: THREE.Group = new THREE.Group();
  door: THREE.Group | null = null;
  doorOpen = 0; // 0 closed .. 1 open
  doorTarget = 0;
  pedals: THREE.Group | null = null;
  riderLegs: THREE.Group[] = [];

  constructor(color: number, withShadowLights = false, realLights = true, kind: CarKind = 'sedan') {
    this.color = color;
    this.kind = kind;
    const paint = new THREE.MeshPhongMaterial({ color, specular: 0x555555, shininess: 28 });
    const dark = new THREE.MeshLambertMaterial({ color: 0x1a1a1e});
    const glass = new THREE.MeshLambertMaterial({ color: 0x1a2430, transparent: true, opacity: 0.72 });
    const chrome = new THREE.MeshLambertMaterial({ color: 0xd8d8e0});
    this.tailMat = new THREE.MeshLambertMaterial({ color: 0x8a1010, emissive: 0xff2030, emissiveIntensity: 0.2 });
    this.headMat = new THREE.MeshLambertMaterial({ color: 0xfff4ec, emissive: 0xfff0d0, emissiveIntensity: 0.1 });
    const b = this.body;
    const sh = (m: THREE.Mesh) => {
      m.castShadow = false;
      m.receiveShadow = false;
      return m;
    };
    // Silhouette parameters per kind.
    if (kind === 'bike') {
      this.buildBike(paint, dark, chrome);
      this.radius = 0.9;
      return;
    }
    const P = {
      sedan: { len: 4.6, wid: 1.86, lowH: 0.56, cabinZ: -0.2, cabinL: 2.1, cabinH: 0.55, hoodL: 1.5, trunkL: 1.1 },
      hatch: { len: 4.0, wid: 1.78, lowH: 0.56, cabinZ: -0.35, cabinL: 2.3, cabinH: 0.6, hoodL: 1.2, trunkL: 0.3 },
      sports: { len: 4.4, wid: 1.9, lowH: 0.48, cabinZ: -0.45, cabinL: 1.7, cabinH: 0.46, hoodL: 1.9, trunkL: 0.7 },
      van: { len: 5.0, wid: 1.95, lowH: 0.8, cabinZ: -0.5, cabinL: 3.6, cabinH: 0.9, hoodL: 0.8, trunkL: 0.0 },
      taxi: { len: 4.6, wid: 1.86, lowH: 0.56, cabinZ: -0.2, cabinL: 2.1, cabinH: 0.55, hoodL: 1.5, trunkL: 1.1 },
      bus: { len: 11.0, wid: 2.5, lowH: 1.0, cabinZ: 0, cabinL: 10.4, cabinH: 1.5, hoodL: 0.3, trunkL: 0.0 },
    }[kind];
    // Body: a side-profile silhouette (bumper → hood → windscreen → roof → rear glass → tail) extruded across the width
    // with a bevel, so the shell reads as one smooth low-poly car like an early-2000s model, not a stack of boxes.
    const y0 = 0.42;
    const L = P.len / 2;
    const hoodY = y0 + P.lowH;
    const roofY = hoodY + P.cabinH;
    const cabF = P.cabinZ + P.cabinL / 2; // windscreen base
    const cabB = P.cabinZ - P.cabinL / 2; // rear glass base
    const rake = kind === 'sports' ? 0.75 : kind === 'van' || kind === 'bus' ? 0.25 : 0.55;
    const profile = new THREE.Shape();
    profile.moveTo(L, y0 + 0.12);
    profile.lineTo(L, hoodY - 0.14);
    profile.lineTo(L - 0.25, hoodY);
    profile.lineTo(cabF + 0.05, hoodY + (kind === 'van' || kind === 'bus' ? 0.2 : 0.05));
    profile.lineTo(cabF - rake, roofY);
    profile.lineTo(cabB + rake * 0.7, roofY);
    profile.lineTo(cabB - (P.trunkL > 0.2 ? 0.1 : 0.35), hoodY + (P.trunkL > 0.2 ? 0.1 : 0.0));
    profile.lineTo(-L + 0.15, hoodY + (P.trunkL > 0.2 ? 0.06 : 0.0));
    profile.lineTo(-L, hoodY - 0.16);
    profile.lineTo(-L, y0 + 0.12);
    profile.lineTo(-L + 0.3, y0);
    profile.lineTo(L - 0.3, y0);
    profile.closePath();
    const bodyGeo = new THREE.ExtrudeGeometry(profile, { depth: P.wid - 0.3, bevelEnabled: true, bevelThickness: 0.15, bevelSize: 0.14, bevelSegments: 2, curveSegments: 2 });
    bodyGeo.rotateY(Math.PI / 2);
    bodyGeo.translate(-(P.wid - 0.3) / 2, 0, 0);
    bodyGeo.computeVertexNormals();
    const shell = sh(new THREE.Mesh(bodyGeo, paint));
    b.add(shell);
    // Glass: the cabin section as a second, slightly inset extrusion so pillars are paint and panes are dark glass.
    const gl = new THREE.Shape();
    gl.moveTo(cabF + 0.02, hoodY + 0.06);
    gl.lineTo(cabF - rake + 0.05, roofY - 0.04);
    gl.lineTo(cabB + rake * 0.7 - 0.05, roofY - 0.04);
    gl.lineTo(cabB - 0.08, hoodY + 0.08);
    gl.closePath();
    const glassGeo = new THREE.ExtrudeGeometry(gl, { depth: P.wid - 0.08, bevelEnabled: false });
    glassGeo.rotateY(Math.PI / 2);
    glassGeo.translate(-(P.wid - 0.08) / 2, 0, 0);
    b.add(new THREE.Mesh(glassGeo, glass));
    // Dark cabin interior volume behind the glass so the windows read as windows, not a grey block.
    const interior = new THREE.Mesh(new THREE.BoxGeometry(P.wid - 0.3, P.cabinH - 0.14, P.cabinL - rake * 1.2 - 0.1), new THREE.MeshLambertMaterial({ color: 0x0c0e12 }));
    interior.position.set(0, hoodY + (P.cabinH - 0.14) / 2 + 0.02, P.cabinZ - rake * 0.15);
    b.add(interior);
    // Roof pillars front/back as thin paint strips over the glass edges.
    for (const [z0, z1] of [[cabF + 0.02, cabF - rake + 0.05], [cabB - 0.08, cabB + rake * 0.7 - 0.05]] as const) {
      for (const sx of [-1, 1]) {
        const dx = z1 - z0;
        const dy = roofY - hoodY - 0.1;
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.08, Math.hypot(dx, dy), 0.1), paint);
        pillar.position.set(sx * (P.wid / 2 - 0.08), hoodY + 0.05 + dy / 2, (z0 + z1) / 2);
        pillar.rotation.x = Math.atan2(dx, dy);
        b.add(pillar);
      }
    }
    const roof = { position: { y: roofY } };
    const cabin = { position: { y: hoodY + P.cabinH / 2 } };
    // Wheel arches: dark recesses cut into the sides.
    const archGeo = new THREE.CylinderGeometry(0.46, 0.46, 0.34, 12, 1, false, 0, Math.PI);
    for (const [sx, sz] of [[-1, 1.45], [1, 1.45], [-1, -1.45], [1, -1.45]] as const) {
      const arch = new THREE.Mesh(archGeo, dark);
      arch.rotation.z = Math.PI / 2;
      arch.rotation.y = Math.PI / 2;
      arch.position.set(sx * (P.wid / 2 - 0.1), 0.44, sz * (P.len / 4.6));
      b.add(arch);
    }
    // Bumpers, grille, mirrors, plate, exhaust, door seams.
    const bumperF = new THREE.Mesh(new THREE.BoxGeometry(P.wid - 0.1, 0.22, 0.2), dark);
    bumperF.position.set(0, y0 + 0.12, L - 0.02);
    const bumperB = bumperF.clone();
    bumperB.position.z = -L + 0.02;
    b.add(bumperF, bumperB);
    const grille = new THREE.Mesh(new THREE.BoxGeometry(P.wid * 0.45, 0.16, 0.05), dark);
    grille.position.set(0, hoodY - 0.3, L + 0.01);
    b.add(grille);
    for (const sx of [-1, 1]) {
      const mirror = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.1, 0.14), paint);
      mirror.position.set(sx * (P.wid / 2 + 0.08), hoodY + 0.3, cabF - 0.05);
      b.add(mirror);
      const ex = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.25, 8), chrome);
      ex.rotation.x = Math.PI / 2;
      ex.position.set(sx * 0.5, 0.3, -L - 0.02);
      b.add(ex);
      // Door seam lines.
      const seam = new THREE.Mesh(new THREE.BoxGeometry(0.01, P.lowH - 0.1, 0.02), dark);
      seam.position.set(sx * (P.wid / 2 + 0.005), y0 + P.lowH / 2, P.cabinZ - P.cabinL * 0.05);
      b.add(seam);
    }
    const plate = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.12, 0.02), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
    plate.position.set(0, y0 + 0.3, -L - 0.03);
    b.add(plate);
    if (kind === 'taxi') {
      const sign = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.18, 0.3), new THREE.MeshLambertMaterial({ color: 0xffd04a, emissive: 0xffc830, emissiveIntensity: 0.6 }));
      sign.position.set(0, roof.position.y + 0.1, P.cabinZ);
      b.add(sign);
    }
    void cabin;
    // Lights.
    for (const sx of [-0.62, 0.62]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.16, 0.06), this.headMat);
      h.position.set(sx * (P.wid / 1.86 * 0.95), 0.42 + P.lowH * 0.72, P.len / 2 + 0.02);
      b.add(h);
      const t = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.14, 0.06), this.tailMat);
      t.position.set(sx * (P.wid / 1.86 * 0.95), 0.42 + P.lowH * 0.78, -P.len / 2 - 0.02);
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
    const skinM = new THREE.MeshLambertMaterial({ color: [0xe3b08a, 0xc98a5a, 0xa8714c, 0xf1c6a7][Math.abs(color) % 4]});
    const shirtM = new THREE.MeshLambertMaterial({ color: [0x2a2a2a, 0x9a9a9a, 0x3a5a8a, 0x7a2e2e][Math.abs(color >> 4) % 4]});
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.5, 0.26), shirtM);
    torso.position.set(-0.38, 0.42 + P.lowH + 0.2, P.cabinZ + 0.1);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.22), skinM);
    head.position.set(-0.38, torso.position.y + 0.42, P.cabinZ + 0.1);
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.09, 0.23), new THREE.MeshLambertMaterial({ color: 0x1a1016}));
    hair.position.set(-0.38, head.position.y + 0.12, P.cabinZ + 0.1);
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.17, 0.025, 6, 16), dark);
    wheel.position.set(-0.38, 0.42 + P.lowH + 0.3, P.cabinZ + 0.75);
    wheel.rotation.x = -0.9;
    this.driver.add(torso, head, hair, wheel);
    this.driver.visible = false;
    b.add(this.driver);
    // Driver door: hinged at the front edge, swings out when someone gets in or out.
    this.door = new THREE.Group();
    const doorL = P.cabinL * 0.55;
    const hingeZ = P.cabinZ + P.cabinL / 2 - 0.05;
    this.door.position.set(-(P.wid / 2), 0.42 + P.lowH / 2, hingeZ);
    const panel = sh(new THREE.Mesh(new THREE.BoxGeometry(0.05, P.lowH - 0.12, doorL), paint));
    panel.position.set(0, 0, -doorL / 2);
    const win = new THREE.Mesh(new THREE.BoxGeometry(0.04, P.cabinH - 0.08, doorL - 0.2), glass);
    win.position.set(0.02, P.lowH / 2 + P.cabinH / 2 + 0.02, -doorL / 2);
    const handle = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.04, 0.16), chrome);
    handle.position.set(-0.04, 0.1, -doorL * 0.75);
    this.door.add(panel, win, handle);
    b.add(this.door);
    this.mesh.add(blobShadow(P.wid + 0.6, P.len + 0.6));
    this.mesh.add(b);
    // Wheels.
    const tyre = new THREE.MeshLambertMaterial({ color: 0x151518});
    const rim = new THREE.MeshLambertMaterial({ color: 0xcfcfd8});
    for (const [sx, sz] of [[-1, 1.45], [1, 1.45], [-1, -1.45], [1, -1.45]] as const) {
      const hub = new THREE.Group();
      const w = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 20), tyre));
      w.rotation.z = Math.PI / 2;
      const rimM = new THREE.Mesh(new THREE.CylinderGeometry(0.23, 0.23, 0.28, 12), rim);
      rimM.rotation.z = Math.PI / 2;
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.3, 8), dark);
      cap.rotation.z = Math.PI / 2;
      hub.add(w, rimM, cap);
      for (let k = 0; k < 5; k++) {
        const sp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.05, 0.16), dark);
        sp.rotation.x = (k / 5) * Math.PI;
        hub.add(sp);
      }
      const steerGroup = new THREE.Group();
      steerGroup.position.set(sx * (P.wid / 2 - 0.08), 0.37, sz * (P.len / 4.6));
      steerGroup.add(hub);
      this.mesh.add(steerGroup);
      this.wheels.push(hub);
      if (sz > 0) this.frontWheels.push(steerGroup);
    }
    this.radius = P.len * 0.32;
    if (kind === 'bus') {
      // Route board and a stripe.
      const board = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.35, 0.05), new THREE.MeshLambertMaterial({ color: 0xffd04a, emissive: 0xffc830, emissiveIntensity: 0.8 }));
      board.position.set(0, 0.42 + P.lowH + P.cabinH + 0.1, P.len / 2 + 0.03);
      b.add(board);
      const stripe = new THREE.Mesh(new THREE.BoxGeometry(P.wid + 0.04, 0.25, P.len - 0.4), new THREE.MeshLambertMaterial({ color: 0xd9b43a}));
      stripe.position.set(0, 0.42 + P.lowH * 0.5, 0);
      b.add(stripe);
    }
  }

  private buildBike(paint: THREE.Material, dark: THREE.Material, chrome: THREE.Material): void {
    const b = this.body;
    const sh = (m: THREE.Mesh) => {
      m.castShadow = false;
      return m;
    };
    const tube = (a: THREE.Vector3, c: THREE.Vector3, r = 0.03, mat: THREE.Material = paint) => {
      const len = a.distanceTo(c);
      const m = sh(new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 8), mat));
      m.position.copy(a).lerp(c, 0.5);
      m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), c.clone().sub(a).normalize());
      b.add(m);
    };
    const rear = new THREE.Vector3(0, 0.35, -0.55);
    const front = new THREE.Vector3(0, 0.35, 0.55);
    const crank = new THREE.Vector3(0, 0.38, -0.05);
    const seatP = new THREE.Vector3(0, 0.95, -0.25);
    const head = new THREE.Vector3(0, 0.9, 0.45);
    tube(crank, seatP);
    tube(crank, head);
    tube(seatP, head.clone().setY(0.95));
    tube(rear, crank);
    tube(rear, seatP);
    tube(head, front, 0.025, chrome);
    // Handlebar, seat, wheels, pedals.
    const bar = sh(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.6, 8), chrome));
    bar.rotation.z = Math.PI / 2;
    bar.position.set(0, 1.0, 0.45);
    b.add(bar);
    const seat = sh(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.06, 0.28), dark));
    seat.position.copy(seatP).add(new THREE.Vector3(0, 0.03, 0));
    b.add(seat);
    const tyre = new THREE.MeshLambertMaterial({ color: 0x151518});
    for (const [z, isFront] of [[-0.55, false], [0.55, true]] as const) {
      const hub = new THREE.Group();
      const w = sh(new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.035, 8, 20), tyre));
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.28, 0.012, 6, 20), chrome);
      hub.add(w, rim);
      for (let i = 0; i < 8; i++) {
        const sp = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.56, 4), chrome);
        sp.rotation.z = (i / 8) * Math.PI;
        hub.add(sp);
      }
      const sg = new THREE.Group();
      sg.position.set(0, 0.35, z);
      sg.add(hub);
      this.mesh.add(sg);
      this.wheels.push(hub);
      if (isFront) this.frontWheels.push(sg);
    }
    this.pedals = new THREE.Group();
    this.pedals.position.copy(crank);
    for (const s of [1, -1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.17, 0.03), dark);
      arm.position.set(s * 0.08, s * 0.08, 0);
      const pedal = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.02, 0.06), dark);
      pedal.position.set(s * 0.13, s * 0.16, 0);
      this.pedals.add(arm, pedal);
    }
    b.add(this.pedals);
    // Rider: seated human pieces (torso leaning forward, legs on the pedals), shown only when ridden.
    this.driver = new THREE.Group();
    const skin = new THREE.MeshLambertMaterial({ color: 0xe3b08a});
    const shirt = new THREE.MeshLambertMaterial({ color: 0x2b2b2b});
    const jeans = new THREE.MeshLambertMaterial({ color: 0x3a5a8a});
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.56, 0.26), shirt);
    torso.position.set(0, 1.28, -0.05);
    torso.rotation.x = 0.35;
    const headM = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.24, 0.22), skin);
    headM.position.set(0, 1.66, 0.1);
    const hair = new THREE.Mesh(new THREE.BoxGeometry(0.21, 0.09, 0.23), new THREE.MeshLambertMaterial({ color: 0x1a1016 }));
    hair.position.set(0, 1.78, 0.1);
    this.driver.add(torso, headM, hair);
    for (const s of [-1, 1]) {
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.55, 0.1), shirt);
      arm.position.set(s * 0.26, 1.25, 0.22);
      arm.rotation.x = -0.9;
      this.driver.add(arm);
      const leg = new THREE.Group();
      leg.position.set(s * 0.14, 1.0, -0.2);
      const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.42, 0.17), jeans);
      thigh.position.y = -0.2;
      const shin = new THREE.Group();
      shin.position.y = -0.42;
      const shinM = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.42, 0.15), jeans);
      shinM.position.y = -0.2;
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.08, 0.26), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
      shoe.position.set(0, -0.42, 0.05);
      shin.add(shinM, shoe);
      leg.add(thigh, shin);
      this.driver.add(leg);
      this.riderLegs.push(leg, shin);
    }
    this.driver.visible = false;
    b.add(this.driver);
    this.mesh.add(blobShadow(1.0, 2.0));
    this.mesh.add(b);
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
    const maxSpeed = (this as any).__maxOverride ?? (this.ai ? 16 : this.kind === 'sports' ? 52 : this.kind === 'van' ? 36 : this.kind === 'bike' ? 11 : this.kind === 'bus' ? 30 : 44);
    let accel = 0;
    if (inp.throttle > 0) accel += (vF < 0 ? 22 : (this.kind === 'sports' ? 19 : this.kind === 'bike' ? 6 : 15) * (1 - Math.max(0, vF) / maxSpeed) + 3) * inp.throttle;
    if (inp.brake > 0) accel -= vF > 0.5 ? 28 * inp.brake : 9 * inp.brake;
    if (inp.handbrake && inp.throttle === 0 && inp.brake === 0) accel -= THREE.MathUtils.clamp(vF / dt, -14, 14);
    accel -= vF * 0.08 + Math.sign(vF) * 0.6;
    let nvF = vF + accel * dt;
    if (Math.abs(nvF) < 0.05 && inp.throttle === 0 && inp.brake === 0) nvF = 0;
    nvF = THREE.MathUtils.clamp(nvF, -12, maxSpeed);
    const steerTarget = inp.steer * (this.kind === 'bike' ? 0.7 - 0.3 * Math.min(1, Math.abs(vF) / 10) : 0.55 - 0.32 * Math.min(1, Math.abs(vF) / 30));
    this.steer += (steerTarget - this.steer) * Math.min(1, dt * 10);
    const turnRate = (nvF / (this.kind === 'bike' ? 1.1 : 3.2)) * Math.tan(this.steer) * (inp.handbrake ? 1.35 : 1);
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
    this.mesh.position.y = this.baseY;
    this.mesh.rotation.y = this.heading;
    this.body.rotation.z = this.roll + Math.sin(performance.now() * 0.05) * this.bump * 0.05;
    this.body.rotation.x = this.pitch;
    this.body.position.y = Math.sin(performance.now() * 0.04) * this.bump * 0.08;
    const spin = (nvF * dt) / 0.36;
    for (const w of this.wheels) w.rotation.x += spin;
    for (const fw of this.frontWheels) fw.rotation.y = this.steer;
    if (this.kind === 'bike') {
      // Lean into corners; pedal with the wheels; rider legs follow the cranks.
      this.body.rotation.z = -this.steer * 0.35 * Math.min(1, Math.abs(nvF) / 4) + this.roll;
      this.mesh.children.forEach((c) => (c.rotation.z = this.body.rotation.z));
      if (this.pedals) {
        this.pedals.rotation.x += spin * 0.5;
        const ph = this.pedals.rotation.x;
        for (let i = 0; i < this.riderLegs.length; i += 2) {
          const s = i === 0 ? 1 : -1;
          this.riderLegs[i].rotation.x = -0.9 + Math.sin(ph) * s * 0.35;
          this.riderLegs[i + 1].rotation.x = 1.3 + Math.cos(ph) * s * 0.3;
        }
      }
    }
    if (this.door) {
      this.doorOpen += (this.doorTarget - this.doorOpen) * Math.min(1, dt * 7);
      this.door.rotation.y = this.doorOpen * 1.0;
    }
    this.tailMat.emissiveIntensity = inp.brake > 0 || inp.handbrake ? 3 : this.lightsOn ? 1.0 : 0.15;
  }
}
