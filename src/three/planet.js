import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js';
import { FilmPass } from 'three/addons/postprocessing/FilmPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { RGBShiftShader } from 'three/addons/shaders/RGBShiftShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { COARSE } from '../env';

const passVertex = `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const ScanGrade = {
  uniforms: { tDiffuse: { value: null }, uAmt: { value: 0.2 }, uCount: { value: 280 }, uSat: { value: 1.35 }, uCon: { value: 1.05 } },
  vertexShader: passVertex,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse; uniform float uAmt; uniform float uCount; uniform float uSat; uniform float uCon;
    varying vec2 vUv;
    void main() {
      vec3 col = texture2D(tDiffuse, vUv).rgb;
      float s = sin(vUv.y * uCount * 6.2831853) * 0.5 + 0.5;
      col *= 1.0 - uAmt * smoothstep(0.4, 1.0, s);
      col = mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, uSat);
      col = (col - 0.5) * uCon + 0.5;
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
    }
  `,
};

// Fresnel shell slightly above the surface: only the limb glows, and bloom spreads it into atmosphere.
const atmosphere = new THREE.ShaderMaterial({
  vertexShader: /* glsl */ `
    varying vec3 vN; varying vec3 vV;
    void main() {
      vec4 mv = modelViewMatrix * vec4(position, 1.0);
      vN = normalize(normalMatrix * normal);
      vV = normalize(-mv.xyz);
      gl_Position = projectionMatrix * mv;
    }
  `,
  fragmentShader: /* glsl */ `
    varying vec3 vN; varying vec3 vV;
    void main() {
      float f = pow(1.0 - max(dot(vN, vV), 0.0), 3.0);
      gl_FragColor = vec4(vec3(0.3, 0.55, 1.0) * f * 0.6, f);
    }
  `,
  blending: THREE.AdditiveBlending,
  transparent: true,
  depthWrite: false,
});

/** Mounts the Earth band into `host`; `texture` is the equirectangular map URL. */
export function initPlanet(host, texture) {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.domElement.style.touchAction = 'pan-y';
  host.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#000000');
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 300);
  camera.position.set(1.6, 0.6, 7);

  scene.add(new THREE.AmbientLight('#ffffff', 0.12));
  const key = new THREE.DirectionalLight('#ffffff', 2.2);
  key.position.set(3, 2, 6);
  const rim = new THREE.DirectionalLight('#88aaff', 1.1);
  rim.position.set(4, 1, 5);
  const water = new THREE.DirectionalLight('#3a78ff', 0.5);
  water.position.set(-2, -1, 4);
  scene.add(key, rim, water, new THREE.HemisphereLight('#3f7bff', '#05060f', 0.45));

  const map = new THREE.TextureLoader().load(texture);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 4;
  const earth = new THREE.Mesh(new THREE.SphereGeometry(1.6, 96, 96), new THREE.MeshStandardMaterial({ map, roughness: 1, metalness: 0 }));
  earth.rotation.z = 0.41;
  const shell = new THREE.Mesh(new THREE.SphereGeometry(1.63, 96, 96), atmosphere);
  const rig = new THREE.Group();
  rig.position.set(-1.9, -0.95, 0);
  rig.add(earth, shell);
  scene.add(rig);

  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.06, rotateSpeed: 0.28, enablePan: false, enableZoom: false });
  controls.target.set(-0.4, -0.2, 0);
  if (COARSE) {
    controls.disconnect();
    renderer.domElement.style.touchAction = 'pan-y';
  }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.8, 0.6, 0.62);
  composer.addPass(bloom);
  composer.addPass(new AfterimagePass(0.35));
  composer.addPass(new FilmPass(0.1, false));
  const rgb = new ShaderPass(RGBShiftShader);
  rgb.uniforms.amount.value = 0.001;
  composer.addPass(rgb);
  composer.addPass(new ShaderPass(ScanGrade));
  composer.addPass(new OutputPass());

  const size = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
  };
  size();
  const ro = new ResizeObserver(size);
  ro.observe(host);

  let visible = false;
  const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting), { rootMargin: '100px' });
  io.observe(host);
  let raf;
  let last = performance.now();
  const animate = (now) => {
    raf = requestAnimationFrame(animate);
    if (!visible || document.hidden) return;
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    earth.rotation.y += dt * 0.05;
    controls.update();
    composer.render(dt);
  };
  raf = requestAnimationFrame(animate);

  return () => {
    cancelAnimationFrame(raf);
    ro.disconnect();
    io.disconnect();
    controls.dispose();
    composer.dispose();
    renderer.dispose();
    renderer.domElement.remove();
  };
}
