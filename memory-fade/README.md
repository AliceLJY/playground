# Memory Fade

[中文](README_CN.md)

In an AI memory system, an old memory's retrieval score gets multiplied by a shrinking factor. This page hangs that formula on a spring: the card is a real memory sampled from my own memory store (numbers only, no content), and the dots on the curve are 400 memories sampled the same day. Drag the timeline and the card sinks and fades day by day; tap it to recall it once and it jumps up, then fades more slowly; pin it and it stops fading; however long you wait, a floor catches it.

The formula and parameters are copied unchanged from `decay-engine.ts` and `access-tracker.ts` in [RecallNest](https://github.com/AliceLJY/recallnest); the tests include a table of values computed with the original code. The spring only decides how the card travels; where it lands comes from the formula.

Spec and acceptance checks are in [SPEC.md](SPEC.md) (Chinese).

## Local preview

```bash
python3 -m http.server 8790
```

Open `http://localhost:8790/`. Append `?pick=0&ahead=60&recalls=10,30&pin=0` to jump to a given state.

## Tests

```bash
node --test tests/*.test.cjs
```

## Who it's for, AI materials

For anyone curious how an AI remembers and forgets, without reading the formula. The page code was written in collaboration with AI; there are no generated images, sounds or models.
