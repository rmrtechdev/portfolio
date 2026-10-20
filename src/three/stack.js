import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createStrands } from './strands';
import { codeScreen, termScreen } from './stackScreens';

/** Render layer of the workstation and its lights: the main pass skips it, the stage pass (stackPost.js) draws only it. */
export const STACK_LAYER = 2;

const FLOOR = -1.42;
const TOP = 1.36;

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
    float a = uOpacity * mix(0.45, 0.3 + 0.7 * vGlow, vForm);
    gl_FragColor = vec4(col * a, a);
  }
`;

// Surfaces print in from the floor up behind the strands: a noisy height front with a cyan seam where it is cutting.
const GRID = { value: 0 };
const SOLID = { uSolid: { value: 0 }, uRootInv: { value: new THREE.Matrix4() } };
const SOLID_HEAD = /* glsl */ `
  uniform float uSolid;
  varying vec3 vSPos;
  float solidCut() {
    vec3 c = floor(vSPos * 40.0);
    float n = fract(sin(dot(c, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    return clamp((vSPos.y - ${FLOOR.toFixed(2)}) / ${(TOP - FLOOR).toFixed(2)}, 0.0, 1.0) * 0.72 + n * 0.28;
  }
`;
function formable(m) {
  Object.assign(m, { fog: false, polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1 });
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, SOLID);
    sh.vertexShader = `uniform mat4 uRootInv;\nvarying vec3 vSPos;\n${sh.vertexShader}`.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\nvSPos = (uRootInv * modelMatrix * vec4(position, 1.0)).xyz;'
    );
    sh.fragmentShader = (SOLID_HEAD + sh.fragmentShader)
      .replace('#include <clipping_planes_fragment>', '#include <clipping_planes_fragment>\nfloat sCut = solidCut();\nif (sCut > uSolid * 1.01) discard;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(0.0024, 0.98, 0.69) * 4.0 * smoothstep(uSolid - 0.05, uSolid, sCut) * step(uSolid, 0.999);');
  };
  m.customProgramCacheKey = () => 'stack-solid';
  return m;
}
const std = (color, roughness, metalness, extra = {}) => formable(new THREE.MeshStandardMaterial({ color, roughness, metalness, envMapIntensity: 0.22, ...extra }));
const glow = (color, emissiveIntensity) => std('#000000', 0.4, 0, { emissive: color, emissiveIntensity });

function materials() {
  return {
    desk: std('#1b1e21', 0.5, 0.1),
    shell: std('#16191c', 0.38, 0.35),
    metal: std('#5d646a', 0.32, 0.9),
    dark: std('#0c0e10', 0.7, 0.2),
    cap: std('#1f2326', 0.5, 0.05),
    cap2: std('#3a3f44', 0.5, 0.05),
    capP: std('#ff69b4', 0.4, 0, { emissive: '#ff69b4', emissiveIntensity: 0.5 }),
    capC: std('#08fdd8', 0.4, 0, { emissive: '#08fdd8', emissiveIntensity: 0.5 }),
    fabric: std('#1c2125', 0.9, 0.02),
    mug: std('#c94488', 0.3, 0),
    cable: std('#0a0b0c', 0.45, 0.1),
    shade: std('#8e8e8a', 0.35, 0.7, { side: THREE.DoubleSide }),
    book1: std('#0d3d37', 0.75, 0),
    book2: std('#565b60', 0.75, 0),
    book3: std('#4a1832', 0.75, 0),
    note: std('#b84a84', 0.9, 0),
    glowC: glow('#08fdd8', 1.4),
    glowP: glow('#ff69b4', 1.6),
    bulb: glow('#e6fffb', 2.2),
  };
}

const rbox = (w, h, d, r = 0.012, seg = 2) => {
  const g = new RoundedBoxGeometry(w, h, d, seg, r);
  g.userData.edge = new THREE.BoxGeometry(w, h, d);
  return g;
};
const cyl = (rt, rb, h, seg = 24, open = false) => new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);

/** Authors the workstation as a tree of placeholders (geometry + material key) plus the few live meshes that animate. */
function author(mat, screens) {
  const root = new THREE.Group();
  const live = { fans: [] };
  const grp = (parent, p, r = [0, 0, 0]) => {
    const g = new THREE.Group();
    g.position.fromArray(p);
    g.rotation.fromArray(r);
    parent.add(g);
    return g;
  };
  const add = (parent, geo, key, p = [0, 0, 0], r = [0, 0, 0], edge = geo.userData.edge ?? geo) => {
    const o = new THREE.Object3D();
    o.position.fromArray(p);
    o.rotation.fromArray(r);
    o.userData = { geo, key, edge };
    parent.add(o);
    return o;
  };
  const mesh = (parent, geo, material, p, r = [0, 0, 0]) => {
    const m = new THREE.Mesh(geo, material);
    m.position.fromArray(p);
    m.rotation.fromArray(r);
    parent.add(m);
    return m;
  };

  // Desk: slab on two T-legs, a cable tray and an LED strip under the front lip.
  add(root, rbox(3.2, 0.07, 1.3, 0.02), 'desk', [0, -0.035, 0]);
  add(root, rbox(3.0, 0.014, 0.014, 0.005, 1), 'glowC', [0, -0.078, 0.6], [0, 0, 0], false);
  add(root, rbox(2.2, 0.08, 0.22, 0.01), 'dark', [0, -0.13, -0.48]);
  for (const x of [-1.42, 1.42]) {
    add(root, rbox(0.075, 1.3, 0.075, 0.01), 'metal', [x, -0.72, 0]);
    add(root, rbox(0.08, 0.05, 1.18, 0.012), 'metal', [x, FLOOR + 0.025, 0]);
    add(root, rbox(0.06, 0.04, 1.1, 0.01), 'metal', [x, -0.09, 0]);
    for (const z of [-0.55, 0.55]) add(root, cyl(0.03, 0.03, 0.02, 12), 'dark', [x, FLOOR + 0.01, z]);
  }
  add(root, rbox(2.8, 0.045, 0.045, 0.01), 'metal', [0, -0.55, -0.4]);

  // Main monitor: bezel, panel, back housing, VESA hub, angled neck and foot.
  const mon = grp(root, [0, 0, -0.34]);
  add(mon, rbox(1.74, 1.04, 0.05, 0.018), 'shell', [0, 0.84, 0]);
  add(mon, rbox(1.12, 0.66, 0.1, 0.04), 'shell', [0, 0.82, -0.07]);
  add(mon, cyl(0.07, 0.07, 0.08, 24), 'metal', [0, 0.82, -0.15], [Math.PI / 2, 0, 0]);
  add(mon, rbox(0.1, 0.62, 0.04, 0.012), 'metal', [0, 0.46, -0.2], [0.16, 0, 0]);
  add(mon, rbox(0.58, 0.024, 0.36, 0.01), 'metal', [0, 0.012, -0.12]);
  add(mon, rbox(0.05, 0.006, 0.006, 0.002, 1), 'glowC', [0, 0.335, 0.027], [0, 0, 0], false);
  add(mon, rbox(0.12, 0.1, 0.004, 0.002, 1), 'note', [0.79, 0.42, 0.028], [0, 0, 0.12], false);
  add(mon, rbox(0.1, 0.09, 0.004, 0.002, 1), 'note', [0.72, 0.36, 0.031], [0, 0, -0.08], false);
  live.code = mesh(mon, new THREE.PlaneGeometry(1.66, 0.955), formable(new THREE.MeshBasicMaterial({ map: screens.code.tex, toneMapped: false })), [0, 0.845, 0.0265]);

  // Second monitor, angled in on the left: terminal and load graphs.
  const side = grp(root, [-1.12, 0, -0.2], [0, 0.55, 0]);
  add(side, rbox(1.0, 0.64, 0.04, 0.014), 'shell', [0, 0.66, 0]);
  add(side, rbox(0.5, 0.36, 0.06, 0.03), 'shell', [0, 0.66, -0.05]);
  add(side, cyl(0.022, 0.022, 0.5, 16), 'metal', [0, 0.25, -0.09]);
  add(side, cyl(0.17, 0.19, 0.02, 32), 'metal', [0, 0.01, -0.06]);
  live.term = mesh(side, new THREE.PlaneGeometry(0.95, 0.594), formable(new THREE.MeshBasicMaterial({ map: screens.term.tex, toneMapped: false })), [0, 0.66, 0.0205]);

  // Keyboard: tilted deck with 6 rows of capped keys on a 15-unit grid, pink escape and cyan enter.
  const kb = grp(root, [0.02, 0, 0.3], [0.06, -0.04, 0]);
  add(kb, rbox(1.12, 0.032, 0.42, 0.014), 'shell', [0, 0.018, 0]);
  const U = 0.068;
  const ROWS = [
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2],
    [1.5, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1.5],
    [1.75, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.25],
    [2.25, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.75],
    [1.25, 1.25, 1.25, 6.25, 1.25, 1.25, 1.25, 1.25],
  ];
  const caps = new Map();
  ROWS.forEach((row, r) => {
    let x = -7.5 * U;
    row.forEach((w, i) => {
      const key = r === 0 && i === 0 ? 'capP' : r === 3 && i === row.length - 1 ? 'capC' : w > 1 || r === 0 ? 'cap2' : 'cap';
      const width = w * U - 0.01;
      if (!caps.has(width)) caps.set(width, rbox(width, 0.026, U - 0.01, 0.007, 1));
      add(kb, caps.get(width), key, [x + (w * U) / 2, 0.048, -0.17 + r * U + (r > 0 ? 0.012 : 0)]);
      x += w * U;
    });
  });
  add(kb, rbox(0.012, 0.004, 0.004, 0.001, 1), 'glowC', [0.48, 0.036, -0.19], [0, 0, 0], false);

  // Mouse on its pad.
  add(root, rbox(0.46, 0.005, 0.36, 0.004, 1), 'dark', [0.9, 0.0025, 0.32]);
  add(root, new THREE.CapsuleGeometry(0.034, 0.05, 6, 14).scale(1, 0.55, 1).rotateX(Math.PI / 2), 'shell', [0.92, 0.022, 0.34], [0, -0.1, 0]);
  add(root, cyl(0.007, 0.007, 0.012, 10), 'glowC', [0.92, 0.04, 0.315], [0, 0, Math.PI / 2], false);

  // Network switch at the back of the desk; its port LEDs are live (see leds below).
  add(root, rbox(0.44, 0.05, 0.2, 0.008), 'shell', [0.62, 0.025, -0.55]);

  // Desk lamp: weighted foot, two arm sections with knuckles, open shade over the keyboard.
  const lampBase = grp(root, [1.28, 0, -0.32], [0, -0.75, 0]);
  add(lampBase, cyl(0.11, 0.12, 0.035, 32), 'metal', [0, 0.0175, 0]);
  add(lampBase, new THREE.SphereGeometry(0.03, 16, 12), 'dark', [0, 0.05, 0], [0, 0, 0], false);
  const arm1 = grp(lampBase, [0, 0.05, 0], [-0.32, 0, 0]);
  add(arm1, cyl(0.013, 0.013, 0.62, 12), 'metal', [0, 0.31, 0]);
  add(arm1, cyl(0.006, 0.006, 0.5, 8), 'shade', [0, 0.31, -0.035], [0, 0, 0], false);
  add(arm1, new THREE.SphereGeometry(0.026, 16, 12), 'dark', [0, 0.62, 0], [0, 0, 0], false);
  const arm2 = grp(arm1, [0, 0.62, 0], [1.95, 0, 0]);
  add(arm2, cyl(0.012, 0.012, 0.5, 12), 'metal', [0, 0.25, 0]);
  const head = grp(arm2, [0, 0.5, 0], [-0.55, 0, 0]);
  add(head, cyl(0.045, 0.13, 0.17, 32, true), 'shade', [0, 0.06, 0]);
  add(head, cyl(0.045, 0.045, 0.03, 24), 'shade', [0, 0.16, 0]);
  add(head, new THREE.SphereGeometry(0.035, 16, 12), 'bulb', [0, 0.02, 0], [0, 0, 0], false);
  live.bulb = grp(head, [0, -0.05, 0]);

  // Mug, books and a phone.
  const mugProfile = [[0, 0], [0.068, 0], [0.074, 0.006], [0.074, 0.13], [0.066, 0.13], [0.064, 0.012], [0, 0.012]].map(([x, y]) => new THREE.Vector2(x, y));
  add(root, new THREE.LatheGeometry(mugProfile, 28), 'mug', [-0.56, 0, 0.42]);
  add(root, new THREE.TorusGeometry(0.038, 0.011, 10, 20, Math.PI), 'mug', [-0.486, 0.068, 0.42], [0, 0, -Math.PI / 2], false);
  add(root, cyl(0.064, 0.064, 0.004, 24), 'dark', [-0.56, 0.1, 0.42], [0, 0, 0], false);
  [[0.46, 0.05, 0.32, 'book1', 0.08], [0.42, 0.045, 0.3, 'book2', -0.05], [0.38, 0.04, 0.27, 'book3', 0.14]].reduce((y, [w, h, d, key, ry]) => {
    add(root, rbox(w, h, d, 0.006), key, [-1.28, y + h / 2, 0.4], [0, ry, 0]);
    return y + h;
  }, 0);
  add(root, rbox(0.085, 0.009, 0.17, 0.008), 'shell', [0.5, 0.0045, 0.52], [0, 0.35, 0]);

  // Tower under the desk: case, mesh front, two lit fans, top vents; LED column is live.
  const tower = grp(root, [0.95, FLOOR, -0.05], [0, -0.12, 0]);
  add(tower, rbox(0.42, 0.96, 0.82, 0.02), 'shell', [0, 0.5, 0]);
  add(tower, rbox(0.38, 0.86, 0.02, 0.006), 'dark', [0, 0.5, 0.41]);
  for (let i = 0; i < 6; i++) add(tower, rbox(0.3, 0.006, 0.04, 0.002, 1), 'dark', [0, 0.982, -0.3 + i * 0.07], [0, 0, 0], false);
  for (const x of [-0.18, 0.18]) add(tower, rbox(0.06, 0.02, 0.1, 0.006), 'dark', [x, 0.01, 0.3]);
  add(tower, new THREE.TorusGeometry(0.022, 0.004, 8, 24), 'glowP', [0.12, 0.88, 0.422], [0, 0, 0], false);
  const blade = mergeGeometries(
    Array.from({ length: 7 }, (_, i) => new THREE.BoxGeometry(0.1, 0.03, 0.004).translate(0.06, 0, 0).rotateX(0.35).rotateZ((i / 7) * Math.PI * 2))
      .concat([new THREE.CylinderGeometry(0.03, 0.03, 0.01, 20).rotateX(Math.PI / 2)])
  );
  for (const y of [0.64, 0.3]) {
    add(tower, new THREE.TorusGeometry(0.14, 0.008, 8, 40), 'glowC', [-0.02, y, 0.424], [0, 0, 0], false);
    add(tower, new THREE.TorusGeometry(0.155, 0.006, 6, 40), 'dark', [-0.02, y, 0.42]);
    live.fans.push(mesh(tower, blade, mat.shell, [-0.02, y, 0.418]));
  }

  // Chair, pushed back and turned away as if just left.
  const chair = grp(root, [-0.55, FLOOR, 1.2], [0, 0.7, 0]);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    add(chair, rbox(0.34, 0.035, 0.05, 0.012), 'metal', [Math.cos(a) * 0.17, 0.085, Math.sin(a) * 0.17], [0, -a, -0.08]);
    add(chair, new THREE.SphereGeometry(0.032, 12, 10), 'dark', [Math.cos(a) * 0.33, 0.032, Math.sin(a) * 0.33], [0, 0, 0], false);
  }
  add(chair, cyl(0.05, 0.05, 0.07, 20), 'dark', [0, 0.1, 0]);
  add(chair, cyl(0.024, 0.024, 0.4, 16), 'metal', [0, 0.33, 0]);
  add(chair, rbox(0.4, 0.04, 0.36, 0.01), 'shell', [0, 0.53, 0]);
  add(chair, rbox(0.6, 0.09, 0.56, 0.035, 3), 'fabric', [0, 0.59, 0]);
  add(chair, rbox(0.07, 0.42, 0.035, 0.01), 'metal', [0, 0.78, -0.3], [-0.1, 0, 0]);
  add(chair, rbox(0.54, 0.7, 0.075, 0.03, 3), 'fabric', [0, 1.08, -0.34], [-0.12, 0, 0]);
  add(chair, rbox(0.012, 0.6, 0.006, 0.003, 1), 'glowC', [0, 1.08, -0.298], [-0.12, 0, 0], false);
  for (const x of [-0.31, 0.31]) {
    add(chair, rbox(0.035, 0.2, 0.035, 0.008), 'metal', [x, 0.72, -0.04]);
    add(chair, rbox(0.07, 0.03, 0.28, 0.012), 'dark', [x, 0.83, -0.02]);
  }

  // Cables: monitors, keyboard, lamp and switch all run down the back to the tower.
  const runs = [
    [[0, 0.8, -0.5], [0, 0.5, -0.6], [0.15, 0.03, -0.63], [0.5, -0.1, -0.66], [0.82, -0.6, -0.6], [0.95, -0.9, -0.5]],
    [[-1.2, 0.5, -0.36], [-1.1, 0.02, -0.5], [-0.6, -0.1, -0.62], [0.2, -0.2, -0.66], [0.75, -0.55, -0.6], [0.9, -0.95, -0.5]],
    [[0.02, 0.02, 0.08], [-0.05, 0.008, -0.08], [0.15, 0.008, -0.28], [0.32, 0.008, -0.6], [0.4, -0.12, -0.66], [0.85, -0.7, -0.56]],
    [[1.28, 0.02, -0.42], [1.2, 0.008, -0.6], [1.05, -0.2, -0.66], [0.98, -0.6, -0.55]],
    [[0.85, 0.025, -0.55], [0.95, -0.05, -0.64], [1.02, -0.5, -0.58], [1.0, -0.88, -0.5]],
    [[0.95, -1.1, -0.47], [1.1, FLOOR + 0.01, -0.75], [1.7, FLOOR + 0.01, -0.95]],
  ].map((pts) => new THREE.CatmullRomCurve3(pts.map((p) => new THREE.Vector3(...p))));
  for (const c of runs) add(root, new THREE.TubeGeometry(c, 64, 0.011, 6), 'cable', [0, 0, 0], [0, 0, 0], false);

  return { root, live, runs };
}

const LED_VERT = /* glsl */ `
  uniform mat4 uRootInv;
  attribute vec3 aCol;
  attribute float aSeed;
  varying vec3 vCol;
  varying float vSeed;
  varying vec3 vSPos;
  void main() {
    vCol = aCol;
    vSeed = aSeed;
    vSPos = (uRootInv * modelMatrix * vec4(position, 1.0)).xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const LED_FRAG = /* glsl */ `
  uniform float uTime;
  varying vec3 vCol;
  varying float vSeed;
  ${SOLID_HEAD}
  void main() {
    if (solidCut() > uSolid * 1.01) discard;
    float rate = 0.7 + vSeed * 5.0;
    float on = vSeed < 0.25 ? 0.6 + 0.4 * sin(uTime * 1.5 + vSeed * 40.0) : step(0.42, fract(uTime * rate + vSeed * 13.0));
    gl_FragColor = vec4(vCol * (0.15 + 3.2 * on), 1.0);
  }
`;

/** Status LEDs on the tower and the switch, one box each, blinking at their own rates. */
function leds(uTime) {
  const spots = [];
  for (let i = 0; i < 7; i++) spots.push([0.95 + 0.155, FLOOR + 0.84 - i * 0.045, -0.05 + 0.425, i % 3 === 2 ? '#ff69b4' : '#08fdd8']);
  for (let i = 0; i < 8; i++) spots.push([0.45 + i * 0.045, 0.035, -0.449, i === 5 ? '#ff69b4' : '#08fdd8']);
  const col = new THREE.Color();
  const geos = spots.map(([x, y, z, c], i) => {
    const g = new THREE.BoxGeometry(i < 7 ? 0.03 : 0.016, 0.01, 0.006).translate(x, y, z);
    const n = g.attributes.position.count;
    col.set(c);
    g.setAttribute('aCol', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, k) => col.toArray()[k % 3]), 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(new Float32Array(n).fill(((i * 0.618) % 1) * 0.999), 1));
    g.deleteAttribute('uv');
    g.deleteAttribute('normal');
    return g;
  });
  return new THREE.Mesh(mergeGeometries(geos), new THREE.ShaderMaterial({ vertexShader: LED_VERT, fragmentShader: LED_FRAG, uniforms: { uTime, ...SOLID } }));
}

const FLOOR_VERT = /* glsl */ `
  varying vec2 vP;
  void main() {
    vP = position.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const FLOOR_FRAG = /* glsl */ `
  uniform float uSolid;
  uniform float uTime;
  uniform float uGrid;
  varying vec2 vP;
  void main() {
    float r = length(vP) / 2.2;
    vec2 g = abs(fract(vP * 4.0 - 0.5) - 0.5) / fwidth(vP * 4.0);
    float line = (1.0 - min(min(g.x, g.y), 1.0)) * pow(max(1.0 - r, 0.0), 2.0);
    float pulse = exp(-pow((r - fract(uTime * 0.12) * 1.2) * 9.0, 2.0));
    float shade = smoothstep(1.0, 0.0, length(vP * vec2(0.62, 0.95)));
    // The dither look draws the grid at full level so it reads as dotted lines, not a scatter of faint cells.
    float lit = line * mix(0.07 + 0.3 * pulse, 0.9, uGrid);
    float a = clamp(lit + shade * 0.8, 0.0, 1.0) * uSolid * (1.0 - smoothstep(0.75, 1.0, r));
    gl_FragColor = vec4(vec3(0.0024, 0.98, 0.69) * lit * uSolid, a);
  }
`;

/**
 * The Stack workstation: solid shaded meshes that print in from the floor up, outlined by strands. Every edge of
 * the model is a segment that flies in from the shared strand river (`form` 0 -> 1) and settles into the outline,
 * then the surfaces fill in behind it (`solid`). Model space is centred on the workstation; `fromSpace` maps the
 * river (camera-centred) into it. `group` is placed and faced by the caller; `model` inside it takes the turn, so the
 * lights in `group` stay put while the desk rotates under them.
 */
export function createStack() {
  const mat = materials();
  const screens = { code: codeScreen(), term: termScreen() };
  const { root, live, runs } = author(mat, screens);
  root.updateMatrixWorld(true);

  const buckets = {};
  const edges = [];
  const v = new THREE.Vector3();
  const placeholders = [];
  root.traverse((o) => {
    const { geo, key, edge } = o.userData;
    if (!geo) return;
    placeholders.push(o);
    let g = geo.clone().applyMatrix4(o.matrixWorld);
    if (g.index) g = g.toNonIndexed();
    for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
    (buckets[key] ??= []).push(g);
    if (edge) {
      const e = new THREE.EdgesGeometry(edge, 25).attributes.position;
      for (let i = 0; i < e.count; i++) edges.push(v.fromBufferAttribute(e, i).applyMatrix4(o.matrixWorld).clone());
    }
  });
  placeholders.forEach((o) => o.removeFromParent());
  for (const [key, list] of Object.entries(buckets)) root.add(new THREE.Mesh(mergeGeometries(list), mat[key]));
  for (const c of runs) {
    const pts = c.getPoints(28);
    for (let i = 1; i < pts.length; i++) edges.push(pts[i - 1], pts[i]);
  }

  const box = new THREE.Box3().setFromObject(root);
  const center = box.getCenter(new THREE.Vector3());
  const height = box.max.y - box.min.y;
  const width = box.max.x - box.min.x;

  const probe = createStrands();
  const field = probe.geometry.attributes.position.array;
  probe.material.dispose();
  probe.geometry.dispose();
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
      edges[j].toArray(pos, j * 3);
      const f = ((i * 37 + k) % fieldVerts) * 3;
      const ring = 5 / Math.max(0.25, Math.hypot(field[f], field[f + 1]));
      from.set([field[f] * ring + center.x, field[f + 1] * ring + center.y, field[f + 2] * 14 - 4 + center.z], j * 3);
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
  root.add(lines);
  root.add(leds(uniforms.uTime));
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(5.2, 5.2).rotateX(-Math.PI / 2).translate(0, FLOOR - 0.002, 0.2),
    new THREE.ShaderMaterial({ vertexShader: FLOOR_VERT, fragmentShader: FLOOR_FRAG, uniforms: { uSolid: SOLID.uSolid, uTime: uniforms.uTime, uGrid: GRID }, transparent: true, depthWrite: false, premultipliedAlpha: true })
  );
  floor.renderOrder = -1;
  root.add(floor);

  const lampLight = new THREE.PointLight('#d8fff6', 1.6, 2.2, 1.2);
  live.bulb.add(lampLight);
  const screenLight = new THREE.PointLight('#08fdd8', 0.9, 2.4, 1.4);
  screenLight.position.set(0, 0.85, 0.3);
  root.add(screenLight);
  root.position.copy(center).negate();

  const model = new THREE.Group();
  model.add(root);
  const group = new THREE.Group();
  const key = new THREE.DirectionalLight('#eef6f4', 1.5);
  key.position.set(-3, 5, 5);
  const rimP = new THREE.DirectionalLight('#ff69b4', 3.6);
  rimP.position.set(5, 2.5, -4);
  const rimC = new THREE.DirectionalLight('#08fdd8', 1.8);
  rimC.position.set(-5, 1.5, -3.5);
  const target = new THREE.Object3D();
  for (const l of [key, rimP, rimC]) l.target = target;
  group.add(model, target, key, rimP, rimC, new THREE.HemisphereLight('#a9c4cc', '#060606', 0.2));
  group.traverse((o) => o.layers.set(STACK_LAYER));
  group.visible = false;

  const standard = Object.values(mat);
  return {
    group,
    model,
    uniforms,
    solid: SOLID.uSolid,
    grid: GRID,
    height,
    width,
    /** Sets the reflections every surface picks up once a renderer exists to prefilter them. */
    setEnv(tex) {
      for (const m of standard) (m.envMap = tex), (m.needsUpdate = true);
    },
    /** Live parts: typing editor, terminal, fans, screen flicker. Call only while the model is on screen. */
    tick(t, dt) {
      group.updateMatrixWorld();
      SOLID.uRootInv.value.copy(root.matrixWorld).invert();
      screens.code.draw(t);
      screens.term.draw(t);
      for (const f of live.fans) f.rotation.z -= dt * 9;
      const flicker = 0.93 + 0.05 * Math.sin(t * 61) * Math.sin(t * 7.3) + (Math.sin(t * 0.9) > 0.985 ? -0.25 : 0);
      live.code.material.color.setScalar(flicker);
      live.term.material.color.setScalar(flicker * 0.9);
    },
  };
}
