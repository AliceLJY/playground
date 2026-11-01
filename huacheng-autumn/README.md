# Huacheng Autumn

A small Guangzhou riverside scene to turn in your hands: bougainvillea spills over a footbridge, a white tram passes underneath, and pink silk-floss flowers grow around Chigang Pagoda. Canton Tower stands in the distance. Watch the traffic, look closely at the flowers, or move the afternoon into night.

By **我的AI小木屋**.

No imported images or models. Geometry, foliage, water, brick variations, vehicle markings and lights are all generated in code. The page is silent and has no score or ending.

## What you can do

- **Look around.** The camera follows a roughly 40-second tour, passing the footbridge, pagoda and a wide view of the model. Drag at any time to take over.
- **Change the hour.** The bottom slider moves from afternoon through dusk into night. Sun glints give way to soft reflections of distant lights; windows and street lamps turn on.
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

The proportions, distances and positions are stylized, **not surveyed**. The scene combines places into one miniature. In reality, Canton Tower is also in Haizhu on the south bank; moving it across the water here is a compositional choice. The skyline is a simplified invention. The tram's route sign and window lighting are illustrative details, not operational information.

## Run and check locally

Run these commands in `huacheng-autumn/`, using Node.js with npm. Browser checks also need locally installed Playwright and Google Chrome.

```bash
npm ci
node tools/build.mjs                    # Self-contained dist/index.html
node --test tests/*.test.cjs
node tools/flower-audit.mjs . shots/r3/audit.html
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs shots/r3/browser
NODE_PATH="$(npm root -g)" node tools/refinement-motion.cjs shots/r3/motion
NODE_PATH="$(npm root -g)" node tools/layout.cjs shots/r3/mobile
NODE_PATH="$(npm root -g)" node tools/phone-route.cjs shots/r3/phone-route
NODE_PATH="$(npm root -g)" node tools/shot.cjs shots/r3
NODE_PATH="$(npm root -g)" node tools/night-check.cjs shots/r3/night
NODE_PATH="$(npm root -g)" node tools/opening-check.cjs shots/r3/opening
```

Open `dist/index.html` directly, or serve the source and build:

```bash
node tools/serve.cjs . 18953
# In another terminal, run the source-entry check:
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs shots/r3/source http://127.0.0.1:18953/dev.html
```

Source: `http://127.0.0.1:18953/dev.html`. Build: `http://127.0.0.1:18953/dist/index.html`. Run GPU checks sequentially. The flower audit is an isolated diagnostic build; it is not the release file.

Fixed views are `?view=hero`, `?view=bridge`, `?view=pagoda` and `?view=wide`. Add `&h=0`, `&h=0.55` or `&h=1` for afternoon, dusk or night, and `&t=13` for a reproducible simulation time. All views use the normal rendering path. The page exposes `window.__huacheng` and `window.__PLAYTEST__` for inspection; normal interaction does not depend on them.

The r2 negative-control build is preserved in `shots/r3/baseline/`. This command intentionally fails the calm-water and tower-separation assertions:

```bash
NODE_PATH="$(npm root -g)" node tools/refinement-check.cjs shots/r3/baseline/check "file://$PWD/shots/r3/baseline/index.html"
```

## Measured results and limits

Round-three evidence, screenshots, renderer details and reproducible measurements are in [VERIFICATION_R3.md](VERIFICATION_R3.md). The build and all 12 Node tests passed. Both the packaged page and source entry passed all 26 browser checks; the motion and night checks also passed.

- Off-band foreground water: screenshot luminance standard deviation fell from 0.02393 to 0.00722, below the unchanged 0.008 limit.
- The pagoda view's two tower projection boxes now have a 222 px horizontal gap at 1440×900; r2 overlapped.
- The 390×664 and 412×700 phone layouts were measured in desktop Chrome emulation at about 60 fps with device pixel ratio 2. Text, buttons and the slider remain inside the viewport without overlaps. During the complete 40-second tour, the introduction hides before the model enters its area and returns when clear; the visible text stays below the model.
- **Not tested on a real phone or in Safari.** Desktop-emulated frame rates do not predict phone performance. Adaptive render resolution remains enabled.
- Water and glass use procedural approximations rather than physically accurate reflections. Lighting and building proportions are artistic choices. Visual appeal still needs human judgement.
- This round does not publish the page or add it to the playground home page or deployment workflow.

## Licence

The page source belongs to **我的AI小木屋**; this directory does not grant a separate open-source licence. Bundled Three.js retains its MIT licence, reproduced in a comment at the top of `dist/index.html`. The cited articles and photographs remain with their respective rights holders; their images are not bundled.

## Who it's for, AI assets

- Who it's for: People who want a quiet minute with Guangzhou's autumn flowers, miniature architecture and a passing tram.
- AI assets: The page contains no imported images or models; everything is generated in code, including its canvas-drawn markings. Codex generated the reference images solely to establish the visual direction; those images are not included in the page. Codex wrote the code; Claude Code is responsible for direction and acceptance review. No audio is used.
