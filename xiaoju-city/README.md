# Xiaoju City

Ride an orange cat’s bicycle through a cartoon Guangzhou neighbourhood. Fourteen glowing doorways link to existing games, toys and 3D exhibits in this repository. On the title screen, an arcade building, Chen Clan Ancestral Hall and Zhenhai Tower dance to a synthesized beat.

[中文说明](README_CN.md)

## Play

- Use arrow keys or WASD to ride, Shift / B to boost, E to stop, and M for the map. Touch controls provide the same actions.
- Automatic pedalling starts on; road-following assistance starts off. Riding through a circle only shows a hint. Stop below 1 km/h for 0.6 seconds, press E, or use “停下来看看” to open its card.
- The main card button saves position, heading, journal visits and driving preferences before opening `../<exhibit id>/`. For six hours, the title screen offers both “回到刚才的地方” and “从头逛”. If storage is unavailable, a fresh ride still works without errors.
- Destinations are grouped by neighbourhood and support automatic navigation. Arriving and parking opens the entrance card.
- The top journal button counts exhibit visits as N / 14 and increments after entering an exhibit. The three original rest-stop stamps remain separate inside the journal. The calico race, postcards, automatic pedalling and bicycle recovery remain available.

## Run and test locally

Three.js r160 and all assets are local. No dependencies, API keys or CDN access are needed. Serve the repository root so the relative exhibit links resolve to real directories:

```sh
python3 -m http.server 8765
```

Open `http://localhost:8765/xiaoju-city/`. Reproducible views are `?view=title`, `?view=hotspot` and `?view=map`: the dancing title, a card reached by real navigation, and a route to Thirteen Hongs.

```sh
cd xiaoju-city
node --check src/core.js
node --check src/game.js
node --test tests/*.test.cjs
python3 build.py
```

The build creates `小橘逛花城.html`, a single file containing CSS, JavaScript, Three.js and every `assets/*.webp` as data URIs. No separate assets directory is needed for that artifact. `shots/` contains local verification evidence and is excluded from the publishing allowlist.

See [VERIFICATION.md](VERIFICATION.md) for measurements, browser commands and limitations. Credit: 我的AI小木屋 / GitHub @AliceLJY.

## Who it's for, AI assets

- Who it's for: Visitors unsure which project to open first; ride around and choose whichever doorway looks inviting.
- AI assets: The three building elevations were generated with ChatGPT on the web, shared with “小黑煤球盖广州”. The neighbourhood and cats are original procedural models. Code is human–AI collaboration.
