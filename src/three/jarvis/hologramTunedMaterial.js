import * as THREE from 'three';
import { PointsNodeMaterial, LineBasicNodeMaterial } from 'three/webgpu';
import {
  Fn, uniform, attribute, vec3, vec4, float, mix, pow, max, abs, sin, cos, fract,
  clamp, smoothstep, saturate, oneMinus, atan, length, pointUV, positionGeometry,
  positionView, positionLocal, floor, Discard, dot,
} from 'three/tsl';

// Hot end of the trail, measured off the imported asset's own COLOR_0 rather than any
// external clip: binning its 29,514 points by luminance gives a monotonic hue ramp from
// 26.8 deg in the dimmest decile to 39.5 deg in the brightest 1%, whose mean emission is
// this value. The settled end needs no constant at all - it is each point's own baked
// colour. So both ends of the dissolve come out of the GLB.
const HOT_EMISSION = [0.9908, 0.6526, 0.0];
// Mean emission over all 29,514 points - the settled colour for instances, which have no
// COLOR_0 of their own to fall back to.
const SETTLED_EMISSION = [0.7089, 0.3977, 0.0];

// Maze-walk node markers. They are anchors first: the traces route between them, and at rest
// they stay invisible so what reads is the track, not a bead on it. They surface only while
// the walk front is passing, which makes a junction register as the run reaches it.
const NODE_BASE_ALPHA = 0.0;
const NODE_SIZE_SCALE = 1.1;
const NODE_FLARE = 0.9;

// Circuit traces: standing waves per run, flow rate, brightness gain, and the dim floor that
// keeps a settled trace readable. Look constants, not measurements.
const TRACE_WAVES = 3.0;
const TRACE_SPEED = 2.2;
const TRACE_GAIN = 2.6;
const TRACE_FLOOR = 0.12;

// Floor under the standing wave. Without it the wave troughs to zero and a trace blinks out
// completely between crests, which reads as the run dissolving rather than carrying current.
const TRACE_SUSTAIN = 0.45;

// Length of the hot tail behind the walk front.
const TRAIL_LENGTH = 0.35;

// How far the source lattice sits behind the routed traces.
const LATTICE_DIM = 0.30;
const LATTICE_ALPHA = 0.14;

// Carried from trellis-mac/viewer.html, whose look this reproduces.
const POINT_BASE_SIZE = 6.0;
const POINT_SIZE_RANGE = [1.0, 20.0];
const RIM_INTENSITY_FLOOR = 0.25;
const SOFT_EDGE = [0.5, 0.05];

// Square sprite mask. The production account calls JARVIS "human-engineered, highly ordered,
// modernist construction", so the lattice reads as modular blocks rather than soft dots. The
// edge stays slightly soft to avoid aliasing at the 1-2px sizes most points land at.
const BLOCK_EDGE = [0.5, 0.36];

// Data-storage motifs the design deliberately references: concentric platter grooves with
// radial spokes, and a reel-to-reel spiral wind. Counts are look choices.
const PLATTER_GROOVES = 18.0;
const PLATTER_SPOKES = 12.0;
const REEL_WINDINGS = 26.0;
const MOTIF_DEPTH = 0.55;

// Crystal-lattice faceting, scoped to the outer planar rings only. Cells are quantised in
// both angle and radius, and each takes a fixed hash, so boundaries land hard rather than
// blending - that discontinuity is what reads as a facet instead of a gradient.
//
// Deliberately bounded: the production account defines JARVIS against Ultron on exactly this
// axis ("concentric spherical rings" vs "asymmetric fractured facets"). Confining it to the
// outer rings keeps the concentric silhouette and the central heart, which are the features
// that separate the two.
const FACET_SECTORS = 22.0;
const FACET_BANDS = 5.0;
const FACET_DEPTH = 0.42;

// Highlight band exponent, carried from the Houdini recipe in CLAUDE.md
// (`pow(max(0, cos(u - t*speed - phase)), 6)`). Unsourced - a look constant, not measured.
const SWEEP_EXPONENT = 6.0;

function makeTunedUniforms() {
  return {
    uTime: uniform(0),
    // Head of the geodesic draw-on, 0..1 against the baked _ARRIVAL.
    uReveal: uniform(1),
    // How far behind the walk front still reads as hot, in _ARRIVAL units. Spans the whole
    // structure 0..1, so at the default 15s reveal this is about five seconds of decay per
    // point rather than the fraction of a second a short trail gives.
    uTrail: uniform(TRAIL_LENGTH),
    // Idle (0) to interactive (1); gates the sweep and the rotation-linked brightness.
    uInteractive: uniform(0),
    uSweep: uniform(0),
    uSweepGain: uniform(0.6),
    uShimmer: uniform(0.18),
    uSurge: uniform(1),
    // Extra current pushed through the circuit traces. Bound to tool activity, which is the
    // working layer of a session - the traces are the propagation, so they carry it.
    uTraceDrive: uniform(0),
    // Ring indices carrying the storage motifs, chosen from the asset's own outer planar
    // shells at mount rather than hardcoded here. -1 disables.
    uPlatterRingA: uniform(-1),
    uPlatterRingB: uniform(-1),
    uReelRing: uniform(-1),
    // Glyph streams scrolling along the platter/reel rings, radians of motif phase per second.
    // 0 keeps the motifs still; a replica glTF from the autoresearch loop sets it.
    uGlyphScroll: uniform(0),
    // Widest ring radius, used to normalise the motif's radial frequency.
    uShellRadius: uniform(0.5),
    // Fragment dispersal: how far a settled point drifts off the lattice it was baked on.
    // The production account describes JARVIS fragmenting to point clouds, so the structure
    // loosens behind the walk instead of staying welded.
    uDisperse: uniform(0.0),
    // Lowest ring index that counts as an outer planar ring, from the asset's own shell
    // profiles. -1 disables faceting entirely.
    uFacetRingMin: uniform(-1),
    uHotColor: uniform(new THREE.Color(...HOT_EMISSION)),
    // 0..1: how far the page's strands have taken the hologram over, recolouring it into their palette.
    uPossess: uniform(0),
  };
}

/**
 * Shading shared by the point and line passes.
 *
 * `_ARRIVAL` is the per-point hop distance along its shell's own lattice, baked by
 * dcc_scripts/animate_hologram_glb.py. Gating on it is the maze-walk reveal: a point is
 * dark until the walk reaches it, burns hot for `uTrail` after, then settles to the baked
 * amber. That decay is the dissolving trail.
 */
function tunedShading(uniforms) {
  const arrival = attribute('_arrival', 'float');
  const falloff = attribute('_falloff', 'float');
  const emission = attribute('color', 'vec4');

  const age = uniforms.uReveal.sub(arrival);
  Discard(age.lessThan(0.0));

  const heat = saturate(oneMinus(age.div(uniforms.uTrail)));

  // _FALLOFF is 1 at the core and 0 at the rim (correlates -0.999 with radius), so this
  // keeps the core bright and lets the rim fall away.
  const intensity = mix(float(RIM_INTENSITY_FLOOR), float(1.0), falloff);

  // Traveling highlight band around the shell's own plane. Shell geometry is circular in
  // local XY about Z - its measured symmetry axis - so the local angle is the ring
  // parameter, and the node's tilt carries the band into the tilted plane for free.
  const angle = atan(positionGeometry.y, positionGeometry.x);
  const band = pow(max(cos(angle.sub(uniforms.uSweep)), 0.0), float(SWEEP_EXPONENT));
  const sweep = float(1.0).add(band.mul(uniforms.uSweepGain).mul(uniforms.uInteractive));

  const ringIndex = attribute('_ring_index', 'float');
  const shellRadius = length(positionGeometry.xy).div(max(float(1e-4), uniforms.uShellRadius));
  const motif = storageMotif(uniforms, ringIndex, shellRadius, angle.sub(uniforms.uTime.mul(uniforms.uGlyphScroll)));
  const facet = facetPattern(uniforms, ringIndex, shellRadius, angle);

  // Rim points flicker, the dense core holds steady.
  const rim = oneMinus(falloff);
  const noise = fract(sin(arrival.mul(127.1).add(uniforms.uTime.mul(3.0))).mul(43758.5453));
  const shimmer = float(1.0).add(noise.sub(0.5).mul(uniforms.uShimmer).mul(rim).mul(2.0));

  const own = mix(emission.rgb, uniforms.uHotColor, heat)
    .mul(intensity)
    .mul(sweep)
    .mul(shimmer)
    .mul(motif)
    .mul(facet)
    .mul(uniforms.uSurge);

  // Possessed: same brightness, re-hued into the strands' cyan with pink bands drifting round the rings.
  const band2 = sin(angle.mul(3.0).add(uniforms.uTime.mul(0.8)).add(arrival.mul(9.0))).mul(0.5).add(0.5);
  const strandHue = mix(vec3(0.03, 0.99, 0.85), vec3(1.0, 0.41, 0.71), smoothstep(0.6, 0.95, band2));
  const rgb = mix(own, strandHue.mul(dot(own, vec3(0.299, 0.587, 0.114)).mul(1.5)), uniforms.uPossess);

  return { rgb, alpha: emission.w, heat, falloff };
}

/**
 * The base GLB's point sizing: perspective-correct off view-space depth, clamped so a point
 * neither vanishes at distance nor smears across the screen up close.
 *
 * Note three's own limitation - the WebGPU backend clamps point primitives to 1px and ignores
 * this entirely, so the sprite look only lands on the WebGL2 backend App.jsx falls back to.
 */
/**
 * Square sprite mask: Chebyshev distance from the point's centre, so the falloff runs to the
 * edges of a box rather than a circle and each point reads as a rectilinear block.
 */
function blockMask() {
  const d = pointUV.sub(0.5).abs();
  return smoothstep(float(BLOCK_EDGE[0]), float(BLOCK_EDGE[1]), max(d.x, d.y));
}

function tunedPointSize(gain = float(1.0)) {
  const falloff = attribute('_falloff', 'float');
  const scale = float(POINT_BASE_SIZE).mul(float(1.0).add(falloff.mul(0.5)));
  return clamp(
    scale.mul(gain).div(positionView.z.negate()),
    POINT_SIZE_RANGE[0],
    POINT_SIZE_RANGE[1]
  );
}

/**
 * Platter grooves, radial spokes, and a reel-to-reel spiral, applied only to the shells whose
 * ring index matches. Returns a multiplier around 1.0 so a shell with no motif is untouched.
 *
 * Radius is normalised against the shell's own mean radius, which the baker measured and
 * wrote into node extras, so the groove spacing is even rather than bunching at the hub.
 */
function storageMotif(uniforms, ring, radius, angle) {
  const isPlatter = abs(ring.sub(uniforms.uPlatterRingA)).lessThan(0.5)
    .or(abs(ring.sub(uniforms.uPlatterRingB)).lessThan(0.5));
  const isReel = abs(ring.sub(uniforms.uReelRing)).lessThan(0.5);

  const groove = oneMinus(abs(fract(radius.mul(PLATTER_GROOVES)).sub(0.5)).mul(2.0));
  const spoke = pow(abs(cos(angle.mul(PLATTER_SPOKES).mul(0.5))), float(4.0));
  const platter = max(groove.mul(0.55), spoke.mul(0.85));

  // A spiral is a groove whose radius is offset by angle - one continuous wind rather than
  // closed concentric rings, which is what separates tape from a platter.
  const wind = radius.mul(REEL_WINDINGS).sub(angle.div(6.2831853).mul(REEL_WINDINGS));
  const reel = oneMinus(abs(fract(wind).sub(0.5)).mul(2.0));

  const motif = isPlatter.select(platter, isReel.select(reel, float(0.5)));
  return float(1.0 - MOTIF_DEPTH).add(motif.mul(MOTIF_DEPTH * 2.0));
}

/**
 * Quantised facet cells for the outer planar rings.
 *
 * Returns a multiplier around 1.0; rings below `uFacetRingMin`, and the core, come back
 * untouched at exactly 1.0.
 */
function facetPattern(uniforms, ring, radius, angle) {
  const enabled = uniforms.uFacetRingMin.greaterThanEqual(0.0).and(ring.greaterThanEqual(uniforms.uFacetRingMin));

  const sector = floor(angle.div(6.2831853).add(0.5).mul(FACET_SECTORS));
  const band = floor(radius.mul(FACET_BANDS));
  const hash = fract(sin(sector.mul(12.9898).add(band.mul(78.233))).mul(43758.5453));

  return enabled.select(float(1.0 - FACET_DEPTH).add(hash.mul(FACET_DEPTH * 2.0)), float(1.0));
}

/**
 * Fragment dispersal, shared by the points and the routed traces.
 *
 * Both have to read the same function or they separate: the points drift off the lattice once
 * the walk front passes while the traces stay welded to it, and the traces then read as a
 * layer sitting on top of the cloud rather than running through it.
 */
function fragmentDrift(uniforms) {
  const arrival = attribute('_arrival', 'float');
  const settled = saturate(uniforms.uReveal.sub(arrival).sub(uniforms.uTrail).mul(2.0));
  const drift = vec3(
    fract(sin(arrival.mul(127.1)).mul(43758.5453)).sub(0.5),
    fract(sin(arrival.mul(311.7)).mul(43758.5453)).sub(0.5),
    fract(sin(arrival.mul(74.7)).mul(43758.5453)).sub(0.5)
  );
  const wander = sin(uniforms.uTime.mul(0.35).add(arrival.mul(24.0))).mul(0.5).add(0.5);
  return drift.mul(settled).mul(wander).mul(uniforms.uDisperse);
}

function withTunedBlending(material) {
  material.transparent = true;
  material.blending = THREE.AdditiveBlending;
  material.depthWrite = false;
  return material;
}

/**
 * `softSprite` must be false on the WebGPU backend. `pointUV` lowers to `gl_PointCoord`,
 * which has no WGSL equivalent, so leaving it in fails shader-module creation outright and
 * takes the whole points pipeline down - not a soft degrade. Nothing is lost visually:
 * WebGPU clamps point primitives to 1px, and a round mask on a single pixel is a no-op.
 */
export function createTunedPointsMaterial(uniforms = makeTunedUniforms(), { softSprite = true } = {}) {
  const material = withTunedBlending(new PointsNodeMaterial());

  // Settled points drift off the lattice, so the structure reads as fragments loosening into
  // a cloud rather than a fixed mesh.
  material.positionNode = Fn(() => positionLocal.add(fragmentDrift(uniforms)))();

  material.colorNode = Fn(() => {
    const { rgb, alpha, heat } = tunedShading(uniforms);
    const boost = alpha.mul(float(1.0).add(heat));
    if (!softSprite) return vec4(rgb, boost);
    return vec4(rgb, boost.mul(blockMask()));
  })();

  material.sizeNode = Fn(() => {
    const ring = attribute('_ring_index', 'float');
    return tunedPointSize(ring.greaterThanEqual(0.0).select(float(0.7), float(1.3)));
  })();

  material.uniforms = uniforms;
  return material;
}

/**
 * Material for the maze-walk node markers riding the outer planar shells.
 *
 * These are Points, not meshes, and they deliberately reuse `tunedPointSize` - the base
 * GLB's own sizing law. A world-space marker can never sit flush with a screen-space point:
 * it would swell on approach while the points around it held still. Sharing the law keeps a
 * node the same size as the geometry it is a node of, at every zoom.
 *
 * `nodeArrival` holds each marker's position along its shell's geodesic walk, so they switch
 * on in walk order and flare as the front passes rather than all at once.
 */
export function createMazeNodeMaterial(uniforms = makeTunedUniforms(), { softSprite = true } = {}) {
  const material = withTunedBlending(new PointsNodeMaterial());

  material.colorNode = Fn(() => {
    const arrival = attribute('nodeArrival', 'float');
    const age = uniforms.uReveal.sub(arrival);
    Discard(age.lessThan(0.0));
    const heat = saturate(oneMinus(age.div(uniforms.uTrail)));
    const rgb = mix(vec3(...SETTLED_EMISSION), uniforms.uHotColor, heat).mul(uniforms.uSurge);
    const alpha = float(NODE_BASE_ALPHA).add(heat.mul(1.0 - NODE_BASE_ALPHA));
    if (!softSprite) return vec4(rgb, alpha);
    return vec4(rgb, alpha.mul(blockMask()));
  })();

  material.sizeNode = Fn(() => {
    const arrival = attribute('nodeArrival', 'float');
    const heat = saturate(oneMinus(uniforms.uReveal.sub(arrival).div(uniforms.uTrail)));
    // Same law as the base points, lifted only while the walk front is passing through.
    return tunedPointSize(float(NODE_SIZE_SCALE).mul(float(1.0).add(heat.mul(NODE_FLARE))));
  })();

  material.uniforms = uniforms;
  return material;
}

/**
 * Circuit traces routed between maze-walk node anchors.
 *
 * Shading runs through `tunedShading`, the same path the base points use, reading the same
 * attribute names. The trace geometry carries its anchors' own baked COLOR_0 and _FALLOFF
 * blended along the run, so a trace picks up the per-point colour, the falloff intensity,
 * the storage motif, the faceting and the highlight sweep exactly as the lattice around it
 * does. Before this it used a flat average colour and skipped all of that, which is what made
 * the tracks read as a separate overlay rather than part of the same structure.
 *
 * What stays specific to a trace is current: a sustained standing wave along its length.
 */
export function createTraceMaterial(uniforms = makeTunedUniforms()) {
  const material = withTunedBlending(new LineBasicNodeMaterial());

  // Same dispersal the points use. Trace vertices carry an arrival interpolated between their
  // two anchors, so each end drifts with the points it is routed between.
  material.positionNode = Fn(() => positionLocal.add(fragmentDrift(uniforms)))();

  material.colorNode = Fn(() => {
    const { rgb, alpha } = tunedShading(uniforms);

    const t = attribute('strandT', 'float');
    const seed = attribute('strandSeed', 'float');
    const pinned = sin(t.mul(Math.PI));
    const phase = t.mul(TRACE_WAVES).add(uniforms.uTime.mul(TRACE_SPEED)).add(seed.mul(6.2831853));
    const wave = sin(phase).mul(0.5).add(0.5);
    const energy = pinned
      .mul(float(TRACE_SUSTAIN).add(wave.mul(1.0 - TRACE_SUSTAIN)))
      .mul(float(TRACE_GAIN).add(uniforms.uTraceDrive));

    return vec4(rgb.mul(energy.add(TRACE_FLOOR)), alpha.mul(energy.mul(0.7).add(TRACE_FLOOR)));
  })();

  material.uniforms = uniforms;
  return material;
}

/**
 * Synapse lightning arcing between shells.
 *
 * Unlike every other material here, this one does no animation. The bolt's shape and its
 * strike envelope are both solved on the CPU each frame by synapseLightning.js, because a
 * bolt spans two shells that rotate independently - its endpoints only exist in world space,
 * which a shader working in one shell's local space cannot reach.
 *
 * So `boltEnergy` arrives already integrated: 0 between strikes, peaking white-hot at the
 * leader and falling off along the branches.
 */
export function createSynapseMaterial(uniforms = makeTunedUniforms()) {
  const material = withTunedBlending(new LineBasicNodeMaterial());

  material.colorNode = Fn(() => {
    const energy = attribute('boltEnergy', 'float');
    Discard(energy.lessThan(0.01));
    // Hot cores drive past the asset's own amber toward white, the way a real arc's core
    // blows out while its edges keep the colour.
    const rgb = mix(uniforms.uHotColor, vec3(1.0, 1.0, 0.92), saturate(energy.sub(0.55).mul(2.2)))
      .mul(energy)
      .mul(uniforms.uSurge);
    return vec4(rgb, saturate(energy));
  })();

  material.uniforms = uniforms;
  return material;
}

export function createTunedLineMaterial(uniforms = makeTunedUniforms()) {
  const material = withTunedBlending(new LineBasicNodeMaterial());

  material.colorNode = Fn(() => {
    const { rgb, alpha, heat } = tunedShading(uniforms);
    // The source lattice is 243,698 segments against ~2,500 routed traces, so left at equal
    // weight it buries them by sheer count. It reads as the substrate the walk runs over,
    // which means it sits well back - the walk is the propagation, not this.
    return vec4(rgb.mul(LATTICE_DIM), alpha.mul(LATTICE_ALPHA).mul(float(1.0).add(heat.mul(2.0))));
  })();

  material.uniforms = uniforms;
  return material;
}

export { makeTunedUniforms };
