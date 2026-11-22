# Xiaoju Climbs the Tower

Xiaoju, a muscular orange tabby who loves climbing, scales the twisted white steel lattice of Canton Tower in Guangzhou, racing Sanhua, a muscular calico, on the next column. Pick your own route, rest on the ring beams at the right moments, brace before the wind hits and steer around the pigeons; decide whether to take the Spider Walk stair and whether to stop for a snack at the revolving restaurant. The sky turns from afternoon to night as you rise, at 454 m the whole city lights up, and after a ride on the bubble tram or the drop ride you take a postcard from the 488 m outdoor deck.

## How to play

- Hold ↑ / W to climb along a column, ↓ / S to go down. Climbing costs stamina, let go mid-column and Xiaoju grabs the nearest ring beam, up or down, to rest; the stamina bar reads 歇脚中 (resting) while it refills.
- On a ring beam, ← → / A D moves to the next column — use it to avoid pigeons. Running into one costs stamina and pushes you back to the bottom of that segment.
- When the wind bar at the top fills, a gust starts. Hold Brace (Space) before it hits and let go when the bar has drained. Fail and you slide down to the ring below.
- Above 90 m a black kite hunts. When it locks onto your column, a red bar appears and the column glows red — move to a neighbouring column on a ring beam and its dive misses.
- Above the waist the columns lean outward and climbing costs more. The Spider Walk entrance (168 m), its exit (334 m) and the revolving restaurant (423 m) are rest platforms refill stamina and act as checkpoints; run out of stamina and you slide back to the last one.
- The sky follows Guangzhou time: daytime play stays in daylight, early evening darkens as you climb, and at night the city is lit from the start. The tower lights run 19:00–23:00 with the six chapters of its current daily show, "Bay Area New Rhythm", alternating with the classic programme; the top-left readout names the chapter. The button on the start panel switches the period by hand.
- The start panel offers 自己爬 (solo) or 跟三花姐比 (race Sanhua). She climbs the column on your screen-left; the top-left readout says how many metres above or below you she is. She rests too and gets blown off or hit by kites as well — rest too much and she pulls away, push too hard and the wind takes you down.
- At the Spider Walk entrance (168 m), press E (or tap 走栈道) to take the open-air spiral stair inside the tower up to 334 m: no wind or kites reach you there, but it is slower. Press ↑ to keep climbing outside instead.
- At the revolving restaurant (423 m) you can eat one snack (E double-skin milk, Q shrimp dumpling, or tap the buttons): +30 stamina cap for the overhanging last stretch.
- After the top, ride the bubble tram or the drop ride, then take a postcard at the 488 m outdoor deck with Haixinsha, the West Tower and the East Tower labelled (names from OpenStreetMap); you can save it.
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
- AI material: the model sheets and climbing frames of Xiaoju and Sanhua were generated with web ChatGPT; the tower, city, sky, pigeons, stair, rides and deck are built in code, the city footprints and the postcard place names come from OpenStreetMap; code written by a human with AI. Credit: 我的AI小木屋 / GitHub @AliceLJY.
