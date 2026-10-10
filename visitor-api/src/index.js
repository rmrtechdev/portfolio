/**
 * Visitor map API (Cloudflare Worker + D1).
 *
 *   POST /visit   mark this visitor's ~1° cell as visited, at Cloudflare's own geo estimate (request.cf)
 *   GET  /visits  visited cells for the globe, edge-cached for 5 minutes
 *
 * Stores presence per cell only: no counts, no IPs, nothing derived from an IP.
 */

const MAX_CELLS = 400;
const CACHE_SECONDS = 300;

// Network operators whose exits are datacentres or commercial VPNs. The plotted point for these is
// the exit, not the person, so those cells are flagged. A heuristic, not proof.
const VPN_HINT =
  /\b(vpn|proxy|hosting|data ?cent(er|re)|colo|cloud|amazon|aws|google cloud|microsoft|azure|digitalocean|linode|akamai|ovh|hetzner|vultr|choopa|m247|datacamp|leaseweb|contabo|oracle|mullvad|nordvpn|tefincom|expressvpn|surfshark|proton|private internet|cdn77|packethub|tzulo|clouvider|g-core|zenlayer|psychz|quadranet)\b/i;

function cors(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowed = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  return allowed.includes(origin)
    ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', Vary: 'Origin' }
    : {};
}

async function recordVisit(request, env) {
  const cf = request.cf || {};
  const lat = Number(cf.latitude);
  const lng = Number(cf.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return { recorded: false };
  const vpn = VPN_HINT.test(cf.asOrganization || '') ? 1 : 0;
  const place = [cf.city, cf.country].filter(Boolean).join(', ') || null;
  // A cell stays flagged as an exit only while every visit to it looked like one.
  await env.DB.prepare(
    `INSERT INTO cells (id, lat, lng, place, vpn, last_seen) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
     ON CONFLICT(id) DO UPDATE SET
       place = COALESCE(cells.place, excluded.place),
       vpn = MIN(cells.vpn, excluded.vpn),
       last_seen = excluded.last_seen`
  ).bind(`${Math.round(lat)}_${Math.round(lng)}`, lat, lng, place, vpn, Math.floor(Date.now() / 1000)).run();
  return { recorded: true };
}

async function listVisits(env) {
  const { results } = await env.DB.prepare(
    'SELECT lat, lng, vpn, place FROM cells ORDER BY last_seen DESC LIMIT ?'
  ).bind(MAX_CELLS).all();
  const { n } = await env.DB.prepare('SELECT COUNT(*) AS n FROM cells').first();
  return {
    places: n,
    cells: results.map((r) => [Math.round(r.lat * 100) / 100, Math.round(r.lng * 100) / 100, r.vpn, r.place]),
  };
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const headers = { ...cors(request, env), 'Content-Type': 'application/json' };
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    if (url.pathname === '/visit' && request.method === 'POST') {
      return new Response(JSON.stringify(await recordVisit(request, env)), { headers: { ...headers, 'Cache-Control': 'no-store' } });
    }

    if (url.pathname === '/visits' && request.method === 'GET') {
      const cache = caches.default;
      const key = new Request(url.origin + url.pathname);
      let res = await cache.match(key);
      if (!res) {
        res = new Response(JSON.stringify(await listVisits(env)), {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=60, s-maxage=${CACHE_SECONDS}` },
        });
        ctx.waitUntil(cache.put(key, res.clone()));
      }
      // CORS is per-request, so it is layered on after the shared cached body.
      return new Response(res.body, { headers: { ...Object.fromEntries(res.headers), ...headers } });
    }

    return new Response('Not found', { status: 404, headers });
  },
};
