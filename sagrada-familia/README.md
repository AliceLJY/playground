# Sagrada Família · a guide built in code

Live: https://aliceljy.github.io/playground/sagrada-familia/

The Sagrada Família, built from code alone. Orbit the eighteen towers, the three façades, the apse and the chamfered Eixample blocks around them; click a place in the right-hand list and the camera flies there; or walk in through a door on any façade and look at the branching columns, the vaults with their skylights, and the coloured light that the side windows throw on the floor and the columns. Three lighting presets: in the morning the Nativity side burns blue and green, in the evening the Passion side burns red, orange and yellow.

- **Controls**: orbit (drag, wheel or pinch, right-drag to pan), walk (WASD and drag; on a phone a joystick at lower left and drag elsewhere), fly (WASD along the view, Space up, Q down).
- **No asset files**: every shape, texture and window pattern is drawn at run time. Three.js is bundled into the single HTML file.
- **Not a survey**: [facts.md](facts.md) lists which numbers were checked and which parts are indicative. The Glory façade and its four towers are not built yet in reality.

## Run it

```bash
npm ci
node tools/build.mjs            # writes dist/index.html
node tools/serve.cjs . 8957     # source entry /dev.html, bundle /dist/index.html
node --test tests/*.test.cjs
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs http://127.0.0.1:8957/dist/index.html
NODE_PATH="$(npm root -g)" node tools/shots.cjs http://127.0.0.1:8957/dist/index.html shots
```

Spec and acceptance items are in [SPEC.md](SPEC.md) (Chinese).

## Who this is for, and AI material

For anyone who wants to wander around the Sagrada Família in a browser without waiting for a model to download. All code, geometry and textures were produced with an AI assistant (Claude); there are no external models, images or audio. Building facts come from public sources and the detailing is indicative. The demo it is measured against comes from a video by the channel AI超元域; the interface shell follows the author's earlier FORMA guide.

## Round 2 (2026-11-11)

The three façades are rebuilt from grouped parts and moved in front of the bell towers; towers gain ribs and louvre rings; columns have a twisting ribbed section; light shafts are now ray-marched volumetric light; there are three quality levels (button at the right of the footer, steps down automatically when frames drop) and collision for the Glory porch columns. Comparison script: `tools/compare2.cjs`.
