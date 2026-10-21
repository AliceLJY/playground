# Back to the Pit (打回乐池)

Three Yingge paper puppets — Puning on the left, Jiazi in the middle, Chaoyang Fenggang on the right — hold a little Teochew stage. A white-robed rod puppet (the evil spirit of the dance drama *Yingge*) climbs up out of the orchestra pit below the stage boards, flinging its white sleeves and lashing out with iron rods. Watch which lane's sleeve swells, and the moment that rod lights up, tap the lane: that puppet swings its drumsticks and the boss bounces, flips over backwards and drops back into the pit a notch. Miss and the puppet is knocked flat, gets up three seconds later, and the boss climbs a notch; if it reaches the stage front it takes the stage. Land hits in a row to fill the drum meter, then tap the big gong for a three-puppet "Big Yingge". Knock it all the way back after three waves, the boards close over the pit, and the puppets paint their faces and pass on the baton.

**[Play online](https://aliceljy.github.io/playground/yingge-pit/)**

About a minute per round. Made for portrait phones; landscape and desktop work too. Two people can play on one phone: Dad (阿爸) has the left half, Xinyuan (心远) the right, and the middle lane goes to whoever taps first.

## Controls

- Phone: tap the pads at the bottom, or the lane on the stage itself. In landscape the pads sit at the sides: left thumb for left and middle, right thumb for middle and right. When the drum meter is full, tap the gong at the stage front.
- Desktop (one player): ← ↓ → or A S D for left, middle, right; ↑, W or Space for the gong.
- Desktop (two players): Dad uses A (left), S (middle), W (gong); Xinyuan uses ↓ (middle), → (right), ↑ (gong).
- Pick one or two players on the title screen; sound can be switched off top right on the title and result screens.

## Three waves

- Wave 1, Peeking: one lane at a time.
- Wave 2, Feints: it swells a sleeve over one lane, then switches. The feinting sleeve never lights up, so waiting for the light beats every feint.
- Wave 3, Double lash: two lanes light at once; tap both with two thumbs (or two players).
- Between waves a red beef ball bounces across the stage. Tap it for points; a ball knocked back sometimes lands on the boss's head and it starts the next wave a notch lower.

## How it is made

- A one-page spec is in [SPEC.md](SPEC.md) (Chinese): palette, composition, telegraph lead and judge windows, how many notches each event moves the boss, wave pacing, drum meter length, performance budget and ten acceptance checks.
- Rules live in `src/core.js`, with no drawing, and run in Node; tests measure real simulated rounds: telegraph lead and judge windows, win rate and round length for four kinds of play (precise, shaky, idle, blind hammering), separate scoring for two players, the gong only working with a full meter, and how much of a lit rod shows.
- Drawing is a 2D canvas. The stage and the three puppets come from the short film *Yingge Little Stage*: the stage is reassembled from its layers with a deeper pit and warm light added, and the puppets swing their arms on the film's rig points. The boss, iron rods, light shafts, sparks and the closing face paint are drawn in code. The gong, wooden clapper and Jiazi's drum pattern are synthesised live with WebAudio.
- Fixed views: `?view=hero`, `?view=feint`, `?view=stress`, `?view=duo`, `?view=ball`, `?view=win`, `?view=result`, `?view=lose`; the debug hook is `window.__yingge`.

## Run locally

```bash
cd yingge-pit && python3 -m http.server 8951
```

Open `http://127.0.0.1:8951/`. Tests: `node --test tests/*.test.cjs`. There is no build step; publishing copies `index.html`, `src/` and `assets/` as they are. `tools/` holds the by-hand browser acceptance, recorder and art-baking scripts.

## Assets and origin

- A fan-made game. Everything on screen is self-made; no stills, footage or recordings of the dance drama are used. The line on the result card, that the cast of *Yingge* learned from the Puning, Jiazi and Chaoyang Fenggang Yingge troupes, comes from a Yangcheng Evening News report of 11 November 2024.
- `assets/` is baked from the short film's assets by `tools/make-art.cjs` (source files are only read, then scaled down to the sizes the game draws).

## Verification

See [VERIFICATION.md](VERIFICATION.md). Feel, how the gongs sound and whether it is funny still need a person to play it.

## Who it's for, AI assets

- Who it's for: People who have seen *Yingge* and want to bash a few gongs on a phone with someone at home; Teochew folks will recognise the Puning, Jiazi and Fenggang troupes.
- AI assets: The part sheets of the three Yingge paper puppets were generated with an AI image tool; the stage layers, gong and red ball were drawn in code in the short film's project; the boss, effects and sound are code; code written through human–AI collaboration.
