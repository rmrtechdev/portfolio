import * as THREE from 'three';
import { WebGPURenderer } from 'three/webgpu';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { COARSE, jarvisLink } from '../../env';
import { createTunedPointsMaterial, createTunedLineMaterial, makeTunedUniforms } from './hologramTunedMaterial';
import { attachMazeWalkNodes, selectOuterPlanarShells } from './mazeWalkNodes';
import { attachCircuitTraces } from './circuitTraces';
import { attachSynapseLightning } from './synapseLightning';
import { xorStream } from './keystream';
import { seed, url } from 'virtual:jarvis-vault';

// Ported from the jarvis repo's HologramTuned (v1). The transcript-driven CHOP channels are absent
// here, so every channel sits at rest and only orbit interaction drives the sweep and ring weights.
const REVEAL_DURATION = 5;
const DISPERSE = 0.012;
const SWEEP_ANGULAR_SPEED = 0.85;
const INTERACTION_HOLD = 2.5;
const INTERACTION_EASE = 2.0;

function assignStorageMotifs(scene, uniforms) {
  const outer = selectOuterPlanarShells(scene)
    .map((shell) => {
      let count = 0;
      shell.traverse((child) => {
        if (child.isPoints && !count) count = child.geometry.getAttribute('position').count;
      });
      return { shell, count, ...shell.userData };
    })
    .sort((a, b) => b.radius - a.radius);
  if (!outer.length) return;
  uniforms.uShellRadius.value = outer[0].radius;
  uniforms.uFacetRingMin.value = Math.min(...outer.map((s) => s.ringIndex));
  const resolvable = outer.filter((s) => s.count >= 200);
  uniforms.uPlatterRingA.value = resolvable[0]?.ringIndex ?? -1;
  uniforms.uPlatterRingB.value = resolvable[1]?.ringIndex ?? -1;
  uniforms.uReelRing.value = resolvable[2]?.ringIndex ?? -1;
}

/**
 * Mounts the v1 hologram into `host`, decrypting its model in memory (see vault/jarvisVault.js). `anchor()` returns the y (px, within host) to centre it on.
 * Returns a dispose function that is safe to call mid-load.
 */
export function initJarvis(host, { anchor } = {}) {
  let disposed = false;
  const cleanups = [];
  const dispose = () => {
    disposed = true;
    cleanups.splice(0).reverse().forEach((fn) => fn());
  };

  (async () => {
    const renderer = new WebGPURenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
    // Download and GPU init overlap; neither depends on the other.
    const open = async () => {
      const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer());
      const key = new Uint32Array(Uint8Array.from(atob(seed), (c) => c.charCodeAt(0)).buffer);
      return new GLTFLoader().parseAsync(xorStream(bytes, key).buffer, '');
    };
    const [gltf] = await Promise.all([open(), renderer.init()]);
    if (disposed) return renderer.dispose();
    // The host spans two sections, so the pixel ratio is capped lower than a single-band canvas.
    renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.25));
    // Transparent, so the strand world shows through behind Archive and Contact.
    renderer.setClearColor('#000000', 0);
    renderer.domElement.style.touchAction = 'pan-y';
    host.appendChild(renderer.domElement);
    cleanups.push(() => (renderer.dispose(), renderer.domElement.remove()));

    const scene = new THREE.Scene();
    scene.add(new THREE.AmbientLight('#ffffff', 0.2), gltf.scene);
    const camera = new THREE.PerspectiveCamera(20, 1, 0.1, 100);
    camera.position.set(0, 0, 3);

    const uniforms = makeTunedUniforms();
    const softSprite = !renderer.backend?.isWebGPUBackend;
    const points = createTunedPointsMaterial(uniforms, { softSprite });
    const lines = createTunedLineMaterial(uniforms);
    gltf.scene.traverse((child) => {
      if (child.isPoints) child.material = points;
      else if (child.isLineSegments) child.material = lines;
    });
    assignStorageMotifs(gltf.scene, uniforms);
    const nodes = attachMazeWalkNodes(gltf.scene, uniforms, { softSprite });
    const detachTraces = attachCircuitTraces(nodes.anchorsByShell, uniforms);
    const bolts = attachSynapseLightning(gltf.scene, nodes.anchorsByShell, uniforms);
    cleanups.push(() => (bolts?.dispose(), detachTraces(), nodes.dispose(), points.dispose(), lines.dispose()));

    const mixer = new THREE.AnimationMixer(gltf.scene);
    const actions = {};
    for (const clip of gltf.animations) {
      const action = mixer.clipAction(clip);
      action.setLoop(THREE.LoopRepeat, Infinity);
      action.play();
      action.weight = clip.name === 'idle' ? 1 : 0;
      actions[clip.name] = action;
    }

    let lastInteraction = -Infinity;
    const onInteract = () => (lastInteraction = performance.now() / 1000);
    const controls = new OrbitControls(camera, renderer.domElement);
    Object.assign(controls, { enableDamping: true, dampingFactor: 0.05, enablePan: false, enableZoom: false, rotateSpeed: 0.5 });
    controls.addEventListener('start', onInteract);
    controls.addEventListener('change', onInteract);
    if (COARSE) controls.disconnect();
    cleanups.push(() => controls.dispose());

    // Desktop: the intake sits on the right half, so the piece is framed in the left half.
    const size = () => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (!w || !h) return;
      camera.aspect = w / h;
      // Keep the on-screen size it was tuned at (fov 20 over a ~1035 px band on desktop, 38 over
      // ~970 px on phones) however tall the host is, by widening the fov with height.
      const wide = w > 900;
      const [baseFov, refH] = wide ? [20, 1035] : [38, 970];
      camera.fov = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(THREE.MathUtils.degToRad(baseFov / 2)) * (h / refH)));
      // Desktop frames it in the left half beside the intake; the vertical shift centres it on the anchor.
      const cy = anchor ? anchor() : h / 2;
      camera.setViewOffset(w, h, wide ? w * 0.24 : 0, h / 2 - cy, w, h);
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };
    size();
    const ro = new ResizeObserver(size);
    ro.observe(host);
    cleanups.push(() => ro.disconnect());

    // Compile shaders off-screen so the first visible frame doesn't stall on pipeline creation.
    await renderer.compileAsync(scene, camera);
    if (disposed) return;

    let visible = false;
    const io = new IntersectionObserver(([e]) => (visible = jarvisLink.on = e.isIntersecting), { rootMargin: '100px' });
    io.observe(host);
    cleanups.push(() => (io.disconnect(), (jarvisLink.on = false)));
    // Centred on the cloud but sized off its widest ring: stray dispersed points reach far past what reads.
    const bounds = new THREE.Box3().setFromObject(gltf.scene).getBoundingSphere(new THREE.Sphere());
    bounds.radius = uniforms.uShellRadius.value;
    const proj = new THREE.Vector3();
    const HOT = uniforms.uHotColor.value.clone();
    const STRAND = new THREE.Color('#08fdd8');

    // Pointer-follow, no click needed: over the hologram the model turns toward the cursor, and moving
    // counts as interaction, so the rings answer and the sweep runs just as they do on a drag.
    const look = { x: 0, y: 0, tx: 0, ty: 0 };
    const onPointer = (e) => {
      if (!visible) return;
      const r = host.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
      look.tx = ((e.clientX / innerWidth) * 2 - 1) * 0.7;
      look.ty = ((e.clientY / innerHeight) * 2 - 1) * 0.35;
      onInteract();
    };
    addEventListener('pointermove', onPointer, { passive: true });
    cleanups.push(() => removeEventListener('pointermove', onPointer));

    let t = 0;
    let interactive = 0;
    let sweep = 0;
    let last = performance.now();
    let raf;
    const frame = (now) => {
      raf = requestAnimationFrame(frame);
      const delta = Math.min((now - last) / 1000, 0.05);
      last = now;
      if (!visible || document.hidden) return;
      t += delta;
      mixer.update(delta);
      look.x += (look.tx - look.x) * Math.min(1, delta * 3);
      look.y += (look.ty - look.y) * Math.min(1, delta * 3);
      gltf.scene.rotation.set(look.y, look.x, 0);
      controls.update();
      const target = now / 1000 - lastInteraction < INTERACTION_HOLD ? 1 : 0;
      interactive += (target - interactive) * Math.min(1, delta * INTERACTION_EASE);
      sweep += SWEEP_ANGULAR_SPEED * delta * Math.max(interactive, jarvisLink.possess * 0.8);
      if (actions.idle) actions.idle.weight = 1 - interactive;
      if (actions.interactive) actions.interactive.weight = interactive;

      uniforms.uTime.value = t;
      uniforms.uSweep.value = sweep;
      uniforms.uReveal.value = Math.min(1, t / REVEAL_DURATION);
      // Tell the strands where the hologram is on screen, and take back how far they have possessed it.
      const hr = host.getBoundingClientRect();
      proj.copy(bounds.center).project(camera);
      jarvisLink.x = hr.left + ((proj.x + 1) / 2) * hr.width;
      jarvisLink.y = hr.top + ((1 - proj.y) / 2) * hr.height;
      jarvisLink.r = (bounds.radius / (camera.position.distanceTo(bounds.center) * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)))) * (hr.height / 2);
      const possess = jarvisLink.possess;
      uniforms.uPossess.value = possess;
      uniforms.uHotColor.value.lerpColors(HOT, STRAND, possess);
      uniforms.uInteractive.value = Math.max(interactive, possess * 0.8);
      uniforms.uSurge.value = 1 + 0.4 * possess;
      uniforms.uSweepGain.value = 0.6;
      uniforms.uTrail.value = 0.35;
      uniforms.uDisperse.value = DISPERSE;
      uniforms.uTraceDrive.value = 0;
      bolts?.update(t, uniforms.uReveal.value);
      renderer.render(scene, camera);
    };
    raf = requestAnimationFrame(frame);
    cleanups.push(() => cancelAnimationFrame(raf));
  })().catch((err) => console.warn('[jarvis] hologram unavailable:', err));

  return dispose;
}
