# Third-party notices

## Three.js

`vendor/three.module.js`, `vendor/OrbitControls.js` and `vendor/RoomEnvironment.js` are the files `build/three.module.js`, `examples/jsm/controls/OrbitControls.js` and `examples/jsm/environments/RoomEnvironment.js` from the npm package `three@0.160.0` (r160), byte for byte (`tests/publish.test.cjs` pins their SHA-256). Three.js is MIT licensed; the license text and copyright notice are in `vendor/THREE-LICENSE.txt`.

The header of `RoomEnvironment.js` credits Google's model-viewer (`EnvironmentScene.ts`) as the origin of the scene. The file is shipped unchanged as part of the three.js package. model-viewer itself is licensed under Apache-2.0 (https://github.com/google/model-viewer); the scene reaches this folder only through the three.js release above.

## Gear code

The tooth-shape functions in `src/gear-profile.js` were written by DeepSeek Harness (dsh), an AI agent shell, in two versions: its first generation and its own repair. The function bodies are kept as written (the only mechanical change is that `THREE` is passed in as a parameter); `tests/fixtures/` holds the original text they are compared with. The 2D overlap test in `src/gear-mesh.js` is a port of the check script dsh wrote for its repair, with a faster implementation next to it that is verified against the port frame by frame.

Everything else in this folder (page, camera framing, markers, tests, tools) was written for this project. There are no external images, fonts, audio or models.
