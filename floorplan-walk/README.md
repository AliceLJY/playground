# Floor Plan · Walk-in

One floor-plan image found online, read into walls, openings and rooms, fully furnished, and turned into a house you can orbit or walk into through the front door.

**[Open it](https://aliceljy.github.io/playground/floorplan-walk/)**

It is the same house and the same data as [Floor Plan · 3D Sample](../floorplan/) next to it. That page is the phone page from a video project, with furniture as plain blocks and the weight on the CAD sheet and path-traced renders. This one has real furniture and lets you walk in.

## Controls

| Action | Desktop | Phone |
|---|---|---|
| Orbit and zoom | drag, scroll | one finger, two fingers |
| Six views: overview, plan, living/dining, kitchen, family room, entrance | keys 1-6 | buttons |
| Walk in | F, then W A S D to move, drag to look, Shift to walk fast, Esc to leave | the walk-in button, joystick at the lower left, drag to look |
| Guided walk | T | button |
| Cut the walls to 1.2 m | X | button |
| Real sunlight, night | R, N, or drag the time slider | same |
| Swap the wood tone (oak / walnut) | C | button |
| Room labels, auto-orbit, replay the opening | L, O, G | buttons |

The first visit plays the house growing out of the plan. "Walk in" takes you from outside the front door to the living room by itself, and doors open as you approach; press a direction key or drag to take over.

## How it is made

- **House**: walls, openings, rooms and furniture positions come from one data file (`data/house.js`), read from the image for an earlier floor-plan video. Walls are extruded polygons, so the two 45-degree kitchen walls and their windows are there. Door leaves hang on hinges, open within 1.9 m and close beyond 2.6 m.
- **Furniture**: the 45 parametric pieces are ported from [wy51ai/floorplan-3d](https://github.com/wy51ai/floorplan-3d) (MIT). Each piece is generated from width, depth and colour, so it fits the footprint drawn on the plan and the whole house recolours together. The oval dining table, round coffee table, pendant lamp, fireplace and staircase are not in that kit and were added here (`src/extras.js`). Kitchen counters work out which wall they back onto; a run with windows behind it gets no wall cabinets.
- **Sunlight**: the slider reads a computed sun track, assuming Beijing on the winter solstice. The plan only shows a north arrow, so the place is an assumption. The default "studio light" is not the real sun; it is there to show the model clearly.
- **Walking**: wall outlines, windows, glazed doors, the staircase and large furniture block the way. Chairs and plants do not, so nobody gets stuck beside the dining table.

## Files

| Path | What it is |
|---|---|
| `src/core.js` | coordinates, furniture layout, collision, doors, routes, sun position; no 3D library, testable on its own |
| `src/kit.js` | the ported furniture kit |
| `src/extras.js`, `src/house.js`, `src/textures.js` | added pieces, the building, floor textures |
| `src/main.js`, `index.template.html` | the page |
| `data/house.js`, `assets/floorplan.jpg` | plan data and the source image |
| `tools/build.mjs` | bundles everything into one offline page, `dist/index.html` |
| `tools/browser-check.cjs`, `tools/shot.cjs` | browser acceptance and screenshots, run by hand |
| `tools/make-data.py` | collects the data from the original video project; only useful on the author's machine |
| [SPEC.md](SPEC.md) | specification and acceptance items (Chinese) |

## Build

```bash
npm ci
node tools/build.mjs          # writes dist/index.html, which opens with a double click
node --test tests/*.test.cjs
```

CI runs the same three steps and publishes `dist/index.html` under `floorplan-walk/`. `dist/` and `node_modules/` are not committed.

## Verification

2026-10-03, Mac mini (Apple M4), Google Chrome 155.0.8059.27 headless driven by Playwright, WebGL on the real GPU (`ANGLE Metal Renderer: Apple M4`). Not tested on a real phone, Safari, Firefox or low-end hardware.

**Automated tests**: `node --test tests/*.test.cjs`, 9 of 9 pass. After writing them, door collision and wall collision were each broken once on purpose; the matching test failed both times.

**Browser**: `tools/browser-check.cjs` against the bundled `dist/index.html`, 22 of 22 checks pass.

| Scene | Viewport / pixel ratio | Render buffer | Draw calls / triangles |
|---|---|---|---|
| `?view=hero`, `top`, `&style=walnut`, `&minute=600` | 1280×720 / 1 | 1280×720 | 609 / 377,448 |
| `?view=cut` | same | same | 599 / 375,558 |
| `?view=living` / `kitchen` / `family` / `entry` | same | same | 531 / 437 / 386 / 455 |
| `?view=hero&night=1` | same | same | 324 / 190,946 |
| `?view=walk` | same | same | 55 / 31,706 |
| Visitor default: no parameters, real clicks and keys | 1280×720 / 2 | 2560×1440 | 58 fps minimum, 60 median through the whole walk |
| Phone portrait emulation (touch) | 390×844 / 3, capped at 2 | 780×1688 | — |

Draw calls include the shadow pass.

- Framing: the house takes 47.6% of the width in the overview and 54.3% in the plan view, with margin on every side; 89.7% on the portrait phone.
- Visitor default, in real time: the opening finishes in 4.8 s; the guided walk reaches the living room in 13.3 s, 0.11 m from its last waypoint, with the front door fully open when crossed. Walking back with S, turning by dragging, Esc, the number keys, the slider switching to real sunlight (clock reads 15:00), X, C, O for auto-orbit (the camera turned 0.1 rad in 1.5 s) and G for replay (it finished back on the overview) were all driven with real input.
- Readings: the same patch of living-room floor reads 161 in oak and 92 in walnut; at night the rooms read 75 against 21 outside.
- Phone portrait: no horizontal overflow, the walk button is on the first screen, the joystick appears and moves the walker 1.14 m.
- No page errors and no outside requests in the 11 fixed views, the visitor run or the phone run.
- Live: the published page is byte-identical to the local bundle (SHA-256 starts `5e5a57a4a8df5371`, 1,183,201 bytes), and the same checks run against the live address pass 22 of 22. The first live run recorded one 404 from the browser looking for a site icon; it went away once the page declared an empty icon.

**Screenshots read**: overview, plan, four rooms, cut, walk, night, real sun, walnut, two frames of the opening, one frame of the door opening and two phone shots were each looked at. Problems found that way and fixed: white walls rendering grey (fill light set too low for physical light units, and the tone curve crushed whites), thin light leaks along wall tops and beside windows, the house too small and labels overlapping on a portrait screen, the toolbar covering the hint text.

**Not verified**: touch feel on a real phone; auto-orbit and replay were checked to move and to finish, not watched frame by frame; the night scene has one ceiling lamp per room, so the large living room stays dim.
