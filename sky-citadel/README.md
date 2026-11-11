# Sky Citadel

A small city held above the clouds: carved limestone, ribbed teal domes, four outlying islands, suspended bridges and a waterfall that dissolves into mist. Drag the miniature, change its light, or board the copper airship.

Everything is generated in JavaScript. The city contains 463,099 occupied voxels; the ship adds 15,371 and the flags add 84. Interior faces are discarded before a few coloured meshes are uploaded. Local corner occlusion is baked into vertex colours. No models, image textures, fonts or audio are downloaded.

## Run and check

```sh
npm ci
node tools/build.mjs
node --test tests/*.test.cjs
NODE_PATH="$(npm root -g)" node --test tests/*.browser.cjs
node tools/browser-check.cjs
```

Open `dist/index.html` directly. It contains the application and Three.js in one file. The browser checker uses the installed Playwright and Chrome; it also resolves Playwright from `/opt/homebrew/lib/node_modules` when it is not on Node's normal module path. It writes screenshots, measured performance, interaction results and an opening recording into `shots/`.

To inspect the unbundled source:

```sh
node tools/serve.cjs . 8947
# In another terminal:
node tools/browser-check.cjs http://127.0.0.1:8947/dev.html shots/source
```

The optional checker arguments are `[base-url] [output-directory]`, including a deployed URL beneath a subdirectory. The page itself makes no external requests. Nothing in this task publishes the page or modifies the repository's landing page or CI.

## Explore

- Drag to orbit; scroll or pinch to zoom; right-drag or use two fingers to pan. Camera distance and the pan target are bounded.
- Touching the scene takes control immediately. On the normal entry, the slow orbit resumes after twelve seconds without input.
- Click the airship to follow it. Click it again, or use the flight button, to return.
- Click a landmark or its named button to move closer and read a short description.
- Drag the time slider continuously, or choose dawn, noon, dusk or midnight. Pause stops water, clouds, flags and the patrol; the camera remains usable.

`?view=hero`, `?view=wide` and `?view=night` freeze the same seed at animation time 12 seconds, using the ordinary renderer and adaptive quality. Continue motion with the pause button. Night is an architectural close view and intentionally crops some distant roots/island edges; hero and wide show the complete static silhouette.

The default retains the C city materials and lighting, with clean blue skies, a bright peach sunset horizon and cool cloud shadows. Spatial sky gradients and time transitions use OKLCH with hue-preserving gamut mapping. Earlier palette parameters fall back to the default. Run `node tools/palette-shots.cjs` to render the saved fourth-round baseline and current build into four before/after comparisons with sky-row colour strips. The local pixel tests measure both isolated GPU skies and the final CSS compositing, alongside the city masks from SPEC A11. Sky and cloud thresholds are in SPEC A12.

## Rendering budget

Visible animation is capped at 30 fps. Desktop DPR is capped at 1.5, phone DPR at 1.25, including landscape touch devices. Three adaptive resolution levels use sustained slow samples, a cooldown and slow recovery. Hidden pages and non-intersecting canvases cancel their animation loop; a paused view renders at 10 fps for camera damping. A cached 2048² sunlight shadow map updates initially and at most twice a second while the lighting changes. Warm window voxels share one emissive material; only two local, non-shadowed lights supplement the sun and hemisphere.

The normal dusk frame submits 13 draw calls and 299,370 triangles; a shadow update uses 14 calls. Night adds the star field, reaching 14 calls normally and 15 on a shadow update. The triangle peak is 575,354. Smoke, falling water and mist total 348 particles, with 86 analytic cloud sprites (mist and clouds share one draw call, offsetting the sky gradient) and a separate 500-point night sky. There is no full-screen postprocessing pass or frame-time geometry generation. Thermal behaviour was not measured.

`window.__PLAYTEST__` provides `ready`, `snapshot()`, `reset()`, `setSeed(n)` and `step(ms)`. Snapshots include actual renderer draw calls, triangles, GPU name, capped DPR, quality, JS update and submission time and current camera/animation state. Diagnostic controls require `?debug=1` or the browser checker’s injected development flag. See [SPEC.md](SPEC.md) and [VERIFICATION.md](VERIFICATION.md) for the acceptance criteria and evidence. Three.js 0.186.1 is bundled under MIT; its licence is retained in the generated HTML.

## Who it's for, AI assets

- Who it's for: Anyone who wants a quiet few minutes looking around a detailed floating miniature, on a computer or a phone.
- AI assets: Code and documentation were completed through AI collaboration. All geometry, colours, ambient occlusion and particles are procedural. The application uses no AI-generated or imported images, models, motion files or sounds. No audio is used.
