// bun src/three/maze.check.js
import { DIRS, createGame, makeMaze, newGame, random, stepGame } from './maze.js';

for (const [W, H] of [
  [29, 13],
  [15, 19],
]) {
  for (let seed = 0; seed < 300; seed++) {
    const m = makeMaze(W, H, random(seed));
    const path = (x, y) => x >= 0 && y >= 0 && x < W && y < H && m.grid[y * W + x] === 1;
    let tiles = 0;
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (m.grid[y * W + x] !== m.grid[y * W + W - 1 - x]) throw new Error(`asymmetric ${W}x${H} seed ${seed}`);
        if ((x === 0 || y === 0 || x === W - 1 || y === H - 1) && path(x, y)) throw new Error('border breached');
        if (!path(x, y)) continue;
        tiles++;
        if (DIRS.filter(([dx, dy]) => path(x + dx, y + dy)).length < 2) throw new Error(`dead end ${x},${y} seed ${seed}`);
      }
    const seen = new Set([m.start.join()]);
    const q = [m.start];
    while (q.length) {
      const [x, y] = q.pop();
      for (const [dx, dy] of DIRS)
        if (path(x + dx, y + dy) && !seen.has(`${x + dx},${y + dy}`)) {
          seen.add(`${x + dx},${y + dy}`);
          q.push([x + dx, y + dy]);
        }
    }
    if (seen.size !== tiles) throw new Error(`disconnected ${W}x${H} seed ${seed}`);
    if (!path(...m.home) || !m.corners.every((c) => path(...c))) throw new Error('home or corner walled');
    if (!path(m.start[0] - 1, m.start[1]) || !path(m.start[0] + 1, m.start[1])) throw new Error(`spawn not on a horizontal run, seed ${seed}`);
  }
}

const g = createGame(29, 13);
const seen = { clear: 0, chomp: 0, die: 0, revive: 0, power: 0 };
g.on = (t) => t in seen && seen[t]++;
newGame(g, true);
for (let i = 0; i < 60 * 600; i++) stepGame(g, 1 / 60);
console.log('attract 10 min:', seen, 'level', g.level);
if (!seen.clear || !seen.power) throw new Error('autopilot never clears a maze');
if (seen.chomp && !seen.revive) throw new Error('eaten chasers never get home');

const p = createGame(29, 13);
newGame(p, false);
stepGame(p, 2);
const before = p.player.x;
p.input.dir = 3;
p.input.held = true;
for (let i = 0; i < 6; i++) stepGame(p, 1 / 60);
p.input.dir = 1;
p.input.held = false;
p.input.at = p.time;
stepGame(p, 1 / 60);
if (p.player.d !== 1 && p.player.moving) throw new Error('reverse mid-roll ignored');
console.log('player start', before, '-> reversal ok; all checks passed');
