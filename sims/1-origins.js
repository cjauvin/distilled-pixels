/* Origins: mechanics up to 1979. */
(function () {
  'use strict';
  const { add, clamp, sign, inb, bfs, distField, manhattan, DIRS4, DIRS8, DIM } = Atlas;

  add({
    id: 'pong',
    year: 1972,
    title: 'Paddle duel',
    games: ['Tennis for Two (1958)', 'Pong (1972)'],
    essence: 'A ball reflects off walls and paddles. Each side moves a paddle along its own edge and scores when the ball gets past the other.',
    channels: { agent: 'paddle', enemy: 'rival paddle', object: 'ball' },
    fps: 7,
    init(r) {
      return {
        ball: { x: 4, y: r.range(2, 7), dx: r.pick([-1, 1]), dy: r.pick([-1, 1]) },
        me: r.range(2, 5), rival: r.range(2, 5), scored: null,
      };
    },
    tick(s, r) {
      const b = s.ball;
      // where the ball will cross a column, folding bounces off top/bottom
      const predict = (col) => {
        let y = b.y, dy = b.dy;
        for (let x = b.x; x !== col; x += b.dx) {
          y += dy;
          if (y < 0) { y = 1; dy = 1; }
          if (y > 9) { y = 8; dy = -1; }
        }
        return y;
      };
      const track = (pos, target, skill) => (r.chance(skill) ? clamp(pos + sign(target - (pos + 1)), 0, 7) : pos);
      s.me = track(s.me, b.dx < 0 ? predict(0) : 4, 0.85);
      s.rival = track(s.rival, b.dx > 0 ? b.y : 4, 0.7);

      let nx = b.x + b.dx, ny = b.y + b.dy;
      if (ny < 0 || ny > 9) { b.dy = -b.dy; ny = b.y + b.dy; }
      const paddle = nx === 0 ? s.me : nx === 9 ? s.rival : null;
      if (paddle !== null && ny >= paddle && ny < paddle + 3) {
        b.dx = -b.dx;
        b.dy = ny === paddle ? -1 : ny === paddle + 2 ? 1 : r.pick([-1, 0, 1]);
        nx = b.x + b.dx;
        ny = clamp(b.y + b.dy, 0, 9);
      }
      b.x = nx; b.y = ny;
      // a ball in an edge column has slipped past that paddle
      if (b.x === 9) { s.scored = 'me'; return 'done'; }
      if (b.x === 0) { s.scored = 'rival'; return 'done'; }
    },
    draw(s, g) {
      g.rect(0, s.me, 1, 3, s.scored === 'rival' ? 'enemy' : 'agent');
      g.rect(9, s.rival, 1, 3, 'enemy');
      g.cell(s.ball.x, s.ball.y, 'object');
    },
  });

  // shared helpers for the mechanics below
  const UNIT8 = DIRS8.map(([x, y]) => { const l = Math.hypot(x, y); return [x / l, y / l]; });
  const dir8 = (dx, dy) => (Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) + 8) % 8;
  const turn8 = (d, want, max = 1) => {
    const diff = ((want - d + 12) % 8) - 4;
    return (d + clamp(diff, -max, max) + 8) % 8;
  };
  const wrapd = (d, n) => d - n * Math.round(d / n);       // shortest signed offset on a torus
  const wrapv = (v, n) => ((v % n) + n) % n;
  const dir4 = (dx, dy) => DIRS4.findIndex(([x, y]) => x === dx && y === dy);
  const NB10 = [];                                         // 4-neighbours on a 10x10 grid
  for (let i = 0; i < 100; i++) {
    const x = i % 10, y = (i / 10) | 0;
    NB10.push(DIRS4.map(([dx, dy]) => [x + dx, y + dy]).filter(([a, b]) => inb(10, 10, a, b)).map(([a, b]) => b * 10 + a));
  }

  // ---------------------------------------------------------------- spacewar
  const SG = 0.7, STAR = 5.5;
  add({
    id: 'spacewar',
    year: 1962,
    title: 'Orbital duel',
    games: ['Spacewar! (1962)', 'Computer Space (1971)'],
    essence: 'Two ships circle a star whose gravity pulls them in. Each one turns, thrusts and fires torpedoes, and the edges of space wrap around.',
    channels: { agent: 'ship, torpedoes (dim)', enemy: 'rival ship, its torpedoes (dim)', wall: 'star' },
    w: 11, h: 11, fps: 7, maxTicks: 400, warmup: 4,
    init(r) {
      const a0 = r.f() * Math.PI * 2, spin = r.pick([-1, 1]), counter = r.chance(0.4);
      const ship = (ang, sp) => {
        const rad = r.range(30, 42) / 10, v = Math.sqrt(SG / rad) * (0.85 + r.f() * 0.25);
        return {
          x: STAR + Math.cos(ang) * rad, y: STAR + Math.sin(ang) * rad,
          vx: -Math.sin(ang) * v * sp, vy: Math.cos(ang) * v * sp,
          dir: r.i(8), fuel: 24, cool: r.range(10, 16), dead: null,
        };
      };
      return { me: ship(a0, spin), rival: ship(a0 + Math.PI, counter ? -spin : spin), torps: [] };
    },
    tick(s, r) {
      const ships = [s.me, s.rival];
      ships.forEach((sh, i) => {
        const o = ships[1 - i], skill = i === 0 ? 0.85 : 0.72;
        const dx = STAR - sh.x, dy = STAR - sh.y, d = Math.hypot(dx, dy);
        const vin = (sh.vx * dx + sh.vy * dy) / d;
        sh.cool--;
        const ox = wrapd(o.x - sh.x, 11), oy = wrapd(o.y - sh.y, 11), rvx = o.vx - sh.vx, rvy = o.vy - sh.vy;
        const tc = -(ox * rvx + oy * rvy) / (rvx * rvx + rvy * rvy + 1e-6);
        const mx = ox + rvx * tc, my = oy + rvy * tc;   // closest approach
        if (sh.fuel > 0 && tc > 0 && tc < 4 && Math.hypot(mx, my) < 1 && r.chance(skill)) {
          // on course to ram the rival: burn away from the meeting point
          sh.dir = turn8(sh.dir, dir8(-mx || -oy, -my || ox), 2);
          sh.vx += UNIT8[sh.dir][0] * 0.11; sh.vy += UNIT8[sh.dir][1] * 0.11; sh.fuel--;
        } else if (sh.fuel > 0 && (d < 2.3 || (d < 4 && vin > 0.12)) && r.chance(skill)) {
          // falling in: burn along the orbit and slightly outward
          let tx = sh.vx - (vin * dx) / d, ty = sh.vy - (vin * dy) / d, tl = Math.hypot(tx, ty);
          if (tl < 0.05) { tx = -dy; ty = dx; tl = d; }
          sh.dir = turn8(sh.dir, dir8(tx / tl - dx / d, ty / tl - dy / d), 2);
          const [ux, uy] = UNIT8[sh.dir];
          sh.vx += ux * 0.11; sh.vy += uy * 0.11; sh.fuel--;
        } else {
          // aim at the rival, leading it a little, and fire when lined up
          let rx = wrapd(o.x - sh.x, 11), ry = wrapd(o.y - sh.y, 11);
          const dist = Math.hypot(rx, ry), tt = dist / 1.1;
          rx += (o.vx - sh.vx) * tt; ry += (o.vy - sh.vy) * tt;
          const want = dir8(rx, ry);
          sh.dir = turn8(sh.dir, want);
          const [ux, uy] = UNIT8[sh.dir];
          if (sh.dir === want && sh.cool <= 0 && dist < 5 && r.chance(skill * 0.3)) {
            s.torps.push({ x: sh.x + ux * 0.6, y: sh.y + uy * 0.6, vx: sh.vx + ux * 1.1, vy: sh.vy + uy * 1.1, life: 6, own: i });
            sh.cool = 8;
          } else if (sh.dir === want && dist > 5 && sh.fuel > 8 && r.chance(0.3)) {
            sh.vx += ux * 0.09; sh.vy += uy * 0.09; sh.fuel--;   // close in on the rival
          }
        }
      });
      for (const sh of ships) {
        for (let k = 0; k < 2; k++) {
          const dx = STAR - sh.x, dy = STAR - sh.y, d2 = dx * dx + dy * dy, d = Math.sqrt(d2);
          const a = Math.min(0.35, SG / d2) * 0.5;
          sh.vx += (a * dx) / d; sh.vy += (a * dy) / d;
          sh.x = wrapv(sh.x + sh.vx * 0.5, 11); sh.y = wrapv(sh.y + sh.vy * 0.5, 11);
          if (Math.hypot(STAR - sh.x, STAR - sh.y) < 0.75) { sh.dead = 'star'; sh.x = sh.y = STAR; break; }
        }
        const sp = Math.hypot(sh.vx, sh.vy);
        if (sp > 0.85) { sh.vx *= 0.85 / sp; sh.vy *= 0.85 / sp; }
      }
      for (const t of s.torps) {
        for (let k = 0; k < 2 && t.life > 0; k++) {
          t.x = wrapv(t.x + t.vx * 0.5, 11); t.y = wrapv(t.y + t.vy * 0.5, 11);
          if (Math.hypot(STAR - t.x, STAR - t.y) < 0.8) t.life = 0;
          const tg = ships[1 - t.own];
          if (!tg.dead && Math.hypot(wrapd(tg.x - t.x, 11), wrapd(tg.y - t.y, 11)) < 0.45) { tg.dead = 'hit'; t.life = 0; }
        }
        t.life--;
      }
      s.torps = s.torps.filter((t) => t.life > 0);
      if (!s.me.dead && !s.rival.dead && Math.hypot(wrapd(s.me.x - s.rival.x, 11), wrapd(s.me.y - s.rival.y, 11)) < 0.45) {
        s.me.dead = s.rival.dead = 'crash';
      }
      if (s.me.dead || s.rival.dead) return 'done';
    },
    draw(s, g) {
      g.cell(5, 5, 'wall');
      for (const t of s.torps) g.cell(t.x, t.y, t.own ? 'enemy' : 'agent', DIM);
      const rv = s.rival, me = s.me;
      if (!rv.dead) g.cell(rv.x, rv.y, 'enemy');   // a destroyed rival vanishes
      g.cell(me.x, me.y, me.dead ? 'enemy' : 'agent');
    },
  });

  // ---------------------------------------------------------------- breakout
  add({
    id: 'breakout',
    year: 1976,
    title: 'Brick breaking',
    games: ['Breakout (1976)', 'Arkanoid (1986)'],
    essence: 'A ball bounces between a paddle and a wall of bricks, breaking every brick it touches. The round ends when the wall is gone or the ball slips past the paddle.',
    channels: { agent: 'paddle', reward: 'bricks', object: 'ball' },
    fps: 9, maxTicks: 800, warmup: 8,
    init(r) {
      const bricks = new Uint8Array(100);
      let left = 0;
      for (let y = 2; y <= 4; y++) for (let x = 0; x < 10; x++) if (r.chance(y === 2 ? 0.4 : 0.8)) { bricks[y * 10 + x] = 1; left++; }
      const bx = r.range(2, 7);
      return { bricks, left, ball: { x: bx, y: 7, dx: r.pick([-1, 1]), dy: -1 }, pad: clamp(bx - 1, 0, 7), aim: 0, jit: [0, 0, 0], lost: false };
    },
    tick(s, r) {
      const b = s.ball, B = s.bricks;
      const brick = (x, y) => inb(10, 10, x, y) && B[y * 10 + x] === 1;
      const smash = (x, y) => { B[y * 10 + x] = 0; s.left--; };
      // paddle: slide under the predicted landing column, offset to pick a bounce angle
      let tx = b.x, x8 = b.x;
      if (b.dy > 0) {
        let dx = b.dx;
        for (let y = b.y; y < 9; y++) { if (tx + dx < 0 || tx + dx > 9) dx = -dx; x8 = tx; tx += dx; }
        // which bounce reaches a brick soonest? (a short lookahead with the real bounce rules)
        const soon = (x, dx) => {
          for (let y = 8, dy = -1, t = 0; t < 24; t++) {
            if (x + dx < 0 || x + dx > 9) dx = -dx;
            if (y + dy < 0) dy = 1;
            if (brick(x, y + dy) || (dx && (brick(x + dx, y) || brick(x + dx, y + dy)))) return t;
            x += dx; y += dy;
            if (y >= 8) return 30;
          }
          return 30;
        };
        let bs = Infinity;
        for (const a of [-1, 0, 1]) {
          if (tx - 1 - a < 0 || tx - 1 - a > 7) continue;
          const sc = soon(x8, a) + s.jit[a + 1];
          if (sc < bs) { bs = sc; s.aim = a; }
        }
      }
      const gap = clamp(tx - 1 - s.aim, 0, 7) - s.pad;
      if (r.chance(0.85)) s.pad += clamp(gap, -2, 2);

      if (b.x + b.dx < 0 || b.x + b.dx > 9) b.dx = -b.dx;
      if (b.y + b.dy < 0) b.dy = 1;
      let hit = false;
      if (brick(b.x, b.y + b.dy)) { smash(b.x, b.y + b.dy); b.dy = -b.dy; hit = true; }
      if (b.dx && brick(b.x + b.dx, b.y)) { smash(b.x + b.dx, b.y); b.dx = -b.dx; hit = true; }
      if (!hit && b.dx && brick(b.x + b.dx, b.y + b.dy)) { smash(b.x + b.dx, b.y + b.dy); b.dx = -b.dx; b.dy = -b.dy; }
      if (b.dy > 0 && b.y + b.dy === 9) {
        const rel = b.x + b.dx - s.pad;
        if (rel >= 0 && rel <= 2) {
          b.dy = -1;
          b.dx = rel - 1;
          s.jit = [r.f() * 8, r.f() * 8, r.f() * 8];
        }
      }
      if (b.x + b.dx < 0 || b.x + b.dx > 9) b.dx = -b.dx;
      if (b.y + b.dy < 0) b.dy = 1;
      if (!brick(b.x + b.dx, b.y + b.dy)) { b.x += b.dx; b.y += b.dy; }
      if (b.y >= 9) { s.lost = true; return 'done'; }
      if (!s.left) return 'done';
    },
    draw(s, g) {
      for (let i = 0; i < 100; i++) if (s.bricks[i]) g.cell(i % 10, (i / 10) | 0, 'reward');
      g.rect(s.pad, 9, 3, 1, s.lost ? 'enemy' : 'agent');
      g.cell(s.ball.x, Math.min(9, s.ball.y), 'object');
    },
  });

  // ---------------------------------------------------------------- tron
  add({
    id: 'tron',
    year: 1976,
    title: 'Light-cycle trails',
    games: ['Blockade (1976)', 'Tron (1982)'],
    essence: 'Two riders never stop and leave a solid wall behind them. Each tries to keep more open space than the other, and the first to hit a wall, a trail or the edge loses.',
    channels: { agent: 'rider, its trail (dim)', enemy: 'rival rider, its trail (dim)' },
    fps: 7, maxTicks: 200, warmup: 5,
    init(r) {
      const x = r.range(1, 3), y = r.range(6, 8), d = r.pick([0, 3]);
      const occ = new Uint8Array(100);
      const me = { x, y, d, dead: false }, rv = { x: 9 - x, y: 9 - y, d: (d + 2) % 4, dead: false };
      occ[y * 10 + x] = 1;
      occ[rv.y * 10 + rv.x] = 2;
      return { occ, me, rv };
    },
    tick(s, r) {
      const occ = s.occ;
      const free = (x, y) => inb(10, 10, x, y) && !occ[y * 10 + x];
      const choose = (p, o, slip) => {
        const opts = [];
        for (const t of [0, 1, 3]) {
          const d = (p.d + t) % 4, x = p.x + DIRS4[d][0], y = p.y + DIRS4[d][1];
          if (!free(x, y)) continue;
          let room = 0;
          for (const v of distField(10, 10, [[x, y]], free)) if (v > 0) room++;
          let sc = room - 0.1 * manhattan([x, y], [o.x, o.y]) + (t === 0 ? 0.8 : 0) + r.f() * 2.5;
          if (manhattan([x, y], [o.x, o.y]) === 1) sc -= 14;
          for (const [dx, dy] of DIRS4) if (!free(x + dx, y + dy)) sc += 0.4;   // hug walls to fill space tightly
          opts.push({ d, sc });
        }
        if (!opts.length) return p.d;
        if (r.chance(slip)) return r.pick(opts).d;
        return opts.reduce((a, b) => (b.sc > a.sc ? b : a)).d;
      };
      s.me.d = choose(s.me, s.rv, 0.03);
      s.rv.d = choose(s.rv, s.me, 0.05);
      const nm = [s.me.x + DIRS4[s.me.d][0], s.me.y + DIRS4[s.me.d][1]];
      const nr = [s.rv.x + DIRS4[s.rv.d][0], s.rv.y + DIRS4[s.rv.d][1]];
      s.me.dead = !free(...nm);
      s.rv.dead = !free(...nr);
      if (nm[0] === nr[0] && nm[1] === nr[1]) s.me.dead = s.rv.dead = true;
      if (!s.me.dead) { [s.me.x, s.me.y] = nm; occ[nm[1] * 10 + nm[0]] = 1; }
      if (!s.rv.dead) { [s.rv.x, s.rv.y] = nr; occ[nr[1] * 10 + nr[0]] = 2; }
      if (s.me.dead || s.rv.dead) return 'done';
    },
    draw(s, g) {
      for (let i = 0; i < 100; i++) if (s.occ[i]) g.cell(i % 10, (i / 10) | 0, s.occ[i] === 1 ? 'agent' : 'enemy', DIM);
      g.cell(s.rv.x, s.rv.y, 'enemy', s.rv.dead ? DIM : 1);   // a crashed rival fades into its trail
      g.cell(s.me.x, s.me.y, s.me.dead ? 'enemy' : 'agent');
    },
  });

  // ---------------------------------------------------------------- road
  const roadRow = (s, r, prev) => {
    if (r.chance(0.16)) s.dc = r.pick([-1, -0.5, -0.5, 0, 0.5, 0.5, 1]);
    if (r.chance(0.06)) s.wd = r.range(4, 5);
    s.c += s.dc;
    let l = Math.round(s.c - (s.wd - 1) / 2);
    if (l < 1) { l = 1; s.dc = Math.abs(s.dc); }
    if (l + s.wd - 1 > 8) { l = 9 - s.wd; s.dc = -Math.abs(s.dc); }
    l = clamp(l, prev.l - 1, prev.l + 1);
    let rt = clamp(l + s.wd - 1, prev.r - 1, prev.r + 1);
    if (rt - l < 2) rt = l + 2;
    s.c = (l + rt) / 2;
    return { l, r: rt, fuel: r.chance(0.07) ? r.range(l, rt) : -1 };
  };
  add({
    id: 'road',
    year: 1976,
    title: 'Lane racing',
    games: ['Night Driver (1976)', 'Road Fighter (1984)'],
    essence: 'The road scrolls toward the driver and bends left and right. Steer to stay on it, pass slower cars and pick up fuel before the tank runs dry.',
    channels: { agent: 'car', enemy: 'slower cars', reward: 'fuel (dim = tank level, right edge)', wall: 'road edge (dim = off road)' },
    fps: 8, maxTicks: 400, warmup: 6,
    init(r) {
      const s = { rows: [], c: 5, dc: 0, wd: 5, cars: [], x: 5, fuel: 6, dist: 0, end: null };
      let prev = { l: 3, r: 7 };
      for (let y = 0; y < 10; y++) { prev = y < 3 ? { l: 3, r: 7, fuel: -1 } : roadRow(s, r, prev); s.rows.unshift(prev); }
      s.x = Math.round(s.rows[8].l / 2 + s.rows[8].r / 2);
      return s;
    },
    tick(s, r) {
      // plan: look a few rows ahead and keep the move that stays alive longest
      const L = 6;
      const safe = (t, x) => {
        const row = s.rows[8 - t];
        if (x < row.l || x > row.r) return false;
        return !s.cars.some((c) => c.x === x && Math.floor(c.y + c.v * t) === 8);
      };
      let V = new Array(10).fill(0);
      for (let t = L; t >= 1; t--) {
        const row = s.rows[8 - t], NV = new Array(10).fill(-99);
        for (let x = 0; x < 10; x++) {
          if (!safe(t, x)) continue;
          const nextBest = Math.max(V[x], x > 0 ? V[x - 1] : -99, x < 9 ? V[x + 1] : -99);
          NV[x] = 1 + nextBest + (row.fuel === x ? (s.fuel <= 5 ? 1.5 : 0.4) : 0) - 0.05 * Math.abs(x - (row.l + row.r) / 2);
        }
        V = NV;
      }
      let m = 0, bs = -Infinity;
      for (const mv of [-1, 0, 1]) {
        const x = s.x + mv;
        if (x < 0 || x > 9) continue;
        const sc = V[x] + (mv === 0 ? 0.05 : 0) + r.f() * 0.04;
        if (sc > bs) { bs = sc; m = mv; }
      }
      if (r.chance(0.025)) m = 0;

      s.rows.pop();
      s.rows.unshift(roadRow(s, r, s.rows[0]));
      for (const c of s.cars) {
        c.y += c.v;
        const row = s.rows[Math.min(9, Math.floor(c.y))];
        c.x = clamp(c.x, row.l, row.r);
      }
      s.cars = s.cars.filter((c) => c.y < 10);
      if (r.chance(0.14) && !s.cars.some((c) => c.y < 2)) {
        const row = s.rows[0];
        s.cars.push({ x: r.range(row.l, row.r), y: 0, v: r.pick([0.34, 0.5]) });
      }
      s.x += m;
      const row = s.rows[8];
      if (s.x < row.l || s.x > row.r || s.cars.some((c) => c.x === s.x && Math.floor(c.y) === 8)) { s.end = 'crash'; return 'done'; }
      if (row.fuel === s.x) { s.fuel = Math.min(9, s.fuel + 3); row.fuel = -1; }
      if (++s.dist % 9 === 0 && --s.fuel <= 0) { s.end = 'empty'; return 'done'; }
      if (s.dist >= 160) { s.end = 'finish'; return 'done'; }
    },
    draw(s, g) {
      s.rows.forEach((row, y) => {
        for (let x = 0; x < 10; x++) {
          if (x < row.l || x > row.r) g.cell(x, y, 'wall', x === row.l - 1 || x === row.r + 1 ? 1 : DIM);
        }
        if (row.fuel >= 0) g.cell(row.fuel, y, 'reward');
      });
      for (let k = 0; k < s.fuel; k++) g.cell(9, 9 - k, 'reward', DIM);   // fuel gauge
      for (const c of s.cars) g.cell(c.x, c.y, 'enemy');
      g.cell(s.x, 8, s.end === 'crash' || s.end === 'empty' ? 'enemy' : 'agent');
    },
  });

  // ---------------------------------------------------------------- combat
  let SHELL = 1;
  add({
    id: 'combat',
    year: 1977,
    title: 'Tank duel',
    games: ['Combat (1977)', 'Battle City (1985)'],
    essence: 'Two tanks hunt each other through an arena. Shells stop at walls and blast through bricks, so each tank works to get a clear line of fire first.',
    channels: { agent: 'tank, shells (dim)', enemy: 'rival tank, its shells (dim)', object: 'bricks', wall: 'walls' },
    fps: 6, maxTicks: 400, warmup: 4,
    init(r) {
      for (;;) {
        const map = new Uint8Array(100);   // 0 open, 1 wall, 2 brick
        const put = (x, y, v) => { map[y * 10 + x] = v; map[(9 - y) * 10 + (9 - x)] = v; };
        for (let k = 0; k < 3; k++) {
          const horiz = r.chance(0.5), len = r.range(2, 3), x = r.range(1, 7), y = r.range(1, 4);
          for (let j = 0; j < len; j++) put(horiz ? x + j : x, horiz ? y : y + j, 1);
        }
        for (let k = 0; k < 6; k++) { const x = r.range(0, 9), y = r.range(0, 4); if (!map[y * 10 + x]) put(x, y, 2); }
        const me = { x: r.range(0, 1), y: r.range(8, 9), d: 3 }, foe = { x: 9 - me.x, y: 9 - me.y, d: 1 };
        for (const t of [me, foe]) map[t.y * 10 + t.x] = 0;
        const path = bfs(10, 10, [me.x, me.y], (x, y) => x === foe.x && y === foe.y, (x, y) => map[y * 10 + x] !== 1);
        if (path) return { map, me, foe, shells: [], result: null, t: 0 };
      }
    },
    tick(s, r) {
      const map = s.map, tanks = [s.me, s.foe];
      s.t++;
      const line = (a, b) => {   // straight line between two cells: null if a wall is in the way
        if (a.x !== b.x && a.y !== b.y) return null;
        const dx = sign(b.x - a.x), dy = sign(b.y - a.y);
        let bricks = 0;
        for (let x = a.x + dx, y = a.y + dy; x !== b.x || y !== b.y; x += dx, y += dy) {
          if (map[y * 10 + x] === 1) return null;
          if (map[y * 10 + x] === 2) bricks++;
        }
        return { d: dir4(dx, dy), bricks };
      };
      const act = (t, o, own, skill) => {
        const l = line(t, o);
        const loaded = !s.shells.some((sh) => sh.own === own);
        const threat = s.shells.find((sh) => {
          if (sh.own === own) return false;
          const k = line(sh, t);
          return k && !k.bricks && k.d === sh.d && manhattan([sh.x, sh.y], [t.x, t.y]) <= 5;
        });
        const fire = () => s.shells.push({ x: t.x, y: t.y, d: t.d, own, fresh: true });
        const open = (x, y) => inb(10, 10, x, y) && !map[y * 10 + x] && !(x === o.x && y === o.y);
        const go = (d) => {
          t.d = d;
          const x = t.x + DIRS4[d][0], y = t.y + DIRS4[d][1];
          if (open(x, y)) { t.x = x; t.y = y; }
        };
        if (!r.chance(skill)) return;   // hesitates
        if (threat && r.chance(0.75)) {
          // sidestep out of the shell's path, preferably out of the rival's sight too
          const side = r.shuffle([(threat.d + 1) % 4, (threat.d + 3) % 4])
            .filter((d) => open(t.x + DIRS4[d][0], t.y + DIRS4[d][1]))
            .sort((a, b) => !!line({ x: t.x + DIRS4[a][0], y: t.y + DIRS4[a][1] }, o) - !!line({ x: t.x + DIRS4[b][0], y: t.y + DIRS4[b][1] }, o));
          if (side.length) return go(side[0]);
        }
        if (l && !l.bricks) {
          if (t.d === l.d && loaded) { if (r.chance(0.6)) fire(); return; }
          if (t.d !== l.d) { t.d = l.d; return; }
        }
        if (l && l.bricks && r.chance(0.6)) {
          if (t.d !== l.d) { t.d = l.d; return; }
          if (loaded) return fire();
        }
        // early on, look for a cell with a clear shot; later, push straight at the rival through bricks
        const hunt = s.t > 40 && r.chance(0.4);
        const path = !hunt && bfs(10, 10, [t.x, t.y], (x, y) => open(x, y) && manhattan([x, y], [o.x, o.y]) >= 3 && (() => { const k = line({ x, y }, o); return k && !k.bricks; })(), open);
        const opts = [0, 1, 2, 3].filter((d) => open(t.x + DIRS4[d][0], t.y + DIRS4[d][1]));
        if (path) return r.chance(0.85) || !opts.length ? go(dir4(path[0][0] - t.x, path[0][1] - t.y)) : go(r.pick(opts));
        const push = bfs(10, 10, [t.x, t.y], (x, y) => x === o.x && y === o.y, (x, y) => map[y * 10 + x] !== 1);
        if (push) {
          const d = dir4(push[0][0] - t.x, push[0][1] - t.y);
          if (map[push[0][1] * 10 + push[0][0]] !== 2) return go(d);
          if (t.d !== d) { t.d = d; return; }
          if (loaded) return fire();
          return;
        }
        if (opts.length) go(r.pick(opts));
      };
      const order = r.chance(0.5) ? [0, 1] : [1, 0];
      for (const i of order) act(tanks[i], tanks[1 - i], i, i === 0 ? 0.85 : 0.8);
      // shells: newly fired ones leave the barrel, older ones fly two cells per tick
      for (let k = 0; k < SHELL; k++) {
        for (const sh of s.shells) {
          if (sh.dead || (sh.fresh && k)) continue;
          const x = sh.x + DIRS4[sh.d][0], y = sh.y + DIRS4[sh.d][1];
          if (!inb(10, 10, x, y) || map[y * 10 + x] === 1) { sh.dead = true; continue; }
          if (map[y * 10 + x] === 2) { map[y * 10 + x] = 0; sh.dead = true; continue; }
          sh.x = x; sh.y = y;
          const tg = tanks[1 - sh.own];
          if (tg.x === x && tg.y === y) { s.result = sh.own === 0 ? 'win' : 'loss'; sh.dead = true; }
        }
        const live = s.shells.filter((sh) => !sh.dead);
        if (live.length === 2 && live[0].x === live[1].x && live[0].y === live[1].y) live.forEach((sh) => (sh.dead = true));
      }
      s.shells = s.shells.filter((sh) => !sh.dead);
      s.shells.forEach((sh) => (sh.fresh = false));
      if (s.result) return 'done';
    },
    draw(s, g) {
      for (let i = 0; i < 100; i++) if (s.map[i]) g.cell(i % 10, (i / 10) | 0, s.map[i] === 1 ? 'wall' : 'object');
      for (const sh of s.shells) g.cell(sh.x, sh.y, sh.own ? 'enemy' : 'agent', DIM);
      if (s.result !== 'win') g.cell(s.foe.x, s.foe.y, 'enemy');   // a destroyed rival vanishes
      g.cell(s.me.x, s.me.y, s.result === 'loss' ? 'enemy' : 'agent');
    },
  });

  // ---------------------------------------------------------------- invaders
  add({
    id: 'invaders',
    year: 1978,
    title: 'Marching formation',
    games: ['Space Invaders (1978)', 'Galaxian (1979)'],
    essence: 'A block of invaders steps sideways, drops a row at each edge and speeds up as it thins. The cannon fires up from behind crumbling shields while bombs rain down.',
    channels: { agent: 'cannon, shots (dim)', enemy: 'invaders, bombs (dim)', object: 'shields (dim = damaged)' },
    fps: 8, maxTicks: 700, warmup: 8,
    init(r) {
      const inv = [];
      for (let row = 0; row < 3; row++) for (let c = 0; c < 4; c++) inv.push({ cx: c * 2, cy: row });
      const shields = new Map([1, 2, 7, 8].map((x) => [x, 2]));
      return { inv, ox: r.range(0, 3), oy: 1, fd: r.pick([-1, 1]), clock: 0, me: r.range(3, 6), shot: null, bombs: [], shields, result: null };
    },
    tick(s, r) {
      const inv = s.inv;
      // the formation steps more often as it thins
      if (++s.clock >= Math.max(1, Math.round(inv.length / 2.4))) {
        s.clock = 0;
        const xs = inv.map((v) => s.ox + v.cx);
        if (s.fd > 0 ? Math.max(...xs) >= 9 : Math.min(...xs) <= 0) { s.oy++; s.fd = -s.fd; } else s.ox += s.fd;
        for (const v of inv) {
          const x = s.ox + v.cx, y = s.oy + v.cy;
          if (y === 7) s.shields.delete(x);
          if (y >= 8) { s.result = 'loss'; return 'done'; }
        }
      }
      for (const b of s.bombs) {
        b.y++;
        if (b.y === 7 && s.shields.has(b.x)) { b.dead = true; const hp = s.shields.get(b.x) - 1; hp ? s.shields.set(b.x, hp) : s.shields.delete(b.x); }
        if (b.y === 9 && b.x === s.me) { s.result = 'loss'; return 'done'; }
      }
      s.bombs = s.bombs.filter((b) => !b.dead && b.y <= 9);
      if (r.chance(0.12 + 0.015 * (12 - inv.length))) {
        const v = r.pick(inv), x = s.ox + v.cx;
        const low = Math.max(...inv.filter((u) => s.ox + u.cx === x).map((u) => s.oy + u.cy));
        s.bombs.push({ x, y: low + 1 });
      }
      // cannon: dodge bombs, else move to a column where a shot fired on arrival would connect,
      // predicting the formation's steps while the shot climbs two rows per tick
      const eta = (x) => Math.min(99, ...s.bombs.filter((b) => b.x === x && !(b.y < 7 && s.shields.has(x))).map((b) => 9 - b.y));
      const minC = Math.min(...inv.map((v) => v.cx)), maxC = Math.max(...inv.map((v) => v.cx));
      const every = Math.max(1, Math.round(inv.length / 2.4));
      const future = (n) => {
        let { ox, oy, fd, clock } = s;
        for (let i = 0; i < n; i++) {
          if (++clock < every) continue;
          clock = 0;
          if (fd > 0 ? ox + maxC >= 9 : ox + minC <= 0) { oy++; fd = -fd; } else ox += fd;
        }
        return [ox, oy];
      };
      const connects = (x, wait) => {
        if (s.shields.has(x)) return false;
        for (let j = 0; j < 5; j++) {
          const [ox, oy] = future(wait + j);
          if (inv.some((v) => ox + v.cx === x && (oy + v.cy === 8 - 2 * j || oy + v.cy === 7 - 2 * j))) return true;
        }
        return false;
      };
      let best = null, bs = Infinity;
      for (let x = 0; x < 10; x++) {
        const d = Math.abs(x - s.me);
        if (!connects(x, d)) continue;
        const sc = d + (eta(x) <= d + 1 ? 5 : 0);
        if (sc < bs) { bs = sc; best = x; }
      }
      if (best === null) {
        const [ox] = future(2);
        best = clamp(ox + (minC + maxC) / 2, 0, 9) | 0;
      }
      let mv = sign(best - s.me);
      if (eta(s.me + mv) <= 1) mv = 0;
      if (eta(s.me + mv) <= 1) mv = [-1, 1].find((d) => s.me + d >= 0 && s.me + d <= 9 && eta(s.me + d) > 1) || 0;
      if (r.chance(0.85)) s.me = clamp(s.me + mv, 0, 9);
      if (!s.shot && connects(s.me, 0) && r.chance(0.8)) s.shot = { x: s.me, y: 9 };
      if (s.shot) {
        for (let k = 0; k < 2 && s.shot; k++) {
          const sh = s.shot;
          sh.y--;
          const hit = inv.findIndex((v) => s.ox + v.cx === sh.x && s.oy + v.cy === sh.y);
          const bomb = s.bombs.findIndex((b) => b.x === sh.x && (b.y === sh.y || b.y === sh.y + 1));
          if (sh.y < 0) s.shot = null;
          else if (hit >= 0) { inv.splice(hit, 1); s.shot = null; }
          else if (bomb >= 0) { s.bombs.splice(bomb, 1); s.shot = null; }
          else if (sh.y === 7 && s.shields.has(sh.x)) { const hp = s.shields.get(sh.x) - 1; hp ? s.shields.set(sh.x, hp) : s.shields.delete(sh.x); s.shot = null; }
        }
      }
      if (!inv.length) { s.result = 'win'; return 'done'; }
    },
    draw(s, g) {
      for (const [x, hp] of s.shields) g.cell(x, 7, 'object', hp === 2 ? 1 : DIM);
      for (const v of s.inv) g.cell(s.ox + v.cx, s.oy + v.cy, 'enemy');
      for (const b of s.bombs) if (b.y <= 9) g.cell(b.x, b.y, 'enemy', DIM);
      if (s.shot) g.cell(s.shot.x, s.shot.y, 'agent', DIM);
      g.cell(s.me, 9, s.result === 'loss' ? 'enemy' : 'agent');
    },
  });

  // ---------------------------------------------------------------- kaboom
  add({
    id: 'kaboom',
    year: 1978,
    title: 'Catch the fallers',
    games: ['Avalanche (1978)', 'Kaboom! (1981)'],
    essence: 'A dropper zig-zags along the top and lets things fall. Slide the catcher under each one. The drops come faster and farther apart, and a single miss ends the round.',
    channels: { agent: 'catcher', enemy: 'dropper', reward: 'falling items' },
    fps: 7, maxTicks: 600, warmup: 8,
    init(r) {
      return { drop: { x: r.range(2, 7), d: r.pick([-1, 1]) }, me: 3, items: [], caught: 0, clock: 0, miss: -1 };
    },
    tick(s, r) {
      const lvl = Math.min(5, Math.floor(s.caught / 6));
      // catcher: cover the lowest item, and the next one too when they are close
      const items = [...s.items].sort((a, b) => b.y - a.y);
      if (items.length) {
        let want = items[0].x - 1;
        if (items[1] && Math.abs(items[1].x - items[0].x) <= 2) want = Math.min(items[0].x, items[1].x);
        if (r.chance(0.95)) s.me += sign(clamp(want, 0, 7) - s.me);
      }
      for (const it of s.items) it.y++;
      for (const it of s.items) {
        if (it.y !== 9) continue;
        if (it.x >= s.me && it.x <= s.me + 2) { it.caught = true; s.caught++; } else { s.miss = it.x; return 'done'; }
      }
      s.items = s.items.filter((it) => !it.caught);
      const d = s.drop;
      for (let k = 0; k < (lvl >= 4 ? 2 : 1); k++) {
        if (r.chance(0.12 + lvl * 0.05)) d.d = -d.d;
        if (d.x + d.d < 0 || d.x + d.d > 9) d.d = -d.d;
        d.x += d.d;
      }
      if (++s.clock >= [4, 3, 3, 2, 2, 1][lvl]) { s.clock = 0; s.items.push({ x: d.x, y: 1 }); }
      if (s.caught >= 40) return 'done';
    },
    draw(s, g) {
      g.cell(s.drop.x, 0, 'enemy');
      for (const it of s.items) if (it.y < 9) g.cell(it.x, it.y, 'reward');
      g.rect(s.me, 9, 3, 1, s.miss >= 0 ? 'enemy' : 'agent');
      if (s.miss >= 0) g.cell(s.miss, 9, 'reward');   // the item that hit the floor
    },
  });

  // ---------------------------------------------------------------- asteroids
  const rockHas = (k, cx, cy) => {
    const n = k.big ? 2 : 1;
    return wrapv(cx - Math.floor(k.x), 10) < n && wrapv(cy - Math.floor(k.y), 10) < n;
  };
  add({
    id: 'asteroids',
    year: 1979,
    title: 'Inertia and wraparound',
    games: ['Asteroids (1979)'],
    essence: 'The ship turns in place, thrusts and keeps drifting after it stops. Shooting a big rock splits it into small ones, and everything wraps around the screen edges.',
    channels: { agent: 'ship, shots (dim)', enemy: 'big rocks (2x2), small rocks' },
    fps: 7, maxTicks: 500, warmup: 4,
    init(r) {
      const ship = { x: 4.5 + r.f(), y: 4.5 + r.f(), vx: 0, vy: 0, dir: r.i(8), cool: 0 };
      const rocks = [];
      while (rocks.length < 3) {
        const x = r.f() * 10, y = r.f() * 10;
        if (Math.hypot(wrapd(x + 1 - ship.x, 10), wrapd(y + 1 - ship.y, 10)) < 3.5) continue;
        if (rocks.some((k) => Math.hypot(wrapd(k.x - x, 10), wrapd(k.y - y, 10)) < 3)) continue;
        const a = r.f() * Math.PI * 2, v = 0.1 + r.f() * 0.12;
        rocks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, big: true });
      }
      return { ship, rocks, shots: [], thrust: false, result: null };
    },
    tick(s, r) {
      const sh = s.ship;
      const rel = (k) => {
        const c = k.big ? 1 : 0.5;
        return [wrapd(k.x + c - sh.x, 10), wrapd(k.y + c - sh.y, 10)];
      };
      s.thrust = false;
      sh.cool--;
      // threat: a rock that is close and closing in
      let threat = null, aim = null, ad = Infinity;
      for (const k of s.rocks) {
        const [dx, dy] = rel(k), d = Math.hypot(dx, dy);
        const closing = dx * (k.vx - sh.vx) + dy * (k.vy - sh.vy) < 0;
        if (d < (k.big ? 2.4 : 1.8) && closing) threat = [dx, dy];
        if (d < ad) { ad = d; aim = k; }
      }
      if (threat && r.chance(0.85)) {
        const away = dir8(-threat[0] - threat[1] * 0.5, -threat[1] + threat[0] * 0.5);
        sh.dir = turn8(sh.dir, away, 2);
        if (sh.dir === away) s.thrust = true;
      } else if (aim) {
        let [dx, dy] = rel(aim);
        const tt = ad / 1.0;
        dx += (aim.vx - sh.vx) * tt; dy += (aim.vy - sh.vy) * tt;
        const want = dir8(dx, dy);
        sh.dir = turn8(sh.dir, want);
        if (sh.dir === want && sh.cool <= 0 && ad < 6 && r.chance(0.8)) {
          const [ux, uy] = UNIT8[sh.dir];
          s.shots.push({ x: sh.x + ux * 0.5, y: sh.y + uy * 0.5, vx: sh.vx + ux, vy: sh.vy + uy, life: 6 });
          sh.cool = 2;
        } else if (ad > 3 && sh.dir === want && Math.hypot(sh.vx, sh.vy) < 0.35 && r.chance(0.35)) s.thrust = true;
      }
      if (s.thrust) { sh.vx += UNIT8[sh.dir][0] * 0.14; sh.vy += UNIT8[sh.dir][1] * 0.14; }
      sh.vx *= 0.96; sh.vy *= 0.96;
      const sp = Math.hypot(sh.vx, sh.vy);
      if (sp > 0.6) { sh.vx *= 0.6 / sp; sh.vy *= 0.6 / sp; }
      sh.x = wrapv(sh.x + sh.vx, 10); sh.y = wrapv(sh.y + sh.vy, 10);
      for (const k of s.rocks) { k.x = wrapv(k.x + k.vx, 10); k.y = wrapv(k.y + k.vy, 10); }
      // shots, two half steps so they do not skip over a rock
      for (const t of s.shots) {
        for (let k = 0; k < 2 && t.life > 0; k++) {
          t.x = wrapv(t.x + t.vx * 0.5, 10); t.y = wrapv(t.y + t.vy * 0.5, 10);
          const i = s.rocks.findIndex((rk) => rockHas(rk, Math.floor(t.x), Math.floor(t.y)));
          if (i < 0) continue;
          const rk = s.rocks[i];
          s.rocks.splice(i, 1);
          t.life = 0;
          if (rk.big) {
            for (const sgn of [-1, 1]) {
              const a = Math.atan2(rk.vy, rk.vx) + sgn * (0.8 + r.f() * 0.6), v = 0.18 + r.f() * 0.12;
              s.rocks.push({ x: wrapv(rk.x + (sgn > 0 ? 1 : 0), 10), y: wrapv(rk.y + (sgn > 0 ? 1 : 0), 10), vx: Math.cos(a) * v, vy: Math.sin(a) * v, big: false });
            }
          }
        }
        t.life--;
      }
      s.shots = s.shots.filter((t) => t.life > 0);
      if (s.rocks.some((k) => rockHas(k, Math.floor(sh.x), Math.floor(sh.y)))) { s.result = 'loss'; return 'done'; }
      if (!s.rocks.length) { s.result = 'win'; return 'done'; }
    },
    draw(s, g) {
      for (const k of s.rocks) {
        const x = Math.floor(k.x), y = Math.floor(k.y), n = k.big ? 2 : 1;
        for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) g.cell(wrapv(x + i, 10), wrapv(y + j, 10), 'enemy');
      }
      for (const t of s.shots) g.cell(t.x, t.y, 'agent', DIM);
      g.cell(s.ship.x, s.ship.y, s.result === 'loss' ? 'enemy' : 'agent');
    },
  });

  // ---------------------------------------------------------------- lander
  add({
    id: 'lander',
    year: 1979,
    title: 'Soft landing',
    games: ['Lunar Lander (1979)'],
    essence: 'Gravity pulls the lander down. Short burns slow the fall and push it sideways, and it survives only if it touches the pad gently.',
    channels: { agent: 'lander, flame (dim)', reward: 'landing pad (dim until landed)', wall: 'terrain' },
    fps: 7, maxTicks: 300, hold: 8, warmup: 3,
    init(r) {
      const top = [];
      let h = r.range(1, 3);
      for (let x = 0; x < 10; x++) { h = clamp(h + r.pick([-1, 0, 1, 1]) * (r.chance(0.7) ? 1 : 0), 1, 5); top.push(10 - h); }
      const pad = r.range(0, 7), py = r.range(7, 9);
      for (let x = pad; x < pad + 3; x++) top[x] = py;
      for (let x = 0; x < 10; x++) top[x] = Math.max(top[x], 5);
      let x = r.f() * 9.5;
      while (Math.abs(x - (pad + 1.5)) < 3) x = r.f() * 9.5;
      const vx = (pad + 1.5 > x ? 1 : -1) * (0.05 + r.f() * 0.2) * (r.chance(0.3) ? -1 : 1);
      return { top, pad, x, y: 0.2, vx, vy: 0.05, fuel: 26, burn: false, result: null };
    },
    tick(s, r) {
      const G = 0.035, tx = s.pad + 1.5, ex = tx - s.x;
      const col = (x) => clamp(Math.floor(x), 0, 9);
      // altitude over the highest ground between here and the pad
      let ground = s.top[s.pad];
      for (let x = Math.min(col(s.x), s.pad); x <= Math.max(col(s.x), s.pad + 2); x++) ground = Math.min(ground, s.top[x]);
      const over = Math.abs(ex) < 1.1;
      const alt = (over ? s.top[s.pad] : ground - 1.5) - 1 - s.y;
      const vyT = over ? clamp(0.1 + alt * 0.06, 0.1, 0.45) : clamp(alt * 0.08, -0.15, 0.3);
      const vxT = clamp(ex * 0.12, -0.3, 0.3);
      s.burn = false;
      let side = 0;
      if (s.fuel > 0 && r.chance(0.8)) {
        if (s.vy > vyT) { s.burn = true; s.fuel--; }
        if (Math.abs(vxT - s.vx) > 0.03) { side = sign(vxT - s.vx); s.fuel -= 0.5; }
      }
      s.vy += G - (s.burn ? 0.075 * (0.7 + r.f() * 0.6) : 0);
      s.vx += side * 0.03 + (r.chance(0.15) ? (r.f() - 0.5) * 0.14 : 0);
      const nx = clamp(s.x + s.vx, 0, 9.99), ny = Math.max(0, s.y + s.vy);
      if (nx === 0 || nx === 9.99) s.vx = 0;
      // touchdown or a side crash into higher ground
      const c = col(nx);
      if (Math.floor(ny) >= s.top[c]) {
        if (Math.floor(s.y) >= s.top[c]) { s.result = 'crash'; return 'done'; }   // flew into a cliff
        s.x = nx;
        s.y = s.top[c] - 1;
        const soft = s.vy <= 0.32 && Math.abs(s.vx) <= 0.2;
        s.result = c >= s.pad && c < s.pad + 3 && soft ? 'landed' : 'crash';
        return 'done';
      }
      s.x = nx; s.y = ny;
    },
    draw(s, g) {
      for (let x = 0; x < 10; x++) {
        for (let y = s.top[x]; y < 10; y++) g.cell(x, y, 'wall');
        if (x >= s.pad && x < s.pad + 3) g.cell(x, s.top[x], 'reward', s.result === 'landed' ? 1 : DIM);
      }
      const x = Math.floor(s.x), y = Math.floor(s.y);
      if (s.burn && y + 1 < s.top[x]) g.cell(x, y + 1, 'agent', DIM);
      g.cell(x, y, s.result === 'crash' ? 'enemy' : 'agent');
    },
  });
})();
