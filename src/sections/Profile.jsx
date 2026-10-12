import { useEffect, useRef } from 'react';
import { TEAM } from '../data';
import { WEBGL, pad } from '../env';
import { useTypeOnView } from '../fx/hooks';

export function Head({ text, id }) {
  const [ref, { shown }] = useTypeOnView(text, { speed: 140, from: 1 });
  return (
    <h2 className="head rise" ref={ref} id={id} aria-label={text}>
      <span aria-hidden="true">{shown}</span>
    </h2>
  );
}

export function Chips({ items }) {
  return (
    <ul className="chips">
      {items.map(([label, hot]) => (
        <li key={label} className={hot ? 'hot' : undefined}>{label}</li>
      ))}
    </ul>
  );
}

export function Team() {
  const section = useRef(null);
  const stages = useRef([]);
  useEffect(() => {
    if (!WEBGL) return;
    let dispose;
    let cancelled = false;
    import('../three/scanHeads').then(({ initScanHeads }) => {
      if (cancelled) return;
      const entries = TEAM.map((m, i) => m.model && { stage: stages.current[i], model: m.model }).filter(Boolean);
      dispose = initScanHeads(entries, section.current);
    });
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, []);

  return (
    <section id="team" className="section" ref={section}>
      <Head text="Profile" />
      <div className="team">
        {TEAM.map((m, i) => (
          <article key={m.name} className={m.vacant ? 'pf-card vacant' : 'pf-card'}>
            <p className="pf-code nav-font">{m.code}</p>
            <h3 className="pf-name rise">{m.name}</h3>
            <p className="pf-copy">{m.copy}</p>
            <div className="pf-stage" ref={(el) => (stages.current[i] = el)}>
              {m.vacant && (
                <div className="pf-vac">
                  <a className="pf-vac-btn nav-font cybr" href="#contact" data-text={m.vacant}>{m.vacant}</a>
                  <p className="nav-font">{m.meta}</p>
                </div>
              )}
              <p className="pf-subject nav-font">
                Scan {pad(i + 1)}/{pad(TEAM.length)} — {m.subject}
              </p>
            </div>
            <dl className="pf-readout nav-font">
              <div>
                <dt>{m.signal[0]}</dt>
                <dd>{m.signal[1]}</dd>
              </div>
              <div>
                <dt>{m.output[0]}</dt>
                <dd>{m.output[1]}</dd>
              </div>
            </dl>
            <Chips items={m.tags} />
          </article>
        ))}
      </div>
    </section>
  );
}
