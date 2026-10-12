import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { createStrands } from './strands';

const CODE = [
  '# views.py',
  'class ToolCall(View):',
  '    def post(self, request):',
  '        msg = json.loads(request.body)',
  '        reply = ollama.chat(',
  "            model='llama3.2',",
  '            messages=msg,',
  '            tools=TOOLS,',
  '        )',
  '        return run_tools(reply)',
  '',
  '// Globe.jsx',
  'export default function Globe() {',
  '  return <Canvas dpr={1}>',
  '    <Earth spin />',
  '  </Canvas>;',
  '}',
];

// Glyphs only, on a clear canvas: drawn additively, the screen is code floating inside the strand outline.
function screenTexture() {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 384;
  const ctx = c.getContext('2d');
  ctx.font = '15px monospace';
  CODE.forEach((line, i) => {
    ctx.fillStyle = /^(#|\/\/)/.test(line) ? '#a3b8b1' : /^(class|export)/.test(line) ? '#ff69b4' : '#9ad8c4';
    ctx.fillText(line, 22, 30 + i * 20);
  });
  ctx.fillStyle = '#08fdd8';
  ctx.fillRect(22, 30 + CODE.length * 20 - 12, 9, 15);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// The monitor, stand, keyboard and mouse as [geometry, matrix] pairs; only their edges are ever drawn.
function workstationParts() {
  const at = (x, y, z, rx = 0, s = [1, 1, 1]) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, 0, 0)), new THREE.Vector3(...s));
  const parts = [
    [new RoundedBoxGeometry(1.6, 1.05, 0.12, 4, 0.05), at(0, 0.72, 0)],
    [new THREE.PlaneGeometry(1.48, 0.93), at(0, 0.72, 0.062)],
    [new THREE.CylinderGeometry(0.05, 0.06, 0.42, 20), at(0, 0.06, -0.06)],
    [new RoundedBoxGeometry(0.62, 0.04, 0.38, 3, 0.02), at(0, -0.15, -0.02)],
    [new RoundedBoxGeometry(1.42, 0.05, 0.46, 3, 0.02), at(0, -0.15, 0.62)],
    [new THREE.CapsuleGeometry(0.06, 0.08, 6, 12), at(0.95, -0.13, 0.62, Math.PI / 2, [1, 1, 0.55])],
  ];
  // Keys are flat outlines: as bevelled boxes their stacked edges added up to one blown-out bar.
  const key = new THREE.PlaneGeometry(0.08, 0.07);
  for (let r = 0; r < 5; r++) for (let c = 0; c < 14; c++) parts.push([key, at(-0.6 + c * 0.093 + (r % 2) * 0.02, -0.095, 0.45 + r * 0.084, -Math.PI / 2)]);
  return parts;
}

const VERT = /* glsl */ `
  attribute vec3 aFrom;
  attribute float aAlong;
  attribute float aSeed;
  uniform float uForm;
  uniform float uTime;
  varying float vGlow;
  varying float vSeed;
  varying float vForm;
  void main() {
    // Each segment leaves the river on its own beat, so the outline assembles rather than snapping.
    float f = clamp(uForm * 1.6 - aSeed * 0.6, 0.0, 1.0);
    f = f * f * (3.0 - 2.0 * f);
    vForm = f;
    vSeed = aSeed;
    vGlow = smoothstep(0.82, 1.0, fract(aAlong * 0.5 + uTime * 0.45 + aSeed * 7.0));
    gl_Position = projectionMatrix * modelViewMatrix * vec4(mix(aFrom, position, f), 1.0);
  }
`;
const FRAG = /* glsl */ `
  uniform vec3 uColA;
  uniform vec3 uColB;
  uniform float uOpacity;
  varying float vGlow;
  varying float vSeed;
  varying float vForm;
  void main() {
    vec3 col = mix(uColA, uColB, step(0.78, vSeed));
    // In flight the strands burn brighter; once formed a travelling glint runs along every edge.
    float a = uOpacity * mix(0.45, 0.3 + 0.7 * vGlow, vForm);
    gl_FragColor = vec4(col * a, a);
  }
`;

/**
 * The Stack workstation composed of strands: every edge of the model is a segment that flies in from the
 * shared strand river (`form` 0 -> 1) and settles into the outline, with code glowing on the screen.
 * Model space is centred on the workstation; `fromSpace` maps the river (camera-centred) into it.
 */
export function createStack() {
  const parts = workstationParts();
  const edges = [];
  const v = new THREE.Vector3();
  for (const [geo, m] of parts) {
    const e = new THREE.EdgesGeometry(geo, 15).attributes.position;
    for (let i = 0; i < e.count; i++) edges.push(v.fromBufferAttribute(e, i).applyMatrix4(m).clone());
  }
  const box = new THREE.Box3().setFromPoints(edges);
  const center = box.getCenter(new THREE.Vector3());
  const height = box.max.y - box.min.y;
  const width = box.max.x - box.min.x;

  // Departure points come from the strand field itself, stretched into the river around the camera.
  const probe = createStrands();
  const field = probe.geometry.attributes.position.array;
  probe.material.dispose();
  const fieldVerts = field.length / 3;
  const n = edges.length;
  const pos = new Float32Array(n * 3);
  const from = new Float32Array(n * 3);
  const along = new Float32Array(n);
  const seed = new Float32Array(n);
  for (let i = 0; i < n; i += 2) {
    const s = Math.random();
    for (let k = 0; k < 2; k++) {
      const j = i + k;
      edges[j].sub(center).toArray(pos, j * 3);
      // On a ring around the view axis, so nothing flies through the lens and blooms into a flash.
      const f = ((i * 37 + k) % fieldVerts) * 3;
      const ring = 5 / Math.max(0.25, Math.hypot(field[f], field[f + 1]));
      from.set([field[f] * ring, field[f + 1] * ring, field[f + 2] * 14 - 4], j * 3);
      along[j] = k;
      seed[j] = s;
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geometry.setAttribute('aFrom', new THREE.BufferAttribute(from, 3));
  geometry.setAttribute('aAlong', new THREE.BufferAttribute(along, 1));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const uniforms = {
    uForm: { value: 0 },
    uTime: { value: 0 },
    uOpacity: { value: 1 },
    uColA: { value: new THREE.Color('#c6c6c2') },
    uColB: { value: new THREE.Color('#c6c6c2') },
  };
  const lines = new THREE.LineSegments(
    geometry,
    new THREE.ShaderMaterial({ vertexShader: VERT, fragmentShader: FRAG, uniforms, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
  );
  lines.frustumCulled = false;

  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(1.48, 0.93),
    new THREE.MeshBasicMaterial({ map: screenTexture(), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false })
  );
  screen.position.set(0, 0.72, 0.064).sub(center);

  const group = new THREE.Group();
  group.add(lines, screen);
  group.visible = false;
  return { group, uniforms, screen, height, width };
}
