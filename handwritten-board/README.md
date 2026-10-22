# Handwriting Board

Two pages of handwritten board write themselves out one stroke at a time, and what they say is how the board itself is made: a handwriting font revealed character by character, a hand that follows the pen tip, and a red pen that circles the key words. Tap the picture to pause or resume; change the speed, replay, switch between flipping pages and one long scroll, or change the font. One pass takes about 36 seconds.

**[Watch online](https://aliceljy.github.io/playground/handwritten-board/)** (the words on the board are in Chinese)

It fits phones in either orientation and desktop. On a phone held upright the board switches to a squarer shape so the writing stays large; turn the phone or resize the window and it switches again without losing its place. There is no sound.

## Controls

- Tap or click the board, press Space on a desktop, or use the first button: pause and resume. After the last page the same control starts it again.
- Replay, speed (1x to 2x), the page-mode switch and the font menu are in the bar under the board. Page mode stacks two pages and turns the page; with it off the pages run down one long scroll and the camera follows the pen.
- The font menu lists Long Cang, which ships with the page, plus four handwriting fonts that come with Apple systems; a font the device does not have is greyed out.

## How it is built

- Plain static files, no build step and no network request. The board is DOM text, one `<span>` per character, revealed left to right with an animated `clip-path`; the red circles, lines and arrows are SVG paths drawn with stroke-dashoffset; the hand is an inline SVG that moves on the same GSAP timeline as the reveal, so pen and letters stay in step.
- `src/pages.js` holds the words, `src/core.js` the timing numbers, the two board shapes and the doodle geometry (no DOM, so Node can test it), `src/board.js` the page logic.
- The font is a subset of Long Cang cut to the characters on the board plus ASCII and common Chinese punctuation: about 40 KB instead of 5 MB. Rebuild it with `node tools/subset-font.cjs <LongCang-Regular.ttf>`.
- The one-page spec is [SPEC.md](SPEC.md) (in Chinese): colours, composition numbers, performance budget and ten acceptance items.
- Fixed views: `?view=page1` and `?view=page2` freeze on each finished page, `?view=mid` on the middle of the first page's third line, and `&mode=flow` takes any of them in long-scroll mode. Without parameters it plays from the start. The debugging hook is `window.__handBoard`.
- Third-party files and their licences are in [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md): GSAP 3.13.0 (its Standard "No Charge" licence, not MIT) and the Long Cang font (SIL Open Font License 1.1).

## Run locally

```bash
cd handwritten-board && python3 -m http.server 8973
```

Open `http://127.0.0.1:8973/`. Tests: `node --test tests/*.test.cjs`. Publishing copies `index.html`, `src/` and `vendor/` as they are.

## Verification

See [VERIFICATION.md](VERIFICATION.md) (in Chinese). It has not been tried on a real phone, and how it feels to watch still needs a person.

## Who it's for, AI assets

- Who it's for: People who want to see how a "handwriting on a board" explainer is put together, step by step, and anyone who likes watching two pages of notes get written out calmly.
- AI assets: No AI-generated images, models or sounds, and no audio at all. The hand and pen are vector shapes drawn in code and the red marks are generated paths. The words on the board and the code were written through human-AI collaboration. The Long Cang font (SIL OFL) and the GSAP library are third-party, not AI.
