import * as THREE from 'three';
import { Lensflare, LensflareElement } from 'three/examples/jsm/objects/Lensflare.js';
import { cloudTexture } from './textures';

export interface Atmos {
  /** 0..24 */
  hour: number;
  /** Sun elevation in degrees (negative = below horizon). */
  elevation: number;
  daylight: number; // 0..1
  warmth: number; // 0..1, peaks around sunrise/sunset
  night: number; // 0..1
}

interface Key {
  h: number;
  top: number;
  mid: number;
  hor: number;
  sun: number;
}
// Gradient keyframes: a saturated sunset-heavy palette like early-2000s open-world skies.
const KEYS: Key[] = [
  { h: 0, top: 0x070a1e, mid: 0x141a3a, hor: 0x2a2434, sun: 0x000000 },
  { h: 5, top: 0x0b1030, mid: 0x22234a, hor: 0x5a3a4a, sun: 0x000000 },
  { h: 6.5, top: 0x3a4a8a, mid: 0xe07a5a, hor: 0xffc38a, sun: 0xffb070 },
  { h: 9, top: 0x4f86c8, mid: 0x9fc0e0, hor: 0xe8d8c0, sun: 0xfff0d8 },
  { h: 12, top: 0x3f7fd0, mid: 0x8fb8e8, hor: 0xdfe6ea, sun: 0xffffff },
  { h: 16, top: 0x5f86b8, mid: 0xe8b890, hor: 0xffd0a0, sun: 0xffe0b0 },
  { h: 17.5, top: 0x6a5a8a, mid: 0xff8a4a, hor: 0xffcf80, sun: 0xffc080 },
  { h: 18.6, top: 0x4a2a5a, mid: 0xff6a3a, hor: 0xff9a5a, sun: 0xff8a50 },
  { h: 19.5, top: 0x1a1a40, mid: 0x6a3a5a, hor: 0xd06a50, sun: 0xa04a30 },
  { h: 21, top: 0x0a0c24, mid: 0x1a1c3e, hor: 0x3a2a3a, sun: 0x000000 },
  { h: 24, top: 0x070a1e, mid: 0x141a3a, hor: 0x2a2434, sun: 0x000000 },
];
function keyAt(h: number): { top: THREE.Color; mid: THREE.Color; hor: THREE.Color; sun: THREE.Color } {
  let a = KEYS[0];
  let b = KEYS[1];
  for (let i = 0; i < KEYS.length - 1; i++) if (h >= KEYS[i].h && h <= KEYS[i + 1].h) {
    a = KEYS[i];
    b = KEYS[i + 1];
    break;
  }
  const t = (h - a.h) / (b.h - a.h || 1);
  const mix = (x: number, y: number) => new THREE.Color(x).lerp(new THREE.Color(y), t);
  return { top: mix(a.top, b.top), mid: mix(a.mid, b.mid), hor: mix(a.hor, b.hor), sun: mix(a.sun, b.sun) };
}

/** Golden-hour atmosphere: gradient sky dome with a sun disc and glow, lens flare, scrolling clouds, stars. */
export class SkyDome {
  readonly sky: THREE.Mesh;
  readonly sun = new THREE.Vector3();
  readonly clouds: THREE.Mesh;
  readonly stars: THREE.Points;
  readonly sunLight: THREE.DirectionalLight;
  readonly hemi: THREE.HemisphereLight;
  readonly flare: Lensflare;
  private flareSizes: number[] = [];
  hour = 17.3; // start at golden hour
  /** Real seconds per game day. */
  dayLength = 14 * 60;

  constructor(scene: THREE.Scene) {
    this.sky = new THREE.Mesh(
      new THREE.SphereGeometry(3800, 48, 24),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        fog: false,
        uniforms: { top: { value: new THREE.Color() }, mid: { value: new THREE.Color() }, hor: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3(0, 1, 0) }, sunColor: { value: new THREE.Color() }, glow: { value: 0.5 } },
        vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
        fragmentShader: `
          uniform vec3 top; uniform vec3 mid; uniform vec3 hor; uniform vec3 sunDir; uniform vec3 sunColor; uniform float glow;
          varying vec3 vDir;
          void main(){
            float h = clamp(vDir.y, -0.05, 1.0);
            vec3 c = mix(hor, mid, smoothstep(0.0, 0.16, h));
            c = mix(c, top, smoothstep(0.16, 0.65, h));
            float s = max(0.0, dot(normalize(vDir), normalize(sunDir)));
            c += sunColor * (pow(s, 900.0) * 2.5 + pow(s, 24.0) * 0.55 * glow + pow(s, 3.0) * 0.12 * glow);
            // Below the horizon stays the horizon colour so the ground fog blends in.
            gl_FragColor = vec4(c, 1.0);
          }`,
      }),
    );
    this.sky.renderOrder = -2;
    scene.add(this.sky);

    this.sunLight = new THREE.DirectionalLight(0xffe0b0, 2.2);
    scene.add(this.sunLight, this.sunLight.target);
    this.hemi = new THREE.HemisphereLight(0xffd2a0, 0x5a4a3a, 0.9);
    scene.add(this.hemi);

    // Cloud layer: a big sky-facing disc with a scrolling alpha texture.
    const ct = cloudTexture();
    ct.repeat.set(3, 1);
    this.clouds = new THREE.Mesh(new THREE.PlaneGeometry(6000, 6000), new THREE.MeshBasicMaterial({ map: ct, transparent: true, opacity: 0.5, depthWrite: false, fog: false }));
    this.clouds.rotation.x = Math.PI / 2;
    this.clouds.position.y = 380;
    this.clouds.renderOrder = -1;
    scene.add(this.clouds);

    const starGeo = new THREE.BufferGeometry();
    const pos: number[] = [];
    for (let i = 0; i < 1200; i++) {
      const a = Math.random() * Math.PI * 2;
      const e = 0.08 + Math.random() * 0.9;
      pos.push(Math.cos(a) * Math.cos(e) * 3500, Math.sin(e) * 3500, Math.sin(a) * Math.cos(e) * 3500);
    }
    starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    this.stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xfff4ec, size: 2.5, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
    scene.add(this.stars);

    // Lens flare on the sun.
    const flareTex = flareTexture();
    this.flare = new Lensflare();
    const els: [number, number, number][] = [[520, 0, 0xffdcb0], [90, 0.5, 0xff9a6a], [60, 0.7, 0xffc857], [120, 0.9, 0xff6a8a], [40, 1.2, 0x8bd3ff]];
    for (const [size, dist, color] of els) {
      this.flare.addElement(new LensflareElement(flareTex, size, dist, new THREE.Color(color)));
      this.flareSizes.push(size);
    }
    this.sunLight.add(this.flare);
  }

  atmos(): Atmos {
    const h = this.hour;
    // Sun elevation: -20° at midnight, +50° at noon (compressed day for drama).
    // Day: 0° at 06:00, 55° at noon, 0° at 18:00. Night: dips to -22° at midnight.
    const elevation = h >= 6 && h <= 18 ? 55 * Math.sin((Math.PI * (h - 6)) / 12) : -22 * Math.sin((Math.PI * (((h + 6) % 24) - 0)) / 12);
    const daylight = THREE.MathUtils.clamp((elevation + 4) / 14, 0, 1);
    const warmth = THREE.MathUtils.clamp(1 - Math.abs(elevation - 5) / 14, 0, 1);
    const night = THREE.MathUtils.clamp((-elevation - 2) / 10, 0, 1);
    return { hour: h, elevation, daylight, warmth, night };
  }

  update(dt: number, focus: THREE.Vector3, fog: THREE.FogExp2, renderer: THREE.WebGLRenderer): Atmos {
    this.hour = (this.hour + (dt / this.dayLength) * 24) % 24;
    const a = this.atmos();
    const phi = THREE.MathUtils.degToRad(90 - a.elevation);
    const theta = THREE.MathUtils.degToRad(200 + ((a.hour - 6) / 12) * 160);
    this.sun.setFromSphericalCoords(1, phi, theta);
    const k = keyAt(a.hour);
    const u = (this.sky.material as THREE.ShaderMaterial).uniforms;
    u.top.value.copy(k.top);
    u.mid.value.copy(k.mid);
    u.hor.value.copy(k.hor);
    u.sunDir.value.copy(this.sun);
    u.sunColor.value.copy(k.sun);
    u.glow.value = 0.35 + a.warmth * 0.9;
    this.sky.position.copy(focus);
    // Lights.
    this.sunLight.position.copy(focus).addScaledVector(this.sun, 500);
    this.sunLight.target.position.copy(focus);
    const sunCol = new THREE.Color().setHSL(0.075 - a.warmth * 0.04, 0.85, 0.6 + a.daylight * 0.15);
    this.sunLight.color.copy(sunCol);
    this.sunLight.intensity = 1.6 * a.daylight * (0.8 + 0.2 * (1 - a.warmth));
    this.sunLight.visible = a.elevation > -3;
    this.hemi.intensity = 0.45 + a.daylight * 0.55;
    this.hemi.color.setHSL(0.07, 0.6, 0.6 + a.daylight * 0.2).lerp(new THREE.Color(0x4a5a8a), a.night);
    this.hemi.groundColor.setHSL(0.07, 0.4, 0.2 + a.daylight * 0.15);
    // Fog colour follows the horizon: warm haze by day, deep blue at night.
    fog.color.copy(k.hor).lerp(k.mid, 0.3).lerp(k.sun, a.warmth * 0.12);
    // Heavy retro fog: the far end of every street dissolves into the sky colour.
    fog.density = 0.0042 + a.warmth * 0.0016 + a.night * 0.0012;
    void renderer;
    // Clouds and stars.
    (this.clouds.material as THREE.MeshBasicMaterial).color.copy(new THREE.Color(0xfff0e0).lerp(new THREE.Color(0xff7a4a), a.warmth * 0.7).lerp(new THREE.Color(0x1a2038), a.night));
    (this.clouds.material as THREE.MeshBasicMaterial).opacity = 0.55 + a.warmth * 0.3 - a.night * 0.3;
    const ct = (this.clouds.material as THREE.MeshBasicMaterial).map!;
    ct.offset.x += dt * 0.0015;
    this.clouds.position.set(focus.x, 420, focus.z);
    (this.stars.material as THREE.PointsMaterial).opacity = a.night * 0.9;
    this.stars.position.copy(focus);
    // Flare only when the sun is up.
    this.flare.visible = a.elevation > 0;
    return a;
  }
}

function flareTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,255,255,1)');
  grad.addColorStop(0.25, 'rgba(255,255,255,0.5)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
