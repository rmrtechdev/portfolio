import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const CODE = [
  '# views.py',
  'class ToolCall(View):',
  '    def post(self, request):',
  '        msg = json.loads(request.body)',
  '        reply = ollama.chat(',
  "            model='llama3.2',",
  '            messages=msg,',
  '            tools=TOOLS,',
  '        )',
  '        return run_tools(reply)',
  '',
  '// Globe.jsx',
  'export default function Globe() {',
  '  return <Canvas dpr={1}>',
  '    <Earth spin />',
  '  </Canvas>;',
  '}',
];

function screenTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 384;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#04070a';
  ctx.fillRect(0, 0, 512, 384);
  ctx.font = '15px monospace';
  CODE.forEach((line, i) => {
    ctx.fillStyle = /^(#|\/\/)/.test(line) ? '#a3b8b1' : /^(class|export)/.test(line) ? '#ff69b4' : '#9ad8c4';
    ctx.fillText(line, 22, 30 + i * 20);
  });
  ctx.fillStyle = '#08fdd8';
  ctx.fillRect(22, 30 + CODE.length * 20 - 12, 9, 15);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildWorkstation() {
  const plastic = new THREE.MeshStandardMaterial({ color: '#5a5a60', roughness: 0.5, metalness: 0.15 });
  const darker = new THREE.MeshStandardMaterial({ color: '#36363a', roughness: 0.65 });
  const keyMat = new THREE.MeshStandardMaterial({ color: '#2c2c30', roughness: 0.6 });
  const screen = new THREE.MeshBasicMaterial({ map: screenTexture(), toneMapped: false });
  const g = new THREE.Group();

  const body = new THREE.Mesh(new RoundedBoxGeometry(1.6, 1.05, 0.12, 4, 0.05), plastic);
  body.position.y = 0.72;
  const glass = new THREE.Mesh(new THREE.PlaneGeometry(1.48, 0.93), screen);
  glass.position.set(0, 0.72, 0.062);
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.42, 20), darker);
  neck.position.set(0, 0.06, -0.06);
  const foot = new THREE.Mesh(new RoundedBoxGeometry(0.62, 0.04, 0.38, 3, 0.02), darker);
  foot.position.set(0, -0.15, -0.02);
  const board = new THREE.Mesh(new RoundedBoxGeometry(1.42, 0.05, 0.46, 3, 0.02), plastic);
  board.position.set(0, -0.15, 0.62);

  const cols = 14;
  const rows = 5;
  const keys = new THREE.InstancedMesh(new RoundedBoxGeometry(0.08, 0.03, 0.07, 2, 0.01), keyMat, cols * rows);
  const m = new THREE.Matrix4();
  let k = 0;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      m.makeTranslation(-0.6 + c * 0.093 + (r % 2) * 0.02, -0.11, 0.45 + r * 0.084);
      keys.setMatrixAt(k++, m);
    }
  const mouse = new THREE.Mesh(new THREE.CapsuleGeometry(0.06, 0.08, 6, 12), plastic);
  mouse.rotation.x = Math.PI / 2;
  mouse.scale.set(1, 1, 0.55);
  mouse.position.set(0.95, -0.13, 0.62);

  g.add(body, glass, neck, foot, board, keys, mouse);
  const meshes = [body, neck, foot, board, keys, mouse];
  meshes.forEach((mesh) => (mesh.userData.original = mesh.material));
  return { group: g, meshes };
}

// Bottom-up materialize: quantized hash breaks the front into voxels, edge burns cyan→pink with scan arcs.
function addReveal(material, R) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, R);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vRv;\nuniform mat4 uRigInv;')
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
        vec4 rvW = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
          rvW = instanceMatrix * rvW;
        #endif
        vRv = (uRigInv * modelMatrix * rvW).xyz;`
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec3 vRv;
        uniform float uReveal; uniform float uMinY; uniform float uMaxY; uniform vec3 uEdgeA; uniform vec3 uEdgeB;
        float rvHash(vec3 p) { return fract(sin(dot(floor(p * vec3(8.0, 10.0, 8.0)), vec3(12.9898, 78.233, 45.164))) * 43758.5453); }`
      )
      .replace(
        '#include <dithering_fragment>',
        `#include <dithering_fragment>
        float rvH = clamp((vRv.y - uMinY) / max(0.001, uMaxY - uMinY), 0.0, 1.0);
        float rvN = rvHash(vRv);
        float rvField = uReveal * 1.4 - 0.2 - rvH + (rvN - 0.5) * 0.16 + vRv.x * 0.014;
        if (rvField < 0.0) discard;
        float rvEdge = 1.0 - smoothstep(0.0, 0.09, rvField);
        float rvScan = smoothstep(0.58, 0.96, sin(vRv.y * 34.0 + vRv.x * 15.0 + uReveal * 18.0) * 0.5 + 0.5) * rvEdge;
        float rvArc = smoothstep(0.74, 0.98, sin(vRv.y * 19.0 + vRv.z * 27.0 + uReveal * 16.0) * sin(vRv.x * 24.0 - vRv.z * 16.0 - uReveal * 13.0) * 0.5 + 0.5) * rvEdge;
        gl_FragColor.rgb = mix(gl_FragColor.rgb * 0.68, gl_FragColor.rgb, smoothstep(0.0, 0.16, rvField));
        gl_FragColor.rgb += mix(uEdgeA, uEdgeB, rvN) * rvEdge * 0.92 + uEdgeA * rvScan * 0.26 + mix(uEdgeA, uEdgeB, 0.42 + rvN * 0.24) * rvArc * 0.34;`
      );
  };
}

// Scroll-driven look: 0 Bayer dither (grey), 1 cyan scan grain, 2 colour scanlines + bloom/film.
const LookShader = {
  uniforms: {
    tDiffuse: { value: null },
    uRes: { value: new THREE.Vector2(980, 820) },
    uMode: { value: 0 },
    uTime: { value: 0 },
    uTrans: { value: 1 },
    uDir: { value: 1 },
    uRaw: { value: 1 },
  },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform vec2 uRes; uniform float uMode; uniform float uTime; uniform float uTrans; uniform float uDir; uniform float uRaw;
    varying vec2 vUv;
    float luma(vec3 c) { return dot(c, vec3(0.299, 0.587, 0.114)); }
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    float bayer4(vec2 p) {
      vec2 q = mod(floor(p), 4.0);
      float m[16];
      m[0]=0.;m[1]=8.;m[2]=2.;m[3]=10.;m[4]=12.;m[5]=4.;m[6]=14.;m[7]=6.;
      m[8]=3.;m[9]=11.;m[10]=1.;m[11]=9.;m[12]=15.;m[13]=7.;m[14]=13.;m[15]=5.;
      int i = int(q.y * 4.0 + q.x);
      float v = 0.0;
      for (int k = 0; k < 16; k++) if (k == i) v = m[k];
      return (v + 0.5) / 16.0;
    }
    void main() {
      vec2 px = vUv * uRes;
      vec3 base = texture2D(tDiffuse, vUv).rgb;
      float raw = luma(base);
      vec3 outc = base;
      if (raw >= 0.018) {
        if (uMode < 0.5) {
          float grey = smoothstep(0.02, 0.74, raw * 1.12);
          float scan = mix(0.62, 1.0, step(0.5, fract(floor(px.y) * 0.5)));
          outc = vec3(step(bayer4(px), grey) * 0.5 * scan);
        } else if (uMode < 1.5) {
          float grain = hash(floor(px) + uTime);
          float scan = mix(0.70, 1.0, step(0.5, fract(px.y * 0.5)));
          float v = clamp(smoothstep(0.02, 0.74, raw * 1.12) * scan + (grain - 0.5) * 0.10, 0.0, 1.0);
          outc = vec3(v * 0.03, v * 0.86, v * 0.74) + vec3(0.3, 0.1, 0.19) * step(0.42, raw) * scan;
          float lite = exp(-abs(vUv.y - (0.5 + 0.42 * sin(uTime * 0.6))) * 33.0) * smoothstep(0.01, 0.06, raw);
          outc += vec3(1.0, 0.41, 0.71) * lite * 0.6;
        } else {
          float scan = mix(0.58, 1.16, step(0.5, fract(px.y * 0.5)));
          float fine = 0.92 + 0.08 * sin(px.y * 3.14159 + uTime * 7.0);
          vec2 off = vec2(1.25 / uRes.x, 0.0);
          vec3 col = vec3(texture2D(tDiffuse, vUv + off).r, base.g, texture2D(tDiffuse, vUv - off).b) * scan * fine;
          outc = mix(col * 0.82, vec3(luma(col)) * 0.18, 0.10);
        }
      }
      outc = mix(outc, base, uRaw);
      if (uTrans < 0.999) {
        float mask = smoothstep(0.018, 0.12, raw);
        float sweep = uDir > 0.0 ? uTrans : 1.0 - uTrans;
        vec2 pixUv = floor(vUv * uRes / 4.0) * 4.0 / uRes;
        float n = hash(floor(pixUv * uRes / 2.0) + uTime * 5.0);
        float y = pixUv.y + (n - 0.5) * 0.06 * smoothstep(0.0, 0.9, uTrans);
        float edge = 1.0 - smoothstep(0.0, 0.12, abs(y - sweep));
        float band = smoothstep(sweep - 0.22, sweep, y) * (1.0 - smoothstep(sweep, sweep + 0.22, y));
        outc = mix(mix(vec3(luma(outc)) * 0.22, outc, 0.56), outc, smoothstep(0.18, 0.84, uTrans));
        outc += vec3(0.68) * edge * mask * (0.58 + n * 0.26);
        outc += vec3(0.42) * mask * band * (n - 0.36) * 0.15;
      }
      gl_FragColor = vec4(outc, 1.0);
    }
  `,
};

/** Mounts the pinned workstation scene into `stage`; `pin` is the tall scroll container. */
export function initWorkstation(stage, pin) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#000000');
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  camera.position.set(0, 0.55, 4.6);
  camera.lookAt(0, 0.3, 0);

  const spot = new THREE.SpotLight('#ffffff', 4.4, 20, 0.5, 0.6, 1);
  spot.position.set(1.5, 4, 3);
  const rim = new THREE.DirectionalLight('#ff69b4', 0.05);
  rim.position.set(-3, 2, -3);
  const fill = new THREE.DirectionalLight('#08fdd8', 0.04);
  fill.position.set(3, 0, 2);
  const greyKey = new THREE.PointLight('#d8d8d8', 0.75, 12);
  greyKey.position.set(-2.7, 1.5, 2.2);
  const greyFill = new THREE.PointLight('#d8d8d8', 0.7, 12);
  greyFill.position.set(2.7, 0.6, 2.2);
  scene.add(new THREE.AmbientLight('#ffffff', 0.25), spot, rim, fill, greyKey, greyFill);

  const rig = new THREE.Group();
  const { group, meshes } = buildWorkstation();
  const bounds = new THREE.Box3().setFromObject(group);
  rig.add(group);
  rig.rotation.y = -0.6;
  scene.add(rig);
  const grey = new THREE.MeshStandardMaterial({ color: '#c6c6c2', roughness: 1, metalness: 0 });
  const setLookMaterials = (classic) => meshes.forEach((m) => (m.material = classic ? m.userData.original : grey));
  setLookMaterials(false);

  const R = {
    uReveal: { value: 0 },
    uMinY: { value: bounds.min.y },
    uMaxY: { value: bounds.max.y },
    uEdgeA: { value: new THREE.Color('#08fdd8') },
    uEdgeB: { value: new THREE.Color('#ff69b4') },
    uRigInv: { value: new THREE.Matrix4() },
  };
  new Set([grey, ...group.children.map((m) => m.material)]).forEach((m) => addReveal(m, R));
  let revealStart = -1;

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(490, 410), 0.18, 0.35, 0.32);
  bloom.enabled = false;
  composer.addPass(bloom);
  const film = new FilmPass(0.5, false);
  film.enabled = false;
  composer.addPass(film);
  const look = new ShaderPass(LookShader);
  composer.addPass(look);
  composer.addPass(new OutputPass());

  const size = () => {
    const w = stage.clientWidth;
    const h = stage.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    look.uniforms.uRes.value.set(w, h);
  };
  size();
  const ro = new ResizeObserver(size);
  ro.observe(stage);

  let mode = 0;
  let transStart = 0;
  const setMode = (next) => {
    if (next === mode) return;
    look.uniforms.uDir.value = next < mode ? -1 : 1;
    look.uniforms.uTrans.value = 0;
    transStart = performance.now();
    mode = next;
    setTimeout(() => {
      look.uniforms.uMode.value = mode;
      setLookMaterials(mode === 2);
    }, 230);
    bloom.enabled = film.enabled = mode === 2;
    spot.intensity = mode === 2 ? 9 : 4.4;
    rim.intensity = mode === 2 ? 0.18 : 0.05;
    fill.intensity = mode === 2 ? 0.14 : 0.04;
  };

  let visible = false;
  let targetY = -0.6;
  let targetX = 0;
  let lastScroll = scrollY;
  const onScroll = () => {
    if (!visible) return;
    targetY += (scrollY - lastScroll) * 0.0003;
    lastScroll = scrollY;
    const r = pin.getBoundingClientRect();
    const prog = Math.min(1, Math.max(0, -r.top / Math.max(1, r.height - innerHeight)));
    const appear = Math.min(1, prog * 3.055);
    setMode(prog < 2.7 / 7 ? 0 : prog < 4 / 7 ? 1 : 2);
    greyKey.intensity = 0.75 + 5.9 * appear;
    greyFill.intensity = 0.7 + 6.3 * appear;
    greyKey.position.x = -2.7 + 0.72 * appear;
    greyFill.position.x = 2.7 - 0.72 * appear;
  };
  addEventListener('scroll', onScroll, { passive: true });
  const io = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) (lastScroll = scrollY), onScroll();
    if (visible && revealStart < 0) revealStart = performance.now();
  });
  io.observe(stage);

  let drag = null;
  const el = renderer.domElement;
  const down = (e) => {
    drag = { x: e.clientX, y: e.clientY };
    el.setPointerCapture(e.pointerId);
  };
  const move = (e) => {
    if (!drag) return;
    targetY += (e.clientX - drag.x) * 0.002;
    targetX = THREE.MathUtils.clamp(targetX + (e.clientY - drag.y) * 0.0015, -0.87, 0.87);
    drag = { x: e.clientX, y: e.clientY };
  };
  const up = () => (drag = null);
  el.addEventListener('pointerdown', down);
  el.addEventListener('pointermove', move);
  el.addEventListener('pointerup', up);

  let raf;
  let lastRender = 0;
  const animate = (now) => {
    raf = requestAnimationFrame(animate);
    if (!visible || document.hidden) return;
    targetY = THREE.MathUtils.clamp(targetY, -Math.PI / 2, Math.PI / 2);
    rig.rotation.y += (targetY - rig.rotation.y) * 0.1;
    rig.rotation.x += (targetX - rig.rotation.x) * 0.08;
    // ponytail: 30 fps cap keeps scroll smooth on weak GPUs; lift it if this scene needs fluid drag.
    if (now - lastRender < 33) return;
    lastRender = now;
    look.uniforms.uTime.value = now * 0.001;
    if (R.uReveal.value < 1 && revealStart >= 0) {
      const p = Math.min(1, (now - revealStart) / 2200);
      R.uReveal.value = p;
      R.uRigInv.value.copy(rig.matrixWorld).invert();
      look.uniforms.uRaw.value = 1 - THREE.MathUtils.smoothstep(p, 0.82, 1);
    }
    if (look.uniforms.uTrans.value < 1) {
      const p = Math.min(1, (now - transStart) / 760);
      look.uniforms.uTrans.value = 1 - Math.pow(1 - p, 3);
    }
    composer.render();
  };
  raf = requestAnimationFrame(animate);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    removeEventListener('scroll', onScroll);
    composer.dispose();
    renderer.dispose();
    el.remove();
  };
}
