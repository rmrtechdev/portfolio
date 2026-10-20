import { useEffect, useRef, useState } from 'react';
import { openMail } from '../data';
import { useTypewriter } from '../fx/hooks';
import { COARSE, THREE_D, TILT_ASK, ar, loadShown, setAR, startTilt, stopTilt } from '../env';

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
  const [live, setLive] = useState(false);
  const readyRef = useRef(ready);
  readyRef.current = ready;

  useEffect(() => {
    let n = 0;
    const timer = setInterval(() => {
      n = Math.min(readyRef.current ? 100 : 98, n + (readyRef.current ? 16 : 2 + Math.random() * 6));
      onProgress(n / 100);
      if (n >= 100) {
        clearInterval(timer);
        onComplete();
      }
    }, 140);
    // Until the strands run, the count eases the shared value itself; they then pick it up where it is.
    const start = performance.now();
    let last = start;
    let raf = requestAnimationFrame(function tick(now) {
      if (!loadShown.live) loadShown.value += (n / 100 - loadShown.value) * (1 - Math.exp(-Math.min((now - last) / 1000, 0.1) * 8));
      last = now;
      setPct(Math.round(loadShown.value * 100));
      setLive(loadShown.live || now - start > 1200);
      raf = requestAnimationFrame(tick);
    });
    return () => (clearInterval(timer), cancelAnimationFrame(raf));
  }, []);

  return (
    <div className="loader" aria-hidden="true">
      {/* Waits briefly for the strands, so on a normal connection both arrive together. */}
      <div className={`loader-num${live ? ' in' : ''}${pct >= 99 ? ' out' : ''}`}>{pct}%</div>
    </div>
  );
}

export function TopBar({ started }) {
  const [inverted, setInverted] = useState(false);
  const [arOn, setArOn] = useState(ar.on);
  const brand = useTypewriter('R.M.ROMAN', { start: started, speed: 28 });
  const tag = useTypewriter('Full-stack, end to end.', { start: brand.done, speed: 14 });
  useEffect(() => {
    document.body.classList.toggle('site-inverted', inverted);
  }, [inverted]);
  useEffect(() => {
    const sync = () => setArOn(ar.on);
    addEventListener('rmr-ar', sync);
    return () => removeEventListener('rmr-ar', sync);
  }, []);
  // requestPermission has to be called inside the click's user gesture, so this can't wait for an effect.
  const toggleAR = async () => {
    // Android's look-around is on by default and stays on; iOS's only ever runs with AR.
    if (ar.on) return TILT_ASK && stopTilt(), setAR(false);
    // Without motion access a phone can't look around, so it stays on the regular scroll flight.
    if (COARSE && TILT_ASK && (await DeviceOrientationEvent.requestPermission().catch(() => null)) !== 'granted') return;
    if (COARSE) startTilt();
    setAR(true);
  };
  return (
    <header className={started ? 'topbar in' : 'topbar'}>
      <div className="brand-block">
        <a href="#top" className="brand">
          {brand.shown}
        </a>
        <span className="tagline">{brand.done ? tag.shown : ' '}</span>
      </div>
      <div className="topbar-chips">
        {THREE_D && (
          <button className={arOn ? 'chip nav-font on' : 'chip nav-font'} onClick={toggleAR} aria-pressed={arOn}>
            <span className="chip-icon" aria-hidden="true">⌖</span> <span className="chip-label">AR view</span>
          </button>
        )}
        <button className={inverted ? 'chip nav-font on' : 'chip nav-font'} onClick={() => setInverted(!inverted)} aria-pressed={inverted}>
          <span className="chip-icon" aria-hidden="true">{inverted ? '◑' : '◐'}</span> <span className="chip-label">Invert site</span>
        </button>
      </div>
      {/* gobold pins its address here; the address stays out of the DOM (see MAILBOX), so this opens the draft instead. */}
      <a className="corner-mail" href="#contact" onClick={openMail}>
        Write to me ↗
      </a>
    </header>
  );
}

/** Rotating stamp pinned bottom-left on every screen, gobold's seal. */
export function Seal() {
  return (
    <a className="seal" href="#top" aria-label="Back to top">
      <svg viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <path id="seal-path" d="M 50,50 m -39,0 a 39,39 0 1,1 78,0 a 39,39 0 1,1 -78,0" />
        </defs>
        <text className="seal-ring">
          <textPath href="#seal-path" textLength="242" lengthAdjust="spacing">
            R.M.ROMAN · NEW YORK · FULL STACK · {new Date().getFullYear()} ·
          </textPath>
        </text>
        <text className="seal-core" x="50" y="58" textAnchor="middle">
          RMR
        </text>
      </svg>
    </a>
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
