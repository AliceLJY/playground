# Nanchan Temple · Build It Up

The Great Hall of Nanchan Temple in Wutai, Shanxi, rebuilt in 782 under the Tang, is the oldest surviving timber building in China. This page turns it into a machine you can press: eleven buttons on the left, only the next one is live, and each press raises one more layer of the hall. The interface text is Chinese.

**[View it live](https://aliceljy.github.io/playground/nanchan-temple/)**

## Controls

- Steps: rammed-earth platform, columns, tie-beams, bracket sets, beam frame, roof purlins, rafters, tiles and ridge ornaments, walls and doors, take it apart, put it back.
- Manual or auto: manual waits for each press, auto builds it on a loop. Space, Enter or → also press the next step; "从头来" starts over.
- Day or night colours. Both choices are remembered in the browser.
- The cut-away at bottom left enlarges one column-top bracket set and lights up, layer by layer, how the roof's weight runs from the tiles down into the column.
- A slider sets how many millimetres one *fen* (the module unit) is worth; the whole hall rescales and every reading is recomputed. 16.5 mm is the surveyed value, the rest are hypothetical.

The line under the figure: the whole hall can be measured with one ruler, the *cai* module. Measuring a Tang building with the module system of the Song *Yingzao Fashi* (1103) is a modern method of analysis, not a Tang drawing.

## How it was made

- Built on 2026-10-24 by Claude Code on a Mac mini with the [Anatomy](https://github.com/wheresryan22/anatomy) skill (MIT, pinned at `1482e84`): survey data first (`facts.md`), then a pure model (`src/model.mjs`) that drives every number on screen, then the geometry and painter's order. 2 h 36 min from start to a version passing every check.
- Inspired by Elvar's clickable Anatomy machines (an Apple Watch, an espresso machine).
- Colours follow *jiehua* ruled-line painting and the Tang red-and-white scheme, not the later Qing blue-green decoration.
- Dimensions mainly from Qi Yingtao and Chai Zejun's restoration report (*Wenwu*, 1980 no. 11) and Zhang Rong et al.'s 2022 module analysis (1 fen = 16.5 mm); sources and open questions are in `facts.md`.

## Known simplifications

- The roof planes are flat: no concave curve, no upturned corners, no rising of the corner columns.
- Corner bracket sets lack the diagonal arm; corner rafters are drawn parallel.
- Eave overhang (2.34 m) is a restoration estimate; the overall width differs between sources (11.55–11.75 m); platform, steps and door studs are schematic.
- Once built, the camera sits above the eaves, so most bracket sets hide under the overhang; see step 4 or the cut-away.

## Verification

- Anatomy's audit (clearance, support, depth order, pass-through while coming apart) ends `audit passed` in both themes, and once more on the kit's full state set (1,175 depth states), run on the geometry before the day/night switch was added; the geometry has not changed since.
- Line-end check: 0 floating ends in every resting pose of both themes.
- Frame-jump check: every step scanned at 0.1 s, no frame changes more than 3× its neighbours.
- Day/night switch checked in Playwright: background goes from `rgb(241,232,211)` to `rgb(29,25,21)`, the choice survives a reload, no console errors.
- Screenshots at 1280 and 390 px wide were read; not tried on a real phone. Fonts load from Google Fonts and fall back to system Kai/Song faces.

## Files

- `index.html`: the published single-file page (build output).
- `src/`: `build.mjs`, `model.mjs`, `inset.mjs`, `live.js`, `nanchan.css`. Rebuilding needs the Anatomy skill installed locally: run `node build.mjs --light` in `src/` and copy `src/nanchan-light.html` to `index.html`. Add `--audit` for the audit, with `NODE_OPTIONS=--max-old-space-size=14000`.
- `facts.md`: facts and sources.
- `ANATOMY-LICENSE.txt`: the page inlines Anatomy's runtime code, MIT licence attached.
