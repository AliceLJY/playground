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
