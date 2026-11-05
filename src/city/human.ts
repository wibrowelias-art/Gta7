import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';

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
/** Rounded low-poly block: smooth normals, few segments, like a 2004-era character mesh. */
function rb(w: number, h: number, d: number, r: number): THREE.BufferGeometry {
  const k = `${w}|${h}|${d}|${r}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, 2, r);
    geoCache.set(k, g);
  }
  return g;
}
function tube(rTop: number, rBot: number, h: number): THREE.BufferGeometry {
  const k = `t${rTop}|${rBot}|${h}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new THREE.CylinderGeometry(rTop, rBot, h, 8, 1);
    geoCache.set(k, g);
  }
  return g;
}

const texCache = new Map<string, THREE.CanvasTexture>();
const hex = (n: number) => `#${n.toString(16).padStart(6, '0')}`;

/** Painted cloth: base colour with fabric noise, a darker hem band and a centre seam. */
function clothTexture(color: number, kind: 'top' | 'hoodie' | 'jeans'): THREE.CanvasTexture {
  const key = `${kind}-${color}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = hex(color);
  g.fillRect(0, 0, 64, 64);
  let seed = color;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) >>> 8) / 16777216;
  for (let i = 0; i < 900; i++) {
    g.fillStyle = `rgba(${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 255 : 0},${rnd() > 0.5 ? 255 : 0},${(rnd() * 0.07).toFixed(3)})`;
    g.fillRect(rnd() * 64, rnd() * 64, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  // Shading: darker toward the bottom and the sides (painted-in ambient occlusion).
  const grad = g.createLinearGradient(0, 0, 0, 64);
  grad.addColorStop(0, 'rgba(255,255,255,0.08)');
  grad.addColorStop(1, 'rgba(0,0,0,0.22)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  if (kind === 'jeans') {
    g.fillStyle = 'rgba(0,0,0,0.35)';
    g.fillRect(31, 0, 2, 64); // inseam
    g.fillStyle = 'rgba(255,255,255,0.12)';
    g.fillRect(0, 0, 64, 3); // waistband
  }
  if (kind === 'hoodie') {
    g.fillStyle = 'rgba(0,0,0,0.22)';
    g.fillRect(18, 40, 28, 14); // kangaroo pocket
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(28, 8, 2, 20);
    g.fillRect(34, 8, 2, 20); // drawstrings
  }
  if (kind === 'top') {
    g.fillStyle = 'rgba(0,0,0,0.18)';
    g.fillRect(0, 58, 64, 6); // hem
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
}

/** Painted face: eyes with whites and pupils, brows, nose shading, mouth; hairline at the top. */
function faceTexture(skin: number, hair: number, variant: number): THREE.CanvasTexture {
  const key = `face-${skin}-${hair}-${variant}`;
  const hit = texCache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = hex(skin);
  g.fillRect(0, 0, 64, 64);
  const sh = g.createLinearGradient(0, 0, 0, 64);
  sh.addColorStop(0, 'rgba(0,0,0,0)');
  sh.addColorStop(1, 'rgba(0,0,0,0.25)');
  g.fillStyle = sh;
  g.fillRect(0, 0, 64, 64);
  g.fillStyle = hex(hair);
  g.fillRect(0, 0, 64, 9 + (variant % 2) * 3); // hairline
  g.fillStyle = hex(hair);
  g.fillRect(13, 22 + (variant % 2) * 2, 13, 3);
  g.fillRect(38, 22 + (variant % 2) * 2, 13, 3);
  g.fillStyle = '#f4f0ea';
  g.fillRect(15, 28, 11, 7);
  g.fillRect(38, 28, 11, 7);
  g.fillStyle = '#2a1a16';
  g.fillRect(19 + (variant % 3), 29, 5, 5);
  g.fillRect(42 + (variant % 3), 29, 5, 5);
  g.fillStyle = 'rgba(0,0,0,0.2)';
  g.fillRect(29, 34, 6, 10);
  g.fillStyle = '#6a3030';
  g.fillRect(24, 49, 16, 3);
  if (variant % 4 === 1) {
    g.fillStyle = '#ffffff';
    g.fillRect(26, 49, 12, 2);
  }
  if (variant % 5 === 2) {
    g.fillStyle = 'rgba(0,0,0,0.2)';
    g.fillRect(14, 42, 36, 18);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  texCache.set(key, t);
  return t;
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

/**
 * Early-2000s character: rounded low-poly limbs, tapered torso, a hood that sits on the shoulders, painted cloth
 * and face textures, mitten hands and chunky sneakers. Pivots at hips, shoulders, elbows, knees and neck.
 */
export function buildHuman(o: Outfit, variant = 0): HumanRig {
  const topM = new THREE.MeshLambertMaterial({ map: clothTexture(o.top, o.hoodie ? 'hoodie' : 'top') });
  const botM = new THREE.MeshLambertMaterial({ map: clothTexture(o.bottom, 'jeans') });
  const skinM = new THREE.MeshLambertMaterial({ color: o.skin });
  const hairM = new THREE.MeshLambertMaterial({ color: o.hair });
  const shoeM = new THREE.MeshLambertMaterial({ color: o.shoes });
  const soleM = new THREE.MeshLambertMaterial({ color: 0xd8d2c8 });
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
  hips.add(mesh(rb(0.36, 0.22, 0.24, 0.08), botM, -0.01));
  group.add(hips);

  const torso = new THREE.Group();
  torso.position.y = 0.08;
  // Tapered chest: wider at the shoulders.
  const chest = new THREE.Mesh(tube(0.26, 0.2, 0.56), topM);
  chest.scale.set(1, 1, 0.62);
  chest.position.y = 0.3;
  torso.add(chest);
  torso.add(mesh(rb(0.46, 0.14, 0.3, 0.06), topM, 0.56)); // shoulders
  if (o.hoodie) {
    const hood = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.07, 6, 10, Math.PI), topM);
    hood.rotation.x = Math.PI / 2;
    hood.rotation.z = Math.PI;
    hood.position.set(0, 0.62, -0.1);
    torso.add(hood);
  }
  hips.add(torso);

  // Head: a rounded box with the painted face on +z, a hair cap, ears.
  const head = new THREE.Group();
  head.position.y = 0.62;
  head.add(mesh(tube(0.055, 0.055, 0.1), skinM, 0.03));
  const faceMat = new THREE.MeshLambertMaterial({ map: faceTexture(o.skin, o.hair, variant) });
  const skull = new THREE.Mesh(new RoundedBoxGeometry(0.2, 0.25, 0.22, 2, 0.06), [skinM, skinM, hairM, skinM, faceMat, hairM]);
  skull.position.y = 0.2;
  head.add(skull);
  head.add(mesh(rb(0.21, 0.08, 0.23, 0.04), hairM, 0.33, 0, -0.01));
  for (const sx of [-1, 1]) head.add(mesh(rb(0.03, 0.06, 0.04, 0.01), skinM, 0.2, sx * 0.11, 0));
  if (o.cap) {
    head.add(mesh(rb(0.23, 0.07, 0.24, 0.03), hairM, 0.36));
    head.add(mesh(rb(0.19, 0.02, 0.1, 0.005), hairM, 0.345, 0, 0.16));
  }
  torso.add(head);

  const arm = (side: number): [THREE.Group, THREE.Group] => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.27, 0.54, 0);
    const upper = new THREE.Mesh(tube(0.065, 0.055, 0.3), topM);
    upper.position.y = -0.15;
    shoulder.add(upper);
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    const fore = new THREE.Mesh(tube(0.055, 0.045, 0.28), o.hoodie ? topM : skinM);
    fore.position.y = -0.13;
    elbow.add(fore);
    elbow.add(mesh(rb(0.1, 0.12, 0.08, 0.035), skinM, -0.31)); // mitten
    shoulder.add(elbow);
    torso.add(shoulder);
    return [shoulder, elbow];
  };
  const [armL, foreL] = arm(-1);
  const [armR, foreR] = arm(1);

  const leg = (side: number): [THREE.Group, THREE.Group] => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.1, -0.08, 0);
    const thigh = new THREE.Mesh(tube(0.085, 0.075, 0.44), botM);
    thigh.position.y = -0.2;
    hip.add(thigh);
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    const shin = new THREE.Mesh(tube(0.075, 0.07, 0.42), botM);
    shin.position.y = -0.2;
    knee.add(shin);
    // Chunky sneaker: upper + pale sole.
    knee.add(mesh(rb(0.15, 0.09, 0.28, 0.035), shoeM, -0.41, 0, 0.05));
    knee.add(mesh(rb(0.16, 0.04, 0.29, 0.015), soleM, -0.455, 0, 0.05));
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
      const s = Math.sin(p);
      const c = Math.cos(p);
      const amp = 0.55 + run * 0.4;
      legL.rotation.x = s * amp;
      legR.rotation.x = -s * amp;
      shinL.rotation.x = -Math.max(0, -s) * (0.8 + run * 0.6) - 0.05;
      shinR.rotation.x = -Math.max(0, s) * (0.8 + run * 0.6) - 0.05;
      armL.rotation.x = -s * (0.45 + run * 0.4) * moving;
      armR.rotation.x = s * (0.45 + run * 0.4) * moving;
      armL.rotation.z = 0.1;
      armR.rotation.z = -0.1;
      foreL.rotation.x = -0.25 - run * 1.1 - Math.max(0, -s) * 0.3 * moving;
      foreR.rotation.x = -0.25 - run * 1.1 - Math.max(0, s) * 0.3 * moving;
      hips.position.y = 0.95 + Math.abs(c) * 0.04 * moving - run * 0.03;
      hips.rotation.y = s * 0.08 * moving;
      torso.rotation.x = run * 0.18 + 0.04;
      torso.rotation.y = -s * 0.1 * moving;
      head.rotation.y = Math.sin(t * 0.35) * 0.25 * (1 - moving);
      head.rotation.x = run * -0.1;
    },
  };
  return rig;
}

export const OUTFITS: Outfit[] = [
  { top: 0xa8a8a8, bottom: 0x1e2430, skin: 0xe3b08a, hair: 0x1a1016, shoes: 0xf2f2f2, hoodie: true },
  { top: 0xf4f1ea, bottom: 0x3a5a8a, skin: 0xa8714c, hair: 0x120d0f, shoes: 0xe8e8e8, cap: true },
  { top: 0x2b2b2b, bottom: 0x4a6a9a, skin: 0xc98a5a, hair: 0x2b1a12, shoes: 0x1a1a1a },
  { top: 0x7a2e2e, bottom: 0x2a2a2a, skin: 0xf1c6a7, hair: 0xd9a066, shoes: 0x3a2a1a },
  { top: 0x2d4a7a, bottom: 0x8a8a8a, skin: 0x8d5a3c, hair: 0x0b0808, shoes: 0xffffff, hoodie: true },
  { top: 0xd9c4a0, bottom: 0x2a3a2a, skin: 0xf5d7c3, hair: 0x5a2a1a, shoes: 0x2a2a2a },
  { top: 0x3f7f5f, bottom: 0x1e1e26, skin: 0x6b4229, hair: 0x16100f, shoes: 0xcccccc, cap: true },
  { top: 0x1e1e26, bottom: 0x5a5a66, skin: 0xe9b58e, hair: 0x8f4a2b, shoes: 0x3a1a1a, hoodie: true },
];
