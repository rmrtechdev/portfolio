import * as THREE from 'three';
import { STRAND_VERTS, createStrands } from './strands';

// Every shape is a function of the strand's unit-sphere point, in camera space (-z ahead), so neighbouring
// trail points stay neighbours and a blend between two shapes is the strands themselves flying across.
// Only the ambient shape and the Profile orbit are world-anchored (uLook); the content-framing ones stay on screen.
const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uTravel;
  uniform float uAspect;
  uniform vec4 uW;        // orbit (Profile), halo (Stack), stream (Work), possess (Contact); the rest is tunnel
  uniform vec4 uStack;    // xyz centre, w radius
  uniform vec4 uJarvis;   // xyz centre, w radius
  uniform float uHaloA;
  uniform float uTan;      // tan(fov / 2), to place shapes against the screen edges
  uniform float uAR;       // 0 tunnel, 1 column around the viewer
  uniform mat3 uLook;      // home camera space -> current camera space
  varying vec3 vColor;
  varying float vAlpha;
  const float L = 36.0;
  void main() {
    vec3 p = position;
    float ang = atan(p.y, p.x);
    float u = p.z * 0.5 + 0.5;
    float wide = clamp(uAspect, 0.6, 1.5);
    float h = fract(sin(float(gl_VertexID / STRAND_VERTS) * 12.9898) * 43758.5453);

    // Gaps: a tunnel the camera flies down, driven by scroll so it only moves when the reader does.
    float tz = fract(u * 0.9 + uTravel / L);
    float ta = ang + uTime * 0.05;
    float tr = 2.8 + 0.25 * p.z;
    vec3 tunnel = vec3(cos(ta) * tr * wide, sin(ta) * tr, -1.0 - tz * L);
    // Faded well before the vanishing point, where every strand would bunch back into a knot.
    float aTunnel = 1.3 * smoothstep(0.0, 0.06, tz) * (1.0 - smoothstep(0.12, 0.6, tz));

    // AR: the same strands as a column all round the viewer, rising with scroll like the page content.
    float cf = fract(u * 0.9 + uTravel / 24.0 + uTime * 0.01);
    float ca = ang + uTime * 0.03;
    float colr = 4.5 + 0.3 * p.z;
    vec3 column = vec3(cos(ca) * colr, (cf * 2.0 - 1.0) * 9.0, sin(ca) * colr);
    float aColumn = 1.3 * smoothstep(0.0, 0.12, cf) * (1.0 - smoothstep(0.88, 1.0, cf));
    vec3 ambient = uLook * mix(tunnel, column, uAR);
    float aAmbient = mix(aTunnel, aColumn, uAR);

    // Profile: a tilted orbit circling the section, its near side sweeping under the cards.
    float oa = ang + uTime * 0.12;
    float orr = 5.2 + 0.35 * p.z;
    vec3 ring = vec3(cos(oa) * orr * wide, 0.25 * p.z, sin(oa) * orr);
    ring = vec3(ring.x, ring.y * 0.94 - ring.z * 0.34, ring.y * 0.34 + ring.z * 0.94);
    vec3 orbitHome = ring + vec3(0.0, 1.3, -9.0);
    float aOrbit = 0.28 * smoothstep(-3.5, -9.0, orbitHome.z);
    vec3 orbit = uLook * orbitHome;

    // Stack: the strands not building the workstation orbit it as a ring.
    float ha = ang + uTime * 0.2;
    float hr = uStack.w * (1.2 + 0.12 * p.z);
    vec3 halo = uStack.xyz + vec3(cos(ha) * hr, sin(ha) * hr * 0.8, 0.4 * p.z);

    // Work: shipped work rising in two streams along the screen edges, framing the projects in the
    // margins rather than running through their text.
    float hh = 7.0 * uTan;
    // Split by strand, not by position: the field leans to +x, and a whole trail must stay on one side.
    float side = (gl_VertexID / STRAND_VERTS) % 2 == 0 ? -1.0 : 1.0;
    float sy = fract(u * 0.9 + uTravel / 30.0 + uTime * 0.015);
    float sw = 0.2 * sin(sy * 8.0 + uTime * 0.7 + side);
    // One depth for the whole stream: any spread in z would pull the far strands in over the text.
    vec3 stream = vec3(side * (hh * uAspect - 0.05 - 0.5 * abs(sw) - 0.1 * abs(p.y)), (sy * 2.0 - 1.0) * hh * 1.15, -7.0);
    // Phones have no margin to run in, so the streams dim over the text there.
    float aStream = 0.45 * clamp(uAspect, 0.5, 1.0) * smoothstep(0.0, 0.15, sy) * smoothstep(1.0, 0.85, sy);

    // Contact: the strands possess the Jarvis hologram. Most wrap it as a cage of tilted rings flowing
    // round its centre; the rest spiral in as tendrils feeding its core.
    float ph = h * 6.2832;
    float tilt = fract(h * 7.31) * 3.1416;
    vec3 n = vec3(sin(tilt) * cos(ph), cos(tilt), sin(tilt) * sin(ph));
    vec3 e1 = normalize(cross(n, abs(n.y) > 0.9 ? vec3(1.0, 0.0, 0.0) : vec3(0.0, 1.0, 0.0)));
    vec3 e2 = cross(n, e1);
    float pa = ang + uTime * (0.25 + 0.35 * fract(h * 3.7));
    float tendril = step(0.72, h);
    float ct = fract(u + uTime * 0.08 + h);
    float cr = uJarvis.w * mix(1.08 + 0.12 * p.z, pow(1.0 - ct, 1.4) * 1.3, tendril);
    vec3 possess = uJarvis.xyz + (cos(pa + tendril * ct * 6.0) * e1 + sin(pa + tendril * ct * 6.0) * e2) * cr;
    float aPossess = mix(0.4, 0.5 * smoothstep(0.0, 0.3, ct) * smoothstep(1.0, 0.7, ct), tendril);

    // Each strand leaves on its own cue, so a section change peels strands off one by one instead of
    // morphing the whole field as a mass.
    vec4 w = smoothstep(vec4(h * 0.4), vec4(h * 0.4 + 0.6), uW);
    w /= max(1.0, w.x + w.y + w.z + w.w);
    float wt = max(0.0, 1.0 - w.x - w.y - w.z - w.w);
    vec3 pos = ambient * wt + orbit * w.x + halo * w.y + stream * w.z + possess * w.w;
    // In flight a strand swoops back into depth and burns brighter, so it crosses behind the text as a comet.
    vec4 fly = w * (1.0 - w);
    float transit = clamp(4.0 * (fly.x + fly.y + fly.z + fly.w + wt * (1.0 - wt)), 0.0, 1.0);
    pos.z -= 4.0 * transit;
    pos.xy *= 1.0 + 0.25 * transit;
    vAlpha = aAmbient * wt + aOrbit * w.x + uHaloA * w.y + aStream * w.z + aPossess * w.w;
    vAlpha = max(vAlpha, 0.35 * transit) * (1.0 + 1.2 * transit);
    vColor = color;
    gl_Position = projectionMatrix * vec4(pos, 1.0);
  }
`;
const FRAG = /* glsl */ `
  uniform float uOpacity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float a = uOpacity * vAlpha;
    gl_FragColor = vec4(vColor * a, a);
  }
`;

/**
 * The strand field after About: one view fixed to the camera (bar the ambient shape and the Profile orbit,
 * which `uniforms.uLook` anchors to the world) whose shape follows the section on screen,
 * so the same strands that wrapped the globe go on to circle the team, build the Stack, carry the work
 * and end possessing the Jarvis hologram. Drive `uniforms.uW` with per-section weights; zero weight is the tunnel.
 */
export function createThread() {
  const lines = createStrands();
  lines.material.dispose();
  const uniforms = {
    uTime: { value: 0 },
    uTravel: { value: 0 },
    uAspect: { value: 1 },
    uOpacity: { value: 0 },
    uW: { value: new THREE.Vector4() },
    uStack: { value: new THREE.Vector4(0, 0, -6, 1) },
    uJarvis: { value: new THREE.Vector4(0, 0, -6, 1) },
    uHaloA: { value: 0.35 },
    uTan: { value: 0.4 },
    uAR: { value: 0 },
    uLook: { value: new THREE.Matrix3() },
  };
  lines.material = new THREE.ShaderMaterial({
    defines: { STRAND_VERTS },
    vertexShader: VERT,
    fragmentShader: FRAG,
    uniforms,
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    toneMapped: false,
  });
  return { lines, uniforms };
}
