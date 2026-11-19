# Sui Sui Ping An · Smash it

[中文版](README_CN.md)

A dark wooden curio shelf holds blue-and-white plates, a meiping vase, a lidded tea bowl, a glass, a clay jar, a candle, an ice cream, a balloon, a storm cloud, a pixel critter, and a few sticky notes with small worries written on them. Tap one and it breaks the way its material would: porcelain and glass crack into shards, the jar crumbles into sand, a note burns from the edge into sparks, the candle and the ice cream melt, the balloon pops, the cloud is pulled into a whirl. A new thing drops into the empty slot a moment later, so you can keep going.

**[Play online](https://aliceljy.github.io/playground/suisui/)**

Works on phones (portrait or landscape) and desktop. No score to chase, no way to lose.

## How to play

- **Tap**: breaks by material; porcelain cracks from where you tapped.
- **Hold**: a gold charge bar fills at the top of the slot, the thing heats up and shakes harder, and bursts on its own after one second; let go early and it bursts at whatever heat it reached.
- **Press and swipe**: it is flung along your swipe.
- **Write a worry**: up to ten characters, stuck onto the shelf for you to burn.
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
- Everything on the shelf is drawn in code; there are no image files. The blue-and-white patterns and the pixel critter are drawn here.
- All sounds are synthesised on the spot with Web Audio; there are no audio files.

## Who opens this, AI assets

- Who opens this: anyone who wants to smash something without smashing anything; people tapping around on a phone for a minute.
- AI assets: no AI-generated images, models, motion or sound; everything on screen is drawn by code and every sound is synthesised in code. The code was written by a person in collaboration with AI.
