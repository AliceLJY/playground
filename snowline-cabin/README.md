# Cabin Above the Snowline

A lit cabin on a snowy summit at night, to orbit and look at. A lodge, a lookout tower, a woodshed and a tea stall share one summit; seven smaller summits around it each carry a sign of life: a red-roofed hut, a porch lamp, a small beacon tower, a cairn. Two lines of prayer flags run from the lodge to the two hamlets.

**[Open it](https://aliceljy.github.io/playground/snowline-cabin/)**

No models and no image files: every shape, the wood grain, the clouds, the snow and the moon are generated in code.

## Controls

| Action | Desktop | Phone |
|---|---|---|
| Orbit | drag | one finger |
| Zoom | scroll, or the zoom buttons at the lower left | pinch, or the buttons |
| Back to the opening view | reset button | same |
| Auto-orbit | the rightmost button toggles it; when on, the camera resumes about 4.5 s after you let go | same |

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

## Known limits

- The place is invented. The coordinates and altitude on the page are fiction.
- Not tried on a real phone; the phone layout was only measured in a narrow browser viewport.
- 60 fps was measured in headless Chrome on one Mac mini. Other machines are unmeasured; the page lowers its render scale when the frame rate drops.

## Licence

The page source belongs to the author. The bundled Three.js keeps its own MIT licence; the full text is in a comment at the top of the published file.
