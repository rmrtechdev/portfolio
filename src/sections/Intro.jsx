import { Suspense, lazy, useEffect, useRef, useState } from 'react';
import { DISCIPLINES, GIANT_LEAD, HOME, MARQUEE, REEL } from '../data';
import { REDUCED, THREE_D, WEBGL } from '../env';
import { Trail } from '../fx/FxLayer';
import { useInView } from '../fx/hooks';
import { loadVisits } from '../fx/visitors';

// Only for reduced motion: everyone else gets the globe inside the shared world (three/World.jsx).
const Globe = lazy(() => import('../three/Globe'));

/** The room itself lives in three/World.jsx behind the page; this is the DOM laid over it. */
export function Hero({ thermal, onThermal }) {
  return (
    <section id="top" className="hero">
      {!THREE_D && (
        <div className="hero-fallback">
          {REEL.slice(0, 3).map((p) => (
            <img key={p.title} src={p.poster} alt="" />
          ))}
        </div>
      )}
      {THREE_D && (
        <button className={thermal ? 'hud-toggle nav-font on' : 'hud-toggle nav-font'} onClick={() => onThermal(!thermal)} aria-pressed={thermal}>
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
      <h1 className="sr-only">R.M.ROMAN — full-stack engineer</h1>
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

export function Specializing({ visitors, onVisitors }) {
  const [ref, inView] = useInView({ threshold: 0 });
  const shown = useRotatingType(DISCIPLINES, inView);

  // Fetched the first time the globe is on screen, so it never competes with the hero.
  useEffect(() => {
    if (inView && !visitors) loadVisits().then((v) => v && onVisitors(v));
  }, [inView]);

  return (
    <section id="about" className="spec" ref={ref}>
      <div className="giant rise">
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
      {/* With 3D on, this box is empty: it only marks where World.jsx frames the globe. */}
      {WEBGL && (
        <div className="spec-globe">
          {!THREE_D && (
            <Suspense fallback={null}>
              <Globe home={HOME} active={inView} spin={!REDUCED} visitors={visitors} />
            </Suspense>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * Draggable marquee. `label` gives screen readers the text once, since the scrolling copies are hidden;
 * `small` sets a sentence-length line at a reading size instead of the giant display size.
 */
export function MovingText({ text = MARQUEE, sep = '© ', label = false, small = false }) {
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
  const run = `${text}${sep}`.repeat(4);
  return (
    <>
      {label && <p className="sr-only">{text}</p>}
      <div className={small ? 'moving small' : 'moving'} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={() => (drag.current = null)} aria-hidden="true">
        <div className="moving-track" ref={track}>
          <span>{run}</span>
          <span>{run}</span>
        </div>
        <Trail color="36,36,36" width={25} />
      </div>
    </>
  );
}
