# Dispatch Replay

A replay of one real Claude Code job. The author asks for a fact-check of a batch of old blog posts; Claude Code, acting as the dispatcher, spends 68 minutes splitting 15 posts across 21 subagents: 15 checkers and 6 reviewers. Each subagent searches and reads the web and writes its check sheet in its own separate context, which grows to 144k–225k tokens. The report each one hands back to the dispatcher is 205 to 588 characters long.

Live: https://aliceljy.github.io/playground/dispatch-replay/

## Watching it

- It plays in 1.5 minutes by default, or 3 minutes. Space pauses, the arrow keys skip, and you can drag the timeline at the bottom.
- Click a subagent to see its own numbers: model, run time, tools used, context peak, report length.
- Each caption slows the replay down long enough to read it; the clock in the top right then carries a slow-motion marker. The clock itself always shows real time.
- Fixed views: `?view=hero` (the most subagents running at once), `?view=wide`, `?view=end`, `?t=<real seconds>`.

## Where the numbers come from

`tools/extract.py` pulls the data out of the author's local Claude Code session transcript. It keeps only task labels, model names, tool groups (web / file / write / shell / external tool / other), times, token counts and character counts — no prompts, no report text, no file paths. The task line and the captions are written by hand.

- Bubble area is proportional to tokens, on one scale shared by the subagents and the dispatcher. Tokens are each subagent's own context peak: the most context any single request of its read in, cache included.
- Reports are counted in characters, only the part the subagent wrote, without the frame the harness wraps around it. Tokens and characters are different units, so a report is drawn as a small fixed-size packet labelled with its length.
- The big circle at the end is the 3.77M tokens of all 21 peaks added up, next to the dispatcher's own 338k.

To replay another session:

```bash
python3 -I tools/extract.py <session.jsonl> --from <start> --to <end> \
  --slug <name> --title "<title>" --task "<task line>" \
  [--subtitle "<subtitle>"] [--captions <captions.json>] [--label-strip '<regex to drop from labels>'] > data/<name>.js
```

Then add a line to `data/index.js`; a picker appears in the top right. The data format is in [SPEC.md](SPEC.md) §3 (in Chinese). External AIs such as Kimi, Gemini or Grok can be listed with `kind: "external"` and are drawn as solid blocks showing only dispatch, hand-back and run time.

## Running locally

```bash
cd dispatch-replay && python3 -m http.server 8963
```

Open `http://127.0.0.1:8963/`, or just double-click `index.html`. Tests: `node --test tests/*.test.cjs`. There is no build step; publishing copies `index.html`, `src/` and `data/` as they are.

## Verification

See [VERIFICATION.md](VERIFICATION.md) (in Chinese). Whether a stranger can retell what happened after watching has not been tried yet.

## Who it's for, AI assets

- Who it's for: People curious what it actually looks like when an AI hands work out to subagents, and how several agents share the load of context.
- AI assets: No AI-generated images, models or sounds; everything on screen is drawn in code; what it replays is a real record of an AI at work; code written through human–AI collaboration.
