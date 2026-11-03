# Coal Shift

[中文](README_CN.md) · [Play online](https://aliceljy.github.io/playground/coal-shift/)

Sixty seconds left before clocking off in a pixel office. Move the little coal creature left and right to catch falling coffee, dodge the red bugs, and keep at least one of your three hearts until 18:00.

## How it was made

Codex built this game from a single sentence. I gave it no reference art and did not change the gameplay:

> Make me a small web game: the little black coal creature catches coffee and dodges bugs in a pixel office. It should work by opening index.html, and play it yourself once to make sure it works.

It finished in a little over nine minutes, played two rounds in a browser on its own (it lost the first one) and wrote 20 checks. The whole run, including what it cost, became a screen-log film. The only change made for publishing here is a copyright line in the footer.

So the coal creature on screen is Codex's own drawing from the name alone, and it does not quite match my usual character.

## Spec (written after delivery)

- Experience: a 60-second catch game. The main aesthetic is challenge, with a little satisfaction from combo streaks.
- Setting: desktop or phone, muted by default, one minute per round.
- Controls: arrow keys or A/D to move, or drag with a mouse or finger. Narrow screens get left and right buttons. Space or P pauses, R restarts and M toggles sound.
- Scoring: 10 points per cup, 20 from the fifth cup in a row and 30 from the tenth. A missed cup only breaks the combo. A bug costs one heart and gives 1.65 seconds of protection. Drops speed up in the second half.
- The best score is kept in local browser storage (key `sooty-office-best-v1`). The game still runs when storage is blocked.

## Verification

- `verify.cjs` holds the 20 checks Codex delivered with the game, kept unchanged: scoring, combos, misses, dodging, collisions, damage protection, losing, restarting, the countdown, the win screen, the best score, keyboard, touch, pausing on blur, and fallbacks when storage or audio is unavailable.
- `tests/verify.test.cjs` runs those 20 checks and also confirms that the footer has the copyright line and that the page loads nothing external. It was tested against a deliberately broken copy and does fail. Run `node --test tests/*.test.cjs` in this folder.
- Feel has only had two rounds of play: Codex played once on desktop and once in a 400 px wide phone preview, and I ran one full round with a script. It has not been tried on a real phone.
- The fixed camera parameters and shared playtest hook this repository asks of new toys were not added, because this game is published as delivered from one sentence.

## Files

- `index.html`: the whole game. Art, logic and synthesised sound are in this one file, and it works offline.
- `verify.cjs`: the regression checks Codex wrote.
- `tests/verify.test.cjs`: the test wired into this repository's CI.

## Copyright

© AliceLJY (GitHub @AliceLJY). All rights reserved; terms are in the repository [`LICENSE`](../LICENSE). Codex generated the game code; I came up with the idea, wrote the prompt and checked the result. There is no third-party material: the pixel art is drawn in code, the sound is synthesised live with Web Audio, and no external fonts or images are used.
