import { useEffect, useRef, useState } from 'react';
import { REDUCED } from '../env';

export function useInView(options) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), options);
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return [ref, inView];
}

/** Types `text` one character at a time with a block cursor. Starts when `start` turns true. */
export function useTypewriter(text, { start = true, speed = 40, from = 0 } = {}) {
  const [n, setN] = useState(REDUCED ? text.length : from);
  useEffect(() => {
    if (!start || REDUCED) return;
    setN(from);
    let i = from;
    const id = setInterval(() => {
      i += 1;
      setN(i);
      if (i >= text.length) clearInterval(id);
    }, speed);
    return () => clearInterval(id);
  }, [start, text]);
  const done = n >= text.length;
  return { shown: text.slice(0, n) + (done ? '' : '█'), done };
}

/** Typewriter that starts the first time `ref` scrolls into view and never replays. */
export function useTypeOnView(text, opts = {}) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { rootMargin: '0px 0px -12% 0px' }
    );
    io.observe(ref.current);
    return () => io.disconnect();
  }, []);
  return [ref, useTypewriter(text, { ...opts, start: seen })];
}

const GLYPHS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';

/** Scrambles each glyph of `el` for ~0.7 s, settling left to right, without changing layout. */
export function scramble(el) {
  if (REDUCED || !el || el.dataset.scrambling) return;
  const original = el.textContent;
  el.dataset.scrambling = '1';
  const settle = [...original].map((_, i) => 120 + i * 22 + Math.random() * 80);
  const t0 = performance.now();
  const id = setInterval(() => {
    const t = performance.now() - t0;
    el.textContent = [...original]
      .map((ch, i) => (ch === ' ' || t >= settle[i] ? ch : GLYPHS[(Math.random() * GLYPHS.length) | 0]))
      .join('');
    if (t > settle[settle.length - 1]) {
      clearInterval(id);
      el.textContent = original;
      delete el.dataset.scrambling;
    }
  }, 45);
}
