# Cabin Above the Snowline

A lit cabin on a snowy summit at night, to orbit, look at and play with for a while. A lodge, a lookout tower, a woodshed and a tea stall share one summit; seven smaller summits around it each carry a sign of life: a red-roofed hut, a porch lamp, a small beacon tower, a cairn. Two lines of prayer flags run from the lodge to the two hamlets.

**[Open it](https://aliceljy.github.io/playground/snowline-cabin/)**

No models and no image files: every shape, the wood grain, the clouds, the snow and the moon are generated in code.

## What you can do

- **Light the lamps.** The seven smaller summits start dark. Tap one: the camera flies there, its lamps and windows come on, and a line about who lives there appears (in Chinese). When all seven are lit, lights come on along the flag lines and shooting stars cross the sky.
- **Change the hour.** The slider at the bottom runs from dusk through deep night to dawn; the sky, the key light and the lit windows follow.
- **Step inside.** The door button at the lower left takes you into the ground floor of the main house. Drag to look around; tap a ring on the floor to stand by the fire, at the window or at the table. The window spot faces the moon.
- **Orbit.** Left alone, the camera circles by itself.

## Controls

| Action | Desktop | Phone |
|---|---|---|
| Orbit | drag | one finger |
| Zoom | scroll, or the zoom buttons at the lower left | pinch, or the buttons |
| Back to the opening view | reset button | same |
| Auto-orbit | the eye button toggles it; when on, the camera resumes about 4.5 s after you let go | same |
| Light a lamp | tap a dark summit; then the back button, or tap the main house | same |
| Change the hour | drag the slider at the bottom | same |
| Go in, come out | the door button; inside, the leave button | same |

Hovering a building brightens its windows a little. With "reduce motion" set in the system, auto-orbit starts switched off.

## Where this page comes from

It is a trial of a prompt. YouWare posted a "castle above the clouds" prompt (one instruction producing a floating castle you can orbit). Reading it gave a fill-in template with the subject removed, and this page is that template filled in with a snow-mountain cabin. The template and notes live in the author's prompt library: `tinkering-lab/prompts/interactive-3d-exhibit/procedural-scene-hero-prompt.md`. No code or assets from the original post are used, and the post published no source.

## Run and check locally

```bash
npm ci
node tools/build.mjs            # one file: dist/index.html
node --test tests/*.test.cjs    # logic checks: camera loop, takeover and hand-back, summit layout
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs /tmp/cabin-check   # browser acceptance; needs Playwright and Chrome already installed
```

The spec and acceptance items are in [SPEC.md](SPEC.md). Fixed views: `?view=hero`, `?view=deck`, `?view=sat`, `?view=wide`.

## Record a demo video

Optional, not part of CI. `tools/record.cjs` takes over the page clock before it loads, so each captured frame advances the page by exactly 1/60 s whatever the machine's speed. It walks through the page by itself: the opening, two summits lit, the hour dragged from dusk to dawn, three spots inside, then a second take that lights the seventh summit for the finale; about 83 seconds. The page has no sound, so the video is silent.

```bash
node tools/build.mjs
NODE_PATH="$(npm root -g)" node tools/record.cjs ./demo-landscape.mp4                          # 1920x1080
NODE_PATH="$(npm root -g)" node tools/record.cjs ./demo-portrait.mp4 --size 540x960 --dpr 2    # 1080x1920, phone layout
```

Panels are drawn without the frosted-glass blur while recording: headless screenshots drop a blurred panel's contents on some of the frames in which it repaints (measured 2026-10-11: 108 of 900 frames during the slider sweep, none after the change). The two moves between spots inside are made by a direct call without a tap ring, because the other floor rings were out of view at that moment.

## Known limits

- The place is invented. The coordinates and altitude on the page are fiction.
- Not tried on a real phone; the phone layout was only measured in a narrow browser viewport.
- 60 fps was measured in headless Chrome on one Mac mini. Other machines are unmeasured; the page lowers its render scale when the frame rate drops.

## Licence

The page source belongs to the author. The bundled Three.js keeps its own MIT licence; the full text is in a comment at the top of the published file.
