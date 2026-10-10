// Visitor map client. Without VITE_VISITS_API set, both calls are no-ops and the globe shows home only.
const API = import.meta.env.VITE_VISITS_API;
const COUNTED_KEY = 'rmr_visit_counted';
const RECOUNT_MS = 30 * 24 * 3600 * 1000;

const idle = (fn) => (window.requestIdleCallback ? requestIdleCallback(fn, { timeout: 4000 }) : setTimeout(fn, 1500));

/** Marks this browser's place at most once per 30 days, after load, off the critical path. */
export function countVisit() {
  if (!API) return;
  const run = () =>
    idle(() => {
      try {
        if (Date.now() - Number(localStorage.getItem(COUNTED_KEY) || 0) < RECOUNT_MS) return;
        localStorage.setItem(COUNTED_KEY, String(Date.now()));
      } catch {
        // Storage blocked: still record; a repeat only refreshes the same place.
      }
      fetch(`${API}/visit`, { method: 'POST', keepalive: true }).catch(() => {});
    });
  document.readyState === 'complete' ? run() : addEventListener('load', run, { once: true });
}

/** Resolves to `{ places, cells: [[lat, lng, vpn, place], ...] }`, or null when unavailable. */
export async function loadVisits() {
  if (!API) return null;
  try {
    const res = await fetch(`${API}/visits`);
    return res.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
