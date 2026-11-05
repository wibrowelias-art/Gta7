import * as THREE from 'three';
import { Rng } from '../game/rng';

/** Procedural, PS2-era-flavoured textures: plaster, brick, concrete, glass facades, cobbles, asphalt, roof tiles, graffiti. */

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(c: HTMLCanvasElement, srgb = true, aniso = 8): THREE.CanvasTexture {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  return t;
}

function grain(g: CanvasRenderingContext2D, w: number, h: number, rng: Rng, n: number, alpha: number): void {
  for (let i = 0; i < n; i++) {
    const v = rng.next() > 0.5 ? 255 : 0;
    g.fillStyle = `rgba(${v},${v},${v},${(rng.next() * alpha).toFixed(3)})`;
    g.fillRect(rng.next() * w, rng.next() * h, 1 + rng.next() * 2, 1 + rng.next() * 2);
  }
}

export type FacadeStyle = 'plaster' | 'brick' | 'concrete' | 'glass' | 'industrial';

export interface Facade {
  map: THREE.CanvasTexture;
  emissive: THREE.CanvasTexture;
  /** Metres covered by one texture repeat (x, y). */
  size: [number, number];
  color: number;
}

const WARM = ['#d9b98a', '#c9a27a', '#e3c9a3', '#d8a890', '#cdb7a0', '#b89a7c', '#e0cfb8', '#c7b8a2'];
const CONCRETE = ['#9a9590', '#8b8782', '#a5a09a', '#7f7b78'];

/** A facade atlas: 4 columns × 4 floors of windows with frames, sills and a few lit interiors. */
export function facadeTexture(style: FacadeStyle, seed: number): Facade {
  const rng = new Rng(seed);
  const [c, g] = canvas(256, 256);
  const [e, eg] = canvas(256, 256);
  g.scale(0.5, 0.5);
  eg.scale(0.5, 0.5);
  eg.fillStyle = '#000';
  eg.fillRect(0, 0, 512, 512);
  let base = '#c9a27a';
  if (style === 'plaster') base = rng.pick(WARM);
  else if (style === 'brick') base = rng.pick(['#8a4b3a', '#9a5a44', '#7a4236', '#a3665a']);
  else if (style === 'concrete') base = rng.pick(CONCRETE);
  else if (style === 'industrial') base = rng.pick(['#6e4a3e', '#5f4a44', '#7a5a4c']);
  else base = '#5a6f86';
  g.fillStyle = base;
  g.fillRect(0, 0, 512, 512);
  if (style === 'brick' || style === 'industrial') {
    // Mortar lines and brick variation.
    for (let y = 0; y < 512; y += 8) {
      g.fillStyle = 'rgba(230,220,205,0.35)';
      g.fillRect(0, y, 512, 1);
      const off = (y / 8) % 2 ? 12 : 0;
      for (let x = off; x < 512; x += 24) {
        g.fillRect(x, y, 1, 8);
        g.fillStyle = `rgba(0,0,0,${(rng.next() * 0.18).toFixed(3)})`;
        g.fillRect(x + 1, y + 1, 22, 6);
        g.fillStyle = 'rgba(230,220,205,0.35)';
      }
    }
  } else if (style === 'plaster' || style === 'concrete') {
    grain(g, 512, 512, rng, 6000, 0.08);
    // Weathering streaks.
    for (let i = 0; i < 24; i++) {
      const x = rng.next() * 512;
      g.fillStyle = `rgba(40,30,20,${(rng.next() * 0.12).toFixed(3)})`;
      g.fillRect(x, 0, 2 + rng.next() * 6, 512);
    }
  }
  // Floor ledges.
  const rows = 4;
  const cols = 4;
  const rh = 512 / rows;
  const cw = 512 / cols;
  for (let r = 0; r < rows; r++) {
    if (style !== 'glass') {
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.fillRect(0, r * rh + rh - 6, 512, 3);
      g.fillStyle = 'rgba(0,0,0,0.28)';
      g.fillRect(0, r * rh + rh - 3, 512, 3);
    }
    for (let col = 0; col < cols; col++) {
      const x = col * cw + cw * 0.22;
      const y = r * rh + rh * 0.18;
      const w = cw * 0.56;
      const h = rh * 0.58;
      if (style === 'glass') {
        // Curtain wall: continuous glass with mullions.
        g.fillStyle = `rgba(${60 + rng.next() * 30},${80 + rng.next() * 30},${110 + rng.next() * 30},1)`;
        g.fillRect(col * cw, r * rh, cw, rh);
        g.fillStyle = 'rgba(20,24,32,0.9)';
        g.fillRect(col * cw, r * rh, 3, rh);
        g.fillRect(col * cw, r * rh, cw, 3);
        g.fillStyle = 'rgba(255,255,255,0.12)';
        g.fillRect(col * cw + 3, r * rh + 3, cw * 0.3, rh - 6);
        if (rng.next() > 0.6) {
          eg.fillStyle = `rgba(255,220,170,${(0.3 + rng.next() * 0.5).toFixed(2)})`;
          eg.fillRect(col * cw + 4, r * rh + 4, cw - 8, rh - 8);
        }
        continue;
      }
      // Window recess shadow, frame, glass, sill.
      g.fillStyle = 'rgba(0,0,0,0.45)';
      g.fillRect(x - 3, y - 3, w + 6, h + 6);
      g.fillStyle = style === 'industrial' ? '#3a3a3a' : '#e8e2d8';
      g.fillRect(x - 2, y - 2, w + 4, h + 4);
      const lit = rng.next() > 0.55;
      g.fillStyle = lit ? '#2a2f3a' : '#1c2230';
      g.fillRect(x, y, w, h);
      // Reflection gradient.
      const grad = g.createLinearGradient(x, y, x + w, y + h);
      grad.addColorStop(0, 'rgba(180,200,230,0.35)');
      grad.addColorStop(0.5, 'rgba(180,200,230,0.05)');
      grad.addColorStop(1, 'rgba(255,230,200,0.2)');
      g.fillStyle = grad;
      g.fillRect(x, y, w, h);
      // Cross bars.
      g.fillStyle = style === 'industrial' ? '#3a3a3a' : '#e8e2d8';
      g.fillRect(x + w / 2 - 1, y, 2, h);
      g.fillRect(x, y + h * 0.45, w, 2);
      // Curtains / interiors.
      if (rng.next() > 0.5) {
        g.fillStyle = rng.pick(['rgba(230,200,160,0.5)', 'rgba(200,170,150,0.5)', 'rgba(170,190,200,0.4)']);
        g.fillRect(x + 2, y + 2, w * 0.35, h - 4);
      }
      // Sill.
      g.fillStyle = 'rgba(255,255,255,0.35)';
      g.fillRect(x - 5, y + h + 2, w + 10, 3);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x - 5, y + h + 5, w + 10, 3);
      if (lit) {
        eg.fillStyle = rng.next() > 0.3 ? `rgba(255,214,160,${(0.5 + rng.next() * 0.5).toFixed(2)})` : 'rgba(200,220,255,0.7)';
        eg.fillRect(x, y, w, h);
      }
    }
  }
  grain(g, 512, 512, rng, 2500, 0.06);
  // Painted ambient occlusion: darker bottom of each floor band, dirt streaks under sills.
  for (let r = 0; r < 4; r++) {
    const band = g.createLinearGradient(0, r * 128 + 96, 0, r * 128 + 128);
    band.addColorStop(0, 'rgba(0,0,0,0)');
    band.addColorStop(1, 'rgba(0,0,0,0.22)');
    g.fillStyle = band;
    g.fillRect(0, r * 128 + 96, 512, 32);
  }
  for (let i = 0; i < 30; i++) {
    const x = rng.next() * 512;
    g.fillStyle = `rgba(30,20,10,${(rng.next() * 0.1).toFixed(3)})`;
    g.fillRect(x, rng.next() * 512, 2 + rng.next() * 4, 40 + rng.next() * 80);
  }
  return {
    map: finish(c),
    emissive: finish(e),
    size: style === 'glass' ? [10, 14] : [12, 14],
    color: 0xffffff,
    };
}

export function cobbleTexture(seed = 3): THREE.CanvasTexture {
  const rng = new Rng(seed);
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#a69d8e';
  g.fillRect(0, 0, 512, 512);
  const s = 32;
  for (let y = 0; y < 512; y += s) {
    const off = (y / s) % 2 ? s / 2 : 0;
    for (let x = -s; x < 512; x += s) {
      const v = 150 + rng.next() * 55;
      g.fillStyle = `rgb(${v + 8},${v},${v - 14})`;
      g.fillRect(x + off + 2, y + 2, s - 4, s - 4);
      g.fillStyle = 'rgba(255,255,255,0.12)';
      g.fillRect(x + off + 2, y + 2, s - 4, 3);
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.fillRect(x + off + 2, y + s - 5, s - 4, 3);
    }
  }
  grain(g, 512, 512, rng, 5000, 0.1);
  return finish(c);
}

export function asphaltTexture(seed = 5): { map: THREE.CanvasTexture; rough: THREE.CanvasTexture } {
  const rng = new Rng(seed);
  const [c, g] = canvas(512, 512);
  g.fillStyle = '#56534e';
  g.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 30000; i++) {
    const v = 60 + rng.next() * 60;
    g.fillStyle = `rgb(${v},${v - 2},${v - 5})`;
    g.fillRect(rng.next() * 512, rng.next() * 512, 1.5 + rng.next() * 1.5, 1.5 + rng.next() * 1.5);
  }
  // Cracks and tar patches.
  g.strokeStyle = 'rgba(20,18,16,0.55)';
  g.lineWidth = 1.5;
  for (let i = 0; i < 14; i++) {
    let x = rng.next() * 512;
    let y = rng.next() * 512;
    g.beginPath();
    g.moveTo(x, y);
    for (let k = 0; k < 8; k++) {
      x += (rng.next() - 0.5) * 50;
      y += (rng.next() - 0.5) * 50;
      g.lineTo(x, y);
    }
    g.stroke();
  }
  for (let i = 0; i < 6; i++) {
    g.fillStyle = 'rgba(30,28,26,0.35)';
    g.fillRect(rng.next() * 512, rng.next() * 512, 30 + rng.next() * 90, 20 + rng.next() * 60);
  }
  for (let i = 0; i < 10; i++) {
    const x = rng.next() * 512;
    const y = rng.next() * 512;
    const r = 30 + rng.next() * 80;
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, 'rgba(0,0,0,0.3)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const [r, rg] = canvas(512, 512);
  rg.fillStyle = '#b0b0b0';
  rg.fillRect(0, 0, 512, 512);
  for (let i = 0; i < 18; i++) {
    const x = rng.next() * 512;
    const y = rng.next() * 512;
    const rad = 30 + rng.next() * 90;
    const grad = rg.createRadialGradient(x, y, 0, x, y, rad);
    grad.addColorStop(0, 'rgba(40,40,40,1)');
    grad.addColorStop(0.7, 'rgba(80,80,80,0.8)');
    grad.addColorStop(1, 'rgba(176,176,176,0)');
    rg.fillStyle = grad;
    rg.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  return { map: finish(c), rough: finish(r, false) };
}

export function roofTexture(seed = 9): THREE.CanvasTexture {
  const rng = new Rng(seed);
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#8a4a36';
  g.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 16) {
    const off = (y / 16) % 2 ? 16 : 0;
    for (let x = -32; x < 256; x += 32) {
      const v = rng.next();
      g.fillStyle = `rgb(${130 + v * 50},${70 + v * 30},${50 + v * 20})`;
      g.fillRect(x + off, y, 30, 14);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.fillRect(x + off, y + 12, 30, 3);
    }
  }
  return finish(c);
}

export function graffitiTexture(seed: number): THREE.CanvasTexture {
  const rng = new Rng(seed);
  const [c, g] = canvas(1024, 256);
  g.fillStyle = '#b9b4a8';
  g.fillRect(0, 0, 1024, 256);
  grain(g, 1024, 256, rng, 4000, 0.1);
  const palette = ['#e63946', '#f4a261', '#2a9d8f', '#264653', '#e9c46a', '#8338ec', '#ff006e', '#3a86ff', '#06d6a0', '#ffffff', '#111111'];
  for (let i = 0; i < 40; i++) {
    g.fillStyle = rng.pick(palette);
    g.globalAlpha = 0.6 + rng.next() * 0.4;
    const x = rng.next() * 1024;
    const y = rng.next() * 256;
    if (rng.next() > 0.5) {
      g.beginPath();
      g.ellipse(x, y, 20 + rng.next() * 80, 15 + rng.next() * 50, rng.next() * Math.PI, 0, Math.PI * 2);
      g.fill();
    } else {
      g.fillRect(x, y, 20 + rng.next() * 120, 10 + rng.next() * 60);
    }
  }
  g.globalAlpha = 1;
  const words = ['PEACE', 'NOVA', 'RISE', 'DRIFT', 'SUNSET', 'FREE', 'ECHO', 'VOLT', 'HOPE', 'LOUD'];
  for (let i = 0; i < 6; i++) {
    g.font = `900 ${60 + rng.next() * 60}px "Barlow Condensed", Impact, sans-serif`;
    g.lineWidth = 8;
    g.strokeStyle = rng.pick(palette);
    g.fillStyle = rng.pick(palette);
    const x = rng.next() * 900;
    const y = 80 + rng.next() * 150;
    g.save();
    g.translate(x, y);
    g.rotate((rng.next() - 0.5) * 0.3);
    const w = rng.pick(words);
    g.strokeText(w, 0, 0);
    g.fillText(w, 0, 0);
    g.restore();
  }
  // Drips and splatters.
  for (let i = 0; i < 300; i++) {
    g.fillStyle = rng.pick(palette);
    g.globalAlpha = 0.5;
    g.fillRect(rng.next() * 1024, rng.next() * 256, 2, 2 + rng.next() * 20);
  }
  g.globalAlpha = 1;
  return finish(c);
}

export function cloudTexture(seed = 11): THREE.CanvasTexture {
  // Sunset cloud sheet: long horizontal streaks with brighter lit edges, a few puffy cumulus, soft gaps.
  const rng = new Rng(seed);
  const [c, g] = canvas(1024, 512);
  g.clearRect(0, 0, 1024, 512);
  for (let i = 0; i < 90; i++) {
    const x = rng.next() * 1024;
    const y = 40 + rng.next() * 400;
    const w = 120 + rng.next() * 380;
    const h = 10 + rng.next() * 34;
    const grad = g.createRadialGradient(x, y, 0, x, y, w / 2);
    grad.addColorStop(0, `rgba(255,255,255,${(0.35 + rng.next() * 0.35).toFixed(2)})`);
    grad.addColorStop(0.6, `rgba(255,255,255,${(0.12 + rng.next() * 0.15).toFixed(2)})`);
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.save();
    g.translate(x, y);
    g.scale(1, h / (w / 2));
    g.translate(-x, -y);
    g.fillStyle = grad;
    g.fillRect(x - w, y - w, w * 2, w * 2);
    g.restore();
  }
  for (let i = 0; i < 26; i++) {
    const x = rng.next() * 1024;
    const y = 120 + rng.next() * 280;
    for (let k = 0; k < 6; k++) {
      const r = 18 + rng.next() * 40;
      const px = x + (rng.next() - 0.5) * 90;
      const py = y + (rng.next() - 0.5) * 30;
      const grad = g.createRadialGradient(px, py, 0, px, py, r);
      grad.addColorStop(0, `rgba(255,255,255,${(0.5 + rng.next() * 0.4).toFixed(2)})`);
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(px - r, py - r, r * 2, r * 2);
    }
  }
  const t = finish(c);
  return t;
}

/** A painted tree crown: a mass of leaf clusters with lit top and dark underside, alpha outside. */
export function foliageTexture(seed = 17): THREE.CanvasTexture {
  const rng = new Rng(seed);
  const [c, g] = canvas(256, 256);
  g.clearRect(0, 0, 256, 256);
  for (let i = 0; i < 140; i++) {
    const a = rng.next() * Math.PI * 2;
    const rr = rng.next() * 95;
    const x = 128 + Math.cos(a) * rr;
    const y = 118 + Math.sin(a) * rr * 0.85;
    const r = 12 + rng.next() * 22;
    const lit = (118 - y) / 100 + rng.next() * 0.3;
    const v = 50 + lit * 70;
    g.fillStyle = `rgb(${Math.round(v * 0.75)},${Math.round(v + 30)},${Math.round(v * 0.5)})`;
    g.beginPath();
    g.arc(x, y, r, 0, Math.PI * 2);
    g.fill();
  }
  const t = finish(c);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

export function trainTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(512, 128);
  g.fillStyle = '#d9b43a';
  g.fillRect(0, 0, 512, 128);
  g.fillStyle = '#b5252f';
  g.fillRect(0, 96, 512, 32);
  for (let x = 16; x < 512; x += 64) {
    g.fillStyle = '#1b2430';
    g.fillRect(x, 28, 40, 40);
    g.fillStyle = 'rgba(200,220,255,0.35)';
    g.fillRect(x + 4, 32, 14, 32);
  }
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(0, 0, 512, 10);
  return finish(c);
}

export function skinColors(): number[] {
  return [0xf1c6a7, 0xe3b08a, 0xc98a5a, 0xa8714c, 0x8d5a3c, 0x6b4229];
}

/** A poster / sign label: bold condensed text on a coloured card (or glowing, for neon). */
export function neonLabelTexture(text: string, color: number, glow = true): THREE.CanvasTexture {
  const [c, g] = canvas(512, 320);
  const hex = `#${color.toString(16).padStart(6, '0')}`;
  if (glow) g.clearRect(0, 0, 512, 320);
  else {
    g.fillStyle = '#efe6d6';
    g.fillRect(0, 0, 512, 320);
    g.fillStyle = hex;
    g.fillRect(0, 0, 512, 60);
    g.fillRect(0, 260, 512, 60);
    g.fillStyle = '#1a1016';
    g.font = '400 22px Inter, sans-serif';
    g.textAlign = 'center';
    g.fillText('SATURDAY · 21:00 · FREE ENTRY', 256, 300);
  }
  g.font = '700 84px "Barlow Condensed", "Arial Narrow", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  if (glow) {
    g.shadowColor = hex;
    g.shadowBlur = 24;
    g.lineWidth = 6;
    g.strokeStyle = hex;
    g.strokeText(text, 256, 160);
    g.shadowBlur = 0;
    g.fillStyle = '#fff4ec';
  } else g.fillStyle = '#1a1016';
  const words = text.split(' ');
  if (words.length > 1 && !glow) {
    g.fillText(words[0], 256, 120);
    g.fillText(words.slice(1).join(' '), 256, 200);
  } else g.fillText(text, 256, 160);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Ground-floor shopfront strip: 4 m bays with a lit window, shelves inside, a door, a fascia band and an awning stripe. */
export function shopfrontTexture(seed: number, accent: number): THREE.CanvasTexture {
  const rng = new Rng(seed);
  const [c, g] = canvas(512, 128);
  const hexc = `#${accent.toString(16).padStart(6, '0')}`;
  g.fillStyle = '#4a4036';
  g.fillRect(0, 0, 512, 128);
  for (let bay = 0; bay < 4; bay++) {
    const x = bay * 128;
    const kind = rng.next();
    // Fascia band with the accent colour and a thin gold line.
    g.fillStyle = hexc;
    g.fillRect(x, 0, 128, 18);
    g.fillStyle = 'rgba(255,220,120,0.7)';
    g.fillRect(x, 18, 128, 2);
    // Pilasters.
    g.fillStyle = '#6a5a48';
    g.fillRect(x, 20, 10, 108);
    g.fillRect(x + 118, 20, 10, 108);
    if (kind < 0.3) {
      // Door bay: glazed door with a brass handle.
      g.fillStyle = '#2a2420';
      g.fillRect(x + 10, 20, 108, 108);
      g.fillStyle = '#1c2a36';
      g.fillRect(x + 34, 30, 60, 90);
      g.fillStyle = 'rgba(200,220,255,0.18)';
      g.fillRect(x + 38, 34, 24, 82);
      g.fillStyle = '#d9b43a';
      g.fillRect(x + 84, 76, 4, 12);
    } else {
      // Shop window: dark interior with warm shelves and goods, plus a reflection gradient.
      g.fillStyle = '#1a2028';
      g.fillRect(x + 10, 20, 108, 108);
      g.fillStyle = '#3a2a20';
      g.fillRect(x + 16, 60, 96, 4);
      g.fillRect(x + 16, 92, 96, 4);
      for (let i = 0; i < 9; i++) {
        g.fillStyle = `hsl(${rng.next() * 360},60%,${45 + rng.next() * 25}%)`;
        g.fillRect(x + 18 + i * 10, 46 + (i % 2) * 32, 7, 12);
      }
      const grad = g.createLinearGradient(x + 10, 20, x + 118, 128);
      grad.addColorStop(0, 'rgba(200,220,255,0.3)');
      grad.addColorStop(0.5, 'rgba(200,220,255,0.05)');
      grad.addColorStop(1, 'rgba(255,230,200,0.18)');
      g.fillStyle = grad;
      g.fillRect(x + 10, 20, 108, 108);
      // Window frame.
      g.strokeStyle = '#2a2420';
      g.lineWidth = 4;
      g.strokeRect(x + 12, 22, 104, 104);
      if (rng.next() > 0.5) {
        g.fillStyle = 'rgba(255,255,255,0.85)';
        g.font = '700 18px "Barlow Condensed", "Arial Narrow", sans-serif';
        g.textAlign = 'center';
        g.fillText(['SALE', 'OPEN', '24H', 'NEW'][Math.floor(rng.next() * 4)], x + 64, 44);
      }
    }
    // Base plinth.
    g.fillStyle = '#3a322a';
    g.fillRect(x, 118, 128, 10);
  }
  return finish(c);
}

/** Vertical light cone: bright at the top, fading out and widening toward the ground (used as a billboard under lamps). */
export function coneTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(128, 256);
  g.clearRect(0, 0, 128, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.28)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.beginPath();
  g.moveTo(56, 0);
  g.lineTo(72, 0);
  g.lineTo(128, 256);
  g.lineTo(0, 256);
  g.closePath();
  g.fill();
  // Soft the edges.
  const side = g.createLinearGradient(0, 0, 128, 0);
  side.addColorStop(0, 'rgba(0,0,0,1)');
  side.addColorStop(0.3, 'rgba(0,0,0,0)');
  side.addColorStop(0.7, 'rgba(0,0,0,0)');
  side.addColorStop(1, 'rgba(0,0,0,1)');
  g.globalCompositeOperation = 'destination-out';
  g.fillStyle = side;
  g.fillRect(0, 0, 128, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Distant skyline silhouette strip with window-dot sheets; alpha above the roofline. */
export function skylineTexture(seed: number, tall: boolean): THREE.CanvasTexture {
  const rng = new Rng(seed);
  const [c, g] = canvas(2048, 256);
  g.clearRect(0, 0, 2048, 256);
  let x = 0;
  while (x < 2048) {
    const w = 30 + rng.next() * 90;
    const h = (tall ? 90 : 40) + rng.next() * (tall ? 150 : 80);
    const shade = tall ? 70 + rng.next() * 30 : 95 + rng.next() * 30;
    g.fillStyle = `rgb(${shade},${shade - 6},${shade - 10})`;
    g.fillRect(x, 256 - h, w, h);
    if (rng.next() > 0.6) g.fillRect(x + w * 0.3, 256 - h - 14 - rng.next() * 20, w * 0.4, 14 + 20);
    if (rng.next() > 0.7) g.fillRect(x + w * 0.5 - 1, 256 - h - 30, 3, 30);
    for (let wy = 256 - h + 6; wy < 250; wy += 9) for (let wx = x + 4; wx < x + w - 4; wx += 7) {
      if (rng.next() > 0.45) continue;
      g.fillStyle = rng.next() > 0.5 ? 'rgba(255,220,160,0.85)' : 'rgba(180,210,255,0.6)';
      g.fillRect(wx, wy, 3, 4);
    }
    x += w + 2 + rng.next() * 10;
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.ClampToEdgeWrapping;
  return t;
}

/** Decal sheet: a long skid mark pair and a puddle shape, each on alpha. */
export function skidTexture(): THREE.CanvasTexture {
  const [c, g] = canvas(256, 128);
  g.clearRect(0, 0, 256, 128);
  for (const y of [40, 88]) {
    const grad = g.createLinearGradient(0, 0, 256, 0);
    grad.addColorStop(0, 'rgba(10,10,10,0)');
    grad.addColorStop(0.3, 'rgba(10,10,10,0.55)');
    grad.addColorStop(0.8, 'rgba(10,10,10,0.45)');
    grad.addColorStop(1, 'rgba(10,10,10,0)');
    g.fillStyle = grad;
    g.fillRect(0, y - 7, 256, 14);
  }
  const t = new THREE.CanvasTexture(c);
  return t;
}
export function puddleTexture(seed = 21): THREE.CanvasTexture {
  const rng = new Rng(seed);
  const [c, g] = canvas(128, 128);
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = 'rgba(255,255,255,1)';
  g.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const r = 38 + rng.next() * 22;
    const px = 64 + Math.cos(a) * r;
    const py = 64 + Math.sin(a) * r * 0.7;
    if (i === 0) g.moveTo(px, py);
    else g.quadraticCurveTo(64 + Math.cos(a - 0.26) * (r + 8), 64 + Math.sin(a - 0.26) * (r + 8) * 0.7, px, py);
  }
  g.closePath();
  g.fill();
  return new THREE.CanvasTexture(c);
}
