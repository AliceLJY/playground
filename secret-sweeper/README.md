# Secret Sweeper

Classic minesweeper with a new skin. The cells are log lines, config snippets and handoff notes. The mines are keys hidden among them, and each number counts the keys in the eight cells around it. Placing a flag is called "redacting": the flag sits on a black `<REDACTED>` bar.

- Tap to open a cell, press and hold to flag it (or switch on flag mode). On desktop, right-click to flag.
- The first tap is always safe, and every board can be cleared by reasoning alone. No guessing is needed.
- Three sizes: easy 7×9, normal 8×11, hard 9×13. A game takes one to five minutes.
- Hitting a key brings up a short card about a real kind of credential leak, with tool and service names removed. Clearing the board ends with "look at the clues before you act".
- A pixel clerk, drawn in the same style as the Pixel Office, reacts when you flag, when you hit a key and when you win.
- Classic minesweeper sounds (open, cascade, flag, explosion, win), synthesised in the browser. The 🔊 button in the bottom bar mutes them.

Every "key" on screen is fake and deliberately incomplete (such as `sk-…4f2a`), so secret scanners do not mistake it for a real credential.

## Run locally

From the repository root:

```bash
python3 -m http.server 8941 --bind 127.0.0.1
# open http://127.0.0.1:8941/secret-sweeper/
```

## Checks

```bash
cd secret-sweeper && node --test tests/*.test.cjs
NODE_PATH="$(npm root -g)" node secret-sweeper/tools/browser-check.cjs /tmp/sweeper-check   # browser acceptance, from the repository root
```

The spec and acceptance list are in [SPEC.md](SPEC.md) (in Chinese).

## Who might open this, and AI assets

For anyone who has played minesweeper and fancies a few rounds in a different skin, with a glimpse of how keys actually leak. The code, rules, pixel clerk and all text were made through AI collaboration. The sounds are synthesised in code. No AI-generated images, sounds or models are used.
