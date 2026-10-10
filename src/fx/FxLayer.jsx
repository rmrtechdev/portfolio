import { useEffect, useRef } from 'react';
import { COARSE, REDUCED } from '../env';

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

const HOT_TARGET = 'a, button, input, textarea, label, [role="button"], .moving, .svc-stage, .snake-overlay';

/**
 * Cyan/pink reticle pair trailing the native pointer; they split apart and skew with pointer speed.
 * The native cursor stays visible so section cursors (crosshair, grab, ew-resize) keep their meaning.
 */
export function GlitchCursor() {
  const cyan = useRef(null);
  const pink = useRef(null);
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
