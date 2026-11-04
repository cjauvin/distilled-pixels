/* Non-arcade mechanics (simulation, strategy, turn-based, puzzle). Not loaded by index.html. */
(function () {
  'use strict';
  const { DIM, DIRS4, DIRS8, add, bfs, clamp, distField, inb, manhattan, sign } = Atlas;

  // ---- from sims/1-origins.js ----
  {
  const wrapv = (v, n) => ((v % n) + n) % n;
  const NB10 = [];                                         // 4-neighbours on a 10x10 grid
  for (let i = 0; i < 100; i++) {
    const x = i % 10, y = (i / 10) | 0;
    NB10.push(DIRS4.map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => inb(10, 10, a, b)).map(([a, b]) => b * 10 + a));
  }

  // ---------------------------------------------------------------- life
  const LIFE = {
    glider: [[1, 0], [2, 1], [0, 2], [1, 2], [2, 2]],
    rpent: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]],
    acorn: [[1, 0], [3, 1], [0, 2], [1, 2], [4, 2], [5, 2], [6, 2]],
    lwss: [[1, 0], [4, 0], [0, 1], [0, 2], [4, 2], [0, 3], [1, 3], [2, 3], [3, 3]],
    blinker: [[0, 0], [1, 0], [2, 0]],
    toad: [[1, 0], [2, 0], [3, 0], [0, 1], [1, 1], [2, 1]],
  };
  add({
    id: 'life',
    year: 1970,
    title: 'Zero-player automaton',
    games: ["Conway's Game of Life (1970)"],
    essence: 'Nobody plays. A cell with three live neighbours is born, a live cell with two or three survives, and every other cell dies. Gliders, blinkers and still lifes emerge.',
    channels: { object: 'live cells (dim = just died)' },
    fps: 5, maxTicks: 200, hold: 8, warmup: 3,
    init(r) {
      const cells = new Uint8Array(100);
      const stamp = (pts, ox, oy) => pts.forEach(([x, y]) => (cells[wrapv(oy + y, 10) * 10 + wrapv(ox + x, 10)] = 1));
      const seed = r.pick(['soup', 'soup', 'soup', 'rpent', 'acorn', 'glider', 'lwss']);
      if (seed === 'soup') {
        const p = r.range(30, 40) / 100;
        for (let y = 1; y < 9; y++) for (let x = 1; x < 9; x++) cells[y * 10 + x] = r.chance(p) ? 1 : 0;
      } else if (seed === 'glider') {
        stamp(LIFE.glider, r.range(0, 2), r.range(0, 2));
        stamp(r.chance(0.5) ? LIFE.blinker : LIFE.toad, r.range(5, 6), r.range(5, 7));
      } else stamp(LIFE[seed], r.range(1, 3), r.range(2, 5));
      return { cells, died: new Uint8Array(100), seen: new Map(), t: 0, end: null };
    },
    tick(s) {
      const cur = s.cells, next = new Uint8Array(100);
      let pop = 0, key = '';
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < 10; x++) {
          let n = 0;
          for (const [dx, dy] of DIRS8) n += cur[wrapv(y + dy, 10) * 10 + wrapv(x + dx, 10)];
          const i = y * 10 + x;
          next[i] = n === 3 || (n === 2 && cur[i]) ? 1 : 0;
          s.died[i] = cur[i] && !next[i] ? 1 : 0;
          pop += next[i];
          key += next[i];
        }
      }
      s.cells = next;
      s.t++;
      if (s.end === null) {
        if (!pop) s.end = 4;
        else if (s.seen.has(key)) s.end = clamp(2 * (s.t - s.seen.get(key)), 6, 14);
        else s.seen.set(key, s.t);
      }
      if ((s.end !== null && --s.end <= 0) || s.t >= 160) return 'done';
    },
    draw(s, g) {
      for (let i = 0; i < 100; i++) {
        if (s.cells[i]) g.cell(i % 10, (i / 10) | 0, 'object');
        else if (s.died[i]) g.cell(i % 10, (i / 10) | 0, 'object', DIM);
      }
    },
  });

  // ---------------------------------------------------------------- wumpus
  add({
    id: 'wumpus',
    year: 1973,
    title: 'Hidden hazards',
    games: ['Hunt the Wumpus (1973)'],
    essence: 'Explore a dark cave one room at a time. Rooms next to a pit feel a draft and rooms next to the wumpus smell, so the hunter deduces where it hides and shoots.',
    channels: { agent: 'hunter, arrow (dim)', enemy: 'wumpus once located (dim = smell)', object: 'pits, shown at the end (dim = draft)', wall: 'unexplored cave' },
    fps: 5, maxTicks: 300, hold: 10, warmup: 5,
    init(r) {
      const order = r.shuffle([...Array(100).keys()]);
      const far = (i, d) => manhattan([i % 10, (i / 10) | 0], [0, 9]) >= d;
      const wump = order.find((i) => far(i, 5));
      const pits = new Set(order.filter((i) => i !== wump && far(i, 2)).slice(0, r.range(6, 8)));
      const visited = new Uint8Array(100);
      visited[90] = 1;
      return { me: 90, wump, pits, visited, located: -1, guess: -1, arrow: null, result: null };
    },
    tick(s, r) {
      if (s.arrow) {
        if (++s.arrow.k >= s.arrow.cells.length - 1) { s.result = 'win'; return 'done'; }
        return;
      }
      const V = s.visited, NB = NB10;
      const breeze = (i) => NB[i].some((j) => s.pits.has(j));
      const stench = (i) => NB[i].includes(s.wump);
      const noPit = (i) => V[i] || NB[i].some((j) => V[j] && !breeze(j));
      const noWump = (i) => (s.located >= 0 ? i !== s.located : V[i] || NB[i].some((j) => V[j] && !stench(j)));
      if (s.located < 0) {
        const smelly = [];
        for (let i = 0; i < 100; i++) if (V[i] && stench(i)) smelly.push(i);
        if (smelly.length) {
          const cand = [];
          for (let i = 0; i < 100; i++) if (!noWump(i) && smelly.every((j) => NB[j].includes(i))) cand.push(i);
          if (cand.length === 1) s.located = cand[0];
        }
      }
      const mx = s.me % 10, my = (s.me / 10) | 0;
      const walk = (goal) => bfs(10, 10, [mx, my], (x, y) => goal(y * 10 + x), (x, y) => V[y * 10 + x] === 1);
      let path = null;
      if (s.located >= 0) {
        const lx = s.located % 10, ly = (s.located / 10) | 0;
        if (lx === mx || ly === my) {
          const dx = sign(lx - mx), dy = sign(ly - my), cells = [[mx, my]];
          for (let x = mx, y = my; x !== lx || y !== ly;) { x += dx; y += dy; cells.push([x, y]); }
          s.arrow = { cells, k: 0 };
          return;
        }
        path = walk((i) => V[i] && (i % 10 === lx || ((i / 10) | 0) === ly));
      }
      if (!path && s.guess < 0) path = walk((i) => !V[i] && noPit(i) && noWump(i));
      if (!path) {
        if (s.guess < 0) {
          // nothing is provably safe: step into the least suspicious edge of the map
          let bs = Infinity;
          for (let i = 0; i < 100; i++) {
            if (V[i] || !NB[i].some((j) => V[j])) continue;
            const risk = (noPit(i) ? 0 : 1) + (noWump(i) ? 0 : 0.8) + r.f() * 0.5;
            if (risk < bs) { bs = risk; s.guess = i; }
          }
        }
        path = walk((i) => i === s.guess);
      }
      if (!path) { s.result = 'stuck'; return 'done'; }
      const [nx, ny] = path[0];
      s.me = ny * 10 + nx;
      if (s.me === s.guess) s.guess = -1;
      V[s.me] = 1;
      if (s.pits.has(s.me) || s.me === s.wump) { s.result = 'dead'; return 'done'; }
    },
    draw(s, g) {
      const V = s.visited;
      for (let i = 0; i < 100; i++) {
        const x = i % 10, y = (i / 10) | 0;
        if (!V[i]) { g.cell(x, y, 'wall', DIM); continue; }
        if (NB10[i].includes(s.wump)) g.cell(x, y, 'enemy', DIM);   // smell wins over draft
        else if (NB10[i].some((j) => s.pits.has(j))) g.cell(x, y, 'object', DIM);
      }
      if (s.result) {
        for (const p of s.pits) g.cell(p % 10, (p / 10) | 0, 'object');
        g.cell(s.wump % 10, (s.wump / 10) | 0, 'enemy');
      } else if (s.located >= 0) g.cell(s.located % 10, (s.located / 10) | 0, 'enemy');
      if (s.arrow) {
        const last = Math.min(s.arrow.k, s.arrow.cells.length - 2);   // the arrow stops at the wumpus
        for (let k = 1; k <= last; k++) g.cell(s.arrow.cells[k][0], s.arrow.cells[k][1], 'agent', DIM);
      }
      g.cell(s.me % 10, (s.me / 10) | 0, s.result === 'dead' ? 'enemy' : 'agent');
    },
  });

  // ---------------------------------------------------------------- adventure
  const tf = (k, x, y) => {
    if (k & 1) x = 9 - x;
    if (k & 2) y = 9 - y;
    return k & 4 ? [y, x] : [x, y];
  };
  add({
    id: 'adventure',
    year: 1979,
    title: 'Keys and locked doors',
    games: ['Adventure (1979)', 'The Legend of Zelda (1986)'],
    essence: 'A locked door opens only with its key. The hero plans a route to the key, then through the door to the goal, while a dragon roams the open rooms.',
    channels: { agent: 'hero', enemy: 'dragon', reward: 'goal', object: 'locked door (dim = its key)', wall: 'walls' },
    fps: 6, maxTicks: 400, hold: 8, warmup: 4,
    init(r) {
      // four rooms around a cross of walls: start, open room, key/dragon room, locked goal room
      const k = r.i(8), map = new Uint8Array(100);
      const at = (x, y) => { const [a, b] = tf(k, x, y); return b * 10 + a; };
      const room = (x0, x1, y0, y1) => () => at(r.range(x0, x1), r.range(y0, y1));
      for (let i = 0; i < 10; i++) { map[at(4, i)] = 1; map[at(i, 5)] = 1; }
      map[at(4, r.range(0, 4))] = 0;                 // open gap: start room to top-right room
      map[at(r.range(6, 9), 5)] = 0;                 // open gap: top-right room to bottom-right room
      const door = at(4, r.range(6, 9));
      map[door] = 2;
      const TL = room(0, 3, 0, 4), TR = room(5, 9, 0, 4), BR = room(5, 9, 6, 9), BL = room(0, 3, 6, 9);
      const me = TL(), key = r.chance(0.5) ? TR() : BR(), goal = BL();
      let dragon = r.chance(0.7) ? BR() : TR();
      while (dragon === key) dragon = BR();
      const xy = (i) => [i % 10, (i / 10) | 0];
      return { map, me: xy(me), dragon: xy(dragon), prevD: null, key: xy(key), goal: xy(goal), door: xy(door), carry: false, t: 0, result: null };
    },
    tick(s, r) {
      s.t++;
      const map = s.map, same = (a, b) => a[0] === b[0] && a[1] === b[1];
      const doorOpen = map[s.door[1] * 10 + s.door[0]] === 0;
      const target = doorOpen ? s.goal : s.carry ? s.door : s.key;
      const walkable = (x, y) => { const v = map[y * 10 + x]; return v === 0 || (s.carry && v === 2); };
      const wary = r.chance(0.9) ? 1 : 0;   // now and then the hero cuts it close
      const safe = (x, y) => walkable(x, y) && manhattan([x, y], s.dragon) > wary;
      const isT = (x, y) => x === target[0] && y === target[1];
      let path = bfs(10, 10, s.me, isT, safe);
      if (path && !safe(...path[0]) && !isT(...path[0])) path = null;
      const prev = s.me;
      if (path) s.me = path[0];
      else {
        // no safe route right now: back away from the dragon
        let best = s.me, bd = manhattan(s.me, s.dragon);
        for (const [dx, dy] of DIRS4) {
          const x = s.me[0] + dx, y = s.me[1] + dy;
          if (inb(10, 10, x, y) && walkable(x, y) && manhattan([x, y], s.dragon) > bd) { bd = manhattan([x, y], s.dragon); best = [x, y]; }
        }
        s.me = best;
      }
      const cell = s.me[1] * 10 + s.me[0];
      if (map[cell] === 2) { map[cell] = 0; s.carry = false; }
      if (s.key && same(s.key, s.me)) { s.carry = true; s.key = null; }
      if (same(s.me, s.goal)) { s.result = 'win'; return 'done'; }
      // dragon: chases when it is close, otherwise wanders; a little slower than the hero
      if (s.t % 4) {
        const open = (x, y) => map[y * 10 + x] === 0;
        const dp = s.dragon;
        const chase = manhattan(dp, s.me) <= 6 && r.chance(0.75) && bfs(10, 10, dp, (x, y) => same([x, y], s.me), open);
        let next = chase && chase.length <= 7 ? chase[0] : null;
        if (!next) {
          const opts = DIRS4.map(([dx, dy]) => [dp[0] + dx, dp[1] + dy])
            .filter(([x, y]) => inb(10, 10, x, y) && open(x, y) && !(s.prevD && same([x, y], s.prevD)));
          next = opts.length ? r.pick(opts) : s.prevD || dp;
        }
        s.prevD = dp;
        s.dragon = next;
        if (same(s.dragon, s.me) || (same(s.dragon, prev) && same(dp, s.me))) { s.result = 'loss'; return 'done'; }
      }
      if (same(s.dragon, s.me)) { s.result = 'loss'; return 'done'; }
    },
    draw(s, g) {
      for (let i = 0; i < 100; i++) {
        const v = s.map[i], x = i % 10, y = (i / 10) | 0;
        if (v === 1) g.cell(x, y, 'wall');
        if (v === 2) g.cell(x, y, 'object');
      }
      if (s.key) g.cell(s.key[0], s.key[1], 'object', DIM);
      g.cell(s.goal[0], s.goal[1], 'reward');
      g.cell(s.dragon[0], s.dragon[1], 'enemy');
      g.cell(s.me[0], s.me[1], s.result === 'loss' ? 'enemy' : 'agent');
    },
  });
  }

  // ---- from sims/2-golden.js ----
  {
  const key = (x, y) => y * 10 + x;
  const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));
  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  function look(s) {
    const v = new Uint8Array(100), ri = s.roomOf[key(...s.me)];
    if (ri >= 0) {
      const m = s.rooms[ri];
      for (let y = m.y0 - 1; y <= m.y1 + 1; y++) for (let x = m.x0 - 1; x <= m.x1 + 1; x++) v[key(x, y)] = 1;
    }
    for (const [dx, dy] of [[0, 0], ...DIRS8]) {
      const x = s.me[0] + dx, y = s.me[1] + dy;
      if (inb(10, 10, x, y)) v[key(x, y)] = 1;
    }
    for (let i = 0; i < 100; i++) if (v[i]) s.seen[i] = 1;
    s.vis = v;
  }

  /* ------------------------------------------------------------------ rogue */
  // Four rooms, one per quadrant, joined by straight corridors.
  // floor: 0 rock or wall, 1 room floor, 2 corridor or door.
  function makeDungeon(r) {
    const floor = new Uint8Array(100), wall = new Uint8Array(100), roomOf = new Int8Array(100).fill(-1);
    const rooms = [];
    for (let q = 0; q < 4; q++) {
      const ox = (q % 2) * 5, oy = (q >> 1) * 5, w = r.range(2, 3), h = r.range(2, 3);
      const x0 = r.range(ox + 1, ox + 4 - w), y0 = r.range(oy + 1, oy + 4 - h);
      rooms.push({ x0, y0, x1: x0 + w - 1, y1: y0 + h - 1 });
    }
    rooms.forEach((m, i) => {
      for (let y = m.y0 - 1; y <= m.y1 + 1; y++) {
        for (let x = m.x0 - 1; x <= m.x1 + 1; x++) {
          roomOf[key(x, y)] = i;
          if (x >= m.x0 && x <= m.x1 && y >= m.y0 && y <= m.y1) floor[key(x, y)] = 1;
          else wall[key(x, y)] = 1;
        }
      }
    });
    const dig = (x, y) => { wall[key(x, y)] = 0; floor[key(x, y)] = 2; };
    const links = r.shuffle([[0, 1], [2, 3], [0, 2], [1, 3]]).slice(0, r.chance(0.4) ? 4 : 3);
    for (const [a, b] of links) {
      const A = rooms[a], B = rooms[b];
      if (b - a === 1) {
        const y = r.range(Math.max(A.y0, B.y0), Math.min(A.y1, B.y1));
        for (let x = A.x1 + 1; x <= B.x0 - 1; x++) dig(x, y);
      } else {
        const x = r.range(Math.max(A.x0, B.x0), Math.min(A.x1, B.x1));
        for (let y = A.y1 + 1; y <= B.y0 - 1; y++) dig(x, y);
      }
    }
    return { floor, wall, roomOf, rooms };
  }

  add({
    id: 'rogue',
    year: 1980,
    title: 'Procedural dungeon',
    games: ['Rogue (1980)', 'NetHack (1987)'],
    essence: 'Each descent builds a new dungeon of rooms and corridors, hidden until explored. Pick up gold, fight monsters one turn at a time, and find the stairs down.',
    channels: { agent: 'adventurer', enemy: 'monsters in view', reward: 'gold (dim = stairs down)', wall: 'explored walls (dim = corridors)' },
    fps: 5,
    warmup: 5,
    init(r) {
      const d = makeDungeon(r);
      const cells = (m) => {
        const out = [];
        for (let y = m.y0; y <= m.y1; y++) for (let x = m.x0; x <= m.x1; x++) out.push([x, y]);
        return out;
      };
      const start = r.i(4);
      const me = r.pick(cells(d.rooms[start]));
      const dist = distField(10, 10, [me], (x, y) => d.floor[key(x, y)] > 0);
      const used = new Set([key(...me)]);
      const free = (room) => {
        const opts = cells(d.rooms[room]).filter((p) => !used.has(key(...p)));
        const p = opts.length ? r.pick(opts) : null;
        if (p) used.add(key(...p));
        return p;
      };
      let far = 0;
      d.rooms.forEach((m, i) => {
        const c = key(m.x0, m.y0), f = key(d.rooms[far].x0, d.rooms[far].y0);
        if (dist[c] > dist[f]) far = i;
      });
      const stairs = key(...free(far));
      const gold = new Set();
      for (let n = 0; n < 3; n++) { const p = free(r.i(4)); if (p) gold.add(key(...p)); }
      const mons = [];
      for (let i = 0; i < 4; i++) if (i !== start && (i === far || r.chance(0.8))) { const p = free(i); if (p) mons.push({ p, hp: r.range(2, 4), awake: false }); }
      const s = Object.assign(d, { me, hp: 5, stairs, gold, mons, t: 0, lost: false, seen: new Uint8Array(100), vis: null });
      look(s);
      return s;
    },
    tick(s, r) {
      s.t++;
      const pass = (x, y) => s.floor[key(x, y)] > 0;
      const monAt = (x, y) => s.mons.find((m) => m.p[0] === x && m.p[1] === y);

      // adventurer: fight anything adjacent, else go for gold, then the stairs, else explore
      const foe = DIRS4.map(([dx, dy]) => monAt(s.me[0] + dx, s.me[1] + dy)).find(Boolean);
      if (foe) {
        if (r.chance(0.7)) foe.hp--;
        if (foe.hp <= 0) s.mons = s.mons.filter((m) => m !== foe);
      } else {
        const known = (x, y) => pass(x, y) && s.seen[key(x, y)];
        const gold = [...s.gold].filter((k) => s.seen[k]);
        const frontier = (x, y) => known(x, y) && DIRS4.some(([dx, dy]) => inb(10, 10, x + dx, y + dy) && pass(x + dx, y + dy) && !s.seen[key(x + dx, y + dy)]);
        const stairs = (x, y) => key(x, y) === s.stairs;
        const goal = gold.length ? (x, y) => gold.includes(key(x, y)) : frontier;
        // the stairs end the level, so step around them until everything else is done
        const free = (x, y) => known(x, y) && key(x, y) !== s.stairs;
        const walk = (g) => bfs(10, 10, s.me, g, (x, y) => free(x, y) && !monAt(x, y)) || bfs(10, 10, s.me, g, free) || bfs(10, 10, s.me, g, known);
        const path = walk(goal) || (s.seen[s.stairs] ? walk(stairs) : null);
        if (path && !monAt(...path[0])) s.me = path[0];
      }
      s.gold.delete(key(...s.me));
      look(s);
      if (key(...s.me) === s.stairs) return 'done';

      // monsters wake when seen, then close in and attack
      for (const m of s.mons) {
        if (s.vis[key(...m.p)]) m.awake = true;
        if (!m.awake) continue;
        if (Math.abs(m.p[0] - s.me[0]) + Math.abs(m.p[1] - s.me[1]) === 1) {
          if (r.chance(0.5)) s.hp--;
          continue;
        }
        const path = bfs(10, 10, m.p, (x, y) => x === s.me[0] && y === s.me[1], (x, y) => pass(x, y) && !monAt(x, y));
        if (path && path.length > 1) m.p = path[0];
      }
      if (s.hp <= 0) { s.lost = true; return 'done'; }
      if (s.t % 10 === 0 && s.hp < 5) s.hp++;
    },
    draw(s, g) {
      for (let i = 0; i < 100; i++) {
        if (!s.seen[i]) continue;
        const x = i % 10, y = (i / 10) | 0;
        if (s.wall[i]) g.cell(x, y, 'wall');
        else if (s.floor[i] === 2) g.cell(x, y, 'wall', DIM);
      }
      for (const k of s.gold) if (s.seen[k]) g.cell(k % 10, (k / 10) | 0, 'reward');
      if (s.seen[s.stairs]) g.cell(s.stairs % 10, (s.stairs / 10) | 0, 'reward', DIM);
      for (const m of s.mons) if (s.vis[key(...m.p)]) g.cell(m.p[0], m.p[1], 'enemy');
      g.cell(s.me[0], s.me[1], s.lost ? 'enemy' : 'agent');
    },
  });
  }

  // ---- from sims/2b-golden.js ----
  {

  // ------------------------------------------------------------------ sokoban
  const OFF4 = [1, 10, -1, -10]; // DIRS4 as index offsets on a 10-wide grid

  function skRoom(r) {
    const wall = new Uint8Array(100).fill(1);
    for (let y = 1; y < 9; y++) for (let x = 1; x < 9; x++) wall[y * 10 + x] = 0;
    for (const [left, up] of [[1, 1], [0, 1], [1, 0], [0, 0]]) {
      if (!r.chance(0.75)) continue;
      const w = r.range(1, 3), h = r.range(1, 2);
      const x0 = left ? 1 : 9 - w, y0 = up ? 1 : 9 - h;
      for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) wall[y * 10 + x] = 1;
    }
    for (let k = r.range(2, 4); k > 0; k--) {
      const x = r.range(2, 7), y = r.range(2, 7), [dx, dy] = r.pick(DIRS4);
      wall[y * 10 + x] = 1;
      if (r.chance(0.5)) wall[(y + dy) * 10 + x + dx] = 1;
    }
    const free = [];
    for (let i = 0; i < 100; i++) if (!wall[i]) free.push(i);
    const d = distField(10, 10, [[free[0] % 10, (free[0] / 10) | 0]], (x, y) => !wall[y * 10 + x]);
    return free.every((i) => d[i] >= 0) ? { wall, free } : null;
  }

  function skFlood(wall, box, p, seen = new Uint8Array(100)) {
    seen.fill(0);
    const st = [p];
    seen[p] = 1;
    let min = p;
    while (st.length) {
      const i = st.pop();
      if (i < min) min = i;
      for (const o of OFF4) {
        const j = i + o;
        if (!seen[j] && !wall[j] && !box[j]) { seen[j] = 1; st.push(j); }
      }
    }
    return { seen, min };
  }

  // a box in a corner that is not a target can never leave it
  const skDead = (wall, target, i) => !target[i] && (wall[i - 10] || wall[i + 10]) && (wall[i - 1] || wall[i + 1]);

  // breadth-first search over pushes; returns the full list of moves (DIRS4 indices)
  function skSolve(wall, target, boxes0, p0, cap) {
    const nodes = [{ b: boxes0.slice().sort((a, c) => a - c), p: p0, up: -1, push: null }];
    const seen = new Set(), queued = new Set(), box = new Uint8Array(100), buf = new Uint8Array(100);
    for (let qi = 0, expanded = 0; qi < nodes.length && expanded < cap; qi++) {
      const n = nodes[qi];
      box.fill(0);
      for (const b of n.b) box[b] = 1;
      const { seen: reach, min } = skFlood(wall, box, n.p, buf);
      const key = n.b.join(',') + ':' + min;
      if (seen.has(key)) continue;
      seen.add(key);
      expanded++;
      if (n.b.every((b) => target[b])) {
        const pushes = [];
        for (let k = qi; nodes[k].up >= 0; k = nodes[k].up) pushes.push(nodes[k].push);
        return skExpand(wall, boxes0, p0, pushes.reverse());
      }
      for (const b of n.b) for (let d = 0; d < 4; d++) {
        const o = OFF4[d], to = b + o;
        if (!reach[b - o] || wall[to] || box[to] || skDead(wall, target, to)) continue;
        const nb = n.b.map((c) => (c === b ? to : c)).sort((a, c) => a - c), qk = nb.join(',') + '|' + b;
        if (queued.has(qk)) continue;
        queued.add(qk);
        nodes.push({ b: nb, p: b, up: qi, push: [b, d] });
      }
    }
    return null;
  }

  // walk between pushes
  function skWalk(wall, box, from, to) {
    if (from === to) return [];
    const path = bfs(10, 10, [from % 10, (from / 10) | 0], (x, y) => y * 10 + x === to, (x, y) => !wall[y * 10 + x] && !box[y * 10 + x]);
    const moves = [];
    let cur = from;
    for (const [x, y] of path) { moves.push(OFF4.indexOf(y * 10 + x - cur)); cur = y * 10 + x; }
    return moves;
  }

  function skExpand(wall, boxes0, p0, pushes) {
    const box = new Uint8Array(100), moves = [];
    boxes0.forEach((b) => (box[b] = 1));
    let p = p0;
    for (const [b, d] of pushes) {
      moves.push(...skWalk(wall, box, p, b - OFF4[d]), d);
      box[b] = 0;
      box[b + OFF4[d]] = 1;
      p = b;
    }
    return moves;
  }

  function skGenerate(r) {
    for (let tries = 0; tries < 60; tries++) {
      const room = skRoom(r);
      if (!room) continue;
      const { wall, free } = room;
      const open = (i) => OFF4.filter((o) => !wall[i + o]).length;
      const spots = r.shuffle(free.filter((i) => open(i) >= 3));
      if (spots.length < 6) continue;
      const target = new Uint8Array(100), box = new Uint8Array(100);
      const targets = spots.slice(0, 3);
      targets.forEach((t) => (target[t] = box[t] = 1));
      // play backwards: walk around and sometimes pull a box along
      let p = spots[3];
      for (let k = 0; k < 160; k++) {
        const o = OFF4[r.i(4)], np = p + o;
        if (wall[np] || box[np]) continue;
        if (box[p - o] && r.chance(0.8)) { box[p - o] = 0; box[p] = 1; }
        p = np;
      }
      const boxes = [];
      for (let i = 0; i < 100; i++) if (box[i]) boxes.push(i);
      if (boxes.filter((b) => !target[b]).length < 3) continue;
      const moves = skSolve(wall, target, boxes, p, 700);
      if (!moves || moves.length < 18 || moves.length > 80) continue;
      return { wall, target, targets, box, p, moves };
    }
    return null;
  }

  add({
    id: 'sokoban',
    year: 1982,
    title: 'Box pushing',
    games: ['Sokoban (1982)', 'Boxxle (1989)'],
    essence: 'Push every box onto a target. Boxes can be pushed but never pulled, so one careless shove into a corner leaves the puzzle unsolvable.',
    channels: { agent: 'warehouse keeper', object: 'boxes', reward: 'box on target (dim = empty target)', enemy: 'stuck box', wall: 'warehouse' },
    fps: 5,
    maxTicks: 300,
    hold: 8,
    warmup: 4,
    init(r) {
      let g = null;
      while (!g) g = skGenerate(r);
      const outline = [];
      for (let i = 0; i < 100; i++) {
        if (!g.wall[i]) continue;
        const x = i % 10, y = (i / 10) | 0;
        if (DIRS8.some(([dx, dy]) => x + dx >= 0 && y + dy >= 0 && x + dx < 10 && y + dy < 10 && !g.wall[(y + dy) * 10 + x + dx])) outline.push(i);
      }
      return Object.assign(g, { outline, k: 0, blunder: r.chance(0.3), doomed: false, lost: -1, last: -1 });
    },
    tick(s) {
      const placed = () => s.targets.filter((t) => s.box[t]).length;
      let d = s.moves[s.k];
      // the occasional careless shove into a dead corner
      if (s.blunder && !s.doomed && s.box[s.p + OFF4[d]] && placed() >= 1) {
        const { seen } = skFlood(s.wall, s.box, s.p);
        search: for (let b = 0; b < 100; b++) {
          if (!s.box[b] || s.target[b]) continue;
          for (let k = 0; k < 4; k++) {
            const to = b + OFF4[k];
            if (!seen[b - OFF4[k]] || s.wall[to] || s.box[to] || !skDead(s.wall, s.target, to)) continue;
            s.moves = [...skWalk(s.wall, s.box, s.p, b - OFF4[k]), k];
            s.k = 0;
            s.doomed = true;
            d = s.moves[0];
            break search;
          }
        }
      }
      const np = s.p + OFF4[d];
      if (s.box[np]) { s.box[np] = 0; s.box[np + OFF4[d]] = 1; s.last = np + OFF4[d]; }
      s.p = np;
      s.k++;
      if (s.doomed && s.k >= s.moves.length) { s.lost = s.last; return 'done'; }
      if (placed() === s.targets.length || s.k >= s.moves.length) return 'done';
    },
    draw(s, g) {
      for (const i of s.outline) g.cell(i % 10, (i / 10) | 0, 'wall');
      for (const t of s.targets) if (!s.box[t]) g.cell(t % 10, (t / 10) | 0, 'reward', DIM);
      for (let i = 0; i < 100; i++) {
        if (s.box[i]) g.cell(i % 10, (i / 10) | 0, s.target[i] ? 'reward' : 'object');
      }
      if (s.lost >= 0) g.cell(s.lost % 10, (s.lost / 10) | 0, 'enemy');
      g.cell(s.p % 10, (s.p / 10) | 0, s.lost >= 0 ? 'enemy' : 'agent');
    },
  });

  // ---------------------------------------------------------------- artillery
  const AW = 12, AG = 0.12, ASUB = 4;

  function arPower(aim, dist) {
    const { lo, hi, hist } = aim;
    if (!hist.length) return aim.p0;
    if (lo && hi) {
      const f = clamp((dist - lo.d) / (hi.d - lo.d || 1), 0.15, 0.85);
      return lo.p + (hi.p - lo.p) * f;
    }
    const last = hist[hist.length - 1];
    return last.p * clamp(Math.sqrt(dist / Math.max(last.d, 0.5)), 0.8, 1.25);
  }

  add({
    id: 'artillery',
    year: 1983,
    title: 'Artillery duel',
    games: ['Artillery Duel (1983)', 'Scorched Earth (1991)', 'Worms (1995)'],
    essence: 'Two cannons take turns lobbing shells over the hills. Gravity and wind bend every shot, so each gunner corrects its power from where the last shell landed.',
    channels: { agent: 'cannon, shell (dim = trail)', enemy: 'rival cannon and shell (dim = trail, blast)', wall: 'terrain (dim = wind: side and length show direction and strength)' },
    w: AW,
    h: AW,
    fps: 8,
    maxTicks: 600,
    hold: 10,
    warmup: 8,
    init(r) {
      const solid = new Uint8Array(AW * AW), top = [];
      const base = r.range(8, 9), px = r.range(4, 7), peak = r.range(3, 6), slope = 1 + r.f();
      for (let x = 0; x < AW; x++) top[x] = Math.min(base + (r.chance(0.3) ? 1 : 0), Math.round(peak + Math.abs(x - px) * slope) + r.i(2));
      top[0] = top[2] = top[1];
      top[AW - 1] = top[AW - 3] = top[AW - 2];
      for (let x = 0; x < AW; x++) for (let y = top[x]; y < AW; y++) solid[y * AW + x] = 1;
      const aim = () => {
        const ang = (r.range(48, 62) * Math.PI) / 180, dist = AW - 3;
        // the first shot is a ranging shot, clearly short or long
        const off = r.chance(0.5) ? 0.8 + 0.08 * r.f() : 1.12 + 0.08 * r.f();
        return { ang, p0: Math.sqrt((dist * AG) / Math.sin(2 * ang)) * off, hist: [], lo: null, hi: null };
      };
      return {
        solid,
        me: { x: 1, y: top[1] - 1, aim: aim(), trail: [], noise: 0.04 },
        foe: { x: AW - 2, y: top[AW - 2] - 1, aim: aim(), trail: [], noise: 0.05 },
        wind: r.range(-2, 2),
        turn: r.chance(0.5) ? 'me' : 'foe',
        phase: 'wait', wait: 2, shell: null, boom: [], hit: null,
      };
    },
    tick(s, r) {
      const solidAt = (x, y) => y >= AW || (x >= 0 && x < AW && y >= 0 && s.solid[y * AW + x] === 1);
      if (s.phase === 'wait') {
        if (--s.wait > 0) return;
        const c = s[s.turn], other = s[s.turn === 'me' ? 'foe' : 'me'], dir = s.turn === 'me' ? 1 : -1;
        const p = arPower(c.aim, Math.abs(other.x - c.x)) * (1 + c.noise * (2 * r.f() - 1));
        s.shell = { x: c.x + 0.5, y: c.y + 0.3, vx: dir * p * Math.cos(c.aim.ang), vy: -p * Math.sin(c.aim.ang), p };
        c.trail = [];
        s.phase = 'fly';
        return;
      }
      if (s.phase === 'fly') {
        const c = s[s.turn], other = s[s.turn === 'me' ? 'foe' : 'me'], sh = s.shell;
        let impact = null;
        for (let k = 0; k < ASUB && !impact; k++) {
          sh.vx += (s.wind * 0.012) / ASUB;
          sh.vy += AG / ASUB;
          sh.x += sh.vx / ASUB;
          sh.y += sh.vy / ASUB;
          const cx = Math.floor(sh.x), cy = Math.floor(sh.y);
          if (cx < 0 || cx >= AW) {
            // left the screen: finish the flight unseen to learn where it would land
            let { x, y, vx, vy } = sh;
            for (let n = 0; n < 400 && y < c.y + 1; n++) { vx += (s.wind * 0.012) / ASUB; vy += AG / ASUB; x += vx / ASUB; y += vy / ASUB; }
            impact = { x, off: true };
          } else if (solidAt(cx, cy) || (cx === other.x && cy === other.y)) impact = { x: sh.x, cx, cy };
          else if (cy >= 0 && !(cx === c.x && cy === c.y)) {
            const l = c.trail[c.trail.length - 1];
            if (!l || l[0] !== cx || l[1] !== cy) c.trail.push([cx, cy]);
          }
        }
        if (!impact) return;
        const a = c.aim, d = (impact.x - (c.x + 0.5)) * (s.turn === 'me' ? 1 : -1), dist = Math.abs(other.x - c.x);
        a.hist.push({ p: sh.p, d });
        if (d < dist && (!a.lo || sh.p > a.lo.p)) a.lo = { p: sh.p, d };
        if (d > dist && (!a.hi || sh.p < a.hi.p)) a.hi = { p: sh.p, d };
        if (a.lo && a.hi && a.hi.p - a.lo.p < 0.03) { a.ang = Math.min(a.ang + 0.15, 1.35); a.hist = []; a.lo = a.hi = null; a.p0 = sh.p * 1.05; }
        s.shell = null;
        s.boom = [];
        if (!impact.off) {
          for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
            const x = impact.cx + dx, y = impact.cy + dy;
            if (x < 0 || x >= AW || y < 0 || y >= AW) continue;
            s.boom.push([x, y]);
            if (y < AW - 1) s.solid[y * AW + x] = 0;
          }
          const touched = (u) => s.boom.some(([x, y]) => x === u.x && y === u.y);
          if (touched(s.me)) s.hit = 'me';
          else if (touched(s.foe)) s.hit = 'foe';
        }
        s.phase = 'boom';
        s.wait = 3;
        return;
      }
      if (s.phase === 'boom') {
        if (--s.wait > 0) return;
        s.boom = [];
        for (const u of [s.me, s.foe]) while (!solidAt(u.x, u.y + 1)) u.y++;
        if (s.hit) return 'done';
        s.turn = s.turn === 'me' ? 'foe' : 'me';
        s.phase = 'wait';
        s.wait = 3;
      }
    },
    draw(s, g) {
      for (let i = 0; i < AW * AW; i++) if (s.solid[i]) g.cell(i % AW, (i / AW) | 0, 'wall');
      const n = Math.abs(s.wind);
      // wind: a run of cells from the top centre toward where it blows
      for (let k = 0; k < n; k++) g.cell(s.wind > 0 ? 6 + k : 5 - k, 0, 'wall', DIM);
      for (const [x, y] of s.me.trail) g.cell(x, y, 'agent', DIM);
      for (const [x, y] of s.foe.trail) g.cell(x, y, 'enemy', DIM);
      for (const [x, y] of s.boom) g.cell(x, y, 'enemy', DIM);
      g.cell(s.me.x, s.me.y, s.hit === 'me' && !s.boom.length ? 'enemy' : 'agent');
      if (s.hit !== 'foe') g.cell(s.foe.x, s.foe.y, 'enemy');
      if (s.shell && s.shell.y >= 0) g.cell(s.shell.x, s.shell.y, s.turn === 'me' ? 'agent' : 'enemy');
    },
  });

  // ------------------------------------------------------------------- robots
  const cheb = (a, b) => Math.max(Math.abs(a[0] - b[0]), Math.abs(a[1] - b[1]));

  function rbStep(robots, heaps, me) {
    const next = robots.map(([x, y]) => [x + sign(me[0] - x), y + sign(me[1] - y)]);
    const count = new Map();
    for (const [x, y] of next) count.set(y * 10 + x, (count.get(y * 10 + x) || 0) + 1);
    const h = new Set(heaps);
    const alive = [];
    for (const [x, y] of next) {
      const k = y * 10 + x;
      if (count.get(k) > 1) h.add(k);
      else if (!heaps.has(k)) alive.push([x, y]);
    }
    return { robots: alive, heaps: h, caught: next.some(([x, y]) => x === me[0] && y === me[1]) };
  }

  // each wave brings more robots; the scrap from earlier waves stays on the board
  function rbWave(s, r) {
    s.wave++;
    const n = 3 + 2 * s.wave;
    for (let tries = 0; s.robots.length < n && tries < 500; tries++) {
      const p = [r.i(10), r.i(10)];
      if (cheb(p, s.me) >= 4 && !s.heaps.has(p[1] * 10 + p[0]) && !s.robots.some((q) => q[0] === p[0] && q[1] === p[1])) s.robots.push(p);
    }
  }

  function rbMoves(s, me) {
    const out = [];
    for (const [dx, dy] of [[0, 0], ...DIRS8]) {
      const x = me[0] + dx, y = me[1] + dy;
      if (x < 0 || y < 0 || x > 9 || y > 9 || s.heaps.has(y * 10 + x)) continue;
      if (s.robots.some((p) => p[0] === x && p[1] === y)) continue;
      out.push([x, y]);
    }
    return out;
  }

  add({
    id: 'robots',
    year: 1984,
    title: 'Turn-based pursuit',
    games: ['Chase (1976)', 'Robots (1984)'],
    essence: 'Each turn you step, then every robot steps straight toward you. Robots that collide become a scrap heap, which wrecks any robot that walks into it. Teleporting is the desperate way out. Each wave brings more robots.',
    channels: { agent: 'player (dim = teleported from)', enemy: 'robots', object: 'scrap heaps' },
    fps: 4,
    maxTicks: 200,
    hold: 6,
    warmup: 2,
    init(r) {
      const s = { me: [r.range(3, 6), r.range(3, 6)], robots: [], heaps: new Set(), from: null, dead: false, wave: 0, rest: 0 };
      rbWave(s, r);
      return s;
    },
    tick(s, r) {
      s.from = null;
      if (s.rest) { if (--s.rest === 0) rbWave(s, r); return; }
      let best = null, bs = -Infinity;
      for (const c of rbMoves(s, s.me)) {
        const res = rbStep(s.robots, s.heaps, c);
        if (res.caught) continue;
        const after = { robots: res.robots, heaps: res.heaps };
        const outs = res.robots.length ? rbMoves(after, c).some((c2) => !rbStep(res.robots, res.heaps, c2).caught) : true;
        const near = res.robots.length ? Math.min(...res.robots.map((p) => cheb(p, c))) : 9;
        const score = 3 * (s.robots.length - res.robots.length) + Math.min(near, 3) + (outs ? 6 : -20) + r.f() * 0.5;
        if (score > bs) { bs = score; best = c; }
      }
      if (!best) {
        // nowhere safe: teleport to a random empty cell
        s.from = s.me;
        do best = [r.i(10), r.i(10)];
        while (s.heaps.has(best[1] * 10 + best[0]) || s.robots.some((p) => p[0] === best[0] && p[1] === best[1]));
      }
      s.me = best;
      const res = rbStep(s.robots, s.heaps, s.me);
      s.robots = res.robots;
      s.heaps = res.heaps;
      if (res.caught) { s.dead = true; return 'done'; }
      if (!s.robots.length) {
        if (s.wave === 3) return 'done';
        s.rest = 2;
      }
    },
    draw(s, g) {
      for (const k of s.heaps) g.cell(k % 10, (k / 10) | 0, 'object');
      for (const [x, y] of s.robots) g.cell(x, y, 'enemy');
      if (s.from) g.cell(s.from[0], s.from[1], 'agent', DIM);
      g.cell(s.me[0], s.me[1], s.dead ? 'enemy' : 'agent');
    },
  });
  }

  // ---- from sims/3-home.js ----
  {

  const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

  /* ------------------------------------------------------------------ stealth */

  const STEALTH = [
    '##########',
    '#........#',
    '#.##..##.#',
    '#.##..##.#',
    '#........#',
    '#........#',
    '#.##..##.#',
    '#.##..##.#',
    '#........#',
    '##########',
  ];
  // clockwise loop around the 2x2 pillar whose top-left is (px, py)
  function ring(px, py) {
    const out = [];
    for (let x = px - 1; x <= px + 2; x++) out.push([x, py - 1]);
    for (let y = py; y <= py + 2; y++) out.push([px + 2, y]);
    for (let x = px + 1; x >= px - 1; x--) out.push([x, py + 2]);
    for (let y = py + 1; y >= py; y--) out.push([px - 1, y]);
    return out;
  }
  // straight corridor walked back and forth
  function pingpong(cells) {
    return cells.concat(cells.slice(1, -1).reverse());
  }
  const MOVES5 = [[1, 0], [0, 1], [-1, 0], [0, -1], [0, 0]];

  add({
    id: 'stealth',
    year: 1987,
    title: 'Vision cones',
    games: ['Metal Gear (1987)', 'Thief: The Dark Project (1998)'],
    essence: 'Guards walk fixed patrols and see a cone ahead that walls block. Slip in, grab the item and get out, timing each move to stay outside every cone.',
    channels: { agent: 'infiltrator, planned steps (dim)', enemy: 'guards, view cones (dim)', reward: 'item, exit (dim = locked until the item is taken)', wall: 'walls' },
    fps: 5,
    hold: 8,
    warmup: 4,
    maxTicks: 220,
    init(r) {
      const wall = new Uint8Array(100);
      STEALTH.forEach((row, y) => [...row].forEach((c, x) => { if (c === '#') wall[y * 10 + x] = 1; }));
      const rows = [1, 4, 5, 8];
      const left = r.chance(0.5);
      const sy = r.pick(rows), ey = r.pick(rows.filter((y) => Math.abs(y - sy) >= 3));
      const start = [left ? 0 : 9, sy], exit = [left ? 9 : 0, ey];
      wall[start[1] * 10 + start[0]] = 0;
      wall[exit[1] * 10 + exit[0]] = 0;
      const item = r.pick([[4, 4], [5, 4], [4, 5], [5, 5], [4, 1], [5, 8], [1, 4], [8, 5]]
        .filter(([x, y]) => Math.abs(x - start[0]) + Math.abs(y - start[1]) >= 6));
      const loops = r.shuffle([ring(2, 2), ring(6, 2), ring(2, 6), ring(6, 6)]).slice(0, 3);
      const line = [];
      const across = r.chance(0.5), lane = r.pick([4, 5]);
      for (let k = 1; k <= 8; k++) line.push(across ? [k, lane] : [lane, k]);
      loops.push(pingpong(line));
      const s = { wall, start, exit, item, me: start.slice(), got: false, t: 0, caught: -1, won: false, plan: [] };
      for (let tries = 0; tries < 20; tries++) {
        s.guards = loops.map((p) => ({
          path: r.chance(0.5) ? p : p.slice().reverse(),
          i0: r.i(p.length), off: r.i(2), glanceEnd: -1, rot: 0,
        }));
        let ok = true;
        for (let t = 0; t < 5 && ok; t++) if (this.danger(s, t)[start[1] * 10 + start[0]]) ok = false;
        if (ok) break;
      }
      s.toItem = distField(10, 10, [item], (x, y) => !wall[y * 10 + x]);
      s.toExit = distField(10, 10, [exit], (x, y) => !wall[y * 10 + x]);
      return s;
    },
    // where guard g stands and faces at absolute time t
    pose(g, t) {
      const L = g.path.length, k = (g.i0 + Math.floor((t + g.off) / 2)) % L;
      const [x, y] = g.path[k], [nx, ny] = g.path[(k + 1) % L];
      let fx = nx - x, fy = ny - y;
      if (t <= g.glanceEnd) for (let q = 0; q < g.rot; q++) [fx, fy] = [-fy, fx];
      return { x, y, fx, fy };
    },
    cone(s, p) {
      const out = [p.y * 10 + p.x];
      const px = -p.fy, py = p.fx;
      const W = [0, 0, 1, 1];
      const vis = new Map();
      vis.set('0,0', true);
      for (let d = 1; d <= 3; d++) {
        for (let l = -W[d]; l <= W[d]; l++) {
          const pl = sign(l) * Math.min(Math.abs(l), W[d - 1]);
          if (!vis.get(`${d - 1},${pl}`)) continue;
          const x = p.x + p.fx * d + px * l, y = p.y + p.fy * d + py * l;
          if (x < 0 || y < 0 || x > 9 || y > 9 || s.wall[y * 10 + x]) continue;
          vis.set(`${d},${l}`, true);
          out.push(y * 10 + x);
        }
      }
      return out;
    },
    danger(s, t) {
      const d = new Uint8Array(100);
      for (const g of s.guards) for (const i of this.cone(s, this.pose(g, t))) d[i] = 1;
      return d;
    },
    tick(s, r) {
      const goal = s.got ? s.exit : s.item;
      const field = s.got ? s.toExit : s.toItem;
      const from = s.me[1] * 10 + s.me[0], gi = goal[1] * 10 + goal[0];
      // space-time BFS over the patrol schedule (moves or waits)
      const H = 30, layers = [];
      let layer = [from], found = -1;
      for (let k = 1; k <= H && layer.length; k++) {
        const dz = this.danger(s, s.t + k);
        const prev = new Int16Array(100).fill(-1), next = [];
        for (const c of layer) {
          for (const [dx, dy] of MOVES5) {
            const x = (c % 10) + dx, y = ((c / 10) | 0) + dy;
            if (x < 0 || y < 0 || x > 9 || y > 9) continue;
            const n = y * 10 + x;
            if (s.wall[n] || dz[n] || prev[n] >= 0) continue;
            prev[n] = c;
            next.push(n);
          }
        }
        layers.push(prev);
        layer = next;
        if (prev[gi] >= 0) { found = gi; break; }
      }
      if (found < 0 && layer.length) {
        // no safe route yet: survive as long as possible, ending near the goal
        found = layer.reduce((a, b) => (field[b] < field[a] ? b : a));
      }
      s.plan = [];
      if (found >= 0) {
        let c = found;
        for (let k = layers.length - 1; k >= 0; k--) { s.plan.unshift(c); c = layers[k][c]; }
      }
      const step = s.plan.length ? s.plan[0] : from;
      s.me = [step % 10, (step / 10) | 0];
      s.plan.shift();

      s.t++;
      // guards sometimes glance sideways or back, which the plan did not foresee
      for (const g of s.guards) {
        if (s.t > g.glanceEnd && r.chance(0.025)) { g.glanceEnd = s.t + 2; g.rot = r.pick([1, 2, 3]); }
      }
      const seen = s.guards.findIndex((g) => this.cone(s, this.pose(g, s.t)).includes(step));
      if (seen >= 0) { s.caught = seen; return 'done'; }
      if (!s.got && s.me[0] === s.item[0] && s.me[1] === s.item[1]) s.got = true;
      if (s.got && s.me[0] === s.exit[0] && s.me[1] === s.exit[1]) { s.won = true; return 'done'; }
      if (s.t > 200) return 'done';
    },
    draw(s, g) {
      for (let i = 0; i < 100; i++) if (s.wall[i]) g.cell(i % 10, (i / 10) | 0, 'wall');
      for (const gd of s.guards) {
        for (const i of this.cone(s, this.pose(gd, s.t))) g.cell(i % 10, (i / 10) | 0, 'enemy', DIM);
      }
      g.cell(s.exit[0], s.exit[1], 'reward', s.got ? 1 : DIM);
      if (!s.got) g.cell(s.item[0], s.item[1], 'reward');
      for (const i of s.plan.slice(0, 4)) g.cell(i % 10, (i / 10) | 0, 'agent', DIM);
      for (const gd of s.guards) {
        const p = this.pose(gd, s.t);
        g.cell(p.x, p.y, 'enemy');
      }
      g.cell(s.me[0], s.me[1], s.caught >= 0 ? 'enemy' : 'agent');
    },
  });

  /* -------------------------------------------------------------- minesweeper */

  const nb8 = (i) => {
    const x = i % 10, y = (i / 10) | 0, out = [];
    for (const [dx, dy] of DIRS8) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && ny >= 0 && nx < 10 && ny < 10) out.push(ny * 10 + nx);
    }
    return out;
  };

  add({
    id: 'minesweeper',
    year: 1990,
    title: 'Deduction by numbers',
    games: ['Mined-Out (1983)', 'Minesweeper (1990)'],
    essence: 'Each opened cell knows how many of its eight neighbours hide a mine. Open every safe cell by reasoning from those counts, flag the mines, and guess only when logic runs out.',
    channels: { agent: 'probe', enemy: 'mines (dim = flags)', object: 'opened cells next to a mine (dim)', wall: 'unopened cells' },
    fps: 5,
    hold: 10,
    warmup: 3,
    init(r) {
      const n = r.range(16, 19), fx = r.range(2, 7), fy = r.range(2, 7);
      const mine = new Uint8Array(100);
      let placed = 0;
      while (placed < n) {
        const i = r.i(100), x = i % 10, y = (i / 10) | 0;
        if (mine[i] || (Math.abs(x - fx) <= 1 && Math.abs(y - fy) <= 1)) continue;
        mine[i] = 1;
        placed++;
      }
      const cnt = new Uint8Array(100);
      for (let i = 0; i < 100; i++) cnt[i] = nb8(i).filter((j) => mine[j]).length;
      return { n, mine, cnt, open: new Uint8Array(100), flag: new Uint8Array(100), cur: fy * 10 + fx,
        queue: [[fy * 10 + fx, 'open']], boom: false, won: false, opened: 0 };
    },
    deduce(s, r) {
      const safe = new Set(), mines = new Set(), cons = [];
      for (let i = 0; i < 100; i++) {
        if (!s.open[i] || !s.cnt[i]) continue;
        const hid = nb8(i).filter((j) => !s.open[j] && !s.flag[j]);
        if (!hid.length) continue;
        const need = s.cnt[i] - nb8(i).filter((j) => s.flag[j]).length;
        cons.push({ hid, need });
        if (need === 0) hid.forEach((j) => safe.add(j));
        else if (need === hid.length) hid.forEach((j) => mines.add(j));
      }
      if (!safe.size && !mines.size) {
        // subset rule: if A's cells are inside B's, B minus A holds the difference
        for (const a of cons) for (const b of cons) {
          if (a === b || a.hid.length >= b.hid.length || !a.hid.every((j) => b.hid.includes(j))) continue;
          const diff = b.hid.filter((j) => !a.hid.includes(j)), dn = b.need - a.need;
          if (dn === 0) diff.forEach((j) => safe.add(j));
          else if (dn === diff.length) diff.forEach((j) => mines.add(j));
        }
      }
      const near = (i) => Math.abs((i % 10) - (s.cur % 10)) + Math.abs(((i / 10) | 0) - ((s.cur / 10) | 0));
      const acts = [...mines].map((i) => [i, 'flag']).concat([...safe].map((i) => [i, 'open']));
      if (acts.length) return acts.sort((a, b) => near(a[0]) - near(b[0]));
      // guess: lowest estimated mine probability
      let hidden = 0, flags = 0;
      for (let i = 0; i < 100; i++) { if (!s.open[i] && !s.flag[i]) hidden++; if (s.flag[i]) flags++; }
      const glob = (s.n - flags) / Math.max(1, hidden);
      let best = [], bp = 2;
      for (let i = 0; i < 100; i++) {
        if (s.open[i] || s.flag[i]) continue;
        let p = glob;
        for (const c of cons) if (c.hid.includes(i)) p = Math.max(p === glob ? 0 : p, c.need / c.hid.length);
        if (p < bp - 1e-9) { bp = p; best = [i]; } else if (Math.abs(p - bp) < 1e-9) best.push(i);
      }
      return [[r.pick(best), 'open']];
    },
    tick(s, r) {
      let act = null;
      while (!act) {
        if (!s.queue.length) s.queue = this.deduce(s, r);
        const a = s.queue.shift();
        if (!s.open[a[0]] && !s.flag[a[0]]) act = a;
      }
      const [i, kind] = act;
      s.cur = i;
      if (kind === 'flag') { s.flag[i] = 1; return; }
      if (s.mine[i]) { s.boom = true; return 'done'; }
      const stack = [i];
      while (stack.length) {
        const j = stack.pop();
        if (s.open[j] || s.flag[j]) continue;
        s.open[j] = 1;
        s.opened++;
        if (!s.cnt[j]) for (const k of nb8(j)) if (!s.open[k]) stack.push(k);
      }
      if (s.opened === 100 - s.n) {
        s.won = true;
        for (let j = 0; j < 100; j++) if (s.mine[j]) s.flag[j] = 1;
        return 'done';
      }
    },
    draw(s, g) {
      for (let i = 0; i < 100; i++) {
        const x = i % 10, y = (i / 10) | 0;
        if (s.flag[i]) g.cell(x, y, 'enemy', DIM);
        else if (s.boom && s.mine[i]) g.cell(x, y, 'enemy');
        else if (!s.open[i]) g.cell(x, y, 'wall');
        else if (s.cnt[i]) g.cell(x, y, 'object', DIM);
      }
      g.cell(s.cur % 10, (s.cur / 10) | 0, s.boom ? 'enemy' : 'agent');
    },
  });

  /* ------------------------------------------------------------------ simcity */

  add({
    id: 'simcity',
    year: 1989,
    title: 'Zoning and growth',
    games: ['SimCity (1989)', 'SimCity 2000 (1993)'],
    essence: 'You lay roads and the city grows by itself: plots beside a road fill in and densify over time. A fire spreads from lot to lot until it is put out.',
    channels: { agent: 'planner cursor', reward: 'dense plots (dim = growing)', object: 'roads', enemy: 'fire', wall: 'water, rubble (dim)' },
    fps: 7,
    hold: 10,
    warmup: 10,
    maxTicks: 320,
    init(r) {
      const ox = r.i(4), oy = r.i(4);
      const water = new Uint8Array(100);
      // a small lake grown from an edge cell
      let wx = r.pick([0, 9]), wy = r.range(1, 8);
      if (r.chance(0.5)) [wx, wy] = [wy, wx];
      for (let k = 0, n = r.range(4, 7); k < n; k++) {
        water[wy * 10 + wx] = 1;
        const [dx, dy] = r.pick(DIRS4);
        wx = clamp(wx + dx, 0, 9); wy = clamp(wy + dy, 0, 9);
      }
      const plan = new Uint8Array(100), road = new Uint8Array(100);
      for (let i = 0; i < 100; i++) {
        const x = i % 10, y = (i / 10) | 0;
        if (!water[i] && (x % 4 === ox || y % 4 === oy)) plan[i] = 1;
      }
      // the first road enters from an edge, on the biggest connected part of the plan
      let s0 = -1, big = 0;
      for (let k = 0; k < 12; k++) {
        const i = r.i(100), x = i % 10, y = (i / 10) | 0;
        if (!plan[i] || (x && y && x < 9 && y < 9)) continue;
        const d = distField(10, 10, [[x, y]], (px, py) => plan[py * 10 + px]);
        const n = d.filter((v) => v >= 0).length;
        if (n > big) { big = n; s0 = i; }
      }
      if (s0 < 0) s0 = oy * 10;
      road[s0] = 1;
      return { water, plan, road, dev: new Uint8Array(100), fire: new Uint8Array(100), rubble: new Uint8Array(100),
        cur: [s0 % 10, (s0 / 10) | 0], t: 0, fires: 0, target: -1 };
    },
    tick(s, r) {
      s.t++;
      const lot = (i) => !s.water[i] && !s.road[i];
      const roadNext = (i, reach = 1) => {
        const x = i % 10, y = (i / 10) | 0;
        for (let dy = -reach; dy <= reach; dy++) for (let dx = -reach; dx <= reach; dx++) {
          const nx = x + dx, ny = y + dy;
          if (Math.abs(dx) + Math.abs(dy) <= reach && nx >= 0 && ny >= 0 && nx < 10 && ny < 10 && s.road[ny * 10 + nx]) return true;
        }
        return false;
      };
      // cursor: fight fires first, otherwise extend the road lattice
      let target = -1, build = false;
      const fires = [];
      for (let i = 0; i < 100; i++) if (s.fire[i] >= 4) fires.push(i);
      const dist = (i) => cheb(i % 10, (i / 10) | 0, s.cur[0], s.cur[1]);
      if (fires.length) target = fires.reduce((a, b) => (dist(b) < dist(a) ? b : a));
      else {
        let bd = 99;
        for (let i = 0; i < 100; i++) {
          if (!s.plan[i] || s.road[i] || !roadNext(i)) continue;
          const d = dist(i) + (s.dev[i] ? 2 : 0) + r.f() * 0.5;
          if (d < bd) { bd = d; target = i; }
        }
        build = target >= 0;
      }
      if (target >= 0) {
        const tx = target % 10, ty = (target / 10) | 0;
        s.cur = [s.cur[0] + sign(tx - s.cur[0]), s.cur[1] + sign(ty - s.cur[1])];
        if (s.cur[0] === tx && s.cur[1] === ty) {
          if (build) { s.road[target] = 1; s.dev[target] = 0; }
          else { s.fire[target] = 0; s.dev[target] = Math.max(1, s.dev[target] - 1); }
        }
      }
      // fire spreads to neighbouring built plots and leaves rubble when it burns out
      const lit = [];
      for (let i = 0; i < 100; i++) {
        if (!s.fire[i]) continue;
        if (++s.fire[i] > 10) { s.fire[i] = 0; s.dev[i] = 0; s.rubble[i] = 14; continue; }
        const x = i % 10, y = (i / 10) | 0;
        for (const [dx, dy] of DIRS4) {
          const nx = x + dx, ny = y + dy, j = ny * 10 + nx;
          if (nx < 0 || ny < 0 || nx > 9 || ny > 9) continue;
          if (lot(j) && s.dev[j] && !s.fire[j] && r.chance(0.16)) lit.push(j);
        }
      }
      lit.forEach((j) => (s.fire[j] = 1));
      let built = 0, full = 0, open = 0;
      for (let i = 0; i < 100; i++) {
        if (s.rubble[i]) { s.rubble[i]--; continue; }
        if (!lot(i) || s.fire[i] || !roadNext(i, 2)) continue;
        open++;
        if (s.dev[i] >= 2) built++;
        if (s.dev[i] >= 3) { full++; continue; }
        const x = i % 10, y = (i / 10) | 0;
        let crowd = 0;
        for (const [dx, dy] of DIRS8) {
          const nx = x + dx, ny = y + dy;
          if (nx >= 0 && ny >= 0 && nx < 10 && ny < 10 && s.dev[ny * 10 + nx] >= 2) crowd++;
        }
        if (r.chance((roadNext(i) ? 0.04 : 0.015) + 0.012 * crowd)) s.dev[i]++;
      }
      if (!s.fire.some((v) => v) && s.fires < 2 && built > 8 && r.chance(0.03)) {
        const cands = [];
        for (let i = 0; i < 100; i++) if (lot(i) && s.dev[i] >= 2) cands.push(i);
        s.fire[r.pick(cands)] = 1;
        s.fires++;
      }
      const left = s.plan.some((p, i) => p && !s.road[i] && roadNext(i));
      if (!left && !s.fire.some((v) => v) && full >= open * 0.9) s.idle = (s.idle || 0) + 1;
      if (s.idle > 12 || s.t >= 300) return 'done';
    },
    draw(s, g) {
      for (let i = 0; i < 100; i++) {
        const x = i % 10, y = (i / 10) | 0;
        if (s.water[i]) g.cell(x, y, 'wall');
        else if (s.road[i]) g.cell(x, y, 'object');
        else if (s.fire[i]) g.cell(x, y, 'enemy');
        else if (s.rubble[i]) g.cell(x, y, 'wall', DIM);
        else if (s.dev[i]) g.cell(x, y, 'reward', s.dev[i] >= 3 ? 1 : DIM);
      }
      g.cell(s.cur[0], s.cur[1], 'agent');
    },
  });

  /* ------------------------------------------------------------- towerdefense */

  function tdPath(r) {
    for (;;) {
      const c1 = r.range(1, 2), c2 = c1 + r.range(2, 3), c3 = c2 + r.range(2, 3);
      if (c3 > 8) continue;
      const rows = [r.range(1, 8)];
      for (let k = 0; k < 3; k++) {
        const opts = [];
        for (let y = 1; y <= 8; y++) if (Math.abs(y - rows[k]) >= 3) opts.push(y);
        rows.push(r.pick(opts));
      }
      const pts = [[0, rows[0]], [c1, rows[0]], [c1, rows[1]], [c2, rows[1]], [c2, rows[2]], [c3, rows[2]], [c3, rows[3]], [9, rows[3]]];
      const path = [pts[0]];
      for (let k = 1; k < pts.length; k++) {
        let [x, y] = path[path.length - 1];
        const [tx, ty] = pts[k];
        while (x !== tx || y !== ty) {
          x += sign(tx - x); y += sign(ty - y);
          path.push([x, y]);
        }
      }
      return path;
    }
  }

  add({
    id: 'towerdefense',
    year: 1990,
    title: 'Tower defense',
    games: ['Rampart (1990)', 'Desktop Tower Defense (2007)', 'Plants vs. Zombies (2009)'],
    essence: 'Waves of creeps march along a fixed path toward your base. Towers built beside the path fire at whatever passes in range, and each kill pays for the next tower.',
    channels: { agent: 'towers', enemy: 'creeps (dim = hit this tick)', reward: 'base', wall: 'terrain (dim)' },
    fps: 7,
    hold: 10,
    warmup: 12,
    maxTicks: 400,
    init(r) {
      const path = tdPath(r);
      const onPath = new Uint8Array(100);
      path.forEach(([x, y]) => (onPath[y * 10 + x] = 1));
      return { path, onPath, towers: [], gold: 6, cost: 3, lives: 4, wave: 0, waves: 6, spawnLeft: 0, hp: 1,
        pause: 3, creeps: [], shots: [], t: 0, lost: false };
    },
    place(s, r) {
      const R2 = 5;
      let best = null, bs = -1;
      for (let i = 0; i < 100; i++) {
        if (s.onPath[i] || s.towers.some((t) => t.i === i)) continue;
        const x = i % 10, y = (i / 10) | 0;
        let sc = 0;
        s.path.forEach(([px, py], k) => {
          if ((px - x) ** 2 + (py - y) ** 2 > R2) return;
          const crowd = s.towers.filter((t) => (px - t.x) ** 2 + (py - t.y) ** 2 <= R2).length;
          sc += (k < s.path.length - 1 ? 1 : 0) / (1 + 0.6 * crowd);
        });
        sc += r.f() * 0.3;
        if (sc > bs) { bs = sc; best = { i, x, y, cd: 0 }; }
      }
      if (best) s.towers.push(best);
    },
    tick(s, r) {
      s.t++;
      s.shots = [];
      if (s.gold >= s.cost) { this.place(s, r); s.gold -= s.cost; s.cost += 1 + (s.towers.length % 2); }
      if (!s.spawnLeft && !s.creeps.length) {
        if (s.wave === s.waves) return 'done';
        if (--s.pause <= 0) { s.wave++; s.spawnLeft = 4 + s.wave; s.hp = 1 + s.wave + (s.wave > 3 ? 1 : 0); s.pause = 6; }
      }
      // creeps advance one cell per tick
      const end = s.path.length - 1;
      for (const c of s.creeps) c.i++;
      for (const c of s.creeps.filter((c) => c.i >= end)) {
        s.lives--;
        s.creeps.splice(s.creeps.indexOf(c), 1);
        if (s.lives <= 0) { s.lost = true; return 'done'; }
      }
      if (s.spawnLeft && s.t % 2 === 0) { s.creeps.push({ i: 0, hp: s.hp }); s.spawnLeft--; }
      // towers fire at the creep furthest along the path
      for (const t of s.towers) {
        t.fired = false;
        if (t.cd > 0) { t.cd--; continue; }
        let tgt = null;
        for (const c of s.creeps) {
          const [x, y] = s.path[c.i];
          if ((x - t.x) ** 2 + (y - t.y) ** 2 <= 5 && (!tgt || c.i > tgt.i)) tgt = c;
        }
        if (!tgt) continue;
        t.cd = 1;
        t.fired = true;
        tgt.hp--;
        s.shots.push(s.path[tgt.i]);
        if (tgt.hp <= 0) { s.creeps.splice(s.creeps.indexOf(tgt), 1); s.gold++; }
      }
    },
    draw(s, g) {
      for (let i = 0; i < 100; i++) if (!s.onPath[i]) g.cell(i % 10, (i / 10) | 0, 'wall', DIM);
      const [bx, by] = s.path[s.path.length - 1];
      g.cell(bx, by, s.lost ? 'enemy' : 'reward');
      for (const t of s.towers) g.cell(t.x, t.y, 'agent');
      for (const c of s.creeps) {
        const [x, y] = s.path[c.i];
        g.cell(x, y, 'enemy');
      }
      for (const [x, y] of s.shots) g.cell(x, y, 'enemy', DIM);
    },
  });

  /* ----------------------------------------------------------------- lemmings */

  const LEM = [
    '##########',
    '#H.......#',
    '#........#',
    '#######D##',
    '#........#',
    '#X.......#',
    '###..#####',
    '#........#',
    '#~~~~~~~~#',
    '##########',
  ];

  add({
    id: 'lemmings',
    year: 1991,
    title: 'Autonomous walkers',
    games: ['Lemmings (1991)'],
    essence: 'Walkers march forward on their own, turning at walls and falling off edges. The player steers them indirectly by handing out skills: dig through a floor, bridge a gap, block the way.',
    channels: { agent: 'walkers (dim = using a skill)', enemy: 'casualties (dim = water)', reward: 'exit', object: 'built bricks (dim = entrance)', wall: 'rock (dim = diggable dirt)' },
    fps: 6,
    hold: 10,
    warmup: 10,
    maxTicks: 400,
    init(r) {
      const flip = r.chance(0.5);
      const map = LEM.map((row) => (flip ? [...row].reverse().join('') : row));
      const at = (ch) => {
        for (let y = 0; y < 10; y++) { const x = map[y].indexOf(ch); if (x >= 0) return [x, y]; }
      };
      return { map, solid: map.map((row) => [...row].map((c) => c === '#' || c === 'D')),
        hatch: at('H'), exit: at('X'), dir0: flip ? -1 : 1,
        walkers: [], toSpawn: r.range(6, 8), every: r.range(3, 4), skill: 0.35 + r.f() * 0.45,
        saved: 0, splash: [], t: 0, dug: false, bridged: false };
    },
    isSolid(s, x, y) { return x < 0 || x > 9 || y < 0 || y > 9 || s.solid[y][x]; },
    lethal(s, x, y) {
      for (let k = 0; y + k <= 9; k++) {
        if (s.map[y + k][x] === '~') return true;
        if (this.isSolid(s, x, y + k)) return k > 4;
      }
      return true;
    },
    tick(s, r) {
      s.t++;
      if (s.toSpawn > 0 && s.t % s.every === 1) {
        s.walkers.push({ x: s.hatch[0], y: s.hatch[1], dir: s.dir0, st: 'walk', fall: 0, timer: 0, bricks: 0 });
        s.toSpawn--;
      }
      const solid = (x, y) => this.isSolid(s, x, y);
      const blockAt = (x, y) => s.walkers.some((w) => w.st === 'block' && w.x === x && w.y === y);
      // the player: one skill per tick, with imperfect reactions
      if (r.chance(s.skill)) {
        const standing = s.walkers.filter((w) => w.st === 'walk' && solid(w.x, w.y + 1));
        const builder = s.walkers.find((w) => w.st === 'build');
        let w;
        if (!s.dug && (w = standing.find((w) => s.map[w.y + 1][w.x] === 'D'))) { w.st = 'dig'; w.timer = 0; s.dug = true; }
        else if (!s.bridged && !builder && (w = standing.find((w) => {
          const nx = w.x + w.dir;
          return !solid(nx, w.y) && !solid(nx, w.y + 1) && this.lethal(s, nx, w.y + 1);
        }))) { w.st = 'build'; w.timer = 0; }
        else if (!s.bridged && builder && !s.walkers.some((w) => w.st === 'block') && (w = standing.find((w) =>
          w.y === builder.y && sign(builder.x - w.x) === w.dir && Math.abs(builder.x - w.x) >= 2))) w.st = 'block';
      }
      for (const w of s.walkers.slice()) {
        if (w.st === 'block') continue;
        if (!solid(w.x, w.y + 1)) {
          w.y++; w.fall++;
          if (s.map[w.y][w.x] === '~') { s.splash.push([w.x, w.y]); s.walkers.splice(s.walkers.indexOf(w), 1); }
          continue;
        }
        if (w.fall > 4) { s.splash.push([w.x, w.y]); s.walkers.splice(s.walkers.indexOf(w), 1); continue; }
        w.fall = 0;
        if (w.st === 'dig') {
          if (++w.timer < 2) continue;
          w.timer = 0;
          if (s.map[w.y + 1][w.x] === 'D' && s.solid[w.y + 1][w.x]) s.solid[w.y + 1][w.x] = false;
          else w.st = 'walk';
          continue;
        }
        if (w.st === 'build') {
          if (++w.timer < 2) continue;
          w.timer = 0;
          const nx = w.x + w.dir;
          if (solid(nx, w.y)) { w.dir = -w.dir; w.st = 'walk'; continue; }
          if (solid(nx, w.y + 1) || w.bricks >= 4) { w.st = 'walk'; s.bridged = true; continue; }
          s.solid[w.y + 1][nx] = 'brick';
          w.bricks++;
          w.x = nx;
          continue;
        }
        const nx = w.x + w.dir;
        if (solid(nx, w.y) || blockAt(nx, w.y)) w.dir = -w.dir;
        else w.x = nx;
        if (w.x === s.exit[0] && w.y === s.exit[1]) { s.saved++; s.walkers.splice(s.walkers.indexOf(w), 1); }
      }
      if (s.bridged) s.walkers.forEach((w) => { if (w.st === 'block') w.st = 'walk'; });
      if (!s.toSpawn && !s.walkers.length) return 'done';
    },
    draw(s, g) {
      for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
        const c = s.map[y][x], sd = s.solid[y][x];
        if (sd === 'brick') g.cell(x, y, 'object');
        else if (c === '#') g.cell(x, y, 'wall');
        else if (c === 'D' && sd) g.cell(x, y, 'wall', DIM);
        else if (c === '~') g.cell(x, y, 'enemy', DIM);
      }
      g.cell(s.hatch[0], s.hatch[1], 'object', DIM);
      g.cell(s.exit[0], s.exit[1], 'reward');
      for (const [x, y] of s.splash) g.cell(x, y, 'enemy');
      for (const w of s.walkers) g.cell(w.x, w.y, 'agent', w.st === 'walk' ? 1 : DIM);
    },
  });

  /* ---------------------------------------------------------------------- civ */

  add({
    id: 'civ',
    year: 1991,
    title: 'Territorial expansion',
    games: ['Empire (1977)', 'Civilization (1991)'],
    essence: 'Two rivals found cities that claim the land around them and send settlers to found more. When the borders meet, frontier land and whole cities change hands.',
    channels: { agent: 'your cities (dim = territory)', enemy: 'rival cities (dim = territory)', wall: 'mountains' },
    fps: 7,
    hold: 10,
    warmup: 8,
    maxTicks: 260,
    init(r) {
      const mount = new Uint8Array(100);
      const a = [r.range(0, 2), r.range(0, 2)], b = [9 - r.range(0, 2), 9 - r.range(0, 2)];
      if (r.chance(0.5)) { a[0] = 9 - a[0]; b[0] = 9 - b[0]; }
      for (let k = 0; k < 3; k++) {
        let x = r.range(2, 7), y = r.range(2, 7);
        for (let n = r.range(2, 4); n > 0; n--) {
          if (cheb(x, y, a[0], a[1]) > 1 && cheb(x, y, b[0], b[1]) > 1) mount[y * 10 + x] = 1;
          const [dx, dy] = r.pick(DIRS4);
          x = clamp(x + dx, 0, 9); y = clamp(y + dy, 0, 9);
        }
      }
      const s = { mount, owner: new Int8Array(100), cities: [], cool: [0, 2, 2], t: 0, flips: [], lost: null, last: null };
      this.found(s, a[0], a[1], 1);
      this.found(s, b[0], b[1], 2);
      return s;
    },
    found(s, x, y, f) {
      s.cities.push({ x, y, f });
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy, i = ny * 10 + nx;
        if (nx >= 0 && ny >= 0 && nx < 10 && ny < 10 && !s.mount[i] && (!s.owner[i] || (!dx && !dy))) s.owner[i] = f;
      }
    },
    tick(s, r) {
      s.t++;
      s.flips = [];
      const nbr = (i) => DIRS4.map(([dx, dy]) => [(i % 10) + dx, ((i / 10) | 0) + dy])
        .filter(([x, y]) => x >= 0 && y >= 0 && x < 10 && y < 10).map(([x, y]) => y * 10 + x);
      const cityAt = (i) => s.cities.find((c) => c.y * 10 + c.x === i);
      for (const f of s.t % 2 ? [1, 2] : [2, 1]) {
        const foe = 3 - f, mine = s.cities.filter((c) => c.f === f);
        if (!mine.length) continue;
        // each city claims one free cell nearby
        for (const c of mine) {
          let best = -1, bd = 99;
          for (let i = 0; i < 100; i++) {
            const x = i % 10, y = (i / 10) | 0;
            if (s.owner[i] || s.mount[i] || cheb(x, y, c.x, c.y) > 2) continue;
            if (!nbr(i).some((j) => s.owner[j] === f)) continue;
            const d = Math.abs(x - c.x) + Math.abs(y - c.y) + r.f();
            if (d < bd) { bd = d; best = i; }
          }
          if (best >= 0) s.owner[best] = f;
        }
        // settlers found a new city at the edge of the realm
        if (--s.cool[f] <= 0) {
          let best = -1, bs = 0;
          for (let i = 0; i < 100; i++) {
            const x = i % 10, y = (i / 10) | 0;
            if (s.mount[i] || s.owner[i] === foe) continue;
            if (s.cities.some((c) => cheb(x, y, c.x, c.y) < (c.f === f ? 3 : 2))) continue;
            if (s.owner[i] !== f && !nbr(i).some((j) => s.owner[j] === f)) continue;
            let sc = 0;
            for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
              const nx = x + dx, ny = y + dy;
              if (nx >= 0 && ny >= 0 && nx < 10 && ny < 10 && !s.owner[ny * 10 + nx] && !s.mount[ny * 10 + nx]) sc++;
            }
            sc += r.f();
            if (sc > bs) { bs = sc; best = i; }
          }
          if (best >= 0 && bs >= 2) { this.found(s, best % 10, (best / 10) | 0, f); s.flips.push(best); }
          s.cool[f] = r.range(5, 8);
        }
        // frontier skirmishes: stronger local presence wins land
        for (let n = 1 + Math.floor(mine.length / 3); n > 0; n--) {
          const front = [];
          for (let i = 0; i < 100; i++) if (s.owner[i] === foe && !cityAt(i) && nbr(i).some((j) => s.owner[j] === f)) front.push(i);
          if (!front.length) break;
          const i = r.pick(front), x = i % 10, y = (i / 10) | 0;
          const str = (g) => s.cities.reduce((a, c) => a + (c.f !== g ? 0 : cheb(x, y, c.x, c.y) <= 3 ? 1 : 0.3), 0.3);
          const sf = str(f), se = str(foe);
          if (r.chance((0.6 * sf * sf) / (sf * sf + se * se))) { s.owner[i] = f; s.flips.push(i); }
        }
        // a city surrounded by enemy land falls
        for (const c of s.cities.filter((c) => c.f === foe)) {
          let own = 0, tot = 0;
          for (const [dx, dy] of DIRS8) {
            const nx = c.x + dx, ny = c.y + dy, i = ny * 10 + nx;
            if (nx < 0 || ny < 0 || nx > 9 || ny > 9 || s.mount[i]) continue;
            tot++;
            if (s.owner[i] === f) own++;
          }
          if (tot && own / tot >= 0.5 && r.chance(0.3)) {
            c.f = f;
            s.owner[c.y * 10 + c.x] = f;
            s.flips.push(c.y * 10 + c.x);
            s.last = c;
          }
        }
      }
      const n1 = s.cities.filter((c) => c.f === 1).length, n2 = s.cities.length - n1;
      if (!n1) { s.lost = s.last; return 'done'; }
      if (!n2 || s.t >= 180) return 'done';
    },
    draw(s, g) {
      for (let i = 0; i < 100; i++) {
        const x = i % 10, y = (i / 10) | 0;
        if (s.mount[i]) g.cell(x, y, 'wall');
        else if (s.owner[i]) g.cell(x, y, s.owner[i] === 1 ? 'agent' : 'enemy', DIM);
      }
      for (const c of s.cities) g.cell(c.x, c.y, c.f === 1 ? 'agent' : 'enemy');
    },
  });

  /* ---------------------------------------------------------------------- rts */

  add({
    id: 'rts',
    year: 1992,
    title: 'Gather and return',
    games: ['Dune II (1992)', 'Warcraft: Orcs & Humans (1994)'],
    essence: 'Workers walk to resource fields, fill up and carry each load back to base. Delivered stock pays for more workers, and the base guns down raiders that come too close.',
    channels: { agent: 'base, loaded workers (dim = empty workers)', enemy: 'raider, fallen workers (dim)', reward: 'resource fields', wall: 'rocks' },
    fps: 7,
    hold: 10,
    warmup: 10,
    maxTicks: 400,
    init(r) {
      for (;;) {
        const flip = r.chance(0.5), X = (x) => (flip ? 9 - x : x);
        const wall = new Uint8Array(100), field = new Uint8Array(100);
        const base = [X(1), r.range(3, 6)];
        for (let k = 0; k < 3; k++) {
          let x = r.range(3, 7), y = r.range(0, 9);
          for (let n = r.range(2, 3); n > 0; n--) {
            wall[y * 10 + X(x)] = 1;
            const [dx, dy] = r.pick(DIRS4);
            x = clamp(x + dx, 3, 7); y = clamp(y + dy, 0, 9);
          }
        }
        for (let k = 0; k < 3; k++) {
          let x = r.range(6, 9), y = r.range(0, 9);
          for (let n = 3; n > 0; n--) {
            const i = y * 10 + X(x);
            if (!wall[i]) field[i] = r.range(2, 4);
            const [dx, dy] = r.pick(DIRS4);
            x = clamp(x + dx, 6, 9); y = clamp(y + dy, 0, 9);
          }
        }
        const bi = base[1] * 10 + base[0];
        wall[bi] = 0; field[bi] = 0;
        const free = (x, y) => !wall[y * 10 + x] && !field[y * 10 + x] && y * 10 + x !== bi;
        const d = distField(10, 10, [base], (x, y) => free(x, y) || y * 10 + x === bi);
        let ok = true;
        for (let i = 0; i < 100; i++) {
          if (!field[i]) continue;
          const x = i % 10, y = (i / 10) | 0;
          if (!DIRS4.some(([dx, dy]) => d[(y + dy) * 10 + x + dx] > 0 && x + dx >= 0 && x + dx < 10)) ok = false;
        }
        if (!ok) continue;
        const spots = DIRS8.map(([dx, dy]) => [base[0] + dx, base[1] + dy]).filter(([x, y]) => x >= 0 && x < 10 && free(x, y));
        return { wall, field, base, bi, flip, workers: spots.slice(0, 2).map((p) => ({ p, carry: false, mine: 0 })),
          stock: 0, raider: null, raidT: r.range(22, 34), shot: false, marks: [], t: 0, lost: null };
      }
    },
    tick(s, r) {
      s.t++;
      s.shot = false;
      const free = (x, y) => !s.wall[y * 10 + x] && !s.field[y * 10 + x] && y * 10 + x !== s.bi;
      const atBase = (x, y) => x === s.base[0] && y === s.base[1];
      const rd = s.raider;
      for (const w of s.workers) {
        const [x, y] = w.p;
        const flee = rd && Math.abs(rd.p[0] - x) + Math.abs(rd.p[1] - y) <= 4;
        if (w.mine > 0 && !flee) {
          if (--w.mine === 0) {
            w.carry = true;
            if (s.field[w.f] && --s.field[w.f] === 0) s.field[w.f] = 0;
          }
          continue;
        }
        w.mine = 0;
        if (w.carry || flee) {
          const path = bfs(10, 10, w.p, atBase, free);
          if (!path) continue;
          if (path.length === 1) {
            if (w.carry) { w.carry = false; s.stock++; }
          } else w.p = path[0];
          continue;
        }
        // nearest field, avoiding cells other workers already claim
        const taken = new Set(s.workers.filter((o) => o !== w && !o.carry).map((o) => o.f));
        const path = bfs(10, 10, w.p, (fx, fy) => s.field[fy * 10 + fx] > 0 && !taken.has(fy * 10 + fx), free) ||
          bfs(10, 10, w.p, (fx, fy) => s.field[fy * 10 + fx] > 0, free);
        if (!path) continue;
        const [gx, gy] = path[path.length - 1];
        w.f = gy * 10 + gx;
        if (path.length === 1) w.mine = 3;
        else w.p = path[0];
      }
      if (s.stock >= 3 && s.workers.length < 6) {
        const spot = DIRS8.map(([dx, dy]) => [s.base[0] + dx, s.base[1] + dy]).find(([x, y]) => x >= 0 && x < 10 && y >= 0 && y < 10 && free(x, y));
        if (spot) { s.stock -= 3; s.workers.push({ p: spot, carry: false, mine: 0 }); }
      }
      // raiders arrive from the far edge and hunt the nearest worker
      if (!s.raider && --s.raidT <= 0) {
        const ex = s.flip ? 0 : 9, opts = [];
        const reach = distField(10, 10, [s.base], (x, y) => free(x, y));
        for (let y = 0; y < 10; y++) if (free(ex, y) && reach[y * 10 + ex] > 0) opts.push([ex, y]);
        if (opts.length) s.raider = { p: r.pick(opts), hp: 3, age: 0 };
        s.raidT = r.range(40, 60);
      }
      if (s.raider && s.workers.length) {
        const R = s.raider;
        if (s.t % 3) {
          const step = bfs(10, 10, R.p, (x, y) => s.workers.some((w) => w.p[0] === x && w.p[1] === y), free);
          if (step) R.p = step[0];
        }
        if (++R.age > 50) s.raider = null;
        const hit = s.workers.find((w) => w.p[0] === R.p[0] && w.p[1] === R.p[1]);
        if (hit) { s.workers.splice(s.workers.indexOf(hit), 1); s.marks.push({ p: hit.p, ttl: 10 }); s.lost = hit.p; }
        if (s.raider && cheb(R.p[0], R.p[1], s.base[0], s.base[1]) <= 3 && s.t % 2 === 0) {
          s.shot = true;
          if (--R.hp <= 0) s.raider = null;
        }
      }
      s.marks = s.marks.filter((m) => --m.ttl > 0);
      if (!s.workers.length) return 'done';
      if (!s.field.some((v) => v > 0) && !s.workers.some((w) => w.carry)) { s.lost = null; return 'done'; }
    },
    draw(s, g) {
      for (let i = 0; i < 100; i++) {
        const x = i % 10, y = (i / 10) | 0;
        if (s.wall[i]) g.cell(x, y, 'wall');
        else if (s.field[i]) g.cell(x, y, 'reward');
      }
      for (const m of s.marks) g.cell(m.p[0], m.p[1], 'enemy', DIM);
      g.cell(s.base[0], s.base[1], 'agent');
      for (const w of s.workers) g.cell(w.p[0], w.p[1], 'agent', w.carry ? 1 : DIM);
      if (s.raider) g.cell(s.raider.p[0], s.raider.p[1], 'enemy');
      if (!s.workers.length && s.lost) g.cell(s.lost[0], s.lost[1], 'enemy');
    },
  });

  /* ---------------------------------------------------------------- lightsout */

  // Solve Lights Out over GF(2); returns the fewest presses found.
  function lightsSolve(n, lit) {
    const N = n * n;
    const rows = [];
    for (let i = 0; i < N; i++) {
      const row = new Uint8Array(N + 1), x = i % n, y = (i / n) | 0;
      row[i] = 1;
      for (const [dx, dy] of DIRS4) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < n && ny < n) row[ny * n + nx] = 1;
      }
      row[N] = lit[i];
      rows.push(row);
    }
    const pivots = [];
    let rank = 0;
    for (let c = 0; c < N && rank < N; c++) {
      let p = -1;
      for (let k = rank; k < N; k++) if (rows[k][c]) { p = k; break; }
      if (p < 0) continue;
      [rows[rank], rows[p]] = [rows[p], rows[rank]];
      for (let k = 0; k < N; k++) {
        if (k !== rank && rows[k][c]) for (let j = c; j <= N; j++) rows[k][j] ^= rows[rank][j];
      }
      pivots.push(c);
      rank++;
    }
    for (let k = rank; k < N; k++) if (rows[k][N]) return null;
    const isPivot = new Uint8Array(N);
    pivots.forEach((c) => (isPivot[c] = 1));
    const free = [];
    for (let c = 0; c < N; c++) if (!isPivot[c]) free.push(c);
    let best = null;
    for (let m = 0; m < 1 << Math.min(free.length, 6); m++) {
      const x = new Uint8Array(N);
      free.forEach((c, k) => (x[c] = (m >> k) & 1));
      pivots.forEach((c, k) => {
        let v = rows[k][N];
        for (const f of free) if (rows[k][f]) v ^= x[f];
        x[c] = v;
      });
      const sol = [];
      for (let i = 0; i < N; i++) if (x[i]) sol.push(i);
      if (!best || sol.length < best.length) best = sol;
    }
    return best;
  }

  add({
    id: 'lightsout',
    year: 1995,
    title: 'Toggle puzzle',
    games: ['Lights Out (1995)'],
    essence: 'Pressing a cell flips it and its four neighbours. Turn every light off, which takes planning because each press undoes part of the last.',
    channels: { agent: 'cursor (dim = on a lit cell)', reward: 'lit cells', wall: 'frame' },
    fps: 6,
    hold: 10,
    warmup: 4,
    init(r) {
      const n = r.pick([5, 6, 7]), o = n === 5 ? 3 : 2;
      let lit;
      do {
        lit = new Uint8Array(n * n);
        for (let k = r.range(n + 2, 2 * n + 2); k > 0; k--) this.press(n, lit, r.i(n * n));
      } while (lit.reduce((a, b) => a + b, 0) < n + 1);
      const sol = lightsSolve(n, lit) || [];
      // play row by row in a zig-zag, which reads like chasing the lights down
      const key = (i) => { const x = i % n, y = (i / n) | 0; return y * 100 + (y % 2 ? n - x : x); };
      sol.sort((a, b) => key(a) - key(b));
      return { n, o, lit, sol, k: 0, cur: [0, 0], pressed: -1 };
    },
    press(n, lit, i) {
      const x = i % n, y = (i / n) | 0;
      lit[i] ^= 1;
      for (const [dx, dy] of DIRS4) {
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && ny >= 0 && nx < n && ny < n) lit[ny * n + nx] ^= 1;
      }
    },
    tick(s) {
      s.pressed = -1;
      if (s.k >= s.sol.length) return 'done';
      const t = s.sol[s.k], tx = t % s.n, ty = (t / s.n) | 0;
      if (s.cur[0] === tx && s.cur[1] === ty) {
        this.press(s.n, s.lit, t);
        s.pressed = t;
        s.k++;
        if (!s.lit.some((v) => v)) return 'done';
      } else if (s.cur[0] !== tx) s.cur[0] += sign(tx - s.cur[0]);
      else s.cur[1] += sign(ty - s.cur[1]);
    },
    draw(s, g) {
      const { n, o } = s;
      g.rect(o - 1, o - 1, n + 2, 1, 'wall');
      g.rect(o - 1, o + n, n + 2, 1, 'wall');
      g.rect(o - 1, o, 1, n, 'wall');
      g.rect(o + n, o, 1, n, 'wall');
      for (let i = 0; i < n * n; i++) if (s.lit[i]) g.cell(o + (i % n), o + ((i / n) | 0), 'reward');
      const ci = s.cur[1] * n + s.cur[0];
      g.cell(o + s.cur[0], o + s.cur[1], 'agent', s.lit[ci] ? DIM : 1);
    },
  });

  /* ------------------------------------------------------------------ harvest */

  // plot stages: 0 hard ground, 1 tilled, 2 seeded, 3 sprout, 4 growing, 5 ripe
  add({
    id: 'harvest',
    year: 1996,
    title: 'Planting cycles',
    games: ['Harvest Moon (1996)', 'Stardew Valley (2016)'],
    essence: 'Till, plant and water each plot every day. Crops grow overnight only if watered, and ripe ones are carried to the bin before the season ends.',
    channels: { agent: 'farmer (dim = carrying a crop)', reward: 'ripe crops (dim = growing)', object: 'bin, watered seeds (dim = tilled soil)', enemy: 'pest', wall: 'unworked ground (dim)' },
    fps: 8,
    hold: 10,
    warmup: 8,
    maxTicks: 300,
    init(r) {
      const plots = [];
      for (let y = 5; y <= 6; y++) for (let x = 3; x <= 7; x++) {
        const st = r.pick([0, 0, 1, 2, 2, 3]);
        plots.push({ x, y, st, wet: false, nib: 0 });
      }
      return { plots, me: [2, 3], bin: [1, 2], stock: 0, carry: false, day: 1, days: 8, dayLen: 20, t: 0, pest: null, act: -1 };
    },
    tick(s, r) {
      s.t++;
      s.act = -1;
      const days = s.days - s.day;
      // night: watered crops grow one stage
      if (s.t % s.dayLen === 0) {
        s.day++;
        for (const p of s.plots) { if (p.wet && p.st >= 2 && p.st < 5) p.st++; p.wet = false; }
        if (s.day > s.days) return 'done';
      }
      // pests sneak in from the edge and nibble growing crops
      if (!s.pest && s.day >= 3 && s.plots.some((p) => p.st >= 3) && r.chance(0.03)) {
        s.pest = { x: r.pick([0, 9]), y: r.range(3, 9), timer: 0 };
      }
      const P = s.pest;
      if (P) {
        const crops = s.plots.filter((p) => p.st >= 3);
        const tgt = crops.reduce((a, b) => (!a || Math.abs(b.x - P.x) + Math.abs(b.y - P.y) < Math.abs(a.x - P.x) + Math.abs(a.y - P.y) ? b : a), null);
        if (!tgt) s.pest = null;
        else if (tgt.x === P.x && tgt.y === P.y) {
          if (++P.timer % 4 === 0) tgt.st = tgt.st > 3 ? tgt.st - 1 : 1;
        } else if (s.t % 2) {
          if (tgt.x !== P.x) P.x += sign(tgt.x - P.x); else P.y += sign(tgt.y - P.y);
        }
      }
      // farmer: chase pests, deliver, harvest, water, plant, till
      const [mx, my] = s.me;
      const dist = (x, y) => Math.abs(x - mx) + Math.abs(y - my);
      let goal = null, act = null;
      if (s.pest && s.pest.x >= 2 && s.pest.x <= 7) goal = [s.pest.x, s.pest.y];
      else if (s.carry) goal = [s.bin[0] + 1, s.bin[1]];
      else {
        let bc = Infinity;
        for (const p of s.plots) {
          let pen = null;
          if (p.st === 5) pen = 0;
          else if (p.st >= 2 && !p.wet) pen = 1;
          else if (p.st === 1 && days >= 3) pen = 2;
          else if (p.st === 0 && days >= 3) pen = 2;
          if (pen === null) continue;
          const c = dist(p.x, p.y) + pen;
          if (c < bc) { bc = c; goal = [p.x, p.y]; act = p; }
        }
      }
      if (goal) {
        if (mx === goal[0] && my === goal[1]) {
          if (s.carry && !act) { s.carry = false; s.stock++; }
          else if (act) {
            s.act = s.plots.indexOf(act);
            if (act.st === 5) { act.st = 1; s.carry = true; }
            else if (act.st >= 2) act.wet = true;
            else act.st++;
          }
        } else if (goal[0] !== mx) s.me = [mx + sign(goal[0] - mx), my];
        else s.me = [mx, my + sign(goal[1] - my)];
      }
      if (s.pest && cheb(s.pest.x, s.pest.y, s.me[0], s.me[1]) <= 1) s.pest = null;
    },
    draw(s, g) {
      g.cell(s.bin[0], s.bin[1], 'object');
      for (const p of s.plots) {
        if (p.st === 0) g.cell(p.x, p.y, 'wall', DIM);
        else if (p.st <= 2) g.cell(p.x, p.y, 'object', p.st === 2 && p.wet ? 1 : DIM);
        else g.cell(p.x, p.y, 'reward', p.st === 5 ? 1 : DIM);
      }
      if (s.pest) g.cell(s.pest.x, s.pest.y, 'enemy');
      g.cell(s.me[0], s.me[1], 'agent', s.carry ? DIM : 1);
    },
  });

  /* ---------------------------------------------------------------- rushhour */

  // Cars: { h, len, fix }. A state packs every car's free coordinate into one
  // base-6 number (car k is digit k), which keeps the BFS cheap.
  const P6 = [];
  for (let k = 0, v = 1; k < 16; k++, v *= 6) P6.push(v);
  const rhDigit = (key, k) => Math.floor(key / P6[k]) % 6;
  const RH_O = new Uint8Array(36);
  function rhOcc(cars, key) {
    const o = RH_O.fill(0);
    for (let k = 0; k < cars.length; k++) {
      const c = cars[k], p = rhDigit(key, k);
      for (let j = 0; j < c.len; j++) o[c.h ? c.fix * 6 + p + j : (p + j) * 6 + c.fix] = 1;
    }
    return o;
  }
  function rhNext(cars, key, out) {
    const o = rhOcc(cars, key);
    out.length = 0;
    for (let k = 0; k < cars.length; k++) {
      const c = cars[k], p = rhDigit(key, k), base = c.h ? c.fix * 6 : c.fix, step = c.h ? 1 : 6;
      for (let q = p - 1; q >= 0 && !o[base + q * step]; q--) out.push(key + (q - p) * P6[k]);
      for (let q = p + c.len; q < 6 && !o[base + q * step]; q++) out.push(key + (q - c.len + 1 - p) * P6[k]);
    }
    return out;
  }
  function rhBfs(cars, start, isGoal, cap) {
    const prev = new Map([[start, -1]]), q = [start], nb = [];
    for (let qi = 0; qi < q.length && q.length < cap; qi++) {
      const st = q[qi];
      if (isGoal && isGoal(st)) {
        const path = [];
        for (let x = st; x !== -1; x = prev.get(x)) path.unshift(x);
        return { path, q };
      }
      for (const n of rhNext(cars, st, nb)) if (!prev.has(n)) { prev.set(n, st); q.push(n); }
    }
    return { path: null, q };
  }

  add({
    id: 'rushhour',
    year: 1996,
    title: 'Sliding blocks',
    games: ['Klotski (traditional)', 'Rush Hour (1996)'],
    essence: 'Blocks slide only along their own axis and cannot pass each other. Shuffle the others aside until the target block has a clear run to the exit.',
    channels: { agent: 'target car', object: 'blocking cars (two shades keep neighbours apart)', reward: 'exit (dim = still blocked)', wall: 'frame' },
    fps: 6,
    hold: 10,
    warmup: 2,
    init(r) {
      let best = null;
      const solved = (x) => x % 6 === 4;
      for (let tries = 0; tries < 30; tries++) {
        const cars = [{ h: true, len: 2, fix: 2 }];
        let st = 4;
        for (let a = 0, goal = r.range(11, 13); a < 80 && cars.length < goal; a++) {
          const c = { h: r.chance(0.5), len: r.chance(0.7) ? 2 : 3, fix: r.i(6) };
          if (c.h && c.fix === 2) continue;
          const p = r.i(7 - c.len);
          const o = rhOcc(cars, st);
          let clash = false;
          for (let j = 0; j < c.len; j++) if (o[c.h ? c.fix * 6 + p + j : (p + j) * 6 + c.fix]) clash = true;
          if (clash) continue;
          st += p * P6[cars.length];
          cars.push(c);
        }
        // scramble: the reachable state farthest from the solved one
        const { q } = rhBfs(cars, st, null, 1200);
        if (q.length >= 1200) continue;
        const far = q[q.length - 1];
        if (solved(far)) continue;
        const sol = rhBfs(cars, far, solved, 1200).path;
        if (sol && (!best || sol.length > best.sol.length)) best = { cars, sol };
        if (best && best.sol.length >= 9) break;
      }
      if (!best) best = { cars: [{ h: true, len: 2, fix: 2 }, { h: false, len: 3, fix: 4 }], sol: [0, 18, 22] };
      const decode = (key) => best.cars.map((c, k) => rhDigit(key, k));
      return { cars: best.cars, sol: best.sol.map(decode), st: decode(best.sol[0]), k: 1, moving: -1, wait: 2,
        shade: this.shades(best.cars, best.sol) };
    },
    // two shades for the blocking cars, chosen so that cars touching along the
    // solution mostly differ (a greedy max-cut over contact counts)
    shades(cars, sol) {
      const n = cars.length, w = cars.map(() => new Array(n).fill(0));
      for (const key of sol) {
        const id = new Int8Array(36).fill(-1);
        cars.forEach((c, k) => { for (let j = 0; j < c.len; j++) { const q = rhDigit(key, k) + j; id[c.h ? c.fix * 6 + q : q * 6 + c.fix] = k; } });
        for (let i = 0; i < 36; i++) {
          for (const j of [i % 6 < 5 ? i + 1 : -1, i + 6]) {
            if (j < 0 || j >= 36 || id[i] < 0 || id[j] < 0 || id[i] === id[j]) continue;
            w[id[i]][id[j]]++; w[id[j]][id[i]]++;
          }
        }
      }
      const col = cars.map((c) => c.fix % 2);
      for (let it = 0, imp = true; imp && it < 50; it++) {
        imp = false;
        for (let k = 1; k < n; k++) {
          let bal = 0;
          for (let m = 1; m < n; m++) if (m !== k) bal += col[m] === col[k] ? w[k][m] : -w[k][m];
          if (bal > 0) { col[k] ^= 1; imp = true; }
        }
      }
      return col.map((c) => (c ? 1 : DIM));
    },
    tick(s) {
      if (s.wait > 0) { s.wait--; return; }
      if (s.k < s.sol.length) {
        const goal = s.sol[s.k];
        const car = goal.findIndex((v, i) => v !== s.st[i]);
        s.moving = car;
        s.st[car] += sign(goal[car] - s.st[car]);
        if (s.st[car] === goal[car]) { s.k++; s.wait = 1; }
        return;
      }
      // clear road: drive out through the gap
      s.moving = 0;
      s.st[0]++;
      if (s.st[0] >= 8) return 'done';
    },
    draw(s, g) {
      g.rect(1, 1, 8, 1, 'wall');
      g.rect(1, 8, 8, 1, 'wall');
      g.rect(1, 2, 1, 6, 'wall');
      g.rect(8, 2, 1, 6, 'wall');
      g.cell(8, 4, 'reward', s.k >= s.sol.length ? 1 : DIM);
      s.cars.forEach((c, k) => {
        const kind = k === 0 ? 'agent' : 'object';
        const a = k === 0 ? 1 : s.shade[k];
        for (let j = 0; j < c.len; j++) {
          const q = s.st[k] + j, x = 2 + (c.h ? q : c.fix), y = 2 + (c.h ? c.fix : q);
          if (x > 9) continue;
          g.cell(x, y, kind, a);
        }
      });
    },
  });
  }

  // ---- from sims/4-modern.js ----
  {

  const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

  /* ---------------------------------------------------------------- match3 */

  const M3_KINDS = 3;
  const M3_TOKEN = [['object', 1], ['object', Atlas.DIM], ['wall', 1]];
  const M3_MOVES = 8, M3_PER = 40; // ten bar cells of forty tokens each: three kinds cascade a lot

  function m3Matches(b) {
    const hit = new Set();
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const i = y * 8 + x, t = b[i];
      if (t < 0) continue;
      if (x <= 5 && b[i + 1] === t && b[i + 2] === t) { hit.add(i); hit.add(i + 1); hit.add(i + 2); }
      if (y <= 5 && b[i + 8] === t && b[i + 16] === t) { hit.add(i); hit.add(i + 8); hit.add(i + 16); }
    }
    return hit;
  }

  // the swap that clears the most tokens right away
  function m3Best(b, r) {
    let best = null, bs = 0;
    for (let i = 0; i < 64; i++) for (const j of [i + 1, i + 8]) {
      if (j >= 64 || (j === i + 1 && i % 8 === 7) || b[i] === b[j]) continue;
      [b[i], b[j]] = [b[j], b[i]];
      const n = m3Matches(b).size;
      [b[i], b[j]] = [b[j], b[i]];
      if (!n) continue;
      const sc = n + r.f() * 0.9;
      if (sc > bs) { bs = sc; best = [i, j]; }
    }
    return best;
  }

  add({
    id: 'match3',
    year: 2001,
    title: 'Swap to match three',
    games: ['Shariki (1994)', 'Bejeweled (2001)'],
    essence: 'Swap two neighbouring tokens to line up three or more of a kind. The line vanishes, the tokens above fall into the gap and new ones drop in, which can set off chains.',
    channels: { agent: 'cursor, swapped pair', object: 'two token kinds (full and dim)', wall: 'third token kind, moves left (dim top row)', reward: 'matched tokens, score bar (dim = partial)' },
    fps: 6,
    maxTicks: 500,
    warmup: 5,
    init(r) {
      let b, plan;
      do {
        b = [];
        for (let i = 0; i < 64; i++) {
          let t;
          do t = r.i(M3_KINDS); while ((i % 8 >= 2 && b[i - 1] === t && b[i - 2] === t) || (i >= 16 && b[i - 8] === t && b[i - 16] === t));
          b.push(t);
        }
        plan = m3Best(b, r);
      } while (!plan);
      return { b, cur: [r.i(8), r.i(8)], plan, phase: 'aim', swap: null, hits: null, moves: 0, score: 0 };
    },
    tick(s, r) {
      const b = s.b;
      if (s.phase === 'aim') {
        const tx = s.plan[0] % 8, ty = (s.plan[0] / 8) | 0, [cx, cy] = s.cur;
        if (cx === tx && cy === ty) {
          const [i, j] = s.plan;
          [b[i], b[j]] = [b[j], b[i]];
          s.swap = s.plan;
          s.phase = 'swapped';
        } else s.cur = [cx + sign(tx - cx), cy + sign(ty - cy)];
        return;
      }
      if (s.phase === 'swapped') {
        s.swap = null;
        s.hits = m3Matches(b);
        s.phase = 'flash';
        return;
      }
      if (s.phase === 'flash') {
        for (const i of s.hits) b[i] = -1;
        s.score += s.hits.size;
        s.hits = null;
        s.phase = 'fall';
        return;
      }
      // fall: every column drops one cell per tick, new tokens enter at the top
      for (let x = 0; x < 8; x++) {
        for (let y = 7; y >= 1; y--) {
          const i = y * 8 + x;
          if (b[i] < 0 && b[i - 8] >= 0) { b[i] = b[i - 8]; b[i - 8] = -1; }
        }
        if (b[x] < 0) b[x] = r.i(M3_KINDS);
      }
      if (b.includes(-1)) return;
      const hits = m3Matches(b);
      if (hits.size) { s.hits = hits; s.phase = 'flash'; return; }
      s.moves++;
      if (s.score >= M3_PER * 10 || s.moves >= M3_MOVES) return 'done';
      s.plan = m3Best(b, r);
      if (!s.plan) return 'done';
      s.phase = 'aim';
    },
    draw(s, g) {
      const full = Math.floor(s.score / M3_PER);
      for (let x = 0; x < 10; x++) {
        if (x < full) g.cell(x, 9, 'reward');
        else if (x === full && s.score % M3_PER) g.cell(x, 9, 'reward', Atlas.DIM);
      }
      // moves left as a shrinking dim top edge
      const left = Math.ceil(((M3_MOVES - s.moves) * 10) / M3_MOVES);
      for (let x = 0; x < left; x++) g.cell(x, 0, 'wall', Atlas.DIM);
      for (let i = 0; i < 64; i++) {
        if (s.b[i] < 0) continue;
        const x = (i % 8) + 1, y = ((i / 8) | 0) + 1;
        let [kind, a] = M3_TOKEN[s.b[i]];
        if (s.hits && s.hits.has(i)) [kind, a] = ['reward', 1];
        if (s.swap && (s.swap[0] === i || s.swap[1] === i)) [kind, a] = ['agent', 1];
        g.cell(x, y, kind, a);
      }
      if (!s.swap) {
        const [cx, cy] = s.cur;
        if (!(s.hits && s.hits.has(cy * 8 + cx))) g.cell(cx + 1, cy + 1, 'agent');
      }
    },
  });

  /* ------------------------------------------------------------------ mine */

  // tiles: 0 air, 1 dirt, 2 stone, 3 ore, 4 placed block
  const HARD = [0, 1, 2, 2, 1];
  const ORE_NEED = 4, NIGHT = 22, DAWN = 150;

  function minePlan(s, goal) {
    const T = s.T, si = s.y * 10 + s.x;
    const dist = new Float32Array(100).fill(1e9), prev = new Int16Array(100).fill(-1), done = new Uint8Array(100);
    dist[si] = 0;
    for (;;) {
      let u = -1, bd = 1e9;
      for (let i = 0; i < 100; i++) if (!done[i] && dist[i] < bd) { bd = dist[i]; u = i; }
      if (u < 0) return null;
      if (u !== si && goal(u)) {
        const path = [];
        for (let j = u; j !== si; j = prev[j]) path.push([j % 10, (j / 10) | 0]);
        return path.reverse();
      }
      done[u] = 1;
      const ux = u % 10, uy = (u / 10) | 0;
      for (const [dx, dy] of DIRS4) {
        const x = ux + dx, y = uy + dy;
        if (!inb(10, 10, x, y)) continue;
        const v = y * 10 + x;
        let c = 1 + (T[v] ? s.hp[v] * 1.5 : 0) + (dy < 0 ? 1.5 : 0);
        if (dy < 0 && !T[v] && !s.blocks) c += 30;
        if (s.enemy) c += 30 / (1 + Math.abs(x - s.enemy.x) + Math.abs(y - s.enemy.y)); // keep away from the creature
        if (dist[u] + c < dist[v]) { dist[v] = dist[u] + c; prev[v] = u; }
      }
    }
  }

  add({
    id: 'mine',
    year: 2011,
    title: 'Mine and build',
    games: ['Minecraft (2011)', 'Terraria (2011)'],
    essence: 'Every block of the world can be dug out and placed again. Tunnel down for ore, stack blocks to bridge gaps and climb back, and wall yourself in when night brings out monsters.',
    channels: { agent: 'miner', enemy: 'night creature (dim = burnt at dawn)', reward: 'ore', object: 'placed blocks', wall: 'stone, dirt (dim)' },
    fps: 6,
    maxTicks: 400,
    warmup: 8,
    init(r) {
      const T = new Array(100).fill(0), top = [];
      let h = r.range(2, 3);
      for (let x = 0; x < 10; x++) {
        if (x && r.chance(0.35)) h = clamp(h + r.pick([-1, 1]), 2, 3);
        top.push(h);
        const soil = h + 2 + (r.chance(0.5) ? 1 : 0);
        for (let y = h; y < 10; y++) T[y * 10 + x] = y < soil ? 1 : 2;
      }
      for (let c = 0; c < 2; c++) {
        let x = r.range(0, 9), y = r.range(5, 8);
        for (let k = r.range(4, 6); k > 0; k--) {
          T[y * 10 + x] = 0;
          const [dx, dy] = r.pick(DIRS4);
          x = clamp(x + dx, 0, 9); y = clamp(y + dy, 5, 9);
        }
      }
      for (let n = 0; n < 6;) {
        const x = r.range(0, 9), y = r.range(6, 9);
        if (T[y * 10 + x] === 2) { T[y * 10 + x] = 3; n++; }
      }
      const x = r.range(2, 7);
      return {
        T, top, hp: T.map((t) => HARD[t]), x, y: top[x] - 1, blocks: 1, ore: 0, t: 0,
        enemy: null, burnt: null, dig: -1, placed: -1, dead: false, won: false,
      };
    },
    tick(s, r) {
      s.t++;
      s.dig = s.placed = -1;
      s.burnt = null;
      const T = s.T;
      const at = (x, y) => (x < 0 || x > 9 || y > 9 ? 2 : y < 0 ? 0 : T[y * 10 + x]);
      const place = (x, y) => { T[y * 10 + x] = 4; s.hp[y * 10 + x] = 1; s.blocks--; s.placed = y * 10 + x; };
      const air = (x, y) => at(x, y) === 0;

      if (s.t === NIGHT) {
        const ex = r.pick([0, 9]);
        s.enemy = { x: ex, y: s.top[ex] - 1 };
      }
      if (s.enemy && s.t === DAWN) { s.burnt = s.enemy; s.enemy = null; }
      const touching = () => s.enemy && s.enemy.x === s.x && s.enemy.y === s.y;

      if (air(s.x, s.y + 1)) s.y++; // gravity
      else {
        let acted = false;
        // a creature is close: seal the tunnel cell between it and us
        if (s.enemy && s.blocks > 0) {
          const ep = bfs(10, 10, [s.enemy.x, s.enemy.y], (x, y) => x === s.x && y === s.y, air);
          if (ep && ep.length >= 2 && ep.length <= 3 && r.chance(0.3)) {
            const [bx, by] = ep[ep.length - 2];
            place(bx, by);
            acted = true;
          }
        }
        if (!acted) {
          const goal = s.ore < ORE_NEED ? (i) => T[i] === 3 : (i) => T[i] === 0 && ((i / 10) | 0) < s.top[i % 10];
          const path = minePlan(s, goal);
          const dig = (x, y) => {
            const i = y * 10 + x;
            s.dig = i;
            if (--s.hp[i] <= 0) { if (T[i] === 3) s.ore++; else s.blocks++; T[i] = 0; }
          };
          if (!path) {
            for (const [dx, dy] of [[0, 1], [1, 0], [-1, 0]]) {
              if (inb(10, 10, s.x + dx, s.y + dy) && at(s.x + dx, s.y + dy)) { dig(s.x + dx, s.y + dy); break; }
            }
          } else {
            const [nx, ny] = path[0];
            const next = path[1];
            if (T[ny * 10 + nx]) dig(nx, ny);
            else if (ny < s.y) {
              if (s.blocks > 0) { place(s.x, s.y); s.y = ny; } // jump and put a block underneath
              else {
                // out of blocks: carve one from the wall beside us
                const side = [-1, 1].find((dx) => inb(10, 10, s.x + dx, s.y) && at(s.x + dx, s.y));
                if (side) dig(s.x + side, s.y);
              }
            } else if (ny === s.y && air(nx, ny + 1) && s.blocks > 0 && !(next && next[0] === nx && next[1] === ny + 1)) {
              place(nx, ny + 1); // bridge the gap first
            } else { s.x = nx; s.y = ny; }
          }
        }
      }
      if (touching()) { s.dead = true; return 'done'; }
      if (s.ore >= ORE_NEED && s.y < s.top[s.x] && !air(s.x, s.y + 1)) { s.won = true; return 'done'; }

      // the creature crawls through open cells toward the miner
      if (s.enemy && s.t % 3 !== 0) {
        const e = s.enemy;
        const p = bfs(10, 10, [e.x, e.y], (x, y) => x === s.x && y === s.y, air);
        if (p) { e.x = p[0][0]; e.y = p[0][1]; }
        else {
          const dx = r.pick([-1, 1]);
          if (air(e.x + dx, e.y) && !air(e.x + dx, e.y + 1)) e.x += dx;
        }
        if (touching()) { s.dead = true; return 'done'; }
      }
      if (s.t > 360) return 'done';
    },
    draw(s, g) {
      for (let i = 0; i < 100; i++) {
        const x = i % 10, y = (i / 10) | 0, t = s.T[i];
        if (t === 1) g.cell(x, y, 'wall', Atlas.DIM);
        else if (t === 2) g.cell(x, y, 'wall');
        else if (t === 3) g.cell(x, y, 'reward');
        else if (t === 4) g.cell(x, y, 'object');
      }
      if (s.burnt) g.cell(s.burnt.x, s.burnt.y, 'enemy', Atlas.DIM);
      if (s.enemy) g.cell(s.enemy.x, s.enemy.y, 'enemy');
      g.cell(s.x, s.y, s.dead ? 'enemy' : 'agent');
    },
  });

  /* ----------------------------------------------------------------- merge */

  const M_GOAL = 9; // 2^9 = 512
  // weights along a snake path from the top-left corner
  const SNAKE = [15, 14, 13, 12, 8, 9, 10, 11, 7, 6, 5, 4, 0, 1, 2, 3].map((k) => 2 ** k);
  // board: 9x9, one cell per tile with empty gaps between them
  // slide direction: the frame edge the tiles moved toward
  const ARROW = [0, 1, 2, 3].map((d) => [1, 2, 3, 4, 5, 6, 7].map((k) => (d < 2 ? [d ? 8 : 0, k] : [k, d === 3 ? 8 : 0])));
  // tile level to colour: dim object, object, dim reward, reward
  const M_SHADE = (e) => (e <= 2 ? ['object', Atlas.DIM] : e <= 4 ? ['object', 1] : e <= 6 ? ['reward', Atlas.DIM] : ['reward', 1]);

  // d: 0 left, 1 right, 2 up, 3 down
  function mSlide(b, d) {
    const nb = new Array(16).fill(0), merged = [];
    let moved = false;
    for (let k = 0; k < 4; k++) {
      const idx = [];
      for (let j = 0; j < 4; j++) {
        const x = d === 0 ? j : d === 1 ? 3 - j : k, y = d === 2 ? j : d === 3 ? 3 - j : k;
        idx.push(y * 4 + x);
      }
      const vals = idx.map((i) => b[i]).filter((v) => v);
      const out = [];
      for (let i = 0; i < vals.length; i++) {
        if (vals[i] === vals[i + 1]) { out.push(vals[i] + 1); merged.push(idx[out.length - 1]); i++; }
        else out.push(vals[i]);
      }
      for (let j = 0; j < 4; j++) {
        nb[idx[j]] = out[j] || 0;
        if (nb[idx[j]] !== b[idx[j]]) moved = true;
      }
    }
    return { b: nb, moved, merged };
  }
  function mEval(b) {
    let v = 0, empty = 0;
    for (let i = 0; i < 16; i++) {
      if (!b[i]) { empty++; continue; }
      v += (1 << b[i]) * SNAKE[i];
    }
    return v * (1 + 0.15 * empty);
  }
  // shallow expectimax: average over where the next 2 lands, then the best reply
  function mChance(b, depth) {
    let sum = 0, n = 0;
    for (let i = 0; i < 16; i++) {
      if (b[i]) continue;
      b[i] = 1;
      sum += depth > 1 ? mBest(b, depth - 1) : mEval(b);
      b[i] = 0;
      n++;
    }
    return n ? sum / n : mEval(b);
  }
  function mBest(b, depth) {
    let best = 0;
    for (let d = 0; d < 4; d++) {
      const res = mSlide(b, d);
      if (res.moved) best = Math.max(best, mChance(res.b, depth));
    }
    return best;
  }

  add({
    id: 'merge',
    year: 2014,
    title: 'Slide and merge',
    games: ['Threes! (2014)', '2048 (2014)'],
    essence: 'Every move slides all tiles as far as they go in one direction. Two equal tiles that meet merge into the next level, and a new low tile appears after each move.',
    channels: { agent: 'last slide direction', object: 'tiles 8, 16 (dim = 2, 4)', reward: 'tiles 128 and up (dim = 32, 64)', wall: 'frame' },
    w: 9, h: 9,
    fps: 9,
    maxTicks: 600,
    warmup: 8,
    init(r) {
      const b = new Array(16).fill(0);
      const spawn = () => {
        const free = [];
        b.forEach((v, i) => !v && free.push(i));
        b[r.pick(free)] = r.chance(0.9) ? 1 : 2;
      };
      spawn(); spawn();
      return { b, dir: r.i(4), merged: [], fresh: -1, over: false, won: false };
    },
    tick(s, r) {
      let best = -1, bv = -Infinity;
      const opts = [];
      for (let d = 0; d < 4; d++) {
        const res = mSlide(s.b, d);
        if (!res.moved) continue;
        opts.push(d);
        const v = mChance(res.b, res.b.filter((e) => !e).length > 7 ? 1 : 2);
        if (v > bv) { bv = v; best = d; }
      }
      if (best < 0) { s.over = true; return 'done'; }
      if (r.chance(0.05)) best = r.pick(opts); // a careless swipe
      const res = mSlide(s.b, best);
      s.b = res.b;
      s.dir = best;
      s.merged = res.merged;
      const free = [];
      s.b.forEach((v, i) => !v && free.push(i));
      s.fresh = r.pick(free);
      s.b[s.fresh] = r.chance(0.9) ? 1 : 2;
      if (Math.max(...s.b) >= M_GOAL) { s.won = true; return 'done'; }
      if (![0, 1, 2, 3].some((d) => mSlide(s.b, d).moved)) { s.over = true; return 'done'; }
    },
    draw(s, g) {
      g.rect(0, 0, 9, 9, 'wall');
      g.rect(1, 1, 7, 7, 'empty');
      for (let i = 0; i < 16; i++) {
        const e = s.b[i];
        if (!e) continue;
        const [kind, a] = M_SHADE(e);
        g.cell(1 + (i % 4) * 2, 1 + ((i / 4) | 0) * 2, kind, a);
      }
      for (const [x, y] of ARROW[s.dir]) g.cell(x, y, s.over ? 'enemy' : 'agent');
    },
  });

  /* -------------------------------------------------------------- factorio */

  const F_PRODUCTS = 8;

  // belt cells from next to `start` to a free cell in `goals`, preferring straight runs
  function fRoute(start, goals, free) {
    const d = distField(10, 10, goals, free);
    let cur = null, dir = null, best = 1e9;
    for (const dd of DIRS4) {
      const x = start[0] + dd[0], y = start[1] + dd[1];
      if (!inb(10, 10, x, y) || !free(x, y)) continue;
      const v = d[y * 10 + x];
      if (v >= 0 && v < best) { best = v; cur = [x, y]; dir = dd; }
    }
    if (!cur) return null;
    const path = [cur];
    while (d[cur[1] * 10 + cur[0]] > 0) {
      const want = d[cur[1] * 10 + cur[0]] - 1;
      let next = null;
      for (const dd of [dir, ...DIRS4]) {
        const x = cur[0] + dd[0], y = cur[1] + dd[1];
        if (inb(10, 10, x, y) && d[y * 10 + x] === want) { next = [x, y]; dir = dd; break; }
      }
      path.push(next);
      cur = next;
    }
    return path;
  }

  function fLayout(r) {
    const occ = new Uint8Array(100);
    const block = ([x, y]) => (occ[y * 10 + x] = 1);
    const free = (x, y) => !occ[y * 10 + x];
    const ax = r.range(5, 6), ay = r.range(3, 5);
    const asm = [[ax, ay], [ax + 1, ay], [ax, ay + 1], [ax + 1, ay + 1]];
    const chest = [9, r.pick([0, 1, 2, 7, 8, 9])];
    const pa = [r.range(0, 1), r.range(0, 1)], pb = [r.range(0, 2), r.range(7, 8)];
    const patchA = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([i, j]) => [pa[0] + i, pa[1] + j]);
    const patchB = [[0, 0], [1, 0], [0, 1], [1, 1]].map(([i, j]) => [pb[0] + i, pb[1] + j]);
    const minerA = [pa[0] + 1, pa[1] + 1], minerB = [pb[0] + 1, pb[1]];
    [...asm, chest, ...patchA, ...patchB].forEach(block);
    const nextTo = (cells) => {
      const out = [];
      for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
        if (free(x, y) && cells.some(([cx, cy]) => Math.abs(cx - x) + Math.abs(cy - y) === 1)) out.push([x, y]);
      }
      return out;
    };
    const A = fRoute(minerA, nextTo(asm), free);
    if (!A) return null;
    A.forEach(block);
    const B = fRoute(minerB, nextTo(asm), free);
    if (!B) return null;
    B.forEach(block);
    const O = fRoute(chest, nextTo(asm), free);
    if (!O || O.length < 2) return null;
    O.reverse();
    O.forEach(block);
    const belt = (cells, type) => ({ cells, type, built: 0, items: [] });
    let me = null;
    for (let k = 0; k < 40 && !me; k++) {
      const x = r.range(2, 4), y = r.range(3, 6);
      if (free(x, y)) me = [x, y];
    }
    if (!me) return null;
    return {
      asm, chest, patchA, patchB, minerA, minerB, me, t: 0, task: 0,
      belts: [belt(A, 'a'), belt(B, 'b'), belt(O, 'p')],
      buf: { a: 0, b: 0 }, craft: 0, ready: false, stored: 0,
    };
  }

  add({
    id: 'factorio',
    year: 2016,
    title: 'Conveyor automation',
    games: ['Factorio (2016)', 'shapez (2020)'],
    essence: 'Lay belts from automatic drills to a machine that combines two inputs into a product. Once the line is built, items keep flowing on their own and the job becomes keeping it fed.',
    channels: { agent: 'builder', reward: 'chest (dim = ore patches)', object: 'drills, assembler (dim = items, idle assembler)', wall: 'belts (dim = planned)' },
    fps: 6,
    maxTicks: 400,
    warmup: 6,
    init(r) {
      for (;;) {
        const L = fLayout(r);
        if (L) return L;
      }
    },
    tick(s) {
      s.t++;
      const tasks = [];
      s.belts.forEach((b, bi) => b.cells.forEach((c, ci) => tasks.push([bi, ci])));
      const solid = (x, y) => s.asm.some(([ax, ay]) => ax === x && ay === y) ||
        (s.chest[0] === x && s.chest[1] === y) ||
        (s.minerA[0] === x && s.minerA[1] === y) || (s.minerB[0] === x && s.minerB[1] === y);
      const walk = (to) => {
        if (s.me[0] === to[0] && s.me[1] === to[1]) return;
        const p = bfs(10, 10, s.me, (x, y) => x === to[0] && y === to[1], (x, y) => !solid(x, y));
        if (p) s.me = p[0];
      };
      // builder: lay the next belt segment, then head for the one after
      if (s.task < tasks.length) {
        let [bi, ci] = tasks[s.task];
        let cell = s.belts[bi].cells[ci];
        if (s.me[0] === cell[0] && s.me[1] === cell[1]) {
          s.belts[bi].built = ci + 1;
          s.task++;
          if (s.task < tasks.length) {
            [bi, ci] = tasks[s.task];
            cell = s.belts[bi].cells[ci];
            walk(cell);
          }
        } else walk(cell);
      } else {
        const spot = [s.chest[0] - 1, s.chest[1] < 5 ? s.chest[1] + 2 : s.chest[1] - 2];
        if (!solid(...spot)) walk(spot);
      }
      // items ride the belts, front of the queue first
      for (const b of s.belts) {
        const n = b.cells.length;
        b.items.sort((p, q) => q.pos - p.pos);
        const taken = new Set(b.items.map((it) => it.pos));
        for (const it of b.items) {
          if (it.pos === n - 1 && b.built === n) {
            if (b.type === 'p') { it.gone = true; s.stored++; }
            else if (s.buf[b.type] < 2) { it.gone = true; s.buf[b.type]++; }
          } else if (it.pos + 1 < b.built && !taken.has(it.pos + 1)) {
            taken.delete(it.pos);
            it.pos++;
            taken.add(it.pos);
          }
        }
        b.items = b.items.filter((it) => !it.gone);
      }
      // drills
      s.belts.slice(0, 2).forEach((b, k) => {
        if (b.built > 0 && (s.t + k) % 3 === 0 && !b.items.some((it) => it.pos === 0)) b.items.push({ pos: 0 });
      });
      // assembler
      if (!s.craft && !s.ready && s.buf.a && s.buf.b) { s.buf.a--; s.buf.b--; s.craft = 4; }
      if (s.craft && --s.craft === 0) s.ready = true;
      const out = s.belts[2];
      if (s.ready && out.built > 0 && !out.items.some((it) => it.pos === 0)) { out.items.push({ pos: 0 }); s.ready = false; }
      if (s.stored >= F_PRODUCTS) return 'done';
    },
    draw(s, g) {
      for (const [x, y] of [...s.patchA, ...s.patchB]) g.cell(x, y, 'reward', Atlas.DIM);
      for (const [x, y] of [s.minerA, s.minerB]) g.cell(x, y, 'object');
      for (const b of s.belts) {
        b.cells.forEach(([x, y], i) => g.cell(x, y, 'wall', i < b.built ? 1 : Atlas.DIM));
        for (const it of b.items) {
          const [x, y] = b.cells[it.pos];
          g.cell(x, y, 'object', Atlas.DIM);
        }
      }
      const [[x0, y0]] = s.asm;
      g.rect(x0, y0, 2, 2, 'object', s.craft || s.ready ? 1 : Atlas.DIM);
      g.cell(s.chest[0], s.chest[1], 'reward');
      g.cell(s.me[0], s.me[1], 'agent');
    },
  });

  /* ---------------------------------------------------------------- royale */

  const RW = 12;

  add({
    id: 'royale',
    year: 2017,
    title: 'Shrinking zone',
    games: ['PlayerUnknown\'s Battlegrounds (2017)', 'Fortnite Battle Royale (2017)'],
    essence: 'Everyone starts weak, scavenges gear and fights whoever they meet. A safe zone keeps shrinking and hurts anyone left outside, which forces the survivors together until one remains.',
    channels: { agent: 'you', enemy: 'rivals (dim = outside the zone)', reward: 'loot' },
    w: RW, h: RW,
    fps: 6,
    maxTicks: 400,
    warmup: 10,
    init(r) {
      const people = [];
      while (people.length < 6) {
        const x = r.range(0, RW - 1), y = r.range(0, RW - 1);
        if (people.every((p) => Math.abs(p.x - x) + Math.abs(p.y - y) >= 4)) {
          people.push({ x, y, str: people.length ? r.range(1, 2) : 2, me: people.length === 0, alive: true, hurt: 0 });
        }
      }
      const loot = new Set();
      while (loot.size < 12) loot.add(r.i(RW * RW));
      return {
        people, loot, zone: [0, 0, RW - 1, RW - 1], aim: [r.range(3, RW - 4), r.range(3, RW - 4)],
        t: 0, fallen: [], dead: false,
      };
    },
    tick(s, r) {
      s.t++;
      s.fallen = [];
      const z = s.zone;
      if (s.t % 5 === 0 && (z[2] - z[0] > 1 || z[3] - z[1] > 1)) {
        const [tx, ty] = s.aim;
        const room = [tx - z[0], ty - z[1], z[2] - tx, z[3] - ty].map((v, k) => (z[k % 2 + 2] - z[k % 2] > 1 ? v : -1));
        const top = Math.max(...room);
        const k = r.pick([0, 1, 2, 3].filter((i) => room[i] === top));
        z[k] += k < 2 ? 1 : -1;
      }
      const inside = (x, y) => x >= z[0] && x <= z[2] && y >= z[1] && y <= z[3];
      const toZone = (x, y) => Math.max(z[0] - x, x - z[2], 0) + Math.max(z[1] - y, y - z[3], 0);
      const live = s.people.filter((p) => p.alive);
      for (const p of live) {
        if (!p.me && r.chance(0.25)) continue;
        let best = [p.x, p.y], bs = -Infinity;
        for (const [dx, dy] of [[0, 0], ...DIRS4]) {
          const x = p.x + dx, y = p.y + dy;
          if (!inb(RW, RW, x, y) || live.some((o) => o !== p && o.x === x && o.y === y)) continue;
          const rim = p.me && (x === z[0] || x === z[2] || y === z[1] || y === z[3]) ? 1 : 0;
          let sc = -toZone(x, y) * (p.me ? 9 : 5) - rim - 0.08 * (Math.abs(x - (z[0] + z[2]) / 2) + Math.abs(y - (z[1] + z[3]) / 2));
          let dl = 99;
          for (const i of s.loot) dl = Math.min(dl, Math.abs((i % RW) - x) + Math.abs(((i / RW) | 0) - y));
          sc += 4 / (dl + 1);
          for (const o of live) {
            if (o === p) continue;
            const d = Math.abs(o.x - x) + Math.abs(o.y - y);
            if (o.str < p.str && (p.me || d <= 4)) sc += 3 / (d + 1);
            else if (p.me && d <= 3) sc -= (o.str > p.str ? 8 : 5) / Math.max(1, d - 0.5);
            else if (o.str > p.str && d <= 3) sc -= 4 / Math.max(1, d);
            else if (d <= 2) sc -= 0.5;
          }
          sc += r.f() * (p.me ? 0.3 : 1.5);
          if (sc > bs) { bs = sc; best = [x, y]; }
        }
        [p.x, p.y] = best;
        const k = p.y * RW + p.x;
        if (s.loot.has(k)) { s.loot.delete(k); p.str = Math.min(9, p.str + 1); }
      }
      // the zone hurts
      for (const p of live) {
        if (inside(p.x, p.y)) continue;
        if (++p.hurt % 2 === 0 && --p.str <= 0) { p.alive = false; s.fallen.push([p.x, p.y]); }
      }
      // fights on contact
      const busy = new Set();
      for (const a of live) for (const b of live) {
        if (a === b || !a.alive || !b.alive || busy.has(a) || busy.has(b)) continue;
        if (Math.abs(a.x - b.x) + Math.abs(a.y - b.y) !== 1) continue;
        busy.add(a); busy.add(b);
        const ra = a.str + r.range(0, 2), rb = b.str + r.range(0, 2);
        const [w, l] = ra > rb || (ra === rb && r.chance(0.5)) ? [a, b] : [b, a];
        l.alive = false;
        w.str = Math.max(1, w.str - 1);
        s.fallen.push([l.x, l.y]);
        s.loot.add(l.y * RW + l.x);
      }
      if (!s.people[0].alive) { s.dead = true; return 'done'; }
      if (s.people.filter((p) => p.alive).length === 1) return 'done';
    },
    draw(s, g) {
      const z = s.zone;
      for (let y = 0; y < RW; y++) for (let x = 0; x < RW; x++) {
        if (x < z[0] || x > z[2] || y < z[1] || y > z[3]) g.cell(x, y, 'enemy', Atlas.DIM);
      }
      for (const i of s.loot) g.cell(i % RW, (i / RW) | 0, 'reward');
      for (const p of s.people) {
        if (!p.alive && !p.me) continue;
        g.cell(p.x, p.y, p.me ? (s.dead ? 'enemy' : 'agent') : 'enemy');
      }
    },
  });
  }
})();
