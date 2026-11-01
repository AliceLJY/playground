# Pixel Office

A quiet, phone-first room for an AI team. Eleven pixel colleagues type, rest, wait for a decision, leave for the day, and deliver notes. The host walks around and returns to the desk when needed. All people, furniture and animations are drawn with Canvas 2D; there are no images, external fonts, music or runtime dependencies.

The static page automatically switches to a labelled, fictional 150-second demo if the local API is unavailable. The Node service observes local activity without changing any bot. It is an ambient status display, not a conversation viewer.

## Run

From this directory, with a current Node installation:

```sh
node server/office-server.mjs
# Open http://127.0.0.1:3091/
node server/office-server.mjs --once
node --test tests/*.test.cjs
```

`--once` reads existing state, collects and prints one public JSON object, then exits **without writing state**. It can inspect sources alongside the server without overwriting the notice board. Run only one persistent server. The service binds **only `127.0.0.1:3091`**. No daemon, launchd job or Tailscale rule is installed. The owner manages those separately.

Private files are at `~/.config/ai-office/config.json`, `token`, and `state.json`. They have mode `600`, and the directory has mode `700`. Real configuration and a token have been prepared locally for this handoff. Never copy them into this repository. `config.example.json` contains fictional names and push-only sources.

For a separate new installation, copy and edit the example privately, then generate a token without printing it:

```sh
mkdir -p ~/.config/ai-office
chmod 700 ~/.config/ai-office
(umask 077; cp -n config.example.json ~/.config/ai-office/config.json)
test -f ~/.config/ai-office/token || (umask 077; openssl rand -hex 24 > ~/.config/ai-office/token)
chmod 600 ~/.config/ai-office/config.json ~/.config/ai-office/token
```

Each roster entry may carry a `desk` slot (0–10, unique; defaults to its position): the slot decides the desk, the pixel look and the courier role (slot 10). Fewer than eleven entries simply leave desks empty.

## API and helpers

| Endpoint | Behavior |
| --- | --- |
| `GET /` | Static office page |
| `GET /api/state` | Public `{updatedAt, roster, notices, demo:false}` |
| `POST /api/report` | JSON `{id, status, summary?}` |
| `POST /api/notice` | JSON `{text}` |

Both POST endpoints require `Authorization: Bearer` followed by the private token and `Content-Type: application/json`. The page never receives the token. Missing or wrong authentication returns `401`; malformed input `400`; an oversized body `413`; the wrong content type `415`; a rate limit `429`. A successful write returns `200` with `{ok:true}` after saving.

Each public roster entry contains exactly `id, name, role, color, status, statusSince, badge`. States: `busy`, `waiting`, `done`, `idle`, `away`, `off`, `unknown`. Polling is every 10 seconds. Push reports take precedence for exactly 10 minutes, including across restarts. `statusSince` changes only when the status changes. The board retains the newest 20 notices in chronological order, with ISO timestamps.

```sh
bin/office-report builder busy "Writing code"
bin/office-report builder waiting "Decision needed"
bin/office-notice "A small update is ready."
```

Use IDs from the actual private config. These shell helpers load the token internally; they are silent, exit successfully even on failure, follow no redirects, and terminate within five seconds. Leave at least two seconds between reports for the same actor. A notice shares the courier's limit. Accepted writes share a global limit of 120 per sliding minute. Bodies are capped at 4096 bytes, including chunked requests.

## Signals

Paths below describe the configured adapters, not files bundled with the page. Bot logs and artifact files are read-only runtime evidence; no other repository's source was inspected.

| Role | Source | Interpretation |
| --- | --- | --- |
| CC | `cc`, `directory: ~/.claude/sessions` | Probe each PID; any live busy session is busy. Otherwise live known sessions are idle, none live is off. Badge counts live sessions. Supports epoch-millisecond and ISO timestamps. |
| Codex | `codex`, `ps -axo pid,args` | Executable basename exactly `codex`; exclude app-server, mcp, login, ChatGPT/cua_node and plugin extension hosts. A matching process is fresh busy evidence. Absence starts/continues inactivity. |
| Kimi | `launchd` with `instances` (the two TG bridges `com.telegram-ai-bridge-mcodex1` / `-mcodex2` and their logs under `~/Projects/telegram-ai-bridge/`) plus `processes: ["kimi", "kimi-code"]` | One desk for every form of the engine: any live `kimi` CLI process (Alice's terminal, a CC wrapper, a bridge turn) is busy and the badge counts them; when the last one ends the desk shows done for 20 s, then rests on that end time. Without a process, a live launchd PID plus log mtime younger than 3 minutes is busy; older is idle; all bridges absent is off (unless a run ended in the last 30 minutes). |
| Agy | `launchd`, `com.telegram-ai-bridge-magy1`, `~/Projects/telegram-ai-bridge/bridge-magy1.log`, plus `processes: ["agy"]` | Same rule as Kimi: any live `agy` process is busy, whoever started it. |
| etwin-cc | `etwin`, `com.etwin-bot`, `~/Projects/etwin-bot/etwin-bot.log` (appended lines only, text never retained) | Busy from a `[claude] query kind=reactive` or `kind=distill` line until the reply or distill lands (`[bot] bot → ` / `distill 完成:`), 3 minutes at most; the landed reply is a 20-second done; then idle, off after 30 quiet minutes or when the service is absent. Self-loop wake-ups and heartbeats keep the log fresh but are not work. |
| Grok Bot | `statusfiles`, `~/grok-box/workspace/办公室/` (one-line JSON slips the bots write), `fallbackDirectory` `~/grok-box/workspace/`, `awakeFile` `~/grok-box/上次同步.txt` (the mirror puller's status note), plus `processes: ["grok", "grok-macos-aarch64"]` for the local Grok CLI | A live local `grok` CLI run (mutual-review, a terminal) is busy at this desk, its end a short done, then 30 minutes of idle. Otherwise a fresh slip decides: waiting beats busy; done shows for 10 minutes; slips older than 2 hours are stale. When the puller's last attempt says the box is asleep, a busy slip is a forgotten slip (ignored), waiting/done still count, and otherwise the desk is away. With no fresh slip and the box awake, the mirror mtime rule below applies. |
| Muse | `artifacts`, `/Volumes/ColdData/产出/muse-app/imagine_media/`, `returnAway:true` | A changed file yields done, then away. Missing/unmounted storage is unknown. |
| Doubao | `artifacts`, `~/machine-data/doubao/raw/` | Same rule as Grok Bot. |
| Dots | `push`, `waitLabel` | Initially idle with an awaiting-assignment badge. After a push, normal push expiry/inactivity applies. |
| Cobbler | `courier`, notice endpoint | Delivery animation plus persisted notice board. |

Every desk also carries `workedToday` (ms): minutes at work since Beijing midnight, summed from busy ticks (a gap over a minute, i.e. the office was down, is skipped). The team list shows it as `今日 1h 05m` once it reaches a minute.

**Visitors.** When someone has the public page open (GitHub Pages, reading the live office through the guest feed), the page keeps a random 16-hex tag for that tab in `sessionStorage` (no identity, no cookie) and calls `GET /guest/visit?v=<tag>` with each 10-second poll. The server counts tags heard in the last 45 s (cap 200, per-tag rate limit) and puts `visitors` in both feeds; nothing but the count is stored or shown. The page draws up to five visitor figures (lanyard badge, little camera, every other one in a sun hat) coming in through the door, strolling between the host's spots, and leaving when the count drops; the room meta reads `… / N 参观`. The private tailnet page does not say hello, so Alice's own view is not a visitor.

**Greeting, photo, treats.** When a visitor steps in, everyone at work looks toward the door, waves and says a word for three seconds, and the visitor answers; about a second in, the page copies the frame into a 720×1570 keepsake with a caption strip (`像素办公室 · 第 N 位客人来了 · time`) and, once the greeting is over, offers it as a polaroid to save or share (`navigator.share` with a file where available, else a download). A visitor may also bring a treat for everyone from a fixed menu (`POST /guest/treat {kind, v}`; kinds `milktea|coffee|cake|melon`; one a minute per visitor tag, body ≤256 B, CORS preflight only for the public page; the last 50 are kept in the private state and the last 10 plus today's counts appear in both feeds): a visitor figure (or a runner, when nobody is visiting) carries it to the pantry spot, the team says thanks for three seconds, and a cup sits on every occupied desk for two minutes. In the demo a visitor drops by each cycle and brings something at the 20-second mark.

A known inactive source becomes idle after 30 minutes without a fresh signal, or off during Beijing 23:00–08:00. Explicit off, unknown, artifact away rules, and never-used push-only roles take precedence. CC timestamps are subject to this inactivity rule too. A running Codex process refreshes its signal; polling an absent process does not. Read errors, malformed status, future/invalid timestamps and incomplete scans are **unknown**, never silently idle.

The bridge implementation uses the requested mtime fallback. Its source was outside this task's hard repository fence, so SQLite/A2A signals were not investigated. Mtime can reflect startup/housekeeping; mirror changes can arrive hours late. Neither is reliable evidence of task completion or a pending human decision; use push for that. Artifact walks ignore symlinks and `.git`, cap at 20,000 entries and return unknown on incomplete scans. A recent first artifact observation can show done once; an old first observation only establishes the baseline.

## Privacy and persistence

- No source paths, raw commands, session names, log text, arbitrary summaries or process IDs are sent to the page. Summaries are cleaned to 80 Unicode code points and reduced to a coarse private task category; the public schema omits them.
- Notices use **only the first 80 code points of the cleaned first line**. Recognizable paths, links, accounts, numbers resembling phone IDs, and monetary amounts are then redacted; the result is capped at 80 again. Shortened placeholders cannot pull later text into the preview. This is pattern-based redaction, not semantic anonymization: callers must supply a non-sensitive first line, without personal names or other private details.
- Text is inserted as text, not HTML. Static serving has an explicit five-file allowlist; private files, tests and server sources are not web-accessible. No CORS, third-party requests or analytics.
- State writes are serialized and atomically renamed. Corrupt private state stops startup instead of silently discarding the notice board. The service never logs credentials or raw source errors.

## Browser acceptance and publication

```sh
node tools/preview.cjs
# In another terminal:
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs http://127.0.0.1:3191/
```

This uses the already installed Playwright and browser (system Google Chrome with Metal on macOS; Chromium elsewhere), saves screenshots and a report under `tools/shots/`, checks 390×664 and four other viewports, and inspects real service and missing-API static behavior under a Pages-style prefix. It captures the opening 30 seconds at roughly one-second intervals for visual review. The fake-clock sequence is not a performance measurement; Canvas draw-callback cost is sampled separately with the real browser clock. The report identifies the renderer; it does not claim phone frame rates. Open the screenshots yourself; tests do not establish visual taste or real-device performance.

- `?demo=1&view=hero`: seed 7, demo advanced from zero to 4 seconds.
- `?view=queue`: explicitly labelled demo, 20 seconds, two colleagues at the host's desk.
- `?view=notice`: explicitly labelled demo, 35 seconds, courier holding a note. It remains visible for 8 seconds **once both courier and host reach the desk**.
- `?view=hero`: live when the service is available; real actors are allowed to walk to their destinations.
- `window.__PLAYTEST__`: `ready`, `snapshot()`, `setSeed(n)`, `step(ms)`. Step freezes the animation clock. Queue/notice fixtures freeze the same simulation, not a separate rendering path. Fixed demo views explicitly use Beijing 10:00 lighting; the demo uses Beijing 10:00 (23:00 with night=1); live entrances use current Beijing time.

There is no build step. Publish only `index.html`, `office-core.js`, `office.js`, `style.css`, and `demo-script.json`. The owner adds the homepage card, runs `node --test tests/*.test.cjs` in CI, and copies those five assets plus the existing `mv.js` and `mv-script.json` to the Pages directory. Those integration files are outside this task's edit scope. See [SPEC.md](SPEC.md) and [HANDOFF.md](HANDOFF.md) for acceptance and remaining work.

## Guest view (one URL for everyone)

The published page first tries the same-origin `api/state`, then `https://mac-mini.tail791fb9.ts.net:8443/office/api/state` (a tailscale funnel maps only the `/office` path onto the server's `/guest` subtree), and plays the demo only if both are unreachable. Guests see the same desks and statuses, with no board and no badge text; the write endpoints are not reachable from the public side (404). The banner says which of the three it is showing.

## Downstairs annex and Today (phase 2 frontend)

Idle colleagues now gather in the main room’s lower-left game corner: paired table tennis first, then paired chess, two arcade machines and nap/read beanbags; additional colleagues watch from separate spots. Dots’ desk is now at (229,269), opening space for the tennis table; its nameplate, treats and folders move with it. Cobbler stays at desk 10. Done colleagues celebrate at their desks and remain there. Assignments persist until membership changes, then only vacancies are refilled; see [SPEC.md](SPEC.md) for the desk-order rules.

Scroll the room vertically to visit the smaller four-seat meeting room (CC at the projector, additional members in the back row), one two-person audience bench, phone booth and storage. A lit “开会中 ↓” sign and room caption announce real meetings upstairs. The original 360×420 room keeps its coordinates outside the corner/old-desk and new-desk rectangles specified against da99a72; the canvas is now 360×740 logical pixels at 2× resolution. The cumulative wooden board replaces the door's visitor-total sign. Its full numbers are repeated in the **Today** drawer, followed by the latest 40 structured events in reverse time order. Guests can read Today; their notice board stays private.

The renderer consumes optional `scene`, `stats`, and `events` from either state feed. Missing extension fields leave empty rooms and unavailable totals. Invalid extensions reject the entire snapshot. The frontend never infers meetings, calls, dispatches, disk use or guard work from activity status. CC's call takes priority over a simultaneous meeting; other members keep their meeting positions. Ending a scene restores each member's ordinary status routing. One dispatch delta makes one 1-second folder flight; polling an unchanged list does not replay it. Guard patrols only appear at Beijing 23:00–08:00 with a guard signal, and each timestamp triggers one lap.

The deterministic 150-second demo includes dispatch at 45 s, review at 50 s, round 2 at 65 s, meeting end/return at 85 s, call at 96–120 s, idle colleagues joining the game corner at 121 s, and a completed guard at 136 s in the night preview. Demo totals are fixed examples, labelled **演示** both on the board and in Today. `?demo=1&night=1` previews the guard; the default demo is daytime. `night=1` never changes live time or invents a live guard.

Fixed seed 7 views (same simulation and rendering path):

| URL | Actual timeline position |
| --- | --- |
| `?view=games` | 138 s, six idle colleagues playing/relaxing, visible without scrolling on 390×664 and 320×568 |
| `?view=meeting` | 73 s, round 2, seated members and two listeners |
| `?view=booth` | 112.5 s, CC in the lit booth with receiver and a fixed phrase |
| `?view=handoff` | 45.5 s, folder halfway through its arc |
| `?view=board` | 73 s, cumulative board and Today drawer |
| `?view=night-guard` | 8 s, nighttime patrol |
| `?mv=1&hold=1` | Original MV camera, no annex |
| `?wall=1` | Live extended room fitted into the wallpaper placement |

`node tools/preview.cjs` serves the **unchanged** `tests/fixtures/state-scene.json` at `http://127.0.0.1:3191/`, including the Pages-style `/playground/ai-office/` path. It is a local read-only fixture preview, not the live office. It neither persists state nor calls the real service. The browser checker uses controlled HTTP responses for malformed/old feeds and treat-button acceptance, blocks external traffic, checks source and static publication shape, and compares main-room RGBA outside the two specified repair rectangles and an unchanged MV frame against `c216e84`. Evidence and remaining limits: [HANDOFF-phase2.md](HANDOFF-phase2.md).

## Who might open this; AI materials

For someone who enjoys seeing a tiny team turn ideas into work, or wants a quiet glance at local AI activity.

Code, pixel drawing routines, animation and fictional demo writing were made through AI collaboration. There are no external images, models, animation assets or audio. Attribution: **我的AI小木屋 / @AliceLJY**.
