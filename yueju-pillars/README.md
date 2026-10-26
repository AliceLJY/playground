# Which Pillar Are You?

A Cantonese opera troupe is held up by six leading performers, like six pillars, so the system is called the six pillars: the civil-and-military male lead, the second male lead, the leading dan, the second dan, the clown and the senior male role. Answer eight everyday questions to find out which pillar you are; the result page tells you what that pillar is in Cantonese opera and which role you would play in the classic *The Flower Princess*. Long-press the share image to send it to a friend.

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

## Who it's for, AI assets

- Who it's for: People who like Cantonese opera or want a first taste of it, and people who enjoy personality quizzes and passing them on.
- AI assets: Questions and copy written through human–AI collaboration, facts checked by people; no AI-generated images or sounds yet (result illustrations to come, and will be listed here); code written through human–AI collaboration.
