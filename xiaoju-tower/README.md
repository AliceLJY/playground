# Xiaoju Climbs the Tower

Xiaoju, a muscular orange tabby who loves climbing, scales the twisted white steel lattice of Canton Tower in Guangzhou. Pick your own route, rest on the ring beams at the right moments, brace before the wind hits and steer around the pigeons. The sky turns from afternoon to night as you rise, and at 454 m the whole city lights up.

## How to play

- Hold ↑ / W to climb along a column, ↓ / S to go down. Climbing costs stamina, let go mid-column and Xiaoju grabs the nearest ring beam, up or down, to rest; the stamina bar reads 歇脚中 (resting) while it refills.
- On a ring beam, ← → / A D moves to the next column — use it to avoid pigeons. Running into one costs stamina and pushes you back to the bottom of that segment.
- When the wind bar at the top fills, a gust starts. Hold Brace (Space) before it hits and let go when the bar has drained. Fail and you slide down to the ring below.
- Above the waist the columns lean outward and climbing costs more. Rest platforms at about 109, 227 and 336 m refill stamina and act as checkpoints; run out of stamina and you slide back to the last one.
- The sky follows Guangzhou time: daytime play stays in daylight, early evening darkens as you climb, and at night the city is lit from the start. The tower lights run 19:00–23:00 with the six chapters of its current daily show, "Bay Area New Rhythm", alternating with the classic programme; the top-left readout names the chapter. The button on the start panel switches the period by hand.
- On phones, Brace is bottom-left and the arrows bottom-right. Drag the scene to swing the camera a little.

## Run and check locally

```sh
python3 -m http.server 8765    # inside xiaoju-tower
```

Open `http://localhost:8765/`. Fixed views: `?view=base`, `?view=waist`, `?view=top`; add `&seed=3` to pin pigeons and gusts.

```sh
node --check src/core.js && node --check src/game.js
node --test tests/*.test.cjs
python3 build.py                                   # single-file 小橘爬塔.html
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs http://127.0.0.1:8765/ shots
```

`tools/build-city.py` cuts the city out of the OpenStreetMap Guangdong extract (needs osmium-tool), 4.2 km around the tower. `tools/key-sprites.py` keys the character frames out of a green-screen sheet. Measured numbers and gaps are in [VERIFICATION.md](VERIFICATION.md).

## Who opens this, AI material

- Who opens this: anyone who has looked up at Canton Tower and wanted to climb it once.
- AI material: Xiaoju's model sheet and the three climbing frames were generated with web ChatGPT; the tower, city, sky and pigeons are built in code, the city footprints come from OpenStreetMap; code written by a human with AI. Credit: 我的AI小木屋 / GitHub @AliceLJY.
