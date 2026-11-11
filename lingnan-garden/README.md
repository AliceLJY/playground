# A Corner of a Lingnan Garden

A walkable scene built from a single picture. [Open it](https://aliceljy.github.io/playground/lingnan-garden/)

The work started with reading: what sets Lingnan (Cantonese) gardens apart from gardens elsewhere, with sources for each point in [facts.md](facts.md) (in Chinese). A prompt written from those notes produced an AI illustration, and everything visible in that picture was then listed and rebuilt in code with Three.js as a 3D scene you can walk through in first person. The picture is only a reference; it is not used as a texture. "Compare" in the page shows it next to the scene.

After the first build the scene was revised against photographs of the three gardens (pond railings, woodwork and overall colour, Manchurian windows, pond water, plaster relief), so those parts differ from the reference picture on purpose; the photographs were used for comparison only and are not in the page or the repository. This is not a real garden. It is an illustrative corner assembled from typical features of Yuyin Shanfang, Qinghui Yuan and Ke Yuan, and the reference picture is AI-generated.

The first version followed a different picture whose prompt asked for white walls, a naturally curved pond, a stone arch bridge, a zigzag walkway and pale rockery, which is the Jiangnan manner rather than the Lingnan one, so the scene was rebuilt.

## Controls

- Postcard view: the same camera position as the reference picture.
- Walk: WASD to move, drag to look, Shift to walk faster. On a phone, a joystick appears under your left thumb; drag anywhere else to look.
- Tour: an automatic walk out through the door in the north wall, along the alley and behind the hall, up to the covered walkway, into the hall, over the covered bridge, into the octagonal pavilion and back. Any input takes over.
- Overview: the whole courtyard from above.

## What is in it

A small courtyard enclosed by grey brick walls on granite bases. On the north side an open hall faces a rectangular, stone-lined lotus pond: grey tiled roof, a plaster ridge and gable panels with painted lime relief, eight Manchurian windows (hexagonal lattice with blue and white glass and a red flower), a band of oyster-shell panes above them, and a firecracker vine at the west end of the veranda. A covered walkway leaves the veranda and turns south over a covered bridge; the channel under its arch leads to an octagonal pool with an octagonal pavilion in the middle. Against the east wall stands a rockery of Ying stone with a thin waterfall. In the yard: a brick planter with three elm bonsai, a stone table and drum stools, a large jar, two yellow wax stones and a lychee tree in fruit; a kapok leans in over the wall and a grey brick tower shows beyond.

You can enter the hall and look up at the open roof frame. The water reflects the scene; lotus and banana leaves move, koi swim, kapok petals fall. Sound is synthesised in the browser.

Parts hidden or outside the frame of the picture (the room, the alley, the yard behind the hall, the slab bridge to the pavilion, the south gate) were filled in with the same researched features so that a full loop is possible. The item-by-item comparison and a checklist of Lingnan features (present, deliberately left out, or illustrative only) are in [SPEC.md](SPEC.md) (in Chinese).

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

## Who might open this, and what is AI-made

Anyone curious about how a Cantonese garden differs from a Suzhou one, and happy to wander for two or three minutes instead of reading about it.

AI-generated or AI-assisted: the reference picture (`ref/start.jpg`) is AI-generated; the scene code, the procedural textures and this README were written with AI assistance; sound is synthesised in the browser. No model files, photographs or recordings are used. Sources for the garden features are in [facts.md](facts.md); items marked 示意 (illustrative) there were not confirmed.
