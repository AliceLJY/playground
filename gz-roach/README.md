# The Flashiest Guy in Town

A Guangzhou cockroach (the American cockroach, *Periplaneta americana*) scaled up 85 times, running in place on old red floor tiles. You can take it apart.

**[Open it](https://aliceljy.github.io/playground/gz-roach/)**

Drag the speed slider from a walk up to 1.5 m/s. At first the six legs touch down in two alternating tripods; above 1 m/s the front legs lift and it runs on four; faster still the middle legs lift too and it runs on its two hind legs. That is real: it is how the American cockroach runs at top speed (Full & Tu, 1991). The gait diagram, the force under each foot and the readouts all come from the same speed.

Then press 最靓的仔 ("the flashiest guy").

## What you can do

- **Speed**: 0 to 1.5 m/s. A readout scales it to human body length: about 260 km/h at the top.
- **Look at one part**: head and antennae, pronotum, fore, middle or hind legs, wings, abdomen and cerci. The rest turns see-through and a line of text explains the part (in Chinese).
- **X-ray, take apart, spread the wings.**
- **最靓的仔**: it stands up on its hind legs with the abdomen as a third leg, raises its middle legs to flex, sweeps its antennae back like two ponytails, and a pair of sunglasses drops onto its face.
- **Tour**: left alone, a cursor clicks through the buttons by itself in 36 seconds. Touch anything and it is yours; after 25 quiet seconds the tour comes back.

## Controls

| Action | Desktop | Phone |
|---|---|---|
| Orbit | drag | one finger |
| Zoom | scroll | pinch |
| Speed | the slider, or the up and down arrow keys | the slider |
| Camera views | the 机位 buttons | swipe the button row |
| Keys | X-ray X, take apart E, wings W, flashiest S, hide panels H | none |

## How it is made

The model comes first. `src/model.js` holds only pure functions: given a speed, it returns where every joint of the six legs is, how hard each foot presses on the ground and how high the body rides. The 3D insect, the panels and the tests all read from it; nothing is animated by hand. The insect is built entirely in code (ellipsoids, tubes, vertex colours), with no model or image files.

The method is borrowed from Elvar's teardown, a Claude Code skill that turns machines into simulators you can take apart (MIT): one input drives the whole machine, every beat of the tour is checked as a still, and the tour drives itself until someone touches it. This page's code is written separately; none of teardown's code is copied. Its nine steps, rewritten in Chinese, are in the author's prompt library: `tinkering-lab/prompts/interactive-3d-exhibit/variant-teardown-one-input-simulator.md`.

## Run and check locally

```bash
npm ci
node tools/build.mjs            # one file: dist/index.html
node --test tests/*.test.cjs    # bone lengths, no foot slip, weight balance, nothing under the floor, gaits, tour
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs /tmp/roach-check   # browser acceptance; needs Playwright and Chrome already installed
```

The spec, number sources and acceptance items are in [SPEC.md](SPEC.md) (Chinese).

## Record a demo video

Optional, not part of CI. `tools/record.cjs` calls the page's `render(t)` frame by frame and screenshots each frame, so the frame rate does not depend on how fast the machine is. It records the 36-second tour; on the phone layout the cursor first scrolls the button row to its target. It also writes an event list (every footfall, every cursor press, the moment the sunglasses drop), and `tools/score.py` synthesises a soundtrack from it: a four-chord bed, a faint tick for every footfall, a click for every press, a low hit and a run of bells for the sunglasses. Everything is computed; no samples or existing music.

```bash
node tools/build.mjs
NODE_PATH="$(npm root -g)" node tools/record.cjs ./landscape.mp4                          # 1920x1080
NODE_PATH="$(npm root -g)" node tools/record.cjs ./portrait.mp4 --size 540x960 --dpr 2    # 1080x1920, phone layout
uv run --with numpy python -I tools/score.py ./landscape.events.json ./score.wav         # needs numpy
ffmpeg -i landscape.mp4 -i score.wav -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -shortest -movflags +faststart final.mp4
```

Panels drop their frosted-glass blur while recording (headless screenshots sometimes lose the content of blurred panels). Measured on 2026-11-01: -14.6 LUFS integrated, true peak -1.2 dBFS.

## Known limits

- Speeds, stride frequency and the speed range of the gait changes are measured values; the two exact switch points, the leg segment lengths and the joint poses are estimates.
- The flashiest pose and the sunglasses are made up.
- Not tried on a real phone; frame rate measured on one Mac mini only. The page has no sound; nobody has listened to the video soundtrack yet.

## Licence

The page source belongs to the author. The bundled Three.js keeps its own MIT licence, whose full text is in a comment at the top of the published file; see also [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Who opens this, and AI material

- Who opens this: anyone who has been startled by a cockroach in Guangzhou and wondered how it runs so fast.
- AI material: no images, models or recorded sounds are used (the video soundtrack is synthesised in code); the insect is generated entirely in code; the code was written by a person working with AI.
