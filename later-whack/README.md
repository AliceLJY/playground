# Office Whack-a-Mole · Later

[Chinese version](README_CN.md)

Whack-a-mole in a pixel office: hit the orange square signs, leave the blue round ones, ignore the green diamonds. No reading needed. Little workers keep popping up behind nine desks, each holding up a sign with a classic way of putting things off: "I'll get to it next time", "Leave it for the next window", "Good enough for now", "Fix it later". Tap one with a single thumb and a slipper knocks it back down: fixed in this round. The slipper is a nod to the neighbouring [slipper-smash](../slipper-smash/).

Two of them work the other way round:

- **Blue round sign, "waiting for her"**: it is waiting for the owner to decide. Leave it alone; hitting it costs 50 points and the combo. Sometimes Wuyou and Wulv, the two kids from the [pixel office](../ai-office/), hold this sign up.
- **Green diamond sign with an eye**: an "observing" item. It stands still and leaves on its own. Hitting it scores nothing and costs nothing, but the slipper bounces off for 0.7 s, long enough for other tails to slip away.

A round lasts 60 seconds; things pop up faster and several at a time as it goes on. Every 4 hits in a row double the score (up to ×8), and every 10 in a row fix one item from the pile. Missed tails pile up at the bottom of the screen; three of them end the round: "the loose ends left for the next window won't be done by the next window either".

Built for a phone held upright, one thumb, sound off: the three kinds differ by sign shape (square / round / diamond), colour (orange / blue / green) and motion (fidgeting / holding high / arms crossed, still). The text is extra. The signs only carry generic phrases and refer to no real task.

Playable without knowing anything about AI: the rule is plain whack-a-mole, the title screen explains it with a green check, a red cross and a grey clock, and the first blue and first green sign of every round get a bobbing cross or clock beside them. The AI-workflow phrases are only names and in-jokes.

## Run locally

```bash
cd later-whack && python3 -m http.server 8963 --bind 127.0.0.1
```

Open `http://127.0.0.1:8963/`. Tests: `node --test tests/*.test.cjs`. There is no build step; publishing copies `index.html` and `src/` as they are.

Fixed views: `?view=hero` (all three signs in one frame), `?view=stress` (six up at once in the last seconds), `?view=over` (result after the reckless autopilot loses), `?view=win` (a full 60 seconds). Spec in [SPEC.md](SPEC.md) (Chinese), verification notes in [VERIFICATION.md](VERIFICATION.md) (Chinese).

## Demo film

Portrait 1080×1920, about 40 seconds including the signature card. It is recorded frame by frame from the real game with real touch taps: title, fixing tails, one deliberate tap on a green and one on a blue sign, a fast-forwarded middle, the last seconds, the result, the signature card. The bouncy chiptune is synthesised in code and lands a note on every hit.

```bash
cd later-whack && python3 -m http.server 8963 --bind 127.0.0.1
NODE_PATH="$(npm root -g)" node tools/record.cjs http://127.0.0.1:8963/index.html <out-dir> <signature-card-template-dir>
python3 tools/demo-music.py <out-dir>/events.json <out-dir>/music-raw.wav     # needs numpy
```

## Assets and sources

- Whack-a-mole is a generic game type; the art, rules and code are made here.
- The little workers and the two kids are redrawn in code after the pixel style in this repository's `ai-office/office.js`; there are no image files.
- The game itself has no sound; the demo film's music is synthesised in code, no samples.

## Who opens this, AI assets

- Who opens this: someone with a minute to kill on a phone; people who work alongside AI and have heard "I'll get to it next time" will smile.
- AI assets: no AI-generated images, models, motion or sound; everything on screen is pixel blocks drawn by code, and the demo music is synthesised in code. The code was written by a person in collaboration with AI.
