#!/usr/bin/env node
/*
 * Headless checker for mechanic simulations.
 *
 *   node tools/check.js sims/2-golden.js                 # stats for every mechanic in the file
 *   node tools/check.js sims/2-golden.js --id pacman --ascii 40 [--every 1] [--seed 3]
 *
 * Stats: episodes that ended with 'done' vs. timeout, mean length, exceptions,
 * glyph/pips calls or bad kinds, stuck stretches (identical frames), missing agent.
 * ASCII legend:  # wall  A agent  E enemy  R reward  O object  (lowercase / ':' = dim)
 *                . empty
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const args = process.argv.slice(2);
const opt = (name, dflt) => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : dflt;
};
const files = args.filter((a, i) => !a.startsWith('--') && !(i > 0 && args[i - 1].startsWith('--')));
const onlyId = opt('id');
const asciiN = +opt('ascii', 0);
const every = +opt('every', 1);
const seeds = +opt('seeds', 6);
const ticks = +opt('ticks', 2000);
const seed0 = +opt('seed', 1);

const ctx = vm.createContext({ console, Math, Number, Array, Object, Set, Map, Int16Array, Int32Array, Uint8Array, Float32Array, JSON });
const load = (f) => vm.runInContext(fs.readFileSync(f, 'utf8'), ctx, { filename: f });
load(path.join(__dirname, '..', 'engine.js'));
for (const f of files) load(f);
const Atlas = ctx.Atlas;

const LETTER = { wall: ['#', ':'], agent: ['A', 'a'], enemy: ['E', 'e'], reward: ['R', 'r'], object: ['O', 'o'] };
function ascii(fr) {
  const rows = [];
  for (let y = 0; y < fr.h; y++) {
    let s = '';
    for (let x = 0; x < fr.w; x++) {
      const f = fr.fill[y * fr.w + x];
      s += f ? LETTER[f.kind][f.a < 1 ? 1 : 0] : '.';
    }
    rows.push(s);
  }
  return rows;
}
const sig = (fr) => JSON.stringify(fr.fill);

let problems = 0;
const defs = Atlas.defs.filter((d) => !onlyId || d.id === onlyId);
if (!defs.length) { console.error('no mechanics matched'); process.exit(1); }

const ids = new Set();
for (const d of Atlas.defs) {
  if (ids.has(d.id)) { console.log(`DUPLICATE id ${d.id}`); problems++; }
  ids.add(d.id);
  for (const k of ['id', 'year', 'title', 'games', 'essence', 'channels', 'init', 'tick', 'draw']) {
    if (d[k] === undefined) { console.log(`${d.id}: missing field ${k}`); problems++; }
  }
  for (const k of Object.keys(d.channels || {})) {
    if (!Atlas.PALETTE[k]) { console.log(`${d.id}: unknown channel ${k}`); problems++; }
  }
}

if (asciiN) {
  const d = defs[0];
  const run = new Atlas.Runner(d, seed0);
  const frames = [ascii(run.frame)];
  for (let k = 1; frames.length < asciiN; k++) {
    const res = run.step();
    if (k % every === 0 || res) frames.push(ascii(run.frame).map((r, i) => (i === 0 ? r : r)));
    if (res) frames[frames.length - 1].push(`<${res}>`);
  }
  // print side by side, 6 per row
  const per = Math.max(1, Math.floor(100 / (d.w + 3)));
  for (let i = 0; i < frames.length; i += per) {
    const group = frames.slice(i, i + per);
    const H = Math.max(...group.map((g) => g.length));
    for (let y = 0; y < H; y++) console.log(group.map((g) => (g[y] || '').padEnd(d.w + 2)).join(' '));
    console.log();
  }
  process.exit(0);
}

for (const d of defs) {
  let done = 0, timeout = 0, lens = [], errors = [], stuck = 0, noAgent = 0, frames = 0, oob = 0, bad = 0;
  for (let s = 0; s < seeds; s++) {
    let run;
    try { run = new Atlas.Runner(d, seed0 + s); } catch (e) { errors.push(e.stack.split('\n').slice(0, 3).join(' | ')); continue; }
    let last = '', same = 0, epStart = 0;
    for (let t = 0; t < ticks; t++) {
      let res;
      try { res = run.step(); } catch (e) { errors.push(e.stack.split('\n').slice(0, 3).join(' | ')); break; }
      if (res === 'done') { done++; lens.push(t - epStart); }
      if (res === 'timeout') { timeout++; lens.push(t - epStart); }
      if (res === 'reset') epStart = t;
      if (run.hold > 0) { same = 0; continue; }
      frames++;
      const fr = run.frame;
      if (d.channels.agent && !fr.fill.some((f) => f && f.kind === 'agent')) noAgent++;
      const g = sig(fr);
      same = g === last ? same + 1 : 0;
      if (same === 25) stuck++;
      last = g;
    }
    oob += run.frame.oob;
    bad += run.frame.bad;
  }
  const mean = lens.length ? Math.round(lens.reduce((a, b) => a + b, 0) / lens.length) : '-';
  const warn = [];
  if (errors.length) warn.push(`ERRORS ${errors.length}: ${errors[0]}`);
  if (bad) warn.push(`glyph/pips calls or bad kinds: ${bad}`);
  if (stuck) warn.push(`stuck stretches ${stuck}`);
  if (noAgent / Math.max(1, frames) > 0.15) warn.push(`no agent in ${Math.round((100 * noAgent) / frames)}% frames`);
  if (done === 0) warn.push('never reaches done');
  if (warn.length) problems++;
  console.log(`${d.id.padEnd(14)} ${String(d.year).padEnd(5)} done ${String(done).padStart(3)}  timeout ${String(timeout).padStart(3)}  mean len ${String(mean).padStart(4)}  oob ${oob}${warn.length ? '\n    ! ' + warn.join('\n    ! ') : ''}`);
}
process.exit(problems ? 1 : 0);
