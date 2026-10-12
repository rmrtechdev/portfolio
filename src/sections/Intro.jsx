import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { DISCIPLINES, GIANT_LEAD, HOME, MARQUEE, PROJECTS, STATEMENT } from '../data';
import { REDUCED, THREE_D, WEBGL, media } from '../env';
import { Trail } from '../fx/FxLayer';
import { useInView } from '../fx/hooks';
import { loadVisits } from '../fx/visitors';

const HeroScene = lazy(() => import('../three/HeroScene'));
const Globe = lazy(() => import('../three/Globe'));
// Hero screen order, independent of the Work list; panels are placed by position in this array.
const REEL = ['ASSISTABOT', 'SALEOR', 'SFSHOWING', 'CHATROOM', 'COMMERCE', 'JSX3'].map((k) => PROJECTS.find((p) => p.subject === k));

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
          <span aria-hidden="true">⌖</span> Spectral decloak
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
      <h1 className="sr-only">Raymond M. Roman — full-stack engineer</h1>
    </section>
  );
}

/** Types each item, holds, backspaces, then moves to the next, looping while `active`. */
function useRotatingType(items, active) {
  const [i, setI] = useState(0);
  const [n, setN] = useState(0);
  const [deleting, setDeleting] = useState(false);
  useEffect(() => {
    if (!active || REDUCED) return;
    const full = items[i];
    let delay = deleting ? 35 : 70;
    let next = () => setN(n + (deleting ? -1 : 1));
    if (!deleting && n === full.length) (delay = 1800), (next = () => setDeleting(true));
    else if (deleting && n === 0) (delay = 350), (next = () => (setDeleting(false), setI((i + 1) % items.length)));
    const id = setTimeout(next, delay);
    return () => clearTimeout(id);
  }, [active, i, n, deleting]);
  return REDUCED ? items[0] : items[i].slice(0, n);
}

export function Specializing() {
  const [ref, inView] = useInView({ threshold: 0 });
  const [visitors, setVisitors] = useState(null);
  const shown = useRotatingType(DISCIPLINES, inView);

  // Fetched the first time the globe is on screen, so it never competes with the hero.
  useEffect(() => {
    if (inView && !visitors) loadVisits().then((v) => v && setVisitors(v));
  }, [inView]);

  return (
    <section id="about" className="spec" ref={ref}>
      <div className="giant">
        <p className="giant-line" aria-label={`${GIANT_LEAD} ${DISCIPLINES.join(', ')}`}>
          <span className="giant-lead" aria-hidden="true">{GIANT_LEAD}</span>
          <span className="giant-slot" aria-hidden="true">
            {shown}
            <span className="giant-caret" />
          </span>
        </p>
      </div>
      <p className="spec-hint nav-font">
        Drag or click the globe
        {visitors?.places > 0 && (
          <>
            {' · '}
            <span className="pink">●</span> visitors from {visitors.places} {visitors.places === 1 ? 'place' : 'places'}
          </>
        )}
      </p>
      {WEBGL && (
        <div className="spec-globe">
          <Suspense fallback={null}>
            <Globe home={HOME} active={inView} spin={!REDUCED} visitors={visitors} />
          </Suspense>
        </div>
      )}
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
