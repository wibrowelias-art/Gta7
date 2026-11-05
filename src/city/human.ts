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
function rbox(w: number, h: number, d: number, r = 0.04): THREE.BufferGeometry {
  const k = `${w}|${h}|${d}|${r}`;
  let g = geoCache.get(k);
  if (!g) {
    g = new RoundedBoxGeometry(w, h, d, 3, r);
    geoCache.set(k, g);
  }
  return g;
}

/**
 * A properly proportioned (1.78 m, ~7.5 heads) low-poly human with hips, torso, head, two-segment arms and legs,
 * built from rounded boxes. Pivots sit at the joints so limbs swing naturally.
 */
export function buildHuman(o: Outfit): HumanRig {
  const mat = (color: number, rough = 0.8) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: 0 });
  const topM = mat(o.top);
  const botM = mat(o.bottom);
  const skinM = mat(o.skin, 0.6);
  const hairM = mat(o.hair, 0.9);
  const shoeM = mat(o.shoes, 0.5);
  const group = new THREE.Group();
  const mesh = (g: THREE.BufferGeometry, m: THREE.Material, y: number, x = 0, z = 0) => {
    const me = new THREE.Mesh(g, m);
    me.position.set(x, y, z);
    me.castShadow = true;
    me.receiveShadow = true;
    return me;
  };

  // Hips at 0.95 m.
  const hips = new THREE.Group();
  hips.position.y = 0.95;
  hips.add(mesh(rbox(0.34, 0.2, 0.22, 0.05), botM, 0));
  group.add(hips);

  // Torso (pivot at hips).
  const torso = new THREE.Group();
  torso.position.y = 0.08;
  const chest = mesh(rbox(0.42, 0.56, 0.26, 0.06), topM, 0.3);
  torso.add(chest);
  if (o.hoodie) {
    torso.add(mesh(rbox(0.3, 0.12, 0.2, 0.05), topM, 0.6, 0, -0.08)); // hood resting on the back
    torso.add(mesh(rbox(0.18, 0.1, 0.06, 0.02), topM, 0.22, 0, 0.14)); // pocket
  }
  hips.add(torso);

  // Head (pivot at neck, 1.52 m from ground via torso).
  const head = new THREE.Group();
  head.position.y = 0.62;
  head.add(mesh(rbox(0.1, 0.08, 0.1, 0.03), skinM, 0.02)); // neck
  head.add(mesh(rbox(0.2, 0.24, 0.22, 0.07), skinM, 0.18)); // skull
  head.add(mesh(rbox(0.21, 0.09, 0.23, 0.05), hairM, 0.28)); // hair cap
  head.add(mesh(rbox(0.21, 0.14, 0.06, 0.03), hairM, 0.22, 0, -0.1)); // back of hair
  if (o.cap) {
    head.add(mesh(rbox(0.23, 0.07, 0.24, 0.03), hairM, 0.31));
    head.add(mesh(rbox(0.2, 0.02, 0.12, 0.005), hairM, 0.29, 0, 0.16)); // peak
  }
  // Face details: eyes and brow shadow.
  const eye = new THREE.MeshStandardMaterial({ color: 0x1a1016, roughness: 0.4 });
  head.add(mesh(new THREE.BoxGeometry(0.03, 0.02, 0.01), eye, 0.19, -0.045, 0.112));
  head.add(mesh(new THREE.BoxGeometry(0.03, 0.02, 0.01), eye, 0.19, 0.045, 0.112));
  head.add(mesh(new THREE.BoxGeometry(0.03, 0.05, 0.02), skinM, 0.15, 0, 0.115)); // nose
  torso.add(head);

  // Arms: shoulder pivot, upper arm, elbow pivot, forearm, hand.
  const arm = (side: number): [THREE.Group, THREE.Group] => {
    const shoulder = new THREE.Group();
    shoulder.position.set(side * 0.26, 0.52, 0);
    shoulder.add(mesh(rbox(0.12, 0.3, 0.12, 0.04), topM, -0.14));
    const elbow = new THREE.Group();
    elbow.position.y = -0.3;
    elbow.add(mesh(rbox(0.1, 0.28, 0.1, 0.04), o.hoodie ? topM : skinM, -0.13));
    elbow.add(mesh(rbox(0.09, 0.1, 0.06, 0.03), skinM, -0.3));
    shoulder.add(elbow);
    torso.add(shoulder);
    return [shoulder, elbow];
  };
  const [armL, foreL] = arm(-1);
  const [armR, foreR] = arm(1);

  // Legs: hip pivot, thigh, knee pivot, shin, shoe.
  const leg = (side: number): [THREE.Group, THREE.Group] => {
    const hip = new THREE.Group();
    hip.position.set(side * 0.1, -0.08, 0);
    hip.add(mesh(rbox(0.16, 0.44, 0.17, 0.05), botM, -0.2));
    const knee = new THREE.Group();
    knee.position.y = -0.42;
    knee.add(mesh(rbox(0.14, 0.42, 0.15, 0.04), botM, -0.2));
    knee.add(mesh(rbox(0.15, 0.09, 0.28, 0.03), shoeM, -0.42, 0, 0.05));
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
      // Legs: thigh swing, knee bends on the back-swing.
      legL.rotation.x = s * amp;
      legR.rotation.x = -s * amp;
      shinL.rotation.x = -Math.max(0, -s) * (0.8 + run * 0.6) - 0.05;
      shinR.rotation.x = -Math.max(0, s) * (0.8 + run * 0.6) - 0.05;
      // Arms counter-swing with bent elbows when running.
      armL.rotation.x = -s * (0.45 + run * 0.4) * moving;
      armR.rotation.x = s * (0.45 + run * 0.4) * moving;
      armL.rotation.z = 0.12;
      armR.rotation.z = -0.12;
      foreL.rotation.x = -0.25 - run * 1.1 - Math.max(0, -s) * 0.3 * moving;
      foreR.rotation.x = -0.25 - run * 1.1 - Math.max(0, s) * 0.3 * moving;
      // Body: bob, lean forward when running, idle breathing and a slow look-around.
      hips.position.y = 0.95 + Math.abs(c) * 0.04 * moving - run * 0.03;
      hips.rotation.y = s * 0.08 * moving;
      torso.rotation.x = run * 0.18 + Math.sin(t * 1.6) * 0.012 * (1 - moving);
      torso.rotation.y = -s * 0.1 * moving;
      head.rotation.y = Math.sin(t * 0.35) * 0.25 * (1 - moving) + s * 0.05 * moving;
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
