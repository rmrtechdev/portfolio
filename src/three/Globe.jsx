import { useEffect, useMemo, useRef } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';
import { feature, mesh } from 'topojson-client';
import world from 'world-atlas/countries-110m.json';

const ll2v = (lat, lon, r) => {
  const phi = ((90 - lat) * Math.PI) / 180;
  const th = ((lon + 180) * Math.PI) / 180;
  return new THREE.Vector3(-r * Math.sin(phi) * Math.cos(th), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(th));
};

const segments = (lines, r) => {
  const pts = [];
  for (const line of lines) for (let i = 1; i < line.length; i++) pts.push(ll2v(line[i - 1][1], line[i - 1][0], r), ll2v(line[i][1], line[i][0], r));
  return new THREE.BufferGeometry().setFromPoints(pts);
};

// Spikes ride up to PULSES heads travelling the NYC -> visitor routes: nearby coast/border/land vertices
// bulge outward and flip pink with a noisy, fast-reseeding edge, which reads as a jittery transmission.
const PULSES = 6;
function hoverable(material, U) {
  material.customProgramCacheKey = () => 'globeTransmit';
  material.onBeforeCompile = (s) => {
    Object.assign(s.uniforms, U);
    s.vertexShader = s.vertexShader
      .replace('#include <common>', `#include <common>\nuniform vec3 uPulse[${PULSES}]; uniform float uPulseAmp[${PULSES}]; uniform float uPulseSize[${PULSES}]; uniform vec3 uCursor; uniform float uCursorAmp; uniform float uTime; varying float vHov;`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        float hSeed = fract(sin(dot(floor(transformed * 24.0) + floor(uTime * 9.0), vec3(12.9898, 78.233, 45.164))) * 43758.5453);
        vHov = 0.0;
        for (int i = 0; i < ${PULSES}; i++) {
          float hEdge = (0.11 + (hSeed - 0.5) * 0.07) * uPulseSize[i];
          vHov = max(vHov, smoothstep(hEdge, hEdge - 0.08, distance(transformed, uPulse[i])) * uPulseAmp[i]);
        }
        vHov *= 0.55 + hSeed * 0.9;
        // Roaming cursor: same spike language, but a tighter radius, a near-smooth edge and a slower reseed.
        float cSeed = fract(sin(dot(floor(transformed * 24.0) + floor(uTime * 3.0), vec3(12.9898, 78.233, 45.164))) * 43758.5453);
        float cEdge = 0.15 + (cSeed - 0.5) * 0.03;
        vHov = max(vHov, smoothstep(cEdge, cEdge - 0.1, distance(transformed, uCursor)) * uCursorAmp * (0.75 + cSeed * 0.5));
        transformed += normalize(transformed) * vHov * 0.26;`
      );
    s.fragmentShader = s.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vHov;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.41, 0.71), step(0.14, vHov));');
  };
  return material;
}

// Great-circle point between unit vectors a and b.
const slerpDir = (a, b, t) => {
  const ang = a.angleTo(b);
  const sa = Math.sin(ang);
  return a.clone().multiplyScalar(Math.sin((1 - t) * ang) / sa).add(b.clone().multiplyScalar(Math.sin(t * ang) / sa)).normalize();
};
// Routes shorter than this start inside NYC's own marker, so they are skipped.
const MIN_ROUTE = 0.08;
// Each pulse also carries a burst of pink needles, re-randomised every frame, over a satellite hop:
// straight up from NYC to a relay above the route's midpoint, then down onto the visitor. The relay is
// high enough for both legs to clear the globe on most routes; very long ones dip behind it and the
// globe simply hides that stretch.
const NEEDLES = 18;
const relayFor = (from, to) => {
  const half = from.angleTo(to) / 2;
  return slerpDir(from, to, 0.5).multiplyScalar(THREE.MathUtils.clamp(1 / Math.cos(half) + 0.1, 1.22, 1.9));
};
const legPoint = (p, home, out) =>
  p.t < 0.5 ? out.copy(home).multiplyScalar(1.004).lerp(p.relay, p.t * 2) : out.copy(p.relay).lerp(p.to.clone().multiplyScalar(1.004), (p.t - 0.5) * 2);

// Wireframe satellite: bus, two gridded solar panels and an antenna, in the globe's line language.
function satelliteGeometry() {
  const segs = [];
  const box = new THREE.EdgesGeometry(new THREE.BoxGeometry(0.02, 0.014, 0.014));
  const bp = box.attributes.position.array;
  for (let i = 0; i < bp.length; i++) segs.push(bp[i]);
  for (const side of [-1, 1]) {
    const x0 = side * 0.012;
    const x1 = side * 0.05;
    const y = 0.009;
    segs.push(x0, -y, 0, x1, -y, 0, x1, -y, 0, x1, y, 0, x1, y, 0, x0, y, 0, x0, y, 0, x0, -y, 0, x0, 0, 0, x1, 0, 0);
    for (let k = 1; k < 4; k++) {
      const x = x0 + ((x1 - x0) * k) / 4;
      segs.push(x, -y, 0, x, y, 0);
    }
  }
  segs.push(0, 0, 0.007, 0, 0, 0.022);
  return new THREE.BufferGeometry().setAttribute('position', new THREE.Float32BufferAttribute(segs, 3));
}

function inRing(ring, lon, lat) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// Cells arrive pre-binned to ~1° by the API; this merges neighbours within ~4° (≈450 km) so a metro
// area and its suburbs read as one dot rather than a smear. Presence only, so every dot is one size.
const MERGE_ANGLE = 0.07;
const DOT_SIZE = 0.016;
function cluster(cells) {
  const out = [];
  for (const [lat, lng, vpn, place] of cells) {
    const v = ll2v(lat, lng, 1);
    const near = out.find((c) => c.seed.angleTo(v) < MERGE_ANGLE);
    if (near) {
      near.sum.add(v);
      near.vpn += vpn;
      near.places += 1;
    } else out.push({ seed: v, sum: v.clone(), vpn, place, places: 1 });
  }
  return out.map((c) => ({ ...c, dir: c.sum.normalize(), size: DOT_SIZE, exit: c.vpn === c.places }));
}

const Z = new THREE.Vector3(0, 0, 1);
function placeInstances(mesh, list, radius, scale = 1) {
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  list.forEach((c, i) => {
    q.setFromUnitVectors(Z, c.dir);
    m.compose(c.dir.clone().multiplyScalar(radius), q, new THREE.Vector3().setScalar(c.size * scale));
    mesh.setMatrixAt(i, m);
  });
  mesh.count = list.length;
  mesh.instanceMatrix.needsUpdate = true;
}

function Visitors({ clusters }) {
  const dots = useRef();
  const halos = useRef();
  const rings = useRef();
  const lit = clusters.filter((c) => !c.exit);
  const exits = clusters.filter((c) => c.exit);
  useEffect(() => {
    placeInstances(dots.current, lit, 1.006);
    placeInstances(halos.current, lit, 1.005, 2.4);
    placeInstances(rings.current, exits, 1.006);
  }, [clusters]);
  const cap = Math.max(1, clusters.length);
  return (
    <>
      <instancedMesh ref={halos} args={[undefined, undefined, cap]} frustumCulled={false}>
        <circleGeometry args={[1, 20]} />
        <meshBasicMaterial color="#ff69b4" transparent opacity={0.16} depthWrite={false} toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={dots} args={[undefined, undefined, cap]} frustumCulled={false}>
        <circleGeometry args={[1, 20]} />
        <meshBasicMaterial color="#ff69b4" toneMapped={false} />
      </instancedMesh>
      <instancedMesh ref={rings} args={[undefined, undefined, cap]} frustumCulled={false}>
        <ringGeometry args={[0.62, 1, 24]} />
        <meshBasicMaterial color="#8e939c" transparent opacity={0.7} toneMapped={false} />
      </instancedMesh>
    </>
  );
}

// Home marker: cyan core, halo, two staggered pulse rings and a radial beacon, oriented to the surface.
function HomeMarker({ position }) {
  const pulses = useRef([]);
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(Z, position.clone().normalize()), [position]);
  const beacon = useMemo(() => new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3(0, 0, 0.3)]), []);
  useFrame(({ clock }) => {
    pulses.current.forEach((m, i) => {
      const k = (clock.elapsedTime * 0.55 + i * 0.5) % 1;
      m.scale.setScalar(0.03 + k * 0.15);
      m.material.opacity = (1 - k) * 0.9;
    });
  });
  return (
    <group position={position} quaternion={quaternion}>
      <mesh>
        <sphereGeometry args={[0.024, 16, 16]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <mesh position={[0, 0, 0.002]}>
        <circleGeometry args={[0.075, 32]} />
        <meshBasicMaterial color="#08fdd8" transparent opacity={0.28} depthWrite={false} toneMapped={false} />
      </mesh>
      {[0, 1].map((i) => (
        <mesh key={i} ref={(el) => (pulses.current[i] = el)} position={[0, 0, 0.003]}>
          <ringGeometry args={[0.86, 1, 48]} />
          <meshBasicMaterial color="#08fdd8" transparent depthWrite={false} toneMapped={false} />
        </mesh>
      ))}
      <lineSegments geometry={beacon}>
        <lineBasicMaterial color="#08fdd8" transparent opacity={0.85} toneMapped={false} />
      </lineSegments>
    </group>
  );
}

/** The interactive globe group; World.jsx places it in the shared scene, Globe below wraps it for reduced motion. */
export function Earth({ home, active, spin, visitors, homeLabel, tip }) {
  const { camera, gl, size } = useThree();
  const clusters = useMemo(() => cluster(visitors?.cells ?? []), [visitors]);
  const world3 = useRef();
  const globe = useRef();
  const ring = useRef();
  const U = useMemo(
    () => ({
      uPulse: { value: Array.from({ length: PULSES }, () => new THREE.Vector3(9, 9, 9)) },
      uPulseAmp: { value: new Array(PULSES).fill(0) },
      uPulseSize: { value: new Array(PULSES).fill(1) },
      uCursor: { value: new THREE.Vector3(9, 9, 9) },
      uCursorAmp: { value: 0 },
      uTime: { value: 0 },
    }),
    []
  );
  const mats = useMemo(
    () => ({
      coast: hoverable(new THREE.LineBasicMaterial({ color: '#08fdd8', transparent: true, opacity: 0.95 }), U),
      border: hoverable(new THREE.LineBasicMaterial({ color: '#08fdd8', transparent: true, opacity: 0.35 }), U),
      dots: hoverable(new THREE.PointsMaterial({ color: '#ff69b4', size: 0.008, transparent: true, opacity: 0.55 }), U),
    }),
    []
  );
  const geo = useMemo(() => {
    const grid = [];
    for (let lat = -75; lat <= 75; lat += 15) grid.push(Array.from({ length: 46 }, (_, i) => [-180 + i * 8, lat]));
    for (let lon = -180; lon < 180; lon += 15) grid.push(Array.from({ length: 46 }, (_, i) => [lon, -90 + i * 4]));
    return {
      grid: segments(grid, 1),
      coast: segments(mesh(world, world.objects.countries, (a, b) => a === b).coordinates, 1.003),
      border: segments(mesh(world, world.objects.countries, (a, b) => a !== b).coordinates, 1.002),
      ring: new THREE.BufferGeometry().setFromPoints(Array.from({ length: 46 }, (_, i) => new THREE.Vector3(Math.cos((i / 45) * Math.PI * 2), 0, Math.sin((i / 45) * Math.PI * 2)))),
      home: ll2v(home.lat, home.lng, 1.004),
      homeDir: ll2v(home.lat, home.lng, 1),
    };
  }, []);
  const s = useRef({ spinY: -1.1, spinRate: 0.005, vx: 0, vy: 0, dragging: false, px: 0, py: 0, downX: 0, downY: 0, hover: 0, ringTarget: 0, scanY: 0, scanDir: 1, missiles: [], pulses: [], focus: 0, labelOn: false, nextPulse: 0 });
  const mouse = useRef(new THREE.Vector2(9, 9));
  const ray = useMemo(() => new THREE.Raycaster(), []);
  const fill = useRef();
  const sat = useMemo(() => {
    const g = new THREE.Group();
    g.add(new THREE.LineSegments(satelliteGeometry(), new THREE.LineBasicMaterial({ color: '#08fdd8', transparent: true, opacity: 0, toneMapped: false })));
    const ping = new THREE.Mesh(
      new THREE.RingGeometry(0.8, 1, 32),
      new THREE.MeshBasicMaterial({ color: '#ff69b4', transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, toneMapped: false })
    );
    g.add(ping);
    g.visible = false;
    return { group: g, frame: g.children[0], ping, at: new THREE.Vector3(), ready: false, pingAge: 9 };
  }, []);
  const needles = useMemo(() => {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(PULSES * NEEDLES * 6), 3));
    const lines = new THREE.LineSegments(
      g,
      new THREE.LineBasicMaterial({ color: '#ff69b4', transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false })
    );
    lines.frustumCulled = false;
    return lines;
  }, []);

  useEffect(() => {
    // Land dot matrix: point-in-polygon per cell, drained in ≤6 ms slices so scrolling never hitches.
    const land = feature(world, world.objects.countries);
    const polys = land.features.flatMap((f) => (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates));
    const inLand = (lon, lat) => polys.some((p) => inRing(p[0], lon, lat) && !p.slice(1).some((h) => inRing(h, lon, lat)));
    const dots = [];
    let lat = -58;
    let raf;
    const drain = () => {
      const t0 = performance.now();
      while (lat <= 84 && performance.now() - t0 < 6) {
        const step = 4 / Math.max(0.25, Math.cos((lat * Math.PI) / 180));
        for (let lon = -180; lon < 180; lon += step) if (inLand(lon, lat)) dots.push(...ll2v(lat, lon, 1.002).toArray());
        lat += 4;
      }
      if (lat <= 84) raf = requestAnimationFrame(drain);
      else {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(dots, 3));
        globe.current.add(new THREE.Points(g, mats.dots));
      }
    };
    raf = requestAnimationFrame(drain);

    const el = gl.domElement;
    const st = s.current;
    const toNdc = (e) => {
      const r = el.getBoundingClientRect();
      return new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    };
    const down = (e) => Object.assign(st, { dragging: true, px: e.clientX, py: e.clientY, downX: e.clientX, downY: e.clientY });
    const up = () => (st.dragging = false);
    const move = (e) => {
      if (st.dragging) {
        st.vy = THREE.MathUtils.clamp(st.vy + (e.clientX - st.px) * 0.0003, -0.06, 0.06);
        st.vx = THREE.MathUtils.clamp(st.vx + (e.clientY - st.py) * 0.0002, -0.025, 0.025);
        st.px = e.clientX;
        st.py = e.clientY;
      }
      // Window-level so hover reaches the globe through the text lines layered over it.
      const r = el.getBoundingClientRect();
      const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
      if (inside) mouse.current.copy(toNdc(e));
      else mouse.current.set(9, 9);
    };
    const leave = () => mouse.current.set(9, 9);
    const click = (e) => {
      if (Math.hypot(e.clientX - st.downX, e.clientY - st.downY) > 6) return;
      ray.setFromCamera(toNdc(e), camera);
      const hit = ray.intersectObject(fill.current, false)[0];
      if (hit) spawnMissile(globe.current.worldToLocal(hit.point.clone()));
    };
    el.addEventListener('pointerdown', down);
    addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    el.addEventListener('click', click);
    addEventListener('pointerup', up);
    return () => {
      cancelAnimationFrame(raf);
      el.removeEventListener('pointerdown', down);
      removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', leave);
      el.removeEventListener('click', click);
      removeEventListener('pointerup', up);
    };
  }, []);

  function spawnMissile(target) {
    const q = target.clone().normalize();
    let p;
    do p = new THREE.Vector3().randomDirection();
    while (q.angleTo(p) < 0.6 || q.angleTo(p) > 1.5);
    const line = new THREE.Line(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true }));
    line.geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(64 * 3), 3));
    line.geometry.setDrawRange(0, 0);
    line.frustumCulled = false;
    const boom = new THREE.LineLoop(geo.ring, new THREE.LineBasicMaterial({ color: '#ffffff', transparent: true }));
    boom.position.copy(q).multiplyScalar(1.02);
    boom.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), q);
    boom.scale.setScalar(0.001);
    globe.current.add(line, boom);
    const m = s.current.missiles;
    m.push({ p, q, t: 0, line, boom, age: 0, done: 0 });
    if (m.length > 14) kill(m.shift());
  }
  function kill(m) {
    globe.current.remove(m.line, m.boom);
    m.line.geometry.dispose();
    m.line.material.dispose();
    m.boom.material.dispose();
  }
  const arcPoint = (p, q, t) => {
    const a = p.angleTo(q);
    const sa = Math.sin(a);
    return p.clone().multiplyScalar(Math.sin((1 - t) * a) / sa).add(q.clone().multiplyScalar(Math.sin(t * a) / sa)).normalize().multiplyScalar(1.005 + Math.sin(t * Math.PI) * 0.28);
  };

  useFrame(({ clock }, delta) => {
    if (!active) return;
    const st = s.current;
    const dt = Math.min(delta, 0.05);
    // Auto-spin eases out under the pointer so a visitor dot can be read; it resumes on leave.
    st.spinRate += ((spin && !st.hover ? 0.005 : 0) - st.spinRate) * 0.08;
    st.spinY += st.spinRate + st.vy;
    globe.current.rotation.y = st.spinY;
    world3.current.rotation.x = THREE.MathUtils.clamp(world3.current.rotation.x + st.vx, -0.6, 0.6);
    st.vy *= 0.93;
    st.vx *= 0.9;
    U.uTime.value = clock.elapsedTime;

    ray.setFromCamera(mouse.current, camera);
    const hit = ray.intersectObject(fill.current, false)[0];
    if (hit) st.ringTarget = world3.current.worldToLocal(hit.point.clone()).y;
    st.hover = hit ? 1 : 0;
    if (hit) U.uCursor.value.copy(globe.current.worldToLocal(hit.point.clone()));
    U.uCursorAmp.value += ((hit && !st.labelOn ? 0.35 : 0) - U.uCursorAmp.value) * 0.15;

    // Transmission fires only while a visitor place's label is revealed: spikes, needle bursts and the
    // satellite, to that place alone. While roaming, a calm spike patch just follows the cursor instead.
    const now = clock.elapsedTime;
    st.focus += ((st.labelOn ? 1 : 0) - st.focus) * 0.12;
    const reachable = clusters.filter((c) => c.dir.angleTo(geo.homeDir) >= MIN_ROUTE);
    let target = null;
    if (hit) {
      const d = globe.current.worldToLocal(hit.point.clone()).normalize();
      let bestA = Infinity;
      for (const c of reachable) {
        const a = c.dir.angleTo(d);
        if (a < bestA) (bestA = a), (target = c.dir);
      }
      if (!target && d.angleTo(geo.homeDir) >= MIN_ROUTE) target = d;
    }
    const spawn = (to) => {
      st.pulses.push({ to: to.clone(), relay: relayFor(geo.homeDir, to), t: 0, speed: 0.45 + Math.random() * 0.7, seed: Math.random() * 100, pinged: false });
      if (st.pulses.length > PULSES) st.pulses.shift();
    };
    if (target && st.labelOn && now > st.nextPulse) {
      spawn(target);
      // Opens sparse and tightens to a dense burst stream (0.06-0.28 s apart) as focus eases in.
      st.nextPulse = now + THREE.MathUtils.lerp(0.4, 0.06, st.focus) + Math.random() * THREE.MathUtils.lerp(0.6, 0.22, st.focus);
    }
    st.pulses = st.pulses.filter((p) => (p.t += dt * p.speed) < 1);
    for (let i = 0; i < PULSES; i++) {
      const p = st.pulses[i];
      if (p) {
        const level = st.focus;
        U.uPulse.value[i].copy(slerpDir(geo.homeDir, p.to, p.t));
        U.uPulseAmp.value[i] = Math.sin(Math.PI * p.t) * (0.6 + 0.4 * Math.abs(Math.sin(now * 37 + p.seed))) * THREE.MathUtils.lerp(0.32, 1, level);
        U.uPulseSize.value[i] = THREE.MathUtils.lerp(0.55, 1, level);
      } else U.uPulseAmp.value[i] = 0;
    }
    // Needle bursts ride the satellite hop; they swell as a pulse bounces off the relay.
    const np = needles.geometry.attributes.position;
    const head = new THREE.Vector3();
    const prev = new THREE.Vector3();
    const n = new THREE.Vector3();
    for (let i = 0; i < PULSES; i++) {
      const p = st.pulses[i];
      const level = p ? st.focus : 0;
      const shown = p ? Math.round(THREE.MathUtils.lerp(6, NEEDLES, level)) : 0;
      let amp = 0;
      if (p) {
        legPoint(p, geo.homeDir, head);
        legPoint({ ...p, t: Math.max(0, p.t - 0.04) }, geo.homeDir, prev);
        const bounce = Math.exp(-(((p.t - 0.5) / 0.07) ** 2));
        amp = (0.6 + 0.4 * Math.abs(Math.sin(now * 37 + p.seed))) * THREE.MathUtils.lerp(0.4, 1, level) * (1 + 1.6 * bounce);
        if (!p.pinged && p.t >= 0.5) (p.pinged = true), (sat.pingAge = 0);
      }
      for (let k = 0; k < NEEDLES; k++) {
        const o = (i * NEEDLES + k) * 2;
        if (k >= shown) {
          np.setXYZ(o, 0, 0, 0);
          np.setXYZ(o + 1, 0, 0, 0);
          continue;
        }
        // Two thirds starburst at the head, one third scattered back along the leg as a jittery trail.
        const c = k % 3 === 2 ? prev.clone().lerp(head, Math.random()) : head;
        n.randomDirection();
        const len = amp * (0.012 + 0.06 * Math.random() * Math.random());
        np.setXYZ(o, c.x + n.x * len * 0.15, c.y + n.y * len * 0.15, c.z + n.z * len * 0.15);
        np.setXYZ(o + 1, c.x + n.x * len, c.y + n.y * len, c.z + n.z * len);
      }
    }
    np.needsUpdate = true;

    // The satellite parks over the active route's relay, panels facing the Earth, and pings on each bounce.
    const satShow = target && st.labelOn ? st.focus : 0;
    if (target) {
      const relay = relayFor(geo.homeDir, target);
      if (!sat.ready) sat.at.copy(relay), (sat.ready = true);
      sat.at.lerp(relay, 0.12);
    }
    sat.frame.material.opacity += (satShow - sat.frame.material.opacity) * 0.15;
    sat.group.visible = sat.frame.material.opacity > 0.01;
    if (sat.group.visible) {
      sat.group.position.copy(sat.at);
      sat.group.quaternion.setFromUnitVectors(Z, sat.at.clone().normalize());
      sat.frame.rotation.z = now * 0.35;
      sat.pingAge += dt;
      sat.ping.scale.setScalar(0.01 + sat.pingAge * 0.16);
      sat.ping.material.opacity = Math.max(0, 0.9 - sat.pingAge * 2.4) * sat.frame.material.opacity;
    }

    // Labels are DOM, positioned from the projected marker; they hide once the point rotates away.
    const label = (el, localDir, lift = 1.02) => {
      const w = globe.current.localToWorld(localDir.clone().multiplyScalar(lift));
      const facing = w.clone().normalize().dot(camera.position.clone().sub(w).normalize());
      const p = w.project(camera);
      const x = ((p.x + 1) / 2) * size.width;
      // Near the right edge the label hangs to the left of its point instead of running off-screen.
      const flip = x > size.width - 170;
      el.classList.toggle('flip', flip);
      el.style.transform = `translate3d(${x}px, ${((1 - p.y) / 2) * size.height}px, 0)${flip ? ' translateX(calc(-100% - 22px))' : ''}`;
      return facing;
    };
    if (homeLabel.current) homeLabel.current.style.opacity = Math.max(0, Math.min(1, (label(homeLabel.current, geo.homeDir, 1.32) - 0.1) * 4));
    if (tip.current) {
      let best = null;
      if (hit) {
        const d = globe.current.worldToLocal(hit.point.clone()).normalize();
        // Clusters sit at least MERGE_ANGLE apart, so a slightly smaller pick radius never straddles two.
        let bestAngle = 0.06;
        for (const c of clusters) {
          const a = c.dir.angleTo(d);
          if (a < bestAngle) (bestAngle = a), (best = c);
        }
      }
      if (best) {
        label(tip.current, best.dir);
        const more = best.places > 1 ? ` +${best.places - 1} nearby` : '';
        tip.current.textContent = `${best.place ?? 'Unknown'}${more}${best.exit ? ' · VPN / datacenter exit' : ''}`;
      }
      tip.current.style.opacity = best ? 1 : 0;
      st.labelOn = !!best;
    }

    const A = 0.92;
    if (st.hover) {
      const tgt = THREE.MathUtils.clamp(st.ringTarget, -A, A);
      if (Math.abs(tgt - st.scanY) > 0.002) st.scanDir = tgt > st.scanY ? 1 : -1;
      st.scanY += (tgt - st.scanY) * 0.35;
    } else {
      st.scanY += st.scanDir * 0.35 * Math.sqrt(Math.max(A * A - st.scanY * st.scanY, 0.004)) * dt;
      if (st.scanY >= A) (st.scanY = A), (st.scanDir = -1);
      else if (st.scanY <= -A) (st.scanY = -A), (st.scanDir = 1);
    }
    const sr = Math.sqrt(Math.max(0.0001, 1 - st.scanY * st.scanY)) * 1.012;
    ring.current.position.y = st.scanY;
    ring.current.scale.set(sr, 1, sr);
    ring.current.material.opacity = 0.7 + 0.3 * (1 - Math.abs(st.scanY));

    for (let i = st.missiles.length - 1; i >= 0; i--) {
      const m = st.missiles[i];
      m.age += dt;
      m.boom.scale.setScalar(0.001 + m.age * 0.16);
      m.boom.material.opacity = Math.max(1 - m.age * 0.9, 0);
      if (m.t < 1) {
        m.t = Math.min(m.t + dt * 1.65, 1);
        const n = Math.max(Math.floor(m.t * 64), 2);
        const pos = m.line.geometry.attributes.position;
        for (let k = 0; k < n; k++) {
          const v = arcPoint(m.p, m.q, (k / (n - 1)) * m.t);
          pos.setXYZ(k, v.x, v.y, v.z);
        }
        pos.needsUpdate = true;
        m.line.geometry.setDrawRange(0, n);
      } else {
        m.done += dt;
        m.line.material.opacity = Math.max(1 - m.done * 0.9, 0);
        if (m.done > 1.4) {
          kill(m);
          st.missiles.splice(i, 1);
        }
      }
    }
  });

  return (
    <group ref={world3} scale={1.3}>
      <group ref={globe}>
        <mesh ref={fill} renderOrder={-2}>
          <sphereGeometry args={[0.985, 32, 32]} />
          <meshBasicMaterial color="#000000" />
        </mesh>
        <lineSegments geometry={geo.grid}>
          <lineBasicMaterial color="#ffffff" transparent opacity={0.16} />
        </lineSegments>
        <lineSegments geometry={geo.coast} material={mats.coast} />
        <lineSegments geometry={geo.border} material={mats.border} />
        <primitive object={needles} />
        <primitive object={sat.group} />
        <Visitors clusters={clusters} />
        <HomeMarker position={geo.home} />
      </group>
      <lineLoop ref={ring} geometry={geo.ring}>
        <lineBasicMaterial color="#9e9e9e" transparent />
      </lineLoop>
    </group>
  );
}

export default function Globe({ home, active, spin, visitors }) {
  const homeLabel = useRef(null);
  const tip = useRef(null);
  return (
    <>
    <Canvas
      dpr={1}
      frameloop={active ? 'always' : 'never'}
      camera={{ position: [0, 0.32, 4.2], fov: 46 }}
      gl={{ alpha: true, antialias: true }}
      style={{ touchAction: 'pan-y', cursor: 'crosshair' }}
    >
      <Earth home={home} active={active} spin={spin} visitors={visitors} homeLabel={homeLabel} tip={tip} />
    </Canvas>
    <p className="globe-home nav-font" ref={homeLabel} aria-hidden="true">
      <b>{home.label}</b> {home.tag}
    </p>
    <p className="globe-tip nav-font" ref={tip} aria-hidden="true" />
    </>
  );
}
