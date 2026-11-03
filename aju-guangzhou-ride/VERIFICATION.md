# Mobile fixes — 2026-11-03 (B4)

Only the two reported issues were changed. In short touch landscape, the map is a 74 × 44 CSS px launcher, speed and boost share a row, and utility actions leave the bottom driving corners clear. The existing route planner already pauses simulation; that behavior is retained and tested. Touch departure now explains automatic pedalling versus navigation and waits for confirmation. Closing the note keeps the bike stopped on the introduction. Desktop departure and all driving parameters are unchanged.

## Red before, green after

`tools/mobile-check.cjs` was run against the old implementation before changing it. Its baseline report has 16 failing checks: landscape overlaps/oversized map and intercepted map center, missing departure confirmation, and keyboard-only copy. The added close-target check also measured the original dialog close button at 35 × 35 px before enlarging it to 44 × 44 px. The final source and rebuilt single-file page each pass all 50 checks across five viewports. The checks also cover cancellation, ≥44 px driving targets and center hit-testing, a stationary simulation while the map is open, returning to riding, and zero page errors.

`node --test tests/*.test.cjs`: **27/27 passed**. No simulation rules or new gameplay were added. `python3 build.py` regenerated the ignored `阿橘的广州慢游.html`; CI generates this same file for `/aju/`, so the bundle is not committed.

## Browser and visual checks

- Google Chrome 156.0.8078.80, Playwright, real Apple M4 GPU (`ANGLE Metal Renderer: Apple M4`), bundled Three.js r160.
- Source and built page: 390 × 664, 320 × 568, 844 × 340, 844 × 300 and 1365 × 900 CSS px. Mobile device scale factor 2, normal renderer cap 1.5; desktop scale factor 1. No screenshot-only quality changes.
- Landscape checks begin at 390 × 664, tap Start, then rotate before confirming departure, matching the reported use case. Each departure, riding and map screenshot was opened and checked: the small map and readouts leave the driving buttons clear, and the departure text distinguishes pedalling from navigation.
- A separate 30-second recording of the built page at 390 × 664 exercised steering, braking, boost, map opening/closing and pause/resume. Sampled frames were reviewed; no page errors. This was an input smoke check, not a complete race or a judgment of steering comfort.

Evidence is outside the repository in the B4 output folder: `aju-red/`, `aju-source/`, `aju-built/` (screenshots and `report.json`), `aju-node.txt`, and `aju-smoke/` (recording and state). Example frames: `aju-built/390x664-departure.png`, `aju-built/844x300-ride.png` and `aju-built/844x300-map.png`.

## Reproduce

Serve the repository root with `python3 -m http.server 8844 --bind 127.0.0.1`. In a second terminal, from this directory:

```sh
node --test tests/*.test.cjs
python3 build.py
NODE_PATH="$(npm root -g)" node tools/mobile-check.cjs http://127.0.0.1:8844/aju-guangzhou-ride/ /tmp/b4-aju-source
NODE_PATH="$(npm root -g)" node tools/mobile-check.cjs 'http://127.0.0.1:8844/aju-guangzhou-ride/阿橘的广州慢游.html' /tmp/b4-aju-built
```

## Limits and deferred observations

Physical phones, Safari, sound, human comprehension of the new copy, and handling comfort remain unverified. At 300 px height, opening the original introduction directly in landscape can leave its Start button outside the viewport; this is a separate pre-existing issue, outside the two requested report items. The narrow 320 px and short landscape route dialogs still scroll to their lower actions. Neither was silently counted as a no-scroll pass. No new delivery mission or completed-journal feature was added. Performance was not benchmarked in this pass.
