import * as THREE from 'three';
import { createSynapseMaterial } from './hologramTunedMaterial';

// Concurrent bolt slots. Each is dark most of its cycle, so this is the ceiling on
// simultaneous arcs rather than the count actually lit at any moment.
const BOLT_COUNT = 48;

// Subdivision levels of midpoint displacement. 4 levels gives 16 spans per bolt, enough to
// look fractured without the jaggedness collapsing into noise.
const SUBDIVISIONS = 4;
const SPANS_PER_BOLT = 2 ** SUBDIVISIONS;

// Displacement of the first midpoint, as a fraction of the bolt's length. Each deeper level
// halves it, which is what gives a bolt its self-similar kinks.
const JITTER = 0.16;
const JITTER_DECAY = 0.5;

// Strike envelope, seconds: how long an arc stays lit, and the dark gap before the slot
// re-fires somewhere else.
const STRIKE_DURATION = [0.08, 0.22];
const STRIKE_GAP = [0.18, 1.5];

// Re-randomise the bolt's shape this many times per second while it is lit, so a live arc
// crawls instead of holding one frozen silhouette.
const CRAWL_RATE = 30;

// Fraction of the strike spent rising, and how hard it falls after. A bolt is essentially
// all attack and decay - it never holds.
const STRIKE_ATTACK = 0.08;
const STRIKE_FALLOFF = 3.2;

const FLICKER_FLOOR = 0.45;

function randomRange([lo, hi]) {
  return lo + Math.random() * (hi - lo);
}

/**
 * Recursive midpoint displacement between two points.
 *
 * The classic lightning construction: halve each span, kick the new midpoint off the line,
 * halve the kick, repeat. Endpoints never move, so the bolt stays welded to the two anchors
 * it bridges however wildly the middle thrashes.
 */
function displaceMidpoints(points, amplitude, axisA, axisB) {
  let current = points;
  let kick = amplitude;

  for (let level = 0; level < SUBDIVISIONS; level++) {
    const next = [current[0]];
    for (let i = 0; i < current.length - 1; i++) {
      const a = current[i];
      const b = current[i + 1];
      const mid = a.clone().add(b).multiplyScalar(0.5);
      mid.addScaledVector(axisA, (Math.random() * 2 - 1) * kick);
      mid.addScaledVector(axisB, (Math.random() * 2 - 1) * kick);
      next.push(mid, b);
    }
    current = next;
    kick *= JITTER_DECAY;
  }
  return current;
}

function perpendicularAxes(direction, axisA, axisB) {
  axisA.set(0, 0, 1).cross(direction);
  if (axisA.lengthSq() < 1e-8) axisA.set(1, 0, 0).cross(direction);
  axisA.normalize();
  axisB.crossVectors(direction, axisA).normalize();
}

/**
 * Lightning synapses arcing between adjacent shells.
 *
 * These live in scene space rather than under a shell, because a bolt bridges two shells that
 * rotate independently - there is no single local frame both of its endpoints sit still in.
 * That is the same constraint that forced the GLB's cross-shell edges onto a static node, and
 * here it is answered by resolving both endpoints through their shells' world matrices every
 * frame instead of freezing them.
 *
 * Endpoints are drawn from the maze-walk anchors, so a bolt always terminates on a node the
 * walk actually visited rather than on an arbitrary point of the shell.
 */
export function attachSynapseLightning(scene, anchorsByShell, uniforms,
  { gapScale = 1, durationScale = 1, jitterScale = 1 } = {}) {
  const strikeDuration = STRIKE_DURATION.map((s) => s * durationScale);
  const strikeGap = STRIKE_GAP.map((s) => s * gapScale);

  const pairs = [];
  for (let i = 0; i < anchorsByShell.length - 1; i++) {
    pairs.push([anchorsByShell[i], anchorsByShell[i + 1]]);
  }
  if (!pairs.length) return null;

  const vertexCount = BOLT_COUNT * SPANS_PER_BOLT * 2;
  const positions = new Float32Array(vertexCount * 3);
  const energies = new Float32Array(vertexCount);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('boltEnergy', new THREE.BufferAttribute(energies, 1));

  const material = createSynapseMaterial(uniforms);
  const bolts = new THREE.LineSegments(geometry, material);
  bolts.frustumCulled = false;
  scene.add(bolts);

  const from = new THREE.Vector3();
  const to = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const axisA = new THREE.Vector3();
  const axisB = new THREE.Vector3();
  const toScene = new THREE.Matrix4();

  const slots = Array.from({ length: BOLT_COUNT }, () => ({
    litFrom: 0,
    litUntil: 0,
    nextStrike: Math.random() * strikeGap[1],
    nextCrawl: 0,
    path: null,
    arrival: 0,
  }));

  function reseat(slot, time) {
    const [shellA, shellB] = pairs[Math.floor(Math.random() * pairs.length)];
    const a = shellA.anchors[Math.floor(Math.random() * shellA.anchors.length)];
    const b = shellB.anchors[Math.floor(Math.random() * shellB.anchors.length)];

    from.fromArray(a.position).applyMatrix4(shellA.shell.matrixWorld).applyMatrix4(toScene);
    to.fromArray(b.position).applyMatrix4(shellB.shell.matrixWorld).applyMatrix4(toScene);

    slot.endpoints = [from.clone(), to.clone()];
    slot.arrival = Math.max(a.arrival, b.arrival);
    slot.litFrom = time;
    slot.litUntil = time + randomRange(strikeDuration);
    slot.nextStrike = slot.litUntil + randomRange(strikeGap);
    slot.nextCrawl = 0;
  }

  function reshape(slot) {
    const [a, b] = slot.endpoints;
    direction.subVectors(b, a);
    const length = direction.length();
    if (length < 1e-6) return;
    direction.divideScalar(length);
    perpendicularAxes(direction, axisA, axisB);
    slot.path = displaceMidpoints([a, b], length * JITTER * jitterScale, axisA, axisB);
  }

  function update(time, reveal) {
    toScene.copy(scene.matrixWorld).invert();
    positions.fill(0);
    energies.fill(0);

    let vertex = 0;
    for (const slot of slots) {
      if (time >= slot.nextStrike) reseat(slot, time);

      const lit = time < slot.litUntil;
      // A bolt cannot fire between shells the walk has not reached yet.
      if (!lit || reveal < slot.arrival || !slot.endpoints) {
        vertex += SPANS_PER_BOLT * 2;
        continue;
      }

      if (time >= slot.nextCrawl) {
        reshape(slot);
        slot.nextCrawl = time + 1 / CRAWL_RATE;
      }
      if (!slot.path) {
        vertex += SPANS_PER_BOLT * 2;
        continue;
      }

      // Near-instant attack then an exponential fall, which is what separates an arc from a
      // fade. Flicker rides on top so a lit bolt never reads as a clean ramp.
      const life = (time - slot.litFrom) / Math.max(1e-3, slot.litUntil - slot.litFrom);
      const attack = Math.min(1, life / STRIKE_ATTACK);
      const decay = Math.exp(-life * STRIKE_FALLOFF);
      const flicker = FLICKER_FLOOR + (1 - FLICKER_FLOOR) * Math.random();
      const energy = Math.min(1, attack * decay * flicker * 1.6);

      const path = slot.path;
      for (let i = 0; i < SPANS_PER_BOLT; i++) {
        const a = path[i];
        const b = path[i + 1];
        // Taper toward the far end, so the leader reads brighter than the tail.
        const headward = 1 - (i / SPANS_PER_BOLT) * 0.45;
        for (const point of [a, b]) {
          positions[vertex * 3] = point.x;
          positions[vertex * 3 + 1] = point.y;
          positions[vertex * 3 + 2] = point.z;
          energies[vertex] = energy * headward;
          vertex++;
        }
      }
    }

    geometry.attributes.position.needsUpdate = true;
    geometry.attributes.boltEnergy.needsUpdate = true;
  }

  const dispose = () => {
    bolts.removeFromParent();
    geometry.dispose();
    material.dispose();
  };

  return { update, dispose };
}
