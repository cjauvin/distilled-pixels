# Writing a mechanic

Each card on the page is one call to `Atlas.add(def)` in a file under `sims/`.
Read `engine.js` for the API, and the two reference mechanics for the expected
quality and style: `pong` in `sims/1-origins.js` and `pacman` in `sims/2-golden.js`.

The page shows arcade games only. `sims/non-arcade.js` keeps 22 simulation, strategy, turn-based
and puzzle mechanics that were taken off the page; it is not loaded by `index.html`.

## Definition

```js
Atlas.add({
  id: 'pong',                       // unique, lowercase
  year: 1972,                       // first release of the game that defined the mechanic
  title: 'Paddle duel',             // the mechanic, 2-4 words, not the game's name
  games: ['Tennis for Two (1958)', 'Pong (1972)'],   // 1-3 exemplars, accurate years
  essence: 'One or two plain sentences stating the rule (max ~220 chars).',
  channels: { agent: 'paddle', enemy: 'ball, rival paddle', reward: 'rival goal line' },
  w: 10, h: 10,                     // default 10x10; stay within 8..12 and square unless there is a reason
  fps: 6,                           // ticks per second, 4..9
  maxTicks: 600,                    // safety net; episodes should end on their own
  hold: 6,                          // ticks the final frame stays up before restarting
  warmup: 6,                        // ticks run before the first still frame (make it interesting)
  init(r) { return state; },        // r = seeded rng: r.f() r.i(n) r.range(a,b) r.chance(p) r.pick(a) r.shuffle(a)
  tick(s, r) { /* advance one step; return 'done' on win or loss */ },
  draw(s, g) { /* g.cell(x, y, kind, a) / g.rect(x, y, w, h, kind, a) */ },
});
```

## Visual vocabulary (shared by every card)

| channel  | colour | meaning |
|----------|--------|---------|
| `agent`  | yellow | what the player controls |
| `enemy`  | red    | opponents, hazards, moving threats |
| `reward` | green  | goals, pickups, targets |
| `object` | blue   | neutral things: pushable, falling, carried, built |
| `wall`   | gray   | static terrain, boundaries |

Each channel has exactly **two shades**, so the whole page uses ten colours:

- **Full** (`a` omitted or 1): the thing itself.
- **Dim** (any `a < 1`, by convention `Atlas.DIM`): a weaker or residual version of the channel. Trails,
  snake bodies, projectiles, frightened enemies, explored-but-not-visible cells, diggable dirt.

Cells are plain coloured squares. There are no glyphs, pips, outlines or text inside cells: if a
distinction cannot be made with these ten colours and the layout, leave it out.

- **Loss**: on a loss, paint the agent's cell `enemy` in the final frame.
- Only list a channel in `channels` if the demo draws it. Keep descriptions short and lowercase,
  and say "(dim = ...)" when the dim shade means something specific.

## Rules of the road

- The demo is a scripted agent with simple heuristics (BFS, lookahead, greedy scoring) that plays
  plausibly, not perfectly. Wins and losses should both happen.
- Show the mechanic's defining moment early (within ~10 s): the power-pellet reversal, a line clear,
  a box landing on its target.
- Episodes end with `'done'`, typically after 40–300 ticks.
- Use only `r` for randomness, never `Math.random`. No DOM access. Keep `tick` cheap: about 55 cards run at once.
- Layouts are abstract and original. Do not copy real level maps, characters or art.
- Copy: plain, direct sentences. No em-dash asides, no "not X but Y".
- Wrap each file in an IIFE and destructure what you need from `Atlas`.

## Checking

```bash
node tools/check.js sims/your-file.js                       # stats; must print no "!" lines
node tools/check.js sims/your-file.js --id snake --ascii 30 --every 2   # look at frames
```
