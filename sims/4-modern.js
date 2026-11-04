/* Modern era: mechanics from 2000 on. */
(function () {
  'use strict';
  const { add, bfs, distField, clamp, sign, inb, DIRS4, DIRS8 } = Atlas;

  const cheb = (ax, ay, bx, by) => Math.max(Math.abs(ax - bx), Math.abs(ay - by));

  /* ---------------------------------------------------------------- flappy */

  const FB = 2, FG = 0.32, FLAP = -1.05, FGAP = 3, FSP = 5, F_GOAL = 10;

  function fStep(y, vy, flap) {
    vy = flap ? FLAP : Math.min(vy + FG, 1.3);
    y += vy;
    if (y < 0) { y = 0; vy = 0; }
    return [y, vy];
  }
  // is the bird dead at height y, k ticks from now?
  function fHit(pipes, k, y) {
    const row = Math.round(y);
    if (row >= 9) return true;
    for (const p of pipes) if (p.x - k === FB && (row < p.gap || row >= p.gap + FGAP)) return true;
    return false;
  }

  add({
    id: 'flappy',
    year: 2013,
    title: 'Flap through gaps',
    games: ['Jetpack Joyride (2011)', 'Flappy Bird (2013)'],
    essence: 'Gravity pulls the bird down and each tap gives it a fixed upward kick. Columns scroll in from the right, and the only input is when to tap to pass each gap.',
    channels: { agent: 'bird (dim = recent path)', reward: 'gaps passed (dim = next gap)', wall: 'columns, ground (dim)' },
    fps: 7,
    maxTicks: 400,
    warmup: 6,
    init(r) {
      const pipes = [{ x: 7, gap: r.range(1, 5) }];
      while (pipes[pipes.length - 1].x < 9 + FSP) {
        const last = pipes[pipes.length - 1];
        pipes.push({ x: last.x + FSP, gap: clamp(last.gap + r.range(-3, 3), 1, 5) });
      }
      return { y: 4, vy: 0, pipes, trail: [4, 4], flap: false, score: 0, dead: false, t: 0, slip: 0.012 + r.f() * 0.03 };
    },
    tick(s, r) {
      s.t++;
      const next = s.pipes.find((p) => p.x >= FB);
      const target = next ? next.gap + 1 : 4;
      const depth = 8;
      const rec = (y, vy, k) => {
        if (k === depth) return -Math.abs(y - target);
        let b = -1e9;
        for (const f of [false, true]) {
          const [ny, nvy] = fStep(y, vy, f);
          if (fHit(s.pipes, k + 1, ny)) continue;
          b = Math.max(b, rec(ny, nvy, k + 1) - (f ? 0.05 : 0));
        }
        return b === -1e9 ? -1000 + k : b;
      };
      const val = (f) => {
        const [ny, nvy] = fStep(s.y, s.vy, f);
        return fHit(s.pipes, 1, ny) ? -2000 : rec(ny, nvy, 1) - (f ? 0.05 : 0);
      };
      let flap = val(true) > val(false);
      if (r.chance(s.slip * Math.min(1, s.score / 4))) flap = !flap; // a mistimed tap, likelier as it drags on
      s.flap = flap;
      s.trail = [Math.round(s.y), s.trail[0]];
      [s.y, s.vy] = fStep(s.y, s.vy, flap);
      for (const p of s.pipes) {
        p.x--;
        if (p.x === FB - 1) s.score++;
      }
      if (s.pipes[0].x < 0) s.pipes.shift();
      const last = s.pipes[s.pipes.length - 1];
      if (last.x <= 9 + FSP - FSP) s.pipes.push({ x: last.x + FSP, gap: clamp(last.gap + r.range(-3, 3), 1, 5) });
      if (fHit(s.pipes, 0, s.y)) { s.dead = true; return 'done'; }
      if (s.score >= F_GOAL) return 'done';
    },
    draw(s, g) {
      for (let x = 0; x < 10; x++) g.cell(x, 9, x < s.score ? 'reward' : 'wall', x < s.score ? 1 : Atlas.DIM);
      s.trail.forEach((y, k) => g.cell(FB - 1 - k, clamp(y, 0, 8), 'agent', Atlas.DIM));
      const next = s.pipes.find((p) => p.x >= FB);
      for (const p of s.pipes) {
        if (p.x > 9) continue;
        for (let y = 0; y < 9; y++) {
          if (y < p.gap || y >= p.gap + FGAP) g.cell(p.x, y, 'wall');
          else if (p === next) g.cell(p.x, y, 'reward', Atlas.DIM);
        }
      }
      const by = clamp(Math.round(s.y), 0, 9);
      g.cell(FB, by, s.dead ? 'enemy' : 'agent');
    },
  });

  /* ------------------------------------------------------------------ agar */

  const AW = 12;
  const aSide = (m) => (m < 4 ? 1 : m < 11 ? 2 : 3);
  const gap1 = (a0, as, b0, bs) => Math.max(0, b0 - (a0 + as - 1), a0 - (b0 + bs - 1));
  const eats = (a, b) => a.m >= b.m * 1.25; // a clear size edge is needed to swallow

  function agarScore(s, b, nx, ny, sd, hunt, wary) {
    let threat = 0, prey = 0, pel = 0;
    const reach = wary ? 99 : 2;
    for (const o of s.blobs) {
      if (o === b || !o.alive) continue;
      const os = aSide(o.m), d = Math.max(gap1(nx, sd, o.x, os), gap1(ny, sd, o.y, os));
      if (eats(o, b) || (wary && o.m > b.m * 1.05)) {
        // the cautious agent looks further, since the threat moves right after it does
        threat += wary ? (d < 7 ? [200, 100, 25, 8, 3, 1, 0.4][d] : 0) : d < 3 ? [100, 25, 8][d] : 0;
      }
      else if (eats(b, o) && d <= reach && (wary || o.me)) prey = Math.max(prey, (hunt * (o.m + 1)) / (d + 1));
    }
    let dp = 99;
    for (const i of s.pellets) {
      const d = Math.max(gap1(nx, sd, i % AW, 1), gap1(ny, sd, (i / AW) | 0, 1));
      if (d < dp) dp = d;
    }
    pel = (wary ? 3 : 1.6) / (dp + 1);
    const edge = wary * ((nx === 0 || nx === AW - sd ? 1 : 0) + (ny === 0 || ny === AW - sd ? 1 : 0)) * (threat ? 1.5 : 0.4);
    const mid = wary * 0.25 * Math.max(Math.abs(nx + sd / 2 - AW / 2), Math.abs(ny + sd / 2 - AW / 2));
    return Math.max(prey, pel) - threat - edge - mid;
  }

  add({
    id: 'agar',
    year: 2015,
    title: 'Eat smaller, grow',
    games: ['Feeding Frenzy (2004)', 'Agar.io (2015)'],
    essence: 'Touch anything clearly smaller to swallow it and grow, but anything bigger can swallow you. Growing also makes you slower, so prey and predator keep trading places.',
    channels: { agent: 'your blob', enemy: 'bigger blobs (dim = too close in size to eat you)', reward: 'smaller blobs (dim = not yet edible), pellets' },
    w: AW, h: AW,
    fps: 6,
    maxTicks: 500,
    warmup: 6,
    init(r) {
      const blobs = [];
      const fits = (x, y, sd, k) => blobs.every((o) => {
        const os = aSide(o.m);
        return Math.max(gap1(x, sd, o.x, os), gap1(y, sd, o.y, os)) >= (o.me && k < 150 ? 4 : 2);
      });
      const put = (m, me) => {
        const sd = aSide(m);
        for (let k = 0; k < 300; k++) {
          const x = me ? r.range(4, 7) : r.range(0, AW - sd), y = me ? r.range(4, 7) : r.range(0, AW - sd);
          if (fits(x, y, sd, k)) { blobs.push({ x, y, m, me, alive: true }); return; }
        }
      };
      put(3, true);
      for (const m of [10, 3, 2, 1, 1]) put(m, false);
      const s = { blobs, pellets: new Set(), t: 0, dead: false, won: false };
      for (let k = 0; k < 8; k++) s.pellets.add(r.i(AW * AW));
      return s;
    },
    tick(s, r) {
      s.t++;
      const me = s.blobs[0];
      for (const b of s.blobs) {
        if (!b.alive) continue;
        const sd = aSide(b.m);
        b.acc = (b.acc || 0) + Math.min(1, 1.5 / (1 + b.m / 8)); // heavier is slower
        if (b.acc < 1) continue;
        b.acc -= 1;
        let best = null, bs = -Infinity;
        for (const [dx, dy] of [[0, 0], ...DIRS8]) {
          const nx = b.x + dx, ny = b.y + dy;
          if (nx < 0 || ny < 0 || nx > AW - sd || ny > AW - sd) continue;
          const sc = agarScore(s, b, nx, ny, sd, b.me ? 1.2 : 0.45, b.me ? 1 : 0) + r.f() * (b.me ? 0.25 : 1.2);
          if (sc > bs) { bs = sc; best = [nx, ny]; }
        }
        [b.x, b.y] = best;
      }
      // swallow: bigger first
      const live = s.blobs.filter((b) => b.alive).sort((a, b) => b.m - a.m);
      for (const a of live) {
        if (!a.alive) continue;
        const as = aSide(a.m);
        for (const o of live) {
          if (o === a || !o.alive || !eats(a, o)) continue;
          const os = aSide(o.m);
          if (Math.max(gap1(a.x, as, o.x, os), gap1(a.y, as, o.y, os)) === 0) { a.m += o.m; o.alive = false; }
        }
        const sd = aSide(a.m);
        for (const i of [...s.pellets]) {
          const px = i % AW, py = (i / AW) | 0;
          if (px >= a.x && px < a.x + sd && py >= a.y && py < a.y + sd) { a.m += a.me && a.m < 5 ? 1 : 0.5; s.pellets.delete(i); }
        }
        if (s.t % 8 === 0 && a.m > 8) a.m--; // big blobs slowly shed mass
        const ns = aSide(a.m);
        a.x = Math.min(a.x, AW - ns);
        a.y = Math.min(a.y, AW - ns);
      }
      if (!me.alive) { s.dead = true; return 'done'; }
      if (s.pellets.size < 8 && s.t % 2 === 0) {
        const i = r.i(AW * AW), px = i % AW, py = (i / AW) | 0;
        if (s.blobs.every((b) => !b.alive || px < b.x || py < b.y || px >= b.x + aSide(b.m) || py >= b.y + aSide(b.m))) s.pellets.add(i);
      }
      const rivals = s.blobs.filter((b) => b.alive && !b.me);
      if (rivals.length < 5 && s.t % 6 === 0) {
        const edge = r.i(AW), side = r.i(4);
        const x = side === 0 ? 0 : side === 1 ? AW - 1 : edge, y = side === 2 ? 0 : side === 3 ? AW - 1 : edge;
        if (Math.abs(x - me.x) + Math.abs(y - me.y) > 4) s.blobs.push({ x, y, m: r.range(1, 2), me: false, alive: true });
      }
      if (rivals.every((b) => b.m < me.m)) { s.won = true; return 'done'; }
      s.blobs = s.blobs.filter((b) => b.alive || b.me);
    },
    draw(s, g) {
      for (const i of s.pellets) g.cell(i % AW, (i / AW) | 0, 'reward');
      const me = s.blobs[0];
      const order = s.blobs.filter((b) => b.alive && !b.me).sort((a, b) => a.m - b.m);
      for (const b of order) {
        const sd = aSide(b.m);
        const kind = b.m >= me.m ? 'enemy' : 'reward';
        g.rect(b.x, b.y, sd, sd, kind, eats(b, me) || eats(me, b) ? 1 : Atlas.DIM);
      }
      const sd = aSide(me.m);
      if (me.alive) g.rect(me.x, me.y, sd, sd, 'agent');
      else g.cell(me.x, me.y, 'enemy');
    },
  });


  /* ------------------------------------------------------------- survivors */

  const SW = 12, S_TIME = 210;
  const S_NEED = [0, 3, 8, 15, 24, 35, 48, 64, 84];
  // the ring two cells out from the survivor, clockwise
  const RING2 = [];
  for (let k = -2; k < 2; k++) RING2.push([2, k]);
  for (let k = 2; k > -2; k--) RING2.push([k, 2]);
  for (let k = 2; k > -2; k--) RING2.push([-2, k]);
  for (let k = -2; k < 2; k++) RING2.push([k, -2]);
  const sOrbs = (lvl) => (lvl >= 6 ? 3 : lvl >= 4 ? 2 : lvl >= 2 ? 1 : 0);
  const sCooldown = (lvl) => (lvl >= 5 ? 2 : lvl >= 3 ? 3 : 4);

  add({
    id: 'survivors',
    year: 2021,
    title: 'Auto-attack survival',
    games: ['Vampire Survivors (2021)'],
    essence: 'You only steer. Weapons fire on their own while an ever-growing swarm closes in, and the gems that kills leave behind level you up into more and faster weapons.',
    channels: { agent: 'survivor (blinks when hit) (dim = shots, orbiting blades)', enemy: 'swarm', reward: 'gems' },
    w: SW, h: SW,
    fps: 7,
    maxTicks: 400,
    warmup: 12,
    init(r) {
      return {
        x: 5 + r.i(2), y: 5 + r.i(2), hp: 3, inv: 0, lvl: 1, xp: 0, up: 0, orb: r.i(16),
        foes: [], gems: new Set(), shots: [], t: 0, dead: false,
      };
    },
    tick(s, r) {
      s.t++;
      if (s.inv) s.inv--;
      if (s.up) s.up--;
      const at = (x, y) => s.foes.findIndex((f) => f.x === x && f.y === y);
      const kill = (k) => { const f = s.foes[k]; s.gems.add(f.y * SW + f.x); s.foes.splice(k, 1); };
      const orbCells = () => {
        const n = sOrbs(s.lvl), out = [];
        for (let k = 0; k < n; k++) {
          const [dx, dy] = RING2[(s.orb + Math.round((k * 16) / n)) % 16];
          out.push([s.x + dx, s.y + dy]);
        }
        return out;
      };
      const sweep = () => {
        for (const [x, y] of orbCells()) { const k = at(x, y); if (k >= 0) kill(k); }
      };

      // the swarm spawns at the edges, faster as time goes on
      s.spawn = (s.spawn || 0) + 0.4 + s.t / 110;
      if (s.foes.length < 48) {
        for (; s.spawn >= 1; s.spawn--) {
          const e = r.i(SW), side = r.i(4);
          const x = side === 0 ? 0 : side === 1 ? SW - 1 : e, y = side === 2 ? 0 : side === 3 ? SW - 1 : e;
          if (cheb(x, y, s.x, s.y) >= 4 && at(x, y) < 0) s.foes.push({ x, y, ph: r.i(3), fast: s.t > 80 && r.chance(0.35) });
        }
      }

      // steer: keep the swarm out of reach, drift toward gems, stay off the edges
      let best = [s.x, s.y], bs = -Infinity, gem = null, gd = 99;
      for (const i of s.gems) {
        const d = cheb(i % SW, (i / SW) | 0, s.x, s.y);
        if (d < gd) { gd = d; gem = [i % SW, (i / SW) | 0]; }
      }
      for (const [dx, dy] of [[0, 0], ...DIRS8]) {
        const x = s.x + dx, y = s.y + dy;
        if (!inb(SW, SW, x, y)) continue;
        let sc = 0;
        for (const f of s.foes) {
          const d = cheb(x, y, f.x, f.y);
          sc -= d === 0 ? 100 : d === 1 ? 9 : d === 2 ? 1.5 : d === 3 ? 0.3 : 0;
        }
        if (gem) sc += 4 / (cheb(x, y, gem[0], gem[1]) + 1);
        sc -= Math.max(0, cheb(x, y, 5.5, 5.5) - 2.5) ** 2; // open ground beats corners
        sc += r.f() * 0.3;
        if (sc > bs) { bs = sc; best = [x, y]; }
      }
      [s.x, s.y] = best;
      const ka = at(s.x, s.y);
      if (ka >= 0) kill(ka);

      // weapons fire on their own: blades sweep the ring, shots seek the nearest foe
      for (let k = 0; k < 2; k++) { s.orb = (s.orb + 1) % 16; sweep(); }
      if (s.t % sCooldown(s.lvl) === 0) {
        let tgt = null, td = 8;
        for (const f of s.foes) {
          const d = cheb(f.x, f.y, s.x, s.y);
          if (d < td) { td = d; tgt = f; }
        }
        if (tgt) {
          const dx = tgt.x - s.x, dy = tgt.y - s.y, len = Math.max(Math.abs(dx), Math.abs(dy));
          s.shots.push({ x: s.x, y: s.y, vx: dx / len, vy: dy / len, life: 4 });
        }
      }
      for (const sh of s.shots) {
        for (let k = 0; k < 2 && sh.life > 0; k++) {
          sh.x += sh.vx; sh.y += sh.vy;
          const cx = Math.round(sh.x), cy = Math.round(sh.y);
          if (!inb(SW, SW, cx, cy)) { sh.life = 0; break; }
          const hit = at(cx, cy);
          if (hit >= 0) { kill(hit); sh.life = 0; }
        }
        sh.life--;
      }
      s.shots = s.shots.filter((sh) => sh.life > 0);

      // the swarm homes in at half speed
      for (let k = s.foes.length - 1; k >= 0; k--) {
        const f = s.foes[k];
        if (f.fast ? (s.t + f.ph) % 3 === 0 : (s.t + f.ph) % 2) continue; // later waves bring faster ones
        const dx = sign(s.x - f.x), dy = sign(s.y - f.y);
        for (const [mx, my] of [[dx, dy], [dx, 0], [0, dy]]) {
          if (!mx && !my) continue;
          const x = f.x + mx, y = f.y + my;
          if (x === s.x && y === s.y) {
            if (!s.inv) { s.hp--; s.inv = 6; s.foes.splice(k, 1); }
            break;
          }
          if (at(x, y) >= 0) continue;
          f.x = x; f.y = y;
          break;
        }
      }
      if (s.hp <= 0) { s.dead = true; return 'done'; }
      sweep();

      // gems within reach
      for (const i of [...s.gems]) {
        if (cheb(i % SW, (i / SW) | 0, s.x, s.y) <= 1) {
          s.gems.delete(i);
          if (++s.xp >= S_NEED[s.lvl] && s.lvl < S_NEED.length - 1) { s.lvl++; s.up = 3; }
        }
      }
      if (s.t >= S_TIME) return 'done';
    },
    draw(s, g) {
      for (const i of s.gems) g.cell(i % SW, (i / SW) | 0, 'reward');
      for (const f of s.foes) g.cell(f.x, f.y, 'enemy');
      for (const sh of s.shots) {
        const x = Math.round(sh.x), y = Math.round(sh.y);
        if (inb(SW, SW, x, y)) g.cell(x, y, 'agent', Atlas.DIM);
      }
      const n = sOrbs(s.lvl);
      for (let k = 0; k < n; k++) {
        const [dx, dy] = RING2[(s.orb + Math.round((k * 16) / n)) % 16];
        if (inb(SW, SW, s.x + dx, s.y + dy)) g.cell(s.x + dx, s.y + dy, 'agent', Atlas.DIM);
      }
      if (s.dead) g.cell(s.x, s.y, 'enemy');
      else g.cell(s.x, s.y, 'agent', s.inv % 2 ? Atlas.DIM : 1);
    },
  });
})();
