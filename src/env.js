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

/** Phone tilt as orbit offsets (radians) for the hero camera, relative to how the phone was held at the first reading. */
export const tilt = { on: false, yaw: 0, pitch: 0 };
export function startTilt() {
  if (tilt.on) return;
  tilt.on = true;
  let base;
  const clamp1 = (v) => Math.max(-1, Math.min(1, v));
  // ponytail: portrait axes only; landscape phones get swapped yaw/pitch.
  addEventListener('deviceorientation', (e) => {
    if (e.gamma == null) return;
    base ??= [e.gamma, e.beta];
    tilt.yaw = -clamp1((e.gamma - base[0]) / 40) * 0.7;
    tilt.pitch = clamp1((e.beta - base[1]) / 40) * 0.3;
  });
}

/** Where the Jarvis hologram sits on screen (client px), written by its renderer; `possess` flows back from the strands. */
export const jarvisLink = { x: 0, y: 0, r: 0, on: false, possess: 0 };
