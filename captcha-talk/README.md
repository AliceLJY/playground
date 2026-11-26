# I Am Not a Robot

A web talk that edits itself. It opens on a dull human-verification page, and the speaker says "first, a quick check". Then the page rewrites its own header: "This talk is a CAPTCHA." Each scene poses one way to prove you are human (read a word, pick the pictures, tick a box, say "I'm not a robot"), and each time a cyan cursor answers first. The verification page takes more damage scene by scene until the cursor ticks the box itself and the page shatters like glass. The talk ends back on the opening page.

Press → or tap the right side of the screen for the next step, ← to go back (on a phone, swipe or use the ‹ › bar at the bottom); N shows the speaker notes, F goes fullscreen, A plays automatically, Home / End jump to the start / the ending. One more → after the ending opens the sources page. The talk itself is in Chinese.

## Run locally

```sh
npm ci
node tools/build.mjs
node tools/serve.cjs dist 8951
```

Open `http://127.0.0.1:8951/index.html`. For the source entry, run `node tools/serve.cjs . 8951` in this folder and open `/dev.html`. The build is one HTML file with Three.js bundled in; everything on screen is drawn by code and the page loads nothing from outside.

- `?step=N&t=seconds` starts at step N (zero-based).
- `?notes=1` opens with the speaker notes showing.
- `?headless=1` stops the animation loop; `window.__talk.step(ms)` advances time, for frame-by-frame video capture.

## Checks

```sh
node --test tests/*.test.cjs
NODE_PATH="$(npm root -g)" node tools/walk.cjs http://127.0.0.1:8951/index.html shots/wide 1920x1080
NODE_PATH="$(npm root -g)" node tools/walk.cjs http://127.0.0.1:8951/index.html shots/phone 390x664
NODE_PATH="$(npm root -g)" node tools/walk.cjs http://127.0.0.1:8951/index.html shots/keys 1280x720 --keys
NODE_PATH="$(npm root -g)" node tools/phone-check.cjs http://127.0.0.1:8951/index.html
```

The spec and acceptance items are in [SPEC.md](SPEC.md) (Chinese).

## Preview: the AGY remake

`agy/` is a version whose visuals were remade by AGY (Gemini) on 2026-11-27 from the same script: every scene change is an object turning into the next world, and the worlds gained sky, fog and reflections. The script and widget drawing are shared with `src/`; `agy/src/` holds only its playback and scene files. Build it with `node tools/build.mjs agy`; online it lives at `captcha-talk/agy/`. Three fixes made during review are marked `CC 11-27` in the code.

## Where the numbers come from

Every number comes from a primary source: 99.8% is a paper's result on synthetic distorted text, hardest category; 17,600 books is from the 2008 reCAPTCHA paper in Science, and the height of the stack assumes 3 cm per book; "about 70%" is what China's railway ticketing site 12306 said in 2015; 1.4 seconds is a value the 2023 USENIX paper cites from other work, while the human 3.1–4.9 seconds is its own measurement; the GPT-4 line is from a controlled test on an early version described in OpenAI's report; the agent's line comes from a user's screenshot reported by the press. The score in the corner is illustrative. Full sources are on the last page of the talk.

## Where the method comes from

The way of telling is learned from @fluxxrider's public web talk "The Last Boring Slide": the shell is the dullest default page, the talk edits itself, each scene is one full-screen 3D world, the screen holds one line, and the ending returns to the same page with a single change planted earlier. Only the method was borrowed; none of the original's code, visuals or script is used. The verification widget and the picture tiles are drawn from scratch and imitate no real product's marks.

The Three.js MIT licence is kept in the bundled HTML. Credit: WeChat account 我的AI小木屋 and GitHub @AliceLJY.

## Who opens this, and AI assets

- Who opens this: anyone who ticks "I'm not a robot" every day and wonders who that box still stops; also anyone curious how a web page can be the talk itself.
- AI assets: the code and script were written in collaboration with AI; everything on screen is drawn by code. No AI-generated images, models or sounds are used.
