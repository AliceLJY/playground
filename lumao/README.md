# Fur All Over My Hand

[中文版](README_CN.md)

Xiaoju, an orange tabby, is lying on your lap. Stroke her from head to tail and the strip you touched lies flat and starts to shine; a few strokes and she shuts her eyes, purrs and slowly sways her tail. Stroke the other way and the fur stands up in tufts and she turns her head round to look at you. Keep going without a break and she lashes her tail, flattens her ears, then gives you a gentle bite. Every stroke leaves a few loose hairs stuck to your finger; they float up and land on the hand in the top-left corner, which gets furrier and furrier until it is a fur mitten. Tap the hand to clap the hair off.

Details of how it plays:

- **Your strokes stay.** The shiny strip and the ruffled patch stay on her back and only settle back over twenty or thirty seconds.
- **Stop your finger and the fur stops.** The patch under the finger is pressed flat and springs back a couple of times after the finger passes.
- **Slow strokes work too.** Contentment only fades once you stop, so long two-second strokes still get her purring.
- **She always warns before she bites.** The tail lashes faster, the ears go back and she stares at your hand, with a "……" by her head. Stop for three seconds and she will not bite.
- Keyboard: Space or the down arrow strokes with the grain, the up arrow against it, C claps.

Made for a phone held upright, one thumb, sound off. The purr, the brushing sound and the clap are synthesised in code; there are no audio files. On Android phones the purr also buzzes gently.

## How it works

The same approach as the [tear-off calendar](../tear-calendar/), borrowed from the [Filament fabric lab](https://play.liyue.io/filament/):

1. **The fur's state is a texture, not thousands of hairs.** A 56×100 map over her back stores, per cell, which way the fur lies, how ruffled it is and how much loose hair is left. A moving finger only writes a small disc under it: with the grain lowers the ruffle, against it raises it, and a little loose hair moves from the map to the hand. The count on the hand always matches what left the map.
2. **Only the patch under the finger follows the finger.** The last few finger positions bend the nearby fur along the stroke with a damped spring and let it bounce back; none of that is written to the map.

The fur itself is shell texturing marched in one fragment-shader pass: each pixel walks from tip to root to find which hair it lands on, and ruffled fur is split into noisy clumps leaning different ways. The head is a separate furry ball that turns; the face is projected onto it. Everything is drawn with plain WebGL and Canvas 2D, with no third-party libraries.

## Run locally

```bash
cd lumao && python3 -m http.server 8972 --bind 127.0.0.1
```

Open `http://127.0.0.1:8972/`. Tests: `node --test tests/*.test.cjs`. Browser check: `NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <out-dir>`. No build step; `index.html` and `src/` are published as they are.

Fixed views: `?view=hero` (fresh), `smooth` (stroked happy), `ruffle` (ruffled, looking back), `warn`, `bite`, `furry` (fur mitten), `clap` (hair shaken off). `?q=low` for fewer fur layers, `?seed=n` for a different starting ruffle. Spec in [SPEC.md](SPEC.md) (Chinese), verification notes in [VERIFICATION.md](VERIFICATION.md).

## Who will open it, AI material

- Who will open it: anyone who has stroked a cat, been nipped and kept stroking, or never owns a sweater without cat hair on it.
- AI material: no AI-generated images, models or sounds; the cat, fur, blanket and sounds are all drawn and synthesised in code. One AI-generated reference picture was used before starting, only to compare colour and light, and is not in the page. Code written by a person working with AI.
