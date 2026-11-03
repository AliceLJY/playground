# Memory Fade

[中文](README_CN.md)

In an AI memory system, an old memory's retrieval score gets multiplied by a shrinking factor. This page hangs that formula on a spring: the card is a real memory sampled from my own memory store (numbers only, no content), and the dots on the curve are 400 memories sampled the same day; a fresh sample is published every day. Drag the timeline and the card sinks and fades day by day; tap it to recall it once and it jumps up, then fades more slowly. A day already recalled in the sample or this simulation cannot be recalled again: the button, card, Enter and Space follow the same rule. Pin it and it stops fading; however long you wait, a floor catches it.

On phones, the spring, timeline and main buttons share one interaction area, followed by the curve and sample notes; wide screens use two columns. Swipe vertically on the empty stage or curve to scroll the page. The card remains freely draggable, and a horizontal swipe on the curve selects a day. The card's “入库样本” label identifies the original sample numbers; the readout below shows the simulation.

The formula and parameters are copied unchanged from `decay-engine.ts` and `access-tracker.ts` in [RecallNest](https://github.com/AliceLJY/recallnest); the tests include a table of values computed with the original code. The spring only decides how the card travels; where it lands comes from the formula.

Spec and acceptance checks are in [SPEC.md](SPEC.md) (Chinese).

The optional “三次想起” (Three recalls) menu below the main workspace lets you schedule three recalls and compare your plan with no intervention 180 days from today, then return to the original simulation; it is an experiment with RecallNest's decay rules, not a human memory training method.

## Local preview

```bash
python3 -m http.server 8790
```

Open `http://localhost:8790/`. Append `?pick=0&ahead=60&recalls=10,30&pin=0` to jump to a given state.

## Tests

```bash
node --test tests/*.test.cjs
NODE_PATH="$(npm root -g)" node tools/shoot.cjs http://localhost:8790/ <output-directory-outside-repo>
NODE_PATH="$(npm root -g)" node tools/experiment-check.cjs http://localhost:8790/ <another-output-directory-outside-repo>
```

The browser check uses locally installed Playwright and phone viewports with browser bars deducted, plus desktop. Failed assertions return a nonzero exit status; screenshots show the viewport, not the full page. The minimal playtest hook exposes `window.__PLAYTEST__.ready` and `snapshot()`; `__fade` remains available. See [VERIFICATION.md](VERIFICATION.md) for measured results and limitations (Chinese).

Run the browser scripts sequentially. The new check exercises scheduling, failure, retry, completion and return using keyboard and touch input. `snapshot().experiment` reports the actual experiment state, or null when closed. There is no build step: publishing copies `index.html` and `src/` unchanged.

## Who it's for, AI materials

For anyone curious how an AI remembers and forgets, without reading the formula. The page code was written in collaboration with AI; there are no generated images, sounds or models.
