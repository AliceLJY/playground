# Pixel Match

[中文](README_CN.md)

A plain tile-matching game (the "connect two" kind), with the tiles replaced by the little people from the [Pixel Office](../ai-office/). Tap two identical tiles; if a line with at most two turns can join them (the line may run around the outside of the board), they disappear. Clear the board to finish the level.

- Five levels, with the board growing from 4×6 to 6×8. Level one has four people who look nothing alike; each level after that mixes in people who look more and more alike, and the last level brings in all thirteen, including the boss and CC, whose shirts are only a shade apart.
- Each level has a countdown, 3 hints and 2 shuffles. If no move is left, the board is reshuffled for you for free.
- When a pair is cleared, the two little people wave or hop; after each level everyone lines up in the office for a group photo.
- Made for a phone held upright in one hand, one to three minutes per level, readable with the sound off.

Play: <https://aliceljy.github.io/playground/pixel-match/>

## Where the people come from

Not one pixel was redrawn. `tools/sync-figures.cjs` copies the drawing lines verbatim out of `ai-office/office.js` and `office-core.js` (standing pose, wave, eleven accessories, the boss, the two kids Wuyou and Wulv, plus the hop and wave springs) and writes `src/figures.js`. If the office changes how someone looks, rerun the script; the tests fail until you do.

## How "look-alike" is measured

Both people are painted on the same card and the area that differs visibly (colour difference ΔE > 20) is counted in CSS pixels². The spec sets two lines: any two people in a level differ by at least 100 CSS px² on that level's cards, and pairs under 300 never appear in the first two levels. Details and the cast of each level are in [SPEC.md](SPEC.md) (Chinese).

## Layout

- `src/figures.js` the people (generated, do not edit); `src/raster.js` a tiny `fillRect`-only software rasteriser so tests can read pixels in Node; `src/card.js` the card face and the look-alike readout; `src/core.js` rules, board generation, dead-end reshuffle, autopilots; `src/game.js` drawing, tapping, level flow, group photo.
- 2D canvas; no images, fonts or third-party libraries; no build step.
- Fixed camera states: `?view=hero`, `wide`, `match`, `photo`, `final`, `lost`. Playtest hook `window.__PLAYTEST__`, debug hook `window.__pixelMatch`.

## Run locally

```bash
python3 -m http.server 8765    # from the repository root
```

Open `http://127.0.0.1:8765/pixel-match/`. Tests: `node --test tests/*.test.cjs` in this folder. Browser check: `NODE_PATH="$(npm root -g)" node tools/browser-check.cjs http://127.0.0.1:8765/pixel-match/ <out-dir>`.

## Verification

Node tests cover the rules, solvable boards, dead-end reshuffles, the people matching the office, the look-alike readout and the timing of three autopilots. The browser check covers the camera states, real taps, layout on several phone viewports, a pixel-by-pixel match between the real canvas and the software rasteriser, draw time and the first seconds of play frame by frame. Feel, whether the time limits are fair and whether it is fun still need real people to play it.

## Who opens it, AI material

- Who opens it: anyone who wants a quick round of tile matching; no need to know who these people are, though fans of the Pixel Office get an extra layer.
- AI material: no generated images or sound. The people are pixel art drawn in code in the Pixel Office (also written through human–AI collaboration); this game's code was written through human–AI collaboration.
