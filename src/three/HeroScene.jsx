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
import { COARSE } from '../env';
import { plantGeometry, plantRows } from './growRoom';

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
const INTRO_HOLD = 350;
const INTRO_DUR = 2600;
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

/** Post chain, intro pull-back, idle orbit, scroll/mouse rig motion. Owns the render. */
function Director({ thermal, compact, introPanel, rig, onReady }) {
  const { gl, scene, camera, size } = useThree();
  const state = useRef({ thermal: 0, introStart: -1, introDone: false, msX: 0, msY: 0, msXs: 0, ready: false });
  const intro = useRef(null);

  const { composer, thermalPass, afterPass, controls } = useMemo(() => {
    const composer = new EffectComposer(gl);
    composer.addPass(new RenderPass(scene, camera));
    if (!compact) composer.addPass(new BokehPass(scene, camera, { focus: 9, aperture: 0.00077, maxblur: 0.01 }));
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
    // OrbitControls claims every touch (touch-action: none); on phones the hero must scroll the page instead.
    if (COARSE) {
      controls.disconnect();
      gl.domElement.style.touchAction = 'pan-y';
    }
    return { composer, thermalPass, afterPass, controls };
  }, []);

  useEffect(() => composer.setSize(size.width, size.height), [size, composer]);
  useEffect(() => {
    const onMove = (e) => {
      const r = gl.domElement.getBoundingClientRect();
      const inside = e.clientY >= r.top && e.clientY <= r.bottom;
      state.current.msX = inside ? ((e.clientX - r.left) / r.width - 0.5) * 2 : 0;
      state.current.msY = inside ? ((e.clientY - r.top) / r.height - 0.5) * 2 : 0;
    };
    addEventListener('pointermove', onMove, { passive: true });
    return () => {
      removeEventListener('pointermove', onMove);
      controls.dispose();
      composer.dispose();
    };
  }, []);

  useFrame((_, delta) => {
    const s = state.current;
    const now = performance.now();
    const panel = introPanel.current;
    if (!intro.current && panel) {
      const target = new THREE.Vector3(0, 1.1, 0);
      const to = camera.position.clone();
      const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(panel.getWorldQuaternion(new THREE.Quaternion()));
      const center = panel.getWorldPosition(new THREE.Vector3());
      intro.current = { from: center.clone().addScaledVector(normal, 1.6), fromLook: center, to, toLook: target };
      camera.position.copy(intro.current.from);
      camera.lookAt(center);
      controls.target.copy(target);
    }
    if (intro.current && !s.introDone) {
      if (s.introStart < 0) s.introStart = now;
      const t = Math.min(Math.max((now - s.introStart - INTRO_HOLD) / INTRO_DUR, 0), 1);
      const e = easeInOutCubic(t);
      const { from, to, fromLook, toLook } = intro.current;
      camera.position.lerpVectors(from, to, e);
      camera.lookAt(new THREE.Vector3().lerpVectors(fromLook, toLook, e));
      if (t >= 1) {
        s.introDone = true;
        controls.enabled = true;
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.35;
      }
    } else if (s.introDone) {
      controls.update();
    }

    const sc = scrollY / (innerWidth / 1024);
    s.msXs += (s.msX - s.msXs) * 0.046;
    const r = rig.current;
    r.rotation.x += (sc * 0.0005 + s.msXs * 0.045 - r.rotation.x) * 0.07;
    r.position.y += (sc * 0.0028 - r.position.y) * 0.07;
    r.rotation.y += (sc * 0.0004 - r.rotation.y) * 0.07;

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

export default function HeroScene({ projects, active, thermal, onReady, onSelect }) {
  const compact = window.innerWidth < 760;
  const layout = compact
    ? [[-1.5, 1.6, -0.6], [1.5, 0.4, 0.2], [-0.6, -0.8, 1.2]]
    : [[-3.9, 1.7, -1.6], [-1.5, 0.4, 0.3], [1.5, 1.7, -0.6], [3.6, 0.2, -1.8], [0.1, 3.0, -2.8]];
  const rig = useRef();
  const introPanel = useRef(null);
  const register = (i, obj) => {
    if (i === 1) introPanel.current = obj;
  };

  return (
    <Canvas
      dpr={[1, 1.5]}
      frameloop={active ? 'always' : 'never'}
      camera={{ position: [0, 1.4, compact ? 8.5 : 9], fov: compact ? 55 : 42 }}
      gl={{ antialias: false, powerPreference: 'high-performance' }}
    >
      <color attach="background" args={['#050505']} />
      <fog attach="fog" args={['#050505', 8, 22]} />
      <Lights />
      <gridHelper args={[60, 40, CYAN, '#0f6e5f']} position={[0, FLOOR_Y, 0]} />
      <GrowRoom thermal={thermal} compact={compact} />
      <group ref={rig}>
        <NeonBars />
        {layout.map((pos, i) => (
          <Panel
            key={projects[i].title}
            src={projects[i].video}
            position={pos}
            index={i}
            active={active}
            onSelect={onSelect}
            register={register}
          />
        ))}
      </group>
      <Director thermal={thermal} compact={compact} introPanel={introPanel} rig={rig} onReady={onReady} />
    </Canvas>
  );
}
