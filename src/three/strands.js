import * as THREE from 'three';
import { REDUCED } from '../env';

// Every strand head is advected through a chaotic flow whose state stays bounded (|s| < ~36), and only
// its direction is drawn, so all trails live on a unit sphere: object scale sets the shell radius.
// Converging on the attractor is what draws the knot "character"; nothing else shapes it.
const flow = (x, y, z) => [-1.9 * x + y * y - z * z + 18.81, x * (y - 5 * z) + 1, -z + x * (5 * y + z)];

const COUNT = 320;
const TAIL = 24;
const DT = 0.003;
const PREWARM = 260;
const SEG = (TAIL - 1) * 2;
/** Vertices per strand in the shared geometry, so a shader can tell strands apart by `gl_VertexID`. */
export const STRAND_VERTS = SEG;

function build() {
  const state = new Float32Array(COUNT * 3);
  const trail = new Float32Array(COUNT * TAIL * 3);
  const pos = new Float32Array(COUNT * SEG * 3);
  const col = new Float32Array(COUNT * SEG * 3);
  const cyan = new THREE.Color('#08fdd8');
  const pink = new THREE.Color('#ff69b4');
  const white = new THREE.Color('#ffffff');
  const tint = new THREE.Color();
  const v = new THREE.Vector3();
  for (let i = 0; i < COUNT; i++) {
    v.randomDirection().toArray(state, i * 3);
    for (let k = 0; k < TAIL; k++) v.toArray(trail, (i * TAIL + k) * 3);
    const r = Math.random();
    tint.copy(r < 0.22 ? pink : cyan).lerp(white, r < 0.22 ? 0.15 : 0.45);
    // Tail fades to black so additive blending makes it vanish rather than end abruptly.
    for (let k = 0; k < TAIL - 1; k++) {
      for (let e = 0; e < 2; e++) {
        const f = ((k + e) / (TAIL - 1)) ** 2;
        tint.toArray(col, ((i * SEG + k * 2 + e) * 3));
        for (let c = 0; c < 3; c++) col[(i * SEG + k * 2 + e) * 3 + c] *= f;
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geometry.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1);

  const advance = () => {
    for (let i = 0; i < COUNT; i++) {
      const s = i * 3;
      const [dx, dy, dz] = flow(state[s], state[s + 1], state[s + 2]);
      state[s] += dx * DT;
      state[s + 1] += dy * DT;
      state[s + 2] += dz * DT;
      const t = i * TAIL * 3;
      trail.copyWithin(t, t + 3, t + TAIL * 3);
      v.fromArray(state, s).normalize().toArray(trail, t + (TAIL - 1) * 3);
    }
  };
  const write = () => {
    for (let i = 0; i < COUNT; i++) {
      for (let k = 0; k < TAIL - 1; k++) {
        const a = (i * TAIL + k) * 3;
        const o = (i * SEG + k * 2) * 3;
        pos.set(trail.subarray(a, a + 6), o);
      }
    }
    geometry.attributes.position.needsUpdate = true;
  };
  for (let n = 0; n < PREWARM; n++) advance();
  write();
  return { geometry, advance, write, last: 0 };
}

let field;

/** Scroll distance, in viewport heights, over which a section boundary tightens the strand tunnel. */
export const SEAM_SPAN = 0.5;

/** Advances the shared field once per animation frame, however many canvases draw it. */
export function stepStrands(delta) {
  if (REDUCED) return;
  const now = performance.now();
  // Canvases share one rAF tick, so a second caller lands within the same couple of milliseconds.
  if (now - field.last < 4) return;
  field.last = now;
  const n = THREE.MathUtils.clamp(Math.round(delta * 60), 1, 4);
  for (let i = 0; i < n; i++) field.advance();
  field.write();
}

/** A unit-radius view of the shared strand field; scale it to set the shell radius. */
export function createStrands({ opacity = 1 } = {}) {
  field ??= build();
  const lines = new THREE.LineSegments(
    field.geometry,
    new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false })
  );
  lines.frustumCulled = false;
  return lines;
}
