# Sacred Heart Cathedral, Guangzhou · an architectural tour in pure code

Live: https://aliceljy.github.io/playground/sacred-heart-cathedral/

The twin-spired granite cathedral on Yide Road in Guangzhou, built entirely in code. Orbit the south front with its three portals, rose window and pair of octagonal stone spires, the flanks with their clerestory windows, flying buttresses and row of side chapels, and the apse at the north end. Or walk in through the gate, up five steps and through the central door into the nave: two rows of clustered piers, brick rib vaults, the tall apse windows, and coloured light from the glass falling on the floor and piers. Three kinds of daylight: in the morning the east windows are lit, in the evening the west ones, at noon the rose in the south front.

- **Controls**: orbit (drag to rotate, wheel or pinch to zoom, right-drag to pan), walk (WASD plus drag; on a phone, a joystick at lower left plus drag), fly (WASD along the view, Space up, Q down). Eighteen viewpoints in the side panel; the dots on the small plan are clickable too.
- **No asset files**: every shape, stone texture and window is drawn at run time. Three.js is bundled into the single file.
- **Not a survey**: [facts.md](facts.md) lists which facts were checked against two sources, which proportions were measured off photographs, and which parts are placeholders. The figures in the glass are blocks of colour, not copies of any real window.

## Run it

```bash
npm ci
node tools/build.mjs            # writes dist/index.html
node tools/serve.cjs . 8947     # source entry /dev.html, bundle /dist/index.html
node --test tests/*.test.cjs
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs http://127.0.0.1:8947/dist/index.html
NODE_PATH="$(npm root -g)" node tools/shots.cjs http://127.0.0.1:8947/dist/index.html shots
NODE_PATH="$(npm root -g)" node tools/compare.cjs http://127.0.0.1:8947/dist/index.html <photo-dir> <out-dir>
```

Spec and acceptance items are in [SPEC.md](SPEC.md). `tools/compare.cjs` needs a folder of reference photographs (file names are in the script); the photographs are not in this repository, and their sources are listed at the end of `facts.md`.

## Who this is for, and AI material

For anyone who wants to wander round the cathedral on a phone and see how a Gothic church holds itself up. All code, geometry and textures were made with AI assistance (Claude); there are no external models, images or audio. The building facts come from public sources, the proportions were measured off photographs on Wikimedia Commons, and the detailing is indicative. The interface shell is this repository's FORMA tour layout, a companion to the Sagrada Família page.
