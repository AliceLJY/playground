# Late-Night Grocery

A street-corner miniature on a rainy night, where one old grocery is the only shop still lit. Turn the model around from outside, then pinch out (or scroll forward) and you get pulled into it, standing on the street at human eye height. Go in and work a night shift. There is a note taped to the counter with the shift rules.

**[Play it](https://aliceljy.github.io/playground/diorama-walk/)** · If you would rather not be scared, open the [calm version](https://aliceljy.github.io/playground/diorama-walk/?calm=1), which has nothing frightening in it.

There are scares. Headphones and a dark room are recommended.

The interface text is in Chinese.

## Controls

| Where | Phone | Desktop |
|---|---|---|
| Outside, looking at the model | drag to turn it, pinch out to zoom in and walk in | drag to turn, scroll forward to zoom in and walk in |
| Walking in the shop | press at the lower left for a joystick, drag anywhere else to look, tap the floor to walk there | W S or ↑ ↓ to walk, A D to step sideways, ← → or Q E to turn, Shift to run, drag to look, click the floor to walk there |
| Reading the note | walk up to it, look at it, tap | the same, or press F |
| Whole-shop view | pinch in; pinch out again to land where you point | scroll back; scroll forward to land at the cursor |
| Back outside | pinch in again from the whole-shop view | scroll back again, or press Esc at any time |

## How it is made

- One self-contained page rendered with Three.js and no external assets. The shop, shelves, figure and dog are plain blocks and flat colours (a grey box). Rain, tilt-shift and the flickering tube light are procedural, and the sound is synthesised live with WebAudio and placed in space.
- Walking into the model is driven by a single transition value: the orbit camera follows a curve down to 1.6 m eye height while fog, tilt-shift and field of view change with it; zooming out reverses the path. Inside a shop there is one more level, a whole-shop view like looking into a dollhouse.
- Every scare is triggered by play: where you stand, where you look, whether something is in view, and whether you kept the rules.
- Inspired by [@beefnoode](https://x.com/beefnoode/status/2107417931017761271)'s rainy-night miniature convenience store on X. That piece is only viewed from outside the model; this one tries letting you zoom in and walk inside.

The spec and the per-round acceptance records are in [SPEC.md](SPEC.md) and [VERIFICATION.md](VERIFICATION.md) (in Chinese). **They contain every spoiler.**

## Run and test locally

```bash
cd diorama-walk
npm ci
node tools/build.mjs            # bundles dist/index.html, a single file that works offline
node --test tests/*.test.cjs    # logic tests
```

Browser acceptance runs through `tools/browser-check.cjs` (Playwright, needs a real GPU). Fixed views such as `?view=hero`, `?view=inside` and `?view=door` are listed in the spec's section on fixed views and the test hook.

## License

The game's own source belongs to the author. The bundle inlines Three.js (MIT); its license text is in the comment at the top of `dist/index.html`.
