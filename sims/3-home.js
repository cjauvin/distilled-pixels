/* Home era: mechanics from 1985 to 1997. */
(function () {
  'use strict';
  const { add, bfs, distField, DIRS4, DIRS8, clamp, sign, DIM } = Atlas;

  /* ------------------------------------------------------------------ danmaku */

  const DM = 12;
  add({
    id: 'danmaku',
    year: 1995,
    title: 'Bullet patterns',
    games: ['Batsugun (1993)', 'DonPachi (1995)', 'Touhou Project (1997)'],
    essence: 'A boss fills the screen with rings, spirals and aimed bursts of slow bullets. You weave through the gaps, one touch ends the run, and you chip away at its health from below.',
    channels: { agent: 'ship, shots (dim)', enemy: 'boss, bullets (dim)' },
    w: DM, h: DM,
    fps: 8,
    hold: 10,
    warmup: 16,
    maxTicks: 400,
    init(r) {
      return { bx: r.range(3, 8), bdir: r.pick([-1, 1]), hp: 30, max: 30, me: [r.range(3, 8), 10], bullets: [], shots: [],
        t: 0, order: r.shuffle(['ring', 'spiral', 'aimed']), ang: r.f() * 6.28, dead: false, care: 0.01 + r.f() * 0.035 };
    },
    tick(s, r) {
      s.t++;
      // agent: pick the move that keeps the most room over a short lookahead
      const D = 3, occ = [];
      for (let k = 1; k <= D; k++) {
        const o = new Uint8Array(DM * DM);
        for (const b of s.bullets) {
          const x = Math.round(b.x + b.vx * k), y = Math.round(b.y + b.vy * k);
          if (x >= 0 && y >= 0 && x < DM && y < DM) o[y * DM + x] = 1;
        }
        occ.push(o);
      }
      const ok = (x, y, k) => x >= 0 && x < DM && y >= 6 && y < DM && !occ[k - 1][y * DM + x];
      const moves = DIRS4.concat([[0, 0]]);
      let best = s.me, bs = -Infinity;
            for (const [dx, dy] of moves) {
        const x0 = s.me[0] + dx, y0 = s.me[1] + dy;
        if (!ok(x0, y0, 1)) continue;
        let set = [[x0, y0]], depth = 1;
        for (let k = 2; k <= D && set.length; k++) {
          const seen = new Set(), nxt = [];
          for (const [x, y] of set) for (const [ex, ey] of moves) {
            const nx = x + ex, ny = y + ey, key = ny * DM + nx;
            if (!seen.has(key) && ok(nx, ny, k)) { seen.add(key); nxt.push([nx, ny]); }
          }
          set = nxt;
          if (set.length) depth = k;
        }
        let close = 0;
        for (const b of s.bullets) if (Math.abs(b.x - x0) + Math.abs(b.y - y0) <= 2) close++;
        const sc = depth * 100 - Math.abs(x0 - s.bx) * 3 - Math.abs(y0 - 10) * 2 - close * 6 + r.f();
        if (sc > bs) { bs = sc; best = [x0, y0]; }
      }
      // now and then a slow reaction: the ship drifts instead of dodging
      if (r.chance(s.care)) best = r.pick(moves.map(([dx, dy]) => [clamp(s.me[0] + dx, 0, DM - 1), clamp(s.me[1] + dy, 6, DM - 1)]));
      s.me = best;

      // boss drifts and fires the current pattern
      if (s.t % 4 === 0) {
        if (r.chance(0.25) || s.bx + s.bdir < 2 || s.bx + s.bdir > DM - 3) s.bdir = -s.bdir;
        s.bx += s.bdir;
      }
      const pat = s.order[Math.floor(s.t / 40) % 3];
      const shoot = (a, sp) => s.bullets.push({ x: s.bx, y: 2, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp });
      if (pat === 'ring' && s.t % 6 === 0) {
        s.ang += 0.26;
        for (let k = 0; k < 14; k++) shoot(s.ang + (k * Math.PI * 2) / 14, 0.42);
      } else if (pat === 'spiral') {
        s.ang += 0.45;
        for (let k = 0; k < 3; k++) shoot(s.ang + (k * Math.PI * 2) / 3, 0.4);
      } else if (pat === 'aimed' && s.t % 4 === 0) {
        const a = Math.atan2(s.me[1] - 2, s.me[0] - s.bx);
        for (const d of [-0.4, -0.2, 0, 0.2, 0.4]) shoot(a + d, 0.5);
      }
      for (const b of s.bullets) { b.x += b.vx; b.y += b.vy; }
      s.bullets = s.bullets.filter((b) => b.x > -0.5 && b.y > -0.5 && b.x < DM - 0.5 && b.y < DM - 0.5);

      // shots fly up and chip the boss
      for (const sh of s.shots) sh[1]--;
      s.shots = s.shots.filter((sh) => {
        if (sh[1] <= 1 && Math.abs(sh[0] - s.bx) <= 1) { s.hp--; return false; }
        return sh[1] >= 0;
      });
      if (s.t % 2 === 0 && Math.abs(s.me[0] - s.bx) <= 2) s.shots.push([s.me[0], s.me[1] - 1]);

      if (s.bullets.some((b) => Math.round(b.x) === s.me[0] && Math.round(b.y) === s.me[1])) { s.dead = true; return 'done'; }
      if (s.hp <= 0) return 'done';
    },
    draw(s, g) {
      const down = s.hp <= 0;
      g.rect(s.bx - 1, 1, 3, 1, 'enemy', down ? DIM : 1);
      g.cell(s.bx, 0, 'enemy', down ? DIM : 1);
      for (const [x, y] of s.shots) g.cell(x, y, 'agent', DIM);
      for (const b of s.bullets) {
        const x = Math.round(b.x), y = Math.round(b.y);
        if (!g.get(x, y) || g.get(x, y).kind !== 'enemy') g.cell(x, y, 'enemy', DIM);
      }
      g.cell(s.me[0], s.me[1], s.dead ? 'enemy' : 'agent');
    },
  });

  /* ------------------------------------------------------------------- rhythm */

  const LANES = [1, 3, 6, 8];
    const HIT_Y = 8;

  add({
    id: 'rhythm',
    year: 1997,
    title: 'Rhythm lanes',
    games: ['Beatmania (1997)', 'Dance Dance Revolution (1998)', 'Guitar Hero (2005)'],
    essence: 'Notes scroll down four lanes toward a fixed line. Press the matching key the moment each one arrives; a note that slips past the line is a miss.',
    channels: { agent: 'pressed receptors (dim = idle)', reward: 'notes, hits', enemy: 'misses', wall: 'lanes (dim)' },
    fps: 8,
    hold: 8,
    warmup: 12,
    maxTicks: 320,
    init(r) {
      // chart: a note or chord on most beats, with short runs of off-beats
      const chart = [];
      let last = -1;
      for (let t = 0; t < 130; t += 2) {
        const run = Math.floor(t / 16) % 4 === 3;
        for (const off of run ? [0, 1] : [0]) {
          if (!r.chance(run ? 0.8 : 0.78)) continue;
          let lane = r.i(4);
          if (lane === last && r.chance(0.6)) lane = (lane + 1 + r.i(3)) % 4;
          last = lane;
          chart.push({ t: t + off, lane, hard: run });
          if (!run && r.chance(0.12)) chart.push({ t, lane: (lane + 2) % 4, hard: true });
        }
      }
      return { chart, notes: [], t: 0, ci: 0, flash: [0, 0, 0, 0], pressed: [0, 0, 0, 0], misses: [], hits: 0, total: 0, skill: 0.88 + r.f() * 0.08 };
    },
    tick(s, r) {
      s.t++;
      s.pressed = s.pressed.map((v) => Math.max(0, v - 1));
      s.flash = s.flash.map((v) => Math.max(0, v - 1));
      s.misses = s.misses.filter((m) => ++m.y <= 9 + 0);
      while (s.ci < s.chart.length && s.chart[s.ci].t <= s.t) s.notes.push(Object.assign({ y: 0 }, s.chart[s.ci++]));
      for (const n of s.notes) n.y++;
      s.notes = s.notes.filter((n) => {
        if (n.y < HIT_Y) return true;
        s.total++;
        if (r.chance(n.hard ? s.skill - 0.06 : s.skill)) {
          s.hits++;
          s.pressed[n.lane] = 1;
          s.flash[n.lane] = 2;
        } else {
          s.misses.push({ lane: n.lane, y: HIT_Y });
          if (r.chance(0.5)) s.pressed[n.lane] = 1;
        }
        return false;
      });
      if (s.ci >= s.chart.length && !s.notes.length && !s.misses.length) return 'done';
    },
    draw(s, g) {
      LANES.forEach((x, k) => {
        for (let y = 0; y < HIT_Y; y++) g.cell(x, y, 'wall', DIM);
        if (s.flash[k]) g.cell(x, HIT_Y, 'reward');
        else g.cell(x, HIT_Y, 'agent', s.pressed[k] ? 1 : DIM);
      });
      for (const n of s.notes) g.cell(LANES[n.lane], n.y, 'reward');
      for (const m of s.misses) {
        if (m.y > 9) continue;
        g.cell(LANES[m.lane], m.y, 'enemy');
      }
    },
  });
})();
