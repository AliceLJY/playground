# Lens Lab

English | [简体中文](README_CN.md)

**[Open it](https://aliceljy.github.io/playground/lens-lab/)** (the lesson text is Chinese)

An optical bench and one question: a magnifier and a projector both use a convex lens, so why does one show things upright and the other throw them upside down?

Switch on parallel light and drag the screen to the smallest, brightest spot: that is the focal point. Guess what the image looks like with the candle far away, then drag the candle and the screen until the picture is sharp: smaller, same size, larger, no image at all. Finally put the candle inside the focal length; nothing lands on the screen any more, and only "look with your eye" shows the magnifier's virtual image. Every case found fills a row of the table; after eight steps the rule is revealed.

- Thin-lens equation computed live; the picture blurs the further the screen is from the image distance. The three principal rays and the virtual image's backward extensions redraw as you drag.
- The candle clicks onto f and 2f; when the image falls past the end of the bench the page says so.
- Works on a phone in portrait and on a desktop; one offline HTML file.

## Run locally

```bash
npm ci && node tools/build.mjs     # writes dist/index.html; open it directly
node --test tests/*.test.cjs       # optics and lesson logic
```

Spec and acceptance checks: [SPEC.md](SPEC.md) (Chinese).

## Demo video

`node tools/build.mjs && NODE_PATH="$(npm root -g)" node tools/record.cjs <out.mp4>` records the whole lesson in portrait (1080×1920, real mouse drags) and writes when each case was found; `python3 tools/demo-music.py <out.events.json> <music.wav> <total seconds>` scores music to those moments.

## Who opens it, AI material

For students meeting lenses for the first time, parents helping with homework, and anyone curious what a drag-to-understand lesson can look like. The page code, the optics and every drawing (ink-line bench, candle, rays) were written with AI; no generated images, models or sounds are used, and the chime is synthesised in code.

My AI Cabin (我的AI小木屋) · Three.js (MIT)
