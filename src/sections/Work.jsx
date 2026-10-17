import { useEffect, useRef, useState } from 'react';
import { DEMOS, PROJECTS, SERVICES } from '../data';
import { REDUCED, pad } from '../env';
import { GlitchBox } from '../fx/FxLayer';
import { Chips, Head } from './Profile';

export function Services() {
  const cards = useRef(null);
  const [box, setBox] = useState(null);
  useEffect(() => {
    let disposeArt;
    let cancelled = false;
    import('../fx/serviceArt').then(({ runServiceArt }) => !cancelled && (disposeArt = runServiceArt(cards.current)));
    return () => {
      cancelled = true;
      disposeArt?.();
    };
  }, []);
  return (
    <section id="services" className="section">
      <Head text="Stack" />
      <div className="svc-pin">
        <div className="svc-scene">
          <div className="svc-stage" />
          <p className="svc-meta nav-font">WebGL · three.js · procedural · post FX — scroll to change the look, drag to rotate</p>
        </div>
        <div className="svc-grid" ref={cards}>
          {SERVICES.map((s) => (
            <article
              key={s.title}
              className={s.lit ? 'sa-card lit' : 'sa-card'}
              role="button"
              tabIndex={0}
              aria-haspopup="dialog"
              onClick={() => setBox({ title: s.title, text: s.detail })}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setBox({ title: s.title, text: s.detail }))}
            >
              <p className="sa-k nav-font">{s.kicker}</p>
              <h3 className="sa-title rise">{s.title}</h3>
              <p className="sa-copy">{s.copy}</p>
              <div className="sa-art">
                <canvas data-art={s.art} aria-hidden="true" />
              </div>
              <Chips items={s.chips} />
            </article>
          ))}
        </div>
      </div>
      <GlitchBox box={box} onClose={() => setBox(null)} />
    </section>
  );
}

function PreviewVideo({ src, poster, label }) {
  const ref = useRef(null);
  // A poster downloads as soon as it is set, preload="none" or not, so it waits until the card is near.
  const [near, setNear] = useState(false);
  useEffect(() => {
    const video = ref.current;
    const nearby = new IntersectionObserver(([e]) => e.isIntersecting && (setNear(true), nearby.disconnect()), { rootMargin: '100% 0px' });
    nearby.observe(video);
    if (REDUCED) return () => nearby.disconnect();
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? video.play().catch(() => {}) : video.pause()), { threshold: 0.3 });
    io.observe(video);
    return () => (nearby.disconnect(), io.disconnect());
  }, []);
  return <video ref={ref} src={src} poster={near ? poster : undefined} muted loop playsInline preload="none" aria-label={label} />;
}

function Demo({ d, i }) {
  return (
    <figure className="demo">
      <div className="demo-frame">
        <img src={`https://i.ytimg.com/vi/${d.id}/hqdefault.jpg`} alt={d.title} loading="lazy" />
      </div>
      <figcaption className="nav-font">
        <span className="cyan">V/{pad(i + 1)}</span> {d.title}
      </figcaption>
    </figure>
  );
}

export function Work() {
  return (
    <section id="work" className="section">
      <Head text="Latest done" />
      <div className="pj-grid">
        {PROJECTS.map((p, i) => (
          <article key={p.title} className="pj-card" id={`p-${i + 1}`}>
            <p className="pj-k nav-font">
              P/{pad(i + 1)} — {p.status}
            </p>
            <h3 className="pj-title rise">{p.title}</h3>
            <p className="pj-copy">{p.summary}</p>
            <div className="pj-media">
              <PreviewVideo src={p.video} poster={p.poster} label={`${p.title} preview`} />
              <img className="pj-split r" src={p.poster} alt="" aria-hidden="true" loading="lazy" decoding="async" />
              <img className="pj-split c" src={p.poster} alt="" aria-hidden="true" loading="lazy" decoding="async" />
            </div>
            <p className="pj-tag">{p.tagline}</p>
            <p className="pj-done-h nav-font">Key deliverables</p>
            <ul className="pj-done">
              {p.scope.map((s) => <li key={s}>{s}</li>)}
            </ul>
            <Chips items={p.stack.map((s, k) => [s, k % 3 === 1])} />
            <div className="pj-links nav-font">
              {p.href && <a href={p.href} target="_blank" rel="noreferrer">Live site ↗</a>}
              {!p.href && <a href="#contact">Ask for a code walkthrough →</a>}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

export function Archive() {
  return (
    <section className="section archive" aria-label="Archive">
      <p className="archive-h nav-font">Archive / demo reel</p>
      <div className="demos">
        {DEMOS.map((d, i) => <Demo key={d.id} d={d} i={i} />)}
      </div>
    </section>
  );
}
