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
import { COARSE, jarvisLink, loadShown } from '../env';
import { HOME, PROJECTS, REEL } from '../data';
import { Earth } from './Globe';
import { plantGeometry, plantRows } from './growRoom';
import { createStack } from './stack';
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

const CYAN = '#08fdd8';
const PINK = '#ff69b4';
const PANEL_W = 2.6;
const PANEL_H = PANEL_W / 1.6;
const CEILING = 6;
const INTRO_DUR = 1800;
const easeInOutCubic = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function useVideoTexture(src, active) {
  const video = useMemo(() => {
    const v = document.createElement('video');
    Object.assign(v, { src, muted: true, loop: true, playsInline: true, crossOrigin: 'anonymous', preload: 'auto' });
    return v;
  }, [src]);
  const texture = useMemo(() => {
    const t = new THREE.VideoTexture(video);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [video]);
  useEffect(() => {
    if (active) video.play().catch(() => {});
    else video.pause();
  }, [active, video]);
  useEffect(
    () => () => {
      video.pause();
      video.removeAttribute('src');
      video.load();
      texture.dispose();
    },
    [video, texture]
  );
  return texture;
}

function Panel({ src, position, index, active, onSelect, register }) {
  const group = useRef();
  const edges = useRef();
  const [hovered, setHovered] = useState(false);
  const map = useVideoTexture(src, active);
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

  useFrame(({ clock }) => {
    const t = clock.elapsedTime;
    group.current.rotation.z = Math.sin(t * 0.5 + index) * 0.025;
    group.current.rotation.y = -position[0] * 0.09 + Math.sin(t * 0.3 + index * 1.7) * 0.06;
    group.current.position.y = position[1] + Math.sin(t * 0.7 + index) * 0.04;
    edges.current.material.opacity = hovered ? 1 : 0.2 + (0.5 + Math.sin(t * 2) * 0.3) * 0.25;
    edges.current.material.color.set(hovered ? PINK : CYAN);
  });

  return (
    <group ref={group} position={position}>
      <lineSegments geometry={cable}>
        <lineBasicMaterial color="#3a3a3a" />
      </lineSegments>
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
        <meshBasicMaterial map={map} color="#8c8c8c" />
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
// About holds the globe framed for this much scroll before the camera flies on.
const HOLD = 0.3;
// The globe canvas this replaces: camera |(0, 0.32, 4.2)| from a radius-1.3 globe at fov 46.
const GLOBE_FILL = Math.tan(Math.asin(1.3 / Math.hypot(0.32, 4.2))) / Math.tan(THREE.MathUtils.degToRad(23));

const STACK_LOOKS = [
  ['#c6c6c2', '#c6c6c2'],
  ['#08fdd8', '#08fdd8'],
  ['#08fdd8', '#ff69b4'],
].map((pair) => pair.map((c) => new THREE.Color(c)));

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
function Director({ load, thermal, compact, introPanel, rig, room, stations, stack, entering, onEntered, onStage, onReady }) {
  const { gl, scene, camera, size } = useThree();
  const state = useRef({ stackY: scrollY, stackYaw: -0.6, stackPitch: 0, stackDrag: null, stackEl: null, thermal: 0, introStart: -1, introDone: false, msX: 0, msXs: 0, ready: false, entryAt: -1, entered: false, snap: null, lastY: scrollY, vel: 0, stage: '', load: loadShown.value });
  const intro = useRef(null);
  const look = useMemo(() => new THREE.Vector3(0, 1.1, 0), []);
  const tmp = useMemo(() => ({ fwd: new THREE.Vector3(), pos: new THREE.Vector3(), tgt: new THREE.Vector3() }), []);

  const { composer, bokeh, thermalPass, afterPass, controls } = useMemo(() => {
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
    composer.addPass(new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 0.7, 0.6, 0.5));
    composer.addPass(new FilmPass(0.55, false));
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
    gl.domElement.style.touchAction = 'pan-y';
    return { composer, bokeh, thermalPass, afterPass, controls };
  }, []);

  useEffect(() => composer.setSize(size.width, size.height), [size, composer]);
  useEffect(() => {
    const onMove = (e) => (state.current.msX = (e.clientX / innerWidth - 0.5) * 2);
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
    const { floor, floors, grid, dive, shell, thread } = stations;
    stepStrands(delta);

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
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.35;
      }
    } else if (s.introDone && !s.snap) {
      controls.enabled = true;
      controls.update();
      look.copy(controls.target);
    }

    // Scroll -> flight. p: hero to globe; q: past the globe; travel: down the river after About.
    const about = document.getElementById('about');
    const box = document.querySelector('.spec-globe');
    const y = scrollY;
    s.vel += (Math.abs(y - s.lastY) - s.vel) * 0.1;
    s.lastY = y;
    const aboutTop = about ? about.offsetTop : H;
    const aboutEnd = about ? aboutTop + about.offsetHeight : 2 * H;
    const p = easeInOutCubic(clamp01(y / aboutTop));
    const q = clamp01((y - aboutTop - HOLD * H) / Math.max(1, aboutEnd - aboutTop - HOLD * H));
    const travel = Math.max(0, y - aboutEnd) / PX_PER_UNIT;

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

    // Pin the globe where the page layout expects it while it is framed, easing in and out of the flight.
    const pin = smooth(0.85, 1, p) * (1 - smooth(0, 0.35, q));
    if (pin > 0.001) camera.setViewOffset(innerWidth, H, -dx * pin, -dy * pin, innerWidth, H);
    else if (camera.view?.enabled) camera.clearViewOffset();

    // Stack: while its pinned scene is on screen the workstation is composed from the river's strands, kept
    // where the layout puts the stage box and turned by scroll and drag like the scene it replaces. Below the
    // 900px breakpoint the box is hidden: the model then sits centred and dimmed behind the cards instead.
    const stageEl = document.querySelector('.svc-stage');
    const pinEl = document.querySelector('.svc-pin');
    if (stageEl && stageEl !== s.stackEl) {
      s.stackEl = stageEl;
      stageEl.addEventListener('pointerdown', (ev) => ((s.stackDrag = [ev.clientX, ev.clientY]), stageEl.setPointerCapture(ev.pointerId)));
      stageEl.addEventListener('pointermove', (ev) => {
        if (!s.stackDrag) return;
        s.stackYaw += (ev.clientX - s.stackDrag[0]) * 0.002;
        s.stackPitch = THREE.MathUtils.clamp(s.stackPitch + (ev.clientY - s.stackDrag[1]) * 0.0015, -0.87, 0.87);
        s.stackDrag = [ev.clientX, ev.clientY];
      });
      stageEl.addEventListener('pointerup', () => (s.stackDrag = null));
    }
    if (stageEl && pinEl) {
      const pr = pinEl.getBoundingClientRect();
      const backdrop = stageEl.getBoundingClientRect().height < 1;
      const r = backdrop ? { left: 0, width: innerWidth, top: 0, height: H } : stageEl.getBoundingClientRect();
      const form = smooth(H, H * 0.35, backdrop ? pr.top : r.top) * (1 - smooth(H * 0.9, H * 0.3, pr.bottom));
      stack.group.visible = form > 0.001;
      if (stack.group.visible) {
        s.stackYaw = THREE.MathUtils.clamp(s.stackYaw + (y - s.stackY) * 0.0003, -Math.PI / 2, Math.PI / 2);
        const depth = 6;
        const toWorld = (2 * depth * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / H;
        camera.updateMatrixWorld();
        stack.group.position.set((r.left + r.width / 2 - innerWidth / 2) * toWorld, (H / 2 - r.top - r.height / 2) * toWorld, -depth);
        camera.localToWorld(stack.group.position);
        stack.group.quaternion.copy(camera.quaternion).multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(s.stackPitch, s.stackYaw, 0)));
        stack.group.scale.setScalar(backdrop ? (0.85 * innerWidth * toWorld) / stack.width : (0.55 * r.height * toWorld) / stack.height);
        thread.uniforms.uStack.value.set((r.left + r.width / 2 - innerWidth / 2) * toWorld, (H / 2 - r.top - r.height / 2) * toWorld, -depth, (stack.group.scale.x * stack.width) / 2);
        stack.uniforms.uOpacity.value = backdrop ? 0.4 : 1;
        thread.uniforms.uHaloA.value = backdrop ? 0.1 : 0.35;
        stack.uniforms.uForm.value = form;
        stack.uniforms.uTime.value = clock.elapsedTime;
        stack.screen.material.opacity = smooth(0.7, 1, form);
        // Same three looks at the same scroll points as before: grey, then cyan, then cyan and pink.
        const prog = clamp01(-pr.top / Math.max(1, pr.height - H));
        const mode = prog < 2.7 / 7 ? 0 : prog < 4 / 7 ? 1 : 2;
        stack.uniforms.uColA.value.lerp(STACK_LOOKS[mode][0], 0.08);
        stack.uniforms.uColB.value.lerp(STACK_LOOKS[mode][1], 0.08);
      }
    }
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
    shell.rotation.set(0.25, clock.elapsedTime * 0.04, 0);
    // Past About the thread takes the shape of whichever section holds the screen, and flies as a tunnel
    // through the open gaps between them.
    const tu = thread.uniforms;
    const hold = (el) => {
      if (!el) return 0;
      const r = el.getBoundingClientRect();
      return smooth(H * 0.95, H * 0.4, r.top) * smooth(H * 0.05, H * 0.6, r.bottom);
    };
    const want = new THREE.Vector4(hold(document.getElementById('team')), stack.group.visible ? stack.uniforms.uForm.value : 0, hold(document.getElementById('work')), 0);
    // Contact: the strands lock onto the Jarvis hologram wherever its own canvas has drawn it.
    if (jarvisLink.on) {
      const toWorld = (2 * 6 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) / H;
      tu.uJarvis.value.set((jarvisLink.x - innerWidth / 2) * toWorld, (H / 2 - jarvisLink.y) * toWorld, -6, JARVIS_CAGE * jarvisLink.r * toWorld);
      want.w = smooth(H * 1.2, H * 0.6, jarvisLink.y) * smooth(-H * 0.5, H * 0.05, jarvisLink.y);
    }
    // Eased in time as well as scroll, so a flick of the wheel still reads as the strands flying across.
    tu.uW.value.lerp(want, 1 - Math.exp(-Math.min(delta, 0.1) * 5));
    jarvisLink.possess = tu.uW.value.w;
    tu.uTan.value = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    tu.uTime.value = clock.elapsedTime;
    tu.uTravel.value = travel;
    tu.uAspect.value = innerWidth / H;
    tu.uOpacity.value = smooth(0.05, 0.5, q) * (0.85 + Math.min(0.5, s.vel * 0.02));
    thread.lines.visible = tu.uOpacity.value > 0.01;

    if (bokeh) {
      bokeh.uniforms.focus.value = camera.position.distanceTo(flying ? tmp.tgt : look);
      // The proxy only matches the landed floor, so depth of field waits for the knot to settle.
      bokeh.enabled = p < 0.5 && e >= 1;
    }
    s.msXs += (s.msX - s.msXs) * 0.046;
    rig.current.rotation.x += (s.msXs * 0.045 - rig.current.rotation.x) * 0.07;

    const stage = !s.entered ? 'loading' : p < 0.6 ? 'hero' : q < 0.95 ? 'globe' : 'river';
    if (stage !== s.stage) onStage((s.stage = stage));

    s.thermal += ((thermal ? 1 : 0) - s.thermal) * 0.08;
    thermalPass.uniforms.uAmount.value = s.thermal;
    afterPass.enabled = s.thermal > 0.03;
    afterPass.uniforms.damp.value = THERMAL_TRAIL * s.thermal;
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
  const layout = compact
    ? [[-1.5, 1.6, -0.6], [1.5, 0.4, 0.2], [-0.6, -0.8, 1.2]]
    : [[-3.9, 1.7, -1.6], [-1.5, 0.4, 0.3], [1.5, 1.7, -0.6], [3.6, 0.2, -1.8], [0.1, 3.0, -2.8]];
  const rig = useRef();
  const room = useRef();
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
      <Canvas dpr={[1, 1.25]} camera={{ position: [0, 1.4, compact ? 8.5 : 9], fov: compact ? 55 : 42 }} gl={{ antialias: false, powerPreference: 'high-performance' }}>
        <color attach="background" args={['#050505']} />
        <fog attach="fog" args={['#050505', 8, 22]} />
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
            {layout.map((pos, i) => (
              <Panel key={REEL[i].title} src={REEL[i].video} position={pos} index={i} active={stage === 'hero'} onSelect={select} register={register} />
            ))}
          </group>
        </group>
        <group position={GLOBE}>
          <Earth home={HOME} active={stage === 'globe'} spin visitors={visitors} homeLabel={homeLabel} tip={tip} />
        </group>
        <Director
          load={load}
          thermal={thermal}
          compact={compact}
          introPanel={introPanel}
          rig={rig}
          room={room}
          stations={stations}
          stack={stack}
          entering={entering}
          onEntered={onEntered}
          onStage={setStage}
          onReady={onReady}
        />
      </Canvas>
      <div className="world-labels" style={{ visibility: stage === 'globe' ? 'visible' : 'hidden' }}>
        <p className="globe-home nav-font" ref={homeLabel}>
          <b>{HOME.label}</b> {HOME.tag}
        </p>
        <p className="globe-tip nav-font" ref={tip} />
      </div>
    </div>
  );
}
