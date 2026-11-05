import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../game/rng';
import { asphaltTexture, cobbleTexture, facadeTexture, graffitiTexture, roofTexture, trainTexture, type Facade, type FacadeStyle } from './textures';

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
export interface World {
  group: THREE.Group;
  solids: Box2[];
  lamps: StreetLamp[];
  roadsZ: number[];
  roadsX: number[];
  neon: { mesh: THREE.Mesh; phase: number; base: number }[];
  update(t: number, dt: number): void;
  /** 0 = full day, 1 = night: drives window glow, lamp heads and signs. */
  setNight(n: number): void;
}

type District = 'oldtown' | 'modern' | 'industrial' | 'residential' | 'plaza';

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
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(extent * 2 + 1200, extent * 2 + 1200), new THREE.MeshStandardMaterial({ map: asphalt.map, roughnessMap: asphalt.rough, roughness: 1, metalness: 0.15, color: 0x8a8580 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
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
  const marks = new THREE.Mesh(mergeGeometries(markGeos), new THREE.MeshStandardMaterial({ color: 0xd8d2c8, roughness: 0.7 }));
  marks.receiveShadow = true;
  group.add(marks);

  const cobble = cobbleTexture();
  cobble.repeat.set(0.25, 0.25);
  const sidewalkGeos: THREE.BufferGeometry[] = [];
  const kerbGeos: THREE.BufferGeometry[] = [];
  const buildings = new Map<string, { facade: Facade; geos: THREE.BufferGeometry[] }>();
  const roofGeos: THREE.BufferGeometry[] = [];
  const pitchedGeos: THREE.BufferGeometry[] = [];
  const trimGeos: THREE.BufferGeometry[] = [];
  const darkGeos: THREE.BufferGeometry[] = [];
  const glassGeos: THREE.BufferGeometry[] = [];
  const treeTrunks: THREE.Matrix4[] = [];
  const treeCanopies: THREE.Matrix4[] = [];
  const lampPoleGeos: THREE.BufferGeometry[] = [];
  const lampHeadGeos: THREE.BufferGeometry[] = [];
  const hedgeGeos: THREE.BufferGeometry[] = [];
  const awningGeos: THREE.BufferGeometry[] = [];
  const facadeStyles: Record<District, FacadeStyle[]> = { oldtown: ['plaster', 'plaster', 'brick'], modern: ['glass', 'concrete', 'glass'], industrial: ['industrial', 'brick'], residential: ['plaster', 'concrete', 'brick'], plaza: ['plaster'] };
  const facadeFor = (style: FacadeStyle, variant: number): { key: string; facade: Facade } => {
    const key = `${style}-${variant}`;
    if (!buildings.has(key)) buildings.set(key, { facade: facadeTexture(style, seed * 31 + variant * 7 + style.length), geos: [] });
    return { key, facade: buildings.get(key)!.facade };
  };

  const tree = (x: number, z: number, h: number) => {
    const lean = (rng.next() - 0.5) * 0.1;
    treeTrunks.push(new THREE.Matrix4().compose(new THREE.Vector3(x, h / 2 + 0.3, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, 0, lean)), new THREE.Vector3(1, h, 1)));
    const r = 2.2 + rng.next() * 1.6;
    for (let i = 0; i < 3; i++) {
      treeCanopies.push(new THREE.Matrix4().compose(new THREE.Vector3(x + (rng.next() - 0.5) * r * 0.9, h + 0.3 + i * r * 0.45 + (rng.next() - 0.5), z + (rng.next() - 0.5) * r * 0.9), new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.next() * 3, rng.next() * 3, 0)), new THREE.Vector3(r * (1 - i * 0.2), r * 0.8 * (1 - i * 0.2), r * (1 - i * 0.2))));
    }
  };

  for (let bx = 0; bx < GRID; bx++) {
    for (let bz = 0; bz < GRID; bz++) {
      const cx = -CITY_HALF + bx * CELL + CELL / 2;
      const cz = -CITY_HALF + bz * CELL + CELL / 2;
      const half = BLOCK / 2 + SIDEWALK;
      const district = districtOf(bx, bz);
      const sw = new THREE.BoxGeometry(half * 2, 0.3, half * 2);
      sw.translate(cx, 0.15, cz);
      sidewalkGeos.push(sw);
      const kerb = new THREE.BoxGeometry(half * 2 + 0.3, 0.14, half * 2 + 0.3);
      kerb.translate(cx, 0.08, cz);
      kerbGeos.push(kerb);
      // Lamps at corners.
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        const lx = cx + sx * (half - 1.2);
        const lz = cz + sz * (half - 1.2);
        lamps.push({ x: lx, z: lz });
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
        const cob = new THREE.Mesh(new THREE.BoxGeometry(half * 2, 0.34, half * 2), new THREE.MeshStandardMaterial({ map: cobble, roughness: 0.9 }));
        cob.position.set(cx, 0.17, cz);
        cob.receiveShadow = true;
        group.add(cob);
        const stone = new THREE.MeshStandardMaterial({ color: 0xb9ab95, roughness: 0.85 });
        const gold = new THREE.MeshStandardMaterial({ color: 0xd9a63a, roughness: 0.3, metalness: 0.9 });
        for (let i = 0; i < 3; i++) {
          const step = new THREE.Mesh(new THREE.CylinderGeometry(9 - i * 2, 9.5 - i * 2, 1, 24), stone);
          step.position.set(cx, 0.8 + i, cz);
          step.castShadow = step.receiveShadow = true;
          group.add(step);
        }
        const column = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 2.0, 36, 16), stone);
        column.position.set(cx, 21, cz);
        column.castShadow = true;
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
        const { key, facade } = facadeFor(style, rng.int(0, 1));
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
          // Shop windows: a strip of dark glass.
          const shop = new THREE.BoxGeometry(w - 2, 2.2, d + 0.15);
          shop.translate(lot.x, 2.0, lot.z);
          glassGeos.push(shop);
        }
        // Cornice and roof.
        const cornice = new THREE.BoxGeometry(w + 0.8, 0.6, d + 0.8);
        cornice.translate(lot.x, hgt + 0.3, lot.z);
        trimGeos.push(cornice);
        if (district === 'oldtown' || (district === 'residential' && rng.next() > 0.4)) {
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
          const par = new THREE.BoxGeometry(w + 0.2, 1.1, d + 0.2);
          par.translate(lot.x, hgt + 0.9, lot.z);
          roofGeos.push(par);
          for (let k = 0; k < 2 + rng.int(0, 3); k++) {
            const ac = new THREE.BoxGeometry(2 + rng.next() * 2, 1.4, 2 + rng.next() * 2);
            ac.translate(lot.x + (rng.next() - 0.5) * (w - 6), hgt + 1.3, lot.z + (rng.next() - 0.5) * (d - 6));
            roofGeos.push(ac);
          }
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
      // Street trees along the sidewalk.
      for (let i = 0; i < 4; i++) {
        if (rng.next() > 0.55) tree(cx - half + 1.8, cz - half + 8 + (i * (half * 2 - 16)) / 3, 4 + rng.next() * 2.5);
        if (rng.next() > 0.55) tree(cx + half - 1.8, cz - half + 8 + (i * (half * 2 - 16)) / 3, 4 + rng.next() * 2.5);
      }
    }
  }

  // Merge everything by material.
  group.add(sidewalkTo(sidewalkGeos, new THREE.MeshStandardMaterial({ map: cobble, roughness: 0.9, color: 0xb8b0a4 })));
  group.add(sidewalkTo(kerbGeos, new THREE.MeshStandardMaterial({ color: 0x8a847a, roughness: 0.8 })));
  const windowMats: THREE.MeshStandardMaterial[] = [];
  for (const { facade, geos } of buildings.values()) {
    if (!geos.length) continue;
    const mat = new THREE.MeshStandardMaterial({ map: facade.map, emissiveMap: facade.emissive, emissive: 0xffffff, emissiveIntensity: 0, roughness: facade.roughness, metalness: facade.metalness, color: facade.color });
    windowMats.push(mat);
    const m = new THREE.Mesh(mergeGeometries(geos), mat);
    m.castShadow = true;
    m.receiveShadow = true;
    group.add(m);
  }
  const roofTex = roofTexture();
  roofTex.repeat.set(0.4, 0.4);
  if (pitchedGeos.length) group.add(withShadow(new THREE.Mesh(mergeGeometries(pitchedGeos), new THREE.MeshStandardMaterial({ map: roofTex, roughness: 0.9, color: 0xc08a70 }))));
  if (roofGeos.length) group.add(withShadow(new THREE.Mesh(mergeGeometries(roofGeos), new THREE.MeshStandardMaterial({ color: 0x6a6460, roughness: 0.9 }))));
  if (trimGeos.length) group.add(withShadow(new THREE.Mesh(mergeGeometries(trimGeos), new THREE.MeshStandardMaterial({ color: 0xe6dccb, roughness: 0.8 }))));
  if (darkGeos.length) group.add(withShadow(new THREE.Mesh(mergeGeometries(darkGeos), new THREE.MeshStandardMaterial({ color: 0x4a443f, roughness: 0.85 }))));
  if (awningGeos.length) group.add(withShadow(new THREE.Mesh(mergeGeometries(awningGeos), new THREE.MeshStandardMaterial({ color: 0x8a3a30, roughness: 0.9 }))));
  const shopGlassMat = new THREE.MeshStandardMaterial({ color: 0x141a22, roughness: 0.35, metalness: 0.3, emissive: 0xffd9a0, emissiveIntensity: 0, envMapIntensity: 0.4 });
  if (glassGeos.length) group.add(new THREE.Mesh(mergeGeometries(glassGeos), shopGlassMat));

  // Trees (instanced).
  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.26, 1, 7), new THREE.MeshStandardMaterial({ color: 0x5a4636, roughness: 0.95 }), Math.max(1, treeTrunks.length));
  treeTrunks.forEach((m, i) => trunkMesh.setMatrixAt(i, m));
  trunkMesh.castShadow = true;
  group.add(trunkMesh);
  const canopyMesh = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 1), new THREE.MeshStandardMaterial({ color: 0x4f7a3a, roughness: 0.95, flatShading: true }), Math.max(1, treeCanopies.length));
  const cc = new THREE.Color();
  treeCanopies.forEach((m, i) => {
    canopyMesh.setMatrixAt(i, m);
    canopyMesh.setColorAt(i, cc.setHSL(0.25 + rng.next() * 0.08, 0.45, 0.28 + rng.next() * 0.14));
  });
  canopyMesh.castShadow = quality !== 'battery';
  canopyMesh.receiveShadow = true;
  group.add(canopyMesh);

  // Lamps.
  group.add(withShadow(new THREE.Mesh(mergeGeometries(lampPoleGeos), new THREE.MeshStandardMaterial({ color: 0x2f3236, roughness: 0.5, metalness: 0.6 }))));
  const lampHeadMat = new THREE.MeshStandardMaterial({ color: 0xfff1d6, emissive: 0xffd58a, emissiveIntensity: 0 });
  group.add(new THREE.Mesh(mergeGeometries(lampHeadGeos), lampHeadMat));
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
  void hedgeGeos;

  /* ---------------- parked cars ---------------- */
  const parkedBody = mergeGeometries([new THREE.BoxGeometry(1.8, 0.55, 4.2).translate(0, 0.6, 0), new THREE.BoxGeometry(1.55, 0.5, 2.0).translate(0, 1.12, -0.2)]);
  const parked = new THREE.InstancedMesh(parkedBody, new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.35, metalness: 0.5, clearcoat: 0.6 }), 80);
  const carColors = [0xd9d9d9, 0x2a2a2a, 0x8a1c1c, 0x1f3a6a, 0xc9c0a8, 0x6a6a6a, 0x2f5a3a, 0xffffff, 0x3a3a4a];
  let pc = 0;
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
    pc++;
  }
  parked.count = pc;
  parked.castShadow = true;
  group.add(parked);

  /* ---------------- graffiti wall along one avenue ---------------- */
  const wallX = roadsX[5] + ROAD / 2 + 0.6;
  for (let i = 0; i < 4; i++) {
    const tex = graffitiTexture(seed + i * 13);
    tex.repeat.set(2, 1);
    const seg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 3.2, CELL * 1.5), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 }));
    seg.position.set(wallX, 1.9, -CITY_HALF + 20 + i * CELL * 1.5 + CELL * 0.75);
    seg.castShadow = seg.receiveShadow = true;
    group.add(seg);
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, CELL * 1.5, 10), new THREE.MeshStandardMaterial({ color: 0xa8a39a, roughness: 0.8 }));
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
  const viaduct = new THREE.Mesh(mergeGeometries(viaGeos), new THREE.MeshStandardMaterial({ map: brick.map, roughness: 0.9, color: 0x9a7a6a }));
  viaduct.castShadow = viaduct.receiveShadow = true;
  group.add(viaduct);
  const deck = new THREE.Mesh(new THREE.BoxGeometry(CITY_HALF * 2 + 400, 0.6, 5.2), new THREE.MeshStandardMaterial({ color: 0x6a6460, roughness: 0.9 }));
  deck.position.set(0, 9.6, viaZ);
  deck.receiveShadow = true;
  group.add(deck);
  const rail = new THREE.Mesh(mergeGeometries([new THREE.BoxGeometry(CITY_HALF * 2 + 400, 0.9, 0.1).translate(0, 10.3, viaZ - 2.5), new THREE.BoxGeometry(CITY_HALF * 2 + 400, 0.9, 0.1).translate(0, 10.3, viaZ + 2.5), new THREE.BoxGeometry(CITY_HALF * 2 + 400, 0.08, 0.1).translate(0, 9.95, viaZ - 0.75), new THREE.BoxGeometry(CITY_HALF * 2 + 400, 0.08, 0.1).translate(0, 9.95, viaZ + 0.75)]), new THREE.MeshStandardMaterial({ color: 0x3a3a3a, roughness: 0.6, metalness: 0.6 }));
  group.add(rail);
  const trainTex = trainTexture();
  const train = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const car = new THREE.Mesh(new THREE.BoxGeometry(16, 3.4, 2.9), new THREE.MeshStandardMaterial({ map: trainTex, roughness: 0.5, metalness: 0.2 }));
    car.position.set(i * 16.6, 11.7, 0);
    car.castShadow = true;
    train.add(car);
    const roofM = new THREE.Mesh(new THREE.BoxGeometry(15.6, 0.3, 2.6), new THREE.MeshStandardMaterial({ color: 0xb8b0a0, roughness: 0.7 }));
    roofM.position.set(i * 16.6, 13.5, 0);
    train.add(roofM);
  }
  train.position.set(-CITY_HALF - 120, 0, viaZ);
  group.add(train);
  for (let x = -CITY_HALF; x < CITY_HALF; x += 9) solids.push({ minX: x - 1.1, maxX: x + 1.1, minZ: viaZ - 2.25, maxZ: viaZ + 2.25 });

  /* ---------------- landmarks and horizon ---------------- */
  const tower = new THREE.Group();
  const towerMat = new THREE.MeshStandardMaterial({ color: 0xcfcac2, roughness: 0.6, metalness: 0.2 });
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(3, 9, 260, 16), towerMat);
  shaft.position.y = 130;
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(16, 24, 16), new THREE.MeshStandardMaterial({ color: 0xd8d4cc, roughness: 0.35, metalness: 0.6 }));
  sphere.position.y = 230;
  const needle = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 2, 90, 8), towerMat);
  needle.position.y = 290;
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(1.5, 8, 8), new THREE.MeshStandardMaterial({ color: 0xff2030, emissive: 0xff2030, emissiveIntensity: 2 }));
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
  const farMat = new THREE.MeshStandardMaterial({ map: farFacade.map, emissiveMap: farFacade.emissive, emissive: 0xffffff, emissiveIntensity: 0, color: 0xa09890, roughness: 0.9 });
  windowMats.push(farMat);
  group.add(new THREE.Mesh(mergeGeometries(farGeos), farMat));
  // A few distant spires and a dome.
  for (let i = 0; i < 6; i++) {
    const a = rng.next() * Math.PI * 2;
    const r = CITY_HALF + 200 + rng.next() * 200;
    const spire = new THREE.Mesh(new THREE.ConeGeometry(6, 60 + rng.next() * 50, 8), towerMat);
    spire.position.set(Math.cos(a) * r, 60, Math.sin(a) * r);
    group.add(spire);
  }
  const dome = new THREE.Mesh(new THREE.SphereGeometry(28, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5f8a6a, roughness: 0.6, metalness: 0.4 }));
  dome.position.set(-CITY_HALF - 160, 40, -80);
  const domeBase = new THREE.Mesh(new THREE.BoxGeometry(90, 40, 70), new THREE.MeshStandardMaterial({ map: facadeFor('plaster', 0).facade.map, roughness: 0.9 }));
  domeBase.position.set(-CITY_HALF - 160, 20, -80);
  group.add(dome, domeBase);

  scene.add(group);
  let trainDir = 1;
  return {
    group,
    solids,
    lamps,
    roadsZ,
    roadsX,
    neon,
    update(_t, dt) {
      train.position.x += trainDir * 22 * dt;
      if (train.position.x > CITY_HALF + 160) trainDir = -1;
      if (train.position.x < -CITY_HALF - 220) trainDir = 1;
    },
    setNight(n) {
      for (const m of windowMats) m.emissiveIntensity = n * 1.2;
      shopGlassMat.emissiveIntensity = n * 0.6;
      lampHeadMat.emissiveIntensity = n * 3;
      poolMat.opacity = n * 0.35;
    },
  };
}

function withShadow<T extends THREE.Mesh>(m: T): T {
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}
function sidewalkTo(geos: THREE.BufferGeometry[], mat: THREE.Material): THREE.Mesh {
  const m = new THREE.Mesh(mergeGeometries(geos), mat);
  m.receiveShadow = true;
  m.castShadow = true;
  return m;
}
