# Sandworm · Sandwalker MK-X

A fictional engineering design archive for a mechanical sandworm that tunnels under the desert. Orbit it, switch cameras, turn on X-ray to see the buried part, and pull the armour apart. Four small diagrams — head cross-section, longitudinal profile, segment assembly and drive cycle — run on the same clock as the main view, so they move and pause together.

**[View online](https://aliceljy.github.io/playground/sandworm/)**

## Controls

- Six camera presets — front, side, overhead, chase, outpost, orbit — via the buttons or keys 1–6.
- Drag to orbit, scroll to zoom; on a phone, one finger to orbit and two to zoom.
- X-ray (X) for the underground part, separation (E) to push the armour outward, pause (Space), reference pose (R).

## How it was made

- Implemented independently from [AYi's seven prompt rounds and reference images](https://x.com/AYi_AInotes/status/2104826052979597409): procedural geometry on Three.js r160. None of the original author's code, model files or screenshots are used.
- This folder holds only the bundled single file `sandworm.html`. The Three.js runtime and its licence are inside it, and it requests no other files once opened. The split source, model checks and build script live in the author's prompt library: make changes there, rebuild, then replace the file here as a whole rather than editing this copy.
- The subject is inspired by *Dune*. Mechanisms, dimensions, terrain and motion are conceptual — not the film's design, and not a buildable engineering drawing.

## Verification

During production on 2026-09-30, checked in Chrome on a Mac mini: all six camera presets, play and pause, reference pose and separation toggles, X-ray occlusion order, drag and wheel, and viewports of 1920×1080 and 390×844.

Before publishing here on 2026-10-02, rechecked in Playwright-driven Chromium on a Mac mini (Apple M4, WebGL on the real GPU), once from the source file and once from the site assembled by the workflow: 1440×900 and 390×844, device pixel ratio 1, no console errors or warnings, about 30 fps, and no requests beyond the page itself; at phone width the page does not scroll sideways and all 10 buttons stay on screen.

Not verified: touch feel on a real phone, a sustained 60 fps.
