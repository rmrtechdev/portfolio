export const pad = (n) => String(n).padStart(2, '0');
export const REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
export const COARSE = window.matchMedia('(pointer: coarse)').matches;
export const WEBGL = (() => {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
})();
export const THREE_D = WEBGL && !REDUCED;
export const media = (path) => `${import.meta.env.BASE_URL}media/${path}`;

/** Load progress as the loading strands currently show it; the loader's count reads this, so both are one bar. */
export const loadShown = { value: 0, live: false };

/** iOS gates device orientation behind a permission prompt that needs a tap, so tilt is opt-in there. */
export const TILT_ASK = typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function';

/**
 * Raw device orientation (alpha, beta, gamma in degrees) for the hero's AR look-around; World.jsx turns it into a
 * view direction. Fires 'rmr-tilt' on each change, so the extra phone panels can mount.
 */
export const tilt = { on: false, e: null };
const onOrient = (e) => e.alpha != null && (tilt.e = [e.alpha, e.beta, e.gamma]);
export function startTilt() {
  if (tilt.on) return;
  tilt.on = true;
  addEventListener('deviceorientation', onOrient);
  dispatchEvent(new Event('rmr-tilt'));
}
export function stopTilt() {
  if (!tilt.on) return;
  tilt.on = false;
  tilt.e = null;
  removeEventListener('deviceorientation', onOrient);
  dispatchEvent(new Event('rmr-tilt'));
}

/**
 * AR view: camera stays at the hero spot and look-around covers the whole page, which is relaid out as sticky
 * `.ar-moment`s (html.ar in styles.css). Fires 'rmr-ar' so React state can follow.
 */
export const ar = { on: false };
export function setAR(on) {
  // The two layouts differ wildly in height, so the reader is put back on the moment they were looking at.
  // Outside AR some moments are display: contents wrappers with no box of their own; their first card stands in.
  const box = (m) => (m.getBoundingClientRect().height ? m : (m.firstElementChild?.firstElementChild ?? m)).getBoundingClientRect();
  const here = [...document.querySelectorAll('.ar-moment')].filter((m) => box(m).top <= innerHeight / 2).pop();
  ar.on = on;
  document.documentElement.classList.toggle('ar', on);
  if (here) scrollTo({ top: scrollY + box(here).top, behavior: 'instant' });
  dispatchEvent(new Event('rmr-ar'));
}

/** Where the Jarvis hologram sits on screen (client px), written by its renderer; `possess` flows back from the strands. */
export const jarvisLink = { x: 0, y: 0, r: 0, on: false, possess: 0 };
