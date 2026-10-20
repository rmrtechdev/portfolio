import { useEffect, useRef, useState } from 'react';
import { COARSE, REDUCED, ar } from '../env';
import { SECTIONS } from '../chrome/Chrome';

// Blur then alpha-threshold: rounds glyph corners into the "melted" display type.
const thresh = (id, blur, slope, offset) => (
  <filter id={id} x="-25%" y="-25%" width="150%" height="150%" colorInterpolationFilters="sRGB">
    <feGaussianBlur stdDeviation={blur} result="soft" />
    <feColorMatrix in="soft" type="matrix" values={`1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 ${slope} ${offset}`} />
  </filter>
);

export function FxDefs() {
  useEffect(() => {
    if (REDUCED) return;
    const turb = document.getElementById('meltTurb');
    const t0 = performance.now();
    let raf;
    const wave = () => {
      const t = (performance.now() - t0) / 1000;
      turb.setAttribute(
        'baseFrequency',
        `${(0.004 + Math.sin(t * 0.45) * 0.0022).toFixed(5)} ${(0.028 + Math.cos(t * 0.32) * 0.009).toFixed(5)}`
      );
      raf = requestAnimationFrame(wave);
    };
    raf = requestAnimationFrame(wave);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
      <defs>
        {thresh('thresh', 0.45, 7, -2.8)}
        {thresh('threshStrong', 0.55, 8, -3.2)}
        {thresh('threshXStrong', 0.8, 16, -7)}
        {thresh('threshHover', 0.65, 8, -3.4)}
        <filter id="meltWave" x="-20%" y="-20%" width="140%" height="140%">
          <feTurbulence id="meltTurb" type="fractalNoise" baseFrequency="0.004 0.028" numOctaves="2" seed="7" result="n" />
          <feDisplacementMap in="SourceGraphic" in2="n" scale="46" xChannelSelector="R" yChannelSelector="G" />
        </filter>
        <filter id="redOnly" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="1 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 1 0" />
        </filter>
        <filter id="cyanOnly" colorInterpolationFilters="sRGB">
          <feColorMatrix type="matrix" values="0 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 1 0" />
        </filter>
      </defs>
    </svg>
  );
}

export function RgbBlur() {
  return (
    <div className="rgb-blur" aria-hidden="true">
      <div className="b" />
      <div className="b2" />
      <div className="rgb" />
    </div>
  );
}

/** Edge falloff over the world but under the page, so the room and strands recede while copy stays lit. */
export function Vignette() {
  return <div className="vignette" aria-hidden="true" />;
}

// [selector, rate]: far layers that lag the scroll on the way in. Marquees stay out: they butt against the
// bands either side of them (the game right after the first one), so any offset would push into a neighbour.
const LAYERS = [['.section > .head', -0.22]];
// Hero UI lifts away at its own rates as the first screen scrolls off. The links and the kicker stay out: on
// phones the lag left them hanging over About after the hero had gone.
const HERO = [
  ['.hero-ring', 0.5],
  ['.hud-toggle', 0.12],
];

/**
 * Glass in front of everything (scanlines, grain, edge fringe, two slow light shafts), a scene cut on each
 * section change (with the new section's name sweeping past out of focus, in front of the page), and the
 * page's parallax. Parallax writes the `translate` property only: World.jsx owns
 * `transform` on the heads and marquees in AR, and AR turns parallax off.
 */
export function Atmosphere() {
  const root = useRef(null);
  const fore = useRef(null);
  useEffect(() => {
    if (REDUCED) return;
    const el = root.current;
    let last;
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (!e.isIntersecting || e.target.id === last) return;
          // Stack's pinned scene opens on its own signal tear; a cut on top of it muddies both.
          if (last && e.target.id !== 'services') {
            const name = SECTIONS.find(([id]) => id === e.target.id)[1];
            fore.current.querySelectorAll('span').forEach((n) => (n.textContent = name));
            el.classList.remove('cut');
            void el.offsetWidth;
            el.classList.add('cut');
          }
          last = e.target.id;
        }),
      { rootMargin: '-45% 0px -50% 0px' }
    );
    SECTIONS.forEach(([id]) => io.observe(document.getElementById(id)));

    let items = [];
    let hero = [];
    let raf = 0;
    let parked = false;
    // offsetTop, not the bounding box: the box includes the .rise entrance and the AR turn.
    const top = (n) => (n ? n.offsetTop + top(n.offsetParent) : 0);
    const measure = () => {
      items = LAYERS.flatMap(([sel, k]) =>
        [...document.querySelectorAll(sel)].map((n) => ({ el: n, k, mid: top(n) + n.offsetHeight / 2 }))
      );
      hero = HERO.flatMap(([sel, k]) => [...document.querySelectorAll(`.hero ${sel}`)].map((n) => ({ el: n, k })));
      raf ||= requestAnimationFrame(update);
    };
    const update = () => {
      raf = 0;
      if (ar.on) {
        if (!parked) [...items, ...hero].forEach((it) => (it.el.style.translate = it.el.style.opacity = ''));
        parked = true;
        return;
      }
      parked = false;
      const y = scrollY;
      const c = y + innerHeight / 2;
      for (const it of items) {
        // Settles by the screen's centre, so a head never sinks into the content under it (Stack's pinned
        // scene starts right after its head).
        const d = Math.max(0, it.mid - c);
        if (Math.abs(d) < innerHeight * 1.5) it.el.style.translate = `0 ${(d * it.k).toFixed(1)}px`;
      }
      const h = Math.min(y, innerHeight);
      for (const it of hero) {
        it.el.style.translate = `0 ${(-h * it.k).toFixed(1)}px`;
        it.el.style.opacity = Math.max(0, 1 - (h / innerHeight) * 1.6).toFixed(3);
      }
    };
    const onScroll = () => (raf ||= requestAnimationFrame(update));
    const ro = new ResizeObserver(measure);
    ro.observe(document.body);
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('rmr-ar', measure);
    return () => {
      io.disconnect();
      ro.disconnect();
      cancelAnimationFrame(raf);
      removeEventListener('scroll', onScroll);
      removeEventListener('rmr-ar', measure);
    };
  }, []);
  return (
    <div className="atmo" ref={root} aria-hidden="true">
      <i className="atmo-shaft" />
      <i className="atmo-scan" />
      <i className="atmo-grain" />
      <i className="atmo-fringe" />
      <i className="atmo-dim" />
      <i className="atmo-wipe" />
      <b className="atmo-fore" ref={fore}>
        <span className="f-smear" />
        <span className="f-rim" />
        <span className="f-rim2" />
        <span className="f-body" />
      </b>
    </div>
  );
}

const HOT_TARGET = 'a, button, input, textarea, label, [role="button"], .moving, .svc-stage, .snake-overlay';

/**
 * Cyan/pink reticle pair trailing the native pointer; they split apart and skew with pointer speed.
 * The native cursor stays visible so section cursors (crosshair, grab, ew-resize) keep their meaning.
 */
export function GlitchCursor() {
  const cyan = useRef(null);
  const pink = useRef(null);
  const light = useRef(null);
  useEffect(() => {
    if (COARSE || REDUCED) return;
    const p = { x: -100, y: -100 };
    const c = { x: -100, y: -100 };
    let hot = false;
    let raf;
    const onMove = (e) => {
      p.x = e.clientX;
      p.y = e.clientY;
      hot = !!e.target.closest?.(HOT_TARGET) || document.body.style.cursor === 'pointer';
    };
    const onLeave = () => (p.x = p.y = c.x = c.y = -100);
    const loop = () => {
      raf = requestAnimationFrame(loop);
      c.x += (p.x - c.x) * 0.32;
      c.y += (p.y - c.y) * 0.32;
      const dx = p.x - c.x;
      const dy = p.y - c.y;
      const dist = Math.hypot(dx, dy);
      const speed = Math.min(32, dist);
      const k = dist ? ((speed / 32) * 9) / dist : 0;
      const skew = Math.max(-9, Math.min(9, dx * 0.3));
      const scale = hot ? 1.7 : 1;
      cyan.current.style.transform = `translate3d(${c.x - dx * k}px,${c.y - dy * k}px,0) skewX(${skew}deg) scale(${scale})`;
      pink.current.style.transform = `translate3d(${c.x + dx * k}px,${c.y + dy * k}px,0) skewX(${-skew}deg) scale(${scale})`;
      pink.current.style.opacity = hot ? 1 : 0.25 + (speed / 32) * 0.75;
      light.current.style.transform = `translate3d(${c.x}px,${c.y}px,0)`;
    };
    addEventListener('pointermove', onMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', onLeave);
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('pointermove', onMove);
      document.documentElement.removeEventListener('pointerleave', onLeave);
    };
  }, []);
  if (COARSE || REDUCED) return null;
  return (
    <div className="gcursor" aria-hidden="true">
      <i ref={cyan} />
      <i ref={pink} />
      <b ref={light} />
    </div>
  );
}

/**
 * Canvas overlay that draws a fading stroke behind the pointer inside its parent.
 * `color` is an "r,g,b" triple; a wide stroke in the text colour reads as an eraser.
 */
export function Trail({ color = '255,255,255', width = 1, life = 700 }) {
  const ref = useRef(null);
  useEffect(() => {
    if (COARSE || REDUCED) return;
    const cv = ref.current;
    const host = cv.parentElement;
    const ctx = cv.getContext('2d');
    const pts = [];
    let raf = 0;
    let visible = false;
    const fit = () => {
      const r = host.getBoundingClientRect();
      cv.width = r.width;
      cv.height = r.height;
    };
    const onMove = (e) => {
      const r = host.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      if (x >= 0 && y >= 0 && x <= r.width && y <= r.height) pts.push({ x, y, t: performance.now() });
    };
    const loop = () => {
      raf = requestAnimationFrame(loop);
      if (!visible) return;
      const now = performance.now();
      while (pts.length && now - pts[0].t > life) pts.shift();
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.lineCap = ctx.lineJoin = 'round';
      ctx.lineWidth = width;
      for (let i = 1; i < pts.length; i++) {
        ctx.strokeStyle = `rgba(${color},${(1 - (now - pts[i].t) / life).toFixed(3)})`;
        ctx.beginPath();
        ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
        ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
    };
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(host);
    const ro = new ResizeObserver(fit);
    ro.observe(host);
    addEventListener('pointermove', onMove, { passive: true });
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      removeEventListener('pointermove', onMove);
    };
  }, []);
  return <canvas ref={ref} className="trail" aria-hidden="true" />;
}

/** Glitch-in dialog that types `box.text`; closes on ×, Escape, or a click outside. */
export function GlitchBox({ box, onClose }) {
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState('in');
  useEffect(() => {
    if (!box) return;
    setPhase('in');
    let raf;
    const t0 = performance.now();
    const step = (now) => {
      const n = REDUCED ? box.text.length : Math.min(box.text.length, Math.floor((now - t0) / 10));
      setTyped(box.text.slice(0, n) + (n < box.text.length ? '▌' : ''));
      if (n < box.text.length) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const onKey = (e) => e.key === 'Escape' && setPhase('out');
    addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('keydown', onKey);
    };
  }, [box]);
  useEffect(() => {
    if (phase !== 'out') return;
    const id = setTimeout(onClose, 500);
    return () => clearTimeout(id);
  }, [phase]);
  if (!box) return null;
  return (
    <div className="gbox-scrim" onClick={() => setPhase('out')}>
      <div className={`gbox ${phase}`} role="dialog" aria-label={box.title} onClick={(e) => e.stopPropagation()}>
        <button className="gbox-x" onClick={() => setPhase('out')} aria-label="Close" autoFocus>×</button>
        <span className="gbox-t">{box.title} /</span>
        <span className="gbox-d">{typed}</span>
      </div>
    </div>
  );
}
