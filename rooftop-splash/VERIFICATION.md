# Feel pass — 2026-10-24

Reference: the single-file FPS *Low Tide* (aivi.fyi), read as source only. Its per-shot stack (spring recoil, camera kick, jittered sound, hit marker, distinct kill confirmation, hurt flinch) was mapped onto water-gun terms. AGENTS.md §8 ordering was kept: input latency is unchanged (mouse-down still fires on the same event), then contact feedback, camera, sound.

## What changed

- `src/feel.js` (new, no DOM): damped springs, trauma shake (squared, capped, decays linearly on accumulated game time), hit-stop that only freezes the match step, ±6 % seeded pitch jitter, and one weight table per event.
- Own shot: gun pushes back and tips up on springs, a small camera kick that settles before the next shot, muzzle spray, a filtered-noise squirt per blaster.
- Stream sags toward the middle; impacts burst into droplets; shots that land on the roof leave wet spots that dry over six seconds (ring buffer of 40).
- Hit on an opponent: the target squashes briefly and splashes; the hit marker pops with a short "pat" sound.
- Soak-out by the player: larger orange marker, two-note chime, 55 ms hit-stop, light shake, big splash and a wet patch.
- Getting hit: flinch with a little roll, a blue arc pointing at the shooter, muffled splash sound. Balloons shake the camera by distance.
- Sprint widens the field of view slightly; landing from a jump dips the camera and gun.

## Automated checks

- `node --test tests/*.test.cjs`: 26 passed (19 existing + 7 in `tests/feel.test.cjs`).
- The feel tests drive real seeded matches (3v3 / 4v4 / 6v6, all difficulties) with a player autopilot and assert hit-stop stays under 2 % of play time, shake stays bounded and every match still finishes. A guard asserts at least one player soak-out happened, so the hit-stop check cannot pass vacuously (it caught exactly that on the first run, before the autopilot existed).
- Calibration against a known-bad build: adding hit-stop to every plain hit fails two tests, including the real-match one; the first spring tuning (camera kick still 65 % of peak at the next 0.13 s shot) failed the settle test and was retuned.

## Browser acceptance

Chromium via Playwright on Apple M4 (ANGLE Metal, real GPU), 1280×720, default quality. Source entry and the built standalone HTML were each played for 30–45 s with an autopilot that aims by dragging (pointer lock unavailable in automation). No page errors. Screenshots were read for hit, soak-out and hurt moments: marker pop and orange kill marker, hurt arc pointing at the shooter, wet patches under targets.

## Limits

Whether it actually feels better needs a human playtest; automation cannot judge it. Touch controls were not re-run in this pass (their code path is unchanged; feedback is driven by the same core events). Phone performance with the extra wet-spot draws was not measured.

# Verification — 2026-09-23

## Automated checks

- 19 simulation tests passed, including nine seeded complete matches spanning 3v3 / 4v4 / 6v6 and all difficulty levels.
- All 62 tests across Rooftop Splash, Xiaoju Racing and Aju passed.
- JavaScript syntax checks and `git diff --check` passed.
- The standard-library build produced a standalone HTML file with inlined scripts, CSS and the Three.js license.

## Browser acceptance

Tested in Chromium through Playwright, including the generated standalone HTML:

- Team, match size, target, difficulty and initial blaster selections applied to the game.
- Keyboard movement, firing, switching, refill, zoom, water balloons, scoreboard and pause worked. The match clock remained frozen while paused.
- A real-time 6v6 hard match reached its 15-point target at 14:15 after approximately 34.5 seconds. The results panel listed all twelve players. Restart reset the scores and clock.
- No page runtime errors or external runtime requests were observed in the standalone acceptance run.
- Touch emulation at 852×393 exercised movement and look through actual touch events, plus switching, water balloons and pause. Portrait 390×844 had no horizontal overflow, and the start button remained inside the viewport.

## Limits

Real phone hardware, Safari, and user judgment of aiming feel are not yet verified. The browser automation environment rejected pointer lock, so desktop interaction acceptance used the drag-to-aim fallback; native mouse capture still needs an ordinary browser playtest. The bundled Three.js r160 legacy build emits its upstream deprecation notice; this is not a runtime error. No online multiplayer is implemented.

The bounds tests verify static cover collisions. Characters are not solid collision obstacles to movement. The arena intentionally uses box collision bounds and a one-metre navigation grid; these are sufficient for this map, not a general-purpose physics engine.
