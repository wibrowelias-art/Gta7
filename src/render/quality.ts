export type Tier = 'high' | 'balanced' | 'battery';

export interface TierConfig {
  tier: Tier;
  /** Device pixel ratio cap. */
  dpr: number;
  bloom: boolean;
  grain: boolean;
  chroma: boolean;
  dof: boolean;
  reflections: boolean;
  shafts: boolean;
  traffic: number; // number of cars
  flyers: number; // flying cars + helicopters
  rain: boolean;
  /** Texture budget in megapixels (sum of cached render-texture areas). */
  textureBudgetMP: number;
  antialias: boolean;
}

export const TIERS: Record<Tier, TierConfig> = {
  high: { tier: 'high', dpr: 3, bloom: true, grain: true, chroma: true, dof: true, reflections: true, shafts: true, traffic: 18, flyers: 6, rain: true, textureBudgetMP: 48, antialias: true },
  balanced: { tier: 'balanced', dpr: 2, bloom: true, grain: true, chroma: false, dof: false, reflections: true, shafts: true, traffic: 10, flyers: 3, rain: true, textureBudgetMP: 24, antialias: false },
  battery: { tier: 'battery', dpr: 1.25, bloom: false, grain: false, chroma: false, dof: false, reflections: false, shafts: false, traffic: 5, flyers: 1, rain: false, textureBudgetMP: 10, antialias: false },
};

/** Quick device probe: hardware threads, memory, GPU renderer string and a short rAF timing sample. */
export async function detectQuality(): Promise<Tier> {
  const nav = navigator as Navigator & { deviceMemory?: number; connection?: { saveData?: boolean } };
  if (nav.connection?.saveData) return 'battery';
  const cores = nav.hardwareConcurrency ?? 4;
  const mem = nav.deviceMemory ?? 4;
  let gpuScore = 1;
  try {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') ?? c.getContext('webgl');
    if (!gl) return 'battery';
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = dbg ? String(gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)).toLowerCase() : '';
    if (/swiftshader|llvmpipe|software/.test(renderer)) gpuScore = 0;
    else if (/apple|nvidia|radeon|rtx|gtx|adreno 7|mali-g7|immortalis/.test(renderer)) gpuScore = 2;
  } catch {
    gpuScore = 1;
  }
  // Sample frame pacing for ~6 frames.
  const t0 = performance.now();
  let frames = 0;
  await new Promise<void>((res) => {
    const tick = () => (++frames >= 6 ? res() : requestAnimationFrame(tick));
    requestAnimationFrame(tick);
  });
  const avg = (performance.now() - t0) / frames;
  const slowFrames = avg > 24;
  if (gpuScore === 0 || slowFrames || mem <= 2 || cores <= 2) return 'battery';
  if (gpuScore === 2 && cores >= 6 && mem >= 6 && avg < 18) return 'high';
  return 'balanced';
}
