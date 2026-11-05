# Daomadan Sprite

[中文](README_CN.md) · **Live: https://aliceljy.github.io/playground/daomadan-sprite/**

One master still of a Cantonese opera daomadan (a female warrior general) turned by AI into five game actions — idle, walk, spear thrust, jump and hurt — and then dropped onto a small stage to try. It sits on the "Behind the AI" shelf: it shows how one picture becomes a whole action set, it is not a full game.

## Spec

- **In one line**: visitors read three steps top to bottom — how the master still was chosen, where each action came from, and a stage to try them on; within a minute they see one picture become a set of moves.
- **Aesthetics**: expression (seeing how the AI made it) first, sensation (costume and motion) second.
- **Where it is played**: mostly a phone in portrait, usually muted, one thumb on the buttons; keyboard on a computer. Two or three minutes.
- **Shape**: an arc, seen once; no clear rate to test.
- **Colours** (sRGB): light page `#f7f1ec`, cards `#fffaf6`, accent pink `#c2416b` (the "chosen" tag and step numbers); dark page `#1b1a20`, accent `#f07ea3`. Stage sky `#f8dccb → #eab8a3`, floor `#7a4a3a → #5a3428`; the character's feet sit at `y = 380 / 420`.
- **Composition**: the stage is 960×420, the character about 256 px tall (60% of the stage), spawning at `x = 300`, with 90 px kept clear on each side; in the action tiles the character is scaled to fit with an 8 px bottom margin.
- **Performance budget**: five WebP atlases of about 4.9 MB and three stills of about 0.14 MB; Canvas 2D draws six images per frame (one stage, five tiles), aiming at 60 fps on phone Chrome (not measured on a real device).

### Acceptance

| # | Item | Check | Threshold |
|---|---|---|---|
| 1 | All five actions have frame data that matches their atlas grid | `tests/core.test.cjs` 1, 8 | all pass |
| 2 | One-shot lengths fit a game | test 2 | thrust 0.5–1 s, jump 0.6–1.2 s, hurt 0.3–0.8 s |
| 3 | Arrow keys walk and turn; releasing returns to idle | test 3; real key presses in the browser check | correct state and facing |
| 4 | Running is faster than walking | test 4 | distance ratio 2.2–2.8 over 1 s |
| 5 | A move plays once and returns to idle, takes no second move mid-way, and does not slide | tests 5, 6; browser check | all pass |
| 6 | The character cannot leave the stage | test 7 | `x ∈ [90, 870]` |
| 7 | No page errors, every asset loads, no horizontal scroll | `tools/browser-check.cjs`, three viewports | 0 errors, 0 4xx |
| 8 | On phones all six buttons are fully visible and hittable | browser check (390×664 and 412×700, browser bars removed) | all inside |
| 9 | All five action tiles draw the character | browser check reads pixels | > 8% opaque pixels per tile |

### Views

- `?view=stills`: scroll to the three master stills
- `?view=actions`: scroll to the five actions
- `?view=stage`: scroll to the stage

Hook `window.__PLAYTEST__`: `ready`, `snapshot()` (state, frame, position, facing, plays per action), `reset()`, `step(ms)`, `trigger(action)`.

## How it was made

1. Master still: generated with Codex on a flat green background, 1024×1024. The first version was crimson with gold everywhere and dragons, closer to a male general's armour; following costume references (female armour is usually only pink, red or pale lake blue, embroidered with flowers and phoenixes) it was redone in pink and in pale lake blue. The pale blue sat too close to the green key, so pink was chosen.
2. Actions: [agent-sprite-forge](https://github.com/0x0funky/agent-sprite-forge) (MIT, commit `5324342`), its `video2dsprite` skill. Every action starts from the same master still and goes through the local Grok CLI's image-to-video; the tool rejects takes that turn around, shift colour or fail to loop, then keys, registers, picks loops, retimes one-shots to game length and packs atlases. Sixteen clips in all.
3. Every action's frame sheet was checked by eye: the fourth jump take jumped twice, so only the first jump is kept; the hurt take turns toward the camera in its second half, so only the knock-back is kept.
4. This page: the five PNG atlases converted to WebP (quality 90), drawn frame by frame with Canvas 2D from the grid in `src/clips.js`.

## Known gaps

- **Running has no frames of its own.** All six running clips look fine, but the back flags, ribbons and pheasant feathers keep fluttering and drown out the leg rhythm, so the tool could not find a loop (the best take missed by one percentage point). The stage plays the walk frames at 2.2× instead.
- The thrust and jump clips each keep about 1.2% green fringe at the edge (the tool's limit is 1%), shipped with a recorded override.
- Not tried on a real phone; only two phone viewports emulated in desktop Chromium.

## Regenerating

`src/clips.js` is collected from the five `animation.json` files agent-sprite-forge packed, and `assets/*.webp` is converted from the matching `*-atlas-00.png`. The original working files live on the author's external drive and are not in the repo.

## Run locally

```bash
cd daomadan-sprite && python3 -m http.server 8790
node --test tests/*.test.cjs
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs http://127.0.0.1:8790/ shots
```

The character and artwork are AI-generated.
