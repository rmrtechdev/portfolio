import { useEffect, useRef, useState } from 'react';
import emailjs from '@emailjs/browser';
import { BRIEF_NEEDS, BRIEF_TIMELINES, openMail } from '../data';
import { COARSE, REDUCED, WEBGL } from '../env';
import { scramble, useTypewriter } from '../fx/hooks';

const STEPS = [
  { key: 'need', prompt: '1/3 Choose the build', sub: 'What do you need? Pick any.', options: BRIEF_NEEDS, multi: true },
  { key: 'timeline', prompt: '2/3 Select your timeline', sub: 'When should it start?', options: BRIEF_TIMELINES },
  { key: 'contact', prompt: '3/3 Where do I reply?', sub: 'Email required. Anything else helps.' },
];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Intake() {
  const [step, setStep] = useState(0);
  const [brief, setBrief] = useState({ need: [], timeline: '', name: '', email: '', message: '' });
  const [status, setStatus] = useState('idle');
  const [shake, setShake] = useState(false);
  const cur = STEPS[step];
  const prompt = useTypewriter(status === 'sent' ? 'Brief received' : cur.prompt, { speed: 30 });

  const pick = (v) =>
    setBrief((b) =>
      cur.multi ? { ...b, need: b.need.includes(v) ? b.need.filter((x) => x !== v) : [...b.need, v] } : { ...b, [cur.key]: v }
    );
  const valid = step === 0 ? brief.need.length > 0 : step === 1 ? !!brief.timeline : EMAIL_RE.test(brief.email);
  const sendLabel = status === 'sending' ? 'Sending…' : step < 2 ? 'Next →' : 'Send brief →';
  const subject = `[Brief] ${brief.need.join(' + ')} · ${brief.timeline}`;

  const next = async () => {
    if (!valid) {
      setShake(true);
      setTimeout(() => setShake(false), 400);
      return;
    }
    if (step < 2) return setStep(step + 1);
    setStatus('sending');
    try {
      await emailjs.send(
        'service_tyxx1cv',
        'contact_form',
        { user_name: brief.name, user_email: brief.email, subject, message: brief.message || '(no message)' },
        'user_6nSZeKtgq6XdR3AX8fsxk'
      );
      setStatus('sent');
    } catch {
      setStatus('error');
    }
  };

  return (
    <div className={shake ? 'intake shake' : 'intake'}>
      <p className="ik-live nav-font">
        <i aria-hidden="true" /> Go live
      </p>
      <p className="ik-prompt" aria-live="polite">{prompt.shown.replace('█', '')}<span className="ik-cur" aria-hidden="true">█</span></p>
      {status === 'sent' ? (
        <p className="ik-sub">Thanks{brief.name ? `, ${brief.name}` : ''}. The reply goes to {brief.email}.</p>
      ) : (
        <>
          <p className="ik-sub">{cur.sub}</p>
          {cur.options ? (
            <div className="ik-chips" role="group" aria-label={cur.sub}>
              {cur.options.map((o) => {
                const on = cur.multi ? brief.need.includes(o) : brief[cur.key] === o;
                return (
                  <button key={o} className={on ? 'ik-chip on' : 'ik-chip'} aria-pressed={on} onClick={() => pick(o)}>
                    {o}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="ik-fields">
              <input placeholder="Name" aria-label="Name" autoComplete="name" value={brief.name} onChange={(e) => setBrief({ ...brief, name: e.target.value })} />
              <input
                placeholder="Email *"
                aria-label="Email"
                type="email"
                autoComplete="email"
                required
                value={brief.email}
                onChange={(e) => setBrief({ ...brief, email: e.target.value })}
                onKeyDown={(e) => e.key === 'Enter' && next()}
              />
              <textarea placeholder="Anything else" aria-label="Message" rows="3" value={brief.message} onChange={(e) => setBrief({ ...brief, message: e.target.value })} />
            </div>
          )}
          <div className="ik-nav nav-font">
            <button className={valid ? 'ik-send cybr ready' : 'ik-send cybr'} onClick={next} disabled={status === 'sending'} data-text={sendLabel}>
              {sendLabel}
            </button>
            {step > 0 && (
              <button className="ik-back" onClick={() => setStep(step - 1)}>
                ← Back
              </button>
            )}
            {step === 2 && <a href="#contact" onClick={(e) => openMail(e, subject, `${brief.message}\n\n— ${brief.name}`)}>Or one tap in your mail app ↗</a>}
          </div>
          {status === 'error' && <p className="ik-err nav-font">Send failed. Use the email below.</p>}
        </>
      )}
      <p className="ik-divider nav-font">Or email me directly ↓</p>
    </div>
  );
}

/** Shared backdrop for the archive and contact sections: the hologram is centred on the seam between them. */
export function JarvisZone({ children }) {
  const zone = useRef(null);
  const band = useRef(null);
  useEffect(() => {
    if (!WEBGL || REDUCED) return;
    let dispose;
    let cancelled = false;
    // Measured against the band itself, which starts above the zone (see .jarvis-zone > .car-band).
    const anchor = () => {
      const contact = zone.current.querySelector('#contact');
      return contact ? contact.getBoundingClientRect().top - band.current.getBoundingClientRect().top : band.current.clientHeight / 2;
    };
    // The hologram's code and model are the page's heaviest download, so they wait until the reader is
    // a couple of screens away rather than competing with the hero.
    const io = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        io.disconnect();
        import('../three/jarvis').then(({ initJarvis }) => !cancelled && (dispose = initJarvis(band.current, { anchor })));
      },
      { rootMargin: '200% 0px' }
    );
    io.observe(zone.current);
    return () => {
      cancelled = true;
      io.disconnect();
      dispose?.();
    };
  }, []);
  return (
    <div className="jarvis-zone" ref={zone}>
      <div className="car-band" ref={band} aria-hidden="true" />
      {children}
    </div>
  );
}

export default function Contact() {
  const email = useRef(null);
  return (
    <section id="contact" className="contact-band">
      <div className="contact-ui">
        <Intake />
        <a className="endcap" href="#contact" onClick={openMail} onPointerEnter={() => !COARSE && scramble(email.current)}>
          <span ref={email}>Write to me ↗</span>
        </a>
      </div>
    </section>
  );
}
