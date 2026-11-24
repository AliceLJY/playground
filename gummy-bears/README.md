# Gummy Bears

A handful of translucent gummy bears on a white table: cherry red, orange, lemon yellow, apple green and an almost clear pineapple. Grab any bear by any part and pull: pull the head and the neck stretches first while the body is dragged along; pull an ear or a leg and that part thins out. Press one down and it bulges; fling it and let go, and it flies, squashes on landing, bounces and shoves the bears it hits. Every bear springs back to its own shape after you let go, and bears never pass through each other or the table. "再倒一些" (pour some more) drops another handful from above, building a wobbly pile that settles after a while.

The small card on the right picks which flavours get poured, sets how soft the bears are, and shows the stretch and bounce live. Works on a computer and in phone portrait, with a mouse or a finger. Phones get one step down: no refraction and fewer bears.

Every shape, colour and shadow is generated in code; there are no image, model or font files. The soft-body physics is written for this page too (a tetrahedral lattice with position-based constraints) and bundled with Three.js into one file.

## Run and check

```sh
npm ci
node tools/build.mjs              # single file dist/index.html
node --test tests/*.test.cjs      # Node tests: back to shape after a full pull, no pass-through, pile settles, reset, same seed, framing, mesh, single file
node tools/browser-check.cjs      # real Chrome: 8 screenshots, layout, pixels, mouse and touch drag, page errors
node tools/preview.mjs            # CPU composition preview for machines without WebGL (not a rendered screenshot)
```

Source entry: run `node tools/serve.cjs . 8941` and open `http://127.0.0.1:8941/dev.html`. `?seed=n` changes the seed and `?quality=low` forces the phone tier. `window.__PLAYTEST__` provides `ready`, `snapshot()`, `reset()`, `setSeed(n)`, `step(ms)`, `grab(bear, part, [x, y])`, `release()`, `pour()` and more. See [SPEC.md](SPEC.md) (in Chinese) for the bear cap, what the phone tier drops, the budget, the acceptance criteria and what is still unverified (look on a real GPU, frame rate, phone hardware). Three.js is pinned at 0.186.1; its MIT licence is kept in the generated page.

Vertical demo video (1080×1920, run by hand, not a check; the phone viewport picks the low tier, as on a phone). Start `node tools/serve.cjs . 8982` first:

```bash
NODE_PATH="$(npm root -g)" node tools/demo.cjs <output-dir> --endcard <endcard-template-dir>   # takes over the page clock, steps frame by frame, real touches (pull, fling, pour), records the page's own sound
~/.local/share/sweety-statechart-video/venv/bin/python -I tools/demo-sound.py <output-dir> <film.mp4>   # music bed under the page's sounds, loudness to -12 LUFS (needs numpy and ffmpeg)
```

The demo only pulls, flings and pours; it never presses a bear down (pressed bears still wrinkle, see SPEC.md).

By 我的AI小木屋 (WeChat official account) · GitHub @AliceLJY

## Who it's for, AI assets

- Who it's for: anyone who likes squishing things, jelly and putty, and wants to grab a few gummy bears on a computer or phone, pull them, fling them and pour a pile to watch it wobble.
- AI assets: code and documentation were completed through AI collaboration. All geometry, colours, shadows and physics are procedural. No AI-generated or imported images, models, motion files or sounds are used. The sounds (landing, grab, release) are synthesised on the spot with Web Audio; there are no audio files.
