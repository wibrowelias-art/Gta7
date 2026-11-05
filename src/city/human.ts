import * as THREE from 'three';

export interface Outfit {
  top: number;
  bottom: number;
  skin: number;
  hair: number;
  shoes: number;
  hoodie?: boolean;
  cap?: boolean;
}

export interface HumanRig {
  group: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  foreL: THREE.Group;
  foreR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  shinL: THREE.Group;
  shinR: THREE.Group;
  /** Drive the walk/run/idle pose. speed in m/s. */
  animate(t: number, speed: number, dt: number): void;
}

const geoCache = new Map<string, THREE.BufferGeometry>();
function bx(w: number, h: number, d: number): THREE.BufferGeometry {
  const k = `${w}|${h}|${d}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.BoxGeometry(w, h, d);
    geoCache.set(k, g);
  }
  return g;
}

let blobTex: THREE.CanvasTexture | null = null;
function blobTexture(): THREE.CanvasTexture {
  if (blobTex) return blobTex;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.6, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  blobTex = new THREE.CanvasTexture(c);
  return blobTex;
}

const faceCache = new Map<string, THREE.CanvasTexture>();
/** A painted face: eyes, brows and a mouth on a flat skin-coloured head front. */
function faceTexture(skin: number, hair: number, variant: number): THREE.CanvasTexture {
  const key = `${skin}-${hair}-${variant}`;
  const hit = faceCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = `#${skin.toString(16).padStart(6, '0')}`;
  g.fillRect(0, 0, 64, 64);
  const hairHex = `#${hair.toString(16).padStart(6, '0')}`;
  g.fillStyle = hairHex;
  g.fillRect(14, 22 + (variant % 2) * 2, 12, 3);
  g.fillRect(38, 22 + (variant % 2) * 2, 12, 3);
  g.fillStyle = '#ffffff';
  g.fillRect(15, 28, 10, 7);
  g.fillRect(39, 28, 10, 7);
  g.fillStyle = '#1a1016';
  g.fillRect(18 + (variant % 3), 30, 4, 4);
  g.fillRect(42 + (variant % 3), 30, 4, 4);
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(30, 36, 4, 8);
  g.fillStyle = '#5a2a2a';
  g.fillRect(24, 48, 16, 3);
  if (variant % 4 === 1) {
    g.fillStyle = '#ffffff';
    g.fillRect(26, 48, 12, 2);
  }
  if (variant % 5 === 2) {
    g.fillStyle = 'rgba(0,0,0,0.15)';
    g.fillRect(16, 44, 32, 16);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  faceCache.set(key, t);
  return t;
}

/**
 * Early-2000s character: blocky limbs, mitten hands, a flat head with a painted face, stiff joints.
 * Pivots sit at hips, shoulders, elbows, knees and neck so the walk cycle still reads.
 */
export function buildHuman(o: Outfit, variant = 0): HumanRig {
  const mat = (color: number) => new THREE.MeshLambertMaterial({ color });
  const topM = mat(o.top);
  const botM = mat(o.bottom);
  const skinM = mat(o.skin);
  const hairM = mat(o.hair);
  const shoeM = mat(o.shoes);
  const group = new THREE.Group();
  const blob = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), new THREE.MeshBasicMaterial({ map: blobTexture(), color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2;
  blob.position.y = -0.28;
  blob.renderOrder = 1;
  group.add(blob);
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material | THREE.Material[], y: number, x = 0, z = 0) => {
    const me = new THREE.Mesh(g, m);
    me.position.set(x, y, z);
    return me;
  };

  const hips = new THREE.Group();
  hips.position.y = 0.95;
  hips.add(mesh(bx(0.36, 0.2, 0.22), botM, 0));
  group.add(hips);

  const torso = new THREE.Group();
  torso.position.y = 0.08;
  torso.add(mesh(bx(0.44, 0.56, 0.26), topM, 0.3));
  if (o.hoodie) torso.add(mesh(bx(0.3, 0.12, 0.18), topM, 0.6, 0, -0.1));
  hips.add(torso);

  const head = new THREE.Group();
  head.position.y = 0.62;
  head.add(mesh(bx(0.1, 0.08, 0.1), skinM, 0.02));
  const faceMat = new THREE.MeshLambertMaterial({ map: faceTexture(o.skin, o.hair, variant) });
  head.add(mesh(new THREE.BoxGeometry(0.22, 0.26, 0.22), [skinM, skinM, hairM, skinM, faceMat, hairM], 0.19));
  head.add(mesh(bx(0.23, 0.08, 0.23), hairM, 0.33));
  if (o.cap) {
    head.add(mesh(bx(0.24, 0.06, 0.24), hairM, 0.36));
    head.add(mesh(bx(0.2, 0.02, 0.1), hairM, 0.34, 0, 0.16));
  }
  torso.add(head);

  const arm = (side: number): [THREE.Group, THREE.Group] => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.28, 0.52, 0);
    shoulder.add(mesh(bx(0.12, 0.3, 0.12), topM, -0.14));
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    elbow.add(mesh(bx(0.11, 0.26, 0.11), o.hoodie ? topM : skinM, -0.12));
    elbow.add(mesh(bx(0.12, 0.12, 0.09), skinM, -0.3)); // mitten hand
    shoulder.add(elbow);
    torso.add(shoulder);
    return [shoulder, elbow];
  };
  const [armL, foreL] = arm(-1);
  const [armR, foreR] = arm(1);

  const leg = (side: number): [THREE.Group, THREE.Group] => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.1, -0.08, 0);
    hip.add(mesh(bx(0.16, 0.44, 0.17), botM, -0.2));
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    knee.add(mesh(bx(0.15, 0.42, 0.16), botM, -0.2));
    knee.add(mesh(bx(0.16, 0.1, 0.28), shoeM, -0.42, 0, 0.05));
    hip.add(knee);
    hips.add(hip);
    return [hip, knee];
  };
  const [legL, shinL] = leg(-1);
  const [legR, shinR] = leg(1);

  const rig: HumanRig = {
    group,
    hips,
    torso,
    head,
    armL,
    armR,
    foreL,
    foreR,
    legL,
    legR,
    shinL,
    shinR,
    animate(t, speed) {
      const moving = Math.min(1, speed / 1.2);
      const run = THREE.MathUtils.clamp((speed - 3) / 4, 0, 1);
      const rate = 5.2 + speed * 1.3;
      (rig as any).__phase = ((rig as any).__phase ?? 0) + (1 / 60) * rate * moving;
      const p = (rig as any).__phase as number;
      // Stiff, slightly stepped motion like a low-keyframe cycle.
      const s = Math.round(Math.sin(p) * 6) / 6;
      const c = Math.cos(p);
      const amp = 0.55 + run * 0.4;
      legL.rotation.x = s * amp;
      legR.rotation.x = -s * amp;
      shinL.rotation.x = -Math.max(0, -s) * (0.8 + run * 0.6) - 0.05;
      shinR.rotation.x = -Math.max(0, s) * (0.8 + run * 0.6) - 0.05;
      armL.rotation.x = -s * (0.45 + run * 0.4) * moving;
      armR.rotation.x = s * (0.45 + run * 0.4) * moving;
      armL.rotation.z = 0.12;
      armR.rotation.z = -0.12;
      foreL.rotation.x = -0.25 - run * 1.1 - Math.max(0, -s) * 0.3 * moving;
      foreR.rotation.x = -0.25 - run * 1.1 - Math.max(0, s) * 0.3 * moving;
      hips.position.y = 0.95 + Math.abs(c) * 0.04 * moving - run * 0.03;
      hips.rotation.y = s * 0.08 * moving;
      torso.rotation.x = run * 0.18;
      torso.rotation.y = -s * 0.1 * moving;
      head.rotation.y = Math.sin(t * 0.35) * 0.25 * (1 - moving);
      head.rotation.x = run * -0.1;
    },
  };
  return rig;
}

export const OUTFITS: Outfit[] = [
  { top: 0x9a9a9a, bottom: 0x1e2430, skin: 0xe3b08a, hair: 0x1a1016, shoes: 0xf2f2f2, hoodie: true },
  { top: 0xf4f1ea, bottom: 0x3a5a8a, skin: 0xa8714c, hair: 0x120d0f, shoes: 0xe8e8e8, cap: true },
  { top: 0x2b2b2b, bottom: 0x4a6a9a, skin: 0xc98a5a, hair: 0x2b1a12, shoes: 0x1a1a1a },
  { top: 0x7a2e2e, bottom: 0x2a2a2a, skin: 0xf1c6a7, hair: 0xd9a066, shoes: 0x3a2a1a },
  { top: 0x2d4a7a, bottom: 0x8a8a8a, skin: 0x8d5a3c, hair: 0x0b0808, shoes: 0xffffff, hoodie: true },
  { top: 0xd9c4a0, bottom: 0x2a3a2a, skin: 0xf5d7c3, hair: 0x5a2a1a, shoes: 0x2a2a2a },
  { top: 0x3f7f5f, bottom: 0x1e1e26, skin: 0x6b4229, hair: 0x16100f, shoes: 0xcccccc, cap: true },
  { top: 0x1e1e26, bottom: 0x5a5a66, skin: 0xe9b58e, hair: 0x8f4a2b, shoes: 0x3a1a1a, hoodie: true },
];
