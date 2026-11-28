# Fur All Over My Hand

[中文版](README_CN.md)

An orange tabby stands side-on in front of you. Stroke along her back from head to tail and the strip you touched lies flat and catches the light; a few strokes and she shuts her eyes, lifts her chin and purrs, tail straight up with the tip quivering. Reach the root of her tail and her rump comes up to meet your hand. Stroke the other way and the fur bursts up in tufts, the skin on her back twitches and she turns to stare at you. Keep going and she flattens her ears, crouches and lashes her tail; keep going after that and she whips round, mouth open, for your finger, then licks her nose. Every stroke leaves a few loose hairs on your finger; they float up and land on the hand in the top-left corner until it is a fur mitten. Tap the hand to clap the hair off, and the clap makes her hop.

Three poses at the bottom: **standing**; **on her back**, belly up, where she purrs first, then raises a paw with claws out, then hugs your hand and bites (the belly is a trap and gets too much much sooner than the back); **asleep** on her side, where gentle strokes make her purr in her sleep, then half-open her eyes ("嗯……？"), then wake and keep purring; one stroke against the grain wakes her at once, and if you leave her alone for a while after she wakes she dozes off again.

Details of how it plays:

- **Your strokes stay.** The shiny strip and the ruffled patch stay on her back and only settle back over twenty or thirty seconds.
- **Stop your finger and the fur stops.** The patch under the finger is pressed down and springs back a couple of times after the finger passes.
- **Slow strokes work too.** Contentment only fades once you stop, so long two-second strokes still get her purring.
- **She always warns before she bites.** Ears back, a crouch, a lashing tail and a stare, with a "……" by her head. Stop for three seconds and she will not bite.
- Keyboard: Space or the right arrow strokes with the grain, the left arrow against it, C claps.

Made for a phone held upright, one thumb swiping sideways, sound off. The purr, the brushing sound and the clap are synthesised in code; there are no audio files. On Android phones the purr also buzzes gently.

## How it works

The cat is one side-view picture split into layers: body, tail and five heads (eyes shut, looking at you, ears back, biting, licking). One fragment shader draws it all: the body arches, dents under the finger, raises its rump, crouches, hops and breathes with the paws kept on the floor; the tail turns about its root; the head turns about the neck and cross-fades between expressions. Each layer replaces the body inside its own region instead of stacking on it, so when nothing moves the result is the picture itself, with no seams.

The fur uses the same approach as the [tear-off calendar](../tear-calendar/), borrowed from the [Filament fabric lab](https://play.liyue.io/filament/):

1. **The fur's state is a texture, not thousands of hairs.** A 56×100 map over her back stores which way the fur lies, how ruffled it is and how much loose hair is left. A moving finger writes only a small disc under it: with the grain lowers the ruffle, against it raises it, and a little loose hair moves from the map to the hand; the count on the hand always matches what left the map. Untouched fur is the picture; strands only appear where the fur has been pushed away from how it normally lies.
2. **Only the patch under the finger follows the finger.** The last few finger positions bend the nearby fur with a damped spring and let it bounce back; none of that is written to the map.

Everything is drawn with plain WebGL and Canvas 2D, with no third-party libraries. `tools/prep_assets.py` (Pillow + numpy) cuts the layers out of the generated pictures.

## Run locally

```bash
cd lumao && python3 -m http.server 8972 --bind 127.0.0.1
```

Open `http://127.0.0.1:8972/`. Tests: `node --test tests/*.test.cjs`. Browser check: `NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <out-dir>`. No build step; `index.html`, `src/` and `assets/` are published as they are.

Poses: `?pose=stand|belly|sleep`. Fixed views: `?view=hero` (fresh), `smooth` (stroked happy), `rump` (rump raised), `ruffle` (ruffled, looking at you), `warn`, `bite`, `furry` (fur mitten), `clap` (hair shaken off). `?q=low` for fewer fur layers, `?seed=n` for a different starting ruffle. Spec in [SPEC.md](SPEC.md) (Chinese), verification notes in [VERIFICATION.md](VERIFICATION.md).

## Who will open it, AI material

- Who will open it: anyone who has stroked a cat, been nipped and kept stroking, or never owns a sweater without cat hair on it.
- AI material: the cat pictures are AI-generated. The three full-body pictures (standing, belly up, asleep on her side) were made by Codex from photos of the author's own cat, and the expressions by Grok editing only the head of the same picture (plus the front paws for the belly-up bite); the photos themselves are not in the repository or the page. The fur motion, wall, floor, hand and sounds are drawn and synthesised in code. Code written by a person working with AI.
