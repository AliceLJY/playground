# Orbital Ring Station

A ring station above Earth. Four spokes join the habitat ring to a central hub with a docking port on top; below, a truss carries solar wings, radiators, a robotic arm and a ground-link antenna. The ring turns at a steady rate, and the garden deck shows through the window band on its inner wall. A shuttle docks in four steps (approach, align, contact, settle) while twelve capture hooks close one by one.

Ten camera positions can be picked one at a time, or played as a one-click tour of about 50 seconds: establishing view, truss pass, ring spin, garden deck, approach, align, docking port, hard mate, sunrise and spin axis. Drag the scene to orbit freely. Works in phone portrait.

Every shape, material, the Earth and the stars are generated in code; there are no external models, textures or generated images. The design is illustrative and does not represent any real spacecraft; scale and docking timing are compressed.

## Run and check

```sh
npm ci
node tools/build.mjs            # single file dist/index.html
node --test tests/*.test.cjs    # Node tests: docking, rotation, framing, camera continuity, material layers, budget
node tools/browser-check.cjs    # real Chrome: 20 fixed-view screenshots, phone layout, page errors
node tools/preview.cjs          # CPU composition preview for machines without WebGL (not a rendered screenshot)
```

Source entry: run `node tools/serve.cjs . 8941` and open `http://127.0.0.1:8941/dev.html`. Fixed views use `?view=establish` or `?view=1` to `?view=10` and pause at that shot's still time. `window.__PLAYTEST__` provides `ready`, `snapshot()`, `reset()`, `setSeed(n)` and `step(ms)`; snapshots report the actual view, time, docking readouts, draw calls and renderer string. See [SPEC.md](SPEC.md) for the acceptance criteria. Three.js is pinned at 0.186.1; its MIT licence is kept in the generated page.

By 我的AI小木屋 (WeChat official account) · GitHub @AliceLJY

## Who it's for, AI assets

- Who it's for: anyone who likes space stations and wants a quiet minute on a phone watching a docking and a sunrise over Earth.
- AI assets: code and documentation were completed through AI collaboration. All geometry, materials, the Earth, the stars and the animation are procedural. No AI-generated or imported images, models, motion files or sounds are used. No audio.
