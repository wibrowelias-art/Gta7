import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** mergeGeometries needs all-indexed or all-non-indexed input; normalise to non-indexed and drop unused attributes. */
function mergeSafe(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const flat = geos.map((g) => {
    const n = g.index ? g.toNonIndexed() : g;
    for (const key of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(key)) n.deleteAttribute(key);
    if (!n.attributes.uv) n.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((n.attributes.position.count) * 2), 2));
    return n;
  });
  const merged = mergeGeometries(flat, false);
  if (!merged) throw new Error('mergeSafe: incompatible geometries');
  return merged;
}
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { Rng } from '../game/rng';
import { neonLabelTexture } from './textures';

/** An obstacle with a height: low ones can be vaulted, medium ones climbed. */
export interface Solid3 {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
  h: number;
}

export interface PropsOut {
  group: THREE.Group;
  solids: Solid3[];
  /** Flat tops you can stand on (dumpsters, containers, stalls, low walls). */
  platforms: { minX: number; maxX: number; minZ: number; maxZ: number; y: number }[];
  /** Bench seats for NPCs: position + facing. */
  seats: { x: number; z: number; heading: number }[];
  /** Spots where NPC groups stand and chat. */
  hangouts: { x: number; z: number }[];
  update(t: number): void;
}

interface Bucket {
  mat: THREE.Material;
  geos: THREE.BufferGeometry[];
  shadow: boolean;
}

/** Street dressing: dumpsters, containers, market stalls, café terraces, hydrants, mailboxes, cones, planters, scooters, posters. */
export function buildProps(rng: Rng, blocks: { cx: number; cz: number; half: number; district: string }[], roadsX: number[], roadsZ: number[]): PropsOut {
  const group = new THREE.Group();
  const solids: Solid3[] = [];
  const platforms: PropsOut['platforms'] = [];
  const seats: PropsOut['seats'] = [];
  const hangouts: PropsOut['hangouts'] = [];
  const buckets = new Map<string, Bucket>();
  const B = (name: string, mat: THREE.Material, shadow = true): Bucket => {
    let b = buckets.get(name);
    if (!b) {
      b = { mat, geos: [], shadow };
      buckets.set(name, b);
    }
    return b;
  };
  const std = (color: number, _r = 0, _m = 0) => new THREE.MeshLambertMaterial({ color });
  const M = {
    steelGreen: B('steelGreen', std(0x3d6b4a, 0.55, 0.5)),
    steelBlue: B('steelBlue', std(0x2f4f7a, 0.55, 0.5)),
    steelRust: B('steelRust', std(0x7a4a32, 0.8, 0.3)),
    dark: B('dark', std(0x2a2a2e, 0.6, 0.5)),
    wood: B('wood', std(0x9a7a52, 0.85)),
    canvasRed: B('canvasRed', std(0xb03a30, 0.95)),
    canvasGreen: B('canvasGreen', std(0x2f7a55, 0.95)),
    canvasCream: B('canvasCream', std(0xe8dcc0, 0.95)),
    red: B('red', std(0xc8352a, 0.5, 0.2)),
    yellow: B('yellow', std(0xe8b530, 0.6)),
    white: B('white', std(0xf0ece4, 0.6)),
    concrete: B('concrete', std(0x9a948c, 0.9)),
    orange: B('orange', std(0xf07a20, 0.7)),
    plant: B('plant', new THREE.MeshLambertMaterial({ color: 0x4f7a3a, flatShading: true })),
    fruit: B('fruit', std(0xe0702a, 0.6)),
    fruit2: B('fruit2', std(0xd9c23a, 0.6)),
    fruit3: B('fruit3', std(0x7a2a3a, 0.6)),
    glass: B('glass', new THREE.MeshLambertMaterial({ color: 0x9fc0d8, transparent: true, opacity: 0.5 }), false),
    scooter: B('scooter', std(0xd9d9d9, 0.3, 0.5)),
    scooterDark: B('scooterDark', std(0x1a1a1e, 0.6, 0.3)),
  };
  const add = (b: Bucket, g: THREE.BufferGeometry, x: number, y: number, z: number, ry = 0): void => {
    if (ry) g.rotateY(ry);
    g.translate(x, y, z);
    b.geos.push(g);
  };
  const box = (w: number, h: number, d: number, r = 0) => (r ? new RoundedBoxGeometry(w, h, d, 2, r) : new THREE.BoxGeometry(w, h, d));

  /* ---- individual prop builders (origin at ground centre, facing +z) ---- */
  const dumpster = (x: number, z: number, ry: number) => {
    const mat = rng.chance(0.5) ? M.steelGreen : M.steelBlue;
    add(mat, box(2.0, 1.3, 1.2, 0.04), x, 0.95, z, ry);
    add(M.dark, box(2.05, 0.12, 1.25), x, 1.66, z, ry);
    for (const sx of [-0.8, 0.8]) add(M.dark, new THREE.CylinderGeometry(0.1, 0.1, 0.12, 8), x + Math.cos(ry) * sx, 0.36, z - Math.sin(ry) * sx);
    solids.push({ minX: x - 1.05, maxX: x + 1.05, minZ: z - 0.65, maxZ: z + 0.65, h: 1.7 });
    platforms.push({ minX: x - 1.0, maxX: x + 1.0, minZ: z - 0.6, maxZ: z + 0.6, y: 1.72 });
  };
  const container = (x: number, z: number, ry: number, stacked = false) => {
    const mat = rng.pick([M.steelRust, M.steelBlue, M.steelGreen, M.red]);
    add(mat, box(6.0, 2.6, 2.44), x, 1.3 + 0.3, z, ry);
    // Corrugation: thin vertical ribs.
    for (let i = -2.8; i <= 2.8; i += 0.4) add(mat, box(0.08, 2.5, 2.5), x + Math.cos(ry) * i, 1.6, z - Math.sin(ry) * i, ry);
    const along = Math.abs(Math.cos(ry)) > 0.5;
    const hw = along ? 3.0 : 1.22;
    const hd = along ? 1.22 : 3.0;
    solids.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, h: 2.9 });
    platforms.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, y: 2.9 });
    if (stacked) {
      const mat2 = rng.pick([M.steelRust, M.steelBlue, M.red]);
      add(mat2, box(6.0, 2.6, 2.44), x + 0.3, 2.9 + 1.3, z, ry);
      platforms.push({ minX: x - hw + 0.3, maxX: x + hw + 0.3, minZ: z - hd, maxZ: z + hd, y: 5.5 });
    }
  };
  const stall = (x: number, z: number, ry: number) => {
    const canvas = rng.pick([M.canvasRed, M.canvasGreen, M.canvasCream]);
    add(M.wood, box(3.0, 0.1, 1.4), x, 0.95, z, ry); // counter top
    add(M.wood, box(2.9, 0.9, 1.3), x, 0.5, z, ry); // counter body
    for (const sx of [-1.4, 1.4]) for (const sz of [-0.6, 0.6]) add(M.dark, new THREE.CylinderGeometry(0.04, 0.04, 2.4, 6), x + Math.cos(ry) * sx + Math.sin(ry) * sz, 1.5, z - Math.sin(ry) * sx + Math.cos(ry) * sz);
    const roof = box(3.4, 0.08, 1.9);
    roof.rotateX(0.18);
    add(canvas, roof, x, 2.55, z, ry);
    // Scalloped valance.
    for (let i = -1.4; i <= 1.4; i += 0.35) add(canvas, new THREE.CylinderGeometry(0.17, 0.17, 0.06, 8), x + Math.cos(ry) * i + Math.sin(ry) * 0.95, 2.3, z - Math.sin(ry) * i + Math.cos(ry) * 0.95);
    // Goods: crates of fruit.
    for (let i = -1; i <= 1; i++) {
      const fm = [M.fruit, M.fruit2, M.fruit3][(i + 1) % 3];
      add(M.wood, box(0.7, 0.25, 0.5), x + Math.cos(ry) * i * 0.85, 1.12, z - Math.sin(ry) * i * 0.85, ry);
      for (let k = 0; k < 6; k++) add(fm, new THREE.SphereGeometry(0.09, 6, 5), x + Math.cos(ry) * (i * 0.85 + (k % 3) * 0.2 - 0.2) + Math.sin(ry) * ((k > 2 ? 0.12 : -0.12)), 1.3, z - Math.sin(ry) * (i * 0.85 + (k % 3) * 0.2 - 0.2) + Math.cos(ry) * (k > 2 ? 0.12 : -0.12));
    }
    solids.push({ minX: x - 1.5, maxX: x + 1.5, minZ: z - 0.7, maxZ: z + 0.7, h: 1.0 });
    hangouts.push({ x: x + Math.sin(ry) * 1.6, z: z + Math.cos(ry) * 1.6 });
  };
  const cafe = (x: number, z: number) => {
    for (let i = 0; i < 3; i++) {
      const tx = x + (i - 1) * 2.2;
      add(M.dark, new THREE.CylinderGeometry(0.45, 0.45, 0.04, 12), tx, 0.78, z);
      add(M.dark, new THREE.CylinderGeometry(0.03, 0.03, 0.76, 6), tx, 0.4, z);
      add(M.dark, new THREE.CylinderGeometry(0.03, 0.03, 2.4, 6), tx, 1.5, z);
      add(rng.pick([M.canvasRed, M.canvasCream]), new THREE.ConeGeometry(1.3, 0.5, 8), tx, 2.5, z);
      for (const a of [0, Math.PI]) {
        const cx2 = tx + Math.sin(a) * 0.75;
        const cz2 = z + Math.cos(a) * 0.75;
        add(M.dark, box(0.42, 0.04, 0.42), cx2, 0.46, cz2);
        add(M.dark, box(0.42, 0.45, 0.04), cx2 + Math.sin(a) * 0.19, 0.7, cz2 + Math.cos(a) * 0.19);
        seats.push({ x: cx2, z: cz2, heading: a + Math.PI });
      }
      solids.push({ minX: tx - 0.5, maxX: tx + 0.5, minZ: z - 0.5, maxZ: z + 0.5, h: 0.8 });
    }
  };
  const hydrant = (x: number, z: number) => {
    add(M.red, new THREE.CylinderGeometry(0.14, 0.16, 0.7, 8), x, 0.65, z);
    add(M.red, new THREE.SphereGeometry(0.16, 8, 6), x, 1.02, z);
    add(M.red, new THREE.CylinderGeometry(0.07, 0.07, 0.4, 6).rotateZ(Math.PI / 2), x, 0.8, z);
    solids.push({ minX: x - 0.18, maxX: x + 0.18, minZ: z - 0.18, maxZ: z + 0.18, h: 1.1 });
  };
  const mailbox = (x: number, z: number) => {
    add(M.yellow, box(0.6, 0.7, 0.45, 0.05), x, 1.0, z);
    add(M.dark, box(0.1, 0.65, 0.1), x, 0.33, z);
    solids.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.25, maxZ: z + 0.25, h: 1.35 });
  };
  const planter = (x: number, z: number) => {
    add(M.concrete, box(1.6, 0.6, 0.7), x, 0.6, z);
    for (let i = 0; i < 4; i++) add(M.plant, new THREE.IcosahedronGeometry(0.28, 1), x + (i - 1.5) * 0.36, 1.05, z + (rng.next() - 0.5) * 0.2);
    solids.push({ minX: x - 0.8, maxX: x + 0.8, minZ: z - 0.35, maxZ: z + 0.35, h: 0.9 });
    platforms.push({ minX: x - 0.8, maxX: x + 0.8, minZ: z - 0.35, maxZ: z + 0.35, y: 0.9 });
  };
  const cones = (x: number, z: number, along: 'x' | 'z') => {
    for (let i = 0; i < 5; i++) {
      const cx2 = along === 'x' ? x + i * 1.6 : x;
      const cz2 = along === 'z' ? z + i * 1.6 : z;
      add(M.orange, new THREE.ConeGeometry(0.18, 0.6, 8), cx2, 0.6, cz2);
      add(M.white, new THREE.CylinderGeometry(0.11, 0.13, 0.08, 8), cx2, 0.72, cz2);
      add(M.dark, box(0.4, 0.04, 0.4), cx2, 0.32, cz2);
    }
    const bx = along === 'x' ? x + 3.2 : x;
    const bz = along === 'z' ? z + 3.2 : z;
    add(M.white, box(along === 'x' ? 7 : 0.1, 0.25, along === 'x' ? 0.1 : 7), bx, 0.95, bz);
    add(M.red, box(along === 'x' ? 7 : 0.1, 0.08, along === 'x' ? 0.1 : 7), bx, 1.12, bz);
    for (const o of [-3.2, 3.2]) add(M.dark, box(0.08, 1.0, 0.08), along === 'x' ? bx + o : bx, 0.8, along === 'z' ? bz + o : bz);
    solids.push({ minX: Math.min(x, bx) - 0.3, maxX: Math.max(x, bx) + 3.5, minZ: Math.min(z, bz) - 0.3, maxZ: Math.max(z, bz) + (along === 'z' ? 3.5 : 0.3), h: 0.7 });
  };
  const scooter = (x: number, z: number, ry: number) => {
    add(M.scooter, box(0.5, 0.5, 1.4, 0.08), x, 0.75, z, ry);
    add(M.scooterDark, box(0.3, 0.08, 0.6), x, 1.02, z, ry);
    for (const dz of [-0.6, 0.6]) add(M.scooterDark, new THREE.TorusGeometry(0.22, 0.06, 6, 12).rotateY(Math.PI / 2 + ry), x + Math.sin(ry) * dz, 0.52, z + Math.cos(ry) * dz);
    add(M.scooterDark, new THREE.CylinderGeometry(0.02, 0.02, 0.6, 6).rotateZ(Math.PI / 2).rotateY(ry), x + Math.sin(ry) * 0.5, 1.3, z + Math.cos(ry) * 0.5);
    solids.push({ minX: x - 0.4, maxX: x + 0.4, minZ: z - 0.4, maxZ: z + 0.4, h: 1.1 });
  };
  const lowWall = (x: number, z: number, len: number, along: 'x' | 'z') => {
    add(M.concrete, box(along === 'x' ? len : 0.4, 1.0, along === 'x' ? 0.4 : len), x, 0.8, z);
    const hw = along === 'x' ? len / 2 : 0.2;
    const hd = along === 'x' ? 0.2 : len / 2;
    solids.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, h: 1.3 });
    platforms.push({ minX: x - hw, maxX: x + hw, minZ: z - hd, maxZ: z + hd, y: 1.3 });
  };
  const poster = (x: number, z: number, ry: number, label: string, color: number) => {
    const tex = neonLabelTexture(label, color, false);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.0), new THREE.MeshLambertMaterial({ map: tex}));
    m.position.set(x, 1.8, z);
    m.rotation.y = ry;
    group.add(m);
  };

  /* ---- place props per block ---- */
  const posterWords = ['LIVE TONIGHT', 'SUNSET RADIO', 'VINYL FAIR', 'OPEN AIR', 'NIGHT MARKET', 'ROOFTOP', 'JAZZ CLUB', 'RECORD DAY'];
  const posterColors = [0xff3d8b, 0xff8a3d, 0xffc857, 0x2ee6c8, 0x3fd0ff];
  for (const b of blocks) {
    const { cx, cz, half, district } = b;
    const e = half - 1.2; // sidewalk edge
    const inner = half - SIDEWALK_W + 0.6; // next to the building face
    // Hydrant and mailbox on most blocks.
    if (rng.chance(0.7)) hydrant(cx + e, cz - half + 6 + rng.next() * 10);
    if (rng.chance(0.5)) mailbox(cx - e, cz + half - 6 - rng.next() * 10);
    if (district === 'oldtown' || district === 'residential') {
      if (rng.chance(0.7)) cafe(cx + (rng.next() - 0.5) * 20, cz - inner);
      if (rng.chance(0.5)) stall(cx + inner, cz + (rng.next() - 0.5) * 20, Math.PI / 2);
      if (rng.chance(0.6)) planter(cx - inner, cz + (rng.next() - 0.5) * 24);
      for (let i = 0; i < 2; i++) if (rng.chance(0.6)) scooter(cx + (rng.next() - 0.5) * 30, cz + inner, rng.next() * 0.4);
      if (rng.chance(0.5)) poster(cx + (rng.next() - 0.5) * 20, cz - inner + 0.1 - 0.6, 0, rng.pick(posterWords), rng.pick(posterColors));
    }
    if (district === 'industrial') {
      // Yards sit on the wide sidewalk strip, outside the building footprint.
      for (let i = 0; i < 2; i++) dumpster(cx + half - 1.3, cz - 10 + i * 4 + rng.next() * 2, Math.PI / 2);
      container(cx - half + 1.6, cz + 10, 0, rng.chance(0.6));
      container(cx + 6, cz - half + 1.6, Math.PI / 2, false);
      lowWall(cx - 12, cz + half - 1.2, 10, 'x');
      if (rng.chance(0.6)) cones(cx - e - 3, cz - 20, 'z');
    }
    if (district === 'modern') {
      planter(cx + inner, cz - 12);
      planter(cx + inner, cz + 12);
      if (rng.chance(0.6)) lowWall(cx - inner, cz, 14, 'z');
      if (rng.chance(0.5)) cones(cx - 20, cz + e + 2, 'x');
    }
    if (district === 'residential') {
      if (rng.chance(0.6)) dumpster(cx - half + 1.3, cz + 14, Math.PI / 2);
      hangouts.push({ x: cx + e - 1.5, z: cz + 10 });
    }
    if (district === 'plaza') {
      for (let i = 0; i < 4; i++) stall(cx + Math.cos((i / 4) * Math.PI * 2 + 0.4) * 30, cz + Math.sin((i / 4) * Math.PI * 2 + 0.4) * 30, -((i / 4) * Math.PI * 2 + 0.4) + Math.PI / 2);
      hangouts.push({ x: cx + 12, z: cz + 12 }, { x: cx - 12, z: cz - 14 }, { x: cx + 14, z: cz - 12 });
      cafe(cx - 18, cz + 22);
      cafe(cx + 18, cz + 22);
    }
    // One or two random hangout spots per block.
    hangouts.push({ x: cx + (rng.next() - 0.5) * 30, z: cz + (rng.chance(0.5) ? e - 1.5 : -e + 1.5) });
  }
  void roadsX;
  void roadsZ;

  for (const b of buckets.values()) {
    if (!b.geos.length) continue;
    const m = new THREE.Mesh(mergeSafe(b.geos), b.mat);
    m.castShadow = b.shadow;
    m.receiveShadow = false;
    group.add(m);
  }
  return { group, solids, platforms, seats, hangouts, update() {} };
}

const SIDEWALK_W = 4;
