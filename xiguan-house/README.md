# Xiguan House · Open It Up

An isometric line drawing of a Xiguan house, the traditional courtyard townhouse of west Guangzhou, that opens when you click it. The sliding bar gate (tanglong) slides into the wall, the main doors swing in flat against the wall, the front roof slope folds over onto the back slope and the whole roof lifts away behind the back wall, the front wall falls forward, both gable walls fall outward, and the coloured-glass windows beside the courtyard slide up. The entrance hall, the screen doors, the open courtyard, the carved screen and the main hall with its ancestral shrine and table are all in view, along with a 13-step stair to the loft. Click again and it closes along the same timeline in reverse.

**[View online](https://aliceljy.github.io/playground/xiguan-house/)**

中文：[README_CN.md](README_CN.md)

## Controls

- Click the house, click the button, or press Space or Enter. Touch works the same way.
- Opening takes about 3.4 seconds, then the house stays open until you close it. Presses during the motion are ignored.
- With reduced motion turned on in the system, it jumps straight to the result.
- Fixed views: `?view=open` shows it opened; `?view=mid&t=1.9` stops the timeline at 1.9 s (0 to 3.4).

## Spec

- **In one sentence**: one click shows how a Xiguan house comes apart, so the three-layer entrance and the halls along the central axis can be seen; the only action is open and close.
- **Aesthetic**: discovery first, the feel of the mechanism second. Visitors are on a phone or a computer, usually with sound off, for a minute or two; the page has no sound.
- **Palette** (sRGB hex): paper `#efe9dc`, ink `#2c3833`; grey brick `#b7beb9`, granite `#dcd8cc`, roof tiles `#a3a89f`, wood `#8d5f40`, main doors `#6f4630`. Accent colours are kept for the coloured glass (blue `#3f74a8`, red `#c2493a`, amber `#e2b23e`, green `#4f8c5d`) and the red lacquer of the shrine `#9e3b2b`.
- **Composition**: isometric orthographic view, azimuth 40°, elevation 37°, light from the front left above. The framing is set from the full range of the motion, so the camera and scale never change while the house opens or closes; they only refit when the window size changes. A button bar is kept clear at the bottom and one line of notes at the top.
- **Performance budget**: Canvas 2D, about 470 faces sorted once per frame, aiming at 60 fps; nothing is redrawn while it is still.

## Acceptance

| Item | How it is checked | Result (2026-10-27) |
|---|---|---|
| No part passes through another at any time | `tests/geometry.test.cjs`: every 0.025 s and at the key moments near the end of each motion, every pair of parts is tested with a convex separating-axis test, 0.3 cm tolerance | Passes. Calibrated against a known-bad timeline: with the front wall falling before the roof lifts, the check reports the top of the front wall passing into the front roof slope (up to about 9 cm) |
| Hinges hold | Same file: the front slope's ridge hinge stays on the back slope, and both door pivots stay on the frame, throughout | Passes |
| Closing returns everything exactly | Same file: back at time 0, every vertex is within 1e-9 cm of its rest position; in the browser, open then Space returns `s` to 0 | Passes |
| Overshoot at most 2%, and motions that land on something never pass it | Same file: the roof lift, bar gate and windows overshoot about 2% and settle; walls landing, doors meeting the wall and the front slope landing bounce back 2% instead | Passes |
| Heights fall within the sources | Same file: wall at least 5 m, ridge 6 to 8 m | Passes (5.0 m, 7.8 m) |
| The background does not drift | `tools/browser-check.cjs`: the screen position of one world point, sampled every 0.05 s through the motion, never moves | Passes |
| Nothing is cut off and nothing covers the controls at five viewports | Same file: 1920×1080, 1280×720, 390×664 (iPhone with Safari bars), 412×700 (Android), 844×390 (landscape); the model stays inside the view through the whole motion, the button is fully visible and a click at its centre hits it | Passes |
| Repeat presses during the motion are ignored; no errors | Same file | Passes |

`tools/shots.cjs` takes screenshots at chosen times and `tools/perf.cjs` measures frame rate. In headless Chromium (software rendering, no GPU) the 390-wide phone view runs at about 60 fps and the 1920×1080 desktop view at about 36 fps; it has not been tried on a real device. Whether it looks right and whether the motion feels right can only be judged by a person.

## How it was made

- Written by Claude Code on a Mac mini on 2026-10-27. Inspired by [Ian (@ianneo_ai)'s folding courtyard house](https://x.com/ianneo_ai/status/2114198360408326320), which in turn drew on Akshat Singh's 404 page, an isometric line drawing of a slot machine. What was borrowed is the method: fixed connections between parts, motions that start in a staggered order, a 2% settle at the end, and framing set from the full range of the motion. None of his code was used.
- It shares a look with [Nanchan Temple](../nanchan-temple/) in this repository, but that page uses the Anatomy skill for layer-by-layer assembly, which only translates parts. Here the parts turn on hinges and change pose every frame, so it has its own small renderer: every part is a convex polyhedron, faces that overlap on screen are ordered by a plane test (falling back to depth only when the test cannot decide), and the result is drawn in topological order. The same geometry feeds the clash check in the Node tests.
- Sources for the sizes and parts, and which numbers are estimates, are in [`facts.md`](facts.md) (Chinese).

## Known simplifications

- Only the stretch from the entrance to the main hall is drawn; the sedan hall, the second courtyard and the rooms behind the main hall are left out.
- The ridge is a single line rather than a raised ridge, and there are no front steps or recessed porch; both would block the folding motion.
- The rooms beside the courtyard have only their partition walls and coloured windows, with a desk on one side and a tea table on the other.
- The low outer doors (jiaomen) stay shut, because no source says which way they open.

## Files

- `index.html`: the page.
- `src/model.js`: sizes, parts, hinges and timeline, shared by the browser and the Node tests.
- `src/view.js`: isometric projection, face sorting, drawing and controls.
- `tests/geometry.test.cjs`: geometry and mechanism checks, `node --test tests/*.test.cjs`.
- `tools/browser-check.cjs`, `tools/shots.cjs`, `tools/perf.cjs`: browser checks, screenshots and frame rate; usage is at the top of each file.
- `tools/demo.cjs`, `tools/demo-music.py`: frame-by-frame recorder for the vertical demo video, and its music, synthesised to land on the motion.
- `facts.md`: facts and sources.

## Who opens it, AI assets

- Who opens it: people who have stood at the door of a Xiguan house and wondered what the halls behind it look like, and people who just want to click and watch a house come apart.
- AI assets: no AI-generated images, models or sounds, and the page has no audio. Every image is a line drawing computed by code from the sizes; the code and the fact sheet were made by a person working with AI.
