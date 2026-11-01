# Huacheng Autumn

A small Guangzhou riverside scene to turn in your hands: bougainvillea spills over a footbridge, a white tram passes underneath, and pink silk-floss flowers grow around Chigang Pagoda. Canton Tower stands in the distance. Watch the traffic, look closely at the flowers, or move the daylight into night.

By **我的AI小木屋**

No imported images or models. Geometry, foliage, water, brick variations, vehicle markings and lights are all generated in code. The page is silent and has no score or ending.

## What you can do

- **Look around.** The camera follows a roughly 40-second tour, passing the footbridge, pagoda and a wide view of the model. Drag at any time to take over.
- **Change the hour.** The scene opens in soft afternoon daylight. The bottom slider moves from **Day → Dusk → Night**; daytime uses neutral warm-grey haze, unlit silver steelwork and dark windows. Sun glints give way to soft reflections of distant lights; windows and street lamps turn on.
- **Look closer.** Zoom toward the tram's curved windscreen and route sign, hanging flowers, brickwork and individual leaves.

## Controls

| Action | Desktop | Phone |
|---|---|---|
| Turn the scene | Drag | One-finger drag |
| Zoom | Wheel or the + / − buttons | Pinch or the buttons |
| Return to the opening | Reset button | Same |
| Toggle the camera tour | Eye button | Same |
| Change the hour | Drag the bottom slider | Same |

When the tour is enabled, 4.5 seconds without input starts a smooth 3-second return to it. Hovering over the footbridge or pagoda slightly brightens its lights. With the system's reduced-motion setting, the tour starts disabled. The interface text is Chinese.

## Real-world references

These are the sources behind the reference table in [SPEC.md](SPEC.md), not assets loaded by the page.

| Element | Reference |
|---|---|
| Bougainvillea on Chigang North Footbridge | [Guangzhou Daily, “A city of flowers welcomes visitors”, 19 October 2026](https://news.dayoo.com/gzrbrmt/202610/19/170614_55014303.htm): orange, yellow and red flowers, with Canton Tower in the distance. |
| Silk-floss flowers around Chigang Pagoda | The photographs and captions in the same [Guangzhou Daily report](https://news.dayoo.com/gzrbrmt/202610/19/170614_55014303.htm). |
| Cascading flowers and flower-framed tower views | [Dayoo / Guangzhou Daily, Ersha Island flower corridor, 29 October 2026](https://news.dayoo.com/guangzhou/202610/29/139995_55018230.htm). |
| Haizhu tram and its white body with red kapok flowers | [Haizhu Tram](https://en.wikipedia.org/wiki/Haizhu_Tram); the early livery is also described in [Nanfang Daily's 16 October 2014 report, reproduced by Sina](https://news.sina.com.cn/c/2014-10-16/063930996533.shtml). |
| Chigang Pagoda's octagonal, nine-storey exterior | [Chigang Pagoda](https://en.wikipedia.org/wiki/Chigang_Pagoda). [Haizhu District's history](https://www.haizhu.gov.cn/hzdt/ztlm/tzhz/rjhj/lyjd/hsgy/content/mpost_9123078.html) dates the start of construction to 1619. |
| Canton Tower's narrow waist and twisted lattice | [Canton Tower](https://en.wikipedia.org/wiki/Canton_Tower). |

The proportions, distances and positions are stylized, **not surveyed** The scene combines places into one miniature. In reality, Canton Tower is also in Haizhu on the south bank; moving it across the water here is a compositional choice. The skyline is a simplified invention. The tram's route sign and window lighting are illustrative details, not operational information.

## Run and check locally

Run these commands in `huacheng-autumn/`, using Node.js with npm. Browser checks also need locally installed Playwright and Google Chrome.

```bash
npm ci
node tools/build.mjs                    # Self-contained dist/index.html
node --test tests/*.test.cjs
node tools/flower-audit.mjs . shots/r5/audit.html
NODE_PATH="$(npm root -g)" node tools/r5-check.cjs shots/r5/metrics
NODE_PATH="$(npm root -g)" node tools/architecture-check.cjs shots/r5/architecture
NODE_PATH="$(npm root -g)" node tools/glare-check.cjs
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs shots/r5/browser
NODE_PATH="$(npm root -g)" node tools/refinement-motion.cjs shots/r5/motion
NODE_PATH="$(npm root -g)" node tools/layout.cjs shots/r5/mobile
NODE_PATH="$(npm root -g)" node tools/phone-route.cjs shots/r5/phone-route
NODE_PATH="$(npm root -g)" node tools/shot.cjs shots/r5
NODE_PATH="$(npm root -g)" node tools/night-check.cjs shots/r5/night
NODE_PATH="$(npm root -g)" node tools/performance-check.cjs shots/r5/performance
NODE_PATH="$(npm root -g)" node tools/opening-check.cjs shots/r5/opening
```

Open `dist/index.html` directly, or serve the source and build:

```bash
node tools/serve.cjs . 18954
# In another terminal, run the source-entry check:
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs shots/r5/source http://127.0.0.1:18954/dev.html
```

Source: `http://127.0.0.1:18954/dev.html`. Build: `http://127.0.0.1:18954/dist/index.html`. Run GPU checks sequentially. The flower audit is an isolated diagnostic build; it is not the release file.

Fixed views are `?view=hero`, `?view=bridge`, `?view=pagoda` and `?view=wide`. Add `&h=0`, `&h=0.55` or `&h=1` for daylight (the default), dusk or night, and `&t=13` for a reproducible simulation time. All views use the normal rendering path. The page exposes `window.__huacheng` and `window.__PLAYTEST__` for inspection; normal interaction does not depend on them.

The ca58b02 baseline is preserved in `shots/r5/baseline/`. Reproduce the old-version calibration with the same instrumentation:

```bash
node tools/flower-audit.mjs shots/r5/baseline shots/r5/baseline/audit.html
NODE_PATH="$(npm root -g)" node tools/r5-check.cjs shots/r5/baseline/metrics "file://$PWD/shots/r5/baseline/audit.html"
```

## Measured results and limits

Round-five screenshots, old/new measurements, renderer details and limitations are in [VERIFICATION_R5.md](VERIFICATION_R5.md). **Round 5 is not fully accepted: bridge structure coverage is below 30% in hero and bridge; hero flower coverage is below 25%, so the existing B7 bridge-focus check also fails.** The scene uses bevelled forms, finer exterior flower curtains, cached PCF soft shadows and half-resolution GTAO contact shading, with FXAA after tone mapping and an actual pixel-ratio floor of 1.5 on DPR2 screens. Flowers are concentrated on the bridge and silk-floss crowns. The station has a steel-and-glass vault; there are no overhead tram wires or pantographs.

The bridge has an open 3.8 m concrete deck, exposed handrails and piers, and 3.4 m stairs with flowers hanging outside the rails. The blue-grey river separates the foreground from the clearer far bank. Six cars measure about 4.57 × 1.86 × 1.45 m. The road has two 3.5 m lanes, the tram is about 2.65 m wide and 3.6 m tall, and the walks include benches, bicycles, bins and a small café. The overall arrangement and landmark heights remain compressed; this is an architectural illustration, not a survey.

Real phones, Safari and a deployed URL were not tested. Desktop-emulated frame rates do not predict phone performance; adaptive resolution remains enabled above its quality floor. Moving vehicles have independent soft contact shadows; the sunlight shadow map updates on the first frame and hour changes.  Procedural glass and water approximate reflections. No additional depth-of-field blur is applied, so the close views remain readable. This round does not publish or commit the page.

## Licence

The page source belongs to **我的AI小木屋**; this directory does not grant a separate open-source licence. Bundled Three.js retains its MIT licence, reproduced in a comment at the top of `dist/index.html`. The cited articles and photographs remain with their respective rights holders; their images are not bundled.

## Who it's for, AI assets

- Who it's for: People who want a quiet minute with Guangzhou's autumn flowers, miniature architecture and a passing tram.
- AI assets: The page contains no imported images or models; everything is generated in code, including its canvas-drawn markings. Codex generated the reference images solely to establish the visual direction; those images are not included in the page. Codex wrote the code; Claude Code is responsible for direction and acceptance review. No audio is used.
