import { useEffect, useRef, useState } from 'react';
import { FAQ, TEAM, openMail } from '../data';
import { WEBGL, pad } from '../env';
import { useTypeOnView } from '../fx/hooks';

export function Head({ text, id }) {
  const [ref, { shown }] = useTypeOnView(text, { speed: 140, from: 1 });
  return (
    <h2 className="head" ref={ref} id={id} aria-label={text}>
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
            <h3 className="pf-name">{m.name}</h3>
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

export function Faq() {
  const [open, setOpen] = useState(() => new Set());
  const toggle = (i) =>
    setOpen((s) => {
      const n = new Set(s);
      n.has(i) ? n.delete(i) : n.add(i);
      return n;
    });
  return (
    <section id="faq" className="section">
      <Head text="FAQ" />
      <div className="faq">
        {FAQ.map(([q, a], i) => (
          <div key={q} className={open.has(i) ? 'faq-item open' : 'faq-item'}>
            <button className="faq-q" onClick={() => toggle(i)} aria-expanded={open.has(i)}>
              {q} <span>{open.has(i) ? '[-]' : '[+]'}</span>
            </button>
            {open.has(i) && (
              <p className="faq-a">
                {a}
                {i === FAQ.length - 1 && (
                  <>
                    {' '}
                    <a href="#contact" onClick={openMail}>Email me ↗</a>
                  </>
                )}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
