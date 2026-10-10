import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { DISCIPLINES, GIANT_LEAD, HOME, MARQUEE, PROJECTS, STATEMENT } from '../data';
import { COARSE, REDUCED, THREE_D, WEBGL, media } from '../env';
import { Trail } from '../fx/FxLayer';
import { scramble, useInView } from '../fx/hooks';
import { loadVisits } from '../fx/visitors';

const HeroScene = lazy(() => import('../three/HeroScene'));
const Globe = lazy(() => import('../three/Globe'));
const REEL = PROJECTS.filter((p) => p.video);

export function Hero({ onReady }) {
  const [ref, inView] = useInView({ threshold: 0 });
  const [thermal, setThermal] = useState(false);
  const select = (i) => document.getElementById(`p-${PROJECTS.indexOf(REEL[i]) + 1}`)?.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
  return (
    <section id="top" className="hero" ref={ref}>
      <div className="hero-stage">
        {THREE_D ? (
          <Suspense fallback={null}>
            <HeroScene projects={REEL} active={inView} thermal={thermal} onReady={onReady} onSelect={select} />
          </Suspense>
        ) : (
          <div className="hero-fallback">
            {REEL.slice(0, 3).map((p) => (
              <img key={p.title} src={p.poster} alt="" />
            ))}
          </div>
        )}
      </div>
      {THREE_D && (
        <button className={thermal ? 'hud-toggle nav-font on' : 'hud-toggle nav-font'} onClick={() => setThermal(!thermal)} aria-pressed={thermal}>
          <span aria-hidden="true">⌖</span> Thermal effect
        </button>
      )}
      <p className="hero-kicker nav-font">
        <span className="dot" /> Open to roles — New York City / remote
      </p>
      <a className="hero-ring" href="#work" aria-label="Jump to latest work">
        <svg viewBox="0 0 100 100" aria-hidden="true">
          <defs>
            <path id="hero-ring-path" d="M 50,50 m -38,0 a 38,38 0 1,1 76,0 a 38,38 0 1,1 -76,0" />
          </defs>
          <circle className="hero-ring-dash" cx="50" cy="50" r="47" />
          <text className="hero-ring-text">
            <textPath href="#hero-ring-path" textLength="236" lengthAdjust="spacing">
              • View work • Latest done • Scroll down
            </textPath>
          </text>
        </svg>
        <span className="hero-ring-core" aria-hidden="true">↓</span>
      </a>
      <p className="hero-title" aria-hidden="true">{GIANT_LEAD}</p>
      <h1 className="sr-only">Raymond M. Roman — full-stack engineer</h1>
    </section>
  );
}

function GlitchBox({ box, onClose }) {
  const [typed, setTyped] = useState('');
  const [phase, setPhase] = useState('in');
  useEffect(() => {
    if (!box) return;
    setPhase('in');
    let raf;
    const t0 = performance.now();
    const step = (now) => {
      const n = Math.min(box.text.length, Math.floor((now - t0) / 16));
      setTyped(box.text.slice(0, n) + (n < box.text.length ? '▌' : ''));
      if (n < box.text.length) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    const close = setTimeout(() => setPhase('out'), 5000);
    const onKey = (e) => e.key === 'Escape' && setPhase('out');
    addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      clearTimeout(close);
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
    <div className={`gbox ${phase}`} role="dialog" aria-label={box.title}>
      <button className="gbox-x" onClick={() => setPhase('out')} aria-label="Close">×</button>
      <span className="gbox-t">{box.title} /</span>
      <span className="gbox-d">{typed}</span>
    </div>
  );
}

function GiantLine({ text, desc, typing, active, hot, onHover, onOpen }) {
  const ref = useRef(null);
  return (
    <p
      className={['giant-line', hot && 'shov', active && 'hov', typing && 'twp'].filter(Boolean).join(' ')}
      onPointerEnter={() => {
        onHover(text);
        if (!typing && !COARSE) scramble(ref.current);
      }}
      onPointerLeave={() => onHover(null)}
      onClick={() => onOpen({ title: text, text: desc })}
    >
      <span className="seltxt" ref={ref}>{typing ?? text}</span>
    </p>
  );
}

export function Specializing() {
  const [ref, inView] = useInView({ threshold: 0 });
  const [typed, setTyped] = useState(REDUCED ? DISCIPLINES.length : -1);
  const [chars, setChars] = useState(0);
  const [hover, setHover] = useState(null);
  const [scrollHot, setScrollHot] = useState(null);
  const [touched, setTouched] = useState(false);
  const [box, setBox] = useState(null);
  const [visitors, setVisitors] = useState(null);
  const linesRef = useRef(null);

  // Fetched the first time the globe is on screen, so it never competes with the hero.
  useEffect(() => {
    if (inView && !visitors) loadVisits().then((v) => v && setVisitors(v));
  }, [inView]);

  // Lines type in sequence the first time the block enters view.
  useEffect(() => {
    if (!inView || typed !== -1) return;
    setTyped(0);
  }, [inView]);
  useEffect(() => {
    if (typed < 0 || typed >= DISCIPLINES.length) return;
    const full = DISCIPLINES[typed][0];
    if (chars >= full.length) {
      setTyped(typed + 1);
      setChars(0);
      return;
    }
    const id = setTimeout(() => setChars(chars + 1), 34);
    return () => clearTimeout(id);
  }, [typed, chars]);

  // Until the visitor interacts, the line nearest 75% of the viewport is highlighted.
  useEffect(() => {
    if (touched) return setScrollHot(null);
    let ticking = false;
    const pick = () => {
      ticking = false;
      const focus = innerHeight * 0.75;
      let best = null;
      let bestD = Infinity;
      linesRef.current?.querySelectorAll('.giant-line').forEach((el, i) => {
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) return;
        const d = Math.abs((r.top + r.bottom) / 2 - focus);
        if (d < bestD) (bestD = d), (best = i);
      });
      setScrollHot(best);
    };
    const onScroll = () => !ticking && ((ticking = true), requestAnimationFrame(pick));
    addEventListener('scroll', onScroll, { passive: true });
    pick();
    return () => removeEventListener('scroll', onScroll);
  }, [touched]);

  const lineText = (i) => {
    if (typed > i || typed >= DISCIPLINES.length) return undefined;
    if (typed === i) return DISCIPLINES[i][0].slice(0, chars) + '█';
    return ' ';
  };

  return (
    <section id="about" className="spec" ref={ref}>
      {WEBGL && (
        <div className="spec-globe">
          <Suspense fallback={null}>
            <Globe home={HOME} active={inView} spin={!REDUCED} visitors={visitors} />
          </Suspense>
        </div>
      )}
      <div className="giant" ref={linesRef} onPointerEnter={() => setTouched(true)}>
        {DISCIPLINES.map(([text, desc], i) => (
          <GiantLine
            key={text}
            text={text}
            desc={desc}
            typing={lineText(i)}
            hot={scrollHot === i}
            active={hover === text}
            onHover={setHover}
            onOpen={(b) => (setTouched(true), setBox(b))}
          />
        ))}
      </div>
      <p className="spec-hint nav-font">
        Click a line · drag or click the globe
        {visitors?.places > 0 && (
          <>
            {' · '}
            <span className="pink">●</span> visitors from {visitors.places} {visitors.places === 1 ? 'place' : 'places'}
          </>
        )}
      </p>
      <GlitchBox box={box} onClose={() => setBox(null)} />
    </section>
  );
}

const FX_COUNT = 4;

export function VideoBand() {
  const [ref, inView] = useInView({ threshold: 0 });
  const video = useRef(null);
  const [fx, setFx] = useState(0);
  const [pos, setPos] = useState(0);
  const [scrub, setScrub] = useState(null);

  useEffect(() => {
    const v = video.current;
    if (inView && !REDUCED) v.play().catch(() => {});
    else v.pause();
  }, [inView]);

  const frameOf = (p) => Math.round(p * 39);
  const sprite = (p) => {
    const f = frameOf(p);
    return `${((f % 10) * 100) / 9}% ${(Math.floor(f / 10) * 100) / 3}%`;
  };
  const commit = (p) => {
    const v = video.current;
    if (v.duration) v.currentTime = Math.min(v.duration - 0.04, v.duration * p);
    v.addEventListener('seeked', () => setScrub(null), { once: true });
  };

  return (
    <section className={`vidband fx${fx + 1}`} ref={ref} aria-label="Statement">
      <video
        ref={video}
        src={media('video/3jsx.mp4')}
        poster={media('Images/portfolio-logos/3jsxLogo.jpg')}
        muted
        loop
        playsInline
        preload="none"
        onTimeUpdate={(e) => scrub === null && e.currentTarget.duration && setPos(e.currentTarget.currentTime / e.currentTarget.duration)}
      />
      {scrub !== null && <div className="vb-preview" style={{ backgroundImage: `url(${media('video/3jsx-scrub.jpg')})`, backgroundPosition: sprite(scrub) }} />}
      <Trail />
      <p className="vb-statement">{STATEMENT}</p>
      <div className="vb-controls nav-font">
        {scrub !== null && (
          <div className="vb-mini" style={{ backgroundImage: `url(${media('video/3jsx-scrub.jpg')})`, backgroundPosition: `-${(frameOf(scrub) % 10) * 160}px -${Math.floor(frameOf(scrub) / 10) * 90}px` }} />
        )}
        <input
          type="range"
          className="vb-seek"
          min="0"
          max="1000"
          aria-label="Seek video"
          value={Math.round((scrub ?? pos) * 1000)}
          style={{ '--pos': `${(scrub ?? pos) * 100}%` }}
          onPointerDown={() => (video.current.pause(), setScrub(pos))}
          onChange={(e) => setScrub(Number(e.target.value) / 1000)}
          onPointerUp={(e) => (commit(Number(e.target.value) / 1000), !REDUCED && video.current.play().catch(() => {}))}
          onKeyUp={(e) => commit(Number(e.target.value) / 1000)}
        />
        <button onClick={() => setFx((fx + 1) % FX_COUNT)}>Video FX {String(fx + 1).padStart(2, '0')}</button>
      </div>
    </section>
  );
}

export function MovingText() {
  const track = useRef(null);
  const drag = useRef(null);
  const onDown = (e) => {
    drag.current = { x: e.clientX, base: parseFloat(getComputedStyle(track.current).animationDelay) || 0 };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onMove = (e) => {
    if (!drag.current) return;
    const dur = parseFloat(getComputedStyle(track.current).animationDuration) || 60;
    const seg = track.current.scrollWidth / 2 || 4096;
    track.current.style.animationDelay = `${(drag.current.base + ((e.clientX - drag.current.x) * dur) / seg).toFixed(3)}s`;
  };
  const run = `${MARQUEE}© `.repeat(4);
  return (
    <div className="moving" onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)} aria-hidden="true">
      <div className="moving-track" ref={track}>
        <span>{run}</span>
        <span>{run}</span>
      </div>
      <Trail color="36,36,36" width={25} />
    </div>
  );
}
