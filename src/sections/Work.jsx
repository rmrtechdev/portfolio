import { useEffect, useRef, useState } from 'react';
import { DEMOS, PROJECTS, SERVICES } from '../data';
import { REDUCED, WEBGL, pad } from '../env';
import { Chips, Head } from './Profile';

export function Services() {
  const pin = useRef(null);
  const stage = useRef(null);
  const cards = useRef(null);
  useEffect(() => {
    let disposeArt;
    let disposeStage;
    let cancelled = false;
    import('../fx/serviceArt').then(({ runServiceArt }) => !cancelled && (disposeArt = runServiceArt(cards.current)));
    if (WEBGL && !REDUCED) import('../three/workstation').then(({ initWorkstation }) => !cancelled && (disposeStage = initWorkstation(stage.current, pin.current)));
    return () => {
      cancelled = true;
      disposeArt?.();
      disposeStage?.();
    };
  }, []);
  return (
    <section id="services" className="section">
      <Head text="Stack" />
      <div className="svc-pin" ref={pin}>
        <div className="svc-scene">
          <div className="svc-stage" ref={stage} />
          <p className="svc-meta nav-font">WebGL · three.js · procedural · post FX — scroll to change the look, drag to rotate</p>
        </div>
        <div className="svc-grid" ref={cards}>
          {SERVICES.map((s) => (
            <article key={s.title} className={s.lit ? 'sa-card lit' : 'sa-card'}>
              <p className="sa-k nav-font">{s.kicker}</p>
              <h3 className="sa-title">{s.title}</h3>
              <p className="sa-copy">{s.copy}</p>
              <div className="sa-art">
                <canvas data-art={s.art} aria-hidden="true" />
              </div>
              <Chips items={s.chips} />
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function PreviewVideo({ src, poster, label }) {
  const ref = useRef(null);
  useEffect(() => {
    const video = ref.current;
    if (REDUCED) return;
    const io = new IntersectionObserver(([e]) => (e.isIntersecting ? video.play().catch(() => {}) : video.pause()), { threshold: 0.3 });
    io.observe(video);
    return () => io.disconnect();
  }, []);
  return <video ref={ref} src={src} poster={poster} muted loop playsInline preload="none" aria-label={label} />;
}

function Demo({ d, i }) {
  const [playing, setPlaying] = useState(false);
  return (
    <figure className="demo">
      <div className="demo-frame">
        {playing ? (
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${d.id}?autoplay=1`}
            title={d.title}
            allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
            allowFullScreen
          />
        ) : (
          <button onClick={() => setPlaying(true)} aria-label={`Play: ${d.title}`}>
            <img src={`https://i.ytimg.com/vi/${d.id}/hqdefault.jpg`} alt="" loading="lazy" />
            <span className="play nav-font">▶ Play</span>
          </button>
        )}
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
            <h3 className="pj-title">{p.title}</h3>
            <p className="pj-copy">{p.summary}</p>
            <div className="pj-media">
              <PreviewVideo src={p.video} poster={p.poster} label={`${p.title} preview`} />
              <img className="pj-split r" src={p.poster} alt="" aria-hidden="true" />
              <img className="pj-split c" src={p.poster} alt="" aria-hidden="true" />
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
