/* Golden age: mechanics from 1980 to 1984. */
(function () {
  'use strict';
  const { add, bfs, distField, DIRS4, DIRS8, clamp, sign, inb, DIM } = Atlas;

  const MAZE = [
    '##########',
    '#o......o#',
    '#.##..##.#',
    '#...##...#',
    '##.#..#.##',
    '#..#..#..#',
    '#.##..##.#',
    '#........#',
    '#o.#..#.o#',
    '##########',
  ];
  const PEN = new Set(['4,4', '5,4', '4,5', '5,5']);

  add({
    id: 'pacman',
    year: 1980,
    title: 'Maze chase with reversal',
    games: ['Pac-Man (1980)', 'Lady Bug (1981)'],
    essence: 'Clear every pellet in a maze while chasers close in. A power pellet briefly flips the roles: the hunters flee and can be eaten.',
    channels: { agent: 'eater', enemy: 'chasers (dim = frightened)', reward: 'power pellets (dim = pellets)', wall: 'maze' },
    fps: 6,
    init() {
      const food = new Map();
      MAZE.forEach((row, y) => [...row].forEach((c, x) => {
        if (c === '.' && !PEN.has(`${x},${y}`)) food.set(`${x},${y}`, 'dot');
        if (c === 'o') food.set(`${x},${y}`, 'power');
      }));
      food.delete('4,1');
      return {
        me: [4, 1], prev: [4, 1], food, fright: 0, t: 0, dead: false,
        ghosts: [[4, 4], [5, 4], [4, 5]].map((p, i) => ({ p, prev: p, wait: 6 + i * 9, scared: false })),
      };
    },
    tick(s, r) {
      s.t++;
      const open = (x, y) => MAZE[y][x] !== '#';
      const active = s.ghosts.filter((g) => g.wait === 0);
      const threats = active.filter((g) => !g.scared).map((g) => g.p);
      const near = distField(10, 10, threats, open);
      const danger = (x, y) => near[y * 10 + x] >= 0 && near[y * 10 + x] <= 2;

      // agent: hunt scared ghosts while powered, else nearest pellet away from danger
      let path = null;
      const scared = active.filter((g) => g.scared);
      if (scared.length && s.fright > 4) path = bfs(10, 10, s.me, (x, y) => scared.some((g) => g.p[0] === x && g.p[1] === y), open);
      if (!path) {
        // a cell is safe when the eater reaches it before any chaser could;
        // prefer pellets that are close to us and far from them
        const mine = distField(10, 10, [s.me], (x, y) => open(x, y) && !danger(x, y));
        const ghostNear = threats.length && near[s.me[1] * 10 + s.me[0]] <= 4;
        let best = null, bs = Infinity;
        for (const [k, type] of s.food) {
          const [x, y] = k.split(',').map(Number), i = y * 10 + x;
          if (mine[i] < 0 || (near[i] >= 0 && mine[i] >= near[i])) continue;
          const score = mine[i] - 0.6 * Math.min(near[i] < 0 ? 8 : near[i], 8) - (type === 'power' && ghostNear ? 6 : 0);
          if (score < bs) { bs = score; best = [x, y]; }
        }
        if (best) path = bfs(10, 10, s.me, (x, y) => x === best[0] && y === best[1], (x, y) => open(x, y) && !danger(x, y));
      }
      if (!path) {
        // cornered: step to the open neighbour farthest from any threat
        let best = s.me, bd = -1;
        for (const [dx, dy] of DIRS4) {
          const x = s.me[0] + dx, y = s.me[1] + dy, d = near[y * 10 + x];
          if (open(x, y) && d > bd) { bd = d; best = [x, y]; }
        }
        path = [best];
      }
      s.prev = s.me;
      s.me = path[0];
      const k = `${s.me[0]},${s.me[1]}`;
      if (s.food.get(k) === 'power') { s.fright = 22; s.ghosts.forEach((g) => (g.scared = g.wait === 0)); }
      s.food.delete(k);
      if (s.fright > 0 && --s.fright === 0) s.ghosts.forEach((g) => (g.scared = false));

      // chasers: mostly follow the shortest path; scared ones drift away at half speed
      for (const g of s.ghosts) {
        if (g.wait > 0) { g.wait--; continue; }
        if (g.scared ? s.t % 2 === 0 : s.t % 2 === 1) continue;
        const moves = DIRS4.map(([dx, dy]) => [g.p[0] + dx, g.p[1] + dy])
          .filter(([x, y]) => open(x, y) && !(x === g.prev[0] && y === g.prev[1]));
        let next;
        if (g.scared) {
          const fromMe = distField(10, 10, [s.me], open);
          next = moves.sort((a, b) => fromMe[b[1] * 10 + b[0]] - fromMe[a[1] * 10 + a[0]])[0];
        } else if (r.chance(0.65)) {
          next = (bfs(10, 10, g.p, (x, y) => x === s.me[0] && y === s.me[1], open) || [])[0];
        }
        next = next || r.pick(moves.length ? moves : [g.prev]);
        g.prev = g.p;
        g.p = next;
      }

      for (const g of s.ghosts) {
        if (g.wait > 0) continue;
        const hit = (g.p[0] === s.me[0] && g.p[1] === s.me[1]) ||
          (g.p[0] === s.prev[0] && g.p[1] === s.prev[1] && g.prev[0] === s.me[0] && g.prev[1] === s.me[1]);
        if (!hit) continue;
        if (g.scared) { g.p = g.prev = [4, 4]; g.scared = false; g.wait = 8; }
        else { s.dead = true; return 'done'; }
      }
      if (!s.food.size) return 'done';
    },
    draw(s, g) {
      MAZE.forEach((row, y) => [...row].forEach((c, x) => c === '#' && g.cell(x, y, 'wall')));
      for (const [k, type] of s.food) {
        const [x, y] = k.split(',').map(Number);
        g.cell(x, y, 'reward', type === 'power' ? 1 : DIM);
      }
      g.cell(s.me[0], s.me[1], 'agent');
      for (const gh of s.ghosts) {
        const blink = gh.scared && s.fright < 7 && s.fright % 2;
        g.cell(gh.p[0], gh.p[1], 'enemy', gh.scared && !blink ? DIM : 1);
      }
      if (s.dead) g.cell(s.me[0], s.me[1], 'enemy');
    },
  });

  const key = (x, y) => y * 10 + x;
  const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];

  /* ---------------------------------------------------------------- missile */
  const CITY_X = [1, 3, 6, 8];
  const PLUS = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
  const SQUARE = [];
  for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) SQUARE.push([dx, dy]);
  // blast stages; a blast starts at a negative age while its counter-missile climbs from the ground
  const BLAST = [[[0, 0]], PLUS, SQUARE, SQUARE, PLUS];
  const flight = (y) => Math.ceil((9 - y) / 3);

  add({
    id: 'missile',
    year: 1980,
    title: 'Defend the cities',
    games: ['Missile Command (1980)'],
    essence: 'Missiles fall on straight diagonal lines toward the cities. Set off blasts in their path: any missile that enters an expanding blast is destroyed.',
    channels: { agent: 'crosshair (dim = blast, pending blast)', enemy: 'missiles (dim = trail, impact)', reward: 'cities', wall: 'ground, ruins (dim)' },
    fps: 6,
    warmup: 12,
    maxTicks: 400,
    init() {
      return {
        me: [4, 4], cities: CITY_X.map((x) => ({ x, alive: true })), missiles: [], blasts: [], flashes: [],
        left: 18, next: 1, cool: 0, lost: false,
      };
    },
    tick(s, r) {
      // cell of a missile k ticks from now (null once it has landed)
      const mpos = (m, k) => {
        const y = m.y + m.v * k;
        if (y >= 8) return null;
        return [Math.round(m.x0 + ((m.tx - m.x0) * (y - m.y0)) / (8 - m.y0)), Math.floor(y)];
      };
      const inBlast = (p, b, stage) => p && stage >= 0 && BLAST[stage].some(([dx, dy]) => b[0] + dx === p[0] && b[1] + dy === p[1]);
      // will a blast at b, now at the given age, catch missile m before it fades?
      const catches = (m, b, age) => {
        for (let a = age; a < BLAST.length; a++) if (inBlast(mpos(m, a - age + 1), b, a)) return true;
        return false;
      };
      const spawn = (x0, y0) => {
        const alive = s.cities.filter((c) => c.alive);
        const tx = alive.length && r.chance(0.85) ? r.pick(alive).x : r.i(10);
        s.missiles.push({ x0, y0, y: y0, tx, v: 0.34 + r.f() * 0.2, split: y0 === 0 && r.chance(0.35) });
        s.left--;
      };
      if (s.left > 0 && --s.next <= 0) {
        for (let n = r.range(3, 4); n > 0 && s.left > 0; n--) spawn(r.i(10), 0);
        s.next = r.range(9, 15);
      }

      // crosshair: fire when a blast here would catch a missile, else head for an intercept point
      if (s.cool > 0) s.cool--;
      const live = s.missiles.filter((m) => !s.blasts.some((b) => catches(m, [b.x, b.y], b.age)));
      const age0 = -flight(s.me[1]);
      if (!s.cool && live.some((m) => catches(m, s.me, age0))) {
        s.blasts.push({ x: s.me[0], y: s.me[1], age: age0 });
        s.cool = 7;
      } else if (live.length && !r.chance(0.12)) {
        const m = live.reduce((a, b) => ((8 - a.y) / a.v < (8 - b.y) / b.v ? a : b));
        let aim = null;
        for (let k = 1; k < 30 && !aim; k++) {
          const p = mpos(m, k);
          if (!p) break;
          if (cheb(s.me, p) + flight(p[1]) + 3 <= k) aim = p;
        }
        aim = aim || mpos(m, 1) || s.me;
        s.me = [clamp(s.me[0] + sign(aim[0] - s.me[0]), 0, 9), clamp(s.me[1] + sign(aim[1] - s.me[1]), 0, 7)];
      }

      // missiles fall; some split in two partway down
      const born = [];
      s.missiles = s.missiles.filter((m) => {
        m.y += m.v;
        if (m.split && m.y >= 3 && s.left > 0) {
          m.split = false;
          born.push([m.x0 + ((m.tx - m.x0) * (m.y - m.y0)) / (8 - m.y0), m.y]);
        }
        if (m.y < 8) return true;
        const c = s.cities.find((c) => c.x === m.tx);
        if (c) c.alive = false;
        s.flashes.push({ x: clamp(Math.round(m.tx), 0, 9), y: 8, t: 3 });
        return false;
      });
      for (const [x, y] of born) if (s.left > 0) spawn(x, y);

      for (const b of s.blasts) {
        s.missiles = s.missiles.filter((m) => !inBlast(mpos(m, 0), [b.x, b.y], b.age));
        b.age++;
      }
      s.blasts = s.blasts.filter((b) => b.age < BLAST.length);
      s.flashes = s.flashes.filter((f) => --f.t > 0);

      if (!s.cities.some((c) => c.alive)) { s.lost = true; return 'done'; }
      if (s.left <= 0 && !s.missiles.length && !s.blasts.length) return 'done';
    },
    draw(s, g) {
      g.rect(0, 9, 10, 1, 'wall');
      for (const c of s.cities) g.cell(c.x, 8, c.alive ? 'reward' : 'wall', c.alive ? 1 : DIM);
      for (const f of s.flashes) g.cell(f.x, f.y, 'enemy', DIM);
      for (const b of s.blasts) {
        if (b.age <= 0) { g.cell(b.x, b.y, 'agent', DIM); continue; }
        for (const [dx, dy] of BLAST[b.age - 1]) {
          const x = b.x + dx, y = b.y + dy;
          if (x >= 0 && x < 10 && y >= 0 && y < 8) g.cell(x, y, 'agent', DIM);
        }
      }
      for (const m of s.missiles) {
        const cy = Math.floor(m.y), at = (y) => Math.round(m.x0 + ((m.tx - m.x0) * (y - m.y0)) / (8 - m.y0));
        for (let y = cy - 1; y >= Math.max(Math.floor(m.y0), cy - 4); y--) g.cell(at(y), y, 'enemy', DIM);
        g.cell(at(m.y), cy, 'enemy');
      }
      g.cell(s.me[0], s.me[1], s.lost ? 'enemy' : 'agent');
    },
  });

  /* --------------------------------------------------------------- robotron */
  add({
    id: 'robotron',
    year: 1982,
    title: 'Arena swarm',
    games: ['Berzerk (1980)', 'Robotron: 2084 (1982)'],
    essence: 'Robots close in from every side of an open arena. Move and fire in any of eight directions, and rescue the wandering humans before the swarm crushes them or corners you.',
    channels: { agent: 'hero (dim = shots)', enemy: 'robots', reward: 'humans (dim = just rescued)', wall: 'arena' },
    fps: 6,
    init(r) {
      const me = [r.range(4, 5), r.range(4, 5)];
      const used = new Set([key(...me)]);
      const place = (minD) => {
        for (;;) {
          const p = [r.range(1, 8), r.range(1, 8)];
          if (!used.has(key(...p)) && cheb(p, me) >= minD) { used.add(key(...p)); return p; }
        }
      };
      return {
        me, prev: me, t: 0, cool: 0, lost: false, shots: [], saved: [],
        robots: Array.from({ length: 5 }, () => ({ p: place(4), prev: null, every: r.pick([2, 2, 3]), ph: r.i(3) })),
        reserve: 12,
        humans: Array.from({ length: 3 }, () => place(2)),
      };
    },
    tick(s, r) {
      s.t++;
      const inside = (x, y) => x >= 1 && x <= 8 && y >= 1 && y <= 8;
      const robotAt = (x, y) => s.robots.findIndex((e) => e.p[0] === x && e.p[1] === y);
      const rescue = () => {
        const i = s.humans.findIndex((p) => same(p, s.me));
        if (i >= 0) { s.saved.push({ p: s.humans[i], t: 3 }); s.humans.splice(i, 1); }
      };

      // lines of sight from a cell that end on a robot: [direction, distance]
      const sights = (c) => {
        const out = [];
        for (const [dx, dy] of DIRS8) {
          for (let n = 1, x = c[0] + dx, y = c[1] + dy; inside(x, y) && n < 7; n++, x += dx, y += dy) {
            if (robotAt(x, y) >= 0) { out.push([[dx, dy], n]); break; }
          }
        }
        return out;
      };
      // fire at the nearest robot in line
      if (s.cool > 0) s.cool--;
      const lines = sights(s.me).sort((a, b) => a[1] - b[1]);
      if (!s.cool && lines.length) {
        s.shots.push({ x: s.me[0], y: s.me[1], dx: lines[0][0][0], dy: lines[0][0][1] });
        s.cool = 2;
      }

      // move: keep a gap from where robots will step, drift toward humans, stay off the walls
      const next = s.robots.map((e) => [e.p[0] + sign(s.me[0] - e.p[0]), e.p[1] + sign(s.me[1] - e.p[1])]);
      let best = s.me, bs = -Infinity;
      for (const [dx, dy] of [[0, 0], ...DIRS8]) {
        const c = [s.me[0] + dx, s.me[1] + dy];
        if (!inside(...c) || robotAt(...c) >= 0) continue;
        const d = Math.min(9, ...next.map((p) => cheb(p, c)));
        if (d === 0) continue;
        const h = s.humans.length ? Math.min(...s.humans.map((p) => cheb(p, c))) : 0;
        const edge = Math.min(c[0] - 1, 8 - c[0], c[1] - 1, 8 - c[1]);
        const score = (d === 1 ? -20 : Math.min(d, 3) * 3) - h * 0.8 + Math.min(edge, 2) + Math.min(sights(c).length, 2) * 1.5 + r.f() * 1.2;
        if (score > bs) { bs = score; best = c; }
      }
      s.prev = s.me;
      s.me = best;
      rescue();

      const hit = (sh) => {
        const i = robotAt(sh.x, sh.y);
        if (i < 0) return false;
        s.robots.splice(i, 1);
        return true;
      };
      s.shots = s.shots.filter((sh) => {
        for (let k = 0; k < 2; k++) {
          sh.x += sh.dx; sh.y += sh.dy;
          if (!inside(sh.x, sh.y) || hit(sh)) return false;
        }
        return true;
      });

      // reinforcements walk in from the walls
      if (s.reserve > 0 && s.t % 3 === 0) {
        const a = r.range(1, 8), side = r.i(4);
        const p = [[1, a], [8, a], [a, 1], [a, 8]][side];
        if (cheb(p, s.me) >= 3 && robotAt(...p) < 0) {
          s.robots.push({ p, prev: p, every: r.pick([2, 2, 3]), ph: r.i(3) });
          s.reserve--;
        }
      }
      if (s.t % 3 === 0) {
        s.humans = s.humans.map((p) => {
          const [dx, dy] = r.pick(DIRS4), x = p[0] + dx, y = p[1] + dy;
          return inside(x, y) && robotAt(x, y) < 0 && !same([x, y], s.me) ? [x, y] : p;
        });
      }
      for (const e of s.robots) {
        e.prev = e.p;
        if ((s.t + e.ph) % e.every) continue;
        const sx = sign(s.me[0] - e.p[0]), sy = sign(s.me[1] - e.p[1]);
        for (const [dx, dy] of [[sx, sy], [sx, 0], [0, sy]]) {
          if (!dx && !dy) continue;
          if (robotAt(e.p[0] + dx, e.p[1] + dy) >= 0) continue;
          e.p = [e.p[0] + dx, e.p[1] + dy];
          break;
        }
        s.humans = s.humans.filter((p) => !same(p, e.p));
      }
      s.shots = s.shots.filter((sh) => !hit(sh));
      s.saved = s.saved.filter((sv) => --sv.t > 0);
      for (const e of s.robots) {
        if (same(e.p, s.me) || (same(e.p, s.prev) && same(e.prev, s.me))) { s.lost = true; return 'done'; }
      }
      if (!s.robots.length && !s.reserve) return 'done';
    },
    draw(s, g) {
      g.rect(0, 0, 10, 1, 'wall'); g.rect(0, 9, 10, 1, 'wall');
      g.rect(0, 1, 1, 8, 'wall'); g.rect(9, 1, 1, 8, 'wall');
      for (const sv of s.saved) g.cell(sv.p[0], sv.p[1], 'reward', DIM);
      for (const p of s.humans) g.cell(p[0], p[1], 'reward');
      for (const sh of s.shots) g.cell(sh.x, sh.y, 'agent', DIM);
      for (const e of s.robots) g.cell(e.p[0], e.p[1], 'enemy');
      g.cell(s.me[0], s.me[1], s.lost ? 'enemy' : 'agent');
    },
  });

  // Lit room plus the eight neighbours are visible; everything visible is remembered.

  /* ---------------------------------------------------------------- frogger */
  const SLOTS = [1, 3, 6, 8];
  // A cyclic lane of 10 cells: runs of minL..maxL occupied cells separated by minG..maxG gaps.
  function lanePattern(r, minL, maxL, minG, maxG) {
    const pat = new Array(10).fill(0), off = r.i(10);
    for (let pos = 0; ;) {
      const L = r.range(minL, maxL);
      if (pos + L + minG > 10) break;
      for (let i = 0; i < L; i++) pat[(off + pos + i) % 10] = 1;
      pos += L + r.range(minG, maxG);
    }
    return pat;
  }

  add({
    id: 'frogger',
    year: 1981,
    title: 'Lane crossing',
    games: ['Freeway (1981)', 'Frogger (1981)'],
    essence: 'Cross lanes of traffic moving at different speeds in alternating directions, then ride drifting logs across the river. Wait for gaps; one bad step is fatal.',
    channels: { agent: 'frog', enemy: 'traffic', object: 'logs', reward: 'home slots', wall: 'top bank (dim = safe banks, median)' },
    fps: 5,
    init(r) {
      const lanes = [];
      let dir = r.pick([-1, 1]);
      for (let y = 1; y <= 8; y++) {
        if (y === 4) continue;
        dir = -dir;
        const river = y < 4, per = river ? r.range(2, 3) : r.pick([1, 2, 2, 3]);
        const pat = river ? lanePattern(r, 2, 4, 2, 3) : per === 3 ? lanePattern(r, 2, 3, 2, 3) : lanePattern(r, 1, 2, 2, 4);
        lanes[y] = { river, dir, per, ph: r.i(per), pat, guess: r.chance(0.4) ? (per === 1 ? 2 : per + r.pick([-1, 1])) : 0 };
      }
      return { lanes, me: [r.range(3, 6), 9], t: 0, lost: false, won: false };
    },
    tick(s, r) {
      const shift = (L, T) => Math.floor((T + L.ph) / L.per) * L.dir;
      const occ = (L, x, T) => L.pat[(((x - shift(L, T)) % 10) + 10) % 10] === 1;
      // the frog's own timetable: it misjudges the speed of some lanes
      const sh = (L, T) => (L.guess ? shift(L, s.t) + L.dir * (Math.floor((T + L.ph) / L.guess) - Math.floor((s.t + L.ph) / L.guess)) : shift(L, T));
      const seen = (L, x, T) => L.pat[(((x - sh(L, T)) % 10) + 10) % 10] === 1;
      // one move from (x, y) at time T: null = not allowed, else {x, y, dead, win}
      const step = (x, y, [dx, dy], T, careless) => {
        let nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx > 9 || ny > 9) return null;
        if (ny === 0) return SLOTS.includes(nx) ? { x: nx, y: 0, win: true } : null;
        const L = s.lanes[ny];
        if (!L) return { x: nx, y: ny };
        if (!L.river) {
          const dead = seen(L, nx, T) || (!careless && seen(L, nx, T + 1));
          return { x: nx, y: ny, dead };
        }
        const landed = seen(L, nx, T);
        if (sh(L, T + 1) !== sh(L, T)) nx += L.dir;
        return { x: nx, y: ny, dead: !landed || nx < 0 || nx > 9 || !seen(L, nx, T + 1) };
      };
      const ACTS = [[0, -1], [0, 0], [-1, 0], [1, 0], [0, 1]];
      const value = (x, y) => 9 - y - (y <= 3 ? 0.3 * Math.min(...SLOTS.map((sx) => Math.abs(sx - x))) : 0);
      const search = (x, y, T, depth) => {
        if (!depth) return value(x, y);
        let best = -100;
        for (const a of ACTS) {
          const n = step(x, y, a, T);
          if (!n || n.dead) continue;
          best = Math.max(best, n.win ? 50 + depth : search(n.x, n.y, T + 1, depth - 1));
        }
        return best;
      };

      // frog: short lookahead over the lane timetable; sometimes it hops on a glance
      let act = [0, 0];
      const careless = s.me[1] >= 4 && r.chance(0.07);
      const up = step(s.me[0], s.me[1], [0, -1], s.t, true);
      if (careless && up && !up.dead) act = [0, -1];
      else {
        let bs = -Infinity;
        for (const a of ACTS) {
          const n = step(s.me[0], s.me[1], a, s.t);
          if (!n || n.dead) continue;
          const v = (n.win ? 100 : search(n.x, n.y, s.t + 1, 3)) + 0.1 * (9 - n.y) + r.f() * 0.05;
          if (v > bs) { bs = v; act = a; }
        }
      }

      // apply the move against the real lanes
      let [x, y] = [s.me[0] + act[0], s.me[1] + act[1]];
      const L = s.lanes[y];
      s.t++;
      if (y === 0) { s.me = [x, y]; s.won = true; return 'done'; }
      if (L && !L.river && (occ(L, x, s.t - 1) || occ(L, x, s.t))) s.lost = true;
      if (L && L.river) {
        const landed = occ(L, x, s.t - 1);
        if (shift(L, s.t) !== shift(L, s.t - 1)) x += L.dir;
        if (!landed || x < 0 || x > 9 || !occ(L, x, s.t)) s.lost = true;
      }
      s.me = [clamp(x, 0, 9), y];
      if (s.lost) return 'done';
    },
    draw(s, g) {
      const shift = (L, T) => Math.floor((T + L.ph) / L.per) * L.dir;
      for (let x = 0; x < 10; x++) g.cell(x, 0, SLOTS.includes(x) ? 'reward' : 'wall');
      g.rect(0, 4, 10, 1, 'wall', DIM);
      g.rect(0, 9, 10, 1, 'wall', DIM);
      s.lanes.forEach((L, y) => {
        if (!L) return;
        for (let x = 0; x < 10; x++) {
          if (L.pat[(((x - shift(L, s.t)) % 10) + 10) % 10]) g.cell(x, y, L.river ? 'object' : 'enemy');
        }
      });
      g.cell(s.me[0], s.me[1], s.lost ? 'enemy' : 'agent');
    },
  });

  /* ------------------------------------------------------------ donkeykong */
  // Walk rows 8, 5, 2 stand on girders at 9, 6, 3. Barrels roll right, left, right
  // and drop through the gap at each girder's open end.
  const DK_DIR = { 2: 1, 5: -1, 8: 1 };

  add({
    id: 'donkeykong',
    year: 1981,
    title: 'Platforms and ladders',
    games: ['Donkey Kong (1981)'],
    essence: 'Climb from girder to girder by ladder while barrels roll down toward you, drop off the ends and sometimes take a ladder. Jump them or let them pass beneath.',
    channels: { agent: 'climber', enemy: 'barrels (dim = thrower)', reward: 'goal', object: 'ladders (dim)', wall: 'girders' },
    fps: 6,
    init(r) {
      return {
        me: [9, 8], prev: [9, 8], jump: null, next: 2, t: 0, lost: false, won: false,
        x1: r.range(1, 3), x2: r.range(6, 8), xg: r.range(3, 5),
        barrels: [{ x: r.range(3, 7), y: 2, dir: 1 }, { x: r.range(2, 8), y: 5, dir: -1 }, { x: r.range(0, 4), y: 8, dir: 1 }]
          .filter(() => r.chance(0.7)).map((b) => Object.assign(b, { mode: 'roll', prev: [b.x, b.y] })),
      };
    },
    tick(s, r) {
      s.t++;
      const ladderTop = (x, y) => (y === 5 && x === s.x1) || (y === 2 && x === s.x2);
      const support = (x, y) => y === 8 || (y === 5 && x >= 1) || (y === 2 && x <= 8);

      // climber
      s.prev = s.me;
      const [x, y] = s.me;
      if (s.jump) {
        s.me = s.jump.up ? [x + s.jump.dx, y - 1] : [x + s.jump.dx, y + 1];
        s.jump = s.jump.up ? { dx: s.jump.dx, up: false } : null;
      } else if (!DK_DIR[y]) {
        // on a ladder: back down from a barrel coming down it, wait for the exit to clear
        const above = s.barrels.some((b) => b.mode === 'ladder' && b.x === x && b.y < y && y - b.y <= 2);
        const exit = DK_DIR[y - 1] && s.barrels.some((b) => b.mode === 'roll' && b.y === y - 1 && (b.x === x || b.x + b.dir === x));
        if (above) s.me = [x, y + 1];
        else if (!exit || r.chance(0.15)) s.me = [x, y - 1];
        if (s.me[1] === 0) { s.won = true; return 'done'; }
      } else {
        const target = y === 8 ? s.x1 : y === 5 ? s.x2 : s.xg;
        const rolling = s.barrels.filter((b) => b.mode === 'roll' && b.y === y);
        const coming = rolling.filter((b) => sign(x - b.x) === b.dir && Math.abs(x - b.x) <= 2)
          .sort((a, b) => Math.abs(x - a.x) - Math.abs(x - b.x))[0];
        const want = sign(target - x);
        const clearAt = (cx, k) => support(cx, y) && cx >= (y === 2 ? 2 : 0) && cx <= 9 &&
          !rolling.some((b) => b.x + b.dir * k === cx) &&
          !s.barrels.some((b) => b.mode !== 'roll' && b.x === cx && b.y < y && y - b.y <= k + 1);
        const busy = s.barrels.some((b) => b.x === x && b.y < y && y - b.y <= 3 && b.mode === 'ladder') ||
          s.barrels.some((b) => b.mode === 'roll' && b.y === y - 3 && Math.abs(b.x - x) <= 1);
        if (x === target && (!busy || r.chance(0.15))) s.me = [x, y - 1];
        else if (x === target && !coming) {
          // a barrel coming down the ladder: step aside, else wait for it to clear
          const down = s.barrels.some((b) => b.mode === 'ladder' && b.x === x && b.y < y);
          const side = [-1, 1].find((d) => clearAt(x + d, 1));
          if (down && side && !r.chance(0.15)) s.me = [x + side, y];
        }
        else if (coming && r.chance(0.05)) { /* freezes */ }
        else if (coming && sign(coming.x - x) === want && clearAt(x + 2 * want, 2)) s.jump = { dx: want, up: true };
        else if (coming && Math.abs(coming.x - x) === 1) s.jump = { dx: 0, up: true };
        else if (clearAt(x + want, 1)) s.me = [x + want, y];
        if (s.jump) { s.me = [x + s.jump.dx, y - 1]; s.jump.up = false; }
      }

      // barrels: thrown at the top, roll, drop at open ends, sometimes take a ladder down
      if (--s.next <= 0) { s.barrels.push({ x: 2, y: 2, dir: 1, mode: 'roll', prev: [2, 2] }); s.next = r.range(4, 9); }
      s.barrels = s.barrels.filter((b) => {
        b.prev = [b.x, b.y];
        if (b.mode !== 'roll') {
          b.y++;
          if (DK_DIR[b.y]) { b.mode = 'roll'; b.dir = DK_DIR[b.y]; }
          return true;
        }
        if (ladderTop(b.x, b.y) && b.seen !== key(b.x, b.y)) {
          b.seen = key(b.x, b.y);
          if (r.chance(0.3)) { b.mode = 'ladder'; b.y++; return true; }
        }
        b.x += b.dir;
        if (b.x > 9) return false;
        if (!support(b.x, b.y)) b.mode = 'fall';
        return true;
      });
      for (const b of s.barrels) {
        if (same([b.x, b.y], s.me) || (same([b.x, b.y], s.prev) && same(b.prev, s.me))) { s.lost = true; return 'done'; }
      }
    },
    draw(s, g) {
      for (let x = 0; x < 10; x++) {
        g.cell(x, 9, 'wall');
        if (x >= 1) g.cell(x, 6, 'wall');
        if (x <= 8) g.cell(x, 3, 'wall');
      }
      for (const [x, y] of [[s.x1, 7], [s.x1, 6], [s.x2, 4], [s.x2, 3], [s.xg, 1]]) g.cell(x, y, 'object', DIM);
      g.cell(s.xg, 0, 'reward');
      g.rect(0, 1, 2, 2, 'enemy', DIM);
      for (const b of s.barrels) g.cell(b.x, b.y, 'enemy');
      g.cell(s.me[0], s.me[1], s.lost ? 'enemy' : 'agent');
    },
  });

  /* -------------------------------------------------------------------- qix */
  // Claim every open region that does not hold the enemy.
  function claimFrom(claimed, seed) {
    const out = claimed.slice(), reach = new Uint8Array(100), q = [];
    if (!out[seed]) { reach[seed] = 1; q.push(seed); }
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi], x = i % 10, y = (i / 10) | 0;
      for (const [dx, dy] of DIRS4) {
        const nx = x + dx, ny = y + dy, ni = key(nx, ny);
        if (!inb(10, 10, nx, ny) || out[ni] || reach[ni]) continue;
        reach[ni] = 1;
        q.push(ni);
      }
    }
    for (let i = 0; i < 100; i++) if (!out[i] && !reach[i]) out[i] = 1;
    return out;
  }
  const count = (a) => a.reduce((n, v) => n + v, 0);

  add({
    id: 'qix',
    year: 1981,
    title: 'Territory claiming',
    games: ['Qix (1981)', 'Xonix (1984)'],
    essence: 'Leave the safe edge and draw a line through open space. Closing it claims the side the roaming enemy is not in. If the enemy touches the open line first, you lose.',
    channels: { agent: 'marker (dim = open line)', enemy: 'qix (dim = tail)', object: 'just claimed (dim = claimed earlier)', wall: 'starting edge' },
    fps: 6,
    warmup: 8,
    init(r) {
      const claimed = new Uint8Array(100);
      for (let i = 0; i < 100; i++) {
        const x = i % 10, y = (i / 10) | 0;
        if (!x || !y || x === 9 || y === 9) claimed[i] = 1;
      }
      const q = [r.range(3, 6), r.range(3, 6)];
      return { claimed, me: [r.range(2, 7), 9], line: [], plan: [], qix: [q, q, q], v: [r.pick([-1, 1]), r.pick([-1, 1])], t: 0, lost: false, fresh: null };
    },
    tick(s, r) {
      s.t++;
      const C = s.claimed;
      const qk = () => key(...s.qix[0]);
      const touched = () => s.line.includes(qk()) || (s.line.length && same(s.qix[0], s.me));

      // about to leave safe ground with the qix close to the planned line: think again
      if (s.plan.length && C[key(...s.me)] && !C[key(...s.plan[0])] && r.chance(0.85) &&
        Math.min(...s.plan.map((c) => cheb(c, s.qix[0]))) <= 2) s.plan = [];

      // plan an excursion: out, along, and back to claimed ground, scored by area per step and distance from the qix
      if (!s.plan.length) {
        const dist = distField(10, 10, [s.me], (x, y) => C[key(x, y)] === 1);
        const edges = [];
        for (let i = 0; i < 100; i++) {
          const x = i % 10, y = (i / 10) | 0;
          if (C[i] && dist[i] >= 0 && DIRS4.some(([dx, dy]) => inb(10, 10, x + dx, y + dy) && !C[key(x + dx, y + dy)])) edges.push(i);
        }
        let best = null, bs = 0;
        for (let n = 0; n < 50 && edges.length; n++) {
          const e = r.pick(edges), ex = e % 10, ey = (e / 10) | 0;
          const outs = DIRS4.filter(([dx, dy]) => inb(10, 10, ex + dx, ey + dy) && !C[key(ex + dx, ey + dy)]);
          if (!outs.length) continue;
          const d = r.pick(outs), side = r.pick([[d[1], d[0]], [-d[1], -d[0]]]);
          const moves = [...Array(r.range(1, 3)).fill(d), ...Array(r.range(1, 5)).fill(side), ...Array(9).fill([-d[0], -d[1]])];
          const path = [];
          let p = [ex, ey], closed = false;
          for (const [dx, dy] of moves) {
            p = [p[0] + dx, p[1] + dy];
            if (!inb(10, 10, ...p)) break;
            const k = key(...p);
            if (path.some((c) => key(...c) === k)) break;
            path.push(p);
            if (C[k]) { closed = true; break; }
          }
          if (!closed || path.length < 2) continue;
          const tmp = C.slice();
          path.forEach((c) => (tmp[key(...c)] = 1));
          const gain = count(claimFrom(tmp, qk())) - count(C);
          const near = Math.min(...path.map((c) => cheb(c, s.qix[0])));
          // the qix covers about one cell every two ticks; skip lines it could reach in time (mostly)
          if (near <= 1 || (near <= 1 + (path.length + dist[e]) / 3 && !r.chance(0.08))) continue;
          const score = gain / (path.length + dist[e] * 0.3 + 2);
          if (score > bs) { bs = score; best = { e: [ex, ey], path }; }
        }
        if (best) {
          const walk = same(best.e, s.me) ? [] : bfs(10, 10, s.me, (x, y) => x === best.e[0] && y === best.e[1], (x, y) => C[key(x, y)] === 1);
          s.plan = [...(walk || []), ...best.path];
        } else {
          // nothing worth the risk: slide along the edge away from the qix
          const far = edges.reduce((a, b) => (cheb([b % 10, (b / 10) | 0], s.qix[0]) > cheb([a % 10, (a / 10) | 0], s.qix[0]) ? b : a), key(...s.me));
          const walk = bfs(10, 10, s.me, (x, y) => key(x, y) === far, (x, y) => C[key(x, y)] === 1);
          s.plan = walk ? walk.slice(0, 2) : [r.pick(DIRS4.map(([dx, dy]) => [s.me[0] + dx, s.me[1] + dy]).filter((c) => inb(10, 10, ...c) && C[key(...c)]))];
        }
      }

      s.me = s.plan.shift();
      s.fresh = null;
      const k = key(...s.me);
      if (!C[k]) s.line.push(k);
      else if (s.line.length) {
        s.line.forEach((i) => (C[i] = 1));
        s.line = [];
        const next = claimFrom(C, qk());
        s.fresh = next.map((v, i) => v && !C[i]);
        s.claimed = next;
        if (count(next) >= 75) return 'done';
      }
      if (touched()) { s.lost = true; return 'done'; }

      // qix: bounces diagonally through open space, now and then changing course
      if (s.t % 2) {
        if (r.chance(0.25)) s.v[r.i(2)] *= -1;
        const [hx, hy] = s.qix[0], [vx, vy] = s.v;
        for (const [dx, dy] of [[vx, vy], [-vx, vy], [vx, -vy], [-vx, -vy], [vx, 0], [0, vy], [-vx, 0], [0, -vy]]) {
          const nx = hx + dx, ny = hy + dy;
          if (!inb(10, 10, nx, ny) || s.claimed[key(nx, ny)]) continue;
          if (dx && dy) s.v = [dx, dy];
          s.qix = [[nx, ny], s.qix[0], s.qix[1]];
          break;
        }
      }
      if (touched()) { s.lost = true; return 'done'; }
    },
    draw(s, g) {
      for (let i = 0; i < 100; i++) {
        if (!s.claimed[i]) continue;
        const x = i % 10, y = (i / 10) | 0, edge = !x || !y || x === 9 || y === 9;
        g.cell(x, y, edge ? 'wall' : 'object', edge || (s.fresh && s.fresh[i]) ? 1 : DIM);
      }
      for (const i of s.line) g.cell(i % 10, (i / 10) | 0, 'agent', DIM);
      g.cell(s.qix[2][0], s.qix[2][1], 'enemy', DIM);
      g.cell(s.qix[1][0], s.qix[1][1], 'enemy', DIM);
      g.cell(s.qix[0][0], s.qix[0][1], 'enemy');
      g.cell(s.me[0], s.me[1], s.lost ? 'enemy' : 'agent');
    },
  });

  /* --------------------------------------------------------------- scramble */
  // Terrain column x: rows 0..ceil-1 are rock overhead, rows 10-flo..9 are ground.
  function terrainColumn(s, r, x) {
    const pc = x ? s.ceil[x - 1] : 1, pf = x ? s.flo[x - 1] : 2;
    let c = clamp(pc + (r.chance(0.3) ? r.pick([-1, 1]) : 0), 0, 3), f = clamp(pf + (r.chance(0.35) ? r.pick([-1, 1]) : 0), 1, 4);
    if (x < 8) { c = 1; f = 2; }
    if (10 - c - f < 4) { c = pc; f = pf; }
    s.ceil[x] = c;
    s.flo[x] = f;
    if (x > 9 && f === pf && !s.items.has(x - 1) && !s.items.has(x - 2) && r.chance(0.4)) {
      s.items.set(x, { y: 9 - f, kind: r.chance(0.55) ? 'rocket' : 'fuel', up: false });
    }
  }

  add({
    id: 'scramble',
    year: 1981,
    title: 'Scrolling shooter',
    games: ['Scramble (1981)', 'Gradius (1985)'],
    essence: 'The landscape scrolls past a ship that climbs, dives and fires ahead. Thread the gap between ceiling and ground, shoot the targets, and dodge rockets as they lift off.',
    channels: { agent: 'ship (dim = shots)', enemy: 'rockets (dim = exhaust, blast)', reward: 'fuel tanks (dim = blast)', wall: 'terrain' },
    fps: 7,
    warmup: 10,
    maxTicks: 400,
    init(r) {
      const s = { cam: 0, y: 4, ceil: [], flo: [], items: new Map(), shots: [], flashes: [], cool: 0, lost: false, goal: 130 };
      for (let x = 0; x < 16; x++) terrainColumn(s, r, x);
      return s;
    },
    tick(s, r) {
      s.cam++;
      terrainColumn(s, r, s.cam + 15);
      const sx = s.cam + 1;
      const open = (x, y) => y >= s.ceil[x] && y <= 9 - s.flo[x];
      // is the ship safe in row y, k ticks from now (rockets keep climbing; grounded ones assumed to stay)
      const safeAt = (k, y) => {
        const x = sx + k;
        if (y < 0 || y > 9 || !open(x, y)) return false;
        const it = s.items.get(x);
        if (!it || (it.up && blind)) return true;
        const iy = it.up ? it.y - (k + 1) : it.y;
        return iy !== y && !(it.up && iy + 1 === y);
      };
      const search = (k, y, depth) => {
        if (!safeAt(k, y)) return -1e9;
        if (!depth) return 0;
        return Math.max(...[-1, 0, 1].map((dy) => search(k + 1, y + dy, depth - 1)));
      };
      // now and then the pilot loses track of rockets already in the air
      const blind = r.chance(0.25);
      // ship: survive the next few columns, line up with the next ground target, else keep to mid-gap
      let target = null;
      for (let x = sx + 2; x <= sx + 7 && target === null; x++) {
        const it = s.items.get(x);
        if (it && !it.up) target = it.y;
      }
      const mid = (s.ceil[sx + 3] + 9 - s.flo[sx + 3]) / 2;
      let best = 0, bs = -Infinity;
      for (const dy of [-1, 0, 1]) {
        const y = s.y + dy;
        const v = search(0, y, 4) - Math.abs(y - (target ?? mid)) * (target === null ? 0.3 : 0.6) + r.f() * 0.2;
        if (v > bs) { bs = v; best = dy; }
      }
      s.y = clamp(s.y + best, 0, 9);

      // fire ahead when something sits in this row
      if (s.cool > 0) s.cool--;
      if (!s.cool) {
        let aim = false;
        for (let x = sx + 1; x <= s.cam + 9 && open(x, s.y); x++) {
          const it = s.items.get(x);
          if (it && it.y === s.y) { aim = true; break; }
        }
        if (aim || r.chance(0.15)) { s.shots.push({ x: sx, y: s.y }); s.cool = 3; }
      }

      const blast = (x, it) => { s.flashes.push({ x, y: it.y, kind: it.kind === 'fuel' ? 'reward' : 'enemy', t: 2 }); s.items.delete(x); };
      const hitShot = (sh) => {
        const it = s.items.get(sh.x);
        if (it && it.y === sh.y) { blast(sh.x, it); return true; }
        return false;
      };
      s.shots = s.shots.filter((sh) => {
        for (let k = 0; k < 3; k++) {
          sh.x++;
          if (sh.x > s.cam + 9 || !open(sh.x, sh.y)) return false;
          if (hitShot(sh)) return false;
        }
        return true;
      });
      for (const [x, it] of s.items) {
        if (x < s.cam) { s.items.delete(x); continue; }
        if (!it.up && it.kind === 'rocket' && x > sx && x - sx <= 4 && r.chance(0.4)) it.up = true;
        else if (it.up) {
          it.y--;
          if (it.y < s.ceil[x]) s.items.delete(x);
        }
      }
      s.shots = s.shots.filter((sh) => !hitShot(sh));
      s.flashes = s.flashes.filter((f) => --f.t > 0);

      const it = s.items.get(sx);
      if (!open(sx, s.y) || (it && (it.y === s.y || (it.up && it.y + 1 === s.y)))) { s.lost = true; return 'done'; }
      if (s.cam >= s.goal) return 'done';
    },
    draw(s, g) {
      for (let i = 0; i < 10; i++) {
        const x = s.cam + i;
        for (let y = 0; y < s.ceil[x]; y++) g.cell(i, y, 'wall');
        for (let y = 10 - s.flo[x]; y < 10; y++) g.cell(i, y, 'wall');
        const it = s.items.get(x);
        if (it && it.y >= 0) {
          g.cell(i, it.y, it.kind === 'fuel' ? 'reward' : 'enemy');
          if (it.up && it.y + 1 <= 9 - s.flo[x]) g.cell(i, it.y + 1, 'enemy', DIM);
        }
      }
      for (const f of s.flashes) if (f.x >= s.cam && f.x < s.cam + 10) g.cell(f.x - s.cam, f.y, f.kind, DIM);
      for (const sh of s.shots) g.cell(sh.x - s.cam, sh.y, 'agent', DIM);
      g.cell(1, s.y, s.lost ? 'enemy' : 'agent');
    },
  });

  /* ----------------------------------------------------------------- amidar */
  add({
    id: 'amidar',
    year: 1981,
    title: 'Paint by visiting',
    games: ['Amidar (1981)', 'Q*bert (1982)'],
    essence: 'Every path cell you walk over gets painted, and a box whose whole border is painted fills in. Paint the entire lattice while patrollers roam the same paths.',
    channels: { agent: 'painter', enemy: 'patrollers (dim = waiting, harmless)', reward: 'painted path (dim = filled box)', wall: 'unpainted path' },
    fps: 6,
    init(r) {
      const H = [0, 3, 6, 9], path = new Uint8Array(100), boxes = [], boxOf = [];
      for (const y of H) for (let x = 0; x < 10; x++) path[key(x, y)] = 1;
      for (let b = 0; b < 3; b++) {
        const a = r.range(2, 5), xs = [0, a, r.range(a + 2, 7), 9];
        for (const x of xs) for (let y = H[b] + 1; y < H[b + 1]; y++) path[key(x, y)] = 1;
        for (let i = 0; i < 3; i++) {
          const edge = [], inner = [];
          for (let y = H[b]; y <= H[b + 1]; y++) {
            for (let x = xs[i]; x <= xs[i + 1]; x++) {
              (x === xs[i] || x === xs[i + 1] || y === H[b] || y === H[b + 1] ? edge : inner).push(key(x, y));
            }
          }
          edge.forEach((k) => (boxOf[k] = (boxOf[k] || []).concat(boxes.length)));
          boxes.push({ edge, inner, done: false });
        }
      }
      const me = [r.range(3, 6), 9], paint = new Uint8Array(100);
      paint[key(...me)] = 1;
      const foes = [[0, 0, 0], [9, 0, 8], [r.range(3, 6), 0, 40]].map(([x, y, wait]) => ({ p: [x, y], prev: [x, y], wait }));
      return { path, paint, boxes, boxOf, me, prev: me, foes, t: 0, lost: false };
    },
    tick(s, r) {
      s.t++;
      const open = (x, y) => s.path[key(x, y)] === 1;
      const active = s.foes.filter((f) => !f.wait);
      const near = distField(10, 10, active.map((f) => f.p), open);

      // painter: patrollers move every other tick, so a cell is safe if the painter gets there
      // well before twice a patroller's distance; search only through such cells
      const left = s.boxes.map((b) => b.edge.filter((k) => !s.paint[k]).length);
      const safe = (i, d) => near[i] < 0 || d < 2 * near[i] - 2;
      const prev = new Int16Array(100).fill(-1), dist = new Int16Array(100).fill(-1), q = [key(...s.me)];
      dist[q[0]] = 0;
      for (let qi = 0; qi < q.length; qi++) {
        const i = q[qi];
        for (const [dx, dy] of DIRS4) {
          const x = (i % 10) + dx, y = ((i / 10) | 0) + dy, ni = key(x, y);
          if (!inb(10, 10, x, y) || !open(x, y) || dist[ni] >= 0 || !safe(ni, dist[i] + 1)) continue;
          dist[ni] = dist[i] + 1;
          prev[ni] = i;
          q.push(ni);
        }
      }
      let goal = -1, bs = Infinity;
      for (const i of q) {
        const fear = Math.min(near[i] < 0 ? 8 : near[i], 8);
        const bonus = (s.boxOf[i] || []).reduce((n, b) => n + Math.max(0, 4 - left[b]), 0);
        // unpainted cells first; if none is safe, the safe cell farthest from the patrollers
        const score = s.paint[i] ? 100 - fear : dist[i] - 0.5 * fear - bonus;
        if (i !== q[0] && score < bs) { bs = score; goal = i; }
      }
      let path = null;
      if (goal >= 0) {
        let i = goal;
        while (prev[i] !== q[0]) i = prev[i];
        path = [[i % 10, (i / 10) | 0]];
      } else {
        let best = s.me, bd = -1;
        for (const [dx, dy] of DIRS4) {
          const x = s.me[0] + dx, y = s.me[1] + dy;
          if (!inb(10, 10, x, y) || !open(x, y)) continue;
          const d = near[key(x, y)] < 0 ? 99 : near[key(x, y)];
          if (d > bd) { bd = d; best = [x, y]; }
        }
        path = [best];
      }
      s.prev = s.me;
      s.me = path[0];
      s.paint[key(...s.me)] = 1;
      s.boxes.forEach((b) => { if (!b.done && b.edge.every((k) => s.paint[k])) b.done = true; });

      // patrollers: no reversing; at junctions they sometimes turn toward the painter
      s.foes.forEach((f, i) => {
        if (f.wait > 0) { f.wait--; return; }
        if ((s.t + i) % 2 === 0) return;
        const moves = DIRS4.map(([dx, dy]) => [f.p[0] + dx, f.p[1] + dy])
          .filter(([x, y]) => inb(10, 10, x, y) && open(x, y) && !same([x, y], f.prev));
        let next = r.chance(0.3) ? (bfs(10, 10, f.p, (x, y) => x === s.me[0] && y === s.me[1], open) || [])[0] : null;
        next = next || r.pick(moves.length ? moves : [f.prev]);
        f.prev = f.p;
        f.p = next;
      });
      for (const f of s.foes) {
        if (f.wait) continue;
        if (same(f.p, s.me) || (same(f.p, s.prev) && same(f.prev, s.me))) { s.lost = true; return 'done'; }
      }
      if (s.path.every((v, i) => !v || s.paint[i])) return 'done';
    },
    draw(s, g) {
      for (const b of s.boxes) if (b.done) for (const k of b.inner) g.cell(k % 10, (k / 10) | 0, 'reward', DIM);
      for (let i = 0; i < 100; i++) if (s.path[i]) g.cell(i % 10, (i / 10) | 0, s.paint[i] ? 'reward' : 'wall');
      for (const f of s.foes) g.cell(f.p[0], f.p[1], 'enemy', f.wait ? DIM : 1);
      g.cell(s.me[0], s.me[1], s.lost ? 'enemy' : 'agent');
    },
  });

  /* -------------------------------------------------------------- centipede */
  add({
    id: 'centipede',
    year: 1981,
    title: 'Segmented descent',
    games: ['Centipede (1981)', 'Millipede (1982)'],
    essence: 'A chain of segments sweeps sideways, dropping a row and reversing whenever it meets a mushroom or an edge. A shot segment becomes a mushroom and splits the chain in two.',
    channels: { agent: 'shooter (dim = shot)', enemy: 'centipede head (dim = body)', object: 'mushrooms (dim = damaged)' },
    fps: 6,
    maxTicks: 360,
    init(r) {
      const mush = new Map();
      while (mush.size < 15) mush.set(key(r.i(10), r.range(1, 7)), 3);
      const segs = [];
      for (let i = 0; i < 14; i++) segs.push([6 - i, 0]);  // the tail enters from off the left edge
      const me = [r.range(3, 6), 9];
      mush.delete(key(...me));
      return { mush, chains: [{ segs, dir: 1, vdir: 1 }], me, prev: me, shot: null, t: 0, lost: false };
    },
    tick(s, r) {
      s.t++;
      const headNext = (c) => {
        const [hx, hy] = c.segs[0];
        const nx = hx + c.dir;
        const other = s.chains.some((o) => o !== c && o.segs.some((q) => q[0] === nx && q[1] === hy));
        if (nx >= 0 && nx <= 9 && !s.mush.has(key(nx, hy)) && !other) return { p: [nx, hy], dir: c.dir, vdir: c.vdir };
        let vdir = c.vdir;
        if (hy + vdir > 9 || (vdir < 0 && hy + vdir < 5)) vdir = -vdir;
        return { p: [hx, hy + vdir], dir: -c.dir, vdir };
      };
      const segAt = (x, y) => {
        for (let ci = 0; ci < s.chains.length; ci++) {
          const si = s.chains[ci].segs.findIndex((p) => p[0] === x && p[1] === y);
          if (si >= 0) return [ci, si];
        }
        return null;
      };
      // a hit segment becomes a mushroom; the segments behind it form a new chain with its own head
      const hitAt = (x, y) => {
        const h = segAt(x, y);
        if (h) {
          const c = s.chains[h[0]], p = c.segs[h[1]];
          s.mush.set(key(...p), 3);
          const front = c.segs.slice(0, h[1]), back = c.segs.slice(h[1] + 1), out = [];
          if (front.length) out.push({ segs: front, dir: c.dir, vdir: c.vdir });
          if (back.length) out.push({ segs: back, dir: back[0][1] === p[1] ? sign(p[0] - back[0][0]) || c.dir : -c.dir, vdir: c.vdir });
          s.chains.splice(h[0], 1, ...out);
          return true;
        }
        const k = key(x, y);
        if (!s.mush.has(k)) return false;
        const hp = s.mush.get(k) - 1;
        if (hp) s.mush.set(k, hp);
        else s.mush.delete(k);
        return true;
      };

      // shooter: dodge where segments will be next, line up a clear shot, fire
      const danger = new Set();
      for (const c of s.chains) {
        danger.add(key(...headNext(c).p));
        c.segs.slice(0, -1).forEach((p) => danger.add(key(...p)));
      }
      const low = s.chains.map((c) => c.segs[0]).sort((a, b) => b[1] - a[1])[0];
      const colHasSeg = (x, y0) => {
        for (let y = y0 - 1; y >= 0; y--) {
          if (segAt(x, y)) return true;
          if (s.mush.has(key(x, y))) return false;
        }
        return false;
      };
      // head for the nearest column with a clear shot, else under the lowest head
      const open = [];
      for (let x = 0; x < 10; x++) if (colHasSeg(x, 10)) open.push(x);
      const tx = open.length ? open.reduce((a, b) => (Math.abs(b - s.me[0]) < Math.abs(a - s.me[0]) ? b : a)) : low ? low[0] : s.me[0];
      let best = s.me, bs = -Infinity;
      for (const [dx, dy] of [[0, 0], ...DIRS4]) {
        const x = s.me[0] + dx, y = s.me[1] + dy;
        if (x < 0 || x > 9 || y < 8 || y > 9 || danger.has(key(x, y)) || s.mush.has(key(x, y))) continue;
        let threat = 0;
        for (const [ax, ay] of DIRS4) if (danger.has(key(x + ax, y + ay))) threat++;
        const score = (colHasSeg(x, y) ? 3 : 0) - Math.abs(x - tx) * 0.6 + (y - 8) * 0.8 - threat * 1.5 + r.f() * 0.6;
        if (score > bs) { bs = score; best = [x, y]; }
      }
      s.prev = s.me;
      s.me = best;
      if (!s.shot && (colHasSeg(...s.me) || r.chance(0.4))) s.shot = [s.me[0], s.me[1]];

      if (s.shot) {
        for (let k = 0; k < 2 && s.shot; k++) {
          s.shot[1]--;
          if (s.shot[1] < 0 || hitAt(...s.shot)) s.shot = null;
        }
      }
      for (const c of s.chains) {
        const n = headNext(c);
        c.dir = n.dir;
        c.vdir = n.vdir;
        c.segs.unshift(n.p);
        c.segs.pop();
      }
      if (s.shot && segAt(...s.shot)) { hitAt(...s.shot); s.shot = null; }

      for (const c of s.chains) {
        for (let i = 0; i < c.segs.length; i++) {
          const p = c.segs[i], was = i + 1 < c.segs.length ? c.segs[i + 1] : null;
          if (same(p, s.me) || (was && same(p, s.prev) && same(was, s.me))) { s.lost = true; return 'done'; }
        }
      }
      if (!s.chains.length) return 'done';
    },
    draw(s, g) {
      for (const [k, hp] of s.mush) g.cell(k % 10, (k / 10) | 0, 'object', hp === 3 ? 1 : DIM);
      for (const c of s.chains) {
        c.segs.forEach((p, i) => p[0] >= 0 && g.cell(p[0], p[1], 'enemy', i ? DIM : 1));
      }
      if (s.shot) g.cell(s.shot[0], s.shot[1], 'agent', DIM);
      g.cell(s.me[0], s.me[1], s.lost ? 'enemy' : 'agent');
    },
  });
})();
