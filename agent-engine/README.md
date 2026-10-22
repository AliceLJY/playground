# Agent Engine, Explained

A six-scene animated explainer of one idea: a model API only talks; the layer that lets it act, remember and go around a second time is the engine, and what most people tune every day (rules files, skills, a memory store) is the harness on top of it. The scenes are the three layers, what is stuck when you have only the API, the loop and what happens on each turn, the 99% of engineering around the loop (eight failure cards you can flip), three ways to get an engine, and what "a life of its own" means for a companion bot: one more layer of world state that the model cannot overwrite.

**[View online](https://aliceljy.github.io/playground/agent-engine/)** (the page is in Chinese)

It opens on the first scene and plays that scene's entrance, then waits for you: you turn the pages. Press the autoplay button if you would rather be walked through it. Phone in either orientation and desktop; light and dark follow the system. No sound.

## Watching it

- Nothing moves on its own until you press the autoplay button (top right). Then it stays on each scene for its animation plus time to skim the text (12 to 40 seconds), stops after the last scene and does not loop. The longest scene takes about 77 seconds to read at skimming speed, so autoplay is a tour speed, not a promise that you finish reading; any tap, key, wheel or touch-scroll takes over, and the button resumes it.
- Step buttons at the top, previous and next below the card, or the left and right arrow keys. Opening a new scene from the bottom of a long one scrolls back to the top.
- Scene 4: tap or press Enter on a failure card to flip it from the problem to how an engine catches it, with one line computed live.
- With "reduce motion" on, every scene shows its final state and nothing autoplays.

## What is real

Everything that moves replays something `src/core.js` computed:

- The loop on scene 3 is a real loop over a message array: a scripted fake model that returns text or a tool request, three tools, and a permission gate. The ring and the `messages[]` list replay its 15 events; change the fake directory and the answer changes with it.
- Scene 2 is the same model called once with no loop. Its request is left hanging with no result.
- The eight cards are eight small functions: repairing request/result pairs, coercing argument types, compacting context under a budget, classifying errors and backing off with jitter, refusing dangerous commands, read-before-write, loading full tool definitions only for a core set, and parsing XML tool requests for a model without native tool calling. The "computed live" line on each card is their output.
- Scene 6 runs one list of requests (a trip, a lunch, a purchase) through a rules gate that rejects, corrects or passes each one, then updates a world state and retells only what passed.

These are teaching-size implementations, not the code of Claude Code or of any product the page mentions; the page says so. Claims about other products are the outside authors' self-reports and are marked that way.

## Fixed views and the hook

`?view=1` to `?view=6` freeze the page on a scene with its animation run to the end (no autoplay). `?view=4&flip=all` flips all eight cards; `&flip=1,6` flips the listed ones. Without parameters it is the normal entry: the first scene, its entrance animation, then you turn the pages. The hook is `window.__agentEngine`: `ready`, `state()`, `go(n)`, `settle()` and `core` (everything `src/core.js` exports).

## Sources

The explanation draws on the Anthropic Agent SDK documentation on the agent loop, a post by Nader Dabit on building a small Claude Code, an MIT-licensed engineering write-up of an agent product, and a Xiaohongshu post comparing six engines' loops. Links and what was taken from each are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) and in the page footer.

## How it is built

- The one-page spec is [SPEC.md](SPEC.md) (in Chinese): palette, composition, performance budget, fixed views and ten acceptance items.
- `src/core.js` has no DOM, so Node runs it; `src/view.js` only replays what the core computed; `src/style.css` has the palette for both themes.
- Tests (`tests/*.test.cjs`) run the loop, the gate, the eight rescues and the world-state gate on good and bad inputs, scan the published files for outside requests and anything that points to a person or a machine, check pacing on the real text, and compute text-on-background contrast from the stylesheet.
- No build step, no dependency, no outside request. Publishing copies `index.html` and `src/` as they are.

## Running locally

```bash
cd agent-engine && python3 -m http.server 8971
```

Open `http://127.0.0.1:8971/`, or double-click `index.html`. Tests: `node --test tests/*.test.cjs`. Browser checks (needs Playwright and Google Chrome already installed): `NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <output-dir>`.

## Verification

See [VERIFICATION.md](VERIFICATION.md) (in Chinese). Not tried on a real phone, and nobody has yet watched it cold and retold it.

## Who it's for, AI assets

- Who it's for: People who use Claude Code or similar tools every day and wonder what exactly the "engine" under their rules and skills is, and what an engine has to survive that a bare model API never meets.
- AI assets: No AI-generated images, models or sounds; there are no images at all. The explanation draft, the page and the mini engine were written through human–AI collaboration; the fake model is scripted, and no model is called when you open the page.
