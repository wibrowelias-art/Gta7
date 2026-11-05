import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Rng } from '../game/rng';

/** City layout constants (metres). */
export const BLOCK = 64; // building block edge
export const ROAD = 18; // road width (two lanes each way + gutters)
export const CELL = BLOCK + ROAD; // pitch of the grid
export const GRID = 7; // blocks per side
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
  /** Solid obstacles (buildings, props) for collision. */
  solids: Box2[];
  lamps: StreetLamp[];
  /** Road centre lines along X (z coords) and along Z (x coords). */
  roadsZ: number[];
  roadsX: number[];
  neon: { mesh: THREE.Mesh; phase: number; base: number }[];
  update(t: number, dt: number): void;
}

const NEON_WORDS = ['SUNSET', 'MOTEL', 'DINER', 'NOODLE BAR', 'PALM LOUNGE', 'TATTOO', 'ARCADE', 'HOTEL', 'LIQUOR', 'VINYL', 'CLUB 88', 'RAMEN', 'TAXI', 'OPEN 24H', 'GYM', 'CINEMA', 'PAWN', 'SUSHI', 'MOTOR', 'PIZZA'];
const NEON_COLORS = [0xff3d8b, 0xff8a3d, 0xffc857, 0x2ee6c8, 0x3fd0ff, 0x8b5cf6, 0x3dff8f];

/* ---------------- textures ---------------- */

function windowTexture(rng: Rng, variant: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 512;
  const g = c.getContext('2d')!;
  const bases = ['#1a1424', '#141a24', '#1e1620', '#101418'];
  g.fillStyle = bases[variant % bases.length];
  g.fillRect(0, 0, c.width, c.height);
  // Subtle concrete noise.
  for (let i = 0; i < 1800; i++) {
    g.fillStyle = `rgba(255,255,255,${(rng.next() * 0.05).toFixed(3)})`;
    g.fillRect(rng.next() * 256, rng.next() * 512, 2, 2);
  }
  const cols = 10 + variant * 2;
  const rows = 28;
  const cw = 256 / cols;
  const rh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    for (let col = 0; col < cols; col++) {
      const on = rng.next() > 0.42;
      const x = col * cw + cw * 0.2;
      const y = r * rh + rh * 0.22;
      const w = cw * 0.6;
      const h = rh * 0.56;
      if (col === 0) {
        // Floor band.
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.fillRect(0, r * rh, 256, 2);
      }
      if (on) {
        const warm = rng.next();
        g.fillStyle = warm > 0.65 ? '#ffd9a0' : warm > 0.35 ? '#fff4ec' : warm > 0.15 ? '#9fd8ff' : '#ff9ecb';
        g.globalAlpha = 0.55 + rng.next() * 0.45;
        g.fillRect(x, y, w, h);
        g.globalAlpha = 1;
        // Blinds / interior detail.
        if (rng.next() > 0.6) {
          g.fillStyle = 'rgba(0,0,0,0.35)';
          g.fillRect(x, y + h * 0.5, w, h * 0.5);
        }
      } else {
        g.fillStyle = '#0b0a12';
        g.fillRect(x, y, w, h);
        g.fillStyle = 'rgba(120,150,200,0.12)';
        g.fillRect(x, y, w, h * 0.3);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}

function emissiveMaskTexture(src: THREE.CanvasTexture): THREE.CanvasTexture {
  // Emissive map: only lit windows glow.
  const srcCanvas = src.image as HTMLCanvasElement;
  const c = document.createElement('canvas');
  c.width = srcCanvas.width;
  c.height = srcCanvas.height;
  const g = c.getContext('2d')!;
  g.drawImage(srcCanvas, 0, 0);
  const img = g.getImageData(0, 0, c.width, c.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const lum = (d[i] + d[i + 1] + d[i + 2]) / 3;
    if (lum < 90) {
      d[i] = d[i + 1] = d[i + 2] = 0;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

function neonTexture(text: string, color: number): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 512, 128);
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  g.font = '700 72px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = hex;
  g.shadowBlur = 24;
  g.lineWidth = 6;
  g.strokeStyle = hex;
  g.strokeText(text, 256, 64);
  g.shadowBlur = 0;
  g.fillStyle = '#fff4ec';
  g.fillText(text, 256, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function asphaltTextures(rng: Rng): { map: THREE.CanvasTexture; rough: THREE.CanvasTexture } {
  const c = document.createElement('canvas');
  c.width = c.height = 512;
  const g = c.getContext('2d')!;
  g.fillStyle = '#17141c';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 20000; i++) {
    const v = 20 + rng.next() * 30;
    g.fillStyle = `rgb(${v},${v - 2},${v + 4})`;
    g.fillRect(rng.next() * 512, rng.next() * 512, 1.5, 1.5);
  }
  // Oil stains / patches.
  for (let i = 0; i < 14; i++) {
    const x = rng.next() * 512;
    const y = rng.next() * 512;
    const r = 20 + rng.next() * 60;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(0,0,0,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = 8;
  // Roughness: wet puddles are smooth (dark), dry patches rough (light).
  const r = document.createElement('canvas');
  r.width = r.height = 512;
  const rg = r.getContext('2d')!;
  rg.fillStyle = '#9a9a9a';
  rg.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 26; i++) {
    const x = rng.next() * 512;
    const y = rng.next() * 512;
    const rad = 30 + rng.next() * 90;
    const grad = rg.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, 'rgba(30,30,30,1)');
    grad.addColorStop(0.7, 'rgba(60,60,60,0.8)');
    grad.addColorStop(1, 'rgba(154,154,154,0)');
    rg.fillStyle = grad;
    rg.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  const rough = new THREE.CanvasTexture(r);
  rough.wrapS = rough.wrapT = THREE.RepeatWrapping;
  return { map, rough };
}

function palmLeafTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 256;
  const g = c.getContext('2d')!;
  g.clearRect(0, 0, 256, 256);
  g.translate(128, 128);
  for (let i = 0; i < 9; i++) {
    g.save();
    g.rotate((i / 9) * Math.PI * 2);
    g.fillStyle = i % 2 ? '#1f5a3a' : '#2a7a4a';
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(14, -40, 2, -118);
    g.quadraticCurveTo(-14, -40, 0, 0);
    g.fill();
    g.restore();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/* ---------------- world builder ---------------- */

export function buildWorld(scene: THREE.Scene, seed = 7, quality: 'high' | 'balanced' | 'battery' = 'balanced'): World {
  const rng = new Rng(seed);
  const group = new THREE.Group();
  const solids: Box2[] = [];
  const lamps: StreetLamp[] = [];
  const neon: World['neon'] = [];
  const roadsZ: number[] = [];
  const roadsX: number[] = [];
  const extent = CITY_HALF + ROAD / 2;

  // Ground: asphalt everywhere (sidewalks are raised slabs on top).
  const asphalt = asphaltTextures(rng);
  asphalt.map.repeat.set(60, 60);
  asphalt.rough.repeat.set(60, 60);
  const groundMat = new THREE.MeshStandardMaterial({ map: asphalt.map, roughnessMap: asphalt.rough, roughness: 1, metalness: 0.45, color: 0x5a5466, envMapIntensity: 0.7 });
  const poolTex = radialSpriteTexture();
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(extent * 2 + 400, extent * 2 + 400), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  // Road centre lines.
  for (let i = 0; i <= GRID; i++) {
    const v = -CITY_HALF + i * CELL;
    roadsZ.push(v);
    roadsX.push(v);
  }

  // Lane markings: merged emissive boxes.
  const markGeos: THREE.BufferGeometry[] = [];
  const dash = (x: number, z: number, len: number, alongX: boolean, w = 0.16) => {
    const g = new THREE.BoxGeometry(alongX ? len : w, 0.02, alongX ? w : len);
    g.translate(x, 0.011, z);
    markGeos.push(g);
  };
  for (const z of roadsZ) {
    for (let x = -extent; x < extent; x += 6) {
      if (roadsX.some((rx) => Math.abs(rx - x) < ROAD / 2 + 3)) continue; // skip intersections
      dash(x + 1.5, z, 3, true, 0.18); // centre dashes
    }
    // Edge lines.
    const eg1 = new THREE.BoxGeometry(extent * 2, 0.02, 0.14);
    eg1.translate(0, 0.011, z + ROAD / 2 - SIDEWALK - 0.4);
    const eg2 = eg1.clone();
    eg2.translate(0, 0, -(ROAD - SIDEWALK * 2 - 0.8));
    markGeos.push(eg1, eg2);
  }
  for (const x of roadsX) {
    for (let z = -extent; z < extent; z += 6) {
      if (roadsZ.some((rz) => Math.abs(rz - z) < ROAD / 2 + 3)) continue;
      dash(x, z + 1.5, 3, false, 0.18);
    }
    const eg1 = new THREE.BoxGeometry(0.14, 0.02, extent * 2);
    eg1.translate(x + ROAD / 2 - SIDEWALK - 0.4, 0.011, 0);
    const eg2 = eg1.clone();
    eg2.translate(-(ROAD - SIDEWALK * 2 - 0.8), 0, 0);
    markGeos.push(eg1, eg2);
  }
  // Crosswalk stripes at every intersection.
  for (const x of roadsX) {
    for (const z of roadsZ) {
      for (let i = -3; i <= 3; i++) {
        const off = i * 1.2;
        for (const side of [-1, 1]) {
          const gz = new THREE.BoxGeometry(0.6, 0.02, 2.4);
          gz.translate(x + off, 0.012, z + side * (ROAD / 2 - SIDEWALK - 1.8));
          const gx = new THREE.BoxGeometry(2.4, 0.02, 0.6);
          gx.translate(x + side * (ROAD / 2 - SIDEWALK - 1.8), 0.012, z + off);
          markGeos.push(gz, gx);
        }
      }
    }
  }
  const markMat = new THREE.MeshStandardMaterial({ color: 0xbdb6b0, emissive: 0x4a4440, emissiveIntensity: 0.12, roughness: 0.55, metalness: 0.2 });
  const marks = new THREE.Mesh(mergeGeometries(markGeos), markMat);
  marks.receiveShadow = true;
  group.add(marks);

  // Blocks: sidewalk slab + buildings.
  const windowTex = [0, 1, 2, 3].map((v) => windowTexture(rng, v));
  const emissiveTex = windowTex.map((t) => emissiveMaskTexture(t));
  const buildingGeos: THREE.BufferGeometry[][] = [[], [], [], []];
  const sidewalkGeos: THREE.BufferGeometry[] = [];
  const kerbGeos: THREE.BufferGeometry[] = [];
  const hedgeGeos: THREE.BufferGeometry[] = [];
  const roofGeos: THREE.BufferGeometry[] = [];
  const leafTex = palmLeafTexture();
  const palmTrunks: THREE.Matrix4[] = [];
  const palmLeaves: THREE.Matrix4[] = [];
  const lampPoleGeos: THREE.BufferGeometry[] = [];
  const lampHeadGeos: THREE.BufferGeometry[] = [];

  for (let bx = 0; bx < GRID; bx++) {
    for (let bz = 0; bz < GRID; bz++) {
      const cx = -CITY_HALF + bx * CELL + CELL / 2;
      const cz = -CITY_HALF + bz * CELL + CELL / 2;
      const half = BLOCK / 2 + SIDEWALK;
      // Sidewalk slab.
      const sw = new THREE.BoxGeometry(half * 2, 0.3, half * 2);
      sw.translate(cx, 0.15, cz);
      sidewalkGeos.push(sw);
      const kerb = new THREE.BoxGeometry(half * 2 + 0.3, 0.12, half * 2 + 0.3);
      kerb.translate(cx, 0.08, cz);
      kerbGeos.push(kerb);
      // Kerb lights/trim handled by emissive edge later.
      const isPark = bx === 3 && bz === 3;
      if (isPark) {
        // Central plaza with palms and a fountain.
        for (let i = 0; i < 14; i++) {
          const a = (i / 14) * Math.PI * 2;
          const r = 16 + (i % 2) * 8;
          palm(cx + Math.cos(a) * r, cz + Math.sin(a) * r, 7 + rng.next() * 4, rng, palmTrunks, palmLeaves);
        }
        const fountain = new THREE.Mesh(new THREE.CylinderGeometry(6, 7, 1.2, 24), new THREE.MeshStandardMaterial({ color: 0x3a3450, roughness: 0.4, metalness: 0.3 }));
        fountain.position.set(cx, 0.9, cz);
        fountain.castShadow = true;
        fountain.receiveShadow = true;
        group.add(fountain);
        const water = new THREE.Mesh(new THREE.CircleGeometry(5.6, 24), new THREE.MeshStandardMaterial({ color: 0x1f6f8f, roughness: 0.05, metalness: 0.6, emissive: 0x0b3a4a, emissiveIntensity: 0.6 }));
        water.rotation.x = -Math.PI / 2;
        water.position.set(cx, 1.52, cz);
        group.add(water);
        solids.push({ minX: cx - 7, maxX: cx + 7, minZ: cz - 7, maxZ: cz + 7 });
        continue;
      }
      // The block interior (between buildings) is fenced off with a hedge so cars stay on the streets.
      const inner = BLOCK / 2 - 2;
      solids.push({ minX: cx - inner - 1, maxX: cx + inner + 1, minZ: cz - inner - 1, maxZ: cz + inner + 1 });
      for (const [hx, hz, hw, hd] of [[cx, cz - inner - 1, inner * 2 + 2, 0.8], [cx, cz + inner + 1, inner * 2 + 2, 0.8], [cx - inner - 1, cz, 0.8, inner * 2 + 2], [cx + inner + 1, cz, 0.8, inner * 2 + 2]] as const) {
        const hedge = new THREE.BoxGeometry(hw, 0.9, hd);
        hedge.translate(hx, 0.75, hz);
        hedgeGeos.push(hedge);
      }
      // Subdivide the block into 2-4 lots.
      const lots: { x: number; z: number; w: number; d: number }[] = [];
      const split = rng.next();
      if (split < 0.3) lots.push({ x: cx, z: cz, w: inner * 2, d: inner * 2 });
      else if (split < 0.6) {
        lots.push({ x: cx - inner / 2, z: cz, w: inner, d: inner * 2 });
        lots.push({ x: cx + inner / 2, z: cz, w: inner, d: inner * 2 });
      } else {
        for (const sx of [-1, 1]) for (const sz of [-1, 1]) lots.push({ x: cx + (sx * inner) / 2, z: cz + (sz * inner) / 2, w: inner, d: inner });
      }
      for (const lot of lots) {
        const w = lot.w - 3 - rng.next() * 4;
        const d = lot.d - 3 - rng.next() * 4;
        const dist = Math.hypot(bx - GRID / 2 + 0.5, bz - GRID / 2 + 0.5);
        const hgt = 14 + rng.next() * (lots.length === 1 ? 150 : 90) * Math.max(0.35, 1 - dist / 5) + rng.next() * 20;
        const variant = rng.int(0, 3);
        const geo = new THREE.BoxGeometry(w, hgt, d);
        // UVs: windows repeat by size (3.2 m per column, 4 m per floor).
        const uv = geo.attributes.uv as THREE.BufferAttribute;
        const pos = geo.attributes.position as THREE.BufferAttribute;
        for (let i = 0; i < uv.count; i++) {
          const px = pos.getX(i);
          const pz = pos.getZ(i);
          const py = pos.getY(i);
          const u = (Math.abs(px) > w / 2 - 1e-3 ? pz : px) / 14 + 0.5;
          uv.setXY(i, u, (py + hgt / 2) / 60);
        }
        geo.translate(lot.x, hgt / 2 + 0.3, lot.z);
        buildingGeos[variant].push(geo);
        solids.push({ minX: lot.x - w / 2, maxX: lot.x + w / 2, minZ: lot.z - d / 2, maxZ: lot.z + d / 2 });
        // Rooftop: parapet, AC units, antenna, water tank.
        const par = new THREE.BoxGeometry(w + 0.6, 1.2, d + 0.6);
        par.translate(lot.x, hgt + 0.3, lot.z);
        roofGeos.push(par);
        for (let k = 0; k < 2 + rng.int(0, 3); k++) {
          const ac = new THREE.BoxGeometry(2 + rng.next() * 2, 1.5, 2 + rng.next() * 2);
          ac.translate(lot.x + (rng.next() - 0.5) * (w - 6), hgt + 1.2, lot.z + (rng.next() - 0.5) * (d - 6));
          roofGeos.push(ac);
        }
        if (rng.next() > 0.5) {
          const ant = new THREE.CylinderGeometry(0.15, 0.25, 8 + rng.next() * 10, 6);
          ant.translate(lot.x + (rng.next() - 0.5) * (w - 4), hgt + 5, lot.z + (rng.next() - 0.5) * (d - 4));
          roofGeos.push(ant);
        }
        // Neon sign on the street-facing facade near the ground, sometimes a vertical one.
        if (rng.next() > 0.2) {
          const word = rng.pick(NEON_WORDS);
          const color = rng.pick(NEON_COLORS);
          const tex = neonTexture(word, color);
          const sign = new THREE.Mesh(new THREE.PlaneGeometry(12, 3), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
          const side = rng.int(0, 3);
          const y = 4 + rng.next() * 6;
          if (side === 0) sign.position.set(lot.x, y, lot.z + d / 2 + 0.3);
          else if (side === 1) {
            sign.position.set(lot.x, y, lot.z - d / 2 - 0.3);
            sign.rotation.y = Math.PI;
          } else if (side === 2) {
            sign.position.set(lot.x + w / 2 + 0.3, y, lot.z);
            sign.rotation.y = Math.PI / 2;
          } else {
            sign.position.set(lot.x - w / 2 - 0.3, y, lot.z);
            sign.rotation.y = -Math.PI / 2;
          }
          group.add(sign);
          neon.push({ mesh: sign, phase: rng.next() * 10, base: 1 });
          // Glow light under the sign on the facade.
          const glow = new THREE.Mesh(new THREE.PlaneGeometry(12, 6), new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending }));
          glow.position.copy(sign.position);
          glow.rotation.copy(sign.rotation);
          glow.translateZ(-0.1);
          group.add(glow);
        }
        // Ground floor: dark glass shopfront with a thin neon trim and a couple of awnings.
        const trimColor = rng.pick(NEON_COLORS);
        const shop = new THREE.Mesh(new THREE.BoxGeometry(w + 0.1, 3.4, d + 0.1), new THREE.MeshPhysicalMaterial({ color: 0x0c0a14, roughness: 0.08, metalness: 0.8, emissive: 0x2a1a3a, emissiveIntensity: 0.35, envMapIntensity: 1.4 }));
        shop.position.set(lot.x, 2.0, lot.z);
        group.add(shop);
        const trim = new THREE.Mesh(new THREE.BoxGeometry(w + 0.3, 0.12, d + 0.3), new THREE.MeshStandardMaterial({ color: trimColor, emissive: trimColor, emissiveIntensity: 2.2 }));
        trim.position.set(lot.x, 3.75, lot.z);
        group.add(trim);
        const pool = new THREE.Mesh(new THREE.PlaneGeometry(w + 6, d + 6), new THREE.MeshBasicMaterial({ map: poolTex, color: trimColor, transparent: true, opacity: 0.09, blending: THREE.AdditiveBlending, depthWrite: false }));
        pool.rotation.x = -Math.PI / 2;
        pool.position.set(lot.x, 0.33, lot.z);
        group.add(pool);
        for (let k = 0; k < 2; k++) {
          if (rng.next() < 0.5) continue;
          const aw = new THREE.Mesh(new THREE.BoxGeometry(4, 0.12, 1.6), new THREE.MeshStandardMaterial({ color: rng.pick(NEON_COLORS), roughness: 0.9 }));
          const side = rng.chance(0.5) ? 1 : -1;
          aw.position.set(lot.x + (rng.next() - 0.5) * (w - 6), 3.1, lot.z + side * (d / 2 + 0.8));
          aw.rotation.x = side * 0.25;
          group.add(aw);
        }
      }
      // Palms along two edges of the block.
      for (let i = 0; i < 3; i++) {
        if (rng.next() > 0.5) palm(cx - half + 2, cz - half + 8 + i * (half * 2 - 16) / 2, 6 + rng.next() * 3, rng, palmTrunks, palmLeaves);
        if (rng.next() > 0.5) palm(cx + half - 2, cz - half + 8 + i * (half * 2 - 16) / 2, 6 + rng.next() * 3, rng, palmTrunks, palmLeaves);
      }
      // Street lamps at block corners (on the sidewalk).
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          const lx = cx + sx * (half - 1);
          const lz = cz + sz * (half - 1);
          lamps.push({ x: lx, z: lz });
          const pole = new THREE.CylinderGeometry(0.12, 0.18, 7, 8);
          pole.translate(lx, 3.8, lz);
          lampPoleGeos.push(pole);
          const arm = new THREE.BoxGeometry(2.4, 0.16, 0.16);
          arm.translate(lx - sx * 1.1, 7.2, lz);
          lampPoleGeos.push(arm);
          const head = new THREE.BoxGeometry(1.2, 0.3, 0.5);
          head.translate(lx - sx * 2.2, 7.05, lz);
          lampHeadGeos.push(head);
        }
      }
    }
  }

  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x2a2634, roughness: 0.8, metalness: 0.1 });
  const sidewalks = new THREE.Mesh(mergeGeometries(sidewalkGeos), sidewalkMat);
  sidewalks.receiveShadow = true;
  sidewalks.castShadow = true;
  group.add(sidewalks);
  group.add(new THREE.Mesh(mergeGeometries(kerbGeos), new THREE.MeshStandardMaterial({ color: 0x5a5468, roughness: 0.7 })));
  const hedges = new THREE.Mesh(mergeGeometries(hedgeGeos), new THREE.MeshStandardMaterial({ color: 0x1f4a33, roughness: 0.95 }));
  hedges.castShadow = true;
  hedges.receiveShadow = true;
  group.add(hedges);

  // Parked cars along the kerbs (instanced, cheap).
  const parkedBody = mergeGeometries([new THREE.BoxGeometry(1.9, 0.6, 4.2).translate(0, 0.62, 0), new THREE.BoxGeometry(1.6, 0.55, 2).translate(0, 1.2, -0.2)]);
  const parkedMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.3, metalness: 0.6, clearcoat: 0.8 });
  const parkedCount = 70;
  const parked = new THREE.InstancedMesh(parkedBody, parkedMat, parkedCount);
  const pm = new THREE.Matrix4();
  const pc = new THREE.Color();
  for (let i = 0; i < parkedCount; i++) {
    const alongX = rng.chance(0.5);
    const road = alongX ? rng.pick(roadsZ) : rng.pick(roadsX);
    const along = rng.range(-CITY_HALF + 12, CITY_HALF - 12);
    const side = rng.chance(0.5) ? 1 : -1;
    const off = road + side * (ROAD / 2 - SIDEWALK - 1.3);
    const x = alongX ? along : off;
    const z = alongX ? off : along;
    if (roadsX.some((rx) => Math.abs(rx - x) < 12) && roadsZ.some((rz) => Math.abs(rz - z) < 12)) continue;
    pm.compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, alongX ? Math.PI / 2 : 0, 0)), new THREE.Vector3(1, 1, 1));
    parked.setMatrixAt(i, pm);
    parked.setColorAt(i, pc.setHex(NEON_COLORS[rng.int(0, NEON_COLORS.length - 1)]).multiplyScalar(0.7));
    solids.push({ minX: x - 1, maxX: x + 1, minZ: z - 1, maxZ: z + 1 });
  }
  parked.castShadow = true;
  group.add(parked);

  // Traffic lights at intersections (cosmetic, cycling).
  const tlGeos: THREE.BufferGeometry[] = [];
  const tlLights: { mesh: THREE.Mesh; phase: number }[] = [];
  const tlMatR = new THREE.MeshStandardMaterial({ color: 0x330000, emissive: 0xff2030, emissiveIntensity: 3 });
  const tlMatG = new THREE.MeshStandardMaterial({ color: 0x003300, emissive: 0x30ff70, emissiveIntensity: 3 });
  for (const x of roadsX) {
    for (const z of roadsZ) {
      for (const [sx, sz] of [[1, 1], [-1, -1]] as const) {
        const px = x + sx * (ROAD / 2 - 1);
        const pz = z + sz * (ROAD / 2 - 1);
        const pole = new THREE.CylinderGeometry(0.1, 0.12, 5, 6);
        pole.translate(px, 2.5, pz);
        tlGeos.push(pole);
        const arm = new THREE.BoxGeometry(0.12, 0.12, 5);
        arm.translate(px, 5, pz - sz * 2.5);
        tlGeos.push(arm);
        const head = new THREE.BoxGeometry(0.4, 1.0, 0.4);
        head.translate(px, 4.5, pz - sz * 4.8);
        tlGeos.push(head);
        const r = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), tlMatR);
        r.position.set(px + sx * 0.22, 4.78, pz - sz * 4.8);
        const gl = new THREE.Mesh(new THREE.SphereGeometry(0.13, 8, 6), tlMatG);
        gl.position.set(px + sx * 0.22, 4.22, pz - sz * 4.8);
        group.add(r, gl);
        tlLights.push({ mesh: r, phase: (x + z) * 0.01 }, { mesh: gl, phase: (x + z) * 0.01 + Math.PI });
      }
    }
  }
  group.add(new THREE.Mesh(mergeGeometries(tlGeos), new THREE.MeshStandardMaterial({ color: 0x1a1a22, roughness: 0.5, metalness: 0.6 })));

  // Billboards on a few tall facades.
  for (let i = 0; i < 10; i++) {
    const word = rng.pick(['DRINK NEON', 'SUNSET RADIO 98.8', 'PALM MOTORS', 'NIGHT MARKET', 'ROOFTOP POOL', 'VINYL DISTRICT']);
    const color = rng.pick(NEON_COLORS);
    const tex = neonTexture(word, color);
    const bb = new THREE.Mesh(new THREE.PlaneGeometry(26, 7), new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.DoubleSide, depthWrite: false }));
    const bx = rng.int(0, GRID - 1);
    const bz = rng.int(0, GRID - 1);
    const cx = -CITY_HALF + bx * CELL + CELL / 2;
    const cz = -CITY_HALF + bz * CELL + CELL / 2;
    const side = rng.chance(0.5) ? 1 : -1;
    bb.position.set(cx, 26 + rng.next() * 30, cz + side * (BLOCK / 2 + 0.6));
    bb.rotation.y = side > 0 ? 0 : Math.PI;
    const frame = new THREE.Mesh(new THREE.BoxGeometry(27, 8, 0.4), new THREE.MeshStandardMaterial({ color: 0x1e1729, emissive: color, emissiveIntensity: 0.15 }));
    frame.position.copy(bb.position);
    frame.rotation.copy(bb.rotation);
    frame.translateZ(-0.3);
    group.add(frame, bb);
    neon.push({ mesh: bb, phase: rng.next() * 10, base: 1 });
  }

  buildingGeos.forEach((geos, i) => {
    if (!geos.length) return;
    const glassy = i === 3;
    const mat = new THREE.MeshStandardMaterial({ map: windowTex[i], emissiveMap: emissiveTex[i], emissive: 0xffffff, emissiveIntensity: glassy ? 0.9 : 1.1, roughness: glassy ? 0.25 : 0.6, metalness: glassy ? 0.7 : 0.2, color: glassy ? 0x8aa0c8 : 0x7a7290, envMapIntensity: glassy ? 1.2 : 0.4 });
    const mesh = new THREE.Mesh(mergeGeometries(geos), mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  });
  const roof = new THREE.Mesh(mergeGeometries(roofGeos), new THREE.MeshStandardMaterial({ color: 0x2a2436, roughness: 0.8 }));
  roof.castShadow = true;
  group.add(roof);

  // Palms (instanced).
  const trunkMesh = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.18, 0.32, 1, 7), new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.9 }), palmTrunks.length);
  palmTrunks.forEach((m, i) => trunkMesh.setMatrixAt(i, m));
  trunkMesh.castShadow = true;
  group.add(trunkMesh);
  const leafMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(7, 7), new THREE.MeshStandardMaterial({ map: leafTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.8, color: 0x7fb08a }), palmLeaves.length);
  palmLeaves.forEach((m, i) => leafMesh.setMatrixAt(i, m));
  leafMesh.castShadow = quality !== 'battery';
  group.add(leafMesh);

  // Lamps.
  const poles = new THREE.Mesh(mergeGeometries(lampPoleGeos), new THREE.MeshStandardMaterial({ color: 0x2a2a34, roughness: 0.5, metalness: 0.7 }));
  poles.castShadow = true;
  group.add(poles);
  const heads = new THREE.Mesh(mergeGeometries(lampHeadGeos), new THREE.MeshStandardMaterial({ color: 0xffe6b0, emissive: 0xffd58a, emissiveIntensity: 3 }));
  group.add(heads);
  // Light pools on the ground under each lamp (cheap, additive) and cone sprites.
  const poolGeo = new THREE.PlaneGeometry(14, 14);
  const poolMat = new THREE.MeshBasicMaterial({ map: poolTex, color: 0xffd58a, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false });
  const pools = new THREE.InstancedMesh(poolGeo, poolMat, lamps.length);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));
  lamps.forEach((l, i) => {
    const sx = l.x < 0 ? 1 : -1; // arm points toward the road
    void sx;
    const ax = l.x + (Math.sign(-(l.x % CELL)) || 1) * 0; // keep under head approx
    m.compose(new THREE.Vector3(ax, 0.32, l.z), q, new THREE.Vector3(1, 1, 1));
    pools.setMatrixAt(i, m);
  });
  group.add(pools);

  // Sky dome, stars, moon.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(1400, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: { top: { value: new THREE.Color(0x0a0716) }, mid: { value: new THREE.Color(0x3a1548) }, hor: { value: new THREE.Color(0xff6a4d) } },
      vertexShader: `varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `uniform vec3 top; uniform vec3 mid; uniform vec3 hor; varying vec3 vP; void main(){ float h = clamp(vP.y, 0.0, 1.0); vec3 c = mix(hor, mid, smoothstep(0.0, 0.18, h)); c = mix(c, top, smoothstep(0.18, 0.7, h)); gl_FragColor = vec4(c, 1.0); }`,
    }),
  );
  group.add(sky);
  const starGeo = new THREE.BufferGeometry();
  const starPos: number[] = [];
  for (let i = 0; i < 900; i++) {
    const a = rng.next() * Math.PI * 2;
    const e = 0.12 + rng.next() * 0.8;
    starPos.push(Math.cos(a) * Math.cos(e) * 1300, Math.sin(e) * 1300, Math.sin(a) * Math.cos(e) * 1300);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
  group.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xfff4ec, size: 2.2, sizeAttenuation: false, transparent: true, opacity: 0.8 })));
  const moon = new THREE.Mesh(new THREE.SphereGeometry(28, 24, 16), new THREE.MeshBasicMaterial({ color: 0xfff1dc }));
  moon.position.set(-600, 420, -900);
  group.add(moon);
  const moonGlow = new THREE.Sprite(new THREE.SpriteMaterial({ map: poolTex, color: 0xffd0a0, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
  moonGlow.position.copy(moon.position);
  moonGlow.scale.set(260, 260, 1);
  group.add(moonGlow);
  // Distant skyline silhouettes ring the playable city.
  const farGeos: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 160; i++) {
    const a = (i / 160) * Math.PI * 2 + rng.next() * 0.03;
    const r = CITY_HALF + 120 + rng.next() * 260;
    const w = 20 + rng.next() * 40;
    const h = 40 + rng.next() * 220;
    const g = new THREE.BoxGeometry(w, h, w);
    g.translate(Math.cos(a) * r, h / 2, Math.sin(a) * r);
    farGeos.push(g);
  }
  const far = new THREE.Mesh(mergeGeometries(farGeos), new THREE.MeshStandardMaterial({ map: windowTex[1], emissiveMap: emissiveTex[1], emissive: 0xffffff, emissiveIntensity: 0.8, color: 0x3a3048, roughness: 0.9 }));
  (far.material as THREE.MeshStandardMaterial).map!.repeat.set(1, 1);
  group.add(far);

  scene.add(group);
  return {
    group,
    solids,
    lamps,
    roadsZ,
    roadsX,
    neon,
    update(t) {
      for (const l of tlLights) {
        const on = Math.sin(t * 0.5 + l.phase) > 0;
        (l.mesh.material as THREE.MeshStandardMaterial).emissiveIntensity = on ? 3 : 0.1;
        l.mesh.visible = true;
      }
      for (const n of neon) {
        const flick = 0.75 + 0.25 * Math.sin(t * 6 + n.phase) + (Math.sin(t * 31 + n.phase * 7) > 0.985 ? -0.6 : 0);
        (n.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0.15, flick);
      }
    },
  };
}

function palm(x: number, z: number, h: number, rng: Rng, trunks: THREE.Matrix4[], leaves: THREE.Matrix4[]): void {
  const lean = (rng.next() - 0.5) * 0.25;
  const t = new THREE.Matrix4().compose(new THREE.Vector3(x, h / 2 + 0.3, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(lean, 0, (rng.next() - 0.5) * 0.25)), new THREE.Vector3(1, h, 1));
  trunks.push(t);
  for (let i = 0; i < 2; i++) {
    const l = new THREE.Matrix4().compose(new THREE.Vector3(x + lean * h * 0.4, h + 0.3 + i * 0.4, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2 + (rng.next() - 0.5) * 0.3, 0, rng.next() * Math.PI)), new THREE.Vector3(1, 1, 1));
    leaves.push(l);
  }
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

/** Nearest road lane position for a point: returns a snapped lane centre and direction. */
export function nearestLane(x: number, z: number, roadsX: number[], roadsZ: number[]): { x: number; z: number; dir: THREE.Vector2 } {
  let best: { x: number; z: number; dir: THREE.Vector2; d: number } | null = null;
  for (const rz of roadsZ) {
    const d = Math.abs(z - rz);
    const side = x > 0 ? 1 : -1; // drive on the right: heading +x uses lane z + LANE/2... keep simple
    const lz = rz + side * (LANE / 2);
    if (!best || d < best.d) best = { x, z: lz, dir: new THREE.Vector2(side, 0), d };
  }
  for (const rx of roadsX) {
    const d = Math.abs(x - rx);
    const side = z > 0 ? -1 : 1;
    const lx = rx + side * (LANE / 2);
    if (!best || d < best.d) best = { x: lx, z, dir: new THREE.Vector2(0, -side), d };
  }
  return best!;
}
