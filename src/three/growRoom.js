import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/** One serrated leaflet along +Y, length 1, from a lanceolate outline with alternating teeth. */
function leaflet(width) {
  const steps = 22;
  const edge = (side) =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const t = i / steps;
      const w = Math.pow(Math.sin(Math.PI * Math.min(t * 1.15, 1)), 0.85) * width;
      const tooth = i % 2 && t > 0.08 && t < 0.92 ? 1.35 : 1;
      return new THREE.Vector2(side * w * tooth, t);
    });
  const right = edge(1);
  const left = edge(-1).reverse();
  return new THREE.ShapeGeometry(new THREE.Shape([...right, ...left]));
}

// Seven leaflets fanned like a cannabis leaf, longest in the middle.
const FAN = [
  [-78, 0.36],
  [-52, 0.62],
  [-26, 0.86],
  [0, 1],
  [26, 0.86],
  [52, 0.62],
  [78, 0.36],
];

function fanLeaf(size) {
  const parts = FAN.map(([deg, len]) => {
    const g = leaflet(0.11);
    g.scale(len * size, len * size, 1);
    g.rotateZ((-deg * Math.PI) / 180);
    return g;
  });
  const leaf = mergeGeometries(parts);
  parts.forEach((p) => p.dispose());
  // Leaves droop slightly from the petiole rather than standing flat.
  leaf.rotateX(-Math.PI / 2.6);
  return leaf;
}

/** A whole plant (pot, stem, paired fan leaves per node, top cola), base at y = 0, about 2 tall. */
export function plantGeometry() {
  const parts = [];
  const pot = new THREE.CylinderGeometry(0.26, 0.2, 0.32, 14);
  pot.translate(0, 0.16, 0);
  parts.push(pot);
  const stem = new THREE.CylinderGeometry(0.02, 0.04, 1.5, 6);
  stem.translate(0, 0.32 + 0.75, 0);
  parts.push(stem);
  const nodes = 7;
  for (let n = 0; n < nodes; n++) {
    const k = n / (nodes - 1);
    const y = 0.48 + k * 1.2;
    const size = 0.92 - k * 0.5;
    for (const side of [0, Math.PI]) {
      const leaf = fanLeaf(size);
      leaf.translate(0, 0, -0.04);
      leaf.rotateY(side + n * 1.1);
      leaf.translate(0, y, 0);
      parts.push(leaf);
    }
  }
  // Top cola: a fat, blunt bud rather than a spire.
  const cola = new THREE.CapsuleGeometry(0.1, 0.22, 4, 8);
  cola.translate(0, 1.9, 0);
  parts.push(cola);
  const normalized = parts.map((g) => (g.index ? g.toNonIndexed() : g));
  normalized.forEach((g) => g.deleteAttribute('uv'));
  const plant = mergeGeometries(normalized);
  parts.forEach((g) => g.dispose());
  plant.computeVertexNormals();
  return plant;
}

/** Row-aligned instance matrices on the floor plane at `floorY`. Deterministic, so the layout is stable. */
export function plantRows({ floorY, compact }) {
  const out = [];
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const xs = compact ? [-4.5, 4.5] : [-8, 8];
  const zs = compact ? [-3, -9] : [-3, -12];
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  for (let z = zs[0]; z >= zs[1]; z -= 1.7)
    for (let x = xs[0]; x <= xs[1]; x += 1.25) {
      const s = 0.82 + rand() * 0.36;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rand() * Math.PI * 2);
      out.push(m.compose(new THREE.Vector3(x + (rand() - 0.5) * 0.25, floorY, z), q, new THREE.Vector3(s, s * (0.9 + rand() * 0.25), s)).clone());
    }
  return out;
}
