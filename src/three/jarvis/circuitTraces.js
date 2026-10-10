import * as THREE from 'three';
import { createTraceMaterial } from './hologramTunedMaterial';

// Source voxel pitch, from the asset's own hologram_tuned.json. Routing snaps to this, so a
// trace runs along the same rectilinear grid the blocks sit on rather than cutting across it.
const VOXEL = 0.0078125;

// Elbows per trace. One L reads as a corner; a few alternating steps read as a routed track.
const STAIRCASE_STEPS = 3;

// Manhattan reach of a trace, in voxels. The walk crosses between components and those jumps
// would otherwise be routed as absurdly long runs across the ring.
const MAX_REACH = 18;

// The walk's leading band comes in heavily fractured and settles as it advances, but never
// to a solid etch - every band keeps some breakage, so the track reads as a fractured
// structure throughout rather than an unbroken circuit that merely starts rough.
const FRACTURE_BAND = 0.42;
const FRACTURE_MAX = 0.72;
const FRACTURE_BASE = 0.34;

// How far ahead in the walk a trace may reach for its partner. Always joining i to i+1 links
// anchors at the same hop depth, so the runs stack up parallel; reaching a variable distance
// ahead makes them cross radial depths instead of tracking one front.
const PARTNER_SPREAD = 14;

// Links emitted per anchor. One link per anchor produces a single chain i->i+1->i+2, and a
// chain is a band by construction however much each run detours. Several links to randomly
// chosen nearby anchors make a scattered network instead, which disperses across the ring
// the way the revealed points do. Over-long picks are rejected by MAX_REACH, so this
// self-limits rather than producing spokes.
const LINKS_PER_ANCHOR = 3;

// Radial detour, as a multiple of the ring's own radial thickness. Without a detour a run
// staircases monotonically between its anchors and hugs the arc between them, parallel to its
// neighbours. Scaled to the shell rather than fixed in voxels: a fixed detour large enough to
// disperse the thin rings pushes runs clear outside the volume the points occupy, and the
// traces then read as a layer laid over the cloud instead of running through it.
const DETOUR_SPREAD = 0.9;

function fractureHash(a, b) {
  const x = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

const AXIS_ORDERS = [
  [0, 1, 2],
  [1, 0, 2],
];

function snap(value) {
  return Math.round(value / VOXEL) * VOXEL;
}

/**
 * Route one trace as an axis-aligned staircase between two anchors.
 *
 * Strictly rectilinear: every leg runs along one local axis and every corner is square. An
 * earlier version routed the tangential leg as an arc following the ring's curvature, which
 * is a curve however short it is, and that is what kept reading as string rather than track.
 *
 * Straight Cartesian legs do cut very slightly inside the ring, but only by the span length -
 * a median run here is about three voxels against a ring radius of 0.4, so the deviation is
 * far below what the curvature would need to be visible.
 */
function staircase(from, to, order, out) {
  const cursor = [...from];
  for (let step = 1; step <= STAIRCASE_STEPS; step++) {
    const fraction = step / STAIRCASE_STEPS;
    // Alternate which axis leads each step, so the run staircases instead of making one L.
    const legs = step % 2 === 0 ? [...order].reverse() : order;
    for (const axis of legs) {
      const target = snap(from[axis] + (to[axis] - from[axis]) * fraction);
      if (Math.abs(target - cursor[axis]) < VOXEL * 0.5) continue;
      cursor[axis] = target;
      out.push([...cursor]);
    }
  }
  for (const axis of order) {
    if (Math.abs(to[axis] - cursor[axis]) < VOXEL * 0.5) continue;
    cursor[axis] = to[axis];
    out.push([...cursor]);
  }
  return cursor;
}

function routeTrace(a, b, variant, detour) {
  const from = [snap(a[0]), snap(a[1]), snap(a[2])];
  const to = [snap(b[0]), snap(b[1]), snap(b[2])];

  const reach =
    Math.abs(to[0] - from[0]) + Math.abs(to[1] - from[1]) + Math.abs(to[2] - from[2]);
  if (reach < VOXEL * 0.5 || reach > MAX_REACH * VOXEL) return null;

  // Waypoint pushed off the direct line along the local radial, so the run detours across
  // radius instead of tracking the arc between its anchors.
  const midX = (from[0] + to[0]) / 2;
  const midY = (from[1] + to[1]) / 2;
  const radial = Math.hypot(midX, midY) || 1;
  const swing = (fractureHash(variant, 53) - 0.5) * 2 * detour;
  const waypoint = [
    snap(midX + (midX / radial) * swing),
    snap(midY + (midY / radial) * swing),
    snap((from[2] + to[2]) / 2),
  ];

  const order = AXIS_ORDERS[variant % AXIS_ORDERS.length];
  const points = [[...from]];
  staircase(from, waypoint, order, points);
  staircase(waypoint, to, [...order].reverse(), points);

  return points.length >= 2 ? points : null;
}

/**
 * Build one merged LineSegments for a shell's traces.
 *
 * `anchors` arrive in walk order, so joining neighbours traces the path the walk actually
 * took. Each vertex carries:
 *   strandT       0..1 along the run, by arc length, so current flows at an even rate
 *   strandArrival the later of its two anchors, so a run lights only once both pads exist
 *   strandSeed    per-trace phase offset, so runs do not pulse in unison
 */
function buildTraceGeometry(anchors, radialSpread) {
  const positions = [];
  const ts = [];
  const arrivals = [];
  const seeds = [];
  const colours = [];
  const falloffs = [];
  const rings = [];

  // Keeps runs inside the shell's own thickness, so they disperse without lifting off it.
  const detour = Math.max(VOXEL, radialSpread * DETOUR_SPREAD);

  for (let i = 0; i < anchors.length - 1; i++) {
    for (let link = 0; link < LINKS_PER_ANCHOR; link++) {
      const reach = 1 + Math.floor(fractureHash(i, 91 + link * 17) * PARTNER_SPREAD);
      const j = Math.min(anchors.length - 1, i + reach);
      if (j === i) continue;
      emitTrace(anchors, i, j, i * LINKS_PER_ANCHOR + link);
    }
  }

  function emitTrace(list, i, j, variant) {
    const path = routeTrace(list[i].position, list[j].position, variant, detour);
    if (!path || path.length < 2) return;

    // Cumulative run length, so strandT is even along the trace rather than per-corner.
    const lengths = [0];
    for (let k = 1; k < path.length; k++) {
      const dx = path[k][0] - path[k - 1][0];
      const dy = path[k][1] - path[k - 1][1];
      const dz = path[k][2] - path[k - 1][2];
      lengths.push(lengths[k - 1] + Math.hypot(dx, dy, dz));
    }
    const span = lengths[lengths.length - 1];
    if (span < 1e-6) return;

    const seed = (variant * 0.6180339887) % 1;
    const from = list[i];
    const to = list[j];

    // Gaps are densest at the head of the walk, easing to FRACTURE_BASE past FRACTURE_BAND.
    const arrival = Math.max(list[i].arrival, list[j].arrival);
    const lead = arrival < FRACTURE_BAND ? 1 - arrival / FRACTURE_BAND : 0;
    const gapChance = FRACTURE_BASE + (FRACTURE_MAX - FRACTURE_BASE) * lead;

    for (let k = 0; k < path.length - 1; k++) {
      // Drop a leg outright rather than shortening it - a break in the etch, not a taper.
      if (gapChance > 0 && fractureHash(variant, k) < gapChance) continue;
      for (const end of [k, k + 1]) {
        const t = lengths[end] / span;
        positions.push(path[end][0], path[end][1], path[end][2]);
        ts.push(t);
        // Interpolated rather than a single value per run: it draws on along its own length
        // as the front passes, and each end drifts with the points it is routed between.
        arrivals.push(from.arrival + (to.arrival - from.arrival) * t);
        seeds.push(seed);
        // Blend the two anchors' baked shading across the run, so a trace hands off
        // continuously between the points it joins instead of cutting to a flat colour.
        for (let c = 0; c < 4; c++) {
          colours.push(from.colour[c] + (to.colour[c] - from.colour[c]) * t);
        }
        falloffs.push(from.falloff + (to.falloff - from.falloff) * t);
        rings.push(from.ringIndex);
      }
    }
  }

  if (!positions.length) return null;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('strandT', new THREE.Float32BufferAttribute(ts, 1));
  geometry.setAttribute('strandSeed', new THREE.Float32BufferAttribute(seeds, 1));
  // Named to match the base points' own attributes, so the shared shading reads a trace and
  // a point through exactly the same path.
  geometry.setAttribute('_arrival', new THREE.Float32BufferAttribute(arrivals, 1));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colours, 4));
  geometry.setAttribute('_falloff', new THREE.Float32BufferAttribute(falloffs, 1));
  geometry.setAttribute('_ring_index', new THREE.Float32BufferAttribute(rings, 1));
  return geometry;
}

/**
 * Attach circuit traces to the shells, routed between the maze-walk node anchors.
 *
 * One merged LineSegments per shell rather than a mesh per trace: that is 4 draw calls
 * instead of hundreds. Parented to the shell node, so the traces inherit its gyroscopic tilt
 * and baked rotation along with the pads they connect.
 */
export function attachCircuitTraces(anchorsByShell, uniforms) {
  const material = createTraceMaterial(uniforms);
  const attached = [];

  for (const { shell, anchors } of anchorsByShell) {
    const { radialCV = 0.05, radius = 0.4 } = shell.userData || {};
    const geometry = buildTraceGeometry(anchors, radialCV * radius);
    if (!geometry) continue;
    const traces = new THREE.LineSegments(geometry, material);
    traces.frustumCulled = false;
    shell.add(traces);
    attached.push(traces);
  }

  return () => {
    for (const traces of attached) {
      traces.removeFromParent();
      traces.geometry.dispose();
    }
    material.dispose();
  };
}
