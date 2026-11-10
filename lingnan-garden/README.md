# A Corner of a Lingnan Garden

A walkable scene built from a single picture. [Open it](https://aliceljy.github.io/playground/lingnan-garden/)

An AI-generated illustration of a Cantonese garden came first: a waterside pavilion, a wok-ear gable wall with a moon gate, a flagstone path, bonsai, a lotus pond, a stone arch bridge, a hexagonal pavilion on a rockery, a banyan and a kapok tree. Everything visible in that picture was then listed and rebuilt in code with Three.js as a 3D scene you can walk through in first person. The picture is only a reference; it is not used as a texture or backdrop. The page can show it next to the scene for comparison.

This is not a real garden, and the reference picture is AI-generated.

## Controls

- Postcard view: the same camera position as the reference picture.
- Walk: WASD to move, drag to look, Shift to walk faster. On a phone, a joystick appears under your left thumb; drag anywhere else to look.
- Tour: an automatic walk along the path, up the steps, through the pavilion, along the covered walkway, over the bridge and back. Any input takes over.
- Overview: the whole garden from above.

## What is in it

You can enter the pavilion; the coloured window panes show from inside as well. The covered walkway leaves the veranda, lands on a rock in the pond, and splits toward the north bank and over the bridge to the east bank. Behind the moon gate is a small bamboo court. The water reflects the scene; lotus leaves, lanterns and banana leaves move, koi swim, kapok petals fall. Sound is synthesised in the browser.

Parts hidden or outside the frame of the picture (the room, the bamboo court, both far banks, the south gate) were filled in so that a full loop is possible. The item-by-item comparison is in [SPEC.md](SPEC.md).

## Run locally

```
npm ci
node tools/build.mjs          # writes dist/index.html, a self-contained file
node tools/serve.cjs . 8973   # then open http://127.0.0.1:8973/dist/index.html
node --test tests/*.test.cjs
```

Screenshots and real-input checks need a globally installed Playwright:

```
NODE_PATH="$(npm root -g)" node tools/shots.cjs http://127.0.0.1:8973/dist/index.html shots
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs http://127.0.0.1:8973/dist/index.html shots/check
```

## Licence

Code: same as the repository. The bundle includes Three.js (MIT); its licence text is in a comment at the top of the generated file. `ref/start.jpg` is an AI-generated reference image.
