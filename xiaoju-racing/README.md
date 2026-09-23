# Xiaoju Racing · Pearl River Cup

A browser racing game made through human–AI collaboration. A furry orange tabby rides a bicycle against five other cats on an original Guangzhou-inspired circuit: Xiguan arcades, a shaded avenue and the Pearl River bridge.

[Play online](https://aliceljy.github.io/playground/xiaoju-racing/) · [中文说明](README_CN.md)

## Play

Choose 1–3 laps and one of three difficulty levels. Hold acceleration after the countdown. Drift through turns to charge nitro; releasing a sustained drift gives a short boost. Race position follows actual progress, and finish order uses crossing times.

| Control | Action |
|---|---|
| Arrow keys / WASD | Accelerate, brake and steer |
| Shift | Drift |
| Space | Use nitro |
| C | Change camera |
| J | Jump |
| R | Recover to the road |
| Escape / P | Pause |

Touch buttons are available on small screens; landscape is recommended. The menu includes a character close-up and a lower-cost graphics setting.

## Run, check and package

No package installation, account or API key is needed. Three.js r160 is bundled locally.

```sh
python3 -m http.server 8774
```

Open `http://localhost:8774/`. To check the simulation and generate the offline edition:

```sh
node --check src/race-core.js
node --check src/race-cat.js
node --check src/race-world.js
node --check src/race-game.js
node --test tests/*.test.cjs
python3 build.py
```

The generated file, `小橘飞车.html`, can be opened directly in a browser. It embeds the runtime, styles and game code; geometry, fur and textures are generated locally. GitHub Pages publishes this file as the project entry point after CI succeeds.

## Scope

This is a stylized arcade game, with a fictional circuit rather than real road coordinates. It has six independently simulated racers, drifting, nitro, boost pads, guardrails, soft rider contacts and timed results. The character is an original procedural model, not a photographic reconstruction. There is no multiplayer server or persistent save.

Seventeen core tests cover complete races, losing against bots, countdown, pause, recovery, drift, nitro, jumping, reverse travel, lap integrity and close finishes. Browser checks cover loading, keyboard movement, restart and desktop/mobile-size layouts. Complete races were verified in simulation; physical phones and Safari have not been tested.

## Credits

Scene geometry, characters and game code are original. Three.js retains its MIT license; see [third-party notices](THIRD_PARTY_NOTICES.md).
