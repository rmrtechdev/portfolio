import { useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { BokehPass } from 'three/addons/postprocessing/BokehPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { COARSE, TILT_ASK, ar, jarvisLink, loadShown, startTilt, tilt } from '../env';
import { HOME, PROJECTS, REEL } from '../data';
import { Earth } from './Globe';
import { plantGeometry, plantRows } from './growRoom';
import { createStack } from './stack';
import { StackPass } from './stackPost';
import { STRAND_VERTS, createStrands, stepStrands } from './strands';
import { createThread } from './thread';

const passVertex = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

// Thermal-camera ramp over scene luminance: black → blue → purple → red → orange → yellow → white.
const ThermalShader = {
  uniforms: { tDiffuse: { value: null }, uAmount: { value: 0 } },
  vertexShader: passVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uAmount;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float l = clamp(dot(c.rgb, vec3(0.299, 0.587, 0.114)) * 1.9, 0.0, 1.0);
      vec3 g = vec3(0.0);
      g = mix(g, vec3(0.03, 0.00, 0.38), smoothstep(0.02, 0.14, l));
      g = mix(g, vec3(0.48, 0.00, 0.80), smoothstep(0.14, 0.30, l));
      g = mix(g, vec3(1.00, 0.05, 0.00), smoothstep(0.30, 0.50, l));
      g = mix(g, vec3(1.00, 0.55, 0.00), smoothstep(0.50, 0.70, l));
      g = mix(g, vec3(1.00, 0.95, 0.10), smoothstep(0.70, 0.86, l));
      g = mix(g, vec3(1.00), smoothstep(0.86, 0.98, l));
      g *= 1.0 + 0.3 * uAmount;
      gl_FragColor = vec4(mix(c.rgb, min(g, vec3(1.0)), uAmount), c.a);
    }
  `,
};

// Lens fringe: red and blue split apart only toward the corners; everything inside 0.55 of the centre stays untouched.
const LensShader = {
  uniforms: { tDiffuse: { value: null } },
  vertexShader: passVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    varying vec2 vUv;
    void main() {
      vec2 d = vUv - 0.5;
      float r = length(d);
      vec4 c = texture2D(tDiffuse, vUv);
      if (r < 0.55) { gl_FragColor = c; return; }
      vec2 o = d / r * smoothstep(0.55, 0.71, r) * 0.0035;
      gl_FragColor = vec4(texture2D(tDiffuse, vUv + o).r, c.g, texture2D(tDiffuse, vUv - o).b, c.a);
    }
  `,
};

const CYAN = '#08fdd8';
const PINK = '#ff69b4';
const PANEL_W = 2.6;
const PANEL_H = PANEL_W / 1.6;
// Device frame -> camera frame: a phone held upright looks out of its back, not its top edge.
const DEVICE_TO_CAMERA = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
const CEILING = 6;
const INTRO_DUR = 1800;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

// iOS refuses play() outside a tap in Low Power Mode (and whenever autoplay is off); a refused video retries on
// the next touch, after which iOS lets that element play and pause freely.
const stalled = new Set();
const unstall = () => stalled.forEach((v) => v.play().then(() => stalled.delete(v), () => {}));
addEventListener('touchend', unstall, { capture: true, passive: true });
addEventListener('click', unstall, true);

const posters = new THREE.TextureLoader();

const probe = document.createElement('canvas');
probe.width = probe.height = 16;
const probeCtx = probe.getContext('2d', { willReadFrequently: true });
/** Mean luma of an image or video frame, 0-1; decides whether a screen's grade inverts. */
function meanLuma(src) {
  try {
    probeCtx.drawImage(src, 0, 0, 16, 16);
    const d = probeCtx.getImageData(0, 0, 16, 16).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    return sum / (d.length / 4) / 255;
  } catch {
    return 0.3;
  }
}

// Every screen is graded to one cyan phosphor, like gobold's red monitors, so six unrelated UIs read as one set.
// Light UIs invert (glowing type on black instead of a white slab); hover decloaks the real colours.
const GRADE_FRAGMENT = /* glsl */ `
#ifdef USE_MAP
  float gOff = 0.0018 * (1.0 - uReveal);
  vec4 gSrc = texture2D(map, vMapUv);
  vec3 gRaw = vec3(texture2D(map, vMapUv + vec2(gOff, 0.0)).r, gSrc.g, texture2D(map, vMapUv - vec2(gOff, 0.0)).b);
  const vec3 gW = vec3(0.2126, 0.7152, 0.0722);
  float gL = dot(gRaw, gW);
  float gN = 0.25 * (dot(texture2D(map, vMapUv + vec2(0.0016, 0.0)).rgb, gW) + dot(texture2D(map, vMapUv - vec2(0.0016, 0.0)).rgb, gW)
    + dot(texture2D(map, vMapUv + vec2(0.0, 0.0026)).rgb, gW) + dot(texture2D(map, vMapUv - vec2(0.0, 0.0026)).rgb, gW));
  // Edges carry the glow, flat fills sink: white panels and dark pages both read as lit type on a dark tube.
  float gEdge = clamp(abs(gL - gN) * 7.0, 0.0, 1.0);
  gL = clamp(pow(clamp(mix(gL, 1.0 - gL, uInvert), 0.0, 1.0), 0.7) * 0.55 + gEdge, 0.0, 1.0);
  vec3 gInk = mix(vec3(0.0), vec3(0.0, 0.03, 0.026), smoothstep(0.0, 0.18, gL));
  gInk = mix(gInk, vec3(0.002, 0.98, 0.69), smoothstep(0.16, 0.72, gL));
  gInk = mix(gInk, vec3(0.85, 1.0, 0.96), smoothstep(0.9, 1.0, gL));
  float gScan = 0.78 + 0.22 * step(0.5, fract(vMapUv.y * 170.0));
  float gBand = exp(-pow((fract(vMapUv.y - uTime * 0.11) - 0.5) * 9.0, 2.0));
  vec2 gE = vMapUv * (1.0 - vMapUv);
  gInk = (gInk * gScan + vec3(1.0, 0.14, 0.46) * gBand * 0.07) * pow(16.0 * gE.x * gE.y, 0.22);
  diffuseColor.rgb *= mix(gInk, gRaw, uReveal);
#endif
`;

/** The video as a texture, showing `poster` until the video has a frame of its own. */
function useVideoTexture(src, poster, active, lazy) {
  const video = useMemo(() => {
    const v = document.createElement('video');
    // Lazy panels download nothing until they first play, so they add no load time.
    Object.assign(v, { src, muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous', preload: lazy ? 'none' : 'auto' });
    return v;
  }, [src]);
  const texture = useMemo(() => {
    const t = new THREE.VideoTexture(video);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [video]);
  const still = useMemo(() => {
    const t = posters.load(poster, (l) => (l.userData.light = meanLuma(l.image)));
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [poster]);
  const [framed, setFramed] = useState(false);
  useEffect(() => {
    let probedAt = -1e9;
    const on = () => ((texture.userData.light = meanLuma(video)), setFramed(true));
    // Recordings cut between light and dark pages, so the grade re-reads the frame every couple of seconds.
    const tick = () => performance.now() - probedAt > 2000 && ((probedAt = performance.now()), (texture.userData.light = meanLuma(video)));
    video.addEventListener('loadeddata', on);
    video.addEventListener('timeupdate', tick);
    return () => (video.removeEventListener('loadeddata', on), video.removeEventListener('timeupdate', tick));
  }, [video, texture]);
  useEffect(() => {
    if (active) video.play().catch(() => stalled.add(video));
    else stalled.delete(video), video.pause();
  }, [active, video]);
  useEffect(
    () => () => {
      stalled.delete(video);
      video.pause();
      video.removeAttribute('src');
      video.load();
      texture.dispose();
      still.dispose();
    },
    [video, texture, still]
  );
  return framed ? texture : still;
}

const frustum = new THREE.Frustum();
const viewProj = new THREE.Matrix4();
const panelSphere = new THREE.Sphere(new THREE.Vector3(), PANEL_W * 0.6);

/** `face` ([pitch, yaw]) turns a panel toward the viewer; `lazy` panels stream their video only once looked at. */
function Panel({ src, poster, position, index, active, onSelect, register, face, lazy }) {
  const group = useRef();
  const edges = useRef();
  const [hovered, setHovered] = useState(false);
  // Video only decodes while the panel is on screen, so panels out of view cost nothing.
  const [seen, setSeen] = useState(!lazy);
  const seenNow = useRef(seen);
  const map = useVideoTexture(src, poster, active && seen, lazy);
  const grade = useMemo(() => ({ uReveal: { value: 0 }, uInvert: { value: 0 }, uTime: { value: 0 } }), []);
  const gradeShader = useMemo(
    () => (shader) => {
      Object.assign(shader.uniforms, grade);
      shader.fragmentShader = `uniform float uReveal;\nuniform float uInvert;\nuniform float uTime;\n${shader.fragmentShader}`.replace('#include <map_fragment>', GRADE_FRAGMENT);
    },
    [grade]
  );
  const frameEdges = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(PANEL_W + 0.14, PANEL_H + 0.14, 0.08)), []);
  const cable = useMemo(() => {
    const top = CEILING - position[1];
    const half = PANEL_W / 2 - 0.2;
    return new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-half, PANEL_H / 2, 0), new THREE.Vector3(-half * 0.6, top, 0),
      new THREE.Vector3(half, PANEL_H / 2, 0), new THREE.Vector3(half * 0.6, top, 0),
    ]);
  }, [position]);
  useEffect(() => register(index, group.current), []);

  useFrame(({ clock, camera }) => {
    const t = clock.elapsedTime;
    if (active) {
      frustum.setFromProjectionMatrix(viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse));
      group.current.getWorldPosition(panelSphere.center);
      // Lazy panels wait for their centre, so one peeking in at the edge as a cue doesn't start its download.
      const v = lazy ? frustum.containsPoint(panelSphere.center) : frustum.intersectsSphere(panelSphere);
      if (v !== seenNow.current) setSeen((seenNow.current = v));
    }
    group.current.rotation.x = face ? face[0] : 0;
    group.current.rotation.z = Math.sin(t * 0.5 + index) * 0.025;
    group.current.rotation.y = (face ? face[1] : -position[0] * 0.09) + Math.sin(t * 0.3 + index * 1.7) * 0.06;
    group.current.position.y = position[1] + Math.sin(t * 0.7 + index) * 0.04;
    grade.uTime.value = t;
    grade.uReveal.value += ((hovered ? 1 : 0) - grade.uReveal.value) * 0.12;
    grade.uInvert.value += (smooth(0.42, 0.6, map.userData.light ?? 0) - grade.uInvert.value) * 0.05;
    edges.current.material.opacity = hovered ? 1 : 0.2 + (0.5 + Math.sin(t * 2) * 0.3) * 0.25;
    edges.current.material.color.set(hovered ? PINK : CYAN);
  });

  return (
    <group ref={group} position={position}>
      {!face && (
        <lineSegments geometry={cable}>
          <lineBasicMaterial color="#3a3a3a" />
        </lineSegments>
      )}
      <mesh position={[0, 0, -0.05]}>
        <boxGeometry args={[PANEL_W + 0.12, PANEL_H + 0.12, 0.08]} />
        <meshStandardMaterial color="#151515" metalness={0.6} roughness={0.45} />
      </mesh>
      <mesh
        onPointerOver={(e) => (e.stopPropagation(), setHovered(true), (document.body.style.cursor = 'pointer'))}
        onPointerOut={() => (setHovered(false), (document.body.style.cursor = ''))}
        onClick={() => onSelect(index)}
      >
        <planeGeometry args={[PANEL_W, PANEL_H]} />
        <meshBasicMaterial map={map} color="#8c8c8c" onBeforeCompile={gradeShader} customProgramCacheKey={() => 'screen-grade'} />
      </mesh>
      <lineSegments ref={edges} geometry={frameEdges}>
        <lineBasicMaterial color={CYAN} transparent opacity={0.3} toneMapped={false} />
      </lineSegments>
    </group>
  );
}

// Pink sits below the bloom threshold at 1.0, so the tubes are driven into HDR to glow like lit glass.
// They skip fog: the back tube sits deepest in it and would otherwise drop under the threshold.
const NEON = new THREE.Color(PINK).multiplyScalar(2);

function NeonBars() {
  const bars = [
    [-3.2, 4.6, -1.5, 1.6],
    [2.6, 4.9, -2.2, 1.2],
    [0.3, 5.3, -4, 2.4],
  ];
  return bars.map(([x, y, z, w], i) => (
    <group key={i} position={[x, y, z]} rotation={[0, 0, (i - 1) * 0.08]}>
      <mesh>
        <boxGeometry args={[w, 0.06, 0.25]} />
        <meshBasicMaterial color={NEON} toneMapped={false} fog={false} />
      </mesh>
      <pointLight color={PINK} intensity={4} distance={7} decay={1.6} position={[0, -0.25, 0]} />
    </group>
  ));
}

const SIGN_W = 1.7;
const SIGN_H = SIGN_W * (1340 / 1024);
const SIGN_Y = 1.3;

/** Draws the hero's standing poster: the site's statement as an object in the room, gobold's "winner" board. */
function drawSign(ctx) {
  const W = 1024;
  const H = 1340;
  const D = '"Big Shoulders Display", "Arial Narrow", sans-serif';
  const M = '"Anonymous Pro", ui-monospace, monospace';
  ctx.fillStyle = '#010605';
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = CYAN;
  ctx.fillRect(56, 56, W - 112, 190);
  ctx.fillStyle = '#010605';
  ctx.textBaseline = 'alphabetic';
  ctx.font = `800 176px ${D}`;
  ctx.fillText('R.M.ROMAN', 80, 222);
  ctx.fillStyle = CYAN;
  ctx.font = `800 236px ${D}`;
  ['BUILDS', 'THE WHOLE', 'THING.'].forEach((line, i) => ctx.fillText(line, 64, 500 + i * 214));
  ctx.fillRect(64, 1004, W - 128, 4);
  ctx.font = `400 42px ${M}`;
  [['PYTHON / DJANGO', 'REACT / NEXT.JS'], ['THREE.JS / WEBGL', 'APPLIED AI / MCP']].forEach((row, r) =>
    row.forEach((t, c) => ctx.fillText(t, 64 + c * 470, 1078 + r * 62))
  );
  ctx.fillStyle = PINK;
  ctx.fillText('■ OPEN TO ROLES — NYC / REMOTE', 64, 1268);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.32)';
  for (let y = 0; y < H; y += 4) ctx.fillRect(0, y, W, 2);
}

function Sign() {
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 1340;
    const t = new THREE.CanvasTexture(canvas);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }, []);
  useEffect(() => {
    let live = true;
    const paint = () => live && (drawSign(texture.image.getContext('2d')), (texture.needsUpdate = true));
    paint();
    // Canvas text can't wait on CSS: draw now, then again once the faces it names have arrived.
    Promise.all(['800 200px "Big Shoulders Display"', '400 40px "Anonymous Pro"'].map((f) => document.fonts.load(f))).then(paint, () => {});
    return () => ((live = false), texture.dispose());
  }, [texture]);
  const cables = useMemo(() => {
    const y0 = SIGN_H / 2;
    const top = CEILING - SIGN_Y;
    return new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.6, y0, 0), new THREE.Vector3(-0.4, top, 0),
      new THREE.Vector3(0.6, y0, 0), new THREE.Vector3(0.4, top, 0),
    ]);
  }, []);
  return (
    <group position={[6.1, SIGN_Y, -1.6]} rotation={[0, -0.62, -0.025]}>
      <lineSegments geometry={cables}>
        <lineBasicMaterial color="#3a3a3a" />
      </lineSegments>
      <mesh position={[0, 0, -0.04]}>
        <boxGeometry args={[SIGN_W + 0.1, SIGN_H + 0.1, 0.06]} />
        <meshStandardMaterial color="#111" metalness={0.7} roughness={0.4} />
      </mesh>
      <mesh>
        <planeGeometry args={[SIGN_W, SIGN_H]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <pointLight color={CYAN} intensity={2.5} distance={4} decay={1.8} position={[0, 0, 0.8]} />
    </group>
  );
}

// Fraction of the previous frame kept under thermal: a brief heat shimmer that clears in ~6 frames, not a smear.
const THERMAL_TRAIL = 0.6;
const FLOOR_Y = -2.6;
const GROW_SECONDS = 1.2;
const CLEAR_SECONDS = 0.7;

// Only exists under the thermal camera: the neon tubes are grow lamps, and the rows rise from the floor
// as the thermal pass fades in.
function GrowRoom({ thermal, compact }) {
  const group = useRef();
  const mesh = useRef();
  const material = useRef();
  const level = useRef(0);
  const heat = useRef(0);
  const geometry = useMemo(() => plantGeometry(), []);
  const matrices = useMemo(() => plantRows({ floorY: 0, compact }), [compact]);
  useEffect(() => {
    matrices.forEach((m, i) => mesh.current.setMatrixAt(i, m));
    mesh.current.instanceMatrix.needsUpdate = true;
    return () => geometry.dispose();
  }, [matrices, geometry]);
  // Height runs on its own timer; visibility tracks the thermal pass's fade (same 0.08 step as Director),
  // so the room is never seen in normal colour on the way in or out.
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    level.current = THREE.MathUtils.clamp(level.current + (thermal ? dt / GROW_SECONDS : -dt / CLEAR_SECONDS), 0, 1);
    heat.current += ((thermal ? 1 : 0) - heat.current) * 0.08;
    group.current.visible = level.current > 0 && heat.current > 0.02;
    group.current.scale.y = Math.max(0.001, easeInOutCubic(level.current));
    material.current.opacity = heat.current;
  });
  return (
    <group ref={group} position={[0, FLOOR_Y, 0]} visible={false}>
      <instancedMesh ref={mesh} args={[geometry, undefined, matrices.length]} frustumCulled={false}>
        <meshStandardMaterial ref={material} color="#4f9a52" emissive="#3a6e2c" emissiveIntensity={1.1} roughness={0.7} side={THREE.DoubleSide} alphaHash />
      </instancedMesh>
    </group>
  );
}


function Lights() {
  const spot = useMemo(() => {
    const s = new THREE.SpotLight('#ffffff', 40, 30, 0.6, 0.6, 1.6);
    s.position.set(0, 7, 4);
    s.target.position.set(0, 0.8, 0);
    return s;
  }, []);
  return (
    <>
      <ambientLight color="#404060" intensity={0.3} />
      <primitive object={spot} />
      <primitive object={spot.target} />
      <directionalLight color={PINK} intensity={1.2} position={[-6, 3, -4]} />
      <directionalLight color={CYAN} intensity={0.8} position={[6, 1, 3]} />
    </>
  );
}

// Stations along the one camera flight. The globe sits far below the room: the camera dives through the
// strand floor and down a river of the same strands to reach it, then flies past it into a second river
// that carries on under the rest of the page.
const GLOBE = new THREE.Vector3(0, -32, 0);
const LOAD_DIST = 17;
const LOAD_R = 3.2;
// Inside the room's fog range (8-22 from a camera ~9 out), so the whole floor disc reads.
const FLOOR_R = 11;
// The wireframe floor the strands trace: the room's original grid helper.
// The hologram's widest ring is sparse at its edge; the strand cage hugs where it reads dense.
const JARVIS_CAGE = 0.62;
const GRID_SIZE = 60;
const GRID_DIVS = 40;
// Clears the satellite's highest relay (1.9 globe radii, see Globe.jsx relayFor) with room for the model.
const SHELL_R = 2.75;
// Page pixels of scroll per world unit travelled down the river after About.
const PX_PER_UNIT = 50;
// AR view: how far ahead of the viewer About's globe floats, and how much it shrinks to sit in the room.
const AR_GLOBE_DIST = 5.5;
// About holds the globe framed for this much scroll before the camera flies on.
const HOLD = 0.3;
// The globe canvas this replaces: camera |(0, 0.32, 4.2)| from a radius-1.3 globe at fov 46.
const GLOBE_FILL = Math.tan(Math.asin(1.3 / Math.hypot(0.32, 4.2))) / Math.tan(THREE.MathUtils.degToRad(23));

const STACK_LOOKS = [
  ['#c6c6c2', '#c6c6c2'],
  ['#08fdd8', '#08fdd8'],
  ['#08fdd8', '#ff69b4'],
].map((pair) => pair.map((c) => new THREE.Color(c)));

const STACK_MODES = ['01/03 BAYER 8×8', '02/03 SCAN GRAIN', '03/03 COLOUR ISP'];

const clamp01 = (v) => THREE.MathUtils.clamp(v, 0, 1);
const smooth = (a, b, x) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** Strand views: knot/floor, the dive river, the globe shell, and the thread that carries on past About. */
function useStations() {
  return useMemo(() => {
    const floor = createStrands();
    const dive = createStrands();
    const shell = createStrands({ opacity: 0.5 });
    const thread = createThread();
    for (const l of [floor, dive]) l.material.fog = true;
    // The knot unwinds strand by strand into a two-armed spiral disk under the room; scrolling drains the
    // disk down a whirlpool into the dive river. Shapes are functions of the unit-sphere point, so trails
    // stay continuous through every blend.
    // The second view traces the room's wireframe grid: each strand rides one row or column, so light
    // races along the lattice out to where the fog dissolves it.
    const floors = [floor, createStrands()];
    floors[1].material.fog = true;
    floors[1].material.defines = { GRID: '' };
    const grid = new THREE.GridHelper(GRID_SIZE, GRID_DIVS, CYAN, '#0f6e5f');
    grid.position.y = FLOOR_Y;
    grid.material.transparent = true;
    const u = { uLoad: { value: 0 }, uLand: { value: 0 }, uDrain: { value: 0 }, uTime: { value: 0 } };
    floor.userData.u = u;
    for (const l of floors) l.material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = `uniform float uLoad;\nuniform float uLand;\nuniform float uDrain;\nuniform float uTime;\n${shader.vertexShader}`
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
          float h = fract(sin(float(gl_VertexID / ${STRAND_VERTS}) * 12.9898) * 43758.5453);
          vec3 p0 = transformed;
          float ang = atan(transformed.y, transformed.x);
          float r = mix(0.1, 1.0, transformed.z * 0.5 + 0.5);
          float a = ang - 2.2 * log(r) - uTime * 0.08;
          a -= 0.4 * sin(2.0 * a);
          vec3 disk = vec3(cos(a) * r, 0.012 * sin(r * 14.0 - uTime * 1.4), sin(a) * r) * ${FLOOR_R}.0;
          float d = smoothstep(h * 0.45, h * 0.45 + 0.55, uDrain);
          float dr = 1.0 - d;
          vec3 drain = vec3(cos(a + d * 7.0) * r * dr * ${FLOOR_R}.0, disk.y * dr - 14.0 * d * d, sin(a + d * 7.0) * r * dr * ${FLOOR_R}.0);
          float w = smoothstep(h * 0.5, h * 0.5 + 0.5, uLand);
          #ifdef GRID
          float lane = (floor(h * ${GRID_DIVS + 1}.0) - ${GRID_DIVS / 2}.0) * ${GRID_SIZE / GRID_DIVS};
          float along = p0.z * ${GRID_SIZE / 2}.0;
          drain = (gl_VertexID / ${STRAND_VERTS}) % 2 == 0 ? vec3(lane, 0.0, along) : vec3(along, 0.0, lane);
          drain.y -= 3.0 * d * d;
          #endif
          // Loading: strands stream in around a ring in order, so the knot fills like a radial progress bar.
          float arrive = smoothstep(h * 0.85, h * 0.85 + 0.15, uLoad);
          float sa = 1.5708 - h * 6.2832 - (1.0 - arrive) * 1.5;
          vec3 knot = mix(vec3(cos(sa), sin(sa), 0.0) * ${(LOAD_R * 1.6).toFixed(2)}, transformed * ${LOAD_R}, arrive);
          // Strands land one after another on a lifted arc, so the landing reads as a cascade, not a squash.
          transformed = mix(knot, drain, w) + vec3(0.0, 1.2 * sin(w * 3.14159), 0.0);
          float rim = smoothstep(1.05, 0.85, r) * smoothstep(0.1, 0.25, r);
          float glow = mix(1.0, rim * (0.55 + 0.45 * sin(r * 22.0 - uTime * 2.0)) + 2.5 * w * (1.0 - w) + 1.5 * d * (1.0 - d), w);
          #ifdef GRID
          // Dissolves with the grid under it instead of following the spiral down the drain.
          glow = mix(1.0, 1.2 * dr + 2.5 * w * (1.0 - w), w);
          #endif
          #ifdef USE_COLOR
          vColor *= glow * mix(0.12, 1.0, arrive) * (1.0 + 2.0 * arrive * (1.0 - arrive));
          #endif`
        );
    };
    dive.position.set(0, -17, 0.5);
    dive.scale.set(4.5, 14, 4.5);
    shell.position.copy(GLOBE);
    shell.scale.setScalar(SHELL_R);
    return { floor, floors, grid, dive, shell, thread };
  }, []);
}

/**
 * Owns the camera and the render. The page scroll is the flight: hero orbit -> dive through the floor ->
 * globe framed under About's text -> past the globe into the river for the rest of the page.
 */
function Director({ load, thermal, compact, introPanel, rig, room, globe, stations, stack, entering, onEntered, onStage, onReady }) {
  const { gl, scene, camera, size } = useThree();
  const state = useRef({ stackY: scrollY, stackEl: null, thermal: 0, introStart: -1, introDone: false, msX: 0, msXs: 0, ready: false, entryAt: -1, entered: false, snap: null, lastY: scrollY, vel: 0, stage: '', load: loadShown.value, tiltYaw: 0, tiltPitch: 0, tiltBase: null, msY: 0, lkYaw: 0, lkPitch: 0, arK: 0, wasAR: false, wasTilt: false, swapAt: -1e9, swapPos: null, swapQuat: null });
  const intro = useRef(null);
  const look = useMemo(() => new THREE.Vector3(0, 1.1, 0), []);
  const tmp = useMemo(() => ({ fwd: new THREE.Vector3(), pos: new THREE.Vector3(), tgt: new THREE.Vector3(), dev: new THREE.Vector3(), q: new THREE.Quaternion(), eul: new THREE.Euler(), base: new THREE.Quaternion(), m4: new THREE.Matrix4(), gpos: new THREE.Vector3() }), []);

  const { composer, bokeh, stackPass, thermalPass, afterPass, controls } = useMemo(() => {
    const composer = new EffectComposer(gl);
    composer.addPass(new RenderPass(scene, camera));
    const bokeh = compact ? null : new BokehPass(scene, camera, { focus: 9, aperture: 0.00077, maxblur: 0.01 });
    if (bokeh) {
      composer.addPass(bokeh);
      // Bokeh's depth pass draws everything with one override material, which skips the floor's spiral
      // shader and so smears the strands at full blur. A depth-only plane at floor level stands in
      // for them there.
      const proxy = new THREE.Mesh(new THREE.PlaneGeometry(GRID_SIZE, GRID_SIZE).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false }));
      proxy.position.y = FLOOR_Y;
      proxy.visible = false;
      scene.add(proxy);
      const render = bokeh.render.bind(bokeh);
      bokeh.render = (...args) => {
        for (const l of stations.floors) l.visible = false;
        proxy.visible = true;
        render(...args);
        for (const l of stations.floors) l.visible = true;
        proxy.visible = false;
      };
    }
    const stackPass = new StackPass(gl, scene, camera);
    composer.addPass(stackPass);
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 0.7, 0.6, 0.5));
    // Phones keep only the bloom: each extra pass redraws the whole screen.
    if (!compact) {
      composer.addPass(new FilmPass(0.55, false));
      composer.addPass(new ShaderPass(LensShader));
    }
    const thermalPass = new ShaderPass(ThermalShader);
    composer.addPass(thermalPass);
    const afterPass = new AfterimagePass(THERMAL_TRAIL);
    afterPass.enabled = false;
    composer.addPass(afterPass);
    composer.addPass(new OutputPass());
    const controls = new OrbitControls(camera, gl.domElement);
    Object.assign(controls, {
      enabled: false,
      enableZoom: false,
      enablePan: false,
      enableDamping: true,
      dampingFactor: 0.08,
      rotateSpeed: 0.4,
      minPolarAngle: Math.PI * 0.32,
      maxPolarAngle: Math.PI * 0.55,
    });
    // OrbitControls claims every touch (touch-action: none); on phones the page must scroll instead.
    if (COARSE) controls.disconnect();
    if (COARSE && !TILT_ASK) startTilt();
    gl.domElement.style.touchAction = 'pan-y';
    return { composer, bokeh, stackPass, thermalPass, afterPass, controls };
  }, []);

  useEffect(() => composer.setSize(size.width, size.height), [size, composer]);
  useEffect(() => stack.setEnv(stackPass.env), [stack, stackPass]);
  useEffect(() => {
    const onMove = (e) => {
      state.current.msX = (e.clientX / innerWidth - 0.5) * 2;
      state.current.msY = (e.clientY / innerHeight - 0.5) * 2;
      state.current.mxy = [e.clientX, e.clientY];
      state.current.touchAt = performance.now();
    };
    addEventListener('pointermove', onMove, { passive: true });
    return () => {
      removeEventListener('pointermove', onMove);
      controls.dispose();
      composer.dispose();
    };
  }, []);

  useFrame(({ clock }, delta) => {
    const s = state.current;
    const now = performance.now();
    const H = innerHeight;
    const AR = ar.on;
    const { floor, floors, grid, dive, shell, thread } = stations;
    stepStrands(delta);

    // Toggling AR or tilt mid-page swaps the camera between the hero spot and the look-around; ease from the last pose instead of cutting.
    if (!tilt.on) (s.tiltBase = null), (s.tiltYaw = s.tiltPitch = 0);
    if (AR !== s.wasAR || tilt.on !== s.wasTilt) {
      s.wasAR = AR;
      s.wasTilt = tilt.on;
      s.swapAt = now;
      s.swapPos = camera.position.clone();
      s.swapQuat = camera.quaternion.clone();
    }

    // AR moments (styles.css): each holds the screen for a scroll of H. Only the scroll between holds is elevation,
    // which the room and the strands follow, so they hold with the content and rise with it.
    let held = 0;
    s.sides = false;
    if (AR)
      for (const m of document.querySelectorAll('.ar-moment')) {
        const r = m.getBoundingClientRect();
        m.arStage ??= m.querySelector('.ar-stage');
        held += THREE.MathUtils.clamp(-r.top, 0, m.offsetHeight - (m.arStage?.offsetHeight ?? H));
        if (r.top <= H / 2 && r.bottom >= H / 2) s.sides ||= (m.arSides ??= !!m.querySelector('.ar-side'));
      }
    s.elev = AR ? Math.max(0, scrollY - held) : 0;
    camera.position.y += s.drop ?? 0;
    s.drop = 0;

    // While the flight owns the camera the orbit is parked; put its pose back before the orbit runs.
    if (s.snap) camera.position.copy(s.snap);

    const panel = introPanel.current;
    if (!intro.current && panel) {
      const target = new THREE.Vector3(0, 1.1, 0);
      const to = camera.position.clone();
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(panel.getWorldQuaternion(new THREE.Quaternion()));
      const center = panel.getWorldPosition(new THREE.Vector3());
      intro.current = { from: center.clone().addScaledVector(normal, 1.6), fromLook: center, to, toLook: target };
      camera.position.copy(intro.current.from);
      controls.target.copy(target);
    }

    // Loading knot -> entry: the knot sweeps down and settles as the floor while the room switches on.
    if (entering && s.entryAt < 0) s.entryAt = now;
    const e = s.entryAt < 0 ? 0 : clamp01((now - s.entryAt) / 1300);
    if (!s.entered && e > 0.55) (s.entered = true), onEntered();
    room.current.visible = s.entered;
    if (s.entered && s.introStart < 0) s.introStart = now;

    if (intro.current && !s.introDone) {
      const t = s.introStart < 0 ? 0 : Math.min((now - s.introStart) / INTRO_DUR, 1);
      const k = easeInOutCubic(t);
      const { from, to, fromLook, toLook } = intro.current;
      camera.position.lerpVectors(from, to, k);
      look.lerpVectors(fromLook, toLook, k);
      if (t >= 1) {
        s.introDone = true;
        controls.autoRotate = !tilt.on;
        controls.autoRotateSpeed = compact ? 0.15 : 0.35;
      }
    } else if (s.introDone && !s.snap) {
      // Phone tilt and AR view aim the view themselves, so the camera holds the spot the intro landed on instead of
      // orbiting (and the mouse must not drag it against the look-around).
      const still = tilt.on || AR;
      controls.autoRotate = !still;
      if (still) camera.position.lerp(intro.current.to, 0.04);
      controls.enabled = !AR;
      controls.update();
      look.copy(controls.target);
      if (AR) {
        // The room drops past at the speed the page scrolls at the hero's depth, so the panels leave with the hero.
        const d = intro.current.to.distanceTo(intro.current.toLook);
        s.drop = (s.elev * 2 * d * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / H;
        camera.position.y -= s.drop;
        look.y -= s.drop;
      }
    }

    // Scroll -> flight. p: hero to globe; q: past the globe; travel: down the river after About.
    const about = document.getElementById('about');
    const box = document.querySelector('.spec-globe');
    const y = scrollY;
    s.vel += (Math.abs(y - s.lastY) - s.vel) * 0.1;
    s.lastY = y;
    const aboutTop = about ? about.offsetTop : H;
    const aboutEnd = about ? aboutTop + about.offsetHeight : 2 * H;
    const p = AR ? 0 : easeInOutCubic(clamp01(y / aboutTop));
    const q = AR ? 0 : clamp01((y - aboutTop - HOLD * H) / Math.max(1, aboutEnd - aboutTop - HOLD * H));
    const travel = AR ? 0 : Math.max(0, y - aboutEnd) / PX_PER_UNIT;

    // Globe framing: where the old globe canvas sat under About's text when the section is aligned.
    let dist = 4.2;
    let dx = 0;
    let dy = 0;
    if (box) {
      const r = box.getBoundingClientRect();
      // On portrait screens the box is tall but narrow; the globe is capped to the width instead.
      const fill = Math.min(GLOBE_FILL * r.height, 0.8 * innerWidth) / H;
      dist = 1.3 / Math.sin(Math.atan(fill * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))));
      dx = r.left + r.width / 2 - innerWidth / 2;
      dy = r.top + y - aboutTop + r.height / 2 - H / 2;
    }
    const framed = new THREE.Vector3(0, 0.32 * (dist / 4.2), dist).add(GLOBE);

    const flying = p > 0.0005;
    if (flying && s.introDone) {
      s.snap ??= camera.position.clone();
      controls.enabled = false;
    } else if (!flying && s.snap) s.snap = null;

    if (flying) {
      const hero = s.snap ?? camera.position.clone();
      const pts = [hero, new THREE.Vector3(0, 0.6, 5), new THREE.Vector3(0, -1.8, 2.2), new THREE.Vector3(0, -14, 1.2), GLOBE.clone().add(new THREE.Vector3(0, 6, dist + 1)), framed];
      const tgts = [look.clone(), new THREE.Vector3(0, -3, -1), new THREE.Vector3(0, -9, -0.5), new THREE.Vector3(0, -26, -1), GLOBE.clone(), GLOBE.clone()];
      tmp.pos.copy(new THREE.CatmullRomCurve3(pts).getPoint(p));
      tmp.tgt.copy(new THREE.CatmullRomCurve3(tgts).getPoint(p));
      if (q > 0) {
        const lp = [framed, GLOBE.clone().add(new THREE.Vector3(2.4, 0.4, 1.4)), GLOBE.clone().add(new THREE.Vector3(1.4, 0, -5)), GLOBE.clone().add(new THREE.Vector3(0, 0, -12))];
        const lt = [GLOBE.clone(), GLOBE.clone().add(new THREE.Vector3(1.2, 0, -5)), GLOBE.clone().add(new THREE.Vector3(0, 0, -16)), GLOBE.clone().add(new THREE.Vector3(0, 0, -30))];
        const k = easeInOutCubic(q);
        tmp.pos.copy(new THREE.CatmullRomCurve3(lp).getPoint(k)).z -= travel;
        tmp.tgt.copy(new THREE.CatmullRomCurve3(lt).getPoint(k)).z -= travel;
      }
      camera.position.copy(tmp.pos);
      camera.lookAt(tmp.tgt);
    } else camera.lookAt(look);

    // AR view aims the whole page; outside it the phone look-around is hero-only.
    tmp.base.copy(camera.quaternion);
    // AR look-around: the device's orientation, read the way three's DeviceOrientationControls does (stable with
    // the phone upright, where raw alpha is not), turns the view 1:1 from where the camera stands, relative to how
    // the phone was held at the first reading.
    if (tilt.on && tilt.e && (AR || !flying)) {
      const [a, b, g] = tilt.e.map(THREE.MathUtils.degToRad);
      tmp.q.setFromEuler(tmp.eul.set(b, a, -g, 'YXZ')).multiply(DEVICE_TO_CAMERA);
      tmp.dev.set(0, 0, -1).applyQuaternion(tmp.q);
      const heading = Math.atan2(-tmp.dev.x, -tmp.dev.z);
      const pitch = Math.asin(THREE.MathUtils.clamp(tmp.dev.y, -1, 1));
      s.tiltBase ??= [heading, pitch];
      const yaw = THREE.MathUtils.euclideanModulo(heading - s.tiltBase[0] + Math.PI, 2 * Math.PI) - Math.PI;
      // A portrait screen is narrow, so a small turn loses a moment that has nothing to the sides (the globe, a
      // single card). There, straight ahead slowly follows the phone and the content settles back in front.
      if (AR && !s.sides && s.elev > H / 2) s.tiltBase[0] += yaw * (1 - Math.exp(-Math.min(delta, 0.1) * 0.8));
      s.tiltYaw += (THREE.MathUtils.clamp(yaw, -1.4, 1.4) - s.tiltYaw) * 0.15;
      s.tiltPitch += (THREE.MathUtils.clamp(pitch - s.tiltBase[1], -0.8, 0.8) - s.tiltPitch) * 0.15;
      camera.rotateOnWorldAxis(THREE.Object3D.DEFAULT_UP, s.tiltYaw);
      camera.rotateX(s.tiltPitch);
    } else if (AR && !COARSE) {
      // Reaches the side content where a moment has some; elsewhere a smaller swing keeps the room in view. Once
      // the pointer is on a side panel the view holds, or reaching for its links would turn it away again.
      const under = s.mxy && document.elementFromPoint(...s.mxy);
      if (!under?.closest('.ar-side')) {
        s.lkYaw += (-s.msX * (s.sides ? 0.9 : 0.45) - s.lkYaw) * 0.1;
        s.lkPitch += (-s.msY * 0.2 - s.lkPitch) * 0.1;
      }
      camera.rotateOnWorldAxis(THREE.Object3D.DEFAULT_UP, s.lkYaw);
      camera.rotateX(s.lkPitch);
    }
    // Toggling at About would ease the camera up from the globe through the floors and the dark between them,
    // so a long move cuts instead.
    if (s.swapPos && now - s.swapAt < 1400 && s.swapPos.distanceTo(camera.position) > 6) s.swapAt = -1e9;
    const swap = easeInOutCubic(clamp01((now - s.swapAt) / 1400));
    if (swap < 1) {
      camera.position.lerpVectors(s.swapPos, camera.position, swap);
      camera.quaternion.copy(s.swapQuat.clone().slerp(camera.quaternion, swap));
    }
    // The page turns with the view (linear in angle, which matches the strands well enough near the centre): the
    // stages, and the marquees and section heads that pass between them.
    const stages = document.querySelectorAll('.ar-stage, .moving, .section > .head');
    if (AR) {
      const f = H / 2 / Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
      const yaw = tilt.on ? s.tiltYaw : COARSE ? 0 : s.lkYaw;
      const pitch = tilt.on ? s.tiltPitch : COARSE ? 0 : s.lkPitch;
      const t = `translate3d(${(yaw * f).toFixed(1)}px, ${(pitch * f).toFixed(1)}px, 0)`;
      stages.forEach((el) => (el.style.transform = t));
      s.turned = true;
    } else if (s.turned) {
      stages.forEach((el) => (el.style.transform = ''));
      s.turned = false;
    }
    tmp.m4.makeRotationFromQuaternion(tmp.q.copy(camera.quaternion).invert().multiply(tmp.base));
    thread.uniforms.uLook.value.setFromMatrix4(tmp.m4);

    // Pin the globe where the page layout expects it while it is framed, easing in and out of the flight.
    const pin = smooth(0.85, 1, p) * (1 - smooth(0, 0.35, q)) * swap;
    if (pin > 0.001) camera.setViewOffset(innerWidth, H, -dx * pin, -dy * pin, innerWidth, H);
    else if (camera.view?.enabled) camera.clearViewOffset();

    // Stack: while its pinned scene is on screen the workstation is composed from the river's strands, kept
    // where the layout puts the stage box, turned by scroll and by drag (with a fling and a spring back), and
    // graded by stackPass in one of three looks picked by scroll. Below the 900px breakpoint the box is hidden:
    // the model then sits centred and dimmed behind the cards instead.
    const stageEl = document.querySelector('.svc-stage');
    const pinEl = document.querySelector('.svc-pin');
    const sk = (s.stk ??= { yaw: 0, pitch: 0, vYaw: 0, vPitch: 0, drag: null, turn: -0.6, mode: 0, prev: 0, trans: 1, dir: 1, hud: NaN });
    if (stageEl && stageEl !== s.stackEl) {
      s.stackEl = stageEl;
      stageEl.addEventListener('pointerdown', (ev) => {
        sk.drag = [ev.clientX, ev.clientY, ev.timeStamp];
        sk.vYaw = sk.vPitch = 0;
        stageEl.setPointerCapture(ev.pointerId);
      });
      stageEl.addEventListener('pointermove', (ev) => {
        if (!sk.drag) return;
        const dt = Math.max(8, ev.timeStamp - sk.drag[2]) / 1000;
        const dYaw = (ev.clientX - sk.drag[0]) * 0.006;
        const dPitch = (ev.clientY - sk.drag[1]) * 0.004;
        sk.yaw = THREE.MathUtils.clamp(sk.yaw + dYaw, -Math.PI, Math.PI);
        sk.pitch = THREE.MathUtils.clamp(sk.pitch + dPitch, -0.5, 0.6);
        sk.vYaw += (dYaw / dt - sk.vYaw) * 0.5;
        sk.vPitch += (dPitch / dt - sk.vPitch) * 0.5;
        sk.drag = [ev.clientX, ev.clientY, ev.timeStamp];
      });
      const release = (ev) => {
        // A pointer that stopped before letting go drops the model where it is instead of flinging it.
        if (sk.drag && ev.timeStamp - sk.drag[2] > 90) sk.vYaw = sk.vPitch = 0;
        sk.drag = null;
      };
      stageEl.addEventListener('pointerup', release);
      stageEl.addEventListener('pointercancel', release);
    }
    let stackOn = false;
    if (stageEl && pinEl) {
      const pr = pinEl.getBoundingClientRect();
      const backdrop = stageEl.getBoundingClientRect().height < 1;
      const r = backdrop ? { left: 0, width: innerWidth, top: 0, height: H } : stageEl.getBoundingClientRect();
      // Forming spans the cards' lead-in: from the pin entering until the first card is a third of the way up.
      const lead = pinEl.querySelector('.sa-card')?.getBoundingClientRect().top ?? pr.top;
      const form = smooth(H + lead - pr.top, H * 0.7, lead) * (1 - smooth(H * 0.9, H * 0.3, pr.bottom));
      stackOn = stack.group.visible = form > 0.001;
      if (stackOn) {
        const dt = Math.min(delta, 0.05);
        const t = clock.elapsedTime;
        const prog = clamp01(-pr.top / Math.max(1, pr.height - H));
        if (!sk.drag) {
          sk.vYaw += (-3.5 * sk.yaw - 2.1 * sk.vYaw) * dt;
          sk.yaw += sk.vYaw * dt;
          sk.vPitch += (-12 * sk.pitch - 4.2 * sk.vPitch) * dt;
          sk.pitch += sk.vPitch * dt;
        }
        sk.turn += (-0.62 + prog * 1.1 - sk.turn) * (1 - Math.exp(-dt * 5));
        const depth = 6;
        const toWorld = (2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / H;
        camera.updateMatrixWorld();
        stack.group.position.set((r.left + r.width / 2 - innerWidth / 2) * toWorld, (H / 2 - r.top - r.height / 2) * toWorld, -depth);
        camera.localToWorld(stack.group.position);
        stack.group.quaternion.copy(camera.quaternion);
        stack.model.rotation.set(0.24 + sk.pitch + 0.015 * Math.sin(t * 0.5), sk.turn + sk.yaw + 0.03 * Math.sin(t * 0.31), 0);
        stack.group.scale.setScalar(backdrop ? (0.85 * innerWidth * toWorld) / stack.width : 0.8 * Math.min(r.height / stack.height, r.width / stack.width) * toWorld);
        thread.uniforms.uStack.value.set((r.left + r.width / 2 - innerWidth / 2) * toWorld, (H / 2 - r.top - r.height / 2) * toWorld, -depth, (stack.group.scale.x * stack.width) / 2);
        stack.solid.value = smooth(0.45, 1, form);
        stack.uniforms.uOpacity.value = 1 - 0.45 * stack.solid.value;
        thread.uniforms.uHaloA.value = backdrop ? 0.04 : 0.06;
        stack.uniforms.uForm.value = form;
        stack.uniforms.uTime.value = t;
        stack.tick(t, dt);
        const mode = prog < 0.38 ? 0 : prog < 0.68 ? 1 : 2;
        if (mode !== sk.mode) {
          sk.prev = sk.mode;
          sk.dir = mode > sk.mode ? 1 : -1;
          sk.mode = mode;
          sk.trans = 0;
        }
        // Scan grain -> colour cuts in a couple of torn frames; leaving the dither gets the full climbing tear.
        const cut = sk.mode + sk.prev === 3;
        sk.trans = Math.min(1, sk.trans + dt / (cut ? 0.12 : 0.42));
        stack.uniforms.uColA.value.lerp(STACK_LOOKS[mode][0], 0.08);
        stack.uniforms.uColB.value.lerp(STACK_LOOKS[mode][1], 0.08);
        const pu = stackPass.uniforms;
        const dpr = pu.uRes.value.x / innerWidth;
        pu.uRect.value.set(r.left * dpr, (H - r.top - r.height) * dpr, (r.left + r.width) * dpr, (H - r.top) * dpr);
        pu.uMode.value = sk.mode;
        pu.uPrev.value = sk.prev;
        pu.uTrans.value = sk.trans;
        pu.uDir.value = sk.dir;
        pu.uTime.value = t;
        pu.uPx.value = Math.max(2, Math.round(3 * dpr));
        pu.uGain.value = backdrop ? 0.4 : 1;
        pu.uBand.value = cut ? 0.6 : 0.16;
        stack.grid.value = sk.mode === 0 ? 1 : 0;
        const deg = Math.round(THREE.MathUtils.radToDeg(stack.model.rotation.y));
        if (deg * 4 + sk.mode !== sk.hud) {
          sk.hud = deg * 4 + sk.mode;
          stageEl.dataset.mode = STACK_MODES[sk.mode];
          stageEl.dataset.yaw = `YAW ${deg < 0 ? '-' : '+'}${String(Math.abs(deg)).padStart(3, '0')}°`;
        }
      }
    }
    stackPass.enabled = stackOn;
    s.stackY = y;

    // Strands: knot -> floor, the dive river and the globe shell.
    camera.getWorldDirection(tmp.fwd);
    const k = easeInOutCubic(e);
    const knotAt = camera.position.clone().addScaledVector(tmp.fwd, LOAD_DIST);
    floor.position.lerpVectors(knotAt, new THREE.Vector3(0, FLOOR_Y, 0), k);
    // Both views are the same knot until they land, so the grid view only fades in as they part.
    floors[1].material.opacity = k;
    floors.forEach((l, i) => (l.position.copy(floor.position), l.rotation.set(0.3 * (1 - k), clock.elapsedTime * 0.35 * (1 - k), 0)));
    grid.material.opacity = 0.3 * smooth(0.5, 1, e) * (1 - smooth(0.02, 0.3, p));
    grid.visible = grid.material.opacity > 0.01;
    s.load += ((entering ? 1 : load.current) - s.load) * (1 - Math.exp(-Math.min(delta, 0.1) * 8));
    loadShown.value = s.load;
    loadShown.live = true;
    floor.userData.u.uLoad.value = s.load;
    floor.userData.u.uLand.value = e;
    floor.userData.u.uDrain.value = smooth(0.02, 0.4, p);
    floor.userData.u.uTime.value = clock.elapsedTime;
    dive.material.opacity = 0.9 * smooth(0.05, 0.3, p) * (1 - smooth(0.85, 1, p));
    dive.visible = dive.material.opacity > 0.01;
    dive.rotation.y = clock.elapsedTime * 0.05 + p * 2;
    shell.material.opacity = 0.5 * smooth(0.55, 0.9, p) * (1 - smooth(0.5, 1, q));
    shell.visible = shell.material.opacity > 0.01;
    shell.position.copy(GLOBE);
    shell.scale.setScalar(SHELL_R);
    shell.rotation.set(0.25, clock.elapsedTime * 0.04, 0);
    // Past About the thread takes the shape of whichever section holds the screen, and flies as a tunnel
    // through the open gaps between them.
    const tu = thread.uniforms;
    const hold = (el) => {
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      return smooth(H * 0.95, H * 0.4, r.top) * smooth(H * 0.05, H * 0.6, r.bottom);
    };
    // AR: About's globe floats ahead of the viewer in the home frame (world-anchored) while About holds the screen.
    const gw = AR && intro.current ? hold(about) : 0;
    if (AR && intro.current) {
      // Sized to fill its box the way the regular flight frames it, not a fixed fraction that reads tiny on phones.
      const boxEl = about.querySelector('.spec-globe');
      const fill = boxEl ? Math.min(GLOBE_FILL * boxEl.offsetHeight, 0.8 * innerWidth) / H : 0.5;
      const sc = ((AR_GLOBE_DIST * Math.sin(Math.atan(fill * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))))) / 1.3) * gw;
      tmp.gpos.subVectors(look, camera.position).normalize().multiplyScalar(AR_GLOBE_DIST).add(camera.position);
      // Rides on its box in About's stage, read untransformed so the look-around doesn't move it twice.
      const r = about.getBoundingClientRect();
      const stageEl = about.querySelector('.ar-stage');
      if (stageEl && boxEl) {
        const top = Math.min(Math.max(r.top, 0), r.bottom - stageEl.offsetHeight) + boxEl.offsetTop + boxEl.offsetHeight / 2;
        tmp.gpos.y += ((H / 2 - top) * 2 * AR_GLOBE_DIST * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / H;
      }
      globe.current.position.copy(tmp.gpos);
      globe.current.scale.setScalar(Math.max(sc, 1e-3));
      globe.current.visible = gw > 0.01;
      shell.position.copy(tmp.gpos);
      shell.scale.setScalar(SHELL_R * sc);
      shell.material.opacity = 0.5 * gw;
      shell.visible = gw > 0.01;
    } else {
      globe.current.position.copy(GLOBE);
      globe.current.scale.setScalar(1);
      globe.current.visible = true;
    }
    const want = new THREE.Vector4(hold(document.getElementById('team')), stack.group.visible ? stack.uniforms.uForm.value : 0, hold(document.getElementById('work')), 0);
    // Contact: the strands lock onto the Jarvis hologram wherever its own canvas has drawn it. It is their end
    // point, so they never let go of it; they fade out with it instead (see uOpacity below).
    if (jarvisLink.on) {
      const toWorld = (2 * 6 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / H;
      tu.uJarvis.value.set((jarvisLink.x - innerWidth / 2) * toWorld, (H / 2 - jarvisLink.y) * toWorld, -6, JARVIS_CAGE * jarvisLink.r * toWorld);
      want.w = smooth(H * 1.2, H * 0.6, jarvisLink.y);
    }
    // Eased in time as well as scroll, so a flick of the wheel still reads as the strands flying across.
    tu.uW.value.lerp(want, 1 - Math.exp(-Math.min(delta, 0.1) * 5));
    jarvisLink.possess = tu.uW.value.w;
    tu.uTan.value = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    tu.uTime.value = clock.elapsedTime;
    s.arK += ((AR ? 1 : 0) - s.arK) * (1 - Math.exp(-Math.min(delta, 0.1) * 4));
    tu.uAR.value = s.arK;
    // In AR the room recedes into fog as the page scrolls off the hero, so the cards stay legible over the panels.
    s.fog ??= [scene.fog.near, scene.fog.far];
    const fk = s.arK * smooth(0.1 * H, H, s.elev);
    scene.fog.near = THREE.MathUtils.lerp(s.fog[0], 3, fk);
    scene.fog.far = THREE.MathUtils.lerp(s.fog[1], 12, fk);
    tu.uTravel.value = THREE.MathUtils.lerp(travel, s.elev / PX_PER_UNIT, s.arK);
    tu.uAspect.value = innerWidth / H;
    tu.uOpacity.value = THREE.MathUtils.lerp(smooth(0.05, 0.5, q), smooth(0.1, 1, s.elev / H), s.arK) * (0.85 + Math.min(0.5, s.vel * 0.02));
    // Nothing follows the hologram: the strands fade out with it as it leaves the top of the screen.
    if (jarvisLink.on) tu.uOpacity.value *= 1 - smooth(H * 0.15, -H * 0.35, jarvisLink.y);
    thread.lines.visible = tu.uOpacity.value > 0.01;

    if (bokeh) {
      bokeh.uniforms.focus.value = camera.position.distanceTo(flying ? tmp.tgt : look);
      // The proxy only matches the landed floor, so depth of field waits for the knot to settle.
      bokeh.enabled = !AR && p < 0.5 && e >= 1;
    }
    s.msXs += (s.msX - s.msXs) * 0.046;
    rig.current.rotation.x += (s.msXs * 0.045 - rig.current.rotation.x) * 0.07;

    const stage = !s.entered ? 'loading' : AR ? (gw > 0.5 ? 'globe' : s.elev < H ? 'hero' : 'river') : p < 0.6 ? 'hero' : q < 0.95 ? 'globe' : 'river';
    if (stage !== s.stage) onStage((s.stage = stage));

    s.thermal += ((thermal ? 1 : 0) - s.thermal) * 0.08;
    thermalPass.uniforms.uAmount.value = s.thermal;
    thermalPass.enabled = s.thermal > 0.001;
    afterPass.enabled = s.thermal > 0.03;
    afterPass.uniforms.damp.value = THERMAL_TRAIL * s.thermal;
    // Phones: while nothing moves the view (no scroll, touch, turn or camera swap) the scene draws at 30fps; any
    // input brings it straight back to full rate. The strands step on real time, so their motion is unchanged.
    const turning = Math.abs(s.tiltYaw - (s.drawnYaw ?? 0)) + Math.abs(s.tiltPitch - (s.drawnPitch ?? 0)) > 0.002;
    if (compact && s.ready && s.introDone && swap >= 1 && s.vel < 0.5 && !turning && now - (s.touchAt ?? 0) > 800 && now - s.drawnAt < 30) return;
    s.drawnAt = now;
    s.drawnYaw = s.tiltYaw;
    s.drawnPitch = s.tiltPitch;
    composer.render(delta);
    if (!s.ready) {
      s.ready = true;
      onReady();
    }
  }, 1);

  return null;
}

/**
 * The site's one fullscreen 3D world, fixed behind the page: the hero room, the globe and the strands that
 * connect them, flown through by a single scroll-driven camera. Page DOM sits on top; the hero and About
 * sections let pointer events through so the panels, orbit and globe stay interactive.
 */
export default function World({ thermal, progress, entering, onEntered, onReady, visitors }) {
  const compact = window.innerWidth < 760;
  // A panel is a few hundred pixels wide on a phone, so it streams a 480px cut (public/media/video/*-sm.mp4).
  const clip = (i) => (compact ? REEL[i].video.replace(/\.mp4$/, '-sm.mp4') : REEL[i].video);
  const layout = compact
    ? [[-0.8, 2.6, -0.6], [0.8, 0.9, 0.2], [-0.5, -0.8, 1.0]]
    : [[-3.9, 1.7, -1.6], [-1.5, 0.4, 0.3], [1.5, 1.7, -0.6], [3.6, 0.2, -1.8], [0.1, 3.0, -2.8]];
  // Phones: back off until the compact column (about 4.6 units wide) fits the portrait width, plus its depth.
  const camZ = compact ? Math.max(8.5, 2.3 / (Math.tan(THREE.MathUtils.degToRad(55 / 2)) * (innerWidth / innerHeight)) + 1) : 9;
  // With AR look-around on, phones also get the rest of the reel wrapped around the viewer (left, right, overhead),
  // 7 units out from where the camera stands and turned to face it. A short swivel reaches the sides; the overhead
  // one peeks in at the top edge as the cue that there is more around. Lazy, so they add nothing to load time.
  const [tiltOn, setTiltOn] = useState(tilt.on);
  const [arOn, setArOn] = useState(ar.on);
  useEffect(() => {
    const on = () => setTiltOn(tilt.on);
    const sync = () => setArOn(ar.on);
    if (tilt.on) on();
    addEventListener('rmr-tilt', on);
    addEventListener('rmr-ar', sync);
    return () => (removeEventListener('rmr-tilt', on), removeEventListener('rmr-ar', sync));
  }, []);
  const around =
    compact && (tiltOn || arOn)
      ? [[-0.6, 0.08], [0.6, 0], [0.15, 0.5]].map(([az, el]) => ({
          pos: [7 * Math.sin(az) * Math.cos(el), 1.4 + 7 * Math.sin(el), camZ - 7 * Math.cos(az) * Math.cos(el)],
          face: [el, -az],
        }))
      : [];
  const rig = useRef();
  const room = useRef();
  const globe = useRef();
  const introPanel = useRef(null);
  const homeLabel = useRef(null);
  const tip = useRef(null);
  const stations = useStations();
  const stack = useMemo(() => createStack(), []);
  const [stage, setStage] = useState('loading');
  const register = (i, obj) => {
    if (i === 1) introPanel.current = obj;
  };
  const select = (i) => document.getElementById(`p-${PROJECTS.indexOf(REEL[i]) + 1}`)?.scrollIntoView({ behavior: 'smooth' });
  const load = useRef(0);
  load.current = progress;

  return (
    <div className={stage === 'loading' ? 'world loading' : 'world'} aria-hidden="true">
      <Canvas dpr={compact ? 1 : [1, 1.25]} camera={{ position: [0, 1.4, camZ], fov: compact ? 55 : 42 }} gl={{ antialias: false, powerPreference: 'high-performance' }}>
        <color attach="background" args={['#050505']} />
        <fog attach="fog" args={['#050505', camZ - 1, camZ + 13]} />
        <Lights />
        <primitive object={stations.grid} dispose={null} />
        {stations.floors.map((l, i) => (
          <primitive key={i} object={l} dispose={null} />
        ))}
        <primitive object={stations.dive} dispose={null} />
        <primitive object={stations.shell} dispose={null} />
        <primitive object={stations.thread.lines} dispose={null} />
        <primitive object={stack.group} dispose={null} />
        <group ref={room} visible={false}>
          <GrowRoom thermal={thermal} compact={compact} />
          <group ref={rig}>
            <NeonBars />
            {!compact && <Sign />}
            {layout.map((pos, i) => (
              <Panel key={REEL[i].title} src={clip(i)} poster={REEL[i].poster} position={pos} index={i} active={stage === 'hero' || arOn} onSelect={select} register={register} />
            ))}
          </group>
          {around.map(({ pos, face }, k) => {
            const i = layout.length + k;
            return <Panel key={REEL[i].title} src={clip(i)} poster={REEL[i].poster} position={pos} face={face} lazy index={i} active={stage === 'hero' || arOn} onSelect={select} register={register} />;
          })}
        </group>
        <group ref={globe} position={GLOBE}>
          <Earth home={HOME} active={stage === 'globe'} spin visitors={visitors} homeLabel={homeLabel} tip={tip} />
        </group>
        <Director
          load={load}
          thermal={thermal}
          compact={compact}
          introPanel={introPanel}
          rig={rig}
          room={room}
          globe={globe}
          stations={stations}
          stack={stack}
          entering={entering}
          onEntered={onEntered}
          onStage={setStage}
          onReady={onReady}
        />
      </Canvas>
      {(around.length > 0 || arOn) && stage === 'hero' && <p className="ar-hint nav-font">◀ Turn to look around ▶</p>}
      <div className="world-labels" style={{ visibility: stage === 'globe' ? 'visible' : 'hidden' }}>
        <p className="globe-home nav-font" ref={homeLabel}>
          <b>{HOME.label}</b> {HOME.tag}
        </p>
        <p className="globe-tip nav-font" ref={tip} />
      </div>
    </div>
  );
}
