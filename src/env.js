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

/** Where the Jarvis hologram sits on screen (client px), written by its renderer; `possess` flows back from the strands. */
export const jarvisLink = { x: 0, y: 0, r: 0, on: false, possess: 0 };
