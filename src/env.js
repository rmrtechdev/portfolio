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
