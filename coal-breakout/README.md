# Coal Breakout

A tiny coal creature and its orbiting AI helpers survive three original AI disasters. Drag with one finger to move; the helpers shoot automatically. Collect experience, choose a workflow upgrade, survive the countdown, then defeat the boss to unlock the next stage. A stage takes about two to four minutes. All warnings are readable with sound off.

**[Play](https://aliceljy.github.io/playground/coal-breakout/)** · [Chinese guide](README_CN.md)

## Controls and stages

- Phone: hold and drag anywhere on the arena, like a floating joystick. Release to stop.
- Desktop: drag with the mouse, or use arrow keys / WASD. Escape or P pauses.
- Sound starts off. Tap the sound button to enable original synthesised chip music and effects.
- Every other rank-up picks a card automatically and flashes it in the top bar; the rest pause the fight to choose one of three cards or skip. Every third rank restores one health point.
- The title offers an optional one-run auto-upgrade preference: Clear favours piercing beams and extra projectiles; Sustain favours pickup range and revival; no preference (the default) or no match keeps the first offer, and retries or the next stage return to the default.
- The arena is a dim slate-and-circuit room. Each stage places four props from the run's seed: a server rack, token crates, a coal heap and an old terminal. They stop the coal and ordinary monsters, which walk around them; shots fly over them, and the huge boss and its clones drift over them. A warm light follows the coal, shrinking as it loses hearts.
- Stage 1: some experience gems have a flickering pink core. They reveal a mouth before attacking. Only the boss with the white outline takes damage.
- Stage 2: text walls squeeze the arena and swallow the props they reach. Defeating yellow compressors pushes them back; the boss pulls the player and gems toward the centre.
- Stage 3: every 40 seconds, a three-second red countdown warns of four seconds without weapons, followed by five seconds of burst fire. Leave the boss's yellow zones before they turn red.

Eight upgrades add helpers, piercing beams, extra projectiles, faster attacks, a wider pickup radius, a one-use revival, faster movement or critical hits. Each can be selected up to three times. Death immediately offers a same-stage restart. Only unlocked stages are stored locally; blocking storage does not prevent play.

Result posters include the run's statistics, upgrades, character and a scannable link. Saving first tries the system file-sharing sheet, then falls back to a PNG download.

## Local development

```sh
cd coal-breakout
python3 -m http.server 8936 --bind 127.0.0.1
node --test tests/*.test.cjs
node tools/lint-hot.cjs
```

Open `http://127.0.0.1:8936/`. There is no build or install step. Publish only `index.html` and `src/`.

The simulation runs at 60 Hz, using integer ticks, a seeded PRNG and preallocated typed-array pools. All simulation work is in `src/sim.hot.js`; rendering, sound and inspection are separate. The hot-file lexer rejects constructors, closures and object/array literals, and is calibrated against deliberately invalid snippets. A recorded full round is replayed with a complete state hash checked at every frame. The sum of individually gzipped release files must stay below 150 KiB.

Stage, enemy and card descriptions live in `src/data.js`. Extending a mechanic requires a small corresponding change in the simulation and renderer. No external images, audio, fonts, packages or services are used at runtime. Collision scans have fixed pool limits; a larger game would need a spatial index.

## Browser verification

With an existing Playwright / Chromium installation:

```sh
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs http://127.0.0.1:8936/
NODE_PATH="$(npm root -g)" node tools/workflow-check.cjs http://127.0.0.1:8936/ <output-directory-outside-repo>
NODE_PATH="$(npm root -g)" node tools/record.cjs http://127.0.0.1:8936/
```

The recording tool also uses an existing `ffmpeg`. Optional independent PNG QR decoding on macOS uses `swift tools/qr-decode.swift tools/shots/phone390-poster.png`.

Fixed views are `?view=hero`, `?view=levelup`, `?view=boss`, `?view=result` and `?view=stress`. They advance actual seeded games and freeze the result. Stress explicitly increases spawning; it does not grant invulnerability. `window.__PLAYTEST__` exposes readiness, snapshot, reset, seed and step. Additional diagnostic controls require `?test=1` or a fixed view. Screenshots, recordings and local publish copies are ignored by Git.

See [SPEC.md](SPEC.md) for acceptance criteria and [VERIFICATION.md](VERIFICATION.md) for measured results and limits. Automated play is not evidence of human enjoyment or midrange-phone performance. Publication and a live-site recheck remain with the owner.

## Origin and references

This is an original setting and implementation within the survivors-like genre. The task requested the constraints associated with the tibo.dog approach; no source code or assets from that site were used. The repository's small static-game conventions and tests informed the structure. The fixed QR encoder is local code; an independently generated Nayuki reference matrix verifies it. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Who it's for, AI assets

- Who it's for: People who want a short, one-handed survival game and recognise the little disasters of working with AI.
- AI assets: All character pixels, scenery, music and effects are generated by code written through human–AI collaboration. No image generation, imported models, motion clips, recorded audio or company mascots are used in the game; one AI-generated target picture was used only as a look reference during development and is not shipped. The character follows the supplied original design anchors.
