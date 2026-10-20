import { Component, useEffect, useMemo, useRef, useState } from 'react';
import { COARSE, REDUCED, WEBGL, pad } from '../env';
import { Trail } from '../fx/FxLayer';
import { createGame, newGame, stepGame } from '../three/maze';
import MazeCanvas from './MazeCanvas';

const BEST_KEY = 'rmr_cuberun_best';
const SOUND_KEY = 'rmr_cuberun_sound';
const KEYS = { ArrowUp: 0, KeyW: 0, ArrowLeft: 1, KeyA: 1, ArrowDown: 2, KeyS: 2, ArrowRight: 3, KeyD: 3 };
const score5 = (n) => String(n).padStart(5, '0');

const store = {
  get(key) {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  set(key, value) {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
};
const readBest = () => parseInt(store.get(BEST_KEY) || '0', 10) || 0;

function tone(audio, f0, f1, dur, delay = 0) {
  try {
    audio.ctx ||= new AudioContext();
    const ctx = audio.ctx;
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'square';
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(f1, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.03, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ctx.destination);
    o.start(t);
    o.stop(t + dur + 0.02);
  } catch {}
}

class Contain extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export default function Snake() {
  const band = useRef(null);
  const stage = useRef(null);
  const fx = useRef(null);
  const step = useRef(null);
  const pointer = useRef({ x: 0, y: 0 });
  const touch = useRef(null);
  const held = useRef(null);
  const audio = useRef({});
  const compact = innerWidth < 760;
  const g = useMemo(() => {
    const game = compact ? createGame(15, 19) : createGame(29, 13);
    newGame(game, true);
    return game;
  }, [compact]);
  const [mode, setMode] = useState('idle');
  const [paused, setPaused] = useState(false);
  const [near, setNear] = useState(false);
  const [visible, setVisible] = useState(false);
  const [banner, setBanner] = useState(null);
  const [sound, setSound] = useState(() => store.get(SOUND_KEY) === '1');
  const [hud, setHud] = useState({ score: 0, best: readBest(), level: 1, lives: 3, last: 0 });
  const live = useRef({});
  live.current = { sound };

  step.current = (dt) => stepGame(g, dt);

  useEffect(() => {
    const io = new IntersectionObserver(([e]) => {
      setVisible(e.isIntersecting);
      if (e.isIntersecting) setNear(true);
    }, { rootMargin: '200px 0px' });
    io.observe(band.current);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!visible && mode === 'play') setPaused(true);
  }, [visible, mode]);

  useEffect(() => {
    let waka = 0;
    let back;
    const saveBest = () => {
      const best = Math.max(g.score, readBest());
      store.set(BEST_KEY, String(best));
      return best;
    };
    const sync = () => setHud((h) => ({ ...h, score: g.score, level: g.level, lives: g.lives }));
    g.on = (type, x, z, n) => {
      fx.current?.(type, x, z, n);
      if (g.auto) return;
      const a = live.current.sound && audio.current;
      if (type === 'eat') {
        if (a) tone(a, (waka ^= 1) ? 520 : 390, 300, 0.06);
        sync();
      } else if (type === 'power') {
        if (a) tone(a, 220, 880, 0.35);
        sync();
      } else if (type === 'chomp') {
        if (a) tone(a, 660, 1320, 0.18);
        setBanner(`+${n}`);
        sync();
      } else if (type === 'die') {
        if (a) tone(a, 600, 60, 0.7);
      } else if (type === 'reset') {
        sync();
        setBanner(`Level ${pad(g.level)}`);
      } else if (type === 'go') {
        setBanner(null);
      } else if (type === 'clear') {
        if (a) [523, 659, 784, 1046].forEach((f, i) => tone(a, f, f, 0.12, i * 0.09));
        setBanner('Clear');
        sync();
      } else if (type === 'over') {
        const best = saveBest();
        setHud((h) => ({ ...h, best, last: g.score }));
        setBanner(null);
        setMode('over');
        back = setTimeout(() => newGame(g, true), 900);
      }
    };
    return () => {
      clearTimeout(back);
      if (!g.auto) saveBest();
      g.on = () => {};
    };
  }, [g]);

  useEffect(() => {
    if (!banner || banner.startsWith('Level')) return;
    const id = setTimeout(() => setBanner(null), 900);
    return () => clearTimeout(id);
  }, [banner]);

  const start = () => {
    newGame(g, false);
    setHud((h) => ({ ...h, score: 0, level: 1, lives: 3 }));
    setPaused(false);
    setMode('play');
    band.current.focus({ preventScroll: true });
    if (sound) [392, 523, 659].forEach((f, i) => tone(audio.current, f, f, 0.1, i * 0.1));
  };

  const quit = () => {
    const best = Math.max(g.score, readBest());
    store.set(BEST_KEY, String(best));
    setHud((h) => ({ ...h, best, last: g.score }));
    newGame(g, true);
    setBanner(null);
    setPaused(false);
    setMode('idle');
  };

  const toggleSound = () => {
    const on = !sound;
    setSound(on);
    store.set(SOUND_KEY, on ? '1' : '0');
    if (on) tone(audio.current, 880, 880, 0.05);
    if (mode === 'play') band.current.focus({ preventScroll: true });
  };

  const steer = (dir, isHeld) => Object.assign(g.input, { dir, at: g.time, held: isHeld });

  const onKeyDown = (e) => {
    if (mode !== 'play') return;
    if (e.code === 'Escape' || e.code === 'KeyP') {
      e.preventDefault();
      setPaused((p) => !p);
      return;
    }
    const self = e.target === band.current;
    if (paused) {
      if (self && (e.code === 'Enter' || e.code === 'Space')) {
        e.preventDefault();
        setPaused(false);
      }
      return;
    }
    if (e.code === 'Space' && self) e.preventDefault();
    const d = KEYS[e.code];
    if (d === undefined) return;
    e.preventDefault();
    held.current = e.code;
    steer(d, true);
  };
  const onKeyUp = (e) => {
    if (e.code === held.current) g.input.held = false;
  };
  const onBlur = (e) => {
    if (mode === 'play' && !e.currentTarget.contains(e.relatedTarget)) setPaused(true);
  };

  const onTouchStart = (e) => (touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY });
  const onTouchMove = (e) => {
    const t0 = touch.current;
    if (mode !== 'play' || paused || !t0) return;
    const { clientX: x, clientY: y } = e.touches[0];
    const dx = x - t0.x;
    const dy = y - t0.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < 18) return;
    steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 3 : 1) : dy > 0 ? 2 : 0, false);
    touch.current = { x, y };
  };
  const onPointerMove = (e) => {
    const r = stage.current.getBoundingClientRect();
    pointer.current.x = ((e.clientX - r.left) / r.width) * 2 - 1;
    pointer.current.y = ((e.clientY - r.top) / r.height) * 2 - 1;
  };
  const onPointerLeave = () => (pointer.current.x = pointer.current.y = 0);

  const run = !visible ? 'never' : mode === 'play' ? (paused ? 'never' : 'always') : REDUCED ? 'demand' : 'always';
  if (!WEBGL) return null;
  const playLabel = mode === 'over' ? `Game over — ${score5(hud.last)} · play again →` : 'Play cube run →';

  return (
    <section
      className={mode === 'play' ? 'snake playing' : 'snake'}
      ref={band}
      tabIndex={-1}
      aria-label="Cube Run mini game"
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={onBlur}
    >
      <header className="snake-hud nav-font">
        <span className="snake-rule" aria-hidden="true" />
        <span className="maze-name">› Cube run</span>
        <span>
          Score <b>{score5(hud.score)}</b>
        </span>
        <span className="maze-best">
          / Best <b>{score5(hud.best)}</b>
        </span>
        {mode === 'play' && (
          <>
            <span>
              Lvl <b>{pad(hud.level)}</b>
            </span>
            <span className="maze-lives" aria-label={`${hud.lives} lives`}>
              {[0, 1, 2].map((i) => (
                <i key={i} className={i < hud.lives ? 'on' : undefined} />
              ))}
            </span>
            <button className="maze-btn" onClick={() => setPaused((p) => !p)} aria-pressed={paused} aria-label={paused ? 'Resume' : 'Pause'}>
              {compact ? (paused ? '▶' : '❚❚') : paused ? 'Resume' : 'Pause'}
            </button>
          </>
        )}
        <button className="maze-btn" onClick={toggleSound} aria-pressed={sound} aria-label="Sound">
          {compact ? '♪' : 'Sound'} {sound ? 'on' : 'off'}
        </button>
      </header>
      <div
        className="snake-stage"
        ref={stage}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onPointerMove={COARSE ? undefined : onPointerMove}
        onPointerLeave={onPointerLeave}
      >
        {near && (
          <Contain>
            <MazeCanvas g={g} fx={fx} step={step} pointer={pointer} run={run} reduced={REDUCED} compact={compact} />
          </Contain>
        )}
        <div className="maze-crt" aria-hidden="true" />
        {banner && mode === 'play' && (
          <p className="maze-banner" aria-live="polite">
            {banner}
          </p>
        )}
        {mode !== 'play' && (
          <div className="snake-overlay">
            <button className="snake-play nav-font cybr" onClick={start} data-text={playLabel}>
              {playLabel}
            </button>
            <p className="maze-legend nav-font">
              <span className="you">■</span> Roll over every node · <span className="core">◆</span> pink cores turn the hunters
            </p>
            <p className="snake-keys nav-font">{COARSE ? 'Swipe to steer · pause in the bar' : 'Arrows / WASD steer · P or Esc pause'}</p>
          </div>
        )}
        {mode === 'play' && paused && (
          <div className="snake-overlay maze-paused">
            <p className="maze-banner">Paused</p>
            <div className="maze-actions">
              <button className="snake-play nav-font cybr" onClick={() => (setPaused(false), band.current.focus({ preventScroll: true }))} data-text="Resume →">
                Resume →
              </button>
              <button className="maze-btn nav-font" onClick={quit}>
                Quit
              </button>
            </div>
          </div>
        )}
        <Trail />
      </div>
    </section>
  );
}
