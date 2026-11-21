# Coal Balls Build Guangzhou

[中文](README_CN.md) · [Play online](https://aliceljy.github.io/playground/coal-build/)

A crew of little black coal balls carries bricks on their heads and builds old Guangzhou, brick by brick, from the footings to the ridge. An idle building game with three buildings: a qilou arcade shophouse, the Chen Clan Ancestral Hall and Zhenhai Tower.

- Each building starts as a faint outline that fills with bricks from the bottom up; the top of the screen says how many bricks are left, and "last N bricks!" near the end.
- A red target line splits the outline along the building's real parts (for the qilou: the arcade, the second and third floors, the fourth floor, the parapet and gable). Finish a part and it turns from a brick mosaic into the full painting.
- Tap the building to lay a brick yourself; spend wages on four cards: hire coal balls, enlarge the shed, train strength, raise wages. The later buildings use heavier bricks (×4 and ×12), so strength matters more.
- The round button on the left lays a big batch every 90 seconds; now and then a sweet-soup cart rolls by, and catching it makes the crew faster.
- A finished building shows the full painting and a short fact, then goes into the album and the next one opens. Progress is saved in the browser.

No instructions needed: at the start the building says "tap here"; after a few taps the hint and an arrow follow whichever card you can afford, the skill when it is ready, and the cart when it comes.

## Run locally

```bash
cd coal-build && python3 -m http.server 8971
```

Open `http://127.0.0.1:8971/`. Fixed views: `?view=hero`, `?view=stage`, `?view=done`, `?view=album`; `?seed=n` changes the seed.

## How it was made

- The idea comes from a WeChat mini game in which ants carry away a mountain block by block: progress you can see, goals written on screen, four upgrade cards, random events and a cooldown skill. The theme, name and art are our own and there are no ads; the original's watch-an-ad bonuses became the in-game sweet-soup cart.
- The three buildings were checked against sources before drawing (Chinese and English Wikipedia, the Guangzhou government site): the qilou's arcade and parapet gable; the Chen Clan Hall's painted door gods, pair of stone drums, large brick carvings and ceramic ridge; Zhenhai Tower's two storeys of red stone under three of grey brick and five green-glazed eaves.
- The three front elevations were generated with ChatGPT on the web. The offline script `tools/bake.py` keys out the flat background and averages each brick cell, so the bricks form a mosaic of the very painting that is revealed.
- The coal balls are drawn in code after the character sheet: matte black round body, white sticker outline, white dot eyes, a short flat mouth, a thin antenna with a pink ball, two thin legs, no arms.

## Checks

- `src/core.js` holds the rules (economy, upgrades, events, hints, layout) and runs in Node. `tests/core.test.cjs` follows section 8 of `SPEC.md`. Run `node --test tests/*.test.cjs` in this folder.
- `tools/browser-check.cjs` runs three screens and five fixed views in a real browser, plays the opening with touch taps, lets an autopilot finish the first building with screenshots, and checks the save across a reload.
- Pacing was tuned with autopilots only; whether it is fun needs people. The first version is silent and has not been tried on a real phone yet.

## Who opens this, AI assets

- Who opens this: someone who wants something to leave running on a phone for a few minutes; people who know Guangzhou's arcades and the Chen Clan Hall.
- AI assets: the three building paintings were generated with ChatGPT; the coal balls, bricks, cart and interface are drawn in code; no sound; the code was written by a person in collaboration with AI.

© 我的AI小木屋 · GitHub @AliceLJY. All rights reserved, see [LICENSE](../LICENSE).
