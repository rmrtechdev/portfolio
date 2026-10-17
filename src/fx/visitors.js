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

// Sample cells so the comm link has somewhere to fly while real data is thin. They exist only in this
// module, never in storage or the API, and the Worker never deletes cells, so once the real count reaches
// the threshold they are gone for good. Labelled as samples so a hover never passes one off as a visitor.
const SAMPLE_UNTIL = 12;
const SAMPLE_CELLS = [
  [51.51, -0.13, 0, 'London, GB · sample'],
  [35.68, 139.69, 0, 'Tokyo, JP · sample'],
  [-23.55, -46.63, 0, 'São Paulo, BR · sample'],
  [52.52, 13.4, 0, 'Berlin, DE · sample'],
  [-33.87, 151.21, 0, 'Sydney, AU · sample'],
  [19.08, 72.88, 0, 'Mumbai, IN · sample'],
  [37.77, -122.42, 0, 'San Francisco, US · sample'],
  [6.52, 3.38, 0, 'Lagos, NG · sample'],
];

/** Real visits, plus the sample cells while fewer than SAMPLE_UNTIL real places exist. `places` stays real. */
export const withSamples = (v) => (v.places >= SAMPLE_UNTIL ? v : { ...v, cells: [...v.cells, ...SAMPLE_CELLS] });

/** Resolves to `{ places, cells: [[lat, lng, vpn, place], ...] }`, or null when unavailable. */
export async function loadVisits() {
  // Dev only: with no reachable API the samples still load, so the satellite can be tested locally.
  // Production builds compile this away, so there an outage or missing API never brings them back.
  const offline = import.meta.env.DEV ? withSamples({ places: 0, cells: [] }) : null;
  if (!API) return offline;
  try {
    const res = await fetch(`${API}/visits`);
    // Samples ride only on a real answer.
    return res.ok ? withSamples(await res.json()) : offline;
  } catch {
    return offline;
  }
}
