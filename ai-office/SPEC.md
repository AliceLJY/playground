# Pixel office

## Phase 2 frontend specification

The same quiet, muted, 1–3 minute visit now includes a connected downstairs annex and a record of today's activity. Sensory pleasure and immersion remain the goals. This is an ambient display, with no win/lose loop. Visitors scroll vertically to explore and open the Today drawer.

- Preserve every original 360 × 420 room coordinate. Extend the logical canvas to 360 × 740 (720 × 1480 backing pixels). A corridor at x=312–342 connects the original south edge to the annex. The meeting room occupies the left two thirds below y=490; the booth and storage occupy the right; audience seats sit outside the south glass wall. The cumulative board occupies y=426–478. Retain the original sRGB palette, with glass `#9CBAB1`, paper `#FFF4D5`, warning `#BA5045`. Projection/body board type is 8–10 logical pixels, supporting labels at least 6.
- Reuse the existing grid BFS, movement, pixel helpers and native DOM. No dependencies, assets, new backend or build step. Phones keep a width-fit canvas in a vertically scrollable room viewport, not a whole-building thumbnail. MV retains its original camera and room drawing; wallpaper fits the extended room.
- Scene movement overrides status movement. A concurrent call takes priority for CC; other meeting members remain seated. Ending either resumes normal status routing. Folders travel for 1 second and persist only for current dispatched IDs. Guard visibility requires both a signal and Beijing night; one patrol is repeated only when its signal timestamp changes.
- Optional fields missing on old feeds render empty rooms and unavailable totals, never fabricated activity. Reject malformed snapshots before mutating the scene. Unknown valid event kinds are skipped. Guest notices are never displayed. Demo totals are fixed examples labelled 演示 on the board as well as in the banner.

Acceptance (same renderer and pixel ratio for default and fixed views):

1. `node --test tests/*.test.cjs`: retain existing behavior and reject invalid IDs, dates, ranges, shapes and array lengths. The supplied contract fixture is unchanged and accepted.
2. Scene tests advance real simulation: all meeting members reach distinct seats within 35 seconds; after clearing the meeting busy members return within 35 seconds. CC reaches the booth and returns on hangup. Every new target has a nonempty BFS path from every desk.
3. Added/removed dispatch IDs create outbound/return flights lasting 1 second; unchanged snapshots never replay them. Storage layers increase monotonically from 0 to 8 over 0–100%; null gives no boxes; 92% gives a red note.
4. Guard patrol completes a closed route within 180 seconds with actual movement and no blocked samples or stationary windows over 2 seconds while en route. Daytime draws no guard. Done uses green/red/unknown indication according to ok.
5. At most two real visitors occupy audience seats, only during meetings; treat runners do not count. Clearing the meeting resumes touring, falling visitor counts still cause exits.
6. Fixed seed demo timeline views: meeting (73 s), booth (112.5 s), handoff (45.5 s), board (73 s), night-guard (8 s with night=1). Run from zero; no teleporting. Report requested versus achieved state. Mobile 390×664 and 320×568 have no horizontal overflow; all three drawer tabs and controls remain reachable. Browser screenshots include an unchanged live-shaped fixture.
7. Recheck `?mv=1&hold=1`, `?wall=1`, greetings, photos and treats; capture the first 30 seconds and inspect screenshots. Photo dimensions include the annex. Default render callback p95 remains <12 ms on this Mac (not a phone FPS claim). At most 18 people including five visitors and guard; no WebGL rendering.
8. Keep browser evidence in ignored `tools/shots/`; record commands, actual results, limitations and contract questions in `HANDOFF-phase2.md`. No publication, runtime service changes or git staging/commits in this phase.

Watch a small AI team work, wait for a decision, deliver work and take breaks. This is an ambient display, not a game: the primary MDA goals are sensory pleasure and companionship/immersion. A visitor uses a phone, usually muted, for 1–3 minutes; the only controls open the team drawer and notice board. No music, welcome screen, framework or image assets.

## Picture and timing

- Canvas 2D, original room 360 × 420 within the 360 × 740 extended canvas, straight-on cutaway room. Warm wood floor, back wall in the upper 22%, desks in the middle 45%, lounge at left and boss desk in the lower quarter. Characters are 12–16 logical pixels wide. Light comes from the upper-left windows.
- sRGB palette: ink `#253334`, cream `#F4EBD8`, timber `#BB8960`, sage `#739C82`, accent coral `#D96952`. Each character has one main colour and one distinguishing accessory. No external fonts or images.
- Beijing time: day 08–17, dusk 17–23, night 23–08. Lamp colours change, text contrast does not. Busy characters type at their desks; waiting characters walk to the boss and knock with a pulsing red marker; done characters bounce/confetti for 2 seconds, then walk to the lounge. Away/off characters walk through the door. Unknown is a gray question mark. The boss returns to the desk when anyone waits.
- The courier walks from reception to the boss, waits until both are at the desk, then holds a first-line notice for **8 full seconds**, and returns. Notices queue, never replace an in-flight delivery; the board keeps the latest 20.
- Deterministic 150-second demo. `?demo=1` forces it; failed live fetch switches to it with the exact visible banner `演示模式 · 模拟数据`. Retry live service every 10 seconds unless forced demo. Queue/notice views are explicitly marked demo fixtures, never fabricated live readings.

## Evidence rules

Poll every 10 seconds. Push overrides collection for 10 minutes, including after restart. Preserve `statusSince` unless the status changes. Read failures, ambiguous input, incomplete scans and invalid timestamps yield unknown, not idle. A known inactive signal ages to idle after 30 minutes, or off at Beijing 23–08; explicit off, unknown and artifact adapters' away rules take precedence. A running Codex process is itself a fresh signal. Dots starts idle with “等派活”; after an expired push it follows the no-signal timeout. Artifact mtime is evidence of a changed mirror, not evidence of current work. Done pulses last 20 seconds on the service; etwin's new complete activity line triggers busy for 60 seconds first.

## Acceptance

1. Unit/integration tests cover all status boundaries, unknown precedence, stable statusSince, 10-minute push precedence/restart, 401, 4096-byte cap, 80-character cleaning, 429 and a persisted 20-notice limit.
2. Real `--once` yields valid JSON with 11 roles, all with valid states; CC is not unknown. Live GET and authenticated/unauthenticated notice POST are exercised.
3. 390 × 664 and 412 × 700 mobile layouts have no horizontal overflow; the drawer toggle and every scrolled row remain reachable. 1280 × 800 has a right-hand panel. Also check 320 × 568 and 844 × 390.
4. Fixed seed 7: `?demo=1&view=hero` at 4 seconds (typing); `?view=queue` at 20 seconds (at least two waiting at the boss); `?view=notice` at 35 seconds (courier at boss, note visible). All run the same simulation from time zero; only the clock is frozen. The hook reports the requested and actual state. Live `?view=hero` remains live.
5. Browser screenshots: `tools/shots/hero.png`, `queue.png`, `notice.png`, `hero-live.png`, plus default, desktop and expanded drawer. Open and inspect each image. Read state and page errors; no external requests.
6. Observe the normal entrance for 30 seconds using browser clock frames: typing, walking, completion, queue and courier movement must progress. No off-screen actors except intentional away/off; no stationery-crossing paths. No game difficulty assertions apply.
7. Target current Chromium/Safari on phone/desktop, 30 animated frames/s, no WebGL/draw calls. Canvas uses a cached room layer; <= 2 canvases, <= 18 people, <= 96 confetti pixels. Measure rendering cost in the normal view (p95 < 12 ms on the local Mac); do not claim actual phone performance from emulation.
8. Public state excludes source paths, process/session details and arbitrary summaries. Notices redact recognizable paths, accounts and amounts; callers must supply non-sensitive first lines. Config, token and persisted state stay outside the public directory with mode 600.

## Scope and simplifications

Reuse the repository's pure-logic + Canvas + Node-test pattern; Node built-ins and browser APIs are sufficient. No dependencies, database, build step, background service installer or source integration. Artifact scans are capped at 20,000 entries and return unknown if incomplete. Revisit incremental indexing only if this ceiling is reached. Phase 1 integration is described in HANDOFF.md. Phase 2 changes only the frontend, preview and acceptance artifacts; no private runtime files or service changes.
