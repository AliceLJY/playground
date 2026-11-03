# Context Snake

Snake, where the head is a little black coal ball and the body is the context window. Eating files, web pages and logs makes it longer, and the longer it gets the slower it turns: after you press a direction it has to coast a few cells before the turn lands. Running into yourself is "context pollution" and ends the round.

**[Play online](https://aliceljy.github.io/playground/context-snake/)**

A round lasts at most two minutes (one "session"). It is built for phones held upright, also works sideways and on desktop, and reads fine with the sound off. The in-game text is Chinese.

## How to play

- Phone: swipe on the board, or press the arrow pad below it (a turn fires on press, not on release). One long drag can bend twice.
- Desktop: arrow keys or WASD to turn, Q to compress, E to dispatch a sub-agent, Esc or P to pause.
- The board wraps at every edge; only biting yourself loses.
- The conversation itself grows the context: one extra segment every 7 seconds, so dodging without eating still gets longer.
- Fresh material sits next to the head; the oldest sits at the tail.

Two skills:

- **Compress**: needs at least 5 segments. Cuts the oldest stretch off the tail and leaves a single "summary" segment; the score is untouched; 10 second cooldown.
- **Dispatch a sub-agent**: needs at least 7 segments. Four tail segments break off as a small coal ball with a cyan antenna, roam the board eating for 9 seconds, then come back with a 205–588 character report: points, but no length. It grows while it is out, with its "tokens" shown beside it (for show only).
- With 3 sub-agents already out, dispatching a fourth sends all four into **429** together: they vanish, no reports arrive, and dispatching is locked for 8 seconds.

How slow the turns get: up to 15 segments a turn lands on the next cell; 16–23 segments it lands one cell late, 24–31 two cells late, 32 and up three cells late. A dashed pink ring on the board marks where a turn pressed right now would land, queued turns show as pink arrows, and the top bar says how many cells late turns currently land.

The result screen picks one real event that matches your round and tells it in a line, such as sub-agents that read well over a hundred thousand tokens and handed back a few hundred characters, or eight heavy sub-agents dispatched at once that all hit 429.

## How it is built

- A one-page spec is in [SPEC.md](SPEC.md) (Chinese): rule values, palette, layout, performance budget and twelve acceptance checks.
- Rules live in `src/core.js` with no DOM and run in Node; page, input and sound live in `src/game.js`. A 2D canvas, no build step, no three.js and no images: the coal ball, icons and effects are drawn in code, and sounds are synthesised with WebAudio.
- Tests: `tests/core.test.cjs` measures turn lag, compression, reports, 429, spawn positions, and the length and survival of rounds across four autopilot levels on real simulated games; `tests/input.test.cjs` fires real key, button and swipe events at the page script.
- Browser check: `tools/browser-check.cjs`, five viewports.
- Fixed views: `?view=hero`, `?view=long`, `?view=burst`, `?view=end`; hooks `window.__snake` and `window.__PLAYTEST__`.

## Run locally

```bash
cd context-snake && python3 -m http.server 8977
```

Open `http://127.0.0.1:8977/`. Tests: `node --test tests/*.test.cjs`. Publishing copies `index.html` and `src/` as they are.

## Verification

See [VERIFICATION.md](VERIFICATION.md) (Chinese). How the turn lag feels and whether the numbers are fun still need people to play it.

## Who might open this, AI assets

- Who might open this: people who use AI coding assistants and only half follow words like "context", "compaction" and "sub-agent", and would like to play them through in one round of Snake; also anyone who just wants two minutes of Snake on a phone.
- AI asset list: no AI-generated images, models or sounds; the coal ball is redrawn in code from the author's own character reference; the code was written by a person working with AI.
