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

/** Black cover with the load count; the loading strands are drawn by the world canvas, which sits above it. */
export function Loader({ ready, onProgress, onComplete }) {
  const [pct, setPct] = useState(0);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  useEffect(() => {
    let n = 0;
    const timer = setInterval(() => {
      n = Math.min(readyRef.current ? 100 : 98, n + (readyRef.current ? 16 : 2 + Math.random() * 6));
      setPct(Math.floor(n));
      onProgress(n / 100);
      if (n >= 100) {
        clearInterval(timer);
        onComplete();
      }
    }, 140);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="loader" aria-hidden="true">
      {pct < 100 && <div className="loader-num">{pct}%</div>}
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
