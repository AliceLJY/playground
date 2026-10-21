# Herb Match

Chinese herbs pop out of the apothecary shelf one at a time and fall: mint, ginger, coptis, aconite and more. Before each one hits the floor, file it into one of four baskets by its nature in Chinese medicine: cold, cool, warm or hot. Tap a basket, or hold a herb and drag it in; a streak of right answers multiplies the score. File one wrong and its label flips over to say what nature it really has and why. A round lasts 75 seconds and closes on one line: the four natures describe how a herb acts on the body once taken, not how warm the herb itself is.

**[Play online](https://aliceljy.github.io/playground/herb-match/)** (the interface is in Chinese)

It plays on phones in either orientation and on desktop. This is a small game for learning the four natures, not medical advice.

## Controls

- Phone: tap a basket to file the lowest herb into it, or hold a herb and drag it into a basket.
- Desktop: click a basket or drag a herb; keys 1–4, A S D F or the arrow keys ← ↓ ↑ → map to cold, cool, warm and hot. Space or Enter starts a round.
- Sound can be switched off at the top right of the title and result screens.

## Herbs and sources

Sixteen herbs, four per basket; "slightly cold" and "very cold" count as cold, "slightly warm" as warm, "very hot" as hot. Every herb's property line and its sources are listed in section 4 of [SPEC.md](SPEC.md): taken from the Hong Kong Polytechnic University Chinese medicine database and checked against the 2020 Chinese Pharmacopoeia. Coix seed and American ginseng are left out for now, because the sources disagree on whether they are cool or slightly cold.

## How it is built

- The one-page spec is [SPEC.md](SPEC.md): colours, composition ranges, rule numbers, performance budget and ten acceptance items.
- The rules live in `src/core.js` with no drawing code, so they run in Node. The tests measure real simulated rounds: how many herbs share the screen, that herbs never overlap, that explanation labels never cover a herb, and round length and accuracy for four styles of play (idle, precise, human-like, shaky hands).
- Drawing uses a 2D canvas. The herbs are drawn in code in `src/herbs.js`: mint, ginger and chrysanthemum are ported from the SVG of the short film this game follows, the other thirteen are drawn in the same flat style. All sound is synthesised with WebAudio.
- Fixed views: `?view=hero`, `?view=flip`, `?view=stress`, `?view=result`, and the herb sheet `?view=sheet`. The debugging hook is `window.__herb`.

## Run locally

```bash
cd herb-match && python3 -m http.server 8941
```

Open `http://127.0.0.1:8941/`. Tests: `node --test tests/*.test.cjs`. There is no build step; publishing copies `index.html` and `src/` as they are.

## Verification

See [VERIFICATION.md](VERIFICATION.md). Feel, sound and whether it is fun still need a person to play it.
