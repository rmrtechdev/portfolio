import { useEffect, useState } from 'react';
import { Loader, ScrollProgress, SideRail, TopBar } from './chrome/Chrome';
import { FxDefs, GlitchCursor, RgbBlur } from './fx/FxLayer';
import { REDUCED, THREE_D } from './env';
import { Hero, MovingText, Specializing, VideoBand } from './sections/Intro';
import { Team } from './sections/Profile';
import { Archive, Services, Work } from './sections/Work';
import Contact, { JarvisZone } from './sections/Contact';
import { countVisit } from './fx/visitors';

export default function App() {
  const [sceneReady, setSceneReady] = useState(!THREE_D);
  const [entered, setEntered] = useState(REDUCED);
  useEffect(countVisit, []);
  useEffect(() => {
    const id = setTimeout(() => setSceneReady(true), 6000);
    return () => clearTimeout(id);
  }, []);

  return (
    <>
      <FxDefs />
      {!REDUCED && <Loader ready={sceneReady} onDone={() => setEntered(true)} />}
      <a className="skip" href="#work">Skip to work</a>
      <TopBar started={entered} />
      <SideRail />
      <ScrollProgress />
      <main>
        <Hero onReady={() => setSceneReady(true)} />
        <Specializing />
        <VideoBand />
        <MovingText />
        <Team />
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
