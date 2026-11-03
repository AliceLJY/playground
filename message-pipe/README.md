# A Message's Journey

A pipe-connecting puzzle. Each tile holds a pipe you can turn: tap it and it rotates 90° clockwise. Connect the start to the end, press "发车" (send), and a little orange tabby on a bicycle carries the message along the pipe. On the way there are stations, each one a step in a real workflow, and the route has to pass all of them in order. Skip one or take them out of order and the cat stops halfway; the station it skipped turns red and says what is missing.

**[Play online](https://aliceljy.github.io/playground/message-pipe/)** (the interface is in Chinese)

Five levels, 35–80 seconds each, from easy to hard:

1. **A message there and back**: phone, message bridge, AI, back to the phone.
2. **Writing an article**: pick a topic, gather material, fact-check, polish, write it up.
3. **Delegating and reading back**: write the brief, hand it off, the other side works, hand back, inspect. Route around the inspection station and the cat brings back an empty box — "done" was said, but the file was never made.
4. **Reproduce before you fix**: reproduce, locate, change, rerun.
5. **Before you push**: run the tests, pull the latest, push, check it live.

Each level ends on one line about what that step protects you from in real work. Made for a phone held upright; landscape and desktop work too. There is no sound, and nothing depends on it.

## Controls

- Tap a tile to turn its pipe 90°. Pipes already connected to the start light up.
- When it looks connected, press "发车" (or Enter on a keyboard). A failed ride costs time: the clock keeps running while the cat rides and while the note is up.
- Leaving the page or pressing Esc pauses; press "继续" to resume.
- Every retry reshuffles the pipes; the station order stays. Clearing a level unlocks the next one.

## How it is made

- A one-page spec is in [SPEC.md](SPEC.md) (Chinese): level table, colours, rules, difficulty numbers, performance budget, fixed views and twelve acceptance items.
- Rules, the solver and three autopilots are in `src/core.js`, with no drawing, so they run in Node. Every shuffle is solved for the fewest taps and only used if that number falls in the spec's range.
- Drawing is a 2D canvas. Pipes, station signs and the cyclist cat are drawn in code; no image assets, no build step.
- Fixed views: `?view=start`, `?view=emptybox`, `?view=ride`, `?view=clear`; playtest hook `window.__PLAYTEST__`, acceptance hook `window.__pipe`.

## Run locally

```bash
cd message-pipe && python3 -m http.server 8942
```

Open `http://127.0.0.1:8942/`. Tests: `node --test tests/*.test.cjs`. Browser acceptance (needs Playwright and Chrome already installed): `NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <out-dir> [page-url]`. Publishing copies `index.html` and `src/` as they are.

## Verification

See [VERIFICATION.md](VERIFICATION.md) (Chinese). Feel, whether the time limits are tight enough, and whether it is fun still need people to play it.

## Who it's for, AI assets

- Who it's for: Anyone who wants a two-minute puzzle on the phone; people who work with AI agents will recognise these workflows, especially the "it said done, but nothing was made" level.
- AI assets: No AI-generated images, models, motion or sound; the pipes, signs and cat are drawn in code. Code written through human–AI collaboration.
