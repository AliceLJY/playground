# Pixel Office

A quiet, phone-first room for an AI team. Eleven pixel colleagues type, rest, wait for a decision, leave for the day, and deliver notes. The host walks around and returns to the desk when needed. All people, furniture and animations are drawn with Canvas 2D; there are no images, external fonts, music or runtime dependencies.

The static page automatically switches to a labelled, fictional 60-second demo if the local API is unavailable. The Node service observes local activity without changing any bot. It is an ambient status display, not a conversation viewer.

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

Keep the eleven roster entries in the example's order: director, builder, twin one, twin two, artist, companion, scout, filmmaker, writer, helper, courier. Each entry has `id`, `name`, `role`, `color` (six-digit HEX), and `source`. IDs are lowercase and unique. The host is a separate decorative character, not a twelfth API entry. Restart after editing config or rotating the token.

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
| Kimi 1 / 2 | `launchd`, labels `com.telegram-ai-bridge-mcodex1` / `com.telegram-ai-bridge-mcodex2`; corresponding `bridge-mcodex1.log` / `bridge-mcodex2.log` under `~/Projects/telegram-ai-bridge/` | A live launchd PID plus log mtime younger than 3 minutes is busy; older is idle; absent service/PID is off. |
| Agy | `launchd`, `com.telegram-ai-bridge-magy1`, `~/Projects/telegram-ai-bridge/bridge-magy1.log` | Same mtime fallback. |
| etwin | `etwin`, `com.etwin-bot`, `~/Projects/etwin-bot/etwin-bot.log` | Only count new complete bot-output/distillation lines; never expose their content. New activity: busy 60 seconds, done 20 seconds, then idle unless another signal arrives. Initial/rotated logs establish a cursor without replaying history. Otherwise use mtime. |
| Grok Bot | `artifacts`, `~/grok-box/workspace/` | New file mtime yields one 20-second done pulse; idle while the newest file is less than 2 hours old, then away. |
| Muse | `artifacts`, `/Volumes/ColdData/产出/muse-app/imagine_media/`, `returnAway:true` | A changed file yields done, then away. Missing/unmounted storage is unknown. |
| Doubao | `artifacts`, `~/machine-data/doubao/raw/` | Same rule as Grok Bot. |
| Dots | `push`, `waitLabel` | Initially idle with an awaiting-assignment badge. After a push, normal push expiry/inactivity applies. |
| Cobbler | `courier`, notice endpoint | Delivery animation plus persisted notice board. |

A known inactive source becomes idle after 30 minutes without a fresh signal, or off during Beijing 23:00–08:00. Explicit off, unknown, artifact away rules, and never-used push-only roles take precedence. CC timestamps are subject to this inactivity rule too. A running Codex process refreshes its signal; polling an absent process does not. Read errors, malformed status, future/invalid timestamps and incomplete scans are **unknown**, never silently idle.

The bridge implementation uses the requested mtime fallback. Its source was outside this task's hard repository fence, so SQLite/A2A signals were not investigated. Mtime can reflect startup/housekeeping; mirror changes can arrive hours late. Neither is reliable evidence of task completion or a pending human decision; use push for that. Artifact walks ignore symlinks and `.git`, cap at 20,000 entries and return unknown on incomplete scans. A recent first artifact observation can show done once; an old first observation only establishes the baseline.

## Privacy and persistence

- No source paths, raw commands, session names, log text, arbitrary summaries or process IDs are sent to the page. Summaries are cleaned to 80 Unicode code points and reduced to a coarse private task category; the public schema omits them.
- Notices use **only the first 80 code points of the cleaned first line**. Recognizable paths, links, accounts, numbers resembling phone IDs, and monetary amounts are then redacted; the result is capped at 80 again. Shortened placeholders cannot pull later text into the preview. This is pattern-based redaction, not semantic anonymization: callers must supply a non-sensitive first line, without personal names or other private details.
- Text is inserted as text, not HTML. Static serving has an explicit five-file allowlist; private files, tests and server sources are not web-accessible. No CORS, third-party requests or analytics.
- State writes are serialized and atomically renamed. Corrupt private state stops startup instead of silently discarding the notice board. The service never logs credentials or raw source errors.

## Browser acceptance and publication

```sh
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs http://127.0.0.1:3091/
```

This uses the already installed Playwright and browser (system Google Chrome with Metal on macOS; Chromium elsewhere), saves screenshots and a report under `tools/shots/`, checks 390×664 and four other viewports, and inspects real service and missing-API static behavior under a Pages-style prefix. It captures the opening 30 seconds at roughly one-second intervals for visual review. The fake-clock sequence is not a performance measurement; Canvas draw-callback cost is sampled separately with the real browser clock. The report identifies the renderer; it does not claim phone frame rates. Open the screenshots yourself; tests do not establish visual taste or real-device performance.

- `?demo=1&view=hero`: seed 7, demo advanced from zero to 4 seconds.
- `?view=queue`: explicitly labelled demo, 20 seconds, two colleagues at the host's desk.
- `?view=notice`: explicitly labelled demo, 35 seconds, courier holding a note. It remains visible for 8 seconds **once both courier and host reach the desk**.
- `?view=hero`: live when the service is available; real actors are allowed to walk to their destinations.
- `window.__PLAYTEST__`: `ready`, `snapshot()`, `setSeed(n)`, `step(ms)`. Step freezes the animation clock. Queue/notice fixtures freeze the same simulation, not a separate rendering path. Fixed demo views explicitly use Beijing 10:00 lighting; normal entrances use current Beijing time.

There is no build step. Publish only `index.html`, `office-core.js`, `office.js`, `style.css`, and `demo-script.json`. The owner adds the homepage card, runs `node --test tests/*.test.cjs` in CI, and copies those five assets to the Pages directory. Those integration files are outside this task's edit scope. See [SPEC.md](SPEC.md) and [HANDOFF.md](HANDOFF.md) for acceptance and remaining work.

## Who might open this; AI materials

For someone who enjoys seeing a tiny team turn ideas into work, or wants a quiet glance at local AI activity.

Code, pixel drawing routines, animation and fictional demo writing were made through AI collaboration. There are no external images, models, animation assets or audio. Attribution: **我的AI小木屋 / @AliceLJY**.
