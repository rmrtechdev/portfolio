const CYAN = '8,253,216';
const PINK = '255,105,180';

function seeded(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}

function backdrop(ctx, w, h, t, scan) {
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = `rgba(${CYAN},.06)`;
  ctx.lineWidth = 1;
  for (let x = 0; x < w; x += 24) ctx.strokeRect(x + 0.5, -1, 0, h + 2);
  for (let y = 0; y < h; y += 24) ctx.strokeRect(-1, y + 0.5, w + 2, 0);
  if (!scan) return;
  const bx = w * (0.08 + 0.7 * (0.5 + 0.5 * Math.sin(t * 0.21)));
  const by = h * (0.1 + 0.55 * (0.5 + 0.5 * Math.cos(t * 0.17)));
  ctx.strokeStyle = `rgba(${PINK},.55)`;
  ctx.strokeRect(bx, by, 54, 32);
  ctx.fillStyle = `rgba(${PINK},.05)`;
  ctx.fillRect(bx, by, 54, 32);
}

const ARTS = {
  // Request packets travel along lanes into a server node.
  flow(ctx, w, h, t) {
    const cx = w * 0.72;
    const cy = h * 0.5;
    ctx.strokeStyle = `rgba(${CYAN},.9)`;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - 26, cy - 40, 52, 80);
    for (let i = 0; i < 4; i++) ctx.strokeRect(cx - 18, cy - 32 + i * 18, 36, 10);
    for (let lane = 0; lane < 6; lane++) {
      const y = h * 0.18 + lane * h * 0.13;
      ctx.strokeStyle = `rgba(${CYAN},.25)`;
      ctx.beginPath();
      ctx.moveTo(w * 0.06, y);
      ctx.bezierCurveTo(w * 0.4, y, w * 0.45, cy, cx - 26, cy);
      ctx.stroke();
      const p = (t * 0.35 + lane * 0.17) % 1;
      const x = w * 0.06 + (cx - 26 - w * 0.06) * p;
      const yy = y + (cy - y) * p * p;
      ctx.fillStyle = lane % 3 === 0 ? '#fff' : `rgba(${PINK},1)`;
      ctx.fillRect(x - 2, yy - 2, 4, 4);
    }
  },
  // A node graph that keeps re-wiring.
  graph(ctx, w, h, t) {
    const rnd = seeded(7);
    const nodes = Array.from({ length: 22 }, () => [rnd(), rnd(), rnd() * 6]);
    const pos = nodes.map(([x, y, p]) => [w * (0.15 + 0.7 * x) + Math.sin(t + p) * 8, h * (0.15 + 0.7 * y) + Math.cos(t * 0.8 + p) * 6]);
    ctx.lineWidth = 1;
    pos.forEach((a, i) =>
      pos.forEach((b, j) => {
        if (j <= i) return;
        const d = Math.hypot(a[0] - b[0], a[1] - b[1]);
        if (d > w * 0.24) return;
        ctx.strokeStyle = `rgba(${CYAN},${(0.55 * (1 - d / (w * 0.24))).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(...a);
        ctx.lineTo(...b);
        ctx.stroke();
      })
    );
    pos.forEach(([x, y], i) => {
      ctx.fillStyle = i % 5 === 0 ? '#fff' : `rgba(${PINK},1)`;
      ctx.fillRect(x - 2, y - 2, 4, 4);
    });
  },
  // Wireframe hemisphere with speed lines: fast front ends.
  hemisphere(ctx, w, h, t) {
    const cx = w * 0.5;
    const cy = h * 0.5;
    const R = h * 0.36;
    ctx.strokeStyle = `rgba(${CYAN},.95)`;
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 5; i++) {
      const k = (i / 4 + t * 0.15) % 1;
      ctx.beginPath();
      ctx.ellipse(cx - R * 0.2, cy, R * k * 0.9 + 2, R, 0, Math.PI / 2, (Math.PI * 3) / 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - R * 0.2, cy - R);
    ctx.lineTo(cx - R * 0.2, cy + R);
    ctx.stroke();
    for (let i = 0; i < 7; i++) {
      const y = cy - R * 0.85 + (i * R * 1.7) / 6;
      const len = w * (0.18 + 0.12 * Math.sin(t * 2 + i));
      ctx.strokeStyle = `rgba(${CYAN},.7)`;
      ctx.beginPath();
      ctx.moveTo(cx - R * 0.2, y);
      ctx.lineTo(cx - R * 0.2 + len, y);
      ctx.stroke();
    }
  },
  // Dotted sphere with a sweeping scan band: real-time 3D.
  dotsphere(ctx, w, h, t) {
    const cx = w * 0.5;
    const cy = h * 0.52;
    const R = h * 0.36;
    const band = Math.sin(t * 0.8) * R;
    for (let lat = -80; lat <= 80; lat += 8) {
      const y = Math.sin((lat * Math.PI) / 180);
      const r = Math.cos((lat * Math.PI) / 180);
      for (let lon = 0; lon < 360; lon += 8) {
        const a = ((lon + t * 20) * Math.PI) / 180;
        const z = Math.sin(a) * r;
        if (z < 0) continue;
        const px = cx + Math.cos(a) * r * R;
        const py = cy - y * R;
        const glow = Math.exp(-Math.abs(py - (cy + band)) / 8);
        ctx.fillStyle = `rgba(${(8 + glow * 247) | 0},${(253 - glow * 148) | 0},${(216 - glow * 36) | 0},${(0.25 + 0.75 * z) * (0.5 + glow)})`;
        ctx.fillRect(px, py, 2, 2);
      }
    }
    ctx.strokeStyle = `rgba(${CYAN},.6)`;
    ctx.beginPath();
    ctx.moveTo(0, cy + band);
    ctx.lineTo(w, cy + band);
    ctx.stroke();
  },
  // Radar sweep picking up blips: security.
  radar(ctx, w, h, t) {
    const cx = w * 0.5;
    const cy = h * 0.52;
    const R = h * 0.4;
    ctx.strokeStyle = `rgba(${CYAN},.35)`;
    for (let i = 1; i <= 3; i++) {
      ctx.beginPath();
      ctx.arc(cx, cy, (R * i) / 3, 0, Math.PI * 2);
      ctx.stroke();
    }
    const a = t * 1.4;
    const grd = ctx.createConicGradient(a - 0.9, cx, cy);
    grd.addColorStop(0, 'rgba(8,253,216,0)');
    grd.addColorStop(0.14, 'rgba(8,253,216,.35)');
    grd.addColorStop(0.15, 'rgba(8,253,216,0)');
    ctx.fillStyle = grd;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();
    const rnd = seeded(3);
    for (let i = 0; i < 9; i++) {
      const ba = rnd() * Math.PI * 2;
      const br = R * (0.2 + rnd() * 0.75);
      const since = (((a - ba) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      ctx.fillStyle = i % 4 === 0 ? `rgba(255,255,255,${Math.max(0, 1 - since)})` : `rgba(${PINK},${Math.max(0.1, 1 - since / 2)})`;
      ctx.fillRect(cx + Math.cos(ba) * br - 2, cy + Math.sin(ba) * br - 2, 4, 4);
    }
  },
  // Containers stacking into a rising bar chart: same build everywhere.
  bars(ctx, w, h, t) {
    const n = 14;
    const bw = (w * 0.8) / n;
    for (let i = 0; i < n; i++) {
      const target = 0.15 + (i / n) * 0.65 + 0.08 * Math.sin(i * 1.7);
      const v = target * (0.75 + 0.25 * Math.sin(t * 1.2 + i * 0.5));
      const bh = h * 0.8 * v;
      const x = w * 0.1 + i * bw;
      const cells = Math.floor(bh / 8);
      for (let c = 0; c < cells; c++) {
        ctx.fillStyle = c === cells - 1 ? '#fff' : `rgba(${CYAN},${0.35 + (0.65 * c) / cells})`;
        ctx.fillRect(x + 2, h * 0.9 - (c + 1) * 8, bw - 4, 6);
      }
    }
  },
};

/** Animates every `[data-art]` canvas under `root` while it is on screen. Returns a dispose function. */
export function runServiceArt(root) {
  const items = [...root.querySelectorAll('canvas[data-art]')].map((c) => ({ c, ctx: c.getContext('2d'), art: ARTS[c.dataset.art], on: false }));
  // One scan box on the whole grid: in the hovered card, else in the card nearest the viewport centre.
  let hovered = null;
  const cards = items.map((i) => i.c.closest('.sa-card') ?? i.c);
  const enter = (i) => () => (hovered = i);
  const leave = (i) => () => hovered === i && (hovered = null);
  const handlers = items.map((i, k) => [cards[k], enter(i), leave(i)]);
  handlers.forEach(([el, on, off]) => (el.addEventListener('pointerenter', on), el.addEventListener('pointerleave', off)));
  const io = new IntersectionObserver((es) => es.forEach((e) => (items.find((i) => i.c === e.target).on = e.isIntersecting)));
  items.forEach((i) => io.observe(i.c));
  const fit = () =>
    items.forEach(({ c, ctx }) => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      c.width = c.clientWidth * dpr;
      c.height = c.clientHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    });
  fit();
  addEventListener('resize', fit);
  let raf;
  const t0 = performance.now();
  const loop = (now) => {
    raf = requestAnimationFrame(loop);
    const t = (now - t0) / 1000;
    let active = hovered;
    if (!active) {
      let best = Infinity;
      for (const i of items) {
        if (!i.on) continue;
        const r = i.c.getBoundingClientRect();
        const d = Math.abs((r.top + r.bottom) / 2 - innerHeight / 2);
        if (d < best) (best = d), (active = i);
      }
    }
    for (const item of items) {
      if (!item.on) continue;
      const { c, ctx, art } = item;
      backdrop(ctx, c.clientWidth, c.clientHeight, t, item === active);
      art(ctx, c.clientWidth, c.clientHeight, t);
    }
  };
  raf = requestAnimationFrame(loop);
  return () => {
    cancelAnimationFrame(raf);
    io.disconnect();
    removeEventListener('resize', fit);
    handlers.forEach(([el, on, off]) => (el.removeEventListener('pointerenter', on), el.removeEventListener('pointerleave', off)));
  };
}
