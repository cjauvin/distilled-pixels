/* Golden age, part two: more mechanics from 1982 to 1984. */
(function () {
  'use strict';
  const { add, bfs, distField, DIRS4, DIRS8, clamp, sign, manhattan, DIM } = Atlas;

  // -------------------------------------------------------------------- snake
  const snWall = (x, y) => x <= 0 || y <= 0 || x >= 9 || y >= 9;
  const snOn = (body, x, y, skipTail) => {
    for (let i = 0; i < body.length - (skipTail ? 1 : 0); i++) if (body[i][0] === x && body[i][1] === y) return true;
    return false;
  };
  // can the head still reach the tail after this body configuration?
  const snTailOK = (body) => {
    const t = body[body.length - 1];
    return !!bfs(10, 10, body[0], (x, y) => x === t[0] && y === t[1], (x, y) => !snWall(x, y) && !snOn(body, x, y, true));
  };

  add({
    id: 'snake',
    year: 1982,
    title: 'Growing snake',
    games: ['Nibbler (1982)', 'Snake (1997)'],
    essence: 'Steer a snake to the food. Every meal makes it longer, and touching a wall or its own body ends the run, so the snake becomes its own obstacle.',
    channels: { agent: 'head (dim = body)', reward: 'food', wall: 'walls' },
    fps: 9,
    maxTicks: 800,
    hold: 8,
    init(r) {
      const s = { body: [[5, 5], [4, 5], [3, 5], [2, 5]], food: null, hungry: 0, dead: false };
      snFood(s, r);
      return s;
    },
    tick(s, r) {
      const head = s.body[0];
      const blocked = (x, y) => snWall(x, y) || snOn(s.body, x, y, true);
      let next = null;
      s.hungry++;
      const path = bfs(10, 10, head, (x, y) => x === s.food[0] && y === s.food[1], (x, y) => !blocked(x, y));
      if (path) {
        // follow the path virtually and check the tail is still reachable from where it ends
        const after = [...path.slice().reverse(), ...s.body].slice(0, s.body.length + 1);
        const careless = s.hungry > 25 || r.chance(0.3);
        if (careless || snTailOK(after)) next = path[0];
      }
      if (!next) {
        // stall by chasing the tail: take the safe neighbour that keeps the tail farthest away
        let bd = -1;
        for (const [dx, dy] of DIRS4) {
          const x = head[0] + dx, y = head[1] + dy;
          if (blocked(x, y)) continue;
          const nb = [[x, y], ...s.body.slice(0, -1)], t = nb[nb.length - 1];
          const p = bfs(10, 10, [x, y], (a, b) => a === t[0] && b === t[1], (a, b) => !snWall(a, b) && !snOn(nb, a, b, true));
          if (p && p.length > bd) { bd = p.length; next = [x, y]; }
        }
      }
      if (!next) {
        let bn = -1;
        for (const [dx, dy] of DIRS4) {
          const x = head[0] + dx, y = head[1] + dy;
          if (blocked(x, y)) continue;
          const d = distField(10, 10, [[x, y]], (a, b) => !blocked(a, b));
          const n = d.reduce((c, v) => c + (v >= 0), 0);
          if (n > bn) { bn = n; next = [x, y]; }
        }
      }
      if (!next) next = [2 * head[0] - s.body[1][0], 2 * head[1] - s.body[1][1]];
      if (blocked(next[0], next[1])) { s.dead = true; s.crash = next; return 'done'; }
      const eat = next[0] === s.food[0] && next[1] === s.food[1];
      s.body.unshift(next);
      if (!eat) s.body.pop();
      else {
        s.hungry = 0;
        if (s.body.length >= 64) return 'done';
        snFood(s, r);
      }
    },
    draw(s, g) {
      g.rect(0, 0, 10, 1, 'wall'); g.rect(0, 9, 10, 1, 'wall');
      g.rect(0, 1, 1, 8, 'wall'); g.rect(9, 1, 1, 8, 'wall');
      if (s.food) g.cell(s.food[0], s.food[1], 'reward');
      s.body.forEach(([x, y], i) => g.cell(x, y, 'agent', i === 0 ? 1 : DIM));
      if (s.dead) g.cell(s.body[0][0], s.body[0][1], 'enemy');
    },
  });

  function snFood(s, r) {
    const free = [];
    for (let y = 1; y < 9; y++) for (let x = 1; x < 9; x++) if (!snOn(s.body, x, y)) free.push([x, y]);
    s.food = free.length ? r.pick(free) : null;
  }

  // ------------------------------------------------------------------ pitfall
  const PF_L = 46;
  const PF_RISE = [-1, -1, -1, 0];
  // top[x] is the first solid row of a column; 10 means a bottomless pit
  const pfSolid = (w, x, y) => x < 0 || x >= PF_L || (w.top[x] < 10 && y >= w.top[x]);
  const pfKey = (x, y) => x * 16 + y;

  function pfWorld(r) {
    const top = new Array(PF_L).fill(8), coins = new Set(), enemies = [];
    let x = 5;
    while (x < PF_L - 8) {
      const k = r.f();
      if (k < 0.42) {
        const w = r.range(1, 3);
        for (let i = 0; i < w; i++) top[x + i] = 10;
        if (r.chance(0.6)) coins.add(pfKey(x + (w >> 1), r.range(4, 5)));
        x += w + r.range(3, 5);
      } else if (k < 0.66) {
        const w = r.range(2, 4), hgt = r.range(1, 2);
        for (let i = 0; i < w; i++) top[x + i] = 8 - hgt;
        if (r.chance(0.5)) coins.add(pfKey(x + 1, 5 - hgt));
        x += w + r.range(2, 4);
      } else {
        const w = r.range(4, 6);
        if (x > 8 && enemies.length < 4) enemies.push({ x: x + w - 1, y: 7, dir: -1 });
        x += w;
      }
    }
    return { top, coins, enemies, flag: PF_L - 3 };
  }

  function pfEnemy(w, e) {
    const nx = e.x + e.dir;
    if (pfSolid(w, nx, e.y) || !pfSolid(w, nx, e.y + 1)) e.dir = -e.dir;
    else e.x = nx;
  }

  function pfStep(w, a, act) {
    const ground = a.j < 0 && pfSolid(w, a.x, a.y + 1);
    let x = a.x, y = a.y, j = a.j, dy;
    if (!(ground && act === 'wait') && !pfSolid(w, x + 1, y)) x++;
    if (ground && act === 'jump') j = 0;
    if (j >= 0 && j < PF_RISE.length) dy = PF_RISE[j++];
    else { j = -1; dy = pfSolid(w, x, y + 1) ? 0 : 1; }
    if (dy && pfSolid(w, x, y + dy)) { if (dy < 0) j = PF_RISE.length; dy = 0; }
    y += dy;
    return { x, y, j, dead: y >= 10, won: x >= w.flag };
  }

  const pfHit = (a0, a1, e0, e1) => e1.some((e, i) => (e.x === a1.x && e.y === a1.y) ||
    (e.x === a0.x && e.y === a0.y && e0[i].x === a1.x && e0[i].y === a1.y));

  // depth-limited search over walk / jump / wait; enemies are deterministic
  function pfPlan(s) {
    const H = 9, w = s.w, E = [s.w.enemies.map((e) => ({ ...e }))];
    for (let k = 1; k <= H; k++) {
      const next = E[k - 1].map((e) => ({ ...e }));
      if ((s.t + k) % 2 === 0) next.forEach((e) => pfEnemy(w, e));
      E.push(next);
    }
    const memo = new Map();
    const value = (k, a) => {
      if (k === H) return a.x;
      const key = ((k * 64 + a.x) * 16 + a.y + 2) * 8 + a.j + 1;
      if (memo.has(key)) return memo.get(key);
      const ground = a.j < 0 && pfSolid(w, a.x, a.y + 1);
      let best = -1;
      for (const act of ground ? ['walk', 'jump', 'wait'] : ['walk']) {
        const b = pfStep(w, a, act);
        if (b.dead || pfHit(a, b, E[k], E[k + 1])) continue;
        const v = (b.won ? 1000 + 10 * (H - k) : value(k + 1, b)) + 0.1 * b.x + (w.coins.has(pfKey(b.x, b.y)) ? 0.6 : 0);
        if (v > best) best = v;
      }
      memo.set(key, best);
      return best;
    };
    let pick = 'walk', bv = -Infinity;
    const ground = s.a.j < 0 && pfSolid(w, s.a.x, s.a.y + 1);
    if (!ground) return 'walk';
    for (const act of ['walk', 'jump', 'wait']) {
      const b = pfStep(w, s.a, act);
      if (b.dead || pfHit(s.a, b, E[0], E[1])) continue;
      const v = (b.won ? 1000 + 10 * H : value(1, b)) + 0.1 * b.x + (w.coins.has(pfKey(b.x, b.y)) ? 0.6 : 0);
      if (v > bv + 1e-9) { bv = v; pick = act; }
    }
    return pick;
  }

  add({
    id: 'pitfall',
    year: 1982,
    title: 'Running and jumping',
    games: ['Pitfall! (1982)', 'Super Mario Bros. (1985)'],
    essence: 'Run across a scrolling landscape to the flag. Time each jump to clear pits and walking enemies; a jump follows a fixed arc, so it has to start at the right moment.',
    channels: { agent: 'runner', enemy: 'walkers', reward: 'coins, goal flag (dim = pole)', wall: 'ground' },
    fps: 7,
    maxTicks: 300,
    hold: 8,
    warmup: 4,
    init(r) {
      return { w: pfWorld(r), a: { x: 1, y: 7, j: -1 }, t: 0, dead: false, won: false, lapse: 0.07 };
    },
    tick(s, r) {
      let act = pfPlan(s);
      if (act !== 'walk' && r.chance(s.lapse)) act = 'walk'; // a beat too late
      const a1 = pfStep(s.w, s.a, act);
      s.t++;
      const e0 = s.w.enemies.map((e) => ({ ...e }));
      if (s.t % 2 === 0) s.w.enemies.forEach((e) => pfEnemy(s.w, e));
      s.w.coins.delete(pfKey(a1.x, a1.y));
      const hit = pfHit(s.a, a1, e0, s.w.enemies);
      s.a = a1;
      if (hit || a1.dead) { s.dead = true; return 'done'; }
      if (a1.won) { s.won = true; return 'done'; }
    },
    draw(s, g) {
      const w = s.w, cam = clamp(s.a.x - 3, 0, PF_L - 10);
      for (let sx = 0; sx < 10; sx++) {
        const x = cam + sx;
        for (let y = w.top[x]; y < 10; y++) g.cell(sx, y, 'wall');
        if (x === w.flag) for (let y = w.top[x] - 6; y < w.top[x]; y++) g.cell(sx, y, 'reward', y === w.top[x] - 6 || s.won ? 1 : DIM);
      }
      for (const k of w.coins) {
        const x = (k / 16) | 0, y = k % 16;
        if (x >= cam && x < cam + 10) g.cell(x - cam, y, 'reward');
      }
      for (const e of w.enemies) if (e.x >= cam && e.x < cam + 10) g.cell(e.x - cam, e.y, 'enemy');
      const ay = Math.min(s.a.y, 9);
      g.cell(s.a.x - cam, ay, s.dead ? 'enemy' : 'agent');
    },
  });

  // --------------------------------------------------------------- loderunner
  const LR_REFILL = 20;

  function lrSolid(s, x, y) {
    if (x < 0 || x > 9 || y < 0 || y > 9) return true;
    const i = y * 10 + x;
    return s.brick[i] > 0 && !s.holes.has(i);
  }
  const lrTrapped = (s, x, y) => s.guards.some((g) => g.trap && g.p[0] === x && g.p[1] === y);
  function lrSupported(s, x, y) {
    const i = y * 10 + x;
    return lrSolid(s, x, y + 1) || s.ladder[i] || (y < 9 && s.ladder[i + 10]) || lrTrapped(s, x, y + 1);
  }
  function lrMoves(s, x, y) {
    if (!lrSupported(s, x, y)) return [[x, y + 1]];
    const out = [];
    for (const dx of [-1, 1]) if (!lrSolid(s, x + dx, y)) out.push([x + dx, y]);
    if (s.ladder[y * 10 + x] && !lrSolid(s, x, y - 1)) out.push([x, y - 1]);
    if (!lrSolid(s, x, y + 1) && !lrTrapped(s, x, y + 1)) out.push([x, y + 1]);
    return out;
  }
  // BFS over the movement graph (gravity, ladders); returns the path or null
  function lrPath(s, from, isGoal, avoid) {
    const prev = new Int16Array(100).fill(-2), si = from[1] * 10 + from[0], q = [si];
    prev[si] = -1;
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi];
      for (const [nx, ny] of lrMoves(s, i % 10, (i / 10) | 0)) {
        const ni = ny * 10 + nx;
        if (prev[ni] !== -2 || (avoid && avoid(nx, ny))) continue;
        prev[ni] = i;
        if (isGoal(nx, ny)) {
          const path = [];
          for (let j = ni; j !== si; j = prev[j]) path.push([j % 10, (j / 10) | 0]);
          return path.reverse();
        }
        q.push(ni);
      }
    }
    return null;
  }

  add({
    id: 'loderunner',
    year: 1983,
    title: 'Dig to trap',
    games: ['Lode Runner (1983)'],
    essence: 'Collect all the gold while guards chase you over floors and ladders. Dig a hole in the brick beside you and a chasing guard falls in, stuck until the brick grows back over it.',
    channels: { agent: 'runner', enemy: 'guards (dim = trapped)', reward: 'gold', object: 'ladders (dim)', wall: 'bricks (dim = dug hole)' },
    fps: 6,
    maxTicks: 500,
    hold: 8,
    init(r) {
      const brick = new Uint8Array(100), ladder = new Uint8Array(100);
      for (let x = 0; x < 10; x++) brick[90 + x] = brick[30 + x] = brick[60 + x] = 1;
      const cols = () => {
        const a = r.range(0, 9);
        let b;
        do b = r.range(0, 9); while (Math.abs(a - b) < 4);
        return [a, b];
      };
      const lad = (x, y0, y1) => { for (let y = y0; y <= y1; y++) { ladder[y * 10 + x] = 1; brick[y * 10 + x] = 0; } };
      const low = cols(), high = cols();
      low.forEach((x) => lad(x, 6, 8));
      high.forEach((x) => lad(x, 3, 5));
      for (const fy of [3, 6]) {
        if (!r.chance(0.5)) continue;
        const x = r.range(0, 9);
        if (!ladder[fy * 10 + x] && !ladder[(fy - 1) * 10 + x]) brick[fy * 10 + x] = 0;
      }
      const me = [r.range(0, 9), 8];
      const stand = [];
      for (const y of [2, 5, 8]) for (let x = 0; x < 10; x++) {
        if (!ladder[y * 10 + x] && brick[(y + 1) * 10 + x] && !(x === me[0] && y === me[1])) stand.push([x, y]);
      }
      r.shuffle(stand);
      const gold = new Set(stand.slice(0, 6).map(([x, y]) => y * 10 + x));
      const guards = [2, 5].map((y) => {
        let x;
        do x = r.range(0, 9); while (Math.abs(x - me[0]) < 3 || ladder[y * 10 + x]);
        return { p: [x, y], trap: false, gone: 0 };
      });
      return { brick, ladder, holes: new Map(), gold, guards, me, t: 0, cool: 0, dead: false };
    },
    tick(s, r) {
      s.t++;
      // holes grow back; whatever is inside is crushed
      for (const [i, t] of s.holes) {
        if (t > 1) { s.holes.set(i, t - 1); continue; }
        s.holes.delete(i);
        for (const g of s.guards) if (g.p[1] * 10 + g.p[0] === i) { g.trap = false; g.gone = 6; g.p = [-1, -1]; }
        if (s.me[1] * 10 + s.me[0] === i) { s.dead = true; return 'done'; }
      }
      for (const g of s.guards) if (g.gone && --g.gone === 0) g.p = [r.range(0, 9), 0];

      const [ax, ay] = s.me;
      const free = s.guards.filter((g) => !g.trap && !g.gone);
      if (s.cool > 0) s.cool--;
      let dug = false;
      if (lrSupported(s, ax, ay) && s.cool === 0) {
        for (const g of free) {
          const dx = g.p[0] - ax, d = sign(dx);
          if (g.p[1] !== ay || Math.abs(dx) < 2 || Math.abs(dx) > 5) continue;
          const hx = ax + d, hi = (ay + 1) * 10 + hx;
          if (s.brick[hi] !== 1 || s.holes.has(hi) || s.ladder[ay * 10 + hx] || lrSolid(s, hx, ay)) continue;
          s.holes.set(hi, LR_REFILL);
          s.cool = 4;
          dug = true;
          break;
        }
      }
      if (!dug) {
        const pit = (x, y) => s.holes.has(y * 10 + x) && !lrTrapped(s, x, y);
        const near = (k) => (x, y) => pit(x, y) || free.some((g) => manhattan(g.p, [x, y]) <= k);
        const goal = (x, y) => s.gold.has(y * 10 + x);
        let path = lrPath(s, s.me, goal, near(2)) || lrPath(s, s.me, goal, near(1));
        if (!path && free.length) {
          // no safe route: back away from the closest guard
          const fromG = distField(10, 10, free.map((g) => g.p), (x, y) => !lrSolid(s, x, y));
          let best = null, bd = fromG[ay * 10 + ax];
          for (const [x, y] of lrMoves(s, ax, ay)) if (!pit(x, y) && fromG[y * 10 + x] > bd) { bd = fromG[y * 10 + x]; best = [x, y]; }
          if (best) path = [best];
        }
        if (!lrSupported(s, ax, ay)) path = [[ax, ay + 1]];
        if (path) s.me = path[0];
      }
      s.gold.delete(s.me[1] * 10 + s.me[0]);
      const caught = () => s.guards.some((g) => !g.trap && !g.gone && g.p[0] === s.me[0] && g.p[1] === s.me[1]);
      if (caught()) { s.dead = true; return 'done'; }
      if (!s.gold.size) return 'done';

      for (const g of s.guards) {
        if (g.trap || g.gone) continue;
        const falling = !lrSupported(s, g.p[0], g.p[1]);
        if (!falling && s.t % 2 === 0) continue;
        let next;
        if (falling) next = [g.p[0], g.p[1] + 1];
        else {
          const path = lrPath(s, g.p, (x, y) => x === s.me[0] && y === s.me[1], (x, y) => s.guards.some((o) => o !== g && o.p[0] === x && o.p[1] === y));
          next = path ? path[0] : r.pick(lrMoves(s, g.p[0], g.p[1]).concat([g.p]));
        }
        g.p = next;
        if (s.holes.has(g.p[1] * 10 + g.p[0])) g.trap = true;
      }
      if (caught()) { s.dead = true; return 'done'; }
    },
    draw(s, g) {
      for (let i = 0; i < 100; i++) {
        const x = i % 10, y = (i / 10) | 0;
        if (s.holes.has(i)) g.cell(x, y, 'wall', DIM);
        else if (s.brick[i]) g.cell(x, y, 'wall');
        else if (s.ladder[i]) g.cell(x, y, 'object', DIM);
      }
      for (const i of s.gold) g.cell(i % 10, (i / 10) | 0, 'reward');
      for (const gd of s.guards) if (!gd.gone) g.cell(gd.p[0], gd.p[1], 'enemy', gd.trap ? DIM : 1);
      g.cell(s.me[0], s.me[1], s.dead ? 'enemy' : 'agent');
    },
  });

  // ---------------------------------------------------------------- bomberman
  const BW = 11, BFUSE = 6;

  function bmBlast(s, x, y, range) {
    const cells = [[x, y]];
    for (const [dx, dy] of DIRS4) {
      for (let k = 1; k <= range; k++) {
        const cx = x + dx * k, cy = y + dy * k, i = cy * BW + cx;
        if (s.wall[i]) break;
        cells.push([cx, cy]);
        if (s.soft[i]) break;
      }
    }
    return cells;
  }

  add({
    id: 'bomberman',
    year: 1983,
    title: 'Bomb blasts',
    games: ['Bomberman (1983)'],
    essence: 'Drop a bomb, then get out of its way. After a short fuse it blasts a cross down the corridors, clearing soft blocks and destroying anything it reaches, including you.',
    channels: { agent: 'bomber (dim = bomb)', enemy: 'wanderers (dim = blast)', reward: 'range power-up', object: 'soft blocks', wall: 'pillars' },
    w: BW,
    h: BW,
    fps: 6,
    maxTicks: 700,
    hold: 8,
    init(r) {
      const N = BW * BW, wall = new Uint8Array(N), soft = new Uint8Array(N);
      for (let y = 0; y < BW; y++) for (let x = 0; x < BW; x++) {
        const i = y * BW + x;
        if (x === 0 || y === 0 || x === BW - 1 || y === BW - 1 || (x % 2 === 0 && y % 2 === 0)) wall[i] = 1;
        else if (x + y > 3 && r.chance(0.42)) soft[i] = 1;
      }
      const spots = [];
      for (let y = 1; y < BW - 1; y++) for (let x = 1; x < BW - 1; x++) if (!wall[y * BW + x] && x + y >= 9) spots.push([x, y]);
      r.shuffle(spots);
      const enemies = [];
      for (const p of spots) {
        if (enemies.length === 3) break;
        if (enemies.some((e) => manhattan(e.p, p) < 3)) continue;
        soft[p[1] * BW + p[0]] = 0;
        for (const [dx, dy] of DIRS4) {
          const i = (p[1] + dy) * BW + p[0] + dx;
          if (!wall[i]) soft[i] = 0;
        }
        enemies.push({ p, d: r.i(4) });
      }
      return { wall, soft, me: [1, 1], enemies, bombs: [], blast: new Map(), power: new Set(), range: 1, ups: 0, t: 0, dead: false };
    },
    tick(s, r) {
      s.t++;
      const at = (x, y) => y * BW + x;
      for (const [i, t] of s.blast) t > 1 ? s.blast.set(i, t - 1) : s.blast.delete(i);
      const bombAt = (x, y) => s.bombs.some((b) => b.x === x && b.y === y);
      const open = (x, y) => !s.wall[at(x, y)] && !s.soft[at(x, y)] && !bombAt(x, y);
      const danger = new Uint8Array(BW * BW);
      for (const i of s.blast.keys()) danger[i] = 1;
      for (const b of s.bombs) for (const [x, y] of bmBlast(s, b.x, b.y, b.range)) danger[at(x, y)] = 1;
      const nearEnemy = (x, y) => s.enemies.some((e) => manhattan(e.p, [x, y]) <= 1);
      const [mx, my] = s.me;

      // agent: flee a pending blast, else bomb when useful and escapable, else walk to a useful spot
      let step = null;
      if (danger[at(mx, my)]) {
        const safeStep = (x, y) => open(x, y) && !s.blast.has(at(x, y)) && !nearEnemy(x, y);
        const path = bfs(BW, BW, s.me, (x, y) => !danger[at(x, y)] && safeStep(x, y), safeStep) ||
          bfs(BW, BW, s.me, (x, y) => !danger[at(x, y)] && open(x, y), (x, y) => open(x, y) && !s.blast.has(at(x, y)));
        if (path) step = path[0];
      } else {
        const inLine = (x, y) => bmBlast(s, x, y, s.range).some(([cx, cy]) => s.enemies.some((e) => e.p[0] === cx && e.p[1] === cy));
        const nextToSoft = (x, y) => DIRS4.some(([dx, dy]) => s.soft[at(x + dx, y + dy)]);
        let dropped = false;
        if (!s.bombs.length && (nextToSoft(mx, my) || inLine(mx, my))) {
          const zone = new Uint8Array(danger);
          for (const [x, y] of bmBlast(s, mx, my, s.range)) zone[at(x, y)] = 1;
          const esc = bfs(BW, BW, s.me, (x, y) => !zone[at(x, y)] && open(x, y) && !nearEnemy(x, y), (x, y) => open(x, y) && !nearEnemy(x, y));
          if (esc && esc.length < BFUSE - 1) {
            s.bombs.push({ x: mx, y: my, fuse: BFUSE, range: s.range });
            dropped = true;
          }
        }
        if (!dropped) {
          const walk = (x, y) => open(x, y) && !danger[at(x, y)] && !nearEnemy(x, y);
          const useful = (x, y) => walk(x, y) && (s.power.has(at(x, y)) || (!s.bombs.length && (nextToSoft(x, y) || inLine(x, y))));
          const path = bfs(BW, BW, s.me, useful, walk);
          if (path) step = path[0];
          else if (r.chance(0.3)) {
            const opts = DIRS4.map(([dx, dy]) => [mx + dx, my + dy]).filter(([x, y]) => walk(x, y));
            if (opts.length) step = r.pick(opts);
          }
        }
      }
      if (step) s.me = step;
      const mi = at(s.me[0], s.me[1]);
      if (s.power.has(mi)) { s.power.delete(mi); s.range++; }

      // fuses
      for (const b of s.bombs) {
        if (--b.fuse > 0) continue;
        for (const [x, y] of bmBlast(s, b.x, b.y, b.range)) {
          const i = at(x, y);
          if (s.soft[i]) {
            s.soft[i] = 0;
            if (s.ups < 2 && r.chance(0.25)) { s.power.add(i); s.ups++; }
          }
          s.blast.set(i, 2);
        }
      }
      s.bombs = s.bombs.filter((b) => b.fuse > 0);
      const burnt = (p) => s.blast.has(at(p[0], p[1]));
      s.enemies = s.enemies.filter((e) => !burnt(e.p));
      if (burnt(s.me)) { s.dead = true; return 'done'; }

      // wanderers: keep going, turn at random when blocked or at junctions
      if (s.t % 2 === 0) {
        for (const e of s.enemies) {
          const ok = (d) => open(e.p[0] + DIRS4[d][0], e.p[1] + DIRS4[d][1]) && !burnt([e.p[0] + DIRS4[d][0], e.p[1] + DIRS4[d][1]]);
          if (!ok(e.d) || r.chance(0.2)) {
            const ds = [0, 1, 2, 3].filter(ok);
            if (!ds.length) continue;
            e.d = r.pick(ds);
          }
          e.p = [e.p[0] + DIRS4[e.d][0], e.p[1] + DIRS4[e.d][1]];
        }
      }
      if (s.enemies.some((e) => e.p[0] === s.me[0] && e.p[1] === s.me[1])) { s.dead = true; return 'done'; }
      if (!s.enemies.length) return 'done';
    },
    draw(s, g) {
      for (let i = 0; i < BW * BW; i++) {
        const x = i % BW, y = (i / BW) | 0;
        if (s.wall[i]) g.cell(x, y, 'wall');
        else if (s.soft[i]) g.cell(x, y, 'object');
      }
      for (const i of s.power) g.cell(i % BW, (i / BW) | 0, 'reward');
      for (const b of s.bombs) g.cell(b.x, b.y, 'agent', DIM);
      for (const i of s.blast.keys()) g.cell(i % BW, (i / BW) | 0, 'enemy', DIM);
      for (const e of s.enemies) g.cell(e.p[0], e.p[1], 'enemy');
      g.cell(s.me[0], s.me[1], s.dead ? 'enemy' : 'agent');
    },
  });

  // -------------------------------------------------------------- boulderdash
  const BE = 0, DIRT = 1, STEEL = 2, ROCK = 3, GEM = 4, EXIT = 5;

  // one physics step; returns { killed, gems } where gems fell onto the agent
  function bdPhysics(m, fall, me) {
    const moved = new Uint8Array(100);
    let killed = false, gems = 0;
    for (let y = 8; y >= 1; y--) for (let x = 1; x < 9; x++) {
      const i = y * 10 + x, c = m[i];
      if ((c !== ROCK && c !== GEM) || moved[i]) continue;
      const b = i + 10, onMe = me[0] === x && me[1] === y + 1;
      if (onMe) {
        if (fall[i] && c === ROCK) killed = true;
        else if (fall[i]) { m[i] = BE; gems++; }
        fall[i] = 0;
        continue;
      }
      if (m[b] === BE) { m[b] = c; m[i] = BE; fall[b] = 1; fall[i] = 0; moved[b] = 1; continue; }
      let rolled = false;
      if (m[b] === ROCK || m[b] === GEM) {
        for (const dx of [-1, 1]) {
          const s1 = i + dx, s2 = b + dx;
          const meThere = (me[1] * 10 + me[0] === s1) || (me[1] * 10 + me[0] === s2);
          if (m[s1] === BE && m[s2] === BE && !meThere) {
            m[s1] = c; m[i] = BE; fall[s1] = 1; fall[i] = 0; moved[s1] = 1; rolled = true;
            break;
          }
        }
      }
      if (!rolled) fall[i] = 0;
    }
    return { killed, gems };
  }

  function bdSafe(s, cell) {
    const m = s.m.slice(), fall = s.fall.slice(), i = cell[1] * 10 + cell[0];
    if (m[i] === GEM || m[i] === DIRT) m[i] = BE;
    for (let k = 0; k < 2; k++) if (bdPhysics(m, fall, cell).killed) return false;
    return true;
  }

  add({
    id: 'boulderdash',
    year: 1984,
    title: 'Falling rocks and digging',
    games: ['Dig Dug (1982)', 'Boulder Dash (1984)'],
    essence: 'Dig through dirt to collect diamonds. Boulders and diamonds fall when nothing holds them up and roll off each other; a falling boulder crushes the digger. Enough diamonds open the exit.',
    channels: { agent: 'digger', reward: 'diamonds, exit (dim = exit still closed)', object: 'boulders', wall: 'steel (dim = dirt)' },
    fps: 6,
    maxTicks: 400,
    hold: 8,
    init(r) {
      for (;;) {
        const m = new Uint8Array(100);
        for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) {
          const i = y * 10 + x;
          if (x === 0 || y === 0 || x === 9 || y === 9) { m[i] = STEEL; continue; }
          const f = r.f();
          m[i] = f < 0.22 ? ROCK : f < 0.3 ? BE : DIRT;
        }
        for (let k = r.range(2, 3); k > 0; k--) m[r.range(2, 7) * 10 + r.range(2, 7)] = STEEL;
        const me = [r.range(1, 3), 1];
        m[me[1] * 10 + me[0]] = BE;
        if (m[me[1] * 10 + me[0] + 10] === ROCK) m[me[1] * 10 + me[0] + 10] = DIRT;
        const cells = [];
        for (let y = 2; y < 9; y++) for (let x = 1; x < 9; x++) if (m[y * 10 + x] === DIRT && manhattan([x, y], me) > 2) cells.push(y * 10 + x);
        r.shuffle(cells);
        for (const i of cells.slice(0, 8)) m[i] = GEM;
        // the exit sits under the top wall, where nothing can fall into it
        const ex = 10 + r.range(6, 8);
        m[ex] = EXIT;
        if (m[ex + 10] === ROCK) m[ex + 10] = DIRT;
        const reach = distField(10, 10, [me], (x, y) => [BE, DIRT, GEM, EXIT].includes(m[y * 10 + x]));
        if (cells.slice(0, 8).some((i) => reach[i] < 0) || reach[ex] < 0) continue;
        return { m, fall: new Uint8Array(100), me, got: 0, need: 6, exit: ex, dead: false, won: false, stuck: 0, t: 0 };
      }
    },
    tick(s, r) {
      s.t++;
      const open = s.got >= s.need;
      const pass = (x, y) => { const c = s.m[y * 10 + x]; return c === BE || c === DIRT || c === GEM || (c === EXIT && open); };
      const goal = open ? (x, y) => y * 10 + x === s.exit : (x, y) => s.m[y * 10 + x] === GEM;
      // when nothing is reachable, dig out the dirt under a boulder to shake things loose
      const loosen = (x, y) => s.m[y * 10 + x] === DIRT && s.m[y * 10 + x - 10] === ROCK;
      const path = bfs(10, 10, s.me, goal, pass) || bfs(10, 10, s.me, loosen, pass);
      const careless = r.chance(0.3);
      let move = null;
      if (path) {
        const far = distField(10, 10, [path[path.length - 1]], pass);
        const cands = DIRS4.map(([dx, dy]) => [s.me[0] + dx, s.me[1] + dy]).filter(([x, y]) => pass(x, y))
          .sort((a, b) => (a[0] === path[0][0] && a[1] === path[0][1] ? -1 : b[0] === path[0][0] && b[1] === path[0][1] ? 1 : 0) ||
            far[a[1] * 10 + a[0]] - far[b[1] * 10 + b[0]]);
        for (const c of cands) if (careless || bdSafe(s, c)) { move = c; break; }
        if (!move && !bdSafe(s, s.me)) move = path[0];
        s.stuck = 0;
      } else {
        // boxed in: push a boulder sideways if there is room, else wander; give up after a while
        s.stuck++;
        for (const dx of r.shuffle([-1, 1])) {
          const i = s.me[1] * 10 + s.me[0] + dx;
          if (s.m[i] === ROCK && s.m[i + dx] === BE && !s.fall[i]) { s.m[i + dx] = ROCK; s.m[i] = BE; move = [s.me[0] + dx, s.me[1]]; break; }
        }
        const opts = DIRS4.map(([dx, dy]) => [s.me[0] + dx, s.me[1] + dy]).filter(([x, y]) => pass(x, y) && bdSafe(s, [x, y]));
        if (!move && opts.length && r.chance(0.6)) move = r.pick(opts);
        if (s.stuck > 8) { s.dead = true; return 'done'; }
      }
      if (move) {
        const i = move[1] * 10 + move[0];
        if (s.m[i] === GEM) s.got++;
        if (s.m[i] === EXIT) { s.me = move; s.won = true; return 'done'; }
        s.m[i] = BE;
        s.me = move;
      }
      const res = bdPhysics(s.m, s.fall, s.me);
      s.got += res.gems;
      if (res.killed) { s.dead = true; return 'done'; }
    },
    draw(s, g) {
      const open = s.got >= s.need;
      for (let i = 0; i < 100; i++) {
        const x = i % 10, y = (i / 10) | 0, c = s.m[i];
        if (c === STEEL) g.cell(x, y, 'wall');
        else if (c === DIRT) g.cell(x, y, 'wall', DIM);
        else if (c === ROCK) g.cell(x, y, 'object');
        else if (c === GEM) g.cell(x, y, 'reward');
        else if (c === EXIT) g.cell(x, y, 'reward', open ? 1 : DIM);
      }
      g.cell(s.me[0], s.me[1], s.dead ? 'enemy' : 'agent');
    },
  });

  // ------------------------------------------------------------------- tetris
  const TET = [
    [[0, 0], [1, 0], [2, 0], [3, 0]],
    [[0, 0], [1, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [2, 0], [1, 1]],
    [[1, 0], [2, 0], [0, 1], [1, 1]],
    [[0, 0], [1, 0], [1, 1], [2, 1]],
    [[0, 0], [1, 0], [2, 0], [0, 1]],
    [[0, 0], [1, 0], [2, 0], [2, 1]],
  ];
  const ROTS = TET.map((base) => {
    const out = [];
    let cur = base;
    for (let k = 0; k < 4; k++) {
      const mx = Math.min(...cur.map((c) => c[0])), my = Math.min(...cur.map((c) => c[1]));
      const norm = cur.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
      if (!out.some((o) => JSON.stringify(o) === JSON.stringify(norm))) out.push(norm);
      cur = cur.map(([x, y]) => [-y, x]);
    }
    return out;
  });
  // well interior: x 1..8, y 0..8
  const ttHit = (b, cells, x, y) => cells.some(([dx, dy]) => {
    const cx = x + dx, cy = y + dy;
    return cx < 1 || cx > 8 || cy > 8 || (cy >= 0 && b[cy * 10 + cx]);
  });
  const ttFull = (b, y) => { for (let x = 1; x <= 8; x++) if (!b[y * 10 + x]) return false; return true; };

  function ttScore(b) {
    let lines = 0;
    const c = new Uint8Array(100);
    let dst = 8;
    for (let y = 8; y >= 0; y--) {
      if (ttFull(b, y)) { lines++; continue; }
      for (let x = 1; x <= 8; x++) c[dst * 10 + x] = b[y * 10 + x];
      dst--;
    }
    let agg = 0, holes = 0, bump = 0, prev = -1;
    for (let x = 1; x <= 8; x++) {
      let h = 0;
      for (let y = 0; y < 9; y++) {
        if (c[y * 10 + x]) { if (!h) h = 9 - y; }
        else if (h) holes++;
      }
      agg += h;
      if (prev >= 0) bump += Math.abs(h - prev);
      prev = h;
    }
    return -0.51 * agg + 0.76 * lines - 0.36 * holes - 0.18 * bump;
  }

  function ttPlan(b, type, r) {
    const opts = [];
    ROTS[type].forEach((cells, rot) => {
      for (let x = 1; x <= 8; x++) {
        if (ttHit(b, cells, x, 0)) continue;
        let y = 0;
        while (!ttHit(b, cells, x, y + 1)) y++;
        const nb = b.slice();
        for (const [dx, dy] of cells) if (y + dy >= 0) nb[(y + dy) * 10 + x + dx] = 1;
        opts.push({ rot, x, score: ttScore(nb) });
      }
    });
    opts.sort((a, c) => c.score - a.score);
    if (!opts.length) return { rot: 0, x: 3 };
    return r.chance(0.15) ? r.pick(opts.slice(0, 4)) : opts[0];
  }

  add({
    id: 'tetris',
    year: 1984,
    title: 'Falling blocks, line clears',
    games: ['Tetris (1984)'],
    essence: 'Rotate and slide falling pieces so they lock into the stack. A completely filled row vanishes and everything above drops down; the game ends when the stack reaches the top.',
    channels: { agent: 'falling piece', reward: 'completed row', object: 'stack', wall: 'well' },
    fps: 7,
    maxTicks: 600,
    hold: 8,
    warmup: 4,
    init(r) {
      const s = { b: new Uint8Array(100), piece: null, target: null, rows: [], flash: 0, lines: 0, dead: false };
      ttSpawn(s, r);
      return s;
    },
    tick(s, r) {
      if (s.flash) {
        if (--s.flash > 0) return;
        const keep = [];
        for (let y = 0; y < 9; y++) if (!s.rows.includes(y)) keep.push(s.b.slice(y * 10, y * 10 + 10));
        s.b.fill(0);
        keep.reverse().forEach((row, k) => s.b.set(row, (8 - k) * 10));
        s.rows = [];
        if (s.lines >= 12) return 'done';
        return ttSpawn(s, r);
      }
      const p = s.piece, t = s.target, rots = ROTS[p.type];
      const nrot = (p.rot + 1) % rots.length, dx = sign(t.x - p.x);
      if (p.rot !== t.rot && !ttHit(s.b, rots[nrot], p.x, p.y)) p.rot = nrot;
      else if (dx && !ttHit(s.b, rots[p.rot], p.x + dx, p.y)) p.x += dx;
      else if (!ttHit(s.b, rots[p.rot], p.x, p.y + 1)) {
        p.y++;
        // soft drop once lined up
        if (p.rot === t.rot && p.x === t.x && !ttHit(s.b, rots[p.rot], p.x, p.y + 1)) p.y++;
      }
      else {
        for (const [cx, cy] of rots[p.rot]) if (p.y + cy >= 0) s.b[(p.y + cy) * 10 + p.x + cx] = 1;
        s.piece = null;
        for (let y = 0; y < 9; y++) if (ttFull(s.b, y)) s.rows.push(y);
        if (s.rows.length) { s.lines += s.rows.length; s.flash = 2; return; }
        return ttSpawn(s, r);
      }
    },
    draw(s, g) {
      g.rect(0, 0, 1, 10, 'wall'); g.rect(9, 0, 1, 10, 'wall'); g.rect(1, 9, 8, 1, 'wall');
      for (let i = 0; i < 100; i++) if (s.b[i]) g.cell(i % 10, (i / 10) | 0, 'object');
      for (const y of s.rows) g.rect(1, y, 8, 1, 'reward');
      if (s.piece) {
        const p = s.piece;
        for (const [cx, cy] of ROTS[p.type][p.rot]) if (p.y + cy >= 0) g.cell(p.x + cx, p.y + cy, s.dead ? 'enemy' : 'agent');
      }
    },
  });

  function ttSpawn(s, r) {
    const type = r.i(7);
    s.piece = { type, rot: 0, x: 4, y: 0 };
    if (ttHit(s.b, ROTS[type][0], 4, 0)) { s.dead = true; return 'done'; }
    s.target = ttPlan(s.b, type, r);
  }
})();
