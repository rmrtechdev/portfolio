import { Suspense, lazy, useEffect, useState } from 'react';
import { Loader, ScrollProgress, SideRail, TopBar } from './chrome/Chrome';
import { FxDefs, GlitchCursor, RgbBlur } from './fx/FxLayer';
import { THREE_D } from './env';
import { STATEMENT } from './data';
import { Hero, MovingText, Specializing } from './sections/Intro';
import { Team } from './sections/Profile';
import { Archive, Services, Work } from './sections/Work';
import Contact, { JarvisZone } from './sections/Contact';
import { countVisit } from './fx/visitors';

const World = lazy(() => import('./three/World'));

export default function App() {
  const [sceneReady, setSceneReady] = useState(!THREE_D);
  const [progress, setProgress] = useState(0);
  const [entering, setEntering] = useState(false);
  const [entered, setEntered] = useState(!THREE_D);
  const [thermal, setThermal] = useState(false);
  const [visitors, setVisitors] = useState(null);
  // If the world chunk never arrives, the cover still has to drop.
  useEffect(() => {
    if (!entering) return;
    const id = setTimeout(() => setEntered(true), 2500);
    return () => clearTimeout(id);
  }, [entering]);
  useEffect(countVisit, []);
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && (e.target.classList.add('in'), io.unobserve(e.target))),
      { rootMargin: '0px 0px -10% 0px' }
    );
    document.querySelectorAll('.rise').forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    const id = setTimeout(() => setSceneReady(true), 6000);
    return () => clearTimeout(id);
  }, []);

  return (
    <>
      <FxDefs />
      {THREE_D && (
        <Suspense fallback={null}>
          <World
            thermal={thermal}
            progress={progress}
            entering={entering}
            onEntered={() => setEntered(true)}
            onReady={() => setSceneReady(true)}
            visitors={visitors}
          />
        </Suspense>
      )}
      {THREE_D && !entered && <Loader ready={sceneReady} onProgress={setProgress} onComplete={() => setEntering(true)} />}
      <a className="skip" href="#work">Skip to work</a>
      <TopBar started={entered} />
      <SideRail />
      <ScrollProgress />
      <main>
        <Hero thermal={thermal} onThermal={setThermal} />
        <Specializing visitors={visitors} onVisitors={setVisitors} />
        <MovingText />
        <Team />
        <MovingText text={STATEMENT} sep=" · " label small />
        <Services />
        <Work />
        <JarvisZone>
          <Archive />
          <Contact />
        </JarvisZone>
      </main>
      <footer className="footer nav-font">
        <span>© {new Date().getFullYear()} R.M.Roman — all rights reserved</span>
        <span>Visitor map: approximate city from Cloudflare. IP addresses are never stored.</span>
        <a href="#top">Back to top ↑</a>
      </footer>
      <RgbBlur />
      <GlitchCursor />
    </>
  );
}
