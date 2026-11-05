import { Filter, GlProgram, type Container } from 'pixi.js';
import type { TierConfig } from './quality';

const vertex = /* glsl */ `
in vec2 aPosition;
out vec2 vTextureCoord;
uniform vec4 uInputSize;
uniform vec4 uOutputFrame;
uniform vec4 uOutputTexture;
vec4 filterVertexPosition( void ) {
  vec2 position = aPosition * uOutputFrame.zw + uOutputFrame.xy;
  position.x = position.x * (2.0 / uOutputTexture.x) - 1.0;
  position.y = position.y * (2.0*uOutputTexture.z / uOutputTexture.y) - uOutputTexture.z;
  return vec4(position, 0.0, 1.0);
}
vec2 filterTextureCoord( void ) { return aPosition * (uOutputFrame.zw * uInputSize.zw); }
void main(void) { gl_Position = filterVertexPosition(); vTextureCoord = filterTextureCoord(); }
`;

// Film grade: teal shadows / golden highlights, vignette, grain, chromatic aberration, and a soft bloom-ish lift.
const fragment = /* glsl */ `
precision highp float;
in vec2 vTextureCoord;
out vec4 finalColor;
uniform sampler2D uTexture;
uniform vec4 uInputSize;
uniform float uTime;
uniform float uVignette;
uniform float uGrain;
uniform float uChroma;
uniform float uWarm;
uniform float uContrast;
uniform float uRain;

float rnd(vec2 co) { return fract(sin(dot(co.xy, vec2(12.9898, 78.233)) + uTime) * 43758.5453); }

void main(void) {
  vec2 uv = vTextureCoord;
  vec2 centre = uInputSize.zw * uInputSize.xy * 0.5;
  vec2 d = uv - centre;
  float r = length(d / (uInputSize.zw * uInputSize.xy)) * 1.4142;
  vec4 col;
  if (uChroma > 0.0) {
    vec2 off = d * uChroma * r * 0.012;
    col.r = texture(uTexture, uv + off).r;
    col.g = texture(uTexture, uv).g;
    col.b = texture(uTexture, uv - off).b;
    col.a = texture(uTexture, uv).a;
  } else {
    col = texture(uTexture, uv);
  }
  // Grade: lift shadows toward teal, push highlights toward gold/pink.
  float lum = dot(col.rgb, vec3(0.299, 0.587, 0.114));
  vec3 shadowTint = vec3(0.10, 0.36, 0.38);
  vec3 highTint = mix(vec3(1.0, 0.78, 0.45), vec3(1.0, 0.55, 0.65), 0.35);
  float sh = smoothstep(0.45, 0.0, lum);
  float hi = smoothstep(0.55, 1.0, lum);
  col.rgb = mix(col.rgb, col.rgb + shadowTint * 0.12, sh);
  col.rgb = mix(col.rgb, col.rgb * highTint, hi * uWarm * 0.6);
  col.rgb = (col.rgb - 0.5) * uContrast + 0.5;
  // Rain desaturation.
  col.rgb = mix(col.rgb, vec3(lum), uRain * 0.25);
  // Vignette.
  float vig = 1.0 - smoothstep(0.55, 1.35, r) * uVignette;
  col.rgb *= vig;
  // Grain.
  float g = (rnd(uv * uInputSize.xy) - 0.5) * uGrain;
  col.rgb += g;
  finalColor = col;
}
`;

export class GradeFilter extends Filter {
  constructor() {
    super({
      glProgram: GlProgram.from({ vertex, fragment, name: 'neon-grade' }),
      resources: {
        gradeUniforms: {
          uTime: { value: 0, type: 'f32' },
          uVignette: { value: 0.45, type: 'f32' },
          uGrain: { value: 0.035, type: 'f32' },
          uChroma: { value: 0.0, type: 'f32' },
          uWarm: { value: 0.5, type: 'f32' },
          uContrast: { value: 1.06, type: 'f32' },
          uRain: { value: 0.0, type: 'f32' },
        },
      },
    });
  }
  set(u: Partial<{ uTime: number; uVignette: number; uGrain: number; uChroma: number; uWarm: number; uContrast: number; uRain: number }>): void {
    const res = (this.resources as any).gradeUniforms.uniforms;
    Object.assign(res, u);
  }
}

export interface PostStack {
  apply(target: Container, cfg: TierConfig): Promise<void>;
  update(t: number, warm: number, rain: number, panSpeed: number): void;
  destroy(): void;
}

/** Builds the post-processing stack. Bloom and motion blur are loaded lazily from pixi-filters. */
export function createPost(): PostStack {
  const grade = new GradeFilter();
  let bloom: Filter | null = null;
  let motion: any = null;
  let cfg: TierConfig | null = null;
  let target: Container | null = null;
  return {
    async apply(container, c) {
      cfg = c;
      target = container;
      const filters: Filter[] = [];
      if (c.bloom) {
        const mod = await import('pixi-filters');
        bloom ??= new mod.AdvancedBloomFilter({ threshold: 0.55, bloomScale: c.tier === 'high' ? 0.9 : 0.6, brightness: 1.0, blur: c.tier === 'high' ? 8 : 5, quality: c.tier === 'high' ? 5 : 3 });
        filters.push(bloom);
        if (c.tier === 'high') {
          motion ??= new mod.MotionBlurFilter({ velocity: { x: 0, y: 0 }, kernelSize: 7 });
          filters.push(motion);
        }
      }
      grade.set({ uGrain: c.grain ? 0.035 : 0, uChroma: c.chroma ? 1 : 0, uVignette: c.tier === 'battery' ? 0.3 : 0.38 });
      filters.push(grade);
      container.filters = filters;
    },
    update(t, warm, rain, panSpeed) {
      grade.set({ uTime: t % 1000, uWarm: 0.35 + warm * 0.65, uRain: rain });
      if (motion) {
        const v = Math.min(18, panSpeed / 120);
        motion.velocity = { x: v, y: 0 };
        motion.enabled = v > 1.5;
      }
      void cfg;
    },
    destroy() {
      if (target) target.filters = [];
      grade.destroy();
      bloom?.destroy();
      motion?.destroy();
    },
  };
}
