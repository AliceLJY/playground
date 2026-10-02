# Floor Plan · Walk-in

One floor-plan image found online, read into walls, openings and rooms, and turned into a coloured plan you can furnish yourself. Switch to 3D and the house grows out of that plan; orbit it, or walk in through the front door.

**[Open it](https://aliceljy.github.io/playground/floorplan-walk/)**

It is the same house and the same data as [Floor Plan · 3D Sample](../floorplan/) next to it. That page is the phone page from a video project, with furniture as plain blocks and the weight on the CAD sheet and path-traced renders. This one lets you place furniture and walk in.

## Controls

**2D plan (the page opens here)**

| Action | Desktop | Phone |
|---|---|---|
| Add furniture | drag a card from the library on the left onto the plan, or click it to drop it in the middle | tap a card in the strip along the bottom, or press and drag it up |
| Move, turn, resize | drag a piece; drag the dot above it to turn, R for 90 degrees; drag the square at its corner to resize; arrow keys nudge | tap to select, then drag; the floating bar has rotate, duplicate and delete |
| Duplicate, delete, undo | Cmd/Ctrl D, Delete, Cmd/Ctrl Z (with Shift to redo) | floating bar and top bar buttons |
| Look around | scroll to zoom, drag empty space to pan, F to fit | pinch to zoom, one finger to pan |
| Other | switches for wall snapping, dimensions, room names and furniture; restore the original layout or clear it; C swaps the wood tone | same |

The layout is kept in the browser and survives a reload. Dimensions on the plan are millimetres.

**3D scene (the 3D button, or T)**

| Action | Desktop | Phone |
|---|---|---|
| Orbit and zoom | drag, scroll | one finger, two fingers |
| Six views: overview, plan, living/dining, kitchen, family room, entrance | keys 1-6 | buttons |
| Walk in | F, then W A S D to move, drag to look, Shift to walk fast, Esc to leave | the walk-in button, joystick at the lower left, drag to look |
| Guided walk | T while walking | button |
| Cut the walls to 1.2 m | X | button |
| Real sunlight, night | R, N, or drag the time slider | same |
| Room labels, auto-orbit, replay the build | L, O, G | buttons |

Going to 3D grows the house out of the plan you just left, with your layout. "Walk in" takes you from outside the front door to the living room by itself, and doors open as you approach; press a direction key or drag to take over.

## How it is made

- **House**: walls, openings, rooms and the default furniture positions come from one data file (`data/house.js`), read from the image for an earlier floor-plan video. Walls are drawn and extruded as polygons, so the two 45-degree kitchen walls and their windows are there. Door leaves hang on hinges, open within 1.9 m and close beyond 2.6 m.
- **Plan**: walls, windows, door swings, room names with areas and the dimension chains around the house are drawn from that data. The chains use the steps in the outline; values are converted with the plan scale and rounded to 10 mm. The scale was derived from the stair-tread note on the image.
- **Furniture**: the 2D symbols of 60 pieces, the library list and 45 parametric 3D builders are ported from [wy51ai/floorplan-3d](https://github.com/wy51ai/floorplan-3d) (MIT). Each piece is generated from width, depth and colour, so resizing it on the plan changes it in 3D, and the whole house recolours together while a piece given its own colour keeps it. The oval dining table, round coffee table, pendant lamp, fireplace and staircase are not in that kit and were added here (`src/extras.js`). A kitchen counter checks what is behind it: wall cabinets only against a wall, none across a window, none once it is dragged into the middle of a room.
- **Editing**: drag and drop, snapping and undo follow the same project's approach but are rewritten for polygon walls (its walls are axis-aligned rectangles only). Its measuring tool, wall demolition and cost estimate are not here: this image does not say which walls are load-bearing, and the estimate's unit prices are not market prices.
- **Sunlight**: the slider reads a computed sun track, assuming Beijing on the winter solstice. The plan only shows a north arrow, so the place is an assumption. The default "studio light" is not the real sun; it is there to show the model clearly.
- **Walking**: wall outlines, windows, glazed doors, the staircase, the fireplace and large furniture block the way. Chairs and plants do not, so nobody gets stuck beside the dining table. Put a wardrobe in the way and the guided walk goes around it, or stops if it cannot.

## Files

| Path | What it is |
|---|---|
| `src/core.js` | coordinates, the furniture layout, wall snapping, collision, doors, routes, sun position; no 3D library, testable on its own |
| `src/plan2d.js` | the 2D plan and all editing |
| `src/symbols.js`, `src/kit.js` | the ported 2D symbols with the library list, and the 3D furniture kit |
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

**Automated tests**: `node --test tests/*.test.cjs`, 13 of 13 pass. After writing them, door collision, wall collision, wall snapping and furniture blocking the walk were each broken once on purpose; the matching test failed every time.

**Browser**: `tools/browser-check.cjs` against the bundled `dist/index.html`, 34 of 34 checks pass.

| Scene | Viewport / pixel ratio | Render buffer | Draw calls / triangles |
|---|---|---|---|
| `?view=hero`, `top`, `&style=walnut`, `&minute=600` | 1280×720 / 1 | 1280×720 | 603 / 378,728 |
| `?view=cut` | same | same | 593 / 376,838 |
| `?view=living` / `kitchen` / `family` / `entry` | same | same | 527 / 431 / 383 / 447 |
| `?view=hero&night=1` | same | same | 321 / 191,586 |
| `?view=walk` | same | same | 55 / 31,706 |
| Visitor default: no parameters, real clicks and keys | 1280×720 / 2 | 2560×1440 | 56 fps minimum, 60 median through the whole walk |
| Phone portrait emulation (touch) | 390×844 / 3, capped at 2 | 780×1688 | — |

Draw calls include the shadow pass.

- Framing: the house takes 47.6% of the width in the overview and 54.3% in the plan view, with margin on every side; 89.7% on the portrait phone.
- Plan (visitor default, real mouse and keys): the page opens in 2D with 41 pieces and 63 library cards (60 plus the 3 added here), the house taking 81% of the middle column. A bed dragged from the library into the family room lands 4 mm from where the mouse let go; dragging it 1.5 m, turning with R and nudging with an arrow key all work; the square handle changed 1800×2000 to 3110×1060 and the dot handle turned it to 180 degrees; duplicate gives 43 pieces, delete 42, undo 43, undo again 42; C changes the floor pattern and the furniture colours; after a reload the 42 pieces are still there.
- To 3D: the house is grown in 4.8 s, 42 pieces on the plan and 43 built in 3D (the extra one is the fireplace).
- 3D, in real time: the guided walk reaches the living room in 13.3 s, 0.11 m from its last waypoint, with the front door fully open when crossed. Walking back with S, turning by dragging, Esc, the number keys, the slider switching to real sunlight (clock reads 15:00), X, C, O for auto-orbit (the camera turned 0.1 rad in 1.5 s) and G for replay (it finished back on the overview) and T back to the plan were all driven with real input.
- Readings: the same patch of living-room floor reads 161 in oak and 92 in walnut; at night the rooms read 75 against 21 outside.
- Phone portrait: the whole plan shows, the library is a strip along the bottom, a tap on a card adds a piece; in 3D nothing overflows, the walk button is on screen, the joystick appears and moves the walker 1.14 m.
- No page errors and no outside requests in the 11 fixed views, the visitor run or the phone run.
- Screen size changing after the page has loaded (added after Alice reported that on her phone the page "looks right at first, then becomes very large once everything has loaded"; see below): opening a foldable, closing it, and turning a phone to landscape. The plan is fitted again each time (81% / 81% / 73% of the sheet, the whole house inside); the 3D overview is framed again (88%×33% / 83%×54% / 39%×61% of the screen, margins on all sides); a plan the reader had zoomed keeps its middle (0.0 mm drift). Before the fix the same three cases gave a plan at 178%, 37% and 102% of the sheet and a 3D view at 172%, 42% and 19% of the screen width.
- Live: after commit `c8b7508` was deployed on 2026-10-03, the live page is 1,232,916 bytes and its SHA-256 matches the local bundle; the same acceptance run against the live address passes 34 of 34, with no errors, no outside requests and 60 fps minimum through the walk.

**Screenshots read**: the 2D plan (oak, walnut, mid-drag, edited, phone portrait), overview, plan view, four rooms, cut, walk, night, real sun, walnut, two frames of the house growing, one frame of the door opening and two phone 3D shots were each looked at. Problems found that way and fixed: white walls rendering grey (fill light set too low for physical light units, and the tone curve crushed whites), thin light leaks along wall tops and beside windows, the house too small and labels overlapping on a portrait screen, the toolbar covering the hint text.

**One thing not reproduced on a real device**: Alice opened the page on her phone and said it looks right at first, then becomes very large once everything has loaded. A headless browser at seven phone and foldable sizes did not show it. What does reproduce reliably is a related fault, the page not adapting when the screen size changes after loading; that is fixed and is acceptance item 12. Whether it is what she saw will only be known when she opens the page again.

**Not verified**: touch feel on a real phone, above all dragging a card up from the bottom strip (the phone run only taps a card); pinch zoom; auto-orbit and replay were checked to move and to finish, not watched frame by frame; the night scene has one ceiling lamp per room, so the large living room stays dim.
