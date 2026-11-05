import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null },
    uTime: { value: 0 },
    uVignette: { value: 0.5 },
    uGrain: { value: 0.04 },
    uChroma: { value: 1.0 },
    uSpeed: { value: 0 },
    uResolution: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uVignette; uniform float uGrain; uniform float uChroma; uniform float uSpeed; uniform vec2 uResolution;
    varying vec2 vUv;
    float rnd(vec2 co){ return fract(sin(dot(co, vec2(12.9898,78.233)) + uTime) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      vec2 d = uv - 0.5;
      float r = length(d * vec2(uResolution.x / uResolution.y, 1.0));
      // Chromatic aberration grows toward the edges and with speed.
      vec2 off = d * (0.004 * uChroma + uSpeed * 0.01) * r;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + off).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - off).b;
      // Radial speed blur (cheap): a few taps toward the centre.
      if (uSpeed > 0.02) {
        vec3 acc = col; float n = 1.0;
        for (int i = 1; i <= 5; i++) { float k = float(i) / 5.0; vec2 p = uv - d * k * uSpeed * 0.25; acc += texture2D(tDiffuse, p).rgb; n += 1.0; }
        col = mix(col, acc / n, min(1.0, r * 1.4));
      }
      // Film grade: teal shadows, warm highlights.
      float lum = dot(col, vec3(0.299, 0.587, 0.114));
      col += vec3(0.02, 0.07, 0.08) * smoothstep(0.35, 0.0, lum);
      col *= mix(vec3(1.0), vec3(1.06, 0.97, 0.9), smoothstep(0.5, 1.0, lum));
      col = (col - 0.5) * 1.08 + 0.5;
      float vig = 1.0 - smoothstep(0.55, 1.3, r) * uVignette;
      col *= vig;
      col += (rnd(uv * uResolution) - 0.5) * uGrain;
      gl_FragColor = vec4(col, 1.0);
    }`,
};

export interface Post {
  render(): void;
  resize(w: number, h: number): void;
  update(t: number, speed01: number): void;
}

export function createPost(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, tier: 'high' | 'balanced' | 'battery'): Post {
  const size = renderer.getSize(new THREE.Vector2());
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), tier === 'high' ? 0.9 : 0.65, tier === 'high' ? 0.6 : 0.4, 0.78);
  if (tier !== 'battery') composer.addPass(bloom);
  const grade = new ShaderPass(GradeShader);
  grade.uniforms.uGrain.value = tier === 'battery' ? 0.0 : 0.035;
  grade.uniforms.uChroma.value = tier === 'high' ? 1.2 : 0.6;
  composer.addPass(grade);
  composer.addPass(new OutputPass());
  if (tier === 'high') composer.addPass(new SMAAPass(size.x, size.y));
  return {
    render: () => composer.render(),
    resize(w, h) {
      composer.setSize(w, h);
      grade.uniforms.uResolution.value.set(w, h);
    },
    update(t, speed01) {
      grade.uniforms.uTime.value = t % 1000;
      grade.uniforms.uSpeed.value = Math.max(0, speed01 - 0.45) * 1.5;
    },
  };
}
