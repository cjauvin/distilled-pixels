/*
 * Grid Mechanics engine.
 *
 * Every mechanic is a tiny simulation on a small grid, drawn with one shared
 * visual vocabulary of five channels:
 *
 *   agent   yellow  the thing the player controls
 *   enemy   red     hazards, opponents, moving threats
 *   reward  green   targets, goals, pickups, things worth reaching
 *   object  blue    neutral things: pushable, falling, carried, built
 *   wall    gray    static terrain and boundaries
 *
 * Each channel has exactly two shades: full, and dim (pass any a < 1, by
 * convention Atlas.DIM). Dim is a weaker or residual version of the channel:
 * a trail, a body segment, a projectile, a remembered or partial state.
 * Cells are plain coloured squares; there is nothing else to draw.
 *
 * Works both in the browser (window.Atlas) and in node (module.exports).
 */
(function (root) {
  'use strict';

  const PALETTE = {
    wall: '#4d545d',
    agent: '#f2c14e',
    enemy: '#e5625c',
    reward: '#7cc46a',
    object: '#5aa7e3',
  };
  // dim shades: each colour mixed halfway toward black
  const DIM_PALETTE = {
    wall: '#2b2f34',
    agent: '#7d6429',
    enemy: '#77352f',
    reward: '#41663a',
    object: '#305775',
  };
  const DIM = 0.5;
  const KINDS = Object.keys(PALETTE);

  // Seeded PRNG (mulberry32) with small conveniences.
  function rng(seed) {
    let s = seed >>> 0 || 1;
    const f = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    return {
      f,
      i: (n) => Math.floor(f() * n),
      range: (a, b) => a + Math.floor(f() * (b - a + 1)),
      chance: (p) => f() < p,
      pick: (arr) => arr[Math.floor(f() * arr.length)],
      shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
          const j = Math.floor(f() * (i + 1));
          [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
      },
    };
  }

  const DIRS4 = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const DIRS8 = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sign = (v) => (v > 0 ? 1 : v < 0 ? -1 : 0);
  const inb = (w, h, x, y) => x >= 0 && y >= 0 && x < w && y < h;
  const manhattan = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]);

  // Shortest path from start to the first cell where isGoal(x, y) is true.
  // The goal cell itself need not be passable. Returns [[x,y],...] excluding
  // start and including the goal, or null when unreachable.
  function bfs(w, h, start, isGoal, passable, dirs = DIRS4) {
    const prev = new Int32Array(w * h).fill(-2);
    const si = start[1] * w + start[0];
    prev[si] = -1;
    const q = [si];
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi], x = i % w, y = (i / w) | 0;
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const ni = ny * w + nx;
        if (prev[ni] !== -2) continue;
        if (isGoal(nx, ny)) {
          const path = [[nx, ny]];
          for (let j = i; j !== si; j = prev[j]) path.push([j % w, (j / w) | 0]);
          return path.reverse();
        }
        if (!passable(nx, ny)) continue;
        prev[ni] = i;
        q.push(ni);
      }
    }
    return null;
  }

  // Distance field from a list of source cells. Unreachable cells are -1.
  function distField(w, h, sources, passable, dirs = DIRS4) {
    const d = new Int16Array(w * h).fill(-1);
    const q = [];
    for (const [x, y] of sources) {
      if (!inb(w, h, x, y)) continue;
      d[y * w + x] = 0;
      q.push(y * w + x);
    }
    for (let qi = 0; qi < q.length; qi++) {
      const i = q[qi], x = i % w, y = (i / w) | 0;
      for (const [dx, dy] of dirs) {
        const nx = x + dx, ny = y + dy;
        if (!inb(w, h, nx, ny)) continue;
        const ni = ny * w + nx;
        if (d[ni] !== -1 || !passable(nx, ny)) continue;
        d[ni] = d[i] + 1;
        q.push(ni);
      }
    }
    return d;
  }

  // What a simulation draws into. Coordinates are floored; out-of-bounds
  // writes are ignored (and counted, for the checker).
  class Frame {
    constructor(w, h) {
      this.w = w;
      this.h = h;
      this.fill = new Array(w * h).fill(null);
      this.oob = 0;
      this.bad = 0;
    }
    clear() {
      this.fill.fill(null);
    }
    _i(x, y) {
      x = Math.floor(x);
      y = Math.floor(y);
      if (x < 0 || y < 0 || x >= this.w || y >= this.h || Number.isNaN(x) || Number.isNaN(y)) {
        this.oob++;
        return -1;
      }
      return y * this.w + x;
    }
    // Fill a cell with a channel colour; any a < 1 means the dim shade.
    // kind 'empty' erases it.
    cell(x, y, kind, a = 1) {
      const i = this._i(x, y);
      if (i < 0) return;
      if (kind === 'empty') { this.fill[i] = null; return; }
      if (!PALETTE[kind]) { this.bad++; return; }
      this.fill[i] = { kind, a: a < 1 ? DIM : 1 };
    }
    rect(x, y, w, h, kind, a = 1) {
      for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) this.cell(x + i, y + j, kind, a);
    }
    // Glyphs and pips are no longer part of the vocabulary; calls are counted
    // as bad writes so the checker reports them.
    glyph() { this.bad++; }
    pips() { this.bad++; }
    get(x, y) {
      if (!inb(this.w, this.h, x, y)) return null;
      return this.fill[y * this.w + x];
    }
  }

  const defs = [];
  function add(def) {
    defs.push(Object.assign({ w: 10, h: 10, fps: 6, maxTicks: 600, hold: 6, warmup: 6 }, def));
  }

  // Drives one simulation: episodes, holding the final frame, re-seeding.
  class Runner {
    constructor(def, seed = 1) {
      this.def = def;
      this.seed = seed;
      this.frame = new Frame(def.w, def.h);
      this.episodes = 0;
      this.reset();
    }
    reset() {
      this.r = rng(Math.imul(this.seed++, 2654435761) ^ 0x9e3779b9);
      this.s = this.def.init(this.r);
      this.t = 0;
      this.hold = 0;
      this.ended = null;
      this.episodes++;
      this.paint();
    }
    // Advance one tick. Returns 'done' | 'timeout' | 'reset' | undefined.
    step() {
      if (this.hold > 0) {
        if (--this.hold === 0) { this.reset(); return 'reset'; }
        return;
      }
      const res = this.def.tick(this.s, this.r);
      this.t++;
      this.paint();
      if (res === 'done' || this.t >= this.def.maxTicks) {
        this.ended = res === 'done' ? 'done' : 'timeout';
        this.hold = Math.max(1, this.def.hold);
        return this.ended;
      }
    }
    paint() {
      this.frame.clear();
      this.def.draw(this.s, this.frame);
    }
  }

  // Canvas renderer (browser only). px = CSS pixels per cell.
  function render(ctx, frame, px, dpr = 1) {
    const c = px * dpr, w = frame.w, h = frame.h;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w * c, h * c);
    for (let i = 0; i < w * h; i++) {
      const f = frame.fill[i];
      if (!f) continue;
      ctx.fillStyle = (f.a < 1 ? DIM_PALETTE : PALETTE)[f.kind];
      ctx.fillRect((i % w) * c, ((i / w) | 0) * c, c, c);
    }
  }

  const Atlas = {
    PALETTE, DIM_PALETTE, DIM, KINDS, rng, DIRS4, DIRS8, clamp, sign, inb, manhattan,
    bfs, distField, Frame, Runner, render, add, defs,
  };
  root.Atlas = Atlas;
  if (typeof module !== 'undefined' && module.exports) module.exports = Atlas;
})(typeof globalThis !== 'undefined' ? globalThis : this);
