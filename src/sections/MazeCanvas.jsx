import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { DIRS } from '../three/maze';

const CYAN = new THREE.Color('#08fdd8');
const PINK = new THREE.Color('#ff69b4');
const HOT = new THREE.Color('#fd2155');
const GHOST = new THREE.Color('#e9eaec');
const SCARED = new THREE.Color('#8e97ab');
const WHITE = new THREE.Color('#ffffff');
const CHASER_COLORS = [PINK, HOT, GHOST];
const WALL_TOP = 0.7;
const WALL_DEPTH = 1.25;
const GROUND = -2.6;
const SMEAR = [0.07, 0.14, 0.21];
const half = (i) => (i % 2 ? 2 / 3 : 1 / 3);
const HIDDEN = new THREE.Matrix4().makeScale(0, 0, 0);

const GLSL = /* glsl */ `
  const vec3 CYAN = vec3(0.031, 0.992, 0.847);
  const vec3 PINK = vec3(1.0, 0.412, 0.706);
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float hash3(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7))) * 43758.5453); }
  float noise(vec3 p) {
    vec3 i = floor(p);
    vec3 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash3(i), hash3(i + vec3(1, 0, 0)), f.x), mix(hash3(i + vec3(0, 1, 0)), hash3(i + vec3(1, 1, 0)), f.x), f.y),
      mix(mix(hash3(i + vec3(0, 0, 1)), hash3(i + vec3(1, 0, 1)), f.x), mix(hash3(i + vec3(0, 1, 1)), hash3(i + vec3(1, 1, 1)), f.x), f.y),
      f.z);
  }
  // Walls run on even grid lines and are half as thick as the odd-line corridors, so tile centres stay one unit
  // apart (the cube's edge) while the drawn path is wider than the cube.
  float tileOf(float u) { float v = u + 1.0 / 3.0; float k = floor(v * 0.5); return v - 2.0 * k < 2.0 / 3.0 ? 2.0 * k : 2.0 * k + 1.0; }
  float halfW(float i) { return mod(i, 2.0) < 0.5 ? 1.0 / 3.0 : 2.0 / 3.0; }
  // Maze build-in: each thing rises once the sweep from the centre passes it.
  float built(vec2 xz, float build, float radius) {
    float k = clamp((build - length(xz) / radius) * 2.5, 0.0, 1.0);
    return 1.0 - pow(1.0 - k, 3.0);
  }
`;

const floorShader = {
  vertexShader: /* glsl */ `
    varying vec3 vW;
    void main() {
      vec4 w = modelMatrix * vec4(position, 1.0);
      vW = w.xyz;
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `,
  fragmentShader: /* glsl */ `
    ${GLSL}
    uniform sampler2D uMask;
    uniform sampler2D uHeat;
    uniform vec2 uSize;
    uniform vec3 uPlayer;
    uniform vec4 uWave;
    uniform float uTime, uPower, uFlash, uBuild, uRadius;
    varying vec3 vW;
    float m(vec2 t) { return texture2D(uMask, (t + 0.5) / uSize).r; }
    void main() {
      vec2 u = vW.xz + (uSize - 1.0) * 0.5;
      vec2 id = vec2(tileOf(u.x), tileOf(u.y));
      if (m(id) < 0.5) { gl_FragColor = vec4(0.0, 0.0, 0.0, 1.0); return; }
      vec2 f = u - id;
      vec2 hw = vec2(halfW(id.x), halfW(id.y));
      float r = m(id + vec2(1, 0)), l = m(id - vec2(1, 0)), dn = m(id + vec2(0, 1)), up = m(id - vec2(0, 1));

      float tr = length(f);
      if ((f.x > 0.0 && r > 0.5) || (f.x < 0.0 && l > 0.5)) tr = min(tr, abs(f.y));
      if ((f.y > 0.0 && dn > 0.5) || (f.y < 0.0 && up > 0.5)) tr = min(tr, abs(f.x));

      float e = 9.0;
      if (r < 0.5) e = min(e, hw.x - f.x);
      if (l < 0.5) e = min(e, hw.x + f.x);
      if (dn < 0.5) e = min(e, hw.y - f.y);
      if (up < 0.5) e = min(e, hw.y + f.y);
      for (int i = 0; i < 4; i++) {
        vec2 s = vec2(i < 2 ? 1.0 : -1.0, mod(float(i), 2.0) < 0.5 ? 1.0 : -1.0);
        if (m(id + s) < 0.5) e = min(e, length(f - hw * s));
      }

      float heat = texture2D(uHeat, (u + 0.5) / uSize).r;
      vec2 toP = vW.xz - uPlayer.xz;
      float light = exp(-dot(toP, toP) * 0.16);
      float wr = (uTime - uWave.z) * 11.0;
      float ring = exp(-abs(length(vW.xz - uWave.xy) - wr) * 3.0) * exp(-(uTime - uWave.z) * 1.6) * uWave.w;
      float seam = smoothstep(0.012, 0.0, min(hw.x - abs(f.x), hw.y - abs(f.y))) * 0.5;

      vec3 c = mix(CYAN, PINK, uPower);
      float glow = exp(-tr * 13.0);
      float core = smoothstep(0.03, 0.006, tr);
      float haze = 0.06 + 0.035 * smoothstep(0.7, 0.0, e);
      vec3 col = c * (haze + seam * 0.06 + glow * (0.26 + heat * 0.9) + exp(-e * 14.0) * 0.6 + heat * 0.22 + light * (0.3 + glow * 0.9) + ring * 0.7 + uFlash * 0.15);
      col += vec3(1.0) * core * (0.22 + heat * 0.5 + uFlash * 0.6);
      col += (hash(gl_FragCoord.xy + fract(uTime) * 91.0) - 0.5) * 0.025;
      gl_FragColor = vec4(col * built(vW.xz, uBuild, uRadius), 1.0);
    }
  `,
};

const wallShader = {
  vertexShader: /* glsl */ `
    ${GLSL}
    attribute vec4 aOpen;
    uniform float uBuild, uRadius;
    varying vec3 vW, vL, vN, vS;
    varying vec4 vOpen;
    varying float vH, vRise;
    void main() {
      vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vS = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
      vH = w.y;
      vRise = built(w.xz, uBuild, uRadius);
      w.y -= (1.0 - vRise) * vS.y;
      vW = w.xyz;
      vL = position;
      vN = normal;
      vOpen = aOpen;
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uPlayer;
    uniform float uPower, uFlash, uTop;
    varying vec3 vW, vL, vN, vS;
    varying vec4 vOpen;
    varying float vH, vRise;
    const vec3 CYAN = vec3(0.031, 0.992, 0.847);
    const vec3 PINK = vec3(1.0, 0.412, 0.706);
    void main() {
      vec3 c = mix(CYAN, PINK, uPower);
      vec2 d = (0.5 - abs(vL.xz)) * vS.xz;
      float e = 9.0;
      if (vL.x > 0.0 && vOpen.x > 0.25) e = min(e, d.x);
      if (vL.x < 0.0 && vOpen.y > 0.25) e = min(e, d.x);
      if (vL.z > 0.0 && vOpen.z > 0.25) e = min(e, d.y);
      if (vL.z < 0.0 && vOpen.w > 0.25) e = min(e, d.y);
      vec2 toP = vW.xz - uPlayer.xz;
      float light = exp(-dot(toP, toP) * 0.3);
      vec3 col = vec3(0.008);
      if (vN.y > 0.5) {
        col += c * (smoothstep(0.022, 0.006, e) * (0.55 + light * 0.45 + uFlash) + exp(-e * 22.0) * 0.06);
      } else {
        float side = vN.x > 0.5 ? vOpen.x : vN.x < -0.5 ? vOpen.y : vN.z > 0.5 ? vOpen.z : vOpen.w;
        float h = vH;
        float lip = smoothstep(uTop - 0.03, uTop - 0.005, h);
        float bounce = side > 0.75 ? exp(-max(h, 0.0) * 3.2) * (0.16 + light * 0.8) : 0.0;
        col += c * (bounce + lip * step(0.25, side) * 0.35);
        col *= smoothstep(-0.9, 0.0, h) * 0.85 + 0.15;
        if (side > 0.25 && side < 0.75) {
          col += c * (0.035 + exp(-(h + 1.25) * 14.0) * 0.45 + exp(-(uTop - h) * 9.0) * 0.12);
        }
      }
      gl_FragColor = vec4(col * (0.2 + 0.8 * vRise), 1.0);
    }
  `,
};

const groundShader = {
  vertexShader: floorShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform float uRadius, uPower;
    uniform vec2 uHalf;
    varying vec3 vW;
    const vec3 CYAN = vec3(0.031, 0.992, 0.847);
    const vec3 PINK = vec3(1.0, 0.412, 0.706);
    void main() {
      vec2 g = abs(fract(vW.xz + 0.5) - 0.5) / fwidth(vW.xz);
      float line = 1.0 - min(min(g.x, g.y), 1.0);
      float fade = exp(-length(vW.xz) / uRadius * 1.6);
      // Distance outside the slab's footprint: a soft contact shadow under it, the slab's light spilling past its rim.
      float d = length(max(abs(vW.xz) - uHalf, 0.0));
      float shade = smoothstep(0.0, 2.4, d);
      vec3 c = mix(CYAN, PINK, uPower);
      gl_FragColor = vec4(c * (line * fade * 0.07 * shade + exp(-d * 1.4) * 0.07 * step(0.001, d)), 1.0);
    }
  `,
};

const cubeShader = {
  vertexShader: /* glsl */ `
    varying vec3 vP, vN, vV, vW;
    void main() {
      vP = position;
      vN = normalize(normalMatrix * normal);
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vV = -mv.xyz;
      vW = (modelMatrix * vec4(position, 1.0)).xyz;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    ${GLSL}
    uniform float uTime, uPower, uHit, uFade;
    varying vec3 vP, vN, vV, vW;
    void main() {
      vec3 a = abs(vP) * 2.0;
      float hi = max(a.x, max(a.y, a.z));
      float lo = min(a.x, min(a.y, a.z));
      float mid = a.x + a.y + a.z - hi - lo;
      float n = noise(vP * 3.5 + vec3(0.0, uTime * 0.9, uTime * 0.4));
      if (uFade > 0.0 && n + hash3(floor(vP * 9.0)) * 0.4 < uFade * 1.4) discard;

      float edge = smoothstep(0.8, 0.97, mid);
      float frame = smoothstep(0.035, 0.0, abs(mid - 0.62));
      float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.2);
      float scan = 0.5 + 0.5 * sin(vW.y * 90.0 - uTime * 14.0);
      float sweep = exp(-abs(fract(vW.y * 0.7 - uTime * 0.55) - 0.5) * 14.0);
      float energy = smoothstep(0.45, 1.0, n) * (1.0 - smoothstep(0.55, 0.9, mid));

      vec3 c = mix(CYAN, PINK, uPower);
      vec3 col = c * (0.07 + fres * 0.75 + frame * 0.6 + scan * 0.07 + sweep * 0.3 + energy * 0.7 + uHit * 0.4);
      col += mix(c, vec3(1.0), 0.65) * edge * (1.1 + uHit);
      col += c * smoothstep(0.75, 1.2, uFade + n) * 2.0;
      gl_FragColor = vec4(col, 1.0);
    }
  `,
};

const smearShader = {
  vertexShader: cubeShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform float uPower, uAlpha;
    varying vec3 vP, vN, vV, vW;
    const vec3 CYAN = vec3(0.031, 0.992, 0.847);
    const vec3 PINK = vec3(1.0, 0.412, 0.706);
    void main() {
      vec3 a = abs(vP) * 2.0;
      float mid = a.x + a.y + a.z - max(a.x, max(a.y, a.z)) - min(a.x, min(a.y, a.z));
      float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 2.0);
      gl_FragColor = vec4(mix(CYAN, PINK, uPower) * (smoothstep(0.75, 0.97, mid) + fres * 0.4) * uAlpha, 1.0);
    }
  `,
};

const lineShader = {
  vertexShader: /* glsl */ `
    ${GLSL}
    uniform float uTime, uGlitch, uSeed;
    void main() {
      vec3 p = position;
      float tq = floor(uTime * 14.0);
      float burst = step(0.7, hash(vec2(tq, uSeed)));
      p.x += (hash(vec2(floor(p.y * 6.0 + uSeed), tq)) - 0.5) * 0.55 * burst * uGlitch;
      p.z += (hash(vec2(floor(p.y * 4.0 - uSeed), tq + 3.0)) - 0.5) * 0.3 * burst * uGlitch;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform float uAlpha;
    void main() { gl_FragColor = vec4(uColor * uAlpha, 1.0); }
  `,
};

const glowShader = {
  vertexShader: cubeShader.vertexShader,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform float uAlpha;
    varying vec3 vP, vN, vV, vW;
    void main() {
      float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 1.6);
      gl_FragColor = vec4(uColor * (0.12 + fres * 0.9) * uAlpha, 1.0);
    }
  `,
};

const haloShader = {
  vertexShader: /* glsl */ `
    uniform float uSize;
    varying vec2 vUv;
    void main() {
      vUv = uv;
      vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      mv.xy += position.xy * uSize;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform vec3 uColor;
    uniform float uAlpha;
    varying vec2 vUv;
    void main() {
      float d = length(vUv - 0.5) * 2.0;
      float a = exp(-d * d * 5.0) * (1.0 - d) + exp(-d * 22.0) * 0.6;
      gl_FragColor = vec4(uColor * max(a, 0.0) * uAlpha, 1.0);
    }
  `,
};

const pelletShader = {
  vertexShader: /* glsl */ `
    ${GLSL}
    uniform float uTime, uBuild, uRadius;
    varying float vB;
    void main() {
      vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
      vec4 o = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float b = built(o.xz, uBuild - 0.25, uRadius);
      w.xyz = o.xyz + (w.xyz - o.xyz) * b;
      w.y += sin(uTime * 3.0 + o.x * 0.7 + o.z * 1.3) * 0.05;
      vB = 0.5 + 0.5 * sin(uTime * 4.0 + o.x * 0.9 - o.z * 0.6);
      gl_Position = projectionMatrix * viewMatrix * w;
    }
  `,
  fragmentShader: /* glsl */ `
    uniform float uPower;
    varying float vB;
    const vec3 CYAN = vec3(0.031, 0.992, 0.847);
    const vec3 PINK = vec3(1.0, 0.412, 0.706);
    void main() { gl_FragColor = vec4(mix(mix(CYAN, PINK, uPower), vec3(1.0), 0.35 + vB * 0.3), 1.0); }
  `,
};

const particleShader = {
  vertexShader: /* glsl */ `
    attribute float aLife;
    attribute vec3 aColor;
    uniform float uScale;
    varying float vLife;
    varying vec3 vColor;
    void main() {
      vLife = aLife;
      vColor = aColor;
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      gl_PointSize = aLife > 0.0 ? uScale * (0.35 + aLife * 0.65) / -mv.z : 0.0;
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    varying float vLife;
    varying vec3 vColor;
    void main() {
      vec2 c = abs(gl_PointCoord - 0.5) * 2.0;
      gl_FragColor = vec4(vColor * vLife * (1.0 - max(c.x, c.y) * 0.7), 1.0);
    }
  `,
};

const additive = { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending };

function buildMaze(g, mats) {
  const { W, H, maze } = g;
  const ox = (W - 1) / 2;
  const oz = (H - 1) / 2;
  const path = (x, y) => x >= 0 && y >= 0 && x < W && y < H && maze.grid[y * W + x] === 1;
  const side = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? 0.5 : path(x, y) ? 1 : 0);

  const mask = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) mask[i] = maze.grid[i] * 255;
  const maskTex = new THREE.DataTexture(mask, W, H, THREE.RedFormat);
  maskTex.needsUpdate = true;

  const box = new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0);
  const count = W * H - maze.grid.reduce((n, v) => n + v, 0);
  const walls = new THREE.InstancedMesh(box, mats.wall, count);
  const open = new Float32Array(count * 4);
  const m = new THREE.Matrix4();
  let k = 0;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (path(x, y)) continue;
      m.makeScale(half(x) * 2, WALL_TOP + WALL_DEPTH, half(y) * 2).setPosition(x - ox, -WALL_DEPTH, y - oz);
      walls.setMatrixAt(k, m);
      open.set([side(x + 1, y), side(x - 1, y), side(x, y + 1), side(x, y - 1)], k * 4);
      k++;
    }
  box.setAttribute('aOpen', new THREE.InstancedBufferAttribute(open, 4));
  walls.frustumCulled = false;

  const pelletGeo = new THREE.OctahedronGeometry(0.1);
  const slots = [];
  for (let i = 0; i < W * H; i++) if (maze.pellets[i] === 1) slots.push(i);
  const pellets = new THREE.InstancedMesh(pelletGeo, mats.pellet, slots.length);
  const inst = new Int16Array(W * H).fill(-1);
  slots.forEach((i, n) => {
    inst[i] = n;
    pellets.setMatrixAt(n, m.makeScale(1, 1.5, 1).setPosition((i % W) - ox, 0.36, ((i / W) | 0) - oz));
  });
  pellets.frustumCulled = false;

  const floorGeo = new THREE.PlaneGeometry(W - 1 + 2 / 3, H - 1 + 2 / 3).rotateX(-Math.PI / 2);
  return {
    maskTex,
    walls,
    pellets,
    inst,
    floorGeo,
    powers: maze.corners.map(([x, y]) => [x - ox, y - oz, y * W + x]),
    dispose() {
      maskTex.dispose();
      box.dispose();
      pelletGeo.dispose();
      floorGeo.dispose();
      walls.dispose();
      pellets.dispose();
    },
  };
}

const smoothDamp = (s, key, to, time, dt) => {
  const w = 2 / time;
  const x = w * dt;
  const e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  const ch = s[key] - to;
  const tmp = (s.v[key] + w * ch) * dt;
  s.v[key] = (s.v[key] - w * tmp) * e;
  s[key] = to + (ch + tmp) * e;
};

const PARTICLES = 320;

// Pivot on the leading bottom edge: centre = edge + (centre - edge) turned by the eased roll angle.
function rollPose(g, st, p, q, out) {
  const P = g.player;
  const [dx, dz] = DIRS[P.d];
  const e = p - (Math.sin(2 * Math.PI * p) / (2 * Math.PI)) * 0.6;
  st.qRoll.setFromAxisAngle(st.axis.set(dz, 0, -dx), (e * Math.PI) / 2);
  q.multiplyQuaternions(st.qRoll, st.qBase);
  st.r.set(-dx * 0.5, 0.5, -dz * 0.5).applyQuaternion(st.qRoll);
  out.set(P.x - (g.W - 1) / 2 + dx * 0.5 + st.r.x, st.r.y, P.y - (g.H - 1) / 2 + dz * 0.5 + st.r.z);
}

function Scene({ g, fx, step, pointer, reduced, compact }) {
  const { camera, size, gl } = useThree();
  const [ver, setVer] = useState(0);
  const radius = Math.hypot(g.W, g.H) / 2;

  const U = useMemo(
    () => ({
      uTime: { value: 0 },
      uPower: { value: 0 },
      uFlash: { value: 0 },
      uBuild: { value: reduced ? 9 : 0 },
      uRadius: { value: radius },
      uTop: { value: WALL_TOP },
      uPlayer: { value: new THREE.Vector3() },
      uWave: { value: new THREE.Vector4(0, 0, -99, 0) },
      uSize: { value: new THREE.Vector2(g.W, g.H) },
      uMask: { value: null },
      uHeat: { value: null },
    }),
    [g, radius, reduced]
  );

  const heat = useMemo(() => {
    const data = new Uint8Array(g.W * g.H);
    const tex = new THREE.DataTexture(data, g.W, g.H, THREE.RedFormat);
    tex.magFilter = tex.minFilter = THREE.LinearFilter;
    tex.needsUpdate = true;
    U.uHeat.value = tex;
    return { data, tex, f: new Float32Array(g.W * g.H) };
  }, [g, U]);

  const mats = useMemo(() => {
    const pick = (...keys) => Object.fromEntries(keys.map((k) => [k, U[k]]));
    const lineMat = (color, seed) =>
      new THREE.ShaderMaterial({ ...lineShader, ...additive, uniforms: { uTime: U.uTime, uColor: { value: color.clone() }, uAlpha: { value: 1 }, uGlitch: { value: 0 }, uSeed: { value: seed } } });
    const glowMat = (color) => new THREE.ShaderMaterial({ ...glowShader, ...additive, uniforms: { uColor: { value: color.clone() }, uAlpha: { value: 1 } } });
    const haloMat = (color, size) =>
      new THREE.ShaderMaterial({ ...haloShader, ...additive, depthTest: false, uniforms: { uColor: { value: color.clone() }, uAlpha: { value: 1 }, uSize: { value: size } } });
    return {
      floor: new THREE.ShaderMaterial({ ...floorShader, uniforms: pick('uMask', 'uHeat', 'uSize', 'uPlayer', 'uWave', 'uTime', 'uPower', 'uFlash', 'uBuild', 'uRadius') }),
      wall: new THREE.ShaderMaterial({ ...wallShader, uniforms: pick('uPlayer', 'uPower', 'uFlash', 'uBuild', 'uRadius', 'uTop') }),
      ground: new THREE.ShaderMaterial({ ...groundShader, uniforms: { ...pick('uRadius', 'uPower'), uHalf: { value: new THREE.Vector2(g.W / 2 + 0.6, g.H / 2 + 0.6) } } }),
      pellet: new THREE.ShaderMaterial({ ...pelletShader, uniforms: pick('uTime', 'uBuild', 'uRadius', 'uPower') }),
      cube: new THREE.ShaderMaterial({ ...cubeShader, uniforms: { uTime: U.uTime, uPower: U.uPower, uHit: { value: 0 }, uFade: { value: 0 } } }),
      smear: SMEAR.map((_, i) => new THREE.ShaderMaterial({ ...smearShader, ...additive, uniforms: { uPower: U.uPower, uAlpha: { value: 0.32 - i * 0.09 } } })),
      particles: new THREE.ShaderMaterial({ ...particleShader, ...additive, uniforms: { uScale: { value: 1 } } }),
      chaserLines: CHASER_COLORS.map((c, i) => lineMat(c, i * 7.3)),
      chaserGlow: CHASER_COLORS.map((c) => glowMat(c)),
      powerLines: [0, 1, 2, 3].map((i) => lineMat(PINK, 20 + i)),
      powerGlow: glowMat(PINK),
      playerHalo: haloMat(CYAN, 4.8),
      chaserHalos: CHASER_COLORS.map((c) => haloMat(c, 2.2)),
      powerHalos: [0, 1, 2, 3].map(() => haloMat(PINK, 1.9)),
    };
  }, [U, g.W, g.H]);

  const geos = useMemo(
    () => ({
      cube: new THREE.BoxGeometry(1, 1, 1),
      halo: new THREE.PlaneGeometry(1, 1),
      ground: new THREE.PlaneGeometry(400, 400).rotateX(-Math.PI / 2),
      chasers: [new THREE.OctahedronGeometry(0.42), new THREE.TetrahedronGeometry(0.5), new THREE.IcosahedronGeometry(0.4)],
      chaserEdges: [new THREE.OctahedronGeometry(0.42), new THREE.TetrahedronGeometry(0.5), new THREE.IcosahedronGeometry(0.4)].map((x) => new THREE.EdgesGeometry(x)),
      power: new THREE.OctahedronGeometry(0.17),
      powerEdges: new THREE.EdgesGeometry(new THREE.IcosahedronGeometry(0.3)),
    }),
    []
  );

  const maze = useMemo(() => buildMaze(g, mats), [g, mats, ver]);
  U.uMask.value = maze.maskTex;
  useEffect(() => () => maze.dispose(), [maze]);
  useEffect(
    () => () => {
      for (const v of Object.values(mats)) for (const m of [v].flat()) m.dispose();
      for (const v of Object.values(geos)) for (const x of [v].flat()) x.dispose();
      heat.tex.dispose();
    },
    [mats, geos, heat]
  );

  const sparks = useMemo(() => {
    const geo = new THREE.BufferGeometry();
    const pos = new Float32Array(PARTICLES * 3);
    const col = new Float32Array(PARTICLES * 3);
    const life = new Float32Array(PARTICLES);
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aColor', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aLife', new THREE.BufferAttribute(life, 1).setUsage(THREE.DynamicDrawUsage));
    const points = new THREE.Points(geo, mats.particles);
    points.frustumCulled = false;
    return { geo, points, pos, col, life, vel: new Float32Array(PARTICLES * 3), decay: new Float32Array(PARTICLES), next: 0 };
  }, [mats]);
  useEffect(() => () => sparks.geo.dispose(), [sparks]);

  const refs = useRef({ smear: [], chasers: [], chaserHalos: [], chaserLines: [], powers: [], powerHalos: [] }).current;
  const st = useRef({
    qBase: new THREE.Quaternion(),
    qRoll: new THREE.Quaternion(),
    axis: new THREE.Vector3(),
    r: new THREE.Vector3(),
    r2: new THREE.Vector3(),
    sq: 0,
    sqV: 0,
    hit: 0,
    fade: 0,
    fadeTo: 0,
    shake: 0,
    cam: { x: 0, z: 0, yaw: 0, pitch: 0, zoom: 0, v: { x: 0, z: 0, yaw: 0, pitch: 0, zoom: 0 } },
  }).current;

  useEffect(() => {
    const emit = (x, y, z, color, n, speed, up = 2.5) => {
      for (let k = 0; k < n; k++) {
        const i = sparks.next;
        sparks.next = (i + 1) % PARTICLES;
        const a = Math.random() * Math.PI * 2;
        const s = speed * (0.35 + Math.random() * 0.65);
        sparks.pos.set([x, y, z], i * 3);
        sparks.vel.set([Math.cos(a) * s, up * (0.4 + Math.random()), Math.sin(a) * s], i * 3);
        sparks.col.set([color.r, color.g, color.b], i * 3);
        sparks.life[i] = 1;
        sparks.decay[i] = 1.2 + Math.random() * 1.3;
      }
    };
    const wave = (x, z, strength) => U.uWave.value.set(x, z, U.uTime.value, strength);
    fx.current = (type, x, z, n) => {
      if (type === 'maze') {
        setVer((v) => v + 1);
        U.uBuild.value = reduced ? 9 : 0;
        heat.f.fill(0);
      } else if (type === 'roll') {
        if (reduced) return;
        const [dx, dz] = DIRS[n];
        st.qRoll.setFromAxisAngle(st.axis.set(dz, 0, -dx), Math.PI / 2);
        st.qBase.premultiply(st.qRoll).normalize();
        st.sqV += 0.5;
      } else if (type === 'eat') {
        const i = maze.inst[n];
        if (i >= 0) {
          maze.pellets.setMatrixAt(i, HIDDEN);
          maze.pellets.instanceMatrix.needsUpdate = true;
        }
        emit(x, 0.4, z, Math.random() < 0.25 ? WHITE : CYAN, reduced ? 2 : 7, 2.2);
        st.hit = Math.max(st.hit, 0.5);
      } else if (type === 'power') {
        emit(x, 0.5, z, PINK, reduced ? 6 : 40, 4.5, 4);
        wave(x, z, 1);
        U.uFlash.value = 1;
        st.hit = 1;
      } else if (type === 'chomp') {
        emit(x, 0.6, z, PINK, reduced ? 6 : 34, 5, 4);
        emit(x, 0.6, z, WHITE, reduced ? 0 : 12, 3, 3);
        wave(x, z, 0.8);
        st.shake = reduced ? 0 : 0.25;
      } else if (type === 'die') {
        emit(x, 0.5, z, CYAN, reduced ? 10 : 90, 6, 5);
        emit(x, 0.5, z, WHITE, reduced ? 0 : 24, 3, 6);
        wave(x, z, 1.2);
        st.shake = reduced ? 0 : 0.6;
        st.fadeTo = 1;
      } else if (type === 'reset') {
        st.qBase.identity();
        st.fade = 1;
        st.fadeTo = 0;
      } else if (type === 'stop') {
        st.sqV += 1.8;
      } else if (type === 'clear') {
        wave(x, z, 1.6);
        U.uFlash.value = 1.4;
        emit(x, 0.6, z, CYAN, reduced ? 10 : 70, 7, 6);
      }
    };
    return () => (fx.current = null);
  }, [fx, sparks, U, maze, heat, st, reduced]);

  // Camera distance that frames the slab's top corners at `margin` of the viewport. Attract frames the whole board;
  // play dollies in past the frame (more on phones) and the camera follows the cube to reach the edges.
  const fit = useMemo(() => {
    const fov = compact ? 42 : 36;
    const cam = new THREE.PerspectiveCamera(fov, size.width / size.height, 0.5, 500);
    const corners = [-1, 1].flatMap((sx) => [-1, 1].map((sz) => new THREE.Vector3((sx * g.W) / 2 + sx * 0.4, WALL_TOP, (sz * g.H) / 2 + sz * 0.4)));
    const v = new THREE.Vector3();
    const solve = (elev, margin) => {
      const spill = (D) => {
        cam.position.set(0, Math.sin(elev) * D, Math.cos(elev) * D);
        cam.lookAt(0, 0, 0);
        cam.updateMatrixWorld();
        return Math.max(...corners.map((c) => (v.copy(c).project(cam), Math.max(Math.abs(v.x), Math.abs(v.y)))));
      };
      let lo = 2;
      let hi = 300;
      for (let i = 0; i < 32; i++) {
        const mid = (lo + hi) / 2;
        if (spill(mid) > margin) lo = mid;
        else hi = mid;
      }
      return hi;
    };
    const idle = { elev: compact ? 1.12 : 0.98, D: 0 };
    const play = { elev: compact ? 1.0 : 0.9, D: 0 };
    idle.D = solve(idle.elev, 0.92);
    play.D = solve(play.elev, compact ? 1.5 : 1.25);
    return { fov, idle, play, fx: compact ? 0.5 : 0.32, fz: compact ? 0.42 : 0.3 };
  }, [size.width, size.height, compact, g.W, g.H]);

  useEffect(() => {
    camera.fov = fit.fov;
    camera.near = 0.5;
    camera.far = fit.idle.D * 4;
    camera.updateProjectionMatrix();
  }, [camera, fit]);

  const cubeGroup = useRef(null);
  const cube = useRef(null);
  const playerHalo = useRef(null);

  useFrame((_, delta) => {
    const dt = Math.min(delta, 1 / 20);
    const t = (U.uTime.value += dt);
    step.current(dt);
    const { W } = g;
    const P = g.player;

    const rolling = P.moving && !reduced && g.phase !== 'dying';
    for (let i = 0; i < SMEAR.length; i++) {
      const m = refs.smear[i];
      const p = P.p - SMEAR[i];
      m.visible = rolling && p > 0 && st.fade < 0.05;
      if (m.visible) rollPose(g, st, p, m.quaternion, m.position);
    }
    let cx = P.wx;
    let cy = 0.5;
    let cz = P.wz;
    if (rolling) {
      rollPose(g, st, P.p, cube.current.quaternion, st.r2);
      cx = st.r2.x;
      cy = st.r2.y;
      cz = st.r2.z;
    } else cube.current.quaternion.copy(st.qBase);

    st.sqV += (-260 * st.sq - 16 * st.sqV) * dt;
    st.sq += st.sqV * dt;
    const sq = THREE.MathUtils.clamp(st.sq, -0.12, 0.2);
    cubeGroup.current.position.set(cx, 0, cz);
    cubeGroup.current.scale.set(1 + sq * 0.6, 1 - sq, 1 + sq * 0.6);
    cube.current.position.y = cy;
    U.uPlayer.value.set(cx, cy, cz);

    st.fade += (st.fadeTo - st.fade) * Math.min(1, dt * (st.fadeTo ? 2.2 : 5));
    st.hit *= Math.exp(-dt * 7);
    mats.cube.uniforms.uFade.value = st.fade < 0.01 ? 0 : st.fade;
    mats.cube.uniforms.uHit.value = st.hit;
    playerHalo.current.position.set(cx, cy, cz);

    const scared = g.fright > 0;
    const flicker = scared && g.fright < 1.8 && Math.floor(t * 8) % 2 === 0;
    const power = scared ? (flicker ? 0.35 : 1) : 0;
    U.uPower.value += (power - U.uPower.value) * Math.min(1, dt * 6);
    U.uFlash.value *= Math.exp(-dt * 3.5);
    if (U.uBuild.value < 3) U.uBuild.value += dt * 1.05;
    mats.playerHalo.uniforms.uColor.value.lerpColors(CYAN, PINK, U.uPower.value);
    mats.playerHalo.uniforms.uAlpha.value = (0.8 + st.hit * 0.5) * (1 - st.fade);

    const decay = Math.exp(-dt * 1.7);
    const f = heat.f;
    for (let i = 0; i < f.length; i++) f[i] *= decay;
    const from = P.y * W + P.x;
    f[from] = Math.max(f[from], P.moving ? 1 - P.p : 1);
    if (P.moving) {
      const to = from + DIRS[P.d][1] * W + DIRS[P.d][0];
      f[to] = Math.max(f[to], P.p);
    }
    for (let i = 0; i < f.length; i++) heat.data[i] = f[i] * 255;
    heat.tex.needsUpdate = true;

    for (let i = 0; i < g.chasers.length; i++) {
      const c = g.chasers[i];
      const grp = refs.chasers[i];
      const bob = Math.sin(t * 3 + i * 2.1) * 0.07;
      grp.position.set(c.wx, c.state === 'eyes' ? 0.45 : 0.62 + bob, c.wz);
      grp.rotation.y += dt * (c.fright ? 3.5 : 1.3 + i * 0.3);
      grp.rotation.x = Math.sin(t * 1.7 + i) * 0.25;
      const line = mats.chaserLines[i].uniforms;
      const glow = mats.chaserGlow[i].uniforms;
      const near = Math.hypot(c.wx - cx, c.wz - cz);
      line.uGlitch.value = reduced ? 0 : c.fright ? 0.25 : 0.2 + Math.max(0, 1 - near / 4) * 1.1;
      const col = c.state === 'eyes' ? WHITE : c.fright ? (flicker ? WHITE : SCARED) : CHASER_COLORS[i];
      line.uColor.value.copy(col);
      glow.uColor.value.copy(col);
      line.uAlpha.value = c.state === 'eyes' ? 0.35 : c.fright ? 0.9 : 1;
      glow.uAlpha.value = c.state === 'eyes' ? 0 : c.fright ? 0.6 : 0.9;
      grp.scale.setScalar(c.state === 'eyes' ? 0.45 : 1);
      const h = refs.chaserHalos[i];
      h.position.copy(grp.position);
      const hu = mats.chaserHalos[i].uniforms;
      hu.uColor.value.copy(c.fright ? SCARED : CHASER_COLORS[i]);
      hu.uAlpha.value = c.state === 'eyes' ? 0.1 : c.fright ? 0.35 : 0.6;
    }

    for (let i = 0; i < maze.powers.length; i++) {
      const [x, z, idx] = maze.powers[i];
      const grp = refs.powers[i];
      const on = g.maze.pellets[idx] === 2;
      const pulse = 1 + Math.sin(t * 5 + i) * 0.14;
      grp.visible = refs.powerHalos[i].visible = on;
      grp.position.set(x, 0.48 + Math.sin(t * 2.4 + i) * 0.06, z);
      grp.rotation.set(t * 0.9 + i, t * 1.3, 0);
      const ready = Math.min(1, Math.max(0, U.uBuild.value - 0.6));
      grp.scale.setScalar(pulse * ready);
      refs.powerHalos[i].position.copy(grp.position);
      mats.powerHalos[i].uniforms.uAlpha.value = 0.6 * pulse * ready;
    }

    const { pos, vel, life, decay: dk } = sparks;
    for (let i = 0; i < PARTICLES; i++) {
      if (life[i] <= 0) continue;
      const j = i * 3;
      vel[j + 1] -= 9 * dt;
      pos[j] += vel[j] * dt;
      pos[j + 1] += vel[j + 1] * dt;
      pos[j + 2] += vel[j + 2] * dt;
      if (pos[j + 1] < 0.04) {
        pos[j + 1] = 0.04;
        vel[j + 1] *= -0.35;
        vel[j] *= 0.6;
        vel[j + 2] *= 0.6;
      }
      life[i] = Math.max(0, life[i] - dt * dk[i]);
    }
    sparks.geo.attributes.position.needsUpdate = true;
    sparks.geo.attributes.aLife.needsUpdate = true;
    sparks.geo.attributes.aColor.needsUpdate = true;
    mats.particles.uniforms.uScale.value = (0.13 * size.height * gl.getPixelRatio()) / (2 * Math.tan((fit.fov * Math.PI) / 360));

    const C = st.cam;
    const lag = reduced ? 0.12 : 0.5;
    smoothDamp(C, 'zoom', g.auto ? 0 : 1, reduced ? 0.05 : 0.9, dt);
    const k = C.zoom;
    const ahead = P.moving ? 1.6 : 0;
    smoothDamp(C, 'x', (cx + DIRS[P.d][0] * ahead) * fit.fx * k, lag, dt);
    smoothDamp(C, 'z', (cz + DIRS[P.d][1] * ahead) * fit.fz * k, lag, dt);
    smoothDamp(C, 'yaw', reduced ? 0 : pointer.current.x * 0.11, 0.6, dt);
    smoothDamp(C, 'pitch', reduced ? 0 : pointer.current.y * 0.06, 0.6, dt);
    const D = fit.idle.D + (fit.play.D - fit.idle.D) * k;
    const el = fit.idle.elev + (fit.play.elev - fit.idle.elev) * k + C.pitch;
    st.shake *= Math.exp(-dt * 6);
    const sh = st.shake;
    camera.position.set(
      C.x + Math.sin(C.yaw) * Math.cos(el) * D + (Math.random() - 0.5) * sh,
      Math.sin(el) * D + (Math.random() - 0.5) * sh,
      C.z + Math.cos(C.yaw) * Math.cos(el) * D + (Math.random() - 0.5) * sh
    );
    camera.lookAt(C.x, 0, C.z);
  });

  return (
    <>
      <mesh geometry={geos.ground} material={mats.ground} position={[0, GROUND, 0]} />
      <mesh geometry={maze.floorGeo} material={mats.floor} />
      <primitive object={maze.walls} />
      <primitive object={maze.pellets} />
      {SMEAR.map((_, i) => (
        <mesh key={i} ref={(el) => (refs.smear[i] = el)} geometry={geos.cube} material={mats.smear[i]} visible={false} />
      ))}
      <group ref={cubeGroup}>
        <mesh ref={cube} geometry={geos.cube} material={mats.cube} />
      </group>
      {g.chasers.map((c, i) => (
        <group key={i} ref={(el) => (refs.chasers[i] = el)}>
          <mesh geometry={geos.chasers[i]} material={mats.chaserGlow[i]} />
          <lineSegments geometry={geos.chaserEdges[i]} material={mats.chaserLines[i]} />
        </group>
      ))}
      {maze.powers.map((_, i) => (
        <group key={i} ref={(el) => (refs.powers[i] = el)}>
          <mesh geometry={geos.power} material={mats.powerGlow} />
          <lineSegments geometry={geos.powerEdges} material={mats.powerLines[i]} />
        </group>
      ))}
      <primitive object={sparks.points} />
      <mesh ref={playerHalo} geometry={geos.halo} material={mats.playerHalo} renderOrder={10} />
      {g.chasers.map((_, i) => (
        <mesh key={i} ref={(el) => (refs.chaserHalos[i] = el)} geometry={geos.halo} material={mats.chaserHalos[i]} renderOrder={10} />
      ))}
      {maze.powers.map((_, i) => (
        <mesh key={i} ref={(el) => (refs.powerHalos[i] = el)} geometry={geos.halo} material={mats.powerHalos[i]} renderOrder={10} />
      ))}
    </>
  );
}

// R3F's shared loop runs every root in one tick, so a throw in another canvas's useFrame would freeze this one;
// the board renders only its own root from a private rAF instead.
function Driver({ run }) {
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    if (run === 'never') return;
    let raf = requestAnimationFrame(function loop(t) {
      advance(t / 1000, false);
      if (run === 'always') raf = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(raf);
  }, [run, advance]);
  return null;
}

/**
 * Live 3D board for the Cube Run band; `step.current(dt)` advances the game from inside the render loop.
 * `run` is 'always', 'never', or 'demand' for a single still frame.
 */
export default function MazeCanvas({ g, fx, step, pointer, run, reduced, compact }) {
  return (
    <Canvas
      className="maze-canvas"
      frameloop="never"
      dpr={[1, 1.5]}
      flat
      linear
      gl={{ antialias: true, powerPreference: 'high-performance' }}
      camera={{ fov: 30, position: [0, 20, 20] }}
      aria-hidden="true"
    >
      <color attach="background" args={['#050505']} />
      <Scene g={g} fx={fx} step={step} pointer={pointer} reduced={reduced} compact={compact} />
      <Driver run={run} />
    </Canvas>
  );
}
