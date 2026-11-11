# Clockwork · Generated from One Image

A single diagram of a mechanical clock (`source.jpg`) was handed to Gemini 4 Argon with a request to turn it into an interactive 3D page. This folder builds on the code it wrote in one pass (later changes are listed below): a three-stage gear train meshing at the ratios printed on the diagram. The center wheel turns once an hour, the third wheel 8 times, the escape wheel 60 times.

**[View online](https://aliceljy.github.io/playground/clockwork/)**

## Controls

- Drag to orbit, right-drag to pan, scroll to zoom; on phones, one finger to orbit and two to pinch-zoom or pan.
- The slider in the top-left sets the time scale (60x by default, so the escape wheel turns once a second). Pause freezes the mechanism; each step advances 0.25 simulated seconds without changing the speed setting. Labels can be hidden and the view reset.

## How it was made

- On 2026-10-15 `source.jpg` was uploaded to a temporary chat in the Gemini web app. The prompt asked for an interactive Three.js scene with the gears meshing "at the ratios labelled in the image" and gave no tooth counts in the text. About two and a half minutes later it returned a 749-line single-file HTML page.
- The code was checked before publishing: all three stage ratios (96:8, 64:8, 60:8) were read from the image, adjacent wheels turn in opposite directions, and every meshing pair sits at the sum of their pitch radii. It also added a 12:1 motion work (10→30, 8→32) on its own.
- Known deviations, left as generated: the dial ring is visibly polygonal; the escape wheel has 20 teeth where the diagram shows about 30; from behind, the labels float over the back plate.

## Later changes in this published copy

1. Three.js r160 and OrbitControls load from `vendor/` in this folder instead of unpkg (byte-identical to the npm package three@0.160.0).
2. On narrow screens (aspect ratio below 1) the camera moves back along its original direction in proportion to the aspect ratio. After you drag, it stops adjusting; "reset view" restores it.
3. Below 600 px wide, labels wrap and use a smaller font so they stay on screen.

4. On 2026-11-03, pause/resume and a 0.25 simulated-second step were added to inspect tooth contact. The gear ratios and models remain as generated. The balance wheel pauses too, while the camera stays usable.
5. The same update added coarse-pointer instructions matching the bundled OrbitControls r160 gestures, buttons at least 44 CSS px high, and a narrow-screen panel layout.

## Verification

Checked on 2026-10-15 on a Mac mini (Apple M4, Chrome WebGL on Metal) with Playwright against a local server: 1440×900 and 390×844 viewports at pixel ratio 1, about 60 fps, no requests outside this page's own files, no horizontal overflow at phone width, all three controls on screen. The only console message is a favicon 404. Not yet tried on a real phone.

Current regression results and commands: [VERIFICATION.md](VERIFICATION.md).
`tools/shots.cjs` freezes all three views at simulated second 48 and 60x speed, records shaft angles and camera state, and fails on page errors or a mismatched pose. `tools/browser-check.cjs` also samples rendered great-wheel and centre-wheel pixels, with flat-material and environment-removal negative controls. The new pixel limits still need browser calibration; see the verification record.

## Who it's for, AI assets

- Who it's for: People who want to see what an AI writes in one pass from a single diagram.
- 2026-11-11: the gears changed from flat pastels to metals — a brass great wheel, nickel-steel centre wheel, gilt third wheel, rose-copper escape and motion-work wheels, polished steel pinions and blued steel hands, with circular graining. The studio environment they reflect is built in code; no image files. `tools/shots.cjs` takes the before/after shots from fixed views.
- The barrel's circular graining is centred on its cylinder axis using a separate texture offset; the gear mapping is unchanged.
- AI assets: Gemini 4 Argon generated the initial page in one pass; the publishing adaptations and observation controls above were later changed with AI assistance; the input is the clock diagram `source.jpg` described above.
