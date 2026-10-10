import * as THREE from 'three';
import { FontLoader } from 'three/addons/loaders/FontLoader.js';
import { TextGeometry } from 'three/addons/geometries/TextGeometry.js';
import { MeshSurfaceSampler } from 'three/addons/math/MeshSurfaceSampler.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import fontJson from 'three/examples/fonts/helvetiker_bold.typeface.json';

const VERT = /* glsl */ `
  varying vec3 vW; varying vec3 vN;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vW = wp.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

// Hover state: pink screen-space halftone dots sized by facing ratio, wiping in bottom-up behind a cyan front.
const FRAG_HALF = /* glsl */ `
  uniform float uT; uniform float uPr; uniform vec3 uCam; uniform float uMix;
  varying vec3 vW; varying vec3 vN;
  void main() {
    vec3 n = normalize(vN);
    float face = clamp(dot(n, normalize(uCam - vW)), 0.0, 1.0);
    float rim = pow(1.0 - face, 3.0);
    vec2 gv = fract(gl_FragCoord.xy / (3.0 * uPr)) - 0.5;
    float scanY = sin(uT * 0.5) * 0.46;
    float band = exp(-abs(vW.y - scanY) * 14.0);
    float rad = 0.07 + 0.33 * face + 0.20 * band;
    float dm = 1.0 - smoothstep(rad - 0.10, rad + 0.06, length(gv));
    vec3 col = vec3(1.0, 0.41, 0.71) * dm * (0.25 + 0.75 * face)
             + vec3(1.0, 0.55, 0.80) * dm * band * 1.25
             + vec3(0.55, 0.08, 0.35) * rim * 0.5;
    float ny = clamp(vW.y * 0.9 + 0.5, 0.0, 1.0);
    float prog = uMix * 1.18;
    float wipe = smoothstep(ny - 0.20, ny, prog);
    float edge = exp(-abs(ny - prog) * 8.0) * (1.0 - step(1.0, uMix));
    col = col * wipe + vec3(0.03, 0.99, 0.85) * edge * 1.2;
    gl_FragColor = vec4(col * uMix, 1.0);
  }
`;

// Default state: cyan lidar point cloud; points swell and brighten inside the sweeping scan band.
const VERT_LID = /* glsl */ `
  uniform float uT; uniform float uPr;
  varying float vB;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    float band = exp(-abs(wp.y - sin(uT * 0.5) * 0.48) * 8.0);
    vB = 0.30 + 1.15 * band;
    gl_PointSize = uPr * (1.5 + band * 2.0);
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;
const FRAG_LID = /* glsl */ `
  uniform float uMix; uniform float uGain;
  varying float vB;
  void main() { gl_FragColor = vec4(vec3(0.03, 0.99, 0.85) * vB * uGain * (1.0 - uMix * 0.85), 1.0); }
`;

function monogram() {
  const font = new FontLoader().parse(fontJson);
  const g = new TextGeometry('RMR', { font, size: 0.42, depth: 0.22, curveSegments: 6, bevelEnabled: true, bevelThickness: 0.03, bevelSize: 0.015, bevelSegments: 3 });
  g.center();
  return g;
}

function gradCap() {
  const parts = [];
  const board = new THREE.BoxGeometry(1.3, 0.05, 1.3);
  board.rotateY(Math.PI / 4);
  board.translate(0, 0.28, 0);
  parts.push(board);
  const crown = new THREE.CylinderGeometry(0.42, 0.46, 0.4, 48, 1, true);
  crown.translate(0, 0.06, 0);
  parts.push(crown);
  const button = new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16);
  button.translate(0, 0.33, 0);
  parts.push(button);
  const cord = new THREE.CylinderGeometry(0.012, 0.012, 0.62, 8);
  cord.rotateZ(Math.PI / 2.6);
  cord.translate(0.26, 0.22, 0.26);
  parts.push(cord);
  const tassel = new THREE.CylinderGeometry(0.035, 0.06, 0.32, 12);
  tassel.translate(0.5, 0.0, 0.36);
  parts.push(tassel);
  const merged = mergeGeometries(parts.map((p) => p.toNonIndexed()));
  merged.center();
  return merged;
}

function fit(geo, height) {
  geo.computeBoundingBox();
  const bb = geo.boundingBox;
  const k = height / Math.max(bb.max.y - bb.min.y, bb.max.x - bb.min.x);
  geo.scale(k, k, k);
  geo.computeVertexNormals();
  return geo;
}

function pointCloud(geo, count) {
  const sampler = new MeshSurfaceSampler(new THREE.Mesh(geo)).build();
  const pts = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  for (let i = 0; i < count; i++) {
    sampler.sample(v);
    pts.set([v.x, v.y, v.z], i * 3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  return g;
}

const MODELS = {
  monogram: () => ({ geo: fit(monogram(), 1.15), gain: 1.1, pts: 26000 }),
  cap: () => ({ geo: fit(gradCap(), 0.95), gain: 1.2, pts: 24000 }),
};

/** Renders each `{ stage, model }` into a 2D canvas inside its stage. Returns a dispose function. */
export function initScanHeads(entries, section) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, stencil: false });
  renderer.setClearColor(0x000000, 0);
  renderer.setPixelRatio(1);
  const camera = new THREE.PerspectiveCamera(26, 1.26, 0.1, 20);
  camera.position.set(0, 0.02, 2.34);
  camera.lookAt(0, 0, 0);
  const U = { uT: { value: 0 }, uPr: { value: 1 }, uCam: { value: camera.position.clone() }, uMix: { value: 0 }, uGain: { value: 1 } };
  const matHalf = new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG_HALF, uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const matLid = new THREE.ShaderMaterial({ vertexShader: VERT_LID, fragmentShader: FRAG_LID, uniforms: U, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending });

  const views = entries.map(({ stage, model }) => {
    const c = document.createElement('canvas');
    c.className = 'scan-canvas';
    stage.prepend(c);
    const { geo, gain, pts } = MODELS[model]();
    const g = new THREE.Group();
    g.add(new THREE.Mesh(geo, matHalf), new THREE.Points(pointCloud(geo, pts), matLid));
    const scene = new THREE.Scene();
    scene.add(g);
    const v = { stage, c, ctx: c.getContext('2d'), scene, g, gain, w: 2, h: 2, yaw: 0, pit: 0, tyaw: 0, tpit: 0, mix: 0, tmix: 0, spin: 0, rows: [], at: 0 };
    stage.addEventListener('pointermove', (e) => {
      const r = stage.getBoundingClientRect();
      v.tyaw = ((e.clientX - r.left) / r.width - 0.5) * 1.05;
      v.tpit = ((e.clientY - r.top) / r.height - 0.5) * 0.45;
    });
    stage.addEventListener('pointerenter', () => (v.tmix = 1));
    stage.addEventListener('pointerleave', () => Object.assign(v, { tmix: 0, tyaw: 0, tpit: 0 }));
    return v;
  });

  let dpr = 1;
  const size = () => {
    const r = views[0].stage.getBoundingClientRect();
    dpr = Math.min(devicePixelRatio || 1, 2);
    const w = Math.max(2, Math.round(r.width * dpr));
    const h = Math.max(2, Math.round(r.height * dpr));
    for (const v of views) {
      v.w = v.c.width = w;
      v.h = v.c.height = h;
    }
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    U.uPr.value = dpr;
  };
  size();
  const ro = new ResizeObserver(size);
  ro.observe(views[0].stage);

  let visible = false;
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { rootMargin: '140px' });
  io.observe(section);

  let t = 0;
  let raf;
  const scanPoint = new THREE.Vector3();
  const draw = () => {
    raf = requestAnimationFrame(draw);
    if (!visible || document.hidden) return;
    t += 0.016;
    U.uT.value = t;
    for (const v of views) {
      v.yaw += (v.tyaw - v.yaw) * 0.09;
      v.pit += (v.tpit - v.pit) * 0.09;
      v.mix += (v.tmix - v.mix) * 0.18;
      U.uMix.value = v.mix;
      U.uGain.value = v.gain;
      v.spin += 0.016 * (0.1 + 0.85 * (0.5 - 0.5 * Math.cos(v.spin)));
      v.g.rotation.y = v.spin + v.yaw;
      v.g.rotation.x = v.pit;
      renderer.render(v.scene, camera);
      const { ctx, w, h } = v;
      ctx.clearRect(0, 0, w, h);
      ctx.drawImage(renderer.domElement, 0, 0);

      if (v.mix > 0.06) {
        if (t > v.at) {
          v.rows = [];
          if (Math.random() < 0.3 + 0.45 * v.mix) {
            for (let i = 0, n = 1 + ((Math.random() * 3) | 0); i < n; i++) v.rows.push([(Math.random() * h) | 0, (4 + Math.random() * 14) | 0, (Math.random() - 0.5) * 22 * dpr]);
          }
          v.at = t + 0.22 + Math.random() * 0.5;
        }
        for (const [y, rh, dx] of v.rows) {
          ctx.clearRect(0, y, w, rh);
          ctx.drawImage(renderer.domElement, 0, y, w, rh, dx, y, w, rh);
        }
      } else v.rows = [];

      const la = 1 - v.mix * 0.35;
      scanPoint.set(0, Math.sin(t * 0.5) * 0.48, 0).project(camera);
      const sy = (1 - (scanPoint.y * 0.5 + 0.5)) * h;
      const gh = 22 * dpr;
      const grd = ctx.createLinearGradient(0, sy - gh, 0, sy + gh);
      grd.addColorStop(0, 'rgba(8,253,216,0)');
      grd.addColorStop(0.5, `rgba(8,253,216,${(0.12 * la).toFixed(3)})`);
      grd.addColorStop(1, 'rgba(8,253,216,0)');
      ctx.fillStyle = grd;
      ctx.fillRect(0, sy - gh, w, gh * 2);
      ctx.strokeStyle = `rgba(8,253,216,${(0.38 * la).toFixed(3)})`;
      ctx.lineWidth = Math.max(0.5, dpr * 0.8);
      ctx.beginPath();
      ctx.moveTo(0, sy + 0.5);
      ctx.lineTo(w, sy + 0.5);
      ctx.stroke();
      ctx.fillStyle = `rgba(255,105,180,${(0.9 * la).toFixed(3)})`;
      ctx.fillRect(0, sy - 2, 3 * dpr, 5);
      ctx.fillRect(w - 3 * dpr, sy - 2, 3 * dpr, 5);
    }
  };
  raf = requestAnimationFrame(draw);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    views.forEach((v) => v.c.remove());
    renderer.dispose();
  };
}
