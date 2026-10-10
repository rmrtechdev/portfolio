import * as THREE from 'three';
import { createMazeNodeMaterial } from './hologramTunedMaterial';

// Markers are sampled evenly in arrival order rather than by position, so they land along
// the path the walk actually takes instead of ringing the shell.
//
// The count scales with the shell's own point count instead of being fixed. A flat budget
// left the densest shell taking every 36th walk step, which spread its anchors far enough
// apart that half the traces between them exceeded the routing limit and were dropped.
const WALK_STRIDE = 5;
const NODE_COUNT_RANGE = [60, 1400];

// Sampling is jittered inside each stride window rather than landing on every Nth step.
// An even stride picks anchors at near-identical hop distance, which puts them all at the
// same radius, and every trace between them then runs tangentially at that radius - the
// whole walk collapses into aligned concentric bands. Jitter breaks that registration.
const SAMPLE_JITTER = 0.9;

function sampleHash(n) {
  const x = Math.sin(n * 91.73) * 43758.5453;
  return x - Math.floor(x);
}

// Planar shells at or beyond this fraction of the widest ring's radius. Mirrors
// OUTER_RADIUS_FRACTION in dcc_scripts/animate_hologram_glb.py.
const OUTER_RADIUS_FRACTION = 0.5;

/**
 * Every shell the walk runs on: all of them except the core.
 *
 * Deliberately not restricted to the planar rings. Those are thin annuli - radial spread
 * under 0.06 of their radius - so a walk confined to them can only ever draw concentric
 * bands, however much each run is fractured, detoured or re-seeded. The two volumetric
 * shells carry 15,160 of the asset's 29,514 points and are what fills the space between the
 * rings; leaving them untraced is what made the walk read as banding against a dispersed
 * cloud.
 *
 * The core is excluded because its points all share an arrival of 0 - it is lit from the
 * start rather than propagated to, so there is no walk across it to draw.
 */
export function selectWalkShells(scene) {
  const shells = [];
  scene.traverse((child) => {
    const { core, radius } = child.userData || {};
    if (core === false && typeof radius === 'number') shells.push(child);
  });
  return shells.sort((a, b) => a.userData.radius - b.userData.radius);
}

/**
 * Every planar ring, innermost outward. Narrower than `selectWalkShells` - used only where
 * ring-specific treatment applies.
 */
export function selectPlanarShells(scene) {
  return selectWalkShells(scene).filter((s) => s.userData.planar);
}

/**
 * Just the outer planar rings. Narrower than `selectPlanarShells` because the storage motifs
 * and the faceting are deliberately scoped to the outer rings, while the walk is not.
 */
export function selectOuterPlanarShells(scene) {
  const planar = selectPlanarShells(scene);
  if (!planar.length) return [];
  const widest = Math.max(...planar.map((s) => s.userData.radius));
  return planar.filter((s) => s.userData.radius >= OUTER_RADIUS_FRACTION * widest);
}

function shellPointGeometry(shell) {
  let geometry = null;
  shell.traverse((child) => {
    if (!geometry && child.isPoints) geometry = child.geometry;
  });
  return geometry;
}

/**
 * Attach maze-walk node markers to every shell the walk crosses.
 *
 * Each marker set is a Points object parented to its shell node, so it inherits that shell's
 * gyroscopic tilt and baked rotation for free - the nodes ride the ring rather than being
 * animated alongside it.
 *
 * Returns the anchors as well as a disposer: the plasma synapses string their arcs between
 * these same points, so both features read from one sampling of the walk.
 */
export function attachMazeWalkNodes(scene, uniforms, { softSprite = true } = {}) {
  const material = createMazeNodeMaterial(uniforms, { softSprite });
  const attached = [];
  const anchorsByShell = [];

  for (const shell of selectWalkShells(scene)) {
    const source = shellPointGeometry(shell);
    if (!source) continue;

    const arrival = source.getAttribute('_arrival');
    const position = source.getAttribute('position');
    const falloff = source.getAttribute('_falloff');
    const colour = source.getAttribute('color');
    if (!arrival || !position || !falloff || !colour) continue;
    const ringIndex = shell.userData.ringIndex ?? 0;

    const order = Array.from({ length: arrival.count }, (_, i) => i);
    order.sort((a, b) => arrival.getX(a) - arrival.getX(b));

    const count = Math.min(
      order.length,
      Math.max(NODE_COUNT_RANGE[0], Math.min(NODE_COUNT_RANGE[1], Math.round(order.length / WALK_STRIDE)))
    );
    const step = order.length / count;

    const positions = new Float32Array(count * 3);
    const arrivals = new Float32Array(count);
    const falloffs = new Float32Array(count);
    const anchors = [];

    for (let i = 0; i < count; i++) {
      const offset = (sampleHash(i + 1) - 0.5) * step * SAMPLE_JITTER;
      const index = order[Math.max(0, Math.min(order.length - 1, Math.round(i * step + offset)))];
      const x = position.getX(index);
      const y = position.getY(index);
      const z = position.getZ(index);
      positions[i * 3] = x;
      positions[i * 3 + 1] = y;
      positions[i * 3 + 2] = z;
      arrivals[i] = arrival.getX(index);
      // Carried so the markers size off the same falloff term the base points use.
      falloffs[i] = falloff.getX(index);
      // Carried so a trace can be shaded exactly like the points it is routed between,
      // rather than with a flat stand-in colour of its own.
      anchors.push({
        position: [x, y, z],
        arrival: arrivals[i],
        falloff: falloffs[i],
        ringIndex,
        colour: [colour.getX(index), colour.getY(index), colour.getZ(index), colour.getW(index)],
      });
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('nodeArrival', new THREE.BufferAttribute(arrivals, 1));
    geometry.setAttribute('_falloff', new THREE.BufferAttribute(falloffs, 1));

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;
    shell.add(points);
    attached.push(points);
    anchorsByShell.push({ shell, anchors });
  }

  const dispose = () => {
    for (const points of attached) {
      points.removeFromParent();
      points.geometry.dispose();
    }
    material.dispose();
  };

  return { dispose, anchorsByShell };
}
