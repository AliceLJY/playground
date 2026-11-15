# Mac mini SSD Swap · a 21-step teardown bench

[中文](README_CN.md)

My Mac mini (M4, 2024) is running out of disk. Some people just open it and swap in a bigger SSD board. I didn't dare, so this page takes it apart for me in 3D, following iFixit's SSD replacement guide step by step: flip it, pry the four pins, unscrew the inner plate and the fan, release the ZIF cable, then pull the SSD module. A row of counters keeps climbing: steps, screws, bits, connectors. On the way it glances at the memory: LPDDR5 packages soldered next to the M4, so there is nothing to add. The SSD looks like a normal M.2 drive, but it has no storage controller (that lives in the M4), so a normal M.2 SSD won't work. The page text is Chinese.

Left alone, the page tours itself for 53 seconds; touch it and it is yours: turn the dial, press previous / next or ← →, take it apart or put it back. After 25 idle seconds the tour comes back.

Live: https://aliceljy.github.io/playground/mac-mini-teardown/

## Where the numbers come from

| Number | Source |
|---|---|
| 21 steps; bottom cover held by 4 pins, no screws; 13 screws (T5 ×8, 3IP ×2, 5IP ×2, 8IP ×1); 4 bits; 3 connectors (power button cable, optional; fan ZIF; SSD socket) | iFixit guide 180199, *How to Replace the SSD in your Mac mini (2024)* |
| Memory is LPDDR5 packages next to the M4; the SSD carries one 128 GB NAND package per side | iFixit chip ID 178986 |
| "Looks like a normal M.2 SSD but lacks a storage controller; normal M.2 SSDs are incompatible" | Introduction of guide 180199 |
| 12.7 × 12.7 × 5.0 cm, 0.67 kg (M4) | Apple Support, Mac mini (2024) Tech Specs |
| A third-party larger SSD board needs a DFU restore, which erases the internal drive | The author's own research, September 2026 |

`data/` keeps the step text of both guides (extracted from the iFixit API by `tools/extract-ifixit.py`); `tests/` parse it directly. Internal part sizes, positions and package counts are illustrative, placed by the relative positions the steps describe.

## How it is built

- One input drives everything: teardown progress `s` (0–23). `src/model.js` is pure functions that pose every part, compute the counters and draw the side view; the 3D model, the cards, the dial and the tests all read it.
- The whole machine is built in code (`src/machine.js`): no model files, no images.
- The tour is an `s(t)` curve plus camera, captions and a cursor (`src/tour.js`).
- Method borrowed from the teardown workflow (model before pixels, still-frame review, self-driving tour, a film rendered as a pure function of time); the code is new, like [The Flashiest Guy in Town](../gz-roach/).

## Run locally

```bash
npm ci
node --test tests/*.test.cjs
node tools/build.mjs                  # → dist/index.html, one offline file
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs ./check
```

## Known limits

- Steps, screws, connectors, memory and flash follow iFixit; internal part sizes and positions are illustrative, not measured on a real unit.
- "I worried about the warranty" is the author's own concern, not a statement about Apple's warranty policy.
- Not tried on a real phone; frame rate measured only in headless Chrome on one Mac mini (M4). The page is silent; the film's score is synthesised in code.

## License

Page source belongs to the author. Three.js keeps its MIT license (full text at the top of the published file); the iFixit step text in `data/` is CC BY-NC-SA 3.0. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Who might open this, AI assets

- Who might open this: anyone with a Mac mini that is filling up, wondering whether to open it and swap the drive.
- AI assets: no images, models or recorded sounds (the film's score is synthesised); the machine is generated in code; the code was written by a person working with AI.
