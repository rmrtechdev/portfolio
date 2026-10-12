import { useEffect, useRef, useState } from 'react';
import { SOCIALS, openMail } from '../data';
import { useTypewriter } from '../fx/hooks';

export const SECTIONS = [
  ['top', 'Main'],
  ['about', 'About'],
  ['team', 'Profile'],
  ['services', 'Stack'],
  ['work', 'Work'],
  ['contact', 'Contact'],
];

function drawSnake(ctx, W, H, prog) {
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);
  const cell = Math.max(10, Math.round(Math.min(W, H) / 26));
  const cols = Math.floor(W / cell);
  const rowY = Math.round(H / 2 / cell) * cell;
  ctx.fillStyle = '#0c0c0c';
  for (let y = 0; y < H; y += cell) for (let x = 0; x < W; x += cell) ctx.fillRect(x, y, 1, 1);
  const head = Math.floor(cols * prog);
  for (let c = 0; c < cols; c++) {
    const px = c * cell + cell * 0.12;
    ctx.fillStyle = c < head ? 'rgba(8,253,216,.14)' : '#161616';
    if (c < head) ctx.fillRect(px, rowY - cell * 0.26, cell * 0.76, cell * 1.52);
    else ctx.fillRect(px, rowY + cell * 0.1, cell * 0.76, cell * 0.8);
  }
  for (let s = 0; s < 6; s++) {
    const c = head - s;
    if (c < 0) continue;
    ctx.fillStyle = `rgba(${8 + s * 49},${253 - s * 30},${216 - s * 7},${1 - s * 0.15})`;
    ctx.fillRect(c * cell + cell * 0.12, rowY - cell * 0.26, cell * 0.76, cell * 1.52);
  }
  if (head < cols) {
    ctx.save();
    ctx.shadowColor = '#ff69b4';
    ctx.shadowBlur = 18;
    ctx.fillStyle = '#fff';
    ctx.fillRect(head * cell + cell * 0.12, rowY - cell * 0.26, cell * 0.76, cell * 1.52);
    ctx.restore();
  }
}

const BARS = 8;

export function Loader({ ready, onDone }) {
  const cv = useRef(null);
  const [pct, setPct] = useState(0);
  const [phase, setPhase] = useState('loading');
  const n = useRef(0);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  useEffect(() => {
    const ctx = cv.current.getContext('2d');
    const fit = () => {
      const dpr = Math.min(devicePixelRatio || 1, 2);
      cv.current.width = innerWidth * dpr;
      cv.current.height = innerHeight * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    addEventListener('resize', fit);
    const timer = setInterval(() => {
      n.current = Math.min(readyRef.current ? 100 : 98, n.current + (readyRef.current ? 16 : 2 + Math.random() * 6));
      setPct(Math.floor(n.current));
      if (n.current >= 100) {
        clearInterval(timer);
        setPhase('done');
        onDone();
        setTimeout(() => setPhase('gone'), 1100);
      }
    }, 140);
    let raf;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      drawSnake(ctx, innerWidth, innerHeight, Math.min(0.86, (n.current / 100) * 0.98) / 0.86);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      clearInterval(timer);
      cancelAnimationFrame(raf);
      removeEventListener('resize', fit);
    };
  }, []);

  if (phase === 'gone') return null;
  return (
    <div className={`loader ${phase}`} aria-hidden="true">
      <div className="loader-bars">
        {Array.from({ length: BARS }, (_, i) => (
          <i key={i} style={{ '--i': i }} />
        ))}
      </div>
      <canvas ref={cv} />
      <div className="loader-num">{Math.min(99, pct)}%</div>
    </div>
  );
}

const BADGES = [
  // The GitHub mark is a filled roundel, so it replaces the outline circle instead of sitting inside one.
  { label: 'GitHub', href: SOCIALS[0].href, mark: true, icon: <path className="mark" transform="translate(.5 .5) scale(.958)" d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-5.9 0-1.3.5-2.4 1.2-3.2 0-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.6 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .3" /> },
  {
    label: 'LinkedIn',
    href: SOCIALS[1].href,
    icon: <path d="M12 11.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6.5 19c.8-3.2 3-5 5.5-5s4.7 1.8 5.5 5" />,
  },
  { label: 'Email', href: '#contact', onClick: openMail, icon: <path d="M5 7.5h14v9H5zM5 8l7 5 7-5" /> },
];

export function TopBar({ started }) {
  const [inverted, setInverted] = useState(false);
  const brand = useTypewriter('R.M.ROMAN', { start: started, speed: 28 });
  const tag = useTypewriter('Full-stack, end to end.', { start: brand.done, speed: 14 });
  useEffect(() => {
    document.body.classList.toggle('site-inverted', inverted);
  }, [inverted]);
  return (
    <header className={started ? 'topbar in' : 'topbar'}>
      <div className="brand-block">
        <a href="#top" className="brand">
          {brand.shown}
        </a>
        <span className="tagline">{brand.done ? tag.shown : ' '}</span>
        <ul className="badges">
          {BADGES.map((b) => (
            <li key={b.label}>
              <a
                href={b.href}
                aria-label={b.label}
                title={b.label}
                onClick={b.onClick}
                {...(b.href.startsWith('http') && { target: '_blank', rel: 'noreferrer' })}
              >
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  {!b.mark && <circle cx="12" cy="12" r="11" />}
                  {b.icon}
                </svg>
              </a>
            </li>
          ))}
        </ul>
      </div>
      <button className={inverted ? 'chip nav-font on' : 'chip nav-font'} onClick={() => setInverted(!inverted)} aria-pressed={inverted}>
        <span className="chip-icon" aria-hidden="true">{inverted ? '◑' : '◐'}</span> Invert site
      </button>
    </header>
  );
}

export function SideRail() {
  const [active, setActive] = useState('top');
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: '-45% 0px -50% 0px' }
    );
    SECTIONS.forEach(([id]) => io.observe(document.getElementById(id)));
    return () => io.disconnect();
  }, []);
  return (
    <nav className="rail nav-font" aria-label="Sections">
      {SECTIONS.map(([id, label]) => (
        <a key={id} href={`#${id}`} className={active === id ? 'on' : undefined} aria-current={active === id || undefined}>
          {label}
        </a>
      ))}
    </nav>
  );
}

/** Stands in for the hidden scrollbar: cyan-to-pink fill, a pink square head, a % readout while active. Drag to scrub. */
export function ScrollProgress() {
  const root = useRef(null);
  const label = useRef(null);
  useEffect(() => {
    let raf = 0;
    let idle;
    const max = () => Math.max(1, document.documentElement.scrollHeight - innerHeight);
    const update = () => {
      raf = 0;
      const p = Math.min(1, Math.max(0, scrollY / max()));
      root.current.style.setProperty('--p', p.toFixed(4));
      label.current.textContent = `${String(Math.round(p * 100)).padStart(3, '0')}%`;
    };
    const onScroll = () => {
      raf ||= requestAnimationFrame(update);
      root.current.classList.add('on');
      clearTimeout(idle);
      idle = setTimeout(() => root.current?.classList.remove('on'), 1100);
    };
    update();
    addEventListener('scroll', onScroll, { passive: true });
    addEventListener('resize', onScroll);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(idle);
      removeEventListener('scroll', onScroll);
      removeEventListener('resize', onScroll);
    };
  }, []);
  const scrub = (e) => {
    const r = root.current.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
    scrollTo({ top: f * (document.documentElement.scrollHeight - innerHeight), behavior: 'instant' });
  };
  return (
    <div
      className="sprog"
      ref={root}
      aria-hidden="true"
      onPointerDown={(e) => (e.currentTarget.setPointerCapture(e.pointerId), scrub(e))}
      onPointerMove={(e) => e.currentTarget.hasPointerCapture(e.pointerId) && scrub(e)}
    >
      <i className="sprog-fill" />
      <b className="sprog-head">
        <span className="nav-font" ref={label}>000%</span>
      </b>
    </div>
  );
}
