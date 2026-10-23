# Dispatch Replay

Replays of real Claude Code jobs; a picker in the top right switches between two.

- **Fact-check (Oct 22)**: The author asks for a fact-check of a batch of old blog posts; Claude Code, acting as the dispatcher, spends 68 minutes splitting 15 posts across 21 subagents: 15 checkers and 6 reviewers. Each subagent searches and reads the web and writes its check sheet in its own separate context, which grows to 144k–225k tokens. The report each one hands back to the dispatcher is 205 to 588 characters long.
- **Yingge short film (Oct 21)**: Through `/goal`, the author asks for a 70-second vertical short film. The dispatcher spends 2 h 37 min on the first cut: 2 subagents for research, 6 for review (5 first-time viewers who retell what they saw without any context, 1 Opus reviewer going shot by shot), plus 8 calls to an external AI, Codex, to draw the paper puppets and backdrops; 3 of those were rejected by the script for the wrong size and redrawn. Codex is a black box in the transcript, so it is drawn as a black hole showing only dispatch, hand-back and run time. The whole session ran about 6 hours; the later music revisions and wrap-up are left out, for the reasons in [SPEC.md](SPEC.md) §3 (in Chinese).

Live: https://aliceljy.github.io/playground/dispatch-replay/

## Watching it

It is drawn as a starfield: the star in the middle is the dispatcher, the small galaxies orbiting it are subagents, the sparks falling into them are tool calls, black holes are external AIs, comets are the reports coming back, and the cross-shaped star in the top left is the author. The fact-check plays in deep-space blue, the Yingge film in cinnabar red, ink black and dark gold.

- It plays in 1.5 minutes by default, or 3 minutes. Space pauses, the arrow keys skip, and you can drag the timeline at the bottom.
- Click a subagent to see its own numbers: model, run time, tools used, context peak, report length.
- Each caption slows the replay down long enough to read it; the clock in the top right then carries a slow-motion marker. The clock itself always shows real time.
- Fixed views: `?view=hero` (the most executors running at once), `?view=wide`, `?view=end`, `?t=<real seconds>`; `?d=yingge-1021` picks a dataset, the first one by default.

## Where the numbers come from

`tools/extract.py` pulls the data out of the author's local Claude Code session transcript. It keeps only task labels, model names, tool groups (web / file / write / shell / external tool / other), times, token counts and character counts — no prompts, no report text, no file paths. The task line and the captions are written by hand.

- A galaxy's halo area is proportional to tokens, on one scale shared by the subagents and the dispatcher's star. Tokens are each subagent's own context peak: the most context any single request of its read in, cache included.
- Reports are counted in characters, only the part the subagent wrote, without the frame the harness wraps around it. Tokens and characters are different units, so a report is drawn as a fixed-size comet labelled with its length.
- The big galaxy at the end is every subagent's peak added up, next to the dispatcher's star: 3.77M against 338k for the fact-check, 1.94M against 781k for the short film (that time the dispatcher wrote the code and made the film itself, reading more than any subagent). External AIs have no token count and are left out of it.
- An external AI's hand-back length is what the dispatcher read back: a Codex image job returns one picture plus a status line of about 200 characters; the picture is not counted.

To replay another session:

```bash
python3 -I tools/extract.py <session.jsonl> --from <start> --to <end> \
  --slug <name> --title "<title>" --task "<task line>" \
  [--subtitle "<subtitle>"] [--captions <captions.json>] [--label-strip '<regex to drop from labels>'] \
  [--external-labels <labels.json>] > data/<name>.js
```

Then add a line to `data/index.js` and it shows up in the picker. The data format is in [SPEC.md](SPEC.md) §3 (in Chinese). External AIs called through the wrapper scripts (`codex-image-gen.ts`, `codex-run.sh`, `kimi-run.sh`, `agy-gui-run.sh`, `grok-clean.sh` and a few more) become `kind: "external"` automatically; only commands that actually run a wrapper count, not ones that merely mention it, and a run whose hand-back cannot be found stops the script instead of being guessed.

## Running locally

```bash
cd dispatch-replay && python3 -m http.server 8963
```

Open `http://127.0.0.1:8963/`, or just double-click `index.html`. Tests: `node --test tests/*.test.cjs`. There is no build step; publishing copies `index.html`, `src/` and `data/` as they are.

## Verification

See [VERIFICATION.md](VERIFICATION.md) (in Chinese). Whether a stranger can retell what happened after watching has not been tried yet.

## Who it's for, AI assets

- Who it's for: People curious what it actually looks like when an AI hands work out to subagents, how several agents share the load of context, and what Claude Code can actually see when it calls an external AI.
- AI assets: No AI-generated images, models or sounds; everything on screen is drawn in code; what it replays is a real record of an AI at work; code written through human–AI collaboration.
