import { useEffect, useRef, useState } from 'react';
import { PROJECTS } from '../data';

// Light-UI screenshots flatten into a solid slab under the duotone, so only dark posters rotate here.
const SLIDES = PROJECTS.filter((p) => p.subject !== 'CHATROOM');
import { COARSE, pad } from '../env';
import { Trail } from '../fx/FxLayer';

const CELL = 20;
const CYAN = '#08fdd8';
const PINK = '#ff69b4';
const BG = '#050505';
const GRID = '#141414';
const BEST_KEY = 'rmr_stackrun_best';
const KEYS = {
  ArrowUp: [0, -1], KeyW: [0, -1],
  ArrowDown: [0, 1], KeyS: [0, 1],
  ArrowLeft: [-1, 0], KeyA: [-1, 0],
  ArrowRight: [1, 0], KeyD: [1, 0],
};
const FOOD = {
  red: { score: 1, grow: 1, color: PINK },
  gold: { score: 3, grow: 2, color: '#ffc21a' },
  blue: { score: 1, grow: 1, color: '#3a78ff' },
  poison: { score: -2, grow: -2, color: '#a855f7' },
};

function readBest() {
  try {
    return parseInt(localStorage.getItem(BEST_KEY) || '0', 10) || 0;
  } catch {
    return 0;
  }
}

function beep(audio, freq, dur) {
  try {
    audio.ctx ||= new AudioContext();
    const ctx = audio.ctx;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.value = freq;
    g.gain.value = 0.0001;
    o.connect(g).connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.028, ctx.currentTime + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
    o.stop(ctx.currentTime + dur + 0.02);
  } catch {}
}

export default function Snake() {
  const cv = useRef(null);
  const band = useRef(null);
  const [mode, setMode] = useState('idle');
  const [hud, setHud] = useState({ score: 0, best: readBest(), level: 1, combo: 1 });
  const [slide, setSlide] = useState(0);
  const game = useRef(null);
  const audio = useRef({});
  const rows = COARSE && innerWidth < 760 ? 24 : 15;
  const cols = COARSE && innerWidth < 760 ? 18 : 50;

  useEffect(() => {
    if (mode !== 'idle' && mode !== 'over') return;
    const id = setInterval(() => setSlide((s) => (s + 1) % SLIDES.length), 5000);
    return () => clearInterval(id);
  }, [mode]);

  useEffect(() => {
    if (mode !== 'play') return;
    const ctx = cv.current.getContext('2d');
    const g = game.current;
    let raf;
    let last = performance.now();
    let acc = 0;
    let visible = true;
    const io = new IntersectionObserver(([e]) => (visible = e.isIntersecting));
    io.observe(band.current);

    const free = (x, y, size) => {
      for (let yy = y; yy < y + size; yy++)
        for (let xx = x; xx < x + size; xx++) {
          if (xx < 0 || yy < 0 || xx >= cols || yy >= rows) return false;
          if (g.snake.some((s) => s.x === xx && s.y === yy)) return false;
          if (g.foods.some((f) => xx >= f.x && xx < f.x + f.size && yy >= f.y && yy < f.y + f.size)) return false;
        }
      return true;
    };
    const addFood = (forced) => {
      const r = Math.random();
      const type = forced || (r > 0.9 ? 'poison' : r > 0.78 ? 'blue' : r > 0.62 ? 'gold' : 'red');
      const size = type === 'red' ? 2 : 1;
      let x;
      let y;
      let tries = 0;
      do {
        x = (Math.random() * (cols - size)) | 0;
        y = (Math.random() * (rows - size)) | 0;
      } while (!free(x, y, size) && ++tries < 400);
      g.foods.push({ x, y, type, size, born: performance.now() });
    };
    if (!g.foods.length) {
      addFood('red');
      addFood();
    }

    const onKey = (e) => {
      if (e.code === 'Escape') return setMode('idle');
      if (e.code === 'Space') {
        e.preventDefault();
        g.paused = !g.paused;
        return;
      }
      const d = KEYS[e.code];
      if (!d) return;
      e.preventDefault();
      if (d[0] !== -g.dir[0] || d[1] !== -g.dir[1]) g.next = d;
    };
    const onTouchStart = (e) => (g.touch = { x: e.touches[0].clientX, y: e.touches[0].clientY });
    const onTouchEnd = (e) => {
      if (!g.touch) return;
      const dx = e.changedTouches[0].clientX - g.touch.x;
      const dy = e.changedTouches[0].clientY - g.touch.y;
      g.touch = null;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return (g.paused = !g.paused);
      const d = Math.abs(dx) > Math.abs(dy) ? [Math.sign(dx), 0] : [0, Math.sign(dy)];
      if (d[0] !== -g.dir[0] || d[1] !== -g.dir[1]) g.next = d;
    };
    addEventListener('keydown', onKey);
    cv.current.addEventListener('touchstart', onTouchStart, { passive: true });
    cv.current.addEventListener('touchend', onTouchEnd, { passive: true });

    const step = (now) => {
      g.dir = g.next;
      const head = { x: g.snake[0].x + g.dir[0], y: g.snake[0].y + g.dir[1] };
      if (head.x < 0 || head.y < 0 || head.x >= cols || head.y >= rows || g.snake.some((s) => s.x === head.x && s.y === head.y)) {
        beep(audio.current, 90, 0.35);
        g.dead = true;
        const best = Math.max(g.score, readBest());
        try {
          localStorage.setItem(BEST_KEY, String(best));
        } catch {}
        setHud((h) => ({ ...h, best }));
        setMode('over');
        return;
      }
      g.snake.unshift(head);
      const fi = g.foods.findIndex((f) => head.x >= f.x && head.x < f.x + f.size && head.y >= f.y && head.y < f.y + f.size);
      if (fi >= 0) {
        const f = g.foods.splice(fi, 1)[0];
        const kind = FOOD[f.type];
        g.combo = now - g.lastEat < 1600 && kind.score > 0 ? Math.min(g.combo + 1, 5) : 1;
        g.lastEat = now;
        g.score = Math.max(0, g.score + kind.score * (kind.score > 0 ? g.combo : 1));
        g.grow += kind.grow;
        if (f.type === 'blue') g.slowUntil = now + 4000;
        g.level = 1 + Math.floor(g.score / 5);
        const cx = (f.x + f.size / 2) * CELL;
        const cy = (f.y + f.size / 2) * CELL;
        for (let i = 0; i < 14; i++) {
          const a = Math.random() * Math.PI * 2;
          g.particles.push({ x: cx, y: cy, vx: Math.cos(a) * (1 + Math.random() * 3), vy: Math.sin(a) * (1 + Math.random() * 3), life: 1, color: kind.color });
        }
        g.ripples.push({ x: cx, y: cy, r: 2, life: 1, color: kind.color });
        beep(audio.current, f.type === 'poison' ? 140 : 520 + g.combo * 90, 0.08);
        addFood(f.type === 'red' ? undefined : 'red');
        if (g.foods.length < 3 && Math.random() < 0.5) addFood();
        setHud((h) => ({ ...h, score: g.score, level: g.level, combo: g.combo }));
      }
      if (g.grow > 0) g.grow--;
      else {
        g.snake.pop();
        while (g.grow < 0 && g.snake.length > 2) {
          g.snake.pop();
          g.grow++;
        }
        g.grow = Math.max(g.grow, 0);
      }
    };

    const draw = (now) => {
      ctx.fillStyle = BG;
      ctx.fillRect(0, 0, cols * CELL, rows * CELL);
      ctx.fillStyle = GRID;
      for (let x = 0; x <= cols; x++) ctx.fillRect(x * CELL, 0, 1, rows * CELL);
      for (let y = 0; y <= rows; y++) ctx.fillRect(0, y * CELL, cols * CELL, 1);
      for (const f of g.foods) {
        const pulse = 0.85 + Math.sin((now - f.born) / 160) * 0.15;
        const x = f.x * CELL;
        const y = f.y * CELL;
        const s = f.size * CELL;
        if (f.type === 'poison') {
          ctx.strokeStyle = FOOD.poison.color;
          ctx.lineWidth = 2;
          ctx.strokeRect(x + 4, y + 4, s - 8, s - 8);
          ctx.beginPath();
          ctx.moveTo(x + 7, y + 7);
          ctx.lineTo(x + s - 7, y + s - 7);
          ctx.moveTo(x + s - 7, y + 7);
          ctx.lineTo(x + 7, y + s - 7);
          ctx.stroke();
          continue;
        }
        ctx.fillStyle = FOOD[f.type].color;
        ctx.globalAlpha = pulse;
        ctx.fillRect(x + 3, y + 3, s - 6, s - 6);
        ctx.globalAlpha = 1;
        if (f.type === 'red') {
          ctx.fillStyle = '#39ff5a';
          ctx.fillRect(x + s / 2, y + 1, 4, 5);
        }
      }
      g.snake.forEach((s, i) => {
        const t = i / Math.max(1, g.snake.length - 1);
        ctx.fillStyle = i === 0 ? '#fff' : `rgb(${8 - t * 6},${253 - t * 150},${216 - t * 128})`;
        if (i === 0) {
          ctx.save();
          ctx.shadowColor = CYAN;
          ctx.shadowBlur = 14;
        }
        ctx.fillRect(s.x * CELL + 2, s.y * CELL + 2, CELL - 4, CELL - 4);
        if (i === 0) {
          ctx.restore();
          ctx.strokeStyle = CYAN;
          ctx.lineWidth = 2;
          ctx.strokeRect(s.x * CELL + 5, s.y * CELL + 5, CELL - 10, CELL - 10);
        }
      });
      g.particles = g.particles.filter((p) => (p.life -= 0.03) > 0);
      for (const p of g.particles) {
        p.x += p.vx;
        p.y += p.vy;
        ctx.globalAlpha = p.life;
        ctx.fillStyle = p.color;
        ctx.fillRect(p.x, p.y, 3, 3);
      }
      g.ripples = g.ripples.filter((r) => (r.life -= 0.025) > 0);
      for (const r of g.ripples) {
        r.r += 1.6;
        ctx.globalAlpha = r.life;
        ctx.strokeStyle = r.color;
        ctx.lineWidth = 1;
        ctx.strokeRect(r.x - r.r, r.y - r.r, r.r * 2, r.r * 2);
      }
      ctx.globalAlpha = 1;
      if (g.paused) {
        ctx.fillStyle = 'rgba(0,0,0,.6)';
        ctx.fillRect(0, 0, cols * CELL, rows * CELL);
      }
    };

    const loop = (now) => {
      raf = requestAnimationFrame(loop);
      const dt = Math.min(now - last, 100);
      last = now;
      if (!visible || g.paused) return draw(now);
      const stepMs = Math.max(55, 110 - (g.level - 1) * 7) * (now < g.slowUntil ? 1.8 : 1);
      acc += dt;
      while (acc >= stepMs) {
        acc -= stepMs;
        step(now);
        if (game.current.dead) return;
      }
      draw(now);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      removeEventListener('keydown', onKey);
      cv.current?.removeEventListener('touchstart', onTouchStart);
      cv.current?.removeEventListener('touchend', onTouchEnd);
    };
  }, [mode]);

  const start = () => {
    const y = (rows / 2) | 0;
    game.current = {
      snake: [{ x: 6, y }, { x: 5, y }, { x: 4, y }],
      dir: [1, 0],
      next: [1, 0],
      foods: [],
      particles: [],
      ripples: [],
      score: 0,
      level: 1,
      combo: 1,
      grow: 0,
      lastEat: 0,
      slowUntil: 0,
      paused: false,
    };
    setHud((h) => ({ ...h, score: 0, level: 1, combo: 1 }));
    setMode('play');
    band.current.focus({ preventScroll: true });
  };

  const playLabel = mode === 'over' ? `Game over — ${pad(hud.score)} · play again →` : 'Play game →';
  return (
    <section className="snake" ref={band} tabIndex={-1} aria-label="Stack Run mini game">
      <header className="snake-hud nav-font">
        <span className="snake-rule" aria-hidden="true" />
        <span>› Stack run</span>
        <span>Score <b>{pad(hud.score)}</b></span>
        <span>/ Best <b>{pad(hud.best)}</b></span>
        {mode === 'play' && (
          <>
            <span>Lvl <b>{pad(hud.level)}</b></span>
            <span>×{hud.combo}</span>
          </>
        )}
      </header>
      <div className="snake-stage">
        <canvas ref={cv} width={cols * CELL} height={rows * CELL} />
        {mode !== 'play' && (
          <div className="snake-overlay" onClick={(e) => e.target === e.currentTarget && setSlide((slide + 1) % SLIDES.length)}>
            {SLIDES.map((p, i) => (
              <img key={p.title} src={p.poster} alt="" loading="lazy" decoding="async" className={i === slide ? 'on' : undefined} />
            ))}
            <button className="snake-play nav-font cybr" onClick={start} data-text={playLabel}>
              {playLabel}
            </button>
            <p className="snake-keys nav-font">{COARSE ? 'Swipe to steer · tap to pause' : 'WASD / arrows · space pause · esc quit'}</p>
          </div>
        )}
        <Trail />
      </div>
    </section>
  );
}
