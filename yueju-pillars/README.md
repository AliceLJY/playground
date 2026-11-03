# Which Pillar Are You?

A Cantonese opera troupe is held up by six leading performers, like six pillars, so the system is called the six pillars: the civil-and-military male lead, the second male lead, the leading dan, the second dan, the clown and the senior male role. Answer eight everyday questions to find out which pillar you are; the result page tells you what that pillar is in Cantonese opera and which role you would play in the classic *The Flower Princess*. Long-press the share image to send it to a friend. Going back to a question highlights your saved choice so you can change it.

**[Take the quiz](https://aliceljy.github.io/playground/yueju-pillars/)** (the interface is in Chinese)

## Sources

Every line under "this pillar in Cantonese opera" carries a source: Hong Kong Memory, a Cantonese opera study note on the Education University of Hong Kong's heritage education site, China Cantonese Opera Net entries reprinted by ycwb.com, Hong Kong LCSD, Hong Kong Metropolitan University and others, listed in full at the foot of the page; a friend who studies Chinese opera checked them one by one. Claims not yet settled are left out for now. The six pillars are a troupe staffing system, so painted-face, old-man and comic-female roles are not among the results.

## How it is built

- The one-page spec is [SPEC.md](SPEC.md) (in Chinese).
- Questions, results, sources and scoring live in `src/core.js` with no page code, so they run in Node. The tests enumerate all 4^8 answer sets and check that each result comes up 12%–22% of the time under random answering, how ties are broken, that wording never assumes a gender, and that every fact names a source.
- The page is plain HTML plus `src/game.js`; the share image is drawn on a canvas.
- Share links `?r=<pillar>` open one pillar directly; `?view=q3` opens question 3. Debugging hook: `window.__pillar`.

## Run locally

```bash
cd yueju-pillars && python3 -m http.server 8957
node --test tests/*.test.cjs
```

## Verification

B2, 2026-11-03: saved choices now reuse the option’s red border and pale red background, with a visible “上次选了这一项” note and `aria-pressed`. Questions, scoring and results are unchanged. Node: 10/10 tests pass.

`tools/browser-check.cjs` adds 16 checks across 390×664, 320×568, 844×340 and 1365×900 (DPR 2/2/2/1): select C, go back, change to A, go back, finish and restart. Eight checks failed before the fix; all new and existing result/share-card checks pass after it, with zero page errors in Chrome 156.0.8078.80 / Playwright. The option targets are at least 44px. There is no build step. Screenshots: task output `yueju-pillars/after/back-*.png`.

```bash
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs /tmp/yueju-check http://127.0.0.1:8942/yueju-pillars/index.html
```

Real phones, WeChat, Safari and screen readers remain untested. This quiz has no audio.

## Who it's for, AI assets

- Who it's for: People who like Cantonese opera or want a first taste of it, and people who enjoy personality quizzes and passing them on.
- AI assets: The six result illustrations are AI-generated (Codex image generation, contemporary opera-comic style; costumes described in words from two Cantonese opera stage photos and a face-painting reference, no photo was fed to the generator); questions and copy written through human–AI collaboration, facts checked by people; no sound; code written through human–AI collaboration.
