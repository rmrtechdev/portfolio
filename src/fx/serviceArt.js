import { REDUCED } from '../env';

const CY = 'rgb(8,253,216)';
const PK = 'rgb(255,105,180)';
const HOT = '#e8fffb';
const WH = '#e9eaec';
const GH = 'rgb(129,129,129)';
const TAU = Math.PI * 2;

function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

/* Yaw about Y, then pitch about X (positive pitch looks down), then a perspective divide; `ax` stretches the
   result horizontally so round subjects fill the wide panel like a lens. Results land in P so the per-point
   hot loops allocate nothing. */
const P = { x: 0, y: 0, z: 0, s: 1 };
function view(v, yaw, pitch, ox, oy, k, f, ax = 1) {
  v.cy = Math.cos(yaw);
  v.sy = Math.sin(yaw);
  v.cp = Math.cos(pitch);
  v.sp = Math.sin(pitch);
  v.ox = ox;
  v.oy = oy;
  v.k = k;
  v.f = f;
  v.ax = ax;
}
function project(v, x, y, z) {
  const x1 = x * v.cy + z * v.sy;
  const z1 = z * v.cy - x * v.sy;
  P.z = z1 * v.cp - y * v.sp;
  P.s = v.f / (v.f + P.z);
  P.x = v.ox + x1 * P.s * v.k * v.ax;
  P.y = v.oy - (y * v.cp + z1 * v.sp) * P.s * v.k;
}
const facingZ = (v, nx, ny, nz) => (nz * v.cy - nx * v.sy) * v.cp - ny * v.sp;

/* Radial light sprites: a near-white core falling off through the hue to nothing, drawn additively so
   overlapping light saturates toward white the way phosphor does. */
const sprites = {};
function sprite(col, core) {
  if (sprites[col]) return sprites[col];
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  r.addColorStop(0, core);
  r.addColorStop(0.18, col);
  r.addColorStop(0.45, col.replace('rgb', 'rgba').replace(')', ',.25)'));
  r.addColorStop(1, col.replace('rgb', 'rgba').replace(')', ',0)'));
  g.fillStyle = r;
  g.fillRect(0, 0, 64, 64);
  return (sprites[col] = c);
}
const glowCy = () => sprite(CY, HOT);
const glowPk = () => sprite(PK, '#fff2f9');
function glow(ctx, img, x, y, r, a) {
  ctx.globalAlpha = a;
  ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
}

/* Phosphor persistence: each card keeps an offscreen trail layer that loses a fixed share of its light per 60 Hz
   frame, so moving light leaves a decaying burn while the wireframes on the main layer stay crisp. */
function fade(s, a60, dt) {
  const x = s.tx;
  x.globalCompositeOperation = 'destination-out';
  x.globalAlpha = 1 - Math.pow(1 - a60, dt * 60);
  x.fillStyle = '#000';
  x.fillRect(0, 0, s.w, s.h);
  x.globalCompositeOperation = 'lighter';
}
function trail(ctx, s) {
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 1;
  ctx.drawImage(s.tc, 0, 0, s.w, s.h);
  ctx.globalCompositeOperation = 'source-over';
}

const BX = new Float32Array(16);
const BZ = new Float32Array(8);
const EDGES = new Uint8Array([0, 1, 0, 2, 0, 4, 1, 3, 1, 5, 2, 3, 2, 6, 3, 7, 4, 5, 4, 6, 5, 7, 6, 7]);
const FACES = new Int8Array([1, 3, 7, 5, 1, 0, 0, 0, 2, 6, 4, -1, 0, 0, 2, 3, 7, 6, 0, 1, 0, 0, 1, 5, 4, 0, -1, 0, 4, 5, 7, 6, 0, 0, 1, 0, 1, 3, 2, 0, 0, -1]);

/** Solid wireframe box: visible faces fill dark so nearer boxes occlude farther ones; the three edges meeting at
 * the farthest corner are the hidden ones and draw as a faint x-ray instead of being culled. */
function box(ctx, v, cx, cy, cz, hw, hh, hd, edge, tint, col) {
  let far = 0;
  for (let i = 0; i < 8; i++) {
    project(v, cx + (i & 1 ? hw : -hw), cy + (i & 2 ? hh : -hh), cz + (i & 4 ? hd : -hd));
    BX[i * 2] = P.x;
    BX[i * 2 + 1] = P.y;
    BZ[i] = P.z;
    if (P.z > BZ[far]) far = i;
  }
  for (let f = 0; f < 42; f += 7) {
    if (facingZ(v, FACES[f + 4], FACES[f + 5], FACES[f + 6]) >= 0) continue;
    ctx.beginPath();
    ctx.moveTo(BX[FACES[f] * 2], BX[FACES[f] * 2 + 1]);
    for (let k = 1; k < 4; k++) ctx.lineTo(BX[FACES[f + k] * 2], BX[FACES[f + k] * 2 + 1]);
    ctx.closePath();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = '#000';
    ctx.fill();
    if (tint > 0.01) {
      ctx.globalAlpha = tint;
      ctx.fillStyle = col;
      ctx.fill();
    }
  }
  ctx.strokeStyle = col;
  for (let pass = 0; pass < 2; pass++) {
    ctx.beginPath();
    for (let e = 0; e < 24; e += 2) {
      const a = EDGES[e];
      const b = EDGES[e + 1];
      if ((a === far || b === far) !== (pass === 0)) continue;
      ctx.moveTo(BX[a * 2], BX[a * 2 + 1]);
      ctx.lineTo(BX[b * 2], BX[b * 2 + 1]);
    }
    ctx.globalAlpha = pass === 0 ? edge * 0.18 : edge;
    ctx.stroke();
  }
}

const ARTS = {
  /* Requests stream in from beyond the left edge on depth-staggered lanes, accelerate as they converge, and land
     in one of three server layers (API / ORM / SQL), which flash on impact and emit a response out the far side.
     One request is pink so the eye can follow a single round trip. */
  flow(rnd) {
    const N = 44;
    const LANES = 7;
    const SX = 0.46;
    const X0 = -3.4;
    const lane = new Uint8Array(N);
    const pr = new Float32Array(N);
    const sp = new Float32Array(N);
    const out = new Float32Array(N).fill(-1);
    const flash = new Float32Array(3);
    let pink = 0;
    for (let i = 0; i < N; i++) {
      lane[i] = i % LANES;
      pr[i] = rnd();
      sp[i] = 0.7 + rnd() * 0.6;
    }
    sp[0] = 0.85;
    const laneY = (l) => -1.05 + (l / (LANES - 1)) * 2.1;
    const laneZ = (l) => (((l * 3) % LANES) / (LANES - 1)) * 2 - 1;
    const slotY = (k) => (k - 1) * 0.5;
    const at = (v, l, slot, p) => {
      const e = p * p * (3 - 2 * p);
      project(v, X0 + p * (SX - X0), laneY(l) * (1 - e) + slotY(slot) * e, laneZ(l) * (1 - e));
    };
    return (ctx, s, t, dt) => {
      const { w, h, v } = s;
      view(v, -0.4 + 0.06 * Math.sin(t * 0.3) + s.yaw, 0.18 + s.pit, w * 0.4, h * 0.52, w * 0.2, 4.2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = CY;
      for (let l = 0; l < LANES; l++) {
        ctx.beginPath();
        for (let k = 0; k <= 28; k++) {
          at(v, l, l % 3, k / 28);
          k ? ctx.lineTo(P.x, P.y) : ctx.moveTo(P.x, P.y);
        }
        ctx.globalAlpha = 0.05 + 0.13 * clamp01(0.5 - laneZ(l) * 0.5);
        ctx.stroke();
      }
      fade(s, 0.15, dt);
      const tx = s.tx;
      const gc = glowCy();
      const gp = glowPk();
      const boost = 1 + s.hover * 0.9;
      for (let i = 0; i < N; i++) {
        pr[i] += dt * sp[i] * (0.1 + 0.55 * pr[i] * pr[i]) * boost;
        if (pr[i] >= 1) {
          pr[i] = 0;
          flash[i % 3] = 1;
          if (i === 0) pink = 1;
          out[i] = 0;
          lane[i] = (rnd() * LANES) | 0;
        }
        at(v, lane[i], i % 3, pr[i]);
        const near = clamp01(0.55 - P.z * 0.5);
        const sz = (1.2 + 1.4 * near) * P.s;
        if (i === 0) {
          glow(tx, gp, P.x, P.y, 11 * P.s, 0.9);
        } else {
          glow(tx, gc, P.x, P.y, (3 + 4 * near) * P.s, 0.25 + 0.45 * near);
          tx.globalAlpha = 0.4 + 0.6 * near;
          tx.fillStyle = near > 0.6 ? HOT : CY;
          tx.fillRect(P.x - sz / 2, P.y - sz / 2, sz, sz);
        }
        if (out[i] < 0) continue;
        out[i] += dt * 1.4 * boost;
        if (out[i] > 1) {
          out[i] = -1;
          continue;
        }
        project(v, 0.8 + 0.34 + out[i] * 2.1, slotY(i % 3), 0);
        if (i === 0) glow(tx, gp, P.x, P.y, 8, 1 - out[i]);
        else {
          tx.globalAlpha = (1 - out[i]) * 0.9;
          tx.fillStyle = HOT;
          tx.fillRect(P.x - 1, P.y - 1, 2, 2);
        }
      }
      pink *= Math.exp(-dt * 2.5);
      ctx.lineWidth = 1.5;
      for (let k = 0; k < 3; k++) {
        flash[k] *= Math.exp(-dt * 4);
        const pk = k === 0 && pink > 0.05;
        box(ctx, v, 0.8, slotY(k), 0, 0.34, 0.19, 0.4, 0.6 + 0.4 * flash[k], flash[k] * 0.22, pk ? PK : flash[k] > 0.5 ? HOT : CY);
        ctx.strokeStyle = CY;
        ctx.globalAlpha = 0.3 + 0.6 * flash[k];
        ctx.beginPath();
        for (let r = 0; r < 3; r++) {
          const y = slotY(k) + 0.09 - r * 0.09;
          project(v, 0.56, y, -0.41);
          ctx.moveTo(P.x, P.y);
          project(v, 0.56 + (r === 1 ? 0.22 : 0.38), y, -0.41);
          ctx.lineTo(P.x, P.y);
        }
        ctx.stroke();
      }
      trail(ctx, s);
    };
  },

  /* An agent graph in 3D: nodes on a jittered Fibonacci shell, each wired to its two nearest neighbours, with
     messages random-walking the edges like tool calls hopping between agents (one pink, to follow). Nodes ride
     damped springs that the pointer pushes aside. */
  graph(rnd) {
    const N = 40;
    const PN = 10;
    const bx = new Float32Array(N);
    const by = new Float32Array(N);
    const bz = new Float32Array(N);
    const qx = new Float32Array(N);
    const qy = new Float32Array(N);
    const qz = new Float32Array(N);
    const ox = new Float32Array(N);
    const oy = new Float32Array(N);
    const vx = new Float32Array(N);
    const vy = new Float32Array(N);
    const heat = new Float32Array(N);
    const ord = new Uint8Array(N).map((_, i) => i);
    for (let i = 0; i < N; i++) {
      const y = 1 - ((i + 0.5) / N) * 2;
      const r = Math.sqrt(1 - y * y);
      const rad = 0.62 + 0.38 * rnd();
      bx[i] = Math.cos(i * 2.39996) * r * rad * 1.55;
      by[i] = y * rad * 0.7;
      bz[i] = Math.sin(i * 2.39996) * r * rad;
    }
    const pairs = [];
    const adj = Array.from({ length: N }, () => []);
    for (let i = 0; i < N; i++) {
      const d = [];
      for (let j = 0; j < N; j++) if (j !== i) d.push([(bx[i] - bx[j]) ** 2 + (by[i] - by[j]) ** 2 + (bz[i] - bz[j]) ** 2, j]);
      d.sort((a, b) => a[0] - b[0]);
      for (let k = 0; k < 2; k++) {
        const j = d[k][1];
        if (adj[i].some((e) => pairs[e * 2] === j || pairs[e * 2 + 1] === j)) continue;
        adj[i].push(pairs.length / 2);
        adj[j].push(pairs.length / 2);
        pairs.push(i, j);
      }
    }
    const E = new Uint8Array(pairs);
    const pe = new Uint16Array(PN);
    const pd = new Uint8Array(PN);
    const pp = new Float32Array(PN);
    for (let k = 0; k < PN; k++) {
      pe[k] = (rnd() * (E.length / 2)) | 0;
      pp[k] = rnd();
    }
    return (ctx, s, t, dt) => {
      const { w, h, v } = s;
      view(v, t * 0.16 + s.yaw, 0.2 + 0.1 * Math.sin(t * 0.23) + s.pit, w * 0.5, h * 0.5, w * 0.29, 3.4);
      const R = h * 0.42;
      for (let i = 0; i < N; i++) {
        project(v, bx[i], by[i], bz[i]);
        let ax = -ox[i] * 55 - vx[i] * 9;
        let ay = -oy[i] * 55 - vy[i] * 9;
        const dx = P.x + ox[i] - s.lx;
        const dy = P.y + oy[i] - s.ly;
        const d = Math.sqrt(dx * dx + dy * dy) + 0.001;
        if (d < R) {
          const f = (1 - d / R) ** 2 * 6500;
          ax += (dx / d) * f;
          ay += (dy / d) * f;
        }
        vx[i] += ax * dt;
        vy[i] += ay * dt;
        ox[i] += vx[i] * dt;
        oy[i] += vy[i] * dt;
        qx[i] = P.x + ox[i];
        qy[i] = P.y + oy[i];
        qz[i] = P.z;
        heat[i] *= Math.exp(-dt * 2.2);
      }
      ctx.strokeStyle = CY;
      for (let e = 0; e < E.length; e += 2) {
        const a = E[e];
        const b = E[e + 1];
        const near = clamp01(0.5 - (qz[a] + qz[b]) * 0.3);
        ctx.lineWidth = 0.8 + 1.2 * near;
        ctx.globalAlpha = 0.07 + 0.38 * near;
        ctx.beginPath();
        ctx.moveTo(qx[a], qy[a]);
        ctx.lineTo(qx[b], qy[b]);
        ctx.stroke();
      }
      for (let i = 1; i < N; i++) {
        const o = ord[i];
        let j = i - 1;
        while (j >= 0 && qz[ord[j]] < qz[o]) (ord[j + 1] = ord[j]), j--;
        ord[j + 1] = o;
      }
      const gc = glowCy();
      const gp = glowPk();
      ctx.lineWidth = 1;
      for (let n = 0; n < N; n++) {
        const i = ord[n];
        const near = clamp01(0.5 - qz[i] * 0.6);
        const hub = i % 9 === 0;
        const sz = (1.6 + 2.8 * near) * (hub ? 1.5 : 1);
        if (near > 0.45 || heat[i] > 0.05) {
          ctx.globalCompositeOperation = 'lighter';
          glow(ctx, gc, qx[i], qy[i], sz * 2.4 + heat[i] * 10, 0.2 + 0.35 * near + 0.6 * heat[i]);
          ctx.globalCompositeOperation = 'source-over';
        }
        ctx.globalAlpha = 0.25 + 0.75 * near;
        ctx.fillStyle = near > 0.7 || heat[i] > 0.4 ? HOT : CY;
        ctx.fillRect(qx[i] - sz / 2, qy[i] - sz / 2, sz, sz);
        if (hub) {
          ctx.globalAlpha *= 0.6;
          ctx.strokeStyle = CY;
          ctx.strokeRect(qx[i] - sz - 2, qy[i] - sz - 2, sz * 2 + 4, sz * 2 + 4);
        }
      }
      fade(s, 0.1, dt);
      const tx = s.tx;
      for (let k = 0; k < PN; k++) {
        pp[k] += dt * (0.8 + s.hover * 1.2) * (k === 0 ? 0.7 : 1);
        if (pp[k] >= 1) {
          const at = E[pe[k] * 2 + (pd[k] ? 0 : 1)];
          heat[at] = 1;
          const nx = adj[at][(rnd() * adj[at].length) | 0];
          pe[k] = nx;
          pd[k] = E[nx * 2] === at ? 0 : 1;
          pp[k] = 0;
        }
        const a = E[pe[k] * 2 + pd[k]];
        const b = E[pe[k] * 2 + 1 - pd[k]];
        const x = qx[a] + (qx[b] - qx[a]) * pp[k];
        const y = qy[a] + (qy[b] - qy[a]) * pp[k];
        if (k === 0) glow(tx, gp, x, y, 9, 0.95);
        else {
          glow(tx, gc, x, y, 5, 0.6);
          tx.globalAlpha = 1;
          tx.fillStyle = HOT;
          tx.fillRect(x - 1, y - 1, 2, 2);
        }
      }
      trail(ctx, s);
    };
  },

  /* Component orbits: three tilted elliptical rings around a halftone-shaded core. Electrons obey Kepler's second
     law (fast at periapsis, slow at apoapsis) and burn comet tails into the trail layer; one electron is pink.
     The pointer moves the light on the core. */
  hemisphere() {
    const SEG = 120;
    const ECC = 0.2;
    const ring = new Float32Array(3 * (SEG + 1) * 3);
    const th = new Float32Array([0, 2.1, 4.2]);
    const orbit = (i, a, out, o) => {
      const r = (1 - ECC * ECC) / (1 + ECC * Math.cos(a));
      const x0 = r * Math.cos(a) * 1.25;
      const z0 = r * Math.sin(a) * 1.25;
      const y1 = -z0 * Math.cos(1.25);
      const z1 = z0 * Math.sin(1.25);
      const phi = (i * Math.PI) / 3;
      out[o] = x0 * Math.cos(phi) - y1 * Math.sin(phi);
      out[o + 1] = x0 * Math.sin(phi) + y1 * Math.cos(phi);
      out[o + 2] = z1;
    };
    for (let i = 0; i < 3; i++) for (let k = 0; k <= SEG; k++) orbit(i, (k / SEG) * TAU, ring, (i * (SEG + 1) + k) * 3);
    const E = new Float32Array(3);
    const strokeRings = (ctx, v, back) => {
      for (let i = 0; i < 3; i++) {
        let level = -1;
        for (let k = 0; k < SEG; k++) {
          const o = (i * (SEG + 1) + k) * 3;
          project(v, (ring[o] + ring[o + 3]) / 2, (ring[o + 1] + ring[o + 4]) / 2, (ring[o + 2] + ring[o + 5]) / 2);
          if (P.z > 0 !== back) {
            if (level >= 0) ctx.stroke(), (level = -1);
            continue;
          }
          const lv = Math.round(clamp01(0.5 - P.z * 0.6) * 4);
          if (lv !== level) {
            if (level >= 0) ctx.stroke();
            level = lv;
            ctx.globalAlpha = 0.14 + lv * 0.2;
            ctx.lineWidth = 0.9 + lv * 0.3;
            ctx.beginPath();
            project(v, ring[o], ring[o + 1], ring[o + 2]);
            ctx.moveTo(P.x, P.y);
          }
          project(v, ring[o + 3], ring[o + 4], ring[o + 5]);
          ctx.lineTo(P.x, P.y);
        }
        if (level >= 0) ctx.stroke();
      }
    };
    return (ctx, s, t, dt) => {
      const { w, h, v } = s;
      view(v, 0.35 * Math.sin(t * 0.21) + s.yaw, 0.15 * Math.sin(t * 0.17) + s.pit, w * 0.5, h * 0.5, h * 0.33, 3.6, 1.85);
      ctx.strokeStyle = CY;
      strokeRings(ctx, v, true);
      project(v, 0, 0, 0);
      const cx = P.x;
      const cy = P.y;
      const Rn = h * 0.17 * P.s;
      const cell = 3;
      let lx = s.inside ? s.mx : Math.cos(t * 0.4) * 0.7;
      let ly = s.inside ? -s.my : 0.45;
      const ln = Math.hypot(lx, ly, 0.75);
      lx /= ln;
      ly /= ln;
      const lz = -0.75 / ln;
      ctx.globalCompositeOperation = 'lighter';
      glow(ctx, glowCy(), cx, cy, Rn * 2.2, 0.35);
      ctx.globalCompositeOperation = 'source-over';
      let hot = false;
      ctx.fillStyle = CY;
      for (let y = Math.floor((cy - Rn) / cell) * cell; y < cy + Rn; y += cell) {
        for (let x = Math.floor((cx - Rn) / cell) * cell; x < cx + Rn; x += cell) {
          const nx = (x + cell / 2 - cx) / Rn;
          const ny = -(y + cell / 2 - cy) / Rn;
          const q = 1 - nx * nx - ny * ny;
          if (q <= 0) continue;
          const nz = -Math.sqrt(q);
          const shade = Math.max(0, nx * lx + ny * ly + nz * lz);
          const rim = (1 + nz) ** 3;
          const sz = Math.min(cell - 0.8, cell * (0.1 + 0.6 * shade + 0.2 * rim));
          const hi = shade > 0.82;
          if (hi !== hot) (hot = hi), (ctx.fillStyle = hi ? HOT : CY);
          ctx.globalAlpha = Math.min(1, 0.18 + 0.82 * shade + 0.4 * rim);
          ctx.fillRect(x + (cell - sz) / 2, y + (cell - sz) / 2, sz, sz);
        }
      }
      strokeRings(ctx, v, false);
      fade(s, 0.075, dt);
      const tx = s.tx;
      const n = 1.5 * (1 + s.hover * 0.8);
      for (let i = 0; i < 3; i++) {
        const c = 1 + ECC * Math.cos(th[i]);
        th[i] = (th[i] + dt * n * c * c * Math.pow(1 - ECC * ECC, -1.5)) % TAU;
        orbit(i, th[i], E, 0);
        project(v, E[0], E[1], E[2]);
        const near = clamp01(0.5 - P.z * 0.6);
        if (i === 1) glow(tx, glowPk(), P.x, P.y, (6 + 5 * near) * P.s, 0.6 + 0.4 * near);
        else {
          glow(tx, glowCy(), P.x, P.y, (4 + 4 * near) * P.s, 0.5 + 0.5 * near);
          tx.globalAlpha = 0.5 + 0.5 * near;
          tx.fillStyle = HOT;
          tx.fillRect(P.x - 1.2, P.y - 1.2, 2.4, 2.4);
        }
      }
      trail(ctx, s);
    };
  },

  /* Lidar point cloud of a torus knot: point size and brightness follow how squarely each sample faces the
     camera, a scan band sweeps the form, the spin eases slow–fast–slow, a pink tracer runs the knot's core,
     and hovering tears the image in rows. */
  dotsphere(rnd) {
    const U = 200;
    const V = 10;
    const N = U * V;
    const px = new Float32Array(N);
    const py = new Float32Array(N);
    const pz = new Float32Array(N);
    const nx = new Float32Array(N);
    const ny = new Float32Array(N);
    const nz = new Float32Array(N);
    const knot = (u, o) => {
      const r = 0.78 + 0.32 * Math.cos(3 * u);
      o[0] = r * Math.cos(2 * u);
      o[1] = r * Math.sin(2 * u) * 0.72;
      o[2] = -0.32 * Math.sin(3 * u);
    };
    const c0 = new Float32Array(3);
    const c1 = new Float32Array(3);
    const c2 = new Float32Array(3);
    for (let i = 0; i < U; i++) {
      const u = (i / U) * TAU;
      knot(u - 0.01, c0);
      knot(u, c1);
      knot(u + 0.01, c2);
      let Tx = c2[0] - c0[0];
      let Ty = c2[1] - c0[1];
      let Tz = c2[2] - c0[2];
      const tl = Math.hypot(Tx, Ty, Tz);
      (Tx /= tl), (Ty /= tl), (Tz /= tl);
      let Nx = c2[0] + c0[0] - 2 * c1[0];
      let Ny = c2[1] + c0[1] - 2 * c1[1];
      let Nz = c2[2] + c0[2] - 2 * c1[2];
      const nl = Math.hypot(Nx, Ny, Nz);
      (Nx /= nl), (Ny /= nl), (Nz /= nl);
      const Bx = Ty * Nz - Tz * Ny;
      const By = Tz * Nx - Tx * Nz;
      const Bz = Tx * Ny - Ty * Nx;
      for (let j = 0; j < V; j++) {
        const a = (j / V) * TAU + (i % 2) * (Math.PI / V);
        const k = i * V + j;
        nx[k] = Nx * Math.cos(a) + Bx * Math.sin(a);
        ny[k] = Ny * Math.cos(a) + By * Math.sin(a);
        nz[k] = Nz * Math.cos(a) + Bz * Math.sin(a);
        px[k] = c1[0] + nx[k] * 0.15;
        py[k] = c1[1] + ny[k] * 0.15;
        pz[k] = c1[2] + nz[k] * 0.15;
      }
    }
    let spin = rnd() * TAU;
    let grad = null;
    let tearAt = 0;
    const tears = new Float32Array(9);
    let nt = 0;
    const row = document.createElement('canvas');
    const rx = row.getContext('2d');
    return (ctx, s, t, dt) => {
      const { w, h, v } = s;
      spin += dt * (0.12 + 0.7 * (0.5 - 0.5 * Math.cos(spin)));
      view(v, spin + s.yaw, 0.3 * Math.sin(t * 0.21) + s.pit, w * 0.5, h * 0.5, h * 0.55, 3, 1.4);
      const scanY = Math.sin(t * 0.5) * 0.75;
      const gain = (s.lit ? 1.15 : 1) * (1 + 0.35 * s.hover);
      const kx = v.k * v.ax;
      let hot = false;
      ctx.fillStyle = CY;
      for (let i = 0; i < N; i++) {
        const x1 = px[i] * v.cy + pz[i] * v.sy;
        const z1 = pz[i] * v.cy - px[i] * v.sy;
        const y1 = py[i] * v.cp + z1 * v.sp;
        const z2 = z1 * v.cp - py[i] * v.sp;
        const sc = v.f / (v.f + z2);
        const face = Math.max(0, -facingZ(v, nx[i], ny[i], nz[i]));
        const band = Math.exp(-Math.abs(y1 - scanY) * 9);
        const sz = (0.8 + 1.3 * face + 1.8 * band) * sc;
        ctx.globalAlpha = Math.min(1, (0.08 + 0.62 * face + 0.9 * band) * gain * sc);
        const hi = band > 0.5 && face > 0.3;
        if (hi !== hot) (hot = hi), (ctx.fillStyle = hi ? HOT : CY);
        ctx.fillRect(v.ox + x1 * sc * kx - sz / 2, v.oy - y1 * sc * v.k - sz / 2, sz, sz);
      }
      const sy = v.oy - scanY * v.k;
      if (!grad) {
        grad = ctx.createLinearGradient(0, -26, 0, 26);
        grad.addColorStop(0, 'rgba(8,253,216,0)');
        grad.addColorStop(0.5, 'rgba(8,253,216,.18)');
        grad.addColorStop(1, 'rgba(8,253,216,0)');
      }
      ctx.globalCompositeOperation = 'lighter';
      ctx.translate(0, sy);
      ctx.globalAlpha = 1 - s.hover * 0.35;
      ctx.fillStyle = grad;
      ctx.fillRect(0, -26, w, 52);
      ctx.translate(0, -sy);
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.6;
      ctx.fillStyle = HOT;
      ctx.fillRect(0, Math.round(sy), w, 1);
      ctx.globalAlpha = 1;
      ctx.fillRect(0, sy - 2, 3, 5);
      ctx.fillRect(w - 3, sy - 2, 3, 5);
      fade(s, 0.06, dt);
      knot(t * 0.42, c0);
      project(v, c0[0], c0[1], c0[2]);
      glow(s.tx, glowPk(), P.x, P.y, 9 * P.s, 0.9);
      trail(ctx, s);
      if (s.hover < 0.06) return;
      if (t > tearAt) {
        nt = 0;
        if (rnd() < 0.3 + 0.45 * s.hover) {
          nt = 1 + ((rnd() * 3) | 0);
          for (let k = 0; k < nt; k++) {
            tears[k * 3] = (rnd() * h) | 0;
            tears[k * 3 + 1] = 3 + ((rnd() * 12) | 0);
            tears[k * 3 + 2] = (rnd() - 0.5) * 22;
          }
        }
        tearAt = t + 0.22 + rnd() * 0.5;
      }
      const d = s.dpr;
      if (row.width !== s.c.width) (row.width = s.c.width), (row.height = Math.ceil(16 * d));
      for (let k = 0; k < nt; k++) {
        const y = tears[k * 3];
        const rh = tears[k * 3 + 1];
        rx.clearRect(0, 0, row.width, row.height);
        rx.drawImage(s.c, 0, y * d, s.c.width, rh * d, 0, 0, s.c.width, rh * d);
        ctx.clearRect(0, y, w, rh);
        ctx.globalAlpha = 1;
        ctx.drawImage(row, 0, 0, s.c.width, rh * d, tears[k * 3 + 2], y, w, rh);
        ctx.globalAlpha = 0.7 * s.hover;
        ctx.fillStyle = PK;
        ctx.fillRect(0, y, w, 1);
      }
    };
  },

  /* A tilted scope: the beam paints phosphor that decays over about a second and a half, contacts ping when the
     beam crosses them and fade exponentially, and a reticle springs onto the contact nearest the pointer, or
     onto the one flagged vulnerability (pink) when idle. */
  radar(rnd) {
    const NT = 11;
    const VULN = 7;
    const tr = new Float32Array(NT);
    const ta = new Float32Array(NT);
    const th = new Float32Array(NT);
    const tw = new Float32Array(NT);
    const ti = new Float32Array(NT);
    const sx = new Float32Array(NT);
    const sy = new Float32Array(NT);
    for (let i = 0; i < NT; i++) {
      tr[i] = 0.22 + rnd() * 0.72;
      ta[i] = rnd() * TAU;
      th[i] = 0.1 + rnd() * 0.42;
      tw[i] = (rnd() - 0.5) * 0.12;
    }
    let a = 0;
    const ret = { x: 0, y: 0, vx: 0, vy: 0 };
    return (ctx, s, t, dt) => {
      const { w, h, v } = s;
      view(v, 0.22 * Math.sin(t * 0.13) + s.yaw, 0.62 + s.pit * 0.5, w * 0.5, h * 0.46, Math.min(w * 0.35, h * 0.68), 3.6);
      ctx.lineWidth = 1;
      for (let r = 1; r <= 4; r++) {
        ctx.beginPath();
        for (let k = 0; k <= 96; k++) {
          project(v, (Math.cos((k / 96) * TAU) * r) / 4, 0, (Math.sin((k / 96) * TAU) * r) / 4);
          k ? ctx.lineTo(P.x, P.y) : ctx.moveTo(P.x, P.y);
        }
        ctx.strokeStyle = r === 4 ? CY : GH;
        ctx.lineWidth = r === 4 ? 1.5 : 1;
        ctx.globalAlpha = r === 4 ? 0.55 : 0.2;
        ctx.stroke();
      }
      ctx.lineWidth = 1;
      ctx.strokeStyle = GH;
      ctx.beginPath();
      for (let k = 0; k < 36; k++) {
        const c = Math.cos((k / 36) * TAU);
        const sn = Math.sin((k / 36) * TAU);
        const r0 = k % 9 ? 0.95 : 0;
        project(v, c * r0, 0, sn * r0);
        ctx.moveTo(P.x, P.y);
        project(v, c, 0, sn);
        ctx.lineTo(P.x, P.y);
      }
      ctx.globalAlpha = 0.22;
      ctx.stroke();
      const prev = a;
      a += dt * 1.25 * (1 + 0.6 * s.hover);
      fade(s, 0.05, dt);
      const tx = s.tx;
      project(v, 0, 0, 0);
      const cx = P.x;
      const cy = P.y;
      tx.beginPath();
      tx.moveTo(cx, cy);
      project(v, Math.cos(prev), 0, Math.sin(prev));
      tx.lineTo(P.x, P.y);
      project(v, Math.cos(a), 0, Math.sin(a));
      tx.lineTo(P.x, P.y);
      tx.closePath();
      tx.globalAlpha = 0.3;
      tx.fillStyle = CY;
      tx.fill();
      const gc = glowCy();
      const gp = glowPk();
      glow(tx, gc, P.x, P.y, 6, 0.5);
      trail(ctx, s);
      ctx.lineWidth = 2;
      ctx.globalAlpha = 0.95;
      ctx.strokeStyle = HOT;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(P.x, P.y);
      ctx.stroke();
      ctx.lineWidth = 1;
      let best = -1;
      let bd = Infinity;
      for (let i = 0; i < NT; i++) {
        ta[i] += tw[i] * dt;
        const since = (((a - ta[i]) % TAU) + TAU) % TAU;
        const x = Math.cos(ta[i]) * tr[i];
        const z = Math.sin(ta[i]) * tr[i];
        project(v, x, 0, z);
        const gx = P.x;
        const gy = P.y;
        project(v, x, th[i], z);
        sx[i] = P.x;
        sy[i] = P.y;
        if (since < a - prev) {
          ti[i] = 1;
          glow(tx, i === VULN ? gp : gc, P.x, P.y, i === VULN ? 16 : 9, 1);
        }
        ti[i] *= Math.exp(-dt * 0.8);
        ctx.globalAlpha = 0.2 + 0.55 * ti[i];
        ctx.strokeStyle = GH;
        ctx.beginPath();
        ctx.moveTo(gx - 3, gy);
        ctx.lineTo(gx + 3, gy);
        ctx.moveTo(gx, gy);
        ctx.lineTo(P.x, P.y);
        ctx.stroke();
        const sz = 2.2 + 2.6 * ti[i];
        ctx.globalAlpha = 0.25 + 0.75 * ti[i];
        ctx.fillStyle = i === VULN ? PK : ti[i] > 0.5 ? HOT : CY;
        ctx.fillRect(P.x - sz / 2, P.y - sz / 2, sz, sz);
        if (ti[i] > 0.45) {
          const ring = (1 - ti[i]) * 30 + 4;
          ctx.globalAlpha = (ti[i] - 0.45) * 1.6;
          ctx.strokeStyle = i === VULN ? PK : CY;
          ctx.strokeRect(P.x - ring / 2, P.y - ring / 2, ring, ring);
        }
        const d = (P.x - s.lx) ** 2 + (P.y - s.ly) ** 2;
        if (d < bd) (bd = d), (best = i);
      }
      const k = s.inside ? best : VULN;
      ret.vx += ((sx[k] - ret.x) * 70 - ret.vx * 11) * dt;
      ret.vy += ((sy[k] - ret.y) * 70 - ret.vy * 11) * dt;
      ret.x += ret.vx * dt;
      ret.y += ret.vy * dt;
      const lock = clamp01(1 - Math.hypot(sx[k] - ret.x, sy[k] - ret.y) / 30);
      const r = 8 + 10 * (1 - lock);
      const c = 5;
      ctx.lineWidth = 1.5;
      ctx.globalAlpha = 0.5 + 0.5 * lock;
      ctx.strokeStyle = k === VULN ? PK : HOT;
      ctx.beginPath();
      for (let q = 0; q < 4; q++) {
        const qx = ret.x + (q & 1 ? r : -r);
        const qy = ret.y + (q & 2 ? r : -r);
        const ex = q & 1 ? -c : c;
        const ey = q & 2 ? -c : c;
        ctx.moveTo(qx + ex, qy);
        ctx.lineTo(qx, qy);
        ctx.lineTo(qx, qy + ey);
      }
      ctx.stroke();
    };
  },

  /* Containers stacking into a cluster: image layers drop under gravity, bounce with a little restitution and
     settle; a full stack holds, turns pink, then ships (lifts and fades) and the slot starts over. */
  bars(rnd) {
    const COLS = 5;
    const ROWS = 3;
    const S = COLS * ROWS;
    const MAX = 5;
    const LH = 0.2;
    const by = new Float32Array(S * MAX);
    const bv = new Float32Array(S * MAX);
    const shock = new Float32Array(S * MAX);
    const rest = new Uint8Array(S * MAX);
    const cnt = new Uint8Array(S);
    const ship = new Float32Array(S);
    const sz = new Float32Array(S);
    const ord = new Uint8Array(S).map((_, i) => i);
    const X = (i) => ((i % COLS) - (COLS - 1) / 2) * 0.66;
    const Z = (i) => (((i / COLS) | 0) - (ROWS - 1) / 2) * 0.66;
    for (let i = 0; i < S; i++) {
      cnt[i] = (rnd() * 4) | 0;
      for (let j = 0; j < cnt[i]; j++) (by[i * MAX + j] = j * LH), (rest[i * MAX + j] = 1);
    }
    let spawn = 0;
    return (ctx, s, t, dt) => {
      const { w, h, v } = s;
      view(v, -0.55 + 0.08 * Math.sin(t * 0.17) + s.yaw, 0.46 + s.pit * 0.6, w * 0.5, h * 0.8, Math.min(w * 0.2, h * 0.46), 4.5);
      ctx.lineWidth = 1;
      ctx.strokeStyle = CY;
      ctx.globalAlpha = 0.12;
      ctx.beginPath();
      for (let k = -5; k <= 5; k++) {
        project(v, k * 0.33, 0, -1.3);
        ctx.moveTo(P.x, P.y);
        project(v, k * 0.33, 0, 1.3);
        ctx.lineTo(P.x, P.y);
      }
      for (let k = -4; k <= 4; k++) {
        project(v, -1.75, 0, k * 0.33);
        ctx.moveTo(P.x, P.y);
        project(v, 1.75, 0, k * 0.33);
        ctx.lineTo(P.x, P.y);
      }
      ctx.stroke();
      spawn -= dt * (1 + s.hover * 1.5);
      if (spawn <= 0) {
        spawn = 0.3;
        for (let tries = 0; tries < 8; tries++) {
          const i = (rnd() * S) | 0;
          if (cnt[i] >= MAX || ship[i] > 0) continue;
          const b = i * MAX + cnt[i]++;
          by[b] = cnt[i] * LH + 2.4;
          bv[b] = 0;
          rest[b] = 0;
          break;
        }
      }
      for (let i = 0; i < S; i++) {
        let settled = true;
        for (let j = 0; j < cnt[i]; j++) {
          const b = i * MAX + j;
          shock[b] *= Math.exp(-dt * 5);
          if (rest[b]) continue;
          settled = false;
          bv[b] -= 9.8 * dt;
          by[b] += bv[b] * dt;
          if (by[b] <= j * LH) {
            by[b] = j * LH;
            shock[b] = Math.min(1, Math.abs(bv[b]) * 0.25);
            if (Math.abs(bv[b]) > 0.7) bv[b] *= -0.32;
            else (bv[b] = 0), (rest[b] = 1);
          }
        }
        if (cnt[i] === MAX && settled) ship[i] += dt;
        if (ship[i] > 1.6) (ship[i] = 0), (cnt[i] = 0);
        project(v, X(i), 0, Z(i));
        sz[i] = P.z;
      }
      for (let i = 1; i < S; i++) {
        const o = ord[i];
        let j = i - 1;
        while (j >= 0 && sz[ord[j]] < sz[o]) (ord[j + 1] = ord[j]), j--;
        ord[j + 1] = o;
      }
      let lead = -1;
      for (let i = 0; i < S; i++) if (ship[i] > 0 && (lead < 0 || ship[i] > ship[lead])) lead = i;
      for (let n = 0; n < S; n++) {
        const i = ord[n];
        const lift = ship[i] > 0.9 ? (ship[i] - 0.9) / 0.7 : 0;
        const near = clamp01(0.6 - sz[i] * 0.4);
        ctx.lineWidth = 1 + 0.8 * near;
        for (let j = 0; j < cnt[i]; j++) {
          const b = i * MAX + j;
          if (!rest[b]) {
            ctx.globalAlpha = 0.45;
            ctx.strokeStyle = CY;
            ctx.beginPath();
            for (let q = 0; q <= 4; q++) {
              project(v, X(i) + ((q + 1) & 2 ? 0.25 : -0.25), j * LH, Z(i) + (q & 2 ? 0.25 : -0.25));
              q ? ctx.lineTo(P.x, P.y) : ctx.moveTo(P.x, P.y);
            }
            ctx.stroke();
          }
          const e = (0.35 + 0.55 * near + 0.5 * shock[b]) * (1 - lift);
          const col = i === lead ? PK : ship[i] > 0 || shock[b] > 0.35 ? HOT : CY;
          box(ctx, v, X(i), by[b] + LH * 0.5 + lift * 0.9, Z(i), 0.25, LH * 0.44, 0.25, Math.min(1, e), shock[b] * 0.3 + (ship[i] > 0 ? 0.12 * (1 - lift) : 0), col);
        }
      }
    };
  },
};

/** In-canvas pointer reticle: cross ticks plus a coordinate readout in the panel's own units. */
function reticle(ctx, s) {
  if (s.hover < 0.05 || !s.inside) return;
  const x = Math.round(s.lx) + 0.5;
  const y = Math.round(s.ly) + 0.5;
  ctx.globalAlpha = s.hover;
  ctx.strokeStyle = HOT;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(x - 22, y);
  ctx.lineTo(x - 13, y);
  ctx.moveTo(x + 13, y);
  ctx.lineTo(x + 22, y);
  ctx.moveTo(x, y - 22);
  ctx.lineTo(x, y - 13);
  ctx.moveTo(x, y + 13);
  ctx.lineTo(x, y + 22);
  ctx.stroke();
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.3 * s.hover;
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(s.w, y);
  ctx.moveTo(x, 0);
  ctx.lineTo(x, s.h);
  ctx.stroke();
  ctx.globalAlpha = 0.95 * s.hover;
  ctx.fillStyle = CY;
  ctx.font = '10px "Kode Mono", ui-monospace, monospace';
  ctx.fillText(`${s.mx >= 0 ? '+' : ''}${s.mx.toFixed(2)} ${s.my <= 0 ? '+' : ''}${(-s.my).toFixed(2)}`, x + 16, y - 14);
}

/** Animates every `[data-art]` canvas under `root` while it is on screen. Returns a dispose function. */
export function runServiceArt(root) {
  const items = [...root.querySelectorAll('canvas[data-art]')]
    .filter((c) => ARTS[c.dataset.art])
    .map((c, i) => {
      const card = c.closest('.sa-card') ?? c;
      const tc = document.createElement('canvas');
      const b1 = document.createElement('canvas');
      const b2 = document.createElement('canvas');
      return {
        c,
        ctx: c.getContext('2d'),
        card,
        art: card === c ? null : c.parentElement,
        tilt: false,
        tc,
        tx: tc.getContext('2d'),
        b1,
        b2,
        bx1: b1.getContext('2d'),
        bx2: b2.getContext('2d'),
        draw: ARTS[c.dataset.art](seeded(11 + i * 7919)),
        lit: card.classList.contains('lit'),
        on: false,
        v: {},
        w: 0,
        h: 0,
        dpr: 1,
        inside: false,
        mx: 0,
        my: 0,
        lx: -1e4,
        ly: -1e4,
        hover: 0,
        yaw: 0,
        yv: 0,
        pit: 0,
        pv: 0,
        t: 0,
      };
    });
  const move = (s) => (e) => {
    const r = s.c.getBoundingClientRect();
    s.lx = e.clientX - r.left;
    s.ly = e.clientY - r.top;
    s.mx = Math.max(-1, Math.min(1, (s.lx / r.width) * 2 - 1));
    s.my = Math.max(-1, Math.min(1, (s.ly / r.height) * 2 - 1));
    s.inside = true;
  };
  const leave = (s) => () => {
    s.inside = false;
    s.lx = s.ly = -1e4;
  };
  const handlers = items.map((s) => [s.card, move(s), leave(s)]);
  handlers.forEach(([el, mv, lv]) => (el.addEventListener('pointerenter', mv), el.addEventListener('pointermove', mv), el.addEventListener('pointerleave', lv)));

  /* Cheap bloom: the frame shrunk to a quarter and a twelfth with bilinear filtering, then stretched back over
     itself additively, so hot cores spill a soft halo the way the CRT phosphor on the rest of the page does. */
  const bloom = (s) => {
    const { ctx, b1, b2, bx1, bx2, w, h } = s;
    bx1.clearRect(0, 0, b1.width, b1.height);
    bx1.drawImage(s.c, 0, 0, b1.width, b1.height);
    bx2.clearRect(0, 0, b2.width, b2.height);
    bx2.drawImage(b1, 0, 0, b2.width, b2.height);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.45 + 0.15 * s.hover;
    ctx.drawImage(b1, 0, 0, w, h);
    ctx.globalAlpha = 0.6 + 0.2 * s.hover;
    ctx.drawImage(b2, 0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
  };
  const step = (s, dt) => {
    s.t += dt;
    const ty = s.inside ? s.mx * 0.55 : 0;
    const tp = s.inside ? s.my * 0.28 : 0;
    s.yv += ((ty - s.yaw) * 38 - s.yv * 8) * dt;
    s.yaw += s.yv * dt;
    s.pv += ((tp - s.pit) * 38 - s.pv * 8) * dt;
    s.pit += s.pv * dt;
    s.hover += ((s.inside ? 1 : 0) - s.hover) * Math.min(1, dt * 6);
    const moving = Math.abs(s.yaw) + Math.abs(s.pit) > 2e-4;
    if (s.art && (moving || s.tilt)) {
      s.tilt = moving;
      s.art.style.setProperty('--sa-ry', `${(s.yaw * 7).toFixed(2)}deg`);
      s.art.style.setProperty('--sa-rx', `${(-s.pit * 7).toFixed(2)}deg`);
    }
    s.ctx.globalAlpha = 1;
    s.ctx.clearRect(0, 0, s.w, s.h);
    s.draw(s.ctx, s, s.t, dt);
    bloom(s);
    reticle(s.ctx, s);
  };
  const still = (s) => {
    s.tx.clearRect(0, 0, s.w, s.h);
    for (let k = 0; k < 90; k++) step(s, 1 / 30);
  };
  const fit = (s) => {
    s.dpr = Math.min(devicePixelRatio || 1, 2);
    s.w = s.c.clientWidth;
    s.h = s.c.clientHeight;
    s.c.width = s.tc.width = Math.round(s.w * s.dpr);
    s.c.height = s.tc.height = Math.round(s.h * s.dpr);
    s.b1.width = Math.max(1, Math.round(s.w / 4));
    s.b1.height = Math.max(1, Math.round(s.h / 4));
    s.b2.width = Math.max(1, Math.round(s.w / 12));
    s.b2.height = Math.max(1, Math.round(s.h / 12));
    s.bx1.imageSmoothingQuality = s.bx2.imageSmoothingQuality = 'high';
    s.ctx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    s.tx.setTransform(s.dpr, 0, 0, s.dpr, 0, 0);
    s.tx.globalCompositeOperation = 'lighter';
    if (REDUCED) still(s);
  };
  const ro = new ResizeObserver((es) => es.forEach((e) => fit(items.find((s) => s.c === e.target))));
  const io = new IntersectionObserver((es) => es.forEach((e) => (items.find((s) => s.c === e.target).on = e.isIntersecting)));
  items.forEach((s) => (ro.observe(s.c), io.observe(s.c)));

  let raf = 0;
  let last = performance.now();
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    for (const s of items) if (s.on && s.w) step(s, dt);
  };
  if (!REDUCED) raf = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(raf);
    io.disconnect();
    ro.disconnect();
    handlers.forEach(([el, mv, lv]) => (el.removeEventListener('pointerenter', mv), el.removeEventListener('pointermove', mv), el.removeEventListener('pointerleave', lv)));
  };
}
