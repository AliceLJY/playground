# Aju’s Guangzhou Ride

A small browser game made through AI collaboration: ride an orange cat’s bicycle through a colourful Guangzhou-inspired neighbourhood, or accept a friendly challenge from a calico cat.

[Play the demo](https://aliceljy.github.io/aju-guangzhou-ride/) · [中文说明](README_CN.md)

## Play

Use arrow keys or WASD to accelerate, brake and steer. Hold Shift or B to boost. The touch layout has equivalent buttons. Automatic pedalling is on by default; automatic navigation is off. Release steering to keep your current heading.

Click the small map to open the neighbourhood guide. Choose the tea house, court or riverside stop and explicitly start navigation. The bicycle follows connected streets and garden paths, then parks at the destination. You can cancel navigation at any time.

Explore the garden paths and court, ring the bell with Space, visit nearby stops with E, pause with P or Escape, and recover to a road with R. Faster obstacle impacts trigger a fall and automatic remount. Ride into the river and the cat returns to shore. Save a 2880 × 2080 PNG postcard with the photo button.

The calico challenge is optional, with a countdown and five ordered checkpoints. You can leave the race and continue exploring.

## Run and test locally

No API key, account, build dependencies or paid service is required. Three.js r160 is included locally.

```sh
python3 -m http.server 8765
```

Open http://localhost:8765. To validate the simulation and create an offline single-file copy:

```sh
node --check src/core.js
node --check src/game.js
node --test tests/*.test.cjs
python3 build.py
```

The generated file is `阿橘的广州慢游.html`. GitHub Actions runs these checks, packages the game, and publishes the generated page after pushes to `main`. The public URL stays the same across updates; existing tabs need a refresh.

## Demo scope

Version 0.1 is an artistic neighbourhood inspired by Guangzhou. Streets, distances and building placement are fictional, not a real map or street-view service. The calico follows a fixed course. There is no multiplayer, car traffic or persistent save; refreshing restarts the ride. Building details repeat. Desktop Chrome and a simulated mobile viewport have been tested; physical phones and Safari have not.

## Credits

The game uses original procedural scene geometry. Three.js is distributed under its MIT license; see [third-party notices](THIRD_PARTY_NOTICES.md).
