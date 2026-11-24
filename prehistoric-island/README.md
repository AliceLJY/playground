# Prehistoric Island

A small volcanic island cut out of the sea together with its water and sea floor, like a block on a display stand. Above the water: a crater with a little lava pool and smoke, conifers, cycad-like trees, ferns and a sand beach; long-necked plant-eaters walk the east shore and gliding reptiles circle the summit. Below the water the cut shows a shallow reef flat with branching and mound corals, sea fans, sea lilies and spiral-shelled swimmers, then a drop-off to the deep floor and a trench along one side, where a long-necked sea reptile patrols. Two fish schools sweep the reef edge.

Six camera positions can be picked one at a time, or played as a one-click tour of 48 seconds: overview, underwater cutaway, reef flat, trench, beach and crater. Drag the scene to orbit freely. Works in phone portrait.

Every shape and colour is generated in code; there are no external models, textures or generated images. The shapes are illustrative, not a reconstruction, and the animals shown together did not necessarily live at the same time.

## Run and check

```sh
npm ci
node tools/build.mjs            # single file dist/index.html
node --test tests/*.test.cjs    # Node tests: terrain, creatures, framing, camera continuity, materials, budget, page wording
node tools/browser-check.cjs    # real Chrome: 12 fixed-view screenshots, layout, pixel readings, mouse drag, page errors
node tools/preview.cjs          # CPU composition preview for machines without WebGL (not a rendered screenshot)
```

Source entry: run `node tools/serve.cjs . 8941` and open `http://127.0.0.1:8941/dev.html`. Fixed views use `?view=overview` or `?view=1` to `?view=6` and pause at that shot's still time. `window.__PLAYTEST__` provides `ready`, `snapshot()`, `setView(name)`, `reset()`, `setSeed(n)` and `step(ms)`. See [SPEC.md](SPEC.md) for the acceptance criteria and for what has not been verified yet (the look on a real GPU, draw calls and frame rate). Three.js is pinned at 0.186.1; its MIT licence is kept in the generated page.

By 我的AI小木屋 (WeChat official account) · GitHub @AliceLJY

## Who it's for, AI assets

- Who it's for: anyone who likes islands, reefs and prehistoric animals and wants a quiet minute on a phone looking above and below the waterline.
- AI assets: code and documentation were completed through AI collaboration. All geometry, colours and animation are procedural. No AI-generated or imported images, models, motion files or sounds are used. No audio.
