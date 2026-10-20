import * as THREE from 'three';
import { FullScreenQuad, Pass } from 'three/addons/postprocessing/Pass.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { STACK_LAYER } from './stack';

// Three looks picked by scroll (gobold's Bayer -> red scan grain -> colour ISP, in this palette: ghost-grey dither,
// cyan scan grain, colour), switched by a grey signal tear that sweeps the stage in the direction of the scroll.
// Inside the stage rect the workstation is graded; outside it the strands stay raw, so forming still flies in.
const FRAG = /* glsl */ `
  uniform sampler2D tDiffuse;
  uniform sampler2D tStack;
  uniform vec4 uRect;
  uniform vec2 uRes;
  uniform float uTime;
  uniform float uMode;
  uniform float uPrev;
  uniform float uTrans;
  uniform float uDir;
  uniform float uPx;
  uniform float uGain;
  uniform float uBand;
  varying vec2 vUv;

  const vec3 GREY = vec3(0.4);
  const vec3 CYAN = vec3(0.0024, 0.98, 0.69);

  float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
  float bayer2(vec2 a) { a = floor(a); return fract(a.x * 0.5 + a.y * a.y * 0.75); }
  float bayer4(vec2 a) { return bayer2(0.5 * a) * 0.25 + bayer2(a); }
  float bayer8(vec2 a) { return bayer4(0.5 * a) * 0.25 + bayer2(a); }
  float tone(vec3 c) { return pow(clamp(dot(c, vec3(0.2126, 0.7152, 0.0722)), 0.0, 1.0), 0.4545); }
  vec4 grab(vec2 px) { return texture2D(tStack, px / uRes); }

  vec4 look(float m, vec2 fc, vec2 r) {
    float k = uPx / 3.0;
    if (m < 0.5) {
      // Brightest of four taps per cell, so a one-pixel line can't fall between samples and break up.
      vec2 cell = floor(fc / uPx);
      vec2 c0 = (cell + 0.5) * uPx;
      float q = 0.3 * uPx;
      vec4 s0 = grab(c0 + vec2(-q, -q));
      vec4 s1 = grab(c0 + vec2(q, -q));
      vec4 s2 = grab(c0 + vec2(-q, q));
      vec4 s3 = grab(c0 + vec2(q, q));
      float t = max(max(tone(s0.rgb), tone(s1.rgb)), max(tone(s2.rgb), tone(s3.rgb)));
      float v = clamp((t - 0.1) / 0.72, 0.0, 1.0);
      float on = step(0.001, v) * step(bayer8(cell), v * 1.15 + 0.04);
      float radius = mix(0.3, 0.52, v) * uPx;
      float dotMask = clamp(radius - length(fc - c0) + 0.5, 0.0, 1.0);
      return vec4(GREY * on * dotMask * (0.6 + 0.35 * v), max(max(s0.a, s1.a), max(s2.a, s3.a)));
    }
    if (m < 1.5) {
      float y = fract(uTime * 0.14);
      float band = exp(-pow((r.y - 1.0 + y * 1.3 - 0.15) * 11.0, 2.0));
      float shift = (hash(vec2(floor(fc.y / (2.0 * k)), floor(uTime * 24.0))) - 0.5) * 34.0 * k * band;
      vec4 s = grab(fc + vec2(shift, 0.0));
      float v = pow(tone(s.rgb), 1.25) * 0.85;
      v *= fract(fc.y / uPx) < 0.34 ? 0.5 : 1.0;
      v *= 0.8 + 0.4 * hash(fc + fract(uTime) * 91.0);
      return vec4(CYAN * v * 0.75 + vec3(0.5, 1.0, 0.9) * band * v * 0.5, s.a);
    }
    float ab = 1.6 * k;
    vec4 c = grab(fc);
    vec3 col = vec3(grab(fc + vec2(ab, 0.0)).r, c.g, grab(fc - vec2(ab, 0.0)).b);
    vec3 g = vec3(0.0);
    for (int i = 0; i < 8; i++) {
      float a = float(i) * 0.7854;
      g += grab(fc + vec2(cos(a), sin(a)) * 9.0 * k).rgb;
    }
    col += max(g / 8.0 - 0.4, 0.0) * 0.5;
    col *= fract(fc.y / uPx) < 0.34 ? 0.62 : 1.12;
    float t = fract(uTime * 7.0);
    col += (vec3(hash(fc + t), hash(fc + t + 1.3), hash(fc + t + 2.7)) - 0.5) * 0.035;
    vec2 e = r * (1.0 - r);
    col *= pow(clamp(16.0 * e.x * e.y, 0.0, 1.0), 0.25);
    return vec4(col, c.a);
  }

  void main() {
    vec4 base = texture2D(tDiffuse, vUv);
    vec2 fc = gl_FragCoord.xy;
    vec2 r = (fc - uRect.xy) / (uRect.zw - uRect.xy);
    vec4 o;
    if (r.x < 0.0 || r.x > 1.0 || r.y < 0.0 || r.y > 1.0) {
      o = grab(fc);
    } else if (uTrans >= 1.0) {
      o = look(uMode, fc, r);
    } else {
      // Scrolling down the front climbs from the bottom with the new look under it; scrolling back it falls.
      float ty = uDir > 0.0 ? r.y : 1.0 - r.y;
      float front = uTrans * 1.4 - 0.2;
      o = look(ty < front ? uMode : uPrev, fc, r);
      float tz = max(0.0, 1.0 - abs(ty - front) / uBand);
      if (tz > 0.0) {
        float k = uPx / 3.0;
        float shift = (hash(vec2(floor(fc.y / (5.0 * k)), floor(uTime * 30.0))) - 0.5) * 90.0 * k * tz;
        vec4 s = grab(fc + vec2(shift, 0.0));
        float st = hash(floor(fc / (2.0 * k)) + floor(uTime * 40.0));
        vec3 tc = vec3(0.62) * (tone(s.rgb) * 1.6 + 0.25 * st) * (0.6 + 0.4 * step(0.5, fract(fc.y / (2.0 * k))));
        float ta = max(s.a, step(0.975, st) * tz * 0.3);
        o = mix(o, vec4(tc, ta), pow(tz, 0.6));
      }
    }
    // The stage's bottom strip carries the caption; the graded model fades out before it.
    if (r.x >= 0.0 && r.x <= 1.0 && r.y >= 0.0 && r.y <= 1.0) o *= smoothstep(28.0 * uPx / 3.0, 48.0 * uPx / 3.0, fc.y - uRect.y);
    gl_FragColor = vec4(base.rgb * (1.0 - o.a * uGain) + o.rgb * uGain, base.a);
  }
`;

/** Draws the workstation layer on its own (MSAA, own lights) and composites it graded into the frame. */
export class StackPass extends Pass {
  constructor(renderer, scene, camera) {
    super();
    this.scene = scene;
    this.camera = camera;
    this.target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: 4 });
    this.uniforms = {
      tDiffuse: { value: null },
      tStack: { value: this.target.texture },
      uRect: { value: new THREE.Vector4() },
      uRes: { value: new THREE.Vector2(1, 1) },
      uTime: { value: 0 },
      uMode: { value: 0 },
      uPrev: { value: 0 },
      uTrans: { value: 1 },
      uDir: { value: 1 },
      uPx: { value: 3 },
      uGain: { value: 1 },
      uBand: { value: 0.16 },
    };
    this.quad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        uniforms: this.uniforms,
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: FRAG,
        depthTest: false,
        depthWrite: false,
      })
    );
    this.clear = new THREE.Color();
    const pmrem = new THREE.PMREMGenerator(renderer);
    /** Prefiltered reflections for the workstation's surfaces (stack.setEnv). */
    this.env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.enabled = false;
  }

  setSize(width, height) {
    this.target.setSize(width, height);
    this.uniforms.uRes.value.set(width, height);
  }

  render(renderer, writeBuffer, readBuffer) {
    const { scene, camera } = this;
    const background = scene.background;
    const mask = camera.layers.mask;
    const alpha = renderer.getClearAlpha();
    renderer.getClearColor(this.clear);
    scene.background = null;
    camera.layers.set(STACK_LAYER);
    renderer.setRenderTarget(this.target);
    renderer.setClearColor(0x000000, 0);
    renderer.clear();
    renderer.render(scene, camera);
    scene.background = background;
    camera.layers.mask = mask;
    renderer.setClearColor(this.clear, alpha);
    this.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.quad.render(renderer);
  }

  dispose() {
    this.target.dispose();
    this.env.dispose();
    this.quad.dispose();
  }
}
