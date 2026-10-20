# Qilou Brawl

Dusk on an old Xiguan arcade street in Guangzhou. The neighbours have set up a lion-dance ring at the far end, and you are Ah Long, a Cantonese-opera martial hero, fighting your way there: past the dim-sum grannies, past the landlord's belly charge, and finally into the ring against the lion-dance head.

**Play online: https://aliceljy.github.io/playground/qilou-brawl/**

## Controls

| | Keyboard and mouse | Touch |
|---|---|---|
| Move | WASD | stick, bottom left |
| Punch (3-hit chain) | J / left click | 拳 |
| Kick (2-hit chain, spinning finisher) | K / right click | 脚 |
| Roll | Space | 滚 |
| Block (hold) | Q | 挡 |
| Gong-and-drum mode when the bar is full | E | 锣 |
| Camera | drag, wheel to zoom | drag empty space |

Losing restarts the current section, not the whole street.

## How it is made

- The four characters were drawn as full-body cartoon images with AI, then each image went to [PINOC](https://viggle.ai/pinoc) (Viggle), which returns a rigged Gaussian-splat character. No modelling, no manual rigging.
- Motion: walk, run, kicks, roll, block, hit reactions, knock-down, get-up and cheer come from PINOC's free motion library. The library has no punches, so the three-hit combo was generated from a one-line text prompt.
- Rendering: PlayCanvas plus [@viggle/splat-engine](https://www.npmjs.com/package/@viggle/splat-engine) (MIT). The arcade street, stained-glass windows, signboards, lanterns and ring are code-built boxes merged into two meshes.
- All sound is synthesised live: hits, gongs, and the lion-dance drum pattern.
- Game logic lives in `src/core.js` with no renderer, so it runs in Node; the autopilot (`makeBot`) drives the tests, full playthroughs and fixed camera views.

The workflow follows akokoi1's "Chang'an Street Fight" (also PINOC characters on PlayCanvas). Only the approach is borrowed; none of its code or assets.

## Local

```bash
npm ci --ignore-scripts && npm rebuild esbuild   # playcanvas pulls in an unused native canvas package; skip its build
node --test tests/*.test.cjs
node tools/build.mjs          # output in dist/; serve it and open dist/index.html
```

Query options: `?auto` lets the autopilot play (`&fast=4` to speed up), `?view=hero|wide|stress|boss` for fixed camera views.

Spec in [SPEC.md](SPEC.md), verification record in [VERIFICATION.md](VERIFICATION.md), third-party licences in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
