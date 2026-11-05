# Cabinet of Distilled Pixels

Classic arcade games reduced to the rule that makes them play, each running live on a small grid
of plain coloured squares with one shared colour scheme.

**Live page:** https://cjauvin.github.io/distilled-pixels/

| colour | channel | meaning |
|--------|---------|---------|
| yellow | agent   | what the player controls |
| red    | threat  | opponents, hazards, moving danger |
| green  | reward  | goals, pickups, targets |
| blue   | object  | neutral things: pushed, carried, built |
| gray   | wall    | static terrain and bounds |

Each colour has a full and a dim shade; dim is a trail, body, shot or weaker state.

## Where the idea came from

From a small detail in [Sparks of Weight-Space Programming](https://rikiyat.github.io/blog/weight-space-programming/)
by Rikiya Takehi, Jayden Teoh, Alex Zhang and Omar Khattab (MIT CSAIL, 2026). To test whether a language
model can tell from raw weights which game a network was trained on, the authors built their own 10×10 grid
versions of Breakout, Pong, Pac-Man and Freeway. This project takes those little grids and runs with them.

## Layout

- `index.html` – the page (no build step; open it directly or serve the folder)
- `engine.js` – grid model, renderer, seeded RNG, path-finding helpers
- `sims/*.js` – one `Atlas.add({...})` per mechanic, by era
- `sims/non-arcade.js` – simulation, strategy and puzzle mechanics kept off the page (not loaded)
- `links.js` – Wikipedia article for each game named on a card
- `tools/check.js` – headless checker: `node tools/check.js sims/2-golden.js`
- `SIMS.md` – how to write a new mechanic

Run locally with any static server, e.g. `python3 -m http.server`.
