# Pixel Office

A quiet, phone-first room for an AI team. Eleven pixel colleagues type, rest, wait for a decision, leave for the day, and deliver notes. The host walks around and returns to the desk when needed. All people, furniture and animations are drawn with Canvas 2D; there are no images, external fonts, music or runtime dependencies.

The static page automatically switches to a labelled, fictional 185-second demo if the local API is unavailable. The Node service observes local activity without changing any bot. It is an ambient status display, not a conversation viewer.

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

Each roster entry may carry a `desk` slot (0–10, unique; defaults to its position). Optional `look` (integer 0–11) selects the accessory independently, defaulting to the desk. Optional `courier` is boolean, with at most one true: that colleague delivers notes and stays at their own desk when idle. Only feeds with no courier fields fall back to desk 10; explicit false disables that fallback. Invalid identity fields reject the entire snapshot. Same-ID desk/look/courier changes take effect on the next valid poll. Fewer than eleven entries simply leave desks empty. The demo and example config place Cobbler at desk 8 with look 10 (mail cap), and 豆包 at desk 10 with look 8 (scarf). The example retains its existing source settings; the service supplies courier:true for the courier source.

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

**Greeting, photo, treats.** When a visitor steps in, everyone at work looks toward the door, waves and says a word for three seconds, and the visitor answers; about a second in, the page copies the frame into a 720×1570 portrait or 1280×930 landscape keepsake with a caption strip (`像素办公室 · 第 N 位客人来了 · time`) and, once the greeting is over, offers it as a polaroid to save or share (`navigator.share` with a file where available, else a download). A visitor may also bring a treat for everyone from a fixed menu (`POST /guest/treat {kind, v}`; kinds `milktea|coffee|cake|melon`; one a minute per visitor tag, body ≤256 B, CORS preflight only for the public page; the last 50 are kept in the private state and the last 10 plus today's counts appear in both feeds): a visitor figure (or a runner, when nobody is visiting) carries it to the pantry spot, the team says thanks for three seconds, and a cup sits on every occupied desk for two minutes. In the demo a visitor drops by each cycle and brings something at the 20-second mark.

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

The published page first tries the same-origin `api/state`, then `https://mac-mini.tail791fb9.ts.net:8443/office/api/state` (a tailscale funnel maps only the `/office` path onto the server's `/guest` subtree), and plays the demo only if both are unreachable. Guests see the same desks and statuses, with no notice text and no badge text; private control endpoints are not reachable from the public side (404); the bounded guest visit, treat and reception routes are public. The banner says which of the three it is showing.

## Downstairs annex and Today (phase 2 frontend)

Idle colleagues now gather in the main room’s lower-left game corner: paired table tennis first, then paired chess, two arcade machines and nap/read beanbags; additional colleagues watch from separate spots. Dots’ desk is now at (229,269), opening space for the tennis table; its nameplate, treats and folders move with it. Cobbler stays at their assigned desk (8 in the demo). Treats follow physical desk size: desk 8 gets a cup, the small desk 10 does not. Done colleagues celebrate at their desks and remain there. Assignments persist until membership changes, then only vacancies are refilled; see [SPEC.md](SPEC.md) for the desk-order rules.

Away from their own workstation, colleagues carry a cream nameplate below their feet: a colour chip and 7-pixel dark text. Spaces/hyphens are removed; names use at most 8 ASCII units or 4 non-ASCII characters (GrokBot, etwincc). Nearby plates stagger without overlapping; if the area is too crowded, foreground plates take priority. Speech bubbles stay above heads. Visitors keep 客, and the host has no plate. At home the desk nameplate is sufficient. MV v5 uses the current identities, accessories and nameplates.

On phones and narrow windows, scroll the 360×740 logical room to visit the four-seat meeting room (CC at the projector, six additional back-row places), two-person audience bench, phone booth and storage. Meetings light the “开会中 ↓” sign upstairs. At width ≥1000 CSS px and aspect ratio ≥5/4, the same simulation uses a **640×420 horizontal floor**: main office on the left, meeting/booth/storage and totals on the right. The whole building fits without scrolling; the meeting doorway has a lamp. At 1455×782 the canvas is approximately 1027×674 CSS px (**1.605×**). Crossing the breakpoint rebuilds people at their current state’s destinations. Wallpaper retains the portrait main room; MV uses the current portrait layout. Photos copy the active canvas and add the same caption strip.

The back-wall board shows today’s Beijing-date note count as 0–8 pinned sheets, with **+N** for overflow. A note under ten minutes old blinks its red pin. Click or tap it to open the local notebook’s Board tab and read the complete notes. Guests see only the optional `noticesToday` count; clicking opens Today with an explanation that notes are private and today’s count. Missing counts draw no sheets and omit the number. The courier’s full-text delivery card is unchanged. The cumulative wooden board’s complete numbers and latest 40 structured events remain available in Today.

The renderer consumes optional `scene`, `stats`, and `events` from either state feed. Missing extension fields leave empty rooms and unavailable totals. Invalid extensions reject the entire snapshot. The frontend never infers meetings, calls, dispatches, disk use or guard work from activity status. CC's call takes priority over a simultaneous meeting; other members keep their meeting positions. Ending a scene restores each member's ordinary status routing. One dispatch delta makes one 1-second folder flight; polling an unchanged list does not replay it. Guard patrols only appear at Beijing 23:00–08:00 with a guard signal, and each timestamp triggers one lap.

The deterministic 185-second demo includes dispatch at 45 s, review at 50 s, round 2 at 65 s, meeting end/return at 94 s, call at 96–120 s, idle colleagues joining the game corner at 121 s, and a completed guard at 136 s in the night preview. Demo totals are fixed examples, labelled **演示** both on the board and in Today. `?demo=1&night=1` previews the guard; the default demo starts in daytime and reaches a fictional 23:00 for supper. `night=1` never changes live time or invents a live guard.

Fixed seed 7 views (same simulation and rendering path):

| URL | Actual timeline position |
| --- | --- |
| `?view=games` | 138 s, six idle colleagues playing/relaxing, visible without scrolling on 390×664 and 320×568 |
| `?view=meeting` | 73 s, round 2, seated members and two listeners |
| `?view=booth` | 112.5 s, CC in the lit booth with receiver and a fixed phrase |
| `?view=handoff` | 45.5 s, folder halfway through its arc |
| `?view=board` | 73 s, cumulative board and Today drawer |
| `?view=night-guard` | 8 s, nighttime patrol |
| `?mv=1&hold=1` | MV v5: current portrait office, games, nameplates and annex |
| `?wall=1` | Portrait main room; `&annex=1` also includes the annex |

`node tools/preview.cjs` serves the **unchanged** `tests/fixtures/state-scene.json` at `http://127.0.0.1:3191/`, including the Pages-style `/playground/ai-office/` path. It is a local read-only fixture preview, not the live office. It neither persists state nor calls the real service. The browser checker uses controlled HTTP responses for malformed/old feeds and treat-button acceptance, blocks external traffic, checks source and static publication shape, and compares the stable main room and portrait hero cached backgrounds against `7e27359` outside the notice-board rectangle only, while MV v5 is checked for actual scene states and close-up bounds instead of matching the old film. Evidence and remaining limits: [HANDOFF-phase2.md](HANDOFF-phase2.md).

## A Day in the Pixel Office — MV v5

`?mv=1` plays a fictional day using the current portrait layout. `mv-script.json` drives real walking, games, the desk-8 courier, the phone call, visitors and milk tea, a two-round review downstairs and the night patrol. Close-ups retain foot nameplates; the camera follows the stairwell and a flying folder. No live state is requested.

Record with `NODE_PATH="$(npm root -g)" node tools/mv-record.cjs OUT --speed 1.2 --endcard OUT/endcard`: 67 seconds of office plus the unchanged 5.6-second v4 endcard, 1080×1920 at 30 fps. Copy the v4 card without editing its config. Optional `endcard/audio.wav` preserves its PCM tail. The 30-second phone conversation is measured in story time; scripted pacing compresses transit and the complete guard patrol. `tools/mv-music.py` scores the recorded events at 120 bpm; mix with `loudnorm=I=-16:TP=-1.5`.

`node --test tests/*.test.cjs`, `tools/browser-check.cjs` and `tools/mv-check.cjs` cover simulation, normal-office regression, moving nameplate pixels, readable shot bounds and B11 residual frames. See [HANDOFF-mv-v5.md](HANDOFF-mv-v5.md) for the shot list, export evidence and viewing limitations. Legacy geometry remains only for existing compatibility tests. No deployment or commit is part of this revision.

## Come to talk

The **来谈事** button beside treats opens four fixed intents: project pitch, research, learning and a casual chat. The current idle team supplies two hosts (one for chat); real meetings/calls and work take priority. With no idle colleague, Cobbler offers a 20-second tea break; an all-off/away office says goodbye at the door after ten seconds. No AI runs and no real status changes. A normal visit takes roughly 44–50 seconds including walking, fixed dialogue and a handshake. A real meeting redirects the visit to the pantry.

Other pages receive recent visits on the existing ten-second poll. One plays at a time, with at most three queued. Only the initiating page receives a handshake photo. On phones, its view follows the guest downstairs and back; controls sit above the scrolling room. Wallpaper temporarily includes the annex during a visit and hides controls/photos. MV stays unchanged. Demo starts a visit at 34 seconds and rotates all four kinds each 185-second loop; clicking the demo menu plays only locally.

`POST /guest/meet` accepts only `{kind,v}`: kind is `pitch|research|learn|chat`, v a random hexadecimal 16–32-character tab tag. No token, free text or identity is accepted. A tag can initiate once per five minutes; requests share the global budget. Both snapshots expose the latest ten `{kind,at}`, `meetsToday` by kind, `stats.meetsTotal` and `stats.today.meets`; the diary uses `reception`. Fifty events and independent Beijing-day counts persist across restart.

`?view=reception` reproduces seed 7 at 49 seconds. Run `node --test tests/*.test.cjs` and `NODE_PATH="$(npm root -g)" node tests/reception-browser.cjs`. Screenshots and the browser report are in `tools/shots/reception*`; local acceptance and the owner's restart/funnel checks are in [HANDOFF-reception.md](HANDOFF-reception.md).

## Five little office events

These are silent visual performances driven by structured signals, with no AI calls or changes to a colleague's real status. Wallpaper plays them too; MV explicitly disables them.

| Event | Signal and behavior |
| --- | --- |
| Review argument | A new review round with at least one rejected item. CC and a deterministic reviewer argue at the whiteboard, disappear in a comic dust cloud, then return. Three rejections add a line and enlarge the cloud. |
| Completion snacks | A server-observed busy → done transition after at least 20 continuous minutes, once per colleague/hour. The colleague delivers biscuits; each stays five minutes. |
| Melon spectators | Waiting at the boss, a held courier note, or a review argument gathers 2–3 idle game-corner colleagues. They disperse three seconds after the cause ends. |
| Quota timeout | An authenticated quota report sends an available colleague to face the wall with an hourglass. Expiry, clear, or an observed transition to busy releases it. |
| Late supper | The server's first busy roster during Beijing 23:00–03:00, once per night. The guard delivers noodles to those desks; each bowl steams for ten minutes. |

Priority is defined once in `office-core.js`: real work/call/meeting > quota > reception > argument > snack > melon > games. The argument is an action *inside its own review meeting*, not a new reservation. One active performance per kind, three pending maximum; pending signals expire after two minutes. Quota can persist much longer once it starts. Guest snack times are rounded down to the minute, so their replay window is conservative by up to 59 seconds.

`POST /api/quota` requires the same Bearer token as reports. Its only fields are `{id, minutes?, clear?}`: roster ID, integer 1–300 minutes (default 60), or `clear: true`. Invalid fields return 400, missing/wrong token 401, rate limit 429. State is persisted; both feeds expose only unexpired `quota: {id: untilISO}`. The best-effort command is silent, exits successfully even on failure and has a five-second hard timeout:

```sh
bin/office-quota agy
bin/office-quota codex 90
bin/office-quota agy clear
```

Both feeds add `scene.snack = {id, at}` / `scene.supper = {at, ids}` (or null), `meeting.roundAt`, `stats.snacksTotal`, `stats.today.snacks` and `stats.suppersTotal` (also today's supper count). Today lists fixed `argue`, `snack`, `quota` and `supper` diary entries; the wall board has no extra rows. Old feeds may omit these fields. No task text enters these new structures.

Fixed seed 7 views run the same demo from zero: `?view=melon` at 18 s, `?view=argue` at 84.5 s, `?view=quota` at 93 s, `?view=snack` at 112.5 s, `?view=supper` at 154 s. Phones scroll to the event. The 185-second demo retains gifts at 20 s and reception at 34 s, adds a rejected third round at 77 s, quota at 89 s, snacks at 100 s, then jumps its clearly labelled fictional clock to 23:00 at 141 s and serves supper at 145 s. Timed demo signals are examples, not live detections.

Run `node --test tests/*.test.cjs` and `NODE_PATH="$(npm root -g)" node tests/events-browser.cjs`; rerun `tests/reception-browser.cjs` for reception and opening-video regression. Ten required images are `tools/shots/{argue,snack,melon,quota,supper}{,-landscape}.png`. See [HANDOFF-events.md](HANDOFF-events.md) for measured results, clock/priority interpretations and owner integration. No production restart, wrapper edits or publication were performed.

## Who might open this; AI materials

For someone who enjoys seeing a tiny team turn ideas into work, or wants a quiet glance at local AI activity.

Code, pixel drawing routines, animation and fictional demo writing were made through AI collaboration. The office page uses no external images, models, animation assets or audio. The exported MV uses a procedural score and the v4 endcard’s licensed Mixkit sounds. Attribution: **我的AI小木屋 / @AliceLJY**.

## Rights

All rights reserved, as for the whole repository ([`LICENSE`](../LICENSE)): the idea of a pixel office for AI agents is free to borrow, but this code, its pixel art and its layouts may not be copied or built into another app or product without my written permission. Open-source alternatives exist if you want a starting point.
