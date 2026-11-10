# Thirteen Hongs Waterfront

The foreign factories of Canton on the north bank of the Pearl River, around 1805: a row of Western-fronted trading houses, the open ground and flagstaffs before them, stone landing steps and a jetty, and a river busy with sampans, chop boats, flower boats and junks. Look from above, walk in at eye level, or follow a tea lighter, a porter, a hong merchant, a hawker, a boat family's sampan or a junk.

[Open it](https://aliceljy.github.io/playground/thirteen-hongs/)

## What is in it

- Thirteen factories in their documented order, with Old China Street and Hog Lane between them, both walkable.
- About 175 people (porters, hong merchants, linguists, clerks, foreign traders, sailors, hawkers, boatwomen) each busy with something, and 29 boats.
- A set piece that plays every four minutes or so: a tea lighter comes alongside the jetty, the merchant and the supercargo check the weighing, five porters carry fifteen chests aboard one by one, the sail goes up and the boat leaves for Whampoa. The bar at the bottom shows its progress; tap it to follow, and tap the speed button for four times speed.
- Water, crowd murmur, sculling, a gong, a temple bell and hawkers' calls shaped after Cantonese tone contours, all synthesised in the browser.

## Controls

Desktop: drag to look, WASD to walk, Shift to hurry, wheel to zoom. Phone: joystick at lower left, drag elsewhere to look, pinch to zoom.

## What is documented and what is not

See [facts.md](facts.md) (in Chinese). The order of the factories, the two lanes, the six flags and the weighing and loading of tea have sources. Colours, bay counts, stalls, head counts and boat details are indicative only; this is not a reconstruction.

## Run and check locally

```
npm ci && node tools/build.mjs          # bundles into dist/index.html
node --test tests/*.test.cjs            # 9 logic tests
node tools/serve.cjs . 8947
NODE_PATH="$(npm root -g)" node tools/shots.cjs http://127.0.0.1:8947/dist/index.html shots/x
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs http://127.0.0.1:8947/dist/index.html shots/y
```

Spec and fixed camera views are in [SPEC.md](SPEC.md) (in Chinese).

## Who this is for, and AI material

For anyone curious about old Canton and export paintings with two or three minutes to wander. All code was written with AI assistance. There are no models, image files or audio files: every shape, flag, signboard and sound is generated in code at run time. Rendering uses Three.js (MIT).
