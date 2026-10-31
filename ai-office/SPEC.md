# Pixel office v1

Watch a small AI team work, wait for a decision, deliver work and take breaks. This is an ambient display, not a game: the primary MDA goals are sensory pleasure and companionship/immersion. A visitor uses a phone, usually muted, for 1–3 minutes; the only controls open the team drawer and notice board. No music, welcome screen, framework or image assets.

## Picture and timing

- Canvas 2D, logical 360 × 420, straight-on cutaway room. Warm wood floor, back wall in the upper 22%, desks in the middle 45%, lounge at left and boss desk in the lower quarter. Characters are 12–16 logical pixels wide. Light comes from the upper-left windows.
- sRGB palette: ink `#253334`, cream `#F4EBD8`, timber `#BB8960`, sage `#739C82`, accent coral `#D96952`. Each character has one main colour and one distinguishing accessory. No external fonts or images.
- Beijing time: day 08–17, dusk 17–23, night 23–08. Lamp colours change, text contrast does not. Busy characters type at their desks; waiting characters walk to the boss and knock with a pulsing red marker; done characters bounce/confetti for 2 seconds, then walk to the lounge. Away/off characters walk through the door. Unknown is a gray question mark. The boss returns to the desk when anyone waits.
- The courier walks from reception to the boss, waits until both are at the desk, then holds a first-line notice for **8 full seconds**, and returns. Notices queue, never replace an in-flight delivery; the board keeps the latest 20.
- Deterministic 60-second demo. `?demo=1` forces it; failed live fetch switches to it with the exact visible banner `演示模式 · 模拟数据`. Retry live service every 10 seconds unless forced demo. Queue/notice views are explicitly marked demo fixtures, never fabricated live readings.

## Evidence rules

Poll every 10 seconds. Push overrides collection for 10 minutes, including after restart. Preserve `statusSince` unless the status changes. Read failures, ambiguous input, incomplete scans and invalid timestamps yield unknown, not idle. A known inactive signal ages to idle after 30 minutes, or off at Beijing 23–08; explicit off, unknown and artifact adapters' away rules take precedence. A running Codex process is itself a fresh signal. Dots starts idle with “等派活”; after an expired push it follows the no-signal timeout. Artifact mtime is evidence of a changed mirror, not evidence of current work. Done pulses last 20 seconds on the service; etwin's new complete activity line triggers busy for 60 seconds first.

## Acceptance

1. Unit/integration tests cover all status boundaries, unknown precedence, stable statusSince, 10-minute push precedence/restart, 401, 4096-byte cap, 80-character cleaning, 429 and a persisted 20-notice limit.
2. Real `--once` yields valid JSON with 11 roles, all with valid states; CC is not unknown. Live GET and authenticated/unauthenticated notice POST are exercised.
3. 390 × 664 and 412 × 700 mobile layouts have no horizontal overflow; the drawer toggle and every scrolled row remain reachable. 1280 × 800 has a right-hand panel. Also check 320 × 568 and 844 × 390.
4. Fixed seed 7: `?demo=1&view=hero` at 4 seconds (typing); `?view=queue` at 20 seconds (at least two waiting at the boss); `?view=notice` at 35 seconds (courier at boss, note visible). All run the same simulation from time zero; only the clock is frozen. The hook reports the requested and actual state. Live `?view=hero` remains live.
5. Browser screenshots: `tools/shots/hero.png`, `queue.png`, `notice.png`, `hero-live.png`, plus default, desktop and expanded drawer. Open and inspect each image. Read state and page errors; no external requests.
6. Observe the normal entrance for 30 seconds using browser clock frames: typing, walking, completion, queue and courier movement must progress. No off-screen actors except intentional away/off; no stationery-crossing paths. No game difficulty assertions apply.
7. Target current Chromium/Safari on phone/desktop, 30 animated frames/s, no WebGL/draw calls. Canvas uses a cached room layer; <= 2 canvases, <= 12 people, <= 96 confetti pixels. Measure rendering cost in the normal view (p95 < 12 ms on the local Mac); do not claim actual phone performance from emulation.
8. Public state excludes source paths, process/session details and arbitrary summaries. Notices redact recognizable paths, accounts and amounts; callers must supply non-sensitive first lines. Config, token and persisted state stay outside the public directory with mode 600.

## Scope and simplifications

Reuse the repository's pure-logic + Canvas + Node-test pattern; Node built-ins and browser APIs are sufficient. No dependencies, database, build step, background service installer or source integration. Artifact scans are capped at 20,000 entries and return unknown if incomplete. Revisit incremental indexing only if this ceiling is reached. Owner wires homepage/CI/Pages and Tailscale; this task changes only this directory plus the explicitly requested private runtime configuration.
