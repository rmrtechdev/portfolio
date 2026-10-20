/**
 * Cube Run game logic: a braided, mirror-symmetric maze on an odd grid (odd/odd tiles are cells, even lines are
 * walls), one rolling player and three chasers with arcade-style targeting. No rendering and no per-frame
 * allocation; the renderer reads the state and listens through `g.on(type, x, z, n)`.
 */

export const DIRS = [
  [0, -1],
  [-1, 0],
  [0, 1],
  [1, 0],
];
export const OPP = [2, 3, 0, 1];
const SCHEDULE = [7, 20, 7, 20, 5, Infinity];
const HIT = 0.7;
const BUFFER = 0.45;

export function random(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeMaze(W, H, rand) {
  const grid = new Uint8Array(W * H);
  const at = (x, y) => y * W + x;
  const c = (W - 1) >> 1;
  const cy = (H - 1) >> 1;
  const open = (x, y) => (grid[at(x, y)] = grid[at(W - 1 - x, y)] = 1);
  const isPath = (x, y) => x > 0 && y > 0 && x < W - 1 && y < H - 1 && grid[at(x, y)] === 1;
  const exits = (x, y) => DIRS.reduce((n, [dx, dy]) => n + (isPath(x + dx, y + dy) ? 1 : 0), 0);

  const stack = [[1, 1]];
  open(1, 1);
  while (stack.length) {
    const [x, y] = stack[stack.length - 1];
    const opts = DIRS.filter(([dx, dy]) => {
      const nx = x + dx * 2;
      const ny = y + dy * 2;
      return nx > 0 && nx <= c && ny > 0 && ny < H - 1 && !grid[at(nx, ny)];
    });
    if (!opts.length) {
      stack.pop();
      continue;
    }
    const [dx, dy] = opts[(rand() * opts.length) | 0];
    open(x + dx, y + dy);
    open(x + dx * 2, y + dy * 2);
    stack.push([x + dx * 2, y + dy * 2]);
  }

  // Braid: an arcade maze has no dead ends, so every chase can be escaped by a loop.
  for (let y = 1; y < H - 1; y += 2)
    for (let x = 1; x <= c; x += 2) {
      if (exits(x, y) > 1) continue;
      const walls = DIRS.filter(([dx, dy]) => {
        const nx = x + dx * 2;
        const ny = y + dy * 2;
        return nx > 0 && ny > 0 && nx < W - 1 && ny < H - 1 && !isPath(x + dx, y + dy);
      });
      walls.sort((a, b) => exits(x + a[0] * 2, y + a[1] * 2) - exits(x + b[0] * 2, y + b[1] * 2));
      const [dx, dy] = walls[0];
      open(x + dx, y + dy);
    }
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x <= c; x++)
      if ((x + y) % 2 === 1 && !isPath(x, y) && rand() < 0.1) {
        const horiz = y % 2 === 1;
        if (isPath(x - (horiz ? 1 : 0), y - (horiz ? 0 : 1)) && isPath(x + (horiz ? 1 : 0), y + (horiz ? 0 : 1))) open(x, y);
      }

  const room = { x0: c - 2, x1: c + 2, y0: cy - 1, y1: cy + 1 };
  for (let y = room.y0; y <= room.y1; y++) for (let x = room.x0; x <= room.x1; x++) open(x, y);
  if (c % 2 === 0) for (let y = 1; y < H - 1; y += 2) if (rand() < 0.25) open(c, y);

  const inRoom = (x, y) => x >= room.x0 && x <= room.x1 && y >= room.y0 && y <= room.y1;
  let start = null;
  let best = Infinity;
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      if (!isPath(x, y) || inRoom(x, y)) continue;
      const sideways = isPath(x - 1, y) && isPath(x + 1, y);
      const d = (x - c) ** 2 + (y - cy - 3) ** 2 * 1.5 + (y <= room.y1 + 1 ? 99 : 0) + (sideways ? 0 : 999);
      if (d < best) [best, start] = [d, [x, y]];
    }

  const corners = [
    [1, 1],
    [W - 2, 1],
    [1, H - 2],
    [W - 2, H - 2],
  ];
  const pellets = new Uint8Array(W * H);
  for (let i = 0; i < W * H; i++) pellets[i] = grid[i];
  for (let y = room.y0; y <= room.y1; y++) for (let x = room.x0; x <= room.x1; x++) pellets[at(x, y)] = 0;
  pellets[at(...start)] = 0;
  for (const [x, y] of corners) pellets[at(x, y)] = 2;
  return { W, H, grid, pellets, start, home: [c, cy], room, corners };
}

const actor = () => ({ x: 0, y: 0, d: 0, p: 0, moving: false, wx: 0, wz: 0 });

export function createGame(W, H) {
  const g = {
    W,
    H,
    on: () => {},
    auto: true,
    level: 0,
    score: 0,
    lives: 3,
    phase: 'ready',
    timer: 0,
    time: 0,
    fright: 0,
    frightFor: 0,
    chain: 0,
    modeIdx: 0,
    modeT: 0,
    left: 0,
    seed: (Math.random() * 1e9) | 0,
    rand: Math.random,
    maze: null,
    player: actor(),
    chasers: [0, 1, 2].map((kind) => ({ ...actor(), kind, state: 'home', fright: false, release: 0 })),
    input: { dir: -1, at: -Infinity, held: false },
    queue: new Int32Array(W * H),
    first: new Int8Array(W * H),
    seen: new Uint8Array(W * H),
    homeDist: new Int16Array(W * H),
  };
  return g;
}

export const open = (g, x, y) => x >= 0 && y >= 0 && x < g.W && y < g.H && g.maze.grid[y * g.W + x] === 1;
const canGo = (g, a, d) => open(g, a.x + DIRS[d][0], a.y + DIRS[d][1]);

export function loadLevel(g, level) {
  g.level = level;
  g.rand = random(g.seed + level * 7919);
  g.maze = makeMaze(g.W, g.H, g.rand);
  g.left = g.maze.pellets.reduce((n, v) => n + (v ? 1 : 0), 0);
  const { W, queue, homeDist } = g;
  homeDist.fill(-1);
  const h = g.maze.home[1] * W + g.maze.home[0];
  homeDist[h] = 0;
  queue[0] = h;
  for (let head = 0, tail = 1; head < tail; head++) {
    const i = queue[head];
    for (const [dx, dy] of DIRS) {
      const x = (i % W) + dx;
      const y = ((i / W) | 0) + dy;
      if (open(g, x, y) && homeDist[y * W + x] < 0) {
        homeDist[y * W + x] = homeDist[i] + 1;
        queue[tail++] = y * W + x;
      }
    }
  }
  g.on('maze');
  resetActors(g);
}

export function resetActors(g) {
  const { start, home } = g.maze;
  Object.assign(g.player, { x: start[0], y: start[1], d: 3, p: 0, moving: false });
  g.chasers.forEach((c, i) => Object.assign(c, { x: home[0] - 1 + i, y: home[1], d: 0, p: 0, moving: false, state: 'home', fright: false, release: [0.4, 2.5, 5][i] }));
  g.fright = 0;
  g.modeIdx = 0;
  g.modeT = SCHEDULE[0];
  g.phase = 'ready';
  g.timer = g.auto ? 0.4 : 1.4;
  g.input.dir = -1;
  place(g);
  g.on('reset');
}

export function newGame(g, auto) {
  g.auto = auto;
  g.score = 0;
  g.lives = 3;
  g.seed = (Math.random() * 1e9) | 0;
  loadLevel(g, 1);
}

export const speed = (g) => Math.min(8, 5.2 + 0.4 * (g.level - 1));
const chaserSpeed = (g, c) => speed(g) * (c.state === 'eyes' ? 2.1 : c.fright ? 0.55 : Math.min(0.97, 0.8 + 0.04 * (g.level - 1)));

function place(g) {
  const ox = (g.W - 1) / 2;
  const oz = (g.H - 1) / 2;
  for (const a of [g.player, ...g.chasers]) {
    const t = a.moving ? a.p : 0;
    a.wx = a.x + DIRS[a.d][0] * t - ox;
    a.wz = a.y + DIRS[a.d][1] * t - oz;
  }
}

function reverse(a) {
  if (!a.moving) return;
  a.x += DIRS[a.d][0];
  a.y += DIRS[a.d][1];
  a.d = OPP[a.d];
  a.p = 1 - a.p;
}

function eat(g) {
  const P = g.player;
  const i = P.y * g.W + P.x;
  const v = g.maze.pellets[i];
  if (!v) return;
  g.maze.pellets[i] = 0;
  g.left--;
  g.score += v === 2 ? 50 : 10;
  g.on(v === 2 ? 'power' : 'eat', P.wx, P.wz, i);
  if (v === 2) {
    g.frightFor = g.fright = Math.max(1.6, 7 - (g.level - 1) * 0.8);
    g.chain = 0;
    for (const c of g.chasers)
      if (c.state === 'out') {
        c.fright = true;
        reverse(c);
      }
  }
  if (!g.left) {
    g.phase = 'clear';
    g.timer = 1.8;
    g.on('clear', P.wx, P.wz);
  }
}

/** Autopilot for the attract loop: BFS to the nearest pellet (or frightened chaser) through tiles chasers don't threaten. */
function autopilot(g) {
  const { W, queue, first, seen } = g;
  const P = g.player;
  seen.fill(0);
  for (const c of g.chasers) {
    if (c.state === 'eyes' || c.fright) continue;
    for (let dy = -2; dy <= 2; dy++)
      for (let dx = -2; dx <= 2; dx++) {
        const x = c.x + dx;
        const y = c.y + dy;
        if (x >= 0 && y >= 0 && x < W && y < g.H && Math.abs(dx) + Math.abs(dy) <= 2) seen[y * W + x] = 1;
      }
  }
  const s = P.y * W + P.x;
  seen[s] = 1;
  let head = 0;
  let tail = 0;
  for (let d = 0; d < 4; d++) {
    const x = P.x + DIRS[d][0];
    const y = P.y + DIRS[d][1];
    const i = y * W + x;
    if (!open(g, x, y) || seen[i]) continue;
    seen[i] = 1;
    first[i] = d;
    queue[tail++] = i;
  }
  while (head < tail) {
    const i = queue[head++];
    const x = i % W;
    const y = (i / W) | 0;
    if (g.maze.pellets[i] || g.chasers.some((c) => c.fright && c.x === x && c.y === y)) return first[i];
    for (let d = 0; d < 4; d++) {
      const nx = x + DIRS[d][0];
      const ny = y + DIRS[d][1];
      const n = ny * W + nx;
      if (!open(g, nx, ny) || seen[n]) continue;
      seen[n] = 1;
      first[n] = first[i];
      queue[tail++] = n;
    }
  }
  let pick = -1;
  let far = -1;
  for (let d = 0; d < 4; d++) {
    if (!canGo(g, P, d)) continue;
    const x = P.x + DIRS[d][0];
    const y = P.y + DIRS[d][1];
    let near = Infinity;
    for (const c of g.chasers) near = Math.min(near, Math.abs(c.x - x) + Math.abs(c.y - y));
    if (near > far) [far, pick] = [near, d];
  }
  return pick;
}

function wanted(g) {
  const I = g.input;
  return I.dir >= 0 && (I.held || g.time - I.at < BUFFER) ? I.dir : -1;
}

function movePlayer(g, dt) {
  const P = g.player;
  const want = g.auto ? -1 : wanted(g);
  if (!P.moving) {
    const d = g.auto ? autopilot(g) : want;
    if (d < 0 || !canGo(g, P, d)) return;
    P.d = d;
    P.moving = true;
    P.p = 0;
    if (!g.auto && !g.input.held) g.input.dir = -1;
  } else if (want === OPP[P.d]) {
    g.on('roll', 0, 0, P.d);
    reverse(P);
  }
  P.p += speed(g) * dt;
  while (P.moving && P.p >= 1) {
    P.p -= 1;
    g.on('roll', 0, 0, P.d);
    P.x += DIRS[P.d][0];
    P.y += DIRS[P.d][1];
    place(g);
    eat(g);
    const next = g.auto ? autopilot(g) : wanted(g);
    if (next >= 0 && canGo(g, P, next)) {
      if (next !== P.d) g.on('turn');
      P.d = next;
      if (!g.auto && !g.input.held) g.input.dir = -1;
    } else if (!canGo(g, P, P.d)) {
      P.moving = false;
      P.p = 0;
      g.on('stop');
    }
  }
}

function target(g, c) {
  const P = g.player;
  const { W, H } = g;
  const corner = [
    [W - 2, -2],
    [1, -2],
    [W - 2, H + 1],
  ][c.kind];
  if (g.modeIdx % 2 === 0) return corner;
  if (c.kind === 0) return [P.x, P.y];
  if (c.kind === 1) return [P.x + DIRS[P.d][0] * 4, P.y + DIRS[P.d][1] * 4];
  return (c.x - P.x) ** 2 + (c.y - P.y) ** 2 > 36 ? [P.x, P.y] : corner;
}

function steer(g, c) {
  const back = c.moving ? OPP[c.d] : -1;
  let pick = -1;
  if (c.state === 'eyes') {
    let best = Infinity;
    for (let d = 0; d < 4; d++) {
      if (!canGo(g, c, d)) continue;
      const dist = g.homeDist[(c.y + DIRS[d][1]) * g.W + c.x + DIRS[d][0]];
      if (dist < best) [best, pick] = [dist, d];
    }
  } else if (c.fright) {
    const start = (g.rand() * 4) | 0;
    for (let k = 0; k < 4 && pick < 0; k++) {
      const d = (start + k) % 4;
      if (d !== back && canGo(g, c, d)) pick = d;
    }
  } else {
    const [tx, ty] = target(g, c);
    let best = Infinity;
    for (let d = 0; d < 4; d++) {
      if (d === back || !canGo(g, c, d)) continue;
      const dist = (c.x + DIRS[d][0] - tx) ** 2 + (c.y + DIRS[d][1] - ty) ** 2;
      if (dist < best) [best, pick] = [dist, d];
    }
  }
  if (pick < 0) pick = back;
  c.d = pick;
  c.moving = pick >= 0;
}

function moveChasers(g, dt) {
  const [hx, hy] = g.maze.home;
  for (const c of g.chasers) {
    if (c.state === 'home') {
      if ((c.release -= dt) > 0) continue;
      c.state = 'out';
      steer(g, c);
    }
    c.p += chaserSpeed(g, c) * dt;
    while (c.moving && c.p >= 1) {
      c.p -= 1;
      c.x += DIRS[c.d][0];
      c.y += DIRS[c.d][1];
      if (c.state === 'eyes' && c.x === hx && c.y === hy) {
        Object.assign(c, { state: 'home', release: 0.8, p: 0, moving: false });
        g.on('revive');
        break;
      }
      steer(g, c);
    }
  }
}

function collide(g) {
  const P = g.player;
  for (const c of g.chasers) {
    if (c.state !== 'out' || Math.hypot(c.wx - P.wx, c.wz - P.wz) > HIT) continue;
    if (c.fright) {
      c.state = 'eyes';
      c.fright = false;
      const pts = 200 << g.chain++;
      g.score += pts;
      g.on('chomp', c.wx, c.wz, pts);
    } else {
      g.phase = 'dying';
      g.timer = 1.5;
      g.on('die', P.wx, P.wz);
      return;
    }
  }
}

export function stepGame(g, dt) {
  g.time += dt;
  if (g.phase !== 'run') {
    if ((g.timer -= dt) > 0) return;
    if (g.phase === 'ready') {
      g.phase = 'run';
      g.on('go');
    }
    else if (g.phase === 'clear') loadLevel(g, g.level + 1);
    else if (g.phase === 'dying') {
      if (!g.auto && --g.lives <= 0) {
        g.phase = 'over';
        g.on('over');
        return;
      }
      g.on('lives');
      resetActors(g);
    }
    return;
  }
  if (g.fright > 0) {
    if ((g.fright -= dt) <= 0) for (const c of g.chasers) c.fright = false;
  } else if ((g.modeT -= dt) <= 0) {
    g.modeT = SCHEDULE[++g.modeIdx] ?? Infinity;
    for (const c of g.chasers) if (c.state === 'out') reverse(c);
  }
  movePlayer(g, dt);
  if (g.phase !== 'run') return;
  moveChasers(g, dt);
  place(g);
  collide(g);
}
