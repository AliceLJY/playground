# Sui Sui Ping An · Smash it

[中文版](README_CN.md)

A rosewood curio shelf turned museum case, a small spotlight in every slot, holds lifelike collectibles: a blue-and-white meiping vase and charger, a Ru-ware celadon cup, a coloured-glass lotus cup, a white jade bi disc, a sancai horse, a Yixing teapot, a stitched old book, a red candle, a sugar-painting dragon, a string of firecrackers and a bronze censer, plus a few gold-flecked red paper slips with small worries brushed on them. Tap one and it breaks the way its material would: porcelain, jade and glass crack into shards, the horse and the teapot crumble into sand, a slip burns into sparks, the book blows away, the candle and the sugar melt, the firecrackers go off, the censer is pulled into a whirl with its smoke. A new thing drops into the empty slot a moment later, so you can keep going.

**[Play online](https://aliceljy.github.io/playground/suisui/)**

Works on phones (portrait or landscape) and desktop. No score to chase, no way to lose.

## How to play

- **Tap**: breaks by material; porcelain cracks from where you tapped.
- **Hold**: a gold charge bar fills at the top of the slot, the thing heats up and shakes harder, and bursts on its own after one second; let go early and it bursts at whatever heat it reached.
- **Press and swipe**: it is flung along your swipe.
- **Write a worry**: up to ten characters, brushed onto a red paper slip and set on the shelf for you to burn.
- **Smash all**: the whole shelf breaks in one wave from top left to bottom right, then fills up again.
- Sound can be switched off at the bottom right; the counter at the top right stays in your own browser only.

The name is a Chinese saying for when something breaks: "broken pieces, peace every year" (*sui* "broken" sounds the same as *sui* "year").

## Run locally

```bash
cd suisui && python3 -m http.server 8971
```

Open <http://127.0.0.1:8971/>. Fixed views: `?view=hero` (the opening shelf), `?view=burst` (the first slot just broken), `?view=note` (the worry dialog).

## Checks

```bash
node --test tests/*.test.cjs                                          # rules, repeat caps, variant names, particle budget
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <output-dir>   # real tap, hold, swipe, write and smash-all on three screens
```

Spec and acceptance items are in [SPEC.md](SPEC.md) (Chinese). Whether it feels good, sounds good and whether the shake is too much still needs a person with a phone.

## Assets and sources

- The particle engine is the Canvas 2D port from [rs-4/dissolve](https://github.com/rs-4/dissolve) (MIT), kept unmodified in `vendor/dissolve-atlas.js`; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
- The collectibles are lifelike studio shots generated with ChatGPT on the web (not photos of real museum pieces), keyed off their black background and cut into sprites by `tools/cutout.py`; the paper slips are drawn in code.
- All sounds are synthesised on the spot with Web Audio; there are no audio files.

## Who opens this, AI assets

- Who opens this: anyone who wants to smash something without smashing anything; people tapping around on a phone for a minute.
- AI assets: the twelve collectible images were generated with ChatGPT; the slips, the case and the interface are drawn in code and every sound is synthesised in code, no AI-generated sound. The code was written by a person in collaboration with AI.
