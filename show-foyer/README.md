# Foyer · Half an Hour Before Curtain

Half an hour before a show, a small online foyer opens: one stage, twelve seats, strangers waiting together. No chat. You can only sit down, light a lantern for the stage, clap, pass a cup of tea to a neighbour, or leave. When a hall is full the next arrival opens hall 2; on the hour a gong sounds, the old theatre call before curtain. When you go, you can take a "who was here tonight" picture.

It is the same mechanism as Shared Table (`datai-teahouse`) in a different setting: no server, no accounts, no chat box. The others in the hall are of two kinds: **replays of your own earlier visits** (the browser keeps your last 12 visits, how long you stayed and when you lit a lantern or clapped; next time they sit in the hall, labelled "you · yesterday"), and **grey figures** (added when fewer than three others are present, labelled "figure · not a person", never counted).

**[Play online](https://aliceljy.github.io/playground/show-foyer/)**

## About the show

The show title and company on the page are real, public information: the dance drama *Yingge* was created by Guangzhou Song and Dance Theatre and has toured widely; in August 2026 it was performed in Beijing at the 7th National Ethnic Minority Arts Festival (Xinhua, 2026-08-21: [report](https://www.news.cn/culture/20260821/932cd7fea0a74d1f9ae58ad9555e21a7/c.html)). Only two facts are used here, the title and the company; no box-office or scheduling information appears anywhere, and the "i" button on the page says so.

This is a personal toy, not an official page of the theatre or the production; it sells nothing and makes no network requests. When a new show comes along the title will change: edit the two `SHOW` lines at the top of `src/game.js`.

## Controls

- You start standing; the top bar says which hall has a seat. Press the first button (sit) or tap an empty seat. The first arrival takes the middle of the second row; later ones gather round it, corners last.
- Lantern (second button): one more lantern on the curtain; it stays for later visitors.
- Clap (third button): a ripple around your seat. After the hourly gong, replays who clapped back then clap again.
- Tea (fourth button): only when a neighbour (adjacent seat, diagonals included) is present; the cup flies over and they nod.
- Leave (fifth button): this visit is recorded; next time you enter you are already in the hall. The hall re-seats on the new history and you see "you · just now" sit down.
- The gong time in the top bar is the next gong; tap it to hear one. The "i" button explains the show.
- Keys 1–5 map to the five buttons, P for the picture, M mutes, Esc closes overlays. Phone portrait first; landscape and desktop also work.

## Spec

- One line: wait for curtain in the same foyer as strangers without talking, using a few gestures a theatre already has to say "I am here, so are you".
- Aesthetics (MDA): fellowship (silent co-presence) and sensation (red and gold stage, the gong); expression as secondary.
- Venue: phone, portrait, usually muted, one hand, three to five minutes. Every action changes the picture, so it reads muted; all buttons visible without scrolling at 390×664.
- Loop, not arc: the hall differs each visit (last time's you is there); we test "do you see yourself from last time" and "does a full hall open a new one", not completion rate.
- Seating rules: twelve per hall; newcomers join the fullest hall that is not full; ties go to the lowest hall number; when all are full the lowest unused number opens; the last to leave closes a hall. Replays follow the same rules in the order they originally arrived, then you.
- Colours (sRGB): curtain `#6a241a` `#7a2a1e`, stage gold `#c9a24a`, floor `#2a1e16` to `#1a120d`, seats `#9b2d20` at 55%, you `#e0b25a`, replays cycle twelve colours, grey figures `#8a8a8a` at 55%.
- Layout: stage is the top 36% of the canvas (30% in landscape), 4×3 seats in the lower 60%; figures scale down when row pitch is under 58 px so landscape phones do not overlap.
- Performance: Canvas 2D, no images or font files, about a hundred primitives per frame.
- Sound: all Web Audio synthesis, created on first touch; ±6% random pitch. The gong is a 98 Hz fundamental with four inharmonic partials over 3.2 s; clap is two band-passed noise bursts; lantern and tea are short triangle-wave sweeps.
- The hourly gong follows the real clock in the local time zone, fires once on the frame that crosses the hour.

## Acceptance

| # | Item | Check | Result (2026-10-31) |
|---|---|---|---|
| 1 | Seating rules and seat order | `tests/core.test.cjs` 1a–1e | pass |
| 2 | Visit records round-trip, bad data dropped, max 12 | `tests/core.test.cjs` | pass |
| 3 | Replays and the player share the seating rules: 12 visits fill hall 1, you enter hall 2 | Node test + browser `?view=busy` hook | pass |
| 4 | Four viewports: 6 buttons fully visible, hit at centre, no overlap, page not scrollable | `tools/browser-check.cjs` (390×664, 412×700, 844×340, 1280×720) | 12/12 pass |
| 5 | Hourly gong on local hour, once; 30-minute countdown | `tests/core.test.cjs` | pass |
| 6 | No history: 3 grey figures in your hall; ≥3 replays: none | Node test + `?view=first` / `?view=full` | pass |
| 7 | Published files: no external URLs, no network APIs, no local paths | `tests/publish.test.cjs` | pass |
| 8 | Reads as a theatre foyer; an action changes the frame within 100 ms with a sound name | author read four-viewport screenshots + browser check after clap | author only; no stranger yet |
| 9 | Not a copy of the temple site: no temple vocabulary, theatre verbs | `tests/publish.test.cjs` | pass |
| 10 | Show facts public only; page states source and "will change"; no business figures | `tests/publish.test.cjs` | pass |
| 11 | First 30 seconds with real taps: sit → lantern → clap → leave → sit again and see "you · just now" → pass tea → gong → picture | `tools/walkthrough.cjs` (390×664, real clicks) | 11/11 pass |

Not tried on a real phone yet; nobody has listened to the sounds, only their trigger names are verified.

## Fixed views

| URL | State |
|---|---|
| `?view=first` | no history: you alone in hall 1 with three grey figures |
| `?view=busy` | 12 synthetic visits: hall 1 full, you in hall 2 (1/12, three grey figures) |
| `?view=full` | 9 synthetic visits: hall 1 at 10/12, no grey figures, 9 lanterns |
| `&t=<s>` | advance the timeline to t and freeze |
| `&mute=1`, `&seed=<n>` | mute; seed for the grey figures' schedule |

With `view` set, localStorage is neither read nor written. Hooks: `window.__foyer` (`act(code)`, `snapshot()`, `gong()`, `photo()`, `pause()`, `step(ms)`, `reset()`) and the shared `window.__PLAYTEST__`.

## Origin

Inspired in October 2026 by a Korean web temple where strangers sit in silence together: others are present but nobody has to speak; a full room opens the next; grey labelled figures keep an empty room company. This borrows that atmosphere layer and changes the setting to a theatre foyer; it pairs with Shared Table (the teahouse) in this repo. Version one has local replays only; sharing traces between visitors is not built.
