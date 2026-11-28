# Tear-off Calendar · Guangzhou Almanac

[中文版](README_CN.md)

An old-style tear-off calendar hangs on the wall, open at today. Pinch the bottom corner and pull: the sheet first bends with your finger and lifts off the pad, pull further and it tears along the perforation bit by bit, leaving a ragged edge with loose fibres. The torn page flutters down and tomorrow is underneath.

Every page is a real almanac page: lunar date, stems and branches, solar terms and festivals, the day's auspicious and inauspicious activities, and China's 2026 public holidays and make-up working days (holiday numbers are red, make-up working weekends are black). At the bottom is a Cantonese saying with a Mandarin gloss; on the winter solstice it is 冬大过年, "the solstice matters more than New Year".

Details of how it plays:

- **A gentle lift does not tear.** Peek at the next page and let go; the sheet falls back flat.
- **Stop your finger and the tear stops.** Let go halfway and the half-torn page stays hanging with its corner slightly curled.
- **The side you pull opens first.** Pull the bottom-right corner down and it tears from the right; drag sideways and the whole sheet twists, so the tear may start at the far end.
- **The stub gets fluffier.** Every page leaves a scrap under the binding.
- Space, Enter or the down arrow tears a page automatically. After tearing, a "回到今天" (back to today) button appears.

Made for a phone held upright, one thumb, sound off. The tearing sound is synthesised in code; there are no audio files.

## How it works

Two tricks borrowed from the [Filament fabric lab](https://play.liyue.io/filament/):

1. **Only the patch under the finger moves with the finger.** The sheet is a 13×15 grid of position-based constraints; pressing grabs a small patch around the finger and the rest bends through its constraints. The top row hangs on soft pins at the perforation; a pin pulled past its threshold breaks, and a finger pulling further than the paper can follow also counts as tearing.
2. **The tear is drawn into the texture, not cut into the mesh.** Every broken pin erases a ragged strip from the top of the page texture and draws a few fibres; the same strip is painted onto the stub under the binding.

A torn page falls with drag along its normal plus a little side wind. Everything is drawn with plain WebGL and Canvas 2D, with no third-party libraries.

## Run locally

```bash
cd tear-calendar && python3 -m http.server 8971 --bind 127.0.0.1
```

Open `http://127.0.0.1:8971/`. Tests: `node --test tests/*.test.cjs`. Browser check: `NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <out-dir>`. No build step; `index.html` and `src/` are published as they are.

Fixed views: `?view=hero` (flat, with the hint), `?view=lift` (corner lifted), `?view=torn` (half torn, finger stopped), `?view=fall` (torn page falling); `?date=2026-12-22` picks the start day. Spec in [SPEC.md](SPEC.md), verification notes in [VERIFICATION.md](VERIFICATION.md).

The almanac is baked into `src/almanac.js` by `tools/gen-almanac.cjs` from [lunar-javascript](https://github.com/6tail/lunar-javascript) (MIT, 1.7.8), covering 2026-01-01 to 2027-12-31; 2027 public holidays will be baked once officially published.

## Who opens this, AI assets

- Who opens this: anyone whose family had a tear-off calendar on the wall and who raced to tear the page as a kid; anyone who likes a daily look at what the almanac says.
- AI assets: no AI-generated images, models or sounds; the calendar, paper texture and tearing sound are drawn and synthesised in code; almanac data comes from the open-source lunar-javascript; the Cantonese sayings with their glosses and the code were made by a person working with AI.
