# Tidal Disruption

An interactive, 108-second journey from a star's approach to the fading accretion disk. Drag to orbit, use the wheel or pinch to zoom, and scrub freely through six stages. Space toggles playback. The physics panel explains each stage and the approximations.

## Run locally

```sh
npm install
node tools/build.mjs
node tools/serve.cjs . 8941
```

Open `http://127.0.0.1:8941/dist/index.html`. The source entry is `/dev.html`. The built page is one self-contained HTML file with bundled Three.js and no network-loaded assets.

Fixed views pause the same simulation at a reproducible time.

- `?view=wide` shows the approach at 8 seconds.
- `?view=hero` shows the forming disk at 82 seconds.
- `?view=edge` shows lensed images of the disk from a low angle at 82 seconds.

View buttons change the camera while preserving the current time. The unparameterized entry starts at the beginning. Playback finishes at 108 seconds and offers replay.

## Rendering and physics

A low-resolution fragment shader numerically integrates the Schwarzschild null-geodesic spatial orbit equation, `x'' = -1.5 L² x / r⁵`, in Schwarzschild-radius units. A ray samples gas each time it crosses the disk plane, samples the stellar volume along its curved segments, and samples procedural stars using its final escape direction. Higher-order disk images and the photon ring emerge from these trajectories. The local launch direction and finite integration steps approximate the observer's exact relativistic frame.

GPU fragment shaders compute debris coordinates directly into a floating-point texture. The same deterministic time function supports backward scrubbing. Debris follows energy-dispersed Kepler ellipses with prescribed apsidal precession, then gradually circularizes. An additive two-attachment density atlas records emission and velocity moments. Velocity variance at overlapping streams estimates collision heating. The ray shader samples both attachments, so debris shares the lensing path with the disk and stars. Differential rotation and approximate gravitational/Doppler shifts affect the emissive disk.

The star size and event duration are adjusted for visibility. Debris is collapsed to a thin layer for ray intersections. Circularization, radiative cooling and shock heating are phenomenological. Color is a temperature-inspired visible-light mapping. Hydrodynamics, magnetic fields, radiative transfer and black-hole spin are outside this model. There is no jet or audio.

## Power budget and checks

Rendering is capped at 30 fps. Desktop pixel ratio is capped at 1.5 and mobile at 1.25. The three tiers use 0.30/0.75/1.00 ray-target scale, 384²/1024²/1024² density atlases, 96/144/192 maximum steps, and 4,096/9,216/16,384 GPU particles. The default balanced tier targets a GPU median at or below 20 ms on the M4 desktop. Every frame uses four draw calls. Sustained overload lowers quality, with slower recovery and an eight-second cooldown. Hidden or offscreen scenes stop rendering. A paused, untouched scene also stops completely.

```sh
node --test tests/*.test.cjs
node tools/browser-check.cjs
node tools/browser-check.cjs --record
node tools/clarity-check.cjs
node tools/r3-compare.cjs
node tools/performance-check.cjs
```

The checker finds the locally installed Playwright, uses Chrome and a temporary local server, and writes screenshots plus `shots/browser-report.json`. An optional page URL can target a mounted build. `--record` also captures 30 seconds of normal-entry interaction. All browser GPU work runs sequentially. `?test` enables measurement-only controls. The public `window.__PLAYTEST__` reports actual rendering metrics and provides reset, seed and step operations.

The clarity test renders real final-frame pixels at 82 seconds in both hero and edge views, comparing each default image against a same-frame full-resolution reference with a 1024² density atlas. Ring and inner-disk gradient energy must each retain at least 65% of the reference. The Node suite runs this GPU check too. `r3-compare.cjs` requires the retained old/new captures in `shots/` and produces side-by-side images with 3× crops. Run the performance pass separately after other GPU checks finish; it records Chrome process load alongside actual timer-query samples.

Measured results and remaining coverage are in [VERIFICATION.md](VERIFICATION.md). Performance controls reduce rendering duty cycle. Device temperature and long-duration thermal behavior require direct hardware measurement.

## References

The visual direction follows the user-supplied case-nine evaluation frame, retained only as an acceptance reference in `shots/reference-carbon.png`. The production page contains no reference images. Gravitationally warped disk images and Doppler asymmetry were cross-checked against NASA's visualization. Stream intersection and dissipative circularization are informed by Dittmann's analytic TDE study. The simulation uses its own simplified equations and code. [NASA visualization](https://www.nasa.gov/universe/nasa-visualization-shows-a-black-holes-warped-world/), [Dittmann 2021](https://arxiv.org/abs/2112.14778)

Bundled Three.js retains its MIT notice in the built HTML. Page credit is 我的AI小木屋 / @AliceLJY.

## Who it's for, AI assets

- Who it's for — Curious visitors who want to observe a star becoming a luminous debris stream around a black hole, with control over camera and time.
- AI assets — Code was completed through AI collaboration. All stars, gas, noise and geometry are generated procedurally. No AI-generated images, models or sounds are used.
