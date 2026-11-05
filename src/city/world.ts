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
import { Rng } from '../game/rng';
import { asphaltTexture, cobbleTexture, facadeTexture, foliageTexture, graffitiTexture, roofTexture, trainTexture, type Facade, type FacadeStyle } from './textures';
import { buildProps, type PropsOut, type Solid3 } from './props';
import { coneTexture, neonLabelTexture, puddleTexture, shopfrontTexture, skidTexture, skylineTexture } from './textures';

const SHOP_NAMES = ['BAKERY', 'KIOSK 24', 'LAUNDRY', 'BARBER', 'NOODLE BAR', 'VINYL', 'PHARMACY', 'CAFÉ LUNA', 'TATTOO', 'FISH MARKET', 'BOOKS', 'REPAIRS', 'PIZZA', 'FLOWERS', 'ARCADE'];
const SIGN_COLORS = [0xc8352a, 0x2a6a9a, 0x2f7a55, 0xe8b530, 0x7a3a8a, 0xd96a2a];
const POSTER_WORDS = ['LIVE TONIGHT', 'SUNSET RADIO', 'VINYL FAIR', 'OPEN AIR', 'NIGHT MARKET', 'JAZZ CLUB', 'RECORD DAY', 'BOAT TRIP'];

/** City layout constants (metres). */
export const BLOCK = 64;
export const ROAD = 18;
export const CELL = BLOCK + ROAD;
export const GRID = 7;
export const CITY_HALF = (GRID * CELL) / 2;
export const LANE = 3.6;
export const SIDEWALK = 4;

export interface Box2 {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
}
export interface StreetLamp {
  x: number;
  z: number;
}
/** A flat walkable surface above the ground. Ramps interpolate height along one axis. */
export interface Platform extends Box2 {
  y: number;
  /** For ramps: height at min/max of the ramp axis. */
  ramp?: { axis: 'x' | 'z'; y0: number; y1: number };
  /** Walls (knee-high rails) that stop the player at the platform edge. */
  fenced?: boolean;
}

export interface World {
  group: THREE.Group;
  solids: Box2[];
  platforms: Platform[];
  /** The train: position is updated every frame; the roof is a moving platform. */
  train: THREE.Group;
  trainVel: THREE.Vector3;
  trainLen: number;
  /** Roof collider of the train, recomputed every frame from the mesh. */
  trainRoof: { minX: number; maxX: number; minZ: number; maxZ: number; y: number };
  /** Walkable height at a point (0 on the street). */
  heightAt(x: number, z: number, nearY: number): number;
  rooftopSpot: THREE.Vector3 | null;
  /** Vaultable / climbable obstacles (with heights). */
  props: PropsOut;
  obstacles: Solid3[];
  /** Traffic light state per intersection: true = x-axis traffic has green. */
  lightXGreen(x: number, z: number, t: number): boolean;
  lamps: StreetLamp[];
  roadsZ: number[];
  roadsX: number[];
  neon: { mesh: THREE.Mesh; phase: number; base: number }[];
  update(t: number, dt: number): void;
  /** 0 = full day, 1 = night: drives window glow, lamp heads and signs. */
  setNight(n: number): void;
}

type District = 'oldtown' | 'modern' | 'industrial' | 'residential' | 'plaza';

/** A soft dark disc under characters and cars: the classic blob shadow. */
export function blobShadow(w: number, d: number, y = 0.02): THREE.Mesh {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshBasicMaterial({ map: radialSpriteTexture(), color: 0x000000, transparent: true, opacity: 0.4, depthWrite: false }));
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.renderOrder = 1;
  return m;
}

let poolTexCache: THREE.CanvasTexture | null = null;
export function radialSpriteTexture(): THREE.CanvasTexture {
  if (poolTexCache) return poolTexCache;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.4, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  poolTexCache = new THREE.CanvasTexture(c);
  return poolTexCache;
}

/** Map building-local box UVs so one atlas repeat covers `sx`×`sy` metres on every side face. */
function facadeUVs(geo: THREE.BoxGeometry, w: number, h: number, d: number, sx: number, sy: number): void {
  const uv = geo.attributes.uv as THREE.BufferAttribute;
  const pos = geo.attributes.position as THREE.BufferAttribute;
  const nrm = geo.attributes.normal as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) {
    const nx = nrm.getX(i);
    const ny = nrm.getY(i);
    if (Math.abs(ny) > 0.5) {
      uv.setXY(i, 0.02, 0.02); // roof/floor: a plain patch of the atlas
      continue;
    }
    const along = Math.abs(nx) > 0.5 ? pos.getZ(i) + d / 2 : pos.getX(i) + w / 2;
    uv.setXY(i, along / sx, (pos.getY(i) + h / 2) / sy);
  }
}

function districtOf(bx: number, bz: number): District {
  if (bx === 3 && bz === 3) return 'plaza';
  const d = Math.max(Math.abs(bx - 3), Math.abs(bz - 3));
  if (bx >= 5 && bz <= 1) return 'modern';
  if (bx <= 1 && bz >= 5) return 'industrial';
  if (d <= 1) return 'oldtown';
  return 'residential';
}

export function buildWorld(scene: THREE.Scene, seed = 7, quality: 'high' | 'balanced' | 'battery' = 'balanced'): World {
  const rng = new Rng(seed);
  const group = new THREE.Group();
  const solids: Box2[] = [];
  const platforms: Platform[] = [];
  const lamps: StreetLamp[] = [];
  const neon: World['neon'] = [];
  const roadsZ: number[] = [];
  const roadsX: number[] = [];
  const extent = CITY_HALF + ROAD / 2;
  for (let i = 0; i <= GRID; i++) {
    roadsZ.push(-CITY_HALF + i * CELL);
    roadsX.push(-CITY_HALF + i * CELL);
  }

  /* ---------------- ground, roads, sidewalks ---------------- */
  const asphalt = asphaltTexture();
  asphalt.map.repeat.set(70, 70);
  asphalt.rough.repeat.set(70, 70);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(extent * 2 + 1200, extent * 2 + 1200), new THREE.MeshLambertMaterial({ map: asphalt.map, color: 0xbfbab2 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = false;
  group.add(ground);

  const markGeos: THREE.BufferGeometry[] = [];
  const dash = (x: number, z: number, len: number, alongX: boolean, w = 0.16) => {
    const g = new THREE.BoxGeometry(alongX ? len : w, 0.02, alongX ? w : len);
    g.translate(x, 0.012, z);
    markGeos.push(g);
  };
  for (const z of roadsZ) {
    for (let x = -extent; x < extent; x += 6) if (!roadsX.some((rx) => Math.abs(rx - x) < ROAD / 2 + 3)) dash(x + 1.5, z, 3, true);
    for (const s of [1, -1]) {
      const eg = new THREE.BoxGeometry(extent * 2, 0.02, 0.14);
      eg.translate(0, 0.012, z + s * (ROAD / 2 - SIDEWALK - 0.4));
      markGeos.push(eg);
    }
  }
  for (const x of roadsX) {
    for (let z = -extent; z < extent; z += 6) if (!roadsZ.some((rz) => Math.abs(rz - z) < ROAD / 2 + 3)) dash(x, z + 1.5, 3, false);
    for (const s of [1, -1]) {
      const eg = new THREE.BoxGeometry(0.14, 0.02, extent * 2);
      eg.translate(x + s * (ROAD / 2 - SIDEWALK - 0.4), 0.012, 0);
      markGeos.push(eg);
    }
  }
  for (const x of roadsX) for (const z of roadsZ) for (let i = -3; i <= 3; i++) for (const side of [-1, 1]) {
    const gz = new THREE.BoxGeometry(0.6, 0.02, 2.4);
    gz.translate(x + i * 1.2, 0.013, z + side * (ROAD / 2 - SIDEWALK - 1.8));
    const gx = new THREE.BoxGeometry(2.4, 0.02, 0.6);
    gx.translate(x + side * (ROAD / 2 - SIDEWALK - 1.8), 0.013, z + i * 1.2);
    markGeos.push(gz, gx);
  }
  const marks = new THREE.Mesh(mergeSafe(markGeos), new THREE.MeshLambertMaterial({ color: 0xd8d2c8}));
  marks.receiveShadow = false;
  group.add(marks);

  const cobble = cobbleTexture();
  cobble.repeat.set(0.5, 0.5);
  const sidewalkGeos: THREE.BufferGeometry[] = [];
  const kerbGeos: THREE.BufferGeometry[] = [];
  const buildings = new Map<string, { facade: Facade; geos: THREE.BufferGeometry[] }>();
  const roofGeos: THREE.BufferGeometry[] = [];
  const pitchedGeos: THREE.BufferGeometry[] = [];
  const trimGeos: THREE.BufferGeometry[] = [];
  const darkGeos: THREE.BufferGeometry[] = [];
  const glassGeos: THREE.BufferGeometry[] = [];
  const shopfronts = new Map<string, { mat: THREE.MeshLambertMaterial; geos: THREE.BufferGeometry[] }>();
  const treeTrunks: THREE.Matrix4[] = [];
  const treeCanopies: THREE.Matrix4[] = [];
  const lampPoleGeos: THREE.BufferGeometry[] = [];
  const lampHeadGeos: THREE.BufferGeometry[] = [];
  const hedgeGeos: THREE.BufferGeometry[] = [];
  const woodGeos: THREE.BufferGeometry[] = [];
  const skylineRings: THREE.Mesh[] = [];
  const blockInfo: { cx: number; cz: number; half: number; district: string }[] = [];
  const roofTops: { x: number; z: number; minX: number; maxX: number; minZ: number; maxZ: number; y: number }[] = [];
  let rooftopSpot: THREE.Vector3 | null = null;
  const signGeos: THREE.BufferGeometry[] = [];
  const awningGeos: THREE.BufferGeometry[] = [];
  const facadeStyles: Record<District, FacadeStyle[]> = { oldtown: ['plaster', 'plaster', 'brick'], modern: ['glass', 'concrete', 'glass'], industrial: ['industrial', 'brick'], residential: ['plaster', 'concrete', 'brick'], plaza: ['plaster'] };
  const facadeFor = (style: FacadeStyle, variant: number): { key: string; facade: Facade } => {
    const key = `${style}-${variant}`;
    if (!buildings.has(key)) buildings.set(key, { facade: facadeTexture(style, seed * 31 + variant * 7 + style.length), geos: [] });
    return { key, facade: buildings.get(key)!.facade };
  };

  const tree = (x: number, z: number, h: number) => {
    solids.push({ minX: x - 0.3, maxX: x + 0.3, minZ: z - 0.3, maxZ: z + 0.3 });
    const lean = (rng.next() - 0.5) * 0.1;
    treeTrunks.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h / 2 + 0.3, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, 0, lean)), new THREE.Vector3(1, h, 1)));
    const r = 2.6 + rng.next() * 1.8;
    // Crown: two crossed painted cards (classic low-poly tree) plus a flat top card.
    const rot = rng.next() * Math.PI;
    for (let i = 0; i < 2; i++) treeCanopies.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h + 0.3 + r * 0.55, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rot + (i * Math.PI) / 2, 0)), new THREE.Vector3(r * 2.1, r * 1.9, 1)));
    treeCanopies.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h + 0.3 + r * 0.7, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, rot)), new THREE.Vector3(r * 1.8, r * 1.8, 1)));
  };

  for (let bx = 0; bx < GRID; bx++) {
    for (let bz = 0; bz < GRID; bz++) {
      const cx = -CITY_HALF + bx * CELL + CELL / 2;
      const cz = -CITY_HALF + bz * CELL + CELL / 2;
      const half = BLOCK / 2 + SIDEWALK;
      const district = districtOf(bx, bz);
      blockInfo.push({ cx, cz, half, district });
      const sw = new THREE.BoxGeometry(half * 2, 0.3, half * 2);
      sw.translate(cx, 0.15, cz);
      sidewalkGeos.push(sw);
      platforms.push({ minX: cx - half, maxX: cx + half, minZ: cz - half, maxZ: cz + half, y: 0.3 });
      const kerb = new THREE.BoxGeometry(half * 2 + 0.3, 0.14, half * 2 + 0.3);
      kerb.translate(cx, 0.08, cz);
      kerbGeos.push(kerb);
      // Lamps at corners.
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const lx = cx + sx * (half - 1.2);
        const lz = cz + sz * (half - 1.2);
        lamps.push({ x: lx, z: lz });
        solids.push({ minX: lx - 0.2, maxX: lx + 0.2, minZ: lz - 0.2, maxZ: lz + 0.2 });
        const pole = new THREE.CylinderGeometry(0.1, 0.16, 6.5, 8);
        pole.translate(lx, 3.5, lz);
        const arm = new THREE.CylinderGeometry(0.07, 0.09, 2.2, 6);
        arm.rotateZ(Math.PI / 2);
        arm.translate(lx - sx * 1.0, 6.7, lz);
        const head = new THREE.BoxGeometry(0.9, 0.22, 0.4);
        head.translate(lx - sx * 2.0, 6.55, lz);
        lampPoleGeos.push(pole, arm);
        lampHeadGeos.push(head);
      }
      if (district === 'plaza') {
        // Cobbled plaza with a monument column, trees and benches.
        const cob = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.34, half * 2), new THREE.MeshLambertMaterial({ map: cobble}));
        cob.position.set(cx, 0.17, cz);
        cob.receiveShadow = false;
        group.add(cob);
        const stone = new THREE.MeshLambertMaterial({ color: 0xb9ab95});
        const gold = new THREE.MeshLambertMaterial({ color: 0xd9a63a});
        for (let i = 0; i < 3; i++) {
          const step = new THREE.Mesh(new THREE.CylinderGeometry(9 - i * 2, 9.5 - i * 2, 1, 24), stone);
          step.position.set(cx, 0.8 + i, cz);
          step.castShadow = step.receiveShadow = false;
          group.add(step);
        }
        const column = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.0, 36, 16), stone);
        column.position.set(cx, 21, cz);
        column.castShadow = false;
        group.add(column);
        const capital = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 1.8, 2, 16), stone);
        capital.position.set(cx, 40, cz);
        group.add(capital);
        const statue = new THREE.Mesh(new THREE.ConeGeometry(1.4, 5, 8), gold);
        statue.position.set(cx, 43.5, cz);
        group.add(statue);
        const wing = new THREE.Mesh(new THREE.BoxGeometry(7, 2.4, 0.3), gold);
        wing.position.set(cx, 44.5, cz);
        wing.rotation.z = 0.15;
        group.add(wing);
        solids.push({ minX: cx - 9.5, maxX: cx + 9.5, minZ: cz - 9.5, maxZ: cz + 9.5 });
        for (let i = 0; i < 16; i++) {
          const a = (i / 16) * Math.PI * 2;
          tree(cx + Math.cos(a) * 22, cz + Math.sin(a) * 22, 4.5 + rng.next() * 2);
        }
        continue;
      }
      // Hedge-free blocks: the building perimeter is solid instead.
      const lots: { x: number; z: number; w: number; d: number }[] = [];
      const inner = BLOCK / 2 - 1.5;
      const split = rng.next();
      if (district === 'modern' && split < 0.5) lots.push({ x: cx, z: cz, w: inner * 2, d: inner * 2 });
      else if (split < 0.35) {
        lots.push({ x: cx - inner / 2, z: cz, w: inner, d: inner * 2 });
        lots.push({ x: cx + inner / 2, z: cz, w: inner, d: inner * 2 });
      } else if (split < 0.7) {
        lots.push({ x: cx, z: cz - inner / 2, w: inner * 2, d: inner });
        lots.push({ x: cx, z: cz + inner / 2, w: inner * 2, d: inner });
      } else for (const sx of [-1, 1]) for (const sz of [-1, 1]) lots.push({ x: cx + (sx * inner) / 2, z: cz + (sz * inner) / 2, w: inner, d: inner });
      // Block interior solid so cars cannot slip between buildings.
      solids.push({ minX: cx - inner - 0.5, maxX: cx + inner + 0.5, minZ: cz - inner - 0.5, maxZ: cz + inner + 0.5 });
      for (const lot of lots) {
        const w = lot.w - 1.5 - rng.next() * 2;
        const d = lot.d - 1.5 - rng.next() * 2;
        let floors: number;
        if (district === 'modern') floors = 8 + rng.int(0, 30);
        else if (district === 'industrial') floors = 2 + rng.int(0, 3);
        else if (district === 'oldtown') floors = 4 + rng.int(0, 3);
        else floors = 4 + rng.int(0, 5);
        const floorH = district === 'modern' ? 3.6 : 3.5;
        const hgt = floors * floorH;
        const style = rng.pick(facadeStyles[district]);
        const { key, facade } = facadeFor(style, rng.int(0, 3));
        const geo = new THREE.BoxGeometry(w, hgt, d);
        facadeUVs(geo, w, hgt, d, facade.size[0], facade.size[1]);
        geo.translate(lot.x, hgt / 2 + 0.3, lot.z);
        buildings.get(key)!.geos.push(geo);
        // Ground floor: shop band with a darker plinth, doors and awnings in the old town.
        const plinth = new THREE.BoxGeometry(w + 0.2, 0.6, d + 0.2);
        plinth.translate(lot.x, 0.6, lot.z);
        darkGeos.push(plinth);
        if (district !== 'modern') {
          const band = new THREE.BoxGeometry(w + 0.3, 0.35, d + 0.3);
          band.translate(lot.x, 3.65, lot.z);
          trimGeos.push(band);
          for (let k = 0; k < 2; k++) {
            if (rng.next() < 0.4) continue;
            const side = rng.chance(0.5) ? 1 : -1;
            const aw = new THREE.BoxGeometry(3.6, 0.1, 1.5);
            aw.rotateX(side * 0.3);
            aw.translate(lot.x + (rng.next() - 0.5) * (w - 6), 3.1, lot.z + side * (d / 2 + 0.7));
            awningGeos.push(aw);
          }
          // Shopfront strip: textured bays (windows, doors, fascias) wrapped around the ground floor.
          const shop = new THREE.BoxGeometry(w - 1.2, 2.6, d + 0.16);
          facadeUVs(shop, w - 1.2, 2.6, d + 0.16, 16, 2.6);
          shop.translate(lot.x, 1.9, lot.z);
          const sfKey = `sf-${rng.int(0, 5)}`;
          if (!shopfronts.has(sfKey)) shopfronts.set(sfKey, { mat: new THREE.MeshLambertMaterial({ map: shopfrontTexture(seed * 17 + shopfronts.size * 3, SIGN_COLORS[shopfronts.size % SIGN_COLORS.length]), emissive: 0xffd9a0, emissiveIntensity: 0 }), geos: [] });
          shopfronts.get(sfKey)!.geos.push(shop);
        }
        // Per-floor ledges give the facade real depth; balconies on residential blocks.
        if (district !== 'modern') {
          for (let f = 1; f < floors; f++) {
            const ledge = new THREE.BoxGeometry(w + 0.36, 0.14, d + 0.36);
            ledge.translate(lot.x, f * floorH + 0.3, lot.z);
            trimGeos.push(ledge);
            if ((district === 'residential' || district === 'oldtown') && rng.next() > 0.45) {
              const side = rng.chance(0.5) ? 1 : -1;
              const bx = lot.x + (rng.next() - 0.5) * (w - 5);
              const bz = lot.z + side * (d / 2 + 0.55);
              const slab = new THREE.BoxGeometry(2.6, 0.16, 1.1);
              slab.translate(bx, f * floorH + 0.3, bz);
              trimGeos.push(slab);
              const rail = new THREE.BoxGeometry(2.6, 0.9, 0.08);
              rail.translate(bx, f * floorH + 0.8, bz + side * 0.52);
              darkGeos.push(rail);
              for (const rs of [-1.26, 1.26]) {
                const rs2 = new THREE.BoxGeometry(0.08, 0.9, 1.1);
                rs2.translate(bx + rs, f * floorH + 0.8, bz);
                darkGeos.push(rs2);
              }
            }
          }
          // A doorway on the street side, a shop sign over it, posters on the wall and a bin by the door.
          const dside = rng.chance(0.5) ? 1 : -1;
          const doorX = lot.x + (rng.next() - 0.5) * (w - 4);
          const door = new THREE.BoxGeometry(1.6, 2.6, 0.3);
          door.translate(doorX, 1.6, lot.z + dside * (d / 2 + 0.1));
          darkGeos.push(door);
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(4.2, 1.1), new THREE.MeshLambertMaterial({ map: neonLabelTexture(rng.pick(SHOP_NAMES), rng.pick(SIGN_COLORS), false) }));
          sign.position.set(doorX, 3.45, lot.z + dside * (d / 2 + 0.28));
          sign.rotation.y = dside > 0 ? 0 : Math.PI;
          group.add(sign);
          const signBoard = new THREE.BoxGeometry(4.4, 1.3, 0.12);
          signBoard.translate(doorX, 3.45, lot.z + dside * (d / 2 + 0.2));
          darkGeos.push(signBoard);
          for (let k = 0; k < 2; k++) {
            if (rng.next() < 0.45) continue;
            const px = lot.x + (rng.next() - 0.5) * (w - 3);
            const poster = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.8), new THREE.MeshLambertMaterial({ map: neonLabelTexture(rng.pick(POSTER_WORDS), rng.pick(SIGN_COLORS), false) }));
            poster.position.set(px, 1.7 + rng.next() * 0.6, lot.z - dside * (d / 2 + 0.06));
            poster.rotation.y = dside > 0 ? Math.PI : 0;
            group.add(poster);
          }
          const bin = new THREE.CylinderGeometry(0.28, 0.24, 0.9, 10);
          bin.translate(doorX + 2.4, 0.75, lot.z + dside * (d / 2 + 1.2));
          darkGeos.push(bin);
        }
        // Cornice and roof.
        const cornice = new THREE.BoxGeometry(w + 0.8, 0.6, d + 0.8);
        cornice.translate(lot.x, hgt + 0.3, lot.z);
        trimGeos.push(cornice);
        if ((district === 'oldtown' || (district === 'residential' && rng.next() > 0.4)) && !(bx === 2 && bz === 3)) {
          // Pitched roof: triangular prism along the longer axis.
          const alongX = w >= d;
          const span = alongX ? d : w;
          const len = alongX ? w : d;
          const roofH = span * 0.32;
          const prism = new THREE.CylinderGeometry(span / 1.732, span / 1.732, len, 3);
          prism.rotateY(Math.PI / 6);
          prism.scale(1, roofH / (span / 1.732 * 1.5), 1);
          prism.rotateX(Math.PI / 2);
          if (!alongX) prism.rotateY(Math.PI / 2);
          prism.translate(lot.x, hgt + 0.6 + roofH * 0.5, lot.z);
          pitchedGeos.push(prism);
          // Chimneys and dormers.
          for (let k = 0; k < 1 + rng.int(0, 2); k++) {
            const ch = new THREE.BoxGeometry(0.8, 2.2, 0.8);
            ch.translate(lot.x + (rng.next() - 0.5) * (w - 4), hgt + roofH * 0.6, lot.z + (rng.next() - 0.5) * (d - 4));
            darkGeos.push(ch);
          }
        } else {
          roofTops.push({ x: lot.x, z: lot.z, minX: lot.x - w / 2, maxX: lot.x + w / 2, minZ: lot.z - d / 2, maxZ: lot.z + d / 2, y: hgt + 0.3 });
          const par = new THREE.BoxGeometry(w + 0.2, 1.1, d + 0.2);
          par.translate(lot.x, hgt + 0.9, lot.z);
          roofGeos.push(par);
          for (let k = 0; k < 2 + rng.int(0, 3); k++) {
            const ax = lot.x + (rng.next() - 0.5) * (w - 6);
            const az = lot.z + (rng.next() - 0.5) * (d - 6);
            const ac = new THREE.BoxGeometry(1.6 + rng.next() * 1.4, 1.1, 1.6 + rng.next() * 1.4);
            ac.translate(ax, hgt + 1.1, az);
            roofGeos.push(ac);
            const fan = new THREE.CylinderGeometry(0.5, 0.5, 0.1, 10);
            fan.translate(ax, hgt + 1.7, az);
            darkGeos.push(fan);
          }
          // Railing along the parapet, a water tank, pipes and a vent stack.
          const railH = 1.0;
          for (const [rx, rz, rw, rd] of [[lot.x, lot.z - d / 2, w, 0.06], [lot.x, lot.z + d / 2, w, 0.06], [lot.x - w / 2, lot.z, 0.06, d], [lot.x + w / 2, lot.z, 0.06, d]] as const) {
            const bar = new THREE.BoxGeometry(rw, 0.06, rd);
            bar.translate(rx, hgt + 1.5 + railH, rz);
            darkGeos.push(bar);
          }
          if (rng.next() > 0.45) {
            const tx = lot.x + (rng.next() - 0.5) * (w - 8);
            const tz = lot.z + (rng.next() - 0.5) * (d - 8);
            const tank = new THREE.CylinderGeometry(1.6, 1.6, 3, 10);
            tank.translate(tx, hgt + 3.8, tz);
            woodGeos.push(tank);
            const lid = new THREE.ConeGeometry(1.7, 0.8, 10);
            lid.translate(tx, hgt + 5.7, tz);
            darkGeos.push(lid);
            for (const [lx, lz] of [[-1.2, -1.2], [1.2, -1.2], [-1.2, 1.2], [1.2, 1.2]] as const) {
              const leg = new THREE.BoxGeometry(0.15, 2.2, 0.15);
              leg.translate(tx + lx, hgt + 1.4, tz + lz);
              darkGeos.push(leg);
            }
          }
          for (let k = 0; k < 2; k++) {
            const vent = new THREE.CylinderGeometry(0.22, 0.22, 1.2 + rng.next(), 8);
            vent.translate(lot.x + (rng.next() - 0.5) * (w - 4), hgt + 0.9, lot.z + (rng.next() - 0.5) * (d - 4));
            darkGeos.push(vent);
          }
          const pipe = new THREE.BoxGeometry(w - 4, 0.14, 0.14);
          pipe.translate(lot.x, hgt + 0.45, lot.z - d / 2 + 1.5);
          darkGeos.push(pipe);
          if (rng.next() > 0.5) {
            const ant = new THREE.CylinderGeometry(0.1, 0.2, 6 + rng.next() * 12, 6);
            ant.translate(lot.x + (rng.next() - 0.5) * (w - 4), hgt + 4, lot.z + (rng.next() - 0.5) * (d - 4));
            darkGeos.push(ant);
          }
          if (district === 'industrial' && rng.next() > 0.5) {
            const chim = new THREE.CylinderGeometry(1.2, 1.8, 22, 10);
            chim.translate(lot.x + w / 2 - 3, hgt + 10, lot.z - d / 2 + 3);
            buildings.get(facadeFor('brick', 1).key)!.geos.push(chim);
          }
        }
      }
      // Street furniture.
      for (let i = 0; i < 2; i++) {
        const bside = rng.chance(0.5) ? 1 : -1;
        const bxp = cx + (rng.next() - 0.5) * (half * 2 - 12);
        const bzp = cz + bside * (half - 1.4);
        const seat = new THREE.BoxGeometry(1.8, 0.08, 0.5);
        seat.translate(bxp, 0.75, bzp);
        const back = new THREE.BoxGeometry(1.8, 0.45, 0.06);
        back.translate(bxp, 1.02, bzp + bside * 0.24);
        woodGeos.push(seat, back);
        for (const lx of [-0.75, 0.75]) {
          const leg = new THREE.BoxGeometry(0.08, 0.45, 0.5);
          leg.translate(bxp + lx, 0.52, bzp);
          darkGeos.push(leg);
        }
        const bin = new THREE.CylinderGeometry(0.28, 0.24, 0.9, 10);
        bin.translate(bxp + 1.6, 0.75, bzp);
        darkGeos.push(bin);
      }
      if ((bx + bz) % 3 === 0) {
        // Bus shelter on the east sidewalk.
        const sx = cx + half - 1.6;
        const sz = cz + (rng.next() - 0.5) * 20;
        const roofS = new THREE.BoxGeometry(1.6, 0.1, 4.2);
        roofS.translate(sx, 2.6, sz);
        darkGeos.push(roofS);
        const backS = new THREE.BoxGeometry(0.08, 2.3, 4.2);
        backS.translate(sx - 0.75, 1.45, sz);
        glassGeos.push(backS);
        for (const pz of [-2, 2]) {
          const post = new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6);
          post.translate(sx + 0.7, 1.3, sz + pz);
          darkGeos.push(post);
        }
        const sign = new THREE.BoxGeometry(0.06, 0.6, 0.6);
        sign.translate(sx + 0.9, 2.9, sz - 2.3);
        trimGeos.push(sign);
      }
      // Traffic signs at two corners.
      for (const [sx, sz] of [[1, -1], [-1, 1]] as const) {
        const px = cx + sx * (half - 0.6);
        const pz = cz + sz * (half - 3);
        const pole = new THREE.CylinderGeometry(0.04, 0.04, 2.6, 6);
        pole.translate(px, 1.6, pz);
        darkGeos.push(pole);
        const plate = new THREE.CylinderGeometry(0.35, 0.35, 0.04, 12);
        plate.rotateX(Math.PI / 2);
        plate.translate(px, 2.7, pz);
        signGeos.push(plate);
      }
      // Street trees along the sidewalk.
      for (let i = 0; i < 4; i++) {
        if (rng.next() > 0.55) tree(cx - half + 1.8, cz - half + 8 + (i * (half * 2 - 16)) / 3, 4 + rng.next() * 2.5);
        if (rng.next() > 0.55) tree(cx + half - 1.8, cz - half + 8 + (i * (half * 2 - 16)) / 3, 4 + rng.next() * 2.5);
      }
    }
  }

  // Merge everything by material.
  group.add(sidewalkTo(sidewalkGeos, new THREE.MeshLambertMaterial({ map: cobble, color: 0xb8b0a4 })));
  group.add(sidewalkTo(kerbGeos, new THREE.MeshLambertMaterial({ color: 0x8a847a})));
  const windowMats: THREE.MeshLambertMaterial[] = [];
  for (const { facade, geos } of buildings.values()) {
    if (!geos.length) continue;
    const mat = new THREE.MeshLambertMaterial({ map: facade.map, emissiveMap: facade.emissive, emissive: 0xffd9a8, emissiveIntensity: 0, color: facade.color });
    windowMats.push(mat);
    const m = new THREE.Mesh(mergeSafe(geos), mat);
    m.castShadow = false;
    m.receiveShadow = false;
    group.add(m);
  }
  const roofTex = roofTexture();
  roofTex.repeat.set(0.4, 0.4);
  if (pitchedGeos.length) group.add(withShadow(new THREE.Mesh(mergeSafe(pitchedGeos), new THREE.MeshLambertMaterial({ map: roofTex, color: 0xc08a70 }))));
  if (roofGeos.length) group.add(withShadow(new THREE.Mesh(mergeSafe(roofGeos), new THREE.MeshLambertMaterial({ color: 0x6a6460}))));
  if (trimGeos.length) group.add(withShadow(new THREE.Mesh(mergeSafe(trimGeos), new THREE.MeshLambertMaterial({ color: 0xe6dccb}))));
  if (darkGeos.length) group.add(withShadow(new THREE.Mesh(mergeSafe(darkGeos), new THREE.MeshLambertMaterial({ color: 0x4a443f}))));
  if (awningGeos.length) group.add(withShadow(new THREE.Mesh(mergeSafe(awningGeos), new THREE.MeshLambertMaterial({ color: 0x8a3a30}))));
  if (woodGeos.length) group.add(withShadow(new THREE.Mesh(mergeSafe(woodGeos), new THREE.MeshLambertMaterial({ color: 0x8a6a48}))));
  if (signGeos.length) group.add(new THREE.Mesh(mergeSafe(signGeos), new THREE.MeshLambertMaterial({ color: 0xd8d8d8, emissive: 0x3344aa, emissiveIntensity: 0.3 })));
  // Bollards around the central plaza.
  const bollards: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const r = BLOCK / 2 + SIDEWALK - 0.8;
    const bx = Math.cos(a) * r;
    const bz = Math.sin(a) * r;
    if (Math.abs(bx) > r - 0.5 || Math.abs(bz) > r - 0.5) continue;
    const bol = new THREE.CylinderGeometry(0.12, 0.14, 0.9, 8);
    bol.translate(bx, 0.75, bz);
    bollards.push(bol);
  }
  if (bollards.length) group.add(new THREE.Mesh(mergeSafe(bollards), new THREE.MeshLambertMaterial({ color: 0x2a2a2e})));
  const shopGlassMat = new THREE.MeshLambertMaterial({ color: 0x141a22, emissive: 0xffd9a0, emissiveIntensity: 0});
  if (glassGeos.length) group.add(new THREE.Mesh(mergeSafe(glassGeos), shopGlassMat));
  for (const sf of shopfronts.values()) if (sf.geos.length) group.add(new THREE.Mesh(mergeSafe(sf.geos), sf.mat));
  // Drains at every kerb corner and a few manholes mid-road.
  const drainGeos: THREE.BufferGeometry[] = [];
  for (const b of blockInfo) {
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const dg = new THREE.BoxGeometry(0.9, 0.03, 0.4);
      dg.translate(b.cx + sx * (b.half + 0.8), 0.015, b.cz + sz * (b.half - 3));
      drainGeos.push(dg);
    }
  }
  for (const x of roadsX) for (const z of roadsZ) {
    if (rng.next() > 0.5) continue;
    const mh = new THREE.CylinderGeometry(0.5, 0.5, 0.03, 12);
    mh.translate(x + (rng.next() - 0.5) * 6, 0.015, z + 14 + rng.next() * 30);
    drainGeos.push(mh);
  }
  group.add(new THREE.Mesh(mergeSafe(drainGeos), new THREE.MeshLambertMaterial({ color: 0x2e2c2a })));
  // Tyre marks curving out of intersections and puddles along the gutters.
  const dm = new THREE.Matrix4();
  const skidMat = new THREE.MeshBasicMaterial({ map: skidTexture(), transparent: true, depthWrite: false, opacity: 0.8 });
  const skids = new THREE.InstancedMesh(new THREE.PlaneGeometry(14, 3.2), skidMat, 60);
  let si = 0;
  for (let i = 0; i < 60; i++) {
    const alongX = rng.chance(0.5);
    const road = alongX ? rng.pick(roadsZ) : rng.pick(roadsX);
    const cross = alongX ? rng.pick(roadsX) : rng.pick(roadsZ);
    const off = (rng.chance(0.5) ? 1 : -1) * (LANE / 2 + 0.3);
    const along = cross + (rng.chance(0.5) ? 1 : -1) * (12 + rng.next() * 16);
    const x = alongX ? along : road + off;
    const z = alongX ? road + off : along;
    dm.compose(new THREE.Vector3(x, 0.02, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, (alongX ? 0 : Math.PI / 2) + (rng.next() - 0.5) * 0.5)), new THREE.Vector3(1, 1, 1));
    skids.setMatrixAt(si++, dm);
  }
  skids.renderOrder = 1;
  group.add(skids);
  const puddleMat = new THREE.MeshBasicMaterial({ map: puddleTexture(), color: 0x6a7080, transparent: true, opacity: 0, depthWrite: false });
  const puddles = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), puddleMat, 120);
  for (let i = 0; i < 120; i++) {
    const alongX = rng.chance(0.5);
    const road = alongX ? rng.pick(roadsZ) : rng.pick(roadsX);
    const along = rng.range(-CITY_HALF, CITY_HALF);
    const off = (rng.chance(0.5) ? 1 : -1) * (ROAD / 2 - SIDEWALK - 1.2);
    const x = alongX ? along : road + off;
    const z = alongX ? road + off : along;
    const s = 2 + rng.next() * 4;
    dm.compose(new THREE.Vector3(x, 0.025, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, rng.next() * 3)), new THREE.Vector3(s, s * 0.7, 1));
    puddles.setMatrixAt(i, dm);
  }
  puddles.renderOrder = 1;
  group.add(puddles);

  // Trees (instanced).
  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.26, 1, 7), new THREE.MeshLambertMaterial({ color: 0x5a4636}), Math.max(1, treeTrunks.length));
  treeTrunks.forEach((m, i) => trunkMesh.setMatrixAt(i, m));
  trunkMesh.castShadow = false;
  group.add(trunkMesh);
  const canopyMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ map: foliageTexture(), transparent: true, alphaTest: 0.5, side: THREE.DoubleSide, color: 0xffffff }), Math.max(1, treeCanopies.length));
  const cc = new THREE.Color();
  treeCanopies.forEach((m, i) => {
    canopyMesh.setMatrixAt(i, m);
    canopyMesh.setColorAt(i, cc.setHSL(0.24 + rng.next() * 0.06, 0.35, 0.55 + rng.next() * 0.25));
  });
  canopyMesh.castShadow = quality !== 'battery';
  canopyMesh.receiveShadow = false;
  group.add(canopyMesh);

  // Lamps.
  group.add(withShadow(new THREE.Mesh(mergeSafe(lampPoleGeos), new THREE.MeshLambertMaterial({ color: 0x2f3236}))));
  const lampHeadMat = new THREE.MeshLambertMaterial({ color: 0xfff1d6, emissive: 0xffd58a, emissiveIntensity: 0 });
  group.add(new THREE.Mesh(mergeSafe(lampHeadGeos), lampHeadMat));
  const poolTex = radialSpriteTexture();
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: 0xffd58a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const pools = new THREE.InstancedMesh(new THREE.PlaneGeometry(14, 14), poolMat, lamps.length);
  const pm = new THREE.Matrix4();
  const pq = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  lamps.forEach((l, i) => {
    pm.compose(new THREE.Vector3(l.x, 0.34, l.z), pq, new THREE.Vector3(1, 1, 1));
    pools.setMatrixAt(i, pm);
  });
  group.add(pools);
  // Light cones hanging from each lamp head (two crossed billboards) and a bulb glow sprite.
  const coneMat = new THREE.MeshBasicMaterial({ map: coneTexture(), color: 0xffd58a, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  const cones = new THREE.InstancedMesh(new THREE.PlaneGeometry(5.5, 6.4), coneMat, lamps.length * 2);
  const bulbMat = new THREE.SpriteMaterial({ map: poolTex, color: 0xfff0c0, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  lamps.forEach((l, i) => {
    const hx = l.x + (l.x < 0 ? 2.0 : -2.0) * 0; // head sits ~2 m toward the road from the pole
    const armDir = Math.sign(-(l.x % CELL + CELL) % CELL + CELL / 2) || 1;
    const headX = l.x - armDir * 2.0;
    for (let k = 0; k < 2; k++) {
      pm.compose(new THREE.Vector3(headX + hx, 6.5 - 3.2, l.z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, (k * Math.PI) / 2, 0)), new THREE.Vector3(1, 1, 1));
      cones.setMatrixAt(i * 2 + k, pm);
    }
    const bulb = new THREE.Sprite(bulbMat);
    bulb.position.set(headX, 6.5, l.z);
    bulb.scale.set(2.4, 1.6, 1);
    group.add(bulb);
    pm.compose(new THREE.Vector3(headX, 0.34, l.z), pq, new THREE.Vector3(1, 1, 1));
    pools.setMatrixAt(i, pm);
  });
  pools.instanceMatrix.needsUpdate = true;
  group.add(cones);
  void hedgeGeos;

  /* ---------------- parked cars ---------------- */
  const parkedBody = mergeSafe([new THREE.BoxGeometry(1.8, 0.55, 4.2).translate(0, 0.6, 0), new THREE.BoxGeometry(1.55, 0.5, 2.0).translate(0, 1.12, -0.2)]);
  const parked = new THREE.InstancedMesh(parkedBody, new THREE.MeshLambertMaterial({ color: 0xffffff}), 80);
  const carColors = [0xd9d9d9, 0x2a2a2a, 0x8a1c1c, 0x1f3a6a, 0xc9c0a8, 0x6a6a6a, 0x2f5a3a, 0xffffff, 0x3a3a4a];
  let pc = 0;
  const parkedBoxes: Box2[] = [];
  for (let i = 0; i < 80; i++) {
    const alongX = rng.chance(0.5);
    const road = alongX ? rng.pick(roadsZ) : rng.pick(roadsX);
    const along = rng.range(-CITY_HALF + 14, CITY_HALF - 14);
    const side = rng.chance(0.5) ? 1 : -1;
    const off = road + side * (ROAD / 2 - SIDEWALK - 1.3);
    const x = alongX ? along : off;
    const z = alongX ? off : along;
    if (roadsX.some((rx) => Math.abs(rx - x) < 12) && roadsZ.some((rz) => Math.abs(rz - z) < 12)) continue;
    pm.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, alongX ? Math.PI / 2 : 0, 0)), new THREE.Vector3(1, 1, 1));
    parked.setMatrixAt(pc, pm);
    parked.setColorAt(pc, cc.setHex(rng.pick(carColors)));
    solids.push({ minX: x - 1, maxX: x + 1, minZ: z - 1, maxZ: z + 1 });
    parkedBoxes.push({ minX: x - (alongX ? 2.1 : 0.95), maxX: x + (alongX ? 2.1 : 0.95), minZ: z - (alongX ? 0.95 : 2.1), maxZ: z + (alongX ? 0.95 : 2.1) });
    pc++;
  }
  parked.count = pc;
  parked.castShadow = false;
  group.add(parked);

  /* ---------------- graffiti wall along one avenue ---------------- */
  const wallX = roadsX[5] + ROAD / 2 + 0.6;
  for (let i = 0; i < 4; i++) {
    const tex = graffitiTexture(seed + i * 13);
    tex.repeat.set(2, 1);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.2, CELL * 1.5), new THREE.MeshLambertMaterial({ map: tex}));
    seg.position.set(wallX, 1.9, -CITY_HALF + 20 + i * CELL * 1.5 + CELL * 0.75);
    seg.castShadow = seg.receiveShadow = false;
    group.add(seg);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, CELL * 1.5, 10), new THREE.MeshLambertMaterial({ color: 0xa8a39a}));
    cap.rotation.x = Math.PI / 2;
    cap.position.set(wallX, 3.5, seg.position.z);
    group.add(cap);
  }

  /* ---------------- elevated rail viaduct with a train ---------------- */
  const viaZ = roadsZ[1] - ROAD / 2 - 2.5;
  const brick = facadeFor('brick', 1).facade;
  const viaGeos: THREE.BufferGeometry[] = [];
  for (let x = -CITY_HALF; x < CITY_HALF; x += 9) {
    const pier = new THREE.BoxGeometry(2.2, 8, 4.5);
    facadeUVs(pier, 2.2, 8, 4.5, 6, 8);
    pier.translate(x, 4.3, viaZ);
    viaGeos.push(pier);
    const arch = new THREE.BoxGeometry(9, 2.2, 4.5);
    facadeUVs(arch, 9, 2.2, 4.5, 6, 8);
    arch.translate(x + 4.5, 8.2, viaZ);
    viaGeos.push(arch);
  }
  const viaduct = new THREE.Mesh(mergeSafe(viaGeos), new THREE.MeshLambertMaterial({ map: brick.map, color: 0x9a7a6a }));
  viaduct.castShadow = viaduct.receiveShadow = false;
  group.add(viaduct);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(CITY_HALF * 2 + 400, 0.6, 5.2), new THREE.MeshLambertMaterial({ color: 0x6a6460}));
  deck.position.set(0, 9.6, viaZ);
  deck.receiveShadow = false;
  group.add(deck);
  const rail = new THREE.Mesh(mergeSafe([new THREE.BoxGeometry(CITY_HALF * 2 + 400, 0.9, 0.1).translate(0, 10.3, viaZ - 2.5), new THREE.BoxGeometry(CITY_HALF * 2 + 400, 0.9, 0.1).translate(0, 10.3, viaZ + 2.5), new THREE.BoxGeometry(CITY_HALF * 2 + 400, 0.08, 0.1).translate(0, 9.95, viaZ - 0.75), new THREE.BoxGeometry(CITY_HALF * 2 + 400, 0.08, 0.1).translate(0, 9.95, viaZ + 0.75)]), new THREE.MeshLambertMaterial({ color: 0x3a3a3a}));
  group.add(rail);
  const trainTex = trainTexture();
  const train = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(16, 3.4, 2.9), new THREE.MeshLambertMaterial({ map: trainTex}));
    car.position.set(i * 16.6, 11.7, 0);
    car.castShadow = false;
    train.add(car);
    const roofM = new THREE.Mesh(new THREE.BoxGeometry(15.6, 0.3, 2.6), new THREE.MeshLambertMaterial({ color: 0xb8b0a0}));
    roofM.position.set(i * 16.6, 13.5, 0);
    train.add(roofM);
  }
  train.position.set(-CITY_HALF - 120, 0, viaZ);
  group.add(train);
  for (let x = -CITY_HALF; x < CITY_HALF; x += 9) solids.push({ minX: x - 1.1, maxX: x + 1.1, minZ: viaZ - 2.25, maxZ: viaZ + 2.25 });
  // The deck is walkable; a staircase climbs to it from the sidewalk by the third avenue.
  platforms.push({ minX: -CITY_HALF - 200, maxX: CITY_HALF + 200, minZ: viaZ - 2.5, maxZ: viaZ + 2.5, y: 9.9, fenced: true });
  const stairX = roadsX[3] + ROAD / 2 + 2;
  const stairMat = new THREE.MeshLambertMaterial({ color: 0x6a6460});
  const stairGeos: THREE.BufferGeometry[] = [];
  const stairLen = 22;
  const steps = 32;
  for (let i = 0; i < steps; i++) {
    const s = new THREE.BoxGeometry(2.4, 0.32, stairLen / steps + 0.05);
    s.translate(stairX, 0.3 + (i + 0.5) * (9.6 / steps), viaZ + 2.5 + stairLen - (i + 0.5) * (stairLen / steps));
    stairGeos.push(s);
  }
  // Landing and handrails.
  const landing = new THREE.BoxGeometry(2.4, 0.32, 2.6);
  landing.translate(stairX, 9.75, viaZ + 1.3);
  stairGeos.push(landing);
  for (const sx of [-1.25, 1.25]) {
    const railS = new THREE.BoxGeometry(0.08, 1.0, stairLen + 2.6);
    railS.translate(stairX + sx, 5.4, viaZ + 2.5 + stairLen / 2 - 0.1);
    railS.rotateX(0);
    stairGeos.push(railS);
  }
  const stairs = new THREE.Mesh(mergeSafe(stairGeos), stairMat);
  stairs.castShadow = stairs.receiveShadow = false;
  group.add(stairs);
  platforms.push({ minX: stairX - 1.2, maxX: stairX + 1.2, minZ: viaZ + 2.5, maxZ: viaZ + 2.5 + stairLen, y: 9.9, ramp: { axis: 'z', y0: 9.9, y1: 0 }, fenced: true });
  // A gap in the deck rail at the stairs so you can step on.
  solids.push({ minX: stairX - 1.4, maxX: stairX + 1.4, minZ: viaZ + 2.3, maxZ: viaZ + 2.7 });

  /* ---------------- climbable rooftop: a fire escape on the block west of the plaza ---------------- */
  {
    const bx = 2;
    const bz = 3;
    const cx = -CITY_HALF + bx * CELL + CELL / 2;
    const cz = -CITY_HALF + bz * CELL + CELL / 2;
    const roofInfo = roofTops.find((r) => Math.abs(r.x - cx) < CELL / 2 && Math.abs(r.z - cz) < CELL / 2);
    if (roofInfo) {
      const ex = roofInfo.maxX + 0.9;
      const top = roofInfo.y;
      const flights = Math.ceil(top / 3.2);
      const feGeos: THREE.BufferGeometry[] = [];
      const runZ = 6;
      for (let f = 0; f < flights; f++) {
        const y0 = f * (top / flights);
        const y1 = (f + 1) * (top / flights);
        const dir = f % 2 === 0 ? 1 : -1;
        const z0 = roofInfo.z - (dir * runZ) / 2;
        const n = 8;
        for (let i = 0; i < n; i++) {
          const s = new THREE.BoxGeometry(1.4, 0.12, runZ / n);
          s.translate(ex, y0 + ((i + 0.5) * (y1 - y0)) / n, z0 + dir * ((i + 0.5) * runZ) / n);
          feGeos.push(s);
        }
        platforms.push({ minX: ex - 0.7, maxX: ex + 0.7, minZ: Math.min(z0, z0 + dir * runZ), maxZ: Math.max(z0, z0 + dir * runZ), y: y1, ramp: { axis: 'z', y0: dir > 0 ? y0 : y1, y1: dir > 0 ? y1 : y0 }, fenced: true });
        // Landing at the top of each flight.
        const land = new THREE.BoxGeometry(1.4, 0.12, 1.6);
        land.translate(ex, y1, z0 + dir * (runZ + 0.8));
        feGeos.push(land);
        platforms.push({ minX: ex - 0.7, maxX: ex + 0.7, minZ: z0 + dir * runZ - 0.8 + (dir > 0 ? 0 : 0), maxZ: z0 + dir * runZ + 0.8, y: y1, fenced: true });
        const railF = new THREE.BoxGeometry(0.06, 1.0, runZ + 1.6);
        railF.translate(ex + 0.7, (y0 + y1) / 2 + 0.6, roofInfo.z + dir * 0.8);
        feGeos.push(railF);
      }
      const fe = new THREE.Mesh(mergeSafe(feGeos), new THREE.MeshLambertMaterial({ color: 0x3a3a3e}));
      fe.castShadow = false;
      group.add(fe);
      // The roof itself: walkable, parapet keeps you from falling (fenced).
      platforms.push({ minX: roofInfo.minX, maxX: roofInfo.maxX + 1.6, minZ: roofInfo.minZ, maxZ: roofInfo.maxZ, y: top, fenced: true });
      // A rooftop table and chairs for the sunset.
      const tbl = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.08, 0.9), new THREE.MeshLambertMaterial({ color: 0x8a6a48}));
      tbl.position.set(roofInfo.x, top + 0.75, roofInfo.z);
      group.add(tbl);
      for (const dz of [-0.9, 0.9]) {
        const ch = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.9, 0.5), new THREE.MeshLambertMaterial({ color: 0x6a4a30}));
        ch.position.set(roofInfo.x, top + 0.45, roofInfo.z + dz);
        group.add(ch);
      }
      const pot = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.2, 0.4, 8), new THREE.MeshLambertMaterial({ color: 0x7a4a3a }));
      pot.position.set(roofInfo.x + 1.2, top + 0.2, roofInfo.z - 1.2);
      group.add(pot);
      const plant = new THREE.Mesh(new THREE.IcosahedronGeometry(0.45, 1), new THREE.MeshLambertMaterial({ color: 0x4f7a3a, flatShading: true }));
      plant.position.set(roofInfo.x + 1.2, top + 0.7, roofInfo.z - 1.2);
      group.add(plant);
      rooftopSpot = new THREE.Vector3(roofInfo.x, top, roofInfo.z);
    }
  }

  /* ---------------- landmarks and horizon ---------------- */
  const tower = new THREE.Group();
  const towerMat = new THREE.MeshLambertMaterial({ color: 0xcfcac2});
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(3, 9, 260, 16), towerMat);
  shaft.position.y = 130;
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(16, 24, 16), new THREE.MeshLambertMaterial({ color: 0xd8d4cc}));
  sphere.position.y = 230;
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 2, 90, 8), towerMat);
  needle.position.y = 290;
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 8), new THREE.MeshLambertMaterial({ color: 0xff2030, emissive: 0xff2030, emissiveIntensity: 2 }));
  beacon.position.y = 336;
  tower.add(shaft, sphere, needle, beacon);
  tower.position.set(120, 0, -CITY_HALF - 320);
  group.add(tower);
  neon.push({ mesh: beacon, phase: 0, base: 2 });
  // Far skyline ring, lower and hazier so it fades into the sky.
  const farGeos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 220; i++) {
    const a = (i / 220) * Math.PI * 2 + rng.next() * 0.02;
    const r = CITY_HALF + 140 + rng.next() * 420;
    const w = 16 + rng.next() * 40;
    const h = 14 + rng.next() * (rng.next() > 0.85 ? 140 : 50);
    const g = new THREE.BoxGeometry(w, h, w);
    facadeUVs(g, w, h, w, 12, 14);
    g.translate(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    farGeos.push(g);
  }
  const farFacade = facadeFor('concrete', 0).facade;
  const farMat = new THREE.MeshLambertMaterial({ map: farFacade.map, emissiveMap: farFacade.emissive, emissive: 0xffffff, emissiveIntensity: 0, color: 0xa09890});
  windowMats.push(farMat);
  group.add(new THREE.Mesh(mergeSafe(farGeos), farMat));
  // Two silhouette rings with window-dot sheets, far beyond the modelled skyline; they catch the fog colour.
  for (const [radius, tall, hgtS, seedS] of [[CITY_HALF + 700, false, 120, 3], [CITY_HALF + 1050, true, 260, 9]] as const) {
    const tex = skylineTexture(seed + seedS, tall);
    tex.repeat.set(6, 1);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, hgtS, 64, 1, true), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.BackSide, depthWrite: false, color: 0xffffff }));
    ring.position.y = hgtS / 2;
    skylineRings.push(ring);
    group.add(ring);
  }
  // A few distant spires and a dome.
  for (let i = 0; i < 6; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = CITY_HALF + 200 + rng.next() * 200;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(6, 60 + rng.next() * 50, 8), towerMat);
    spire.position.set(Math.cos(a) * r, 60, Math.sin(a) * r);
    group.add(spire);
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(28, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshLambertMaterial({ color: 0x5f8a6a}));
  dome.position.set(-CITY_HALF - 160, 40, -80);
  const domeBase = new THREE.Mesh(new THREE.BoxGeometry(90, 40, 70), new THREE.MeshLambertMaterial({ map: facadeFor('plaster', 0).facade.map}));
  domeBase.position.set(-CITY_HALF - 160, 20, -80);
  group.add(dome, domeBase);

  // City edge: a kerb and railing around the ring road so the world has a clean boundary.
  const edge = CITY_HALF + 7;
  const edgeGeos: THREE.BufferGeometry[] = [];
  for (const [x, z, w, d] of [[0, -edge, edge * 2 + 2, 2], [0, edge, edge * 2 + 2, 2], [-edge, 0, 2, edge * 2 + 2], [edge, 0, 2, edge * 2 + 2]] as const) {
    const k = new THREE.BoxGeometry(w, 0.5, d);
    k.translate(x, 0.25, z);
    edgeGeos.push(k);
    const railG = new THREE.BoxGeometry(w, 0.08, d > w ? 0.08 : 0.08);
    railG.translate(x, 1.1, z);
    edgeGeos.push(railG);
    const n = Math.floor(Math.max(w, d) / 4);
    for (let i = 0; i < n; i++) {
      const post = new THREE.BoxGeometry(0.1, 1.1, 0.1);
      post.translate(w > d ? x - w / 2 + i * 4 : x, 0.8, d > w ? z - d / 2 + i * 4 : z);
      edgeGeos.push(post);
    }
  }
  group.add(new THREE.Mesh(mergeSafe(edgeGeos), new THREE.MeshLambertMaterial({ color: 0x8a847a})));
  // Outer ground beyond the edge: a grassy embankment so the far buildings sit on something.
  const outer = new THREE.Mesh(new THREE.RingGeometry(edge * 1.35, 2600, 48), new THREE.MeshLambertMaterial({ color: 0x5a6a3a}));
  outer.rotation.x = -Math.PI / 2;
  outer.position.y = 0.02;
  group.add(outer);

  // Street props (dumpsters, stalls, cafés, hydrants, containers...).
  const props = buildProps(rng, blockInfo, roadsX, roadsZ);
  group.add(props.group);
  for (const s of props.solids) solids.push({ minX: s.minX, maxX: s.maxX, minZ: s.minZ, maxZ: s.maxZ });
  for (const pl of props.platforms) platforms.push({ ...pl });
  const obstacles: Solid3[] = [...props.solids];
  // Parked cars are vaultable too.
  for (const pcar of parkedBoxes) obstacles.push({ ...pcar, h: 1.5 });

  // Working traffic lights: a pole at two corners of every intersection, red/green heads that cycle.
  const tlGeos: THREE.BufferGeometry[] = [];
  const tlRed = new THREE.MeshLambertMaterial({ color: 0x3a0000, emissive: 0xff2030, emissiveIntensity: 0.1 });
  const tlGreen = new THREE.MeshLambertMaterial({ color: 0x003a10, emissive: 0x30ff70, emissiveIntensity: 0.1 });
  const tlAmber = new THREE.MeshLambertMaterial({ color: 0x3a2a00, emissive: 0xffb020, emissiveIntensity: 0.1 });
  const heads: { x: number; z: number; axis: 'x' | 'z'; r: THREE.Mesh; a: THREE.Mesh; g: THREE.Mesh }[] = [];
  const lampSphere = new THREE.SphereGeometry(0.14, 8, 6);
  for (const x of roadsX) {
    for (const z of roadsZ) {
      // Two heads per axis, hung from arms over the road.
      for (const [sx, sz, axis] of [[1, 1, 'x'], [-1, -1, 'x'], [1, -1, 'z'], [-1, 1, 'z']] as const) {
        const px = x + sx * (ROAD / 2 - 0.6);
        const pz = z + sz * (ROAD / 2 - 0.6);
        const pole = new THREE.CylinderGeometry(0.09, 0.11, 5.6, 8);
        pole.translate(px, 2.8, pz);
        tlGeos.push(pole);
        const armLen = 4.5;
        const arm = axis === 'x' ? new THREE.BoxGeometry(0.1, 0.1, armLen) : new THREE.BoxGeometry(armLen, 0.1, 0.1);
        const ax = axis === 'x' ? px : px - sx * armLen / 2;
        const az = axis === 'x' ? pz - sz * armLen / 2 : pz;
        arm.translate(ax, 5.55, az);
        tlGeos.push(arm);
        const hx = axis === 'x' ? px : px - sx * armLen * 0.85;
        const hz = axis === 'x' ? pz - sz * armLen * 0.85 : pz;
        const head = new THREE.BoxGeometry(0.36, 1.0, 0.36);
        head.translate(hx, 5.0, hz);
        tlGeos.push(head);
        const mk = (mat: THREE.Material, y: number) => {
          const m = new THREE.Mesh(lampSphere, mat.clone());
          m.position.set(hx + (axis === 'x' ? 0 : 0), y, hz);
          // Face the oncoming traffic on this axis.
          if (axis === 'x') m.position.x += sx * 0.2;
          else m.position.z += sz * 0.2;
          group.add(m);
          return m;
        };
        heads.push({ x, z, axis, r: mk(tlRed, 5.32), a: mk(tlAmber, 5.0), g: mk(tlGreen, 4.68) });
      }
    }
  }
  group.add(new THREE.Mesh(mergeSafe(tlGeos), new THREE.MeshLambertMaterial({ color: 0x1a1a22})));
  const CYCLE = 24;
  const lightXGreen = (x: number, z: number, t: number): boolean => {
    const phase = ((x + z) * 0.013 + t / CYCLE) % 1;
    return phase < 0.5;
  };
  const lightPhase = (x: number, z: number, t: number): 'xg' | 'xa' | 'zg' | 'za' => {
    const phase = ((x + z) * 0.013 + t / CYCLE) % 1;
    if (phase < 0.42) return 'xg';
    if (phase < 0.5) return 'xa';
    if (phase < 0.92) return 'zg';
    return 'za';
  };

  scene.add(group);
  let trainDir = 1;
  const trainVel = new THREE.Vector3();
  const trainRoof = { minX: 0, maxX: 0, minZ: 0, maxZ: 0, y: 0 };
  const trainBox = new THREE.Box3();
  const heightAt = (x: number, z: number, nearY: number): number => {
    let best = 0;
    for (const p of platforms) {
      if (x < p.minX || x > p.maxX || z < p.minZ || z > p.maxZ) continue;
      let y = p.y;
      if (p.ramp) {
        const k = p.ramp.axis === 'x' ? (x - p.minX) / (p.maxX - p.minX) : (z - p.minZ) / (p.maxZ - p.minZ);
        y = p.ramp.y0 + (p.ramp.y1 - p.ramp.y0) * k;
      }
      // Only surfaces you could plausibly be standing on (not far above the player's head).
      if (y <= nearY + 1.2 && y > best) best = y;
    }
    return best;
  };
  return {
    group,
    solids,
    platforms,
    train,
    trainVel,
    trainLen: 4 * 16.6,
    trainRoof,
    heightAt,
    rooftopSpot,
    props,
    obstacles,
    lightXGreen,
    lamps,
    roadsZ,
    roadsX,
    neon,
    update(_t, dt) {
      for (const h of heads) {
        const ph = lightPhase(h.x, h.z, _t);
        const green = h.axis === 'x' ? ph === 'xg' : ph === 'zg';
        const amber = h.axis === 'x' ? ph === 'xa' : ph === 'za';
        (h.r.material as THREE.MeshLambertMaterial).emissiveIntensity = !green && !amber ? 3 : 0.1;
        (h.a.material as THREE.MeshLambertMaterial).emissiveIntensity = amber ? 3 : 0.1;
        (h.g.material as THREE.MeshLambertMaterial).emissiveIntensity = green ? 3 : 0.1;
      }
      // The train slows into the station by the stairs, waits, then pulls away.
      const stationX = stairX - 4 * 16.6 * 0.5;
      const dToStation = Math.abs(train.position.x - stationX);
      let speed = 22;
      if (dToStation < 40 && !(train as any).__left) speed = Math.max(2, (dToStation / 40) * 22);
      if (dToStation < 1.2 && !(train as any).__left) {
        (train as any).__wait = ((train as any).__wait ?? 0) + dt;
        speed = 0;
        if ((train as any).__wait > 8) {
          (train as any).__left = true;
          (train as any).__wait = 0;
        }
      }
      const dx = trainDir * speed * dt;
      train.position.x += dx;
      trainVel.set(dt > 0 ? dx / dt : 0, 0, 0);
      train.updateMatrixWorld(true);
      trainBox.setFromObject(train);
      trainRoof.minX = trainBox.min.x;
      trainRoof.maxX = trainBox.max.x;
      trainRoof.minZ = trainBox.min.z + 0.1;
      trainRoof.maxZ = trainBox.max.z - 0.1;
      trainRoof.y = trainBox.max.y;
      if (train.position.x > CITY_HALF + 160) {
        trainDir = -1;
        (train as any).__left = false;
      }
      if (train.position.x < -CITY_HALF - 220) {
        trainDir = 1;
        (train as any).__left = false;
      }
    },
    setNight(n) {
      for (const m of windowMats) m.emissiveIntensity = n * 1.2;
      shopGlassMat.emissiveIntensity = n * 0.6;
      for (const sf of shopfronts.values()) sf.mat.emissiveIntensity = n * 0.45;
      lampHeadMat.emissiveIntensity = n * 3;
      poolMat.opacity = n * 0.35;
      coneMat.opacity = n * 0.22;
      bulbMat.opacity = n * 0.9;
      puddleMat.opacity = 0.25 + n * 0.4;
      for (const r of skylineRings) (r.material as THREE.MeshBasicMaterial).color.setScalar(1 - n * 0.6);
    },
  };
}

function withShadow<T extends THREE.Mesh>(m: T): T {
  m.castShadow = false;
  m.receiveShadow = false;
  return m;
}
function sidewalkTo(geos: THREE.BufferGeometry[], mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(mergeSafe(geos), mat);
  m.receiveShadow = false;
  m.castShadow = false;
  return m;
}
