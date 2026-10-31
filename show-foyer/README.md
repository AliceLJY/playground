# Foyer · Five Minutes Before Curtain

Before a show, a small online foyer opens: one stage, twelve seats, strangers waiting together. No chat. You can only do the few things people do in a foyer anyway: sit down, light a lantern for the stage, clap, pass a cup of tea to a neighbour, tap the stage to photograph it, leaf through the programme by the proscenium, leave. When a hall is full the next arrival opens hall 2; on the hour a gong sounds, the old theatre call. Backstage, drums warm up, someone tunes, the curtain is brushed, and heads turn. Three minutes before curtain the first bell, one minute before the second, the house lights go down, and on the third bell the curtain parts and the show begins; the foyer is over. Sit again with "next show".

A real half hour is compressed to a five-minute sitting. It is the same mechanism as Shared Table (`datai-teahouse`) in a different setting: no server, no accounts, no chat box. The others in the hall are of two kinds: **replays of your own earlier visits** (the browser keeps your last 12 visits, how long you stayed and when you lit a lantern, clapped or took a picture; next time they sit in the hall, labelled "you · yesterday"), and **grey figures** (added when fewer than three others are present, labelled "figure · not a person", never counted).

**[Play online](https://aliceljy.github.io/playground/show-foyer/)**

## About the show

The show title and company on the page are real, public information: the dance drama *Yingge* was created by Guangzhou Song and Dance Theatre and has toured widely; in August 2026 it was performed in Beijing at the 7th National Ethnic Minority Arts Festival (Xinhua, 2026-08-21: [report](https://www.news.cn/culture/20260821/932cd7fea0a74d1f9ae58ad9555e21a7/c.html)). The programme's "about the show" page only paraphrases that report (Yingge dance as the vehicle, intangible-heritage crafts woven in, a story of a people standing together), and its "what is Yingge" page states common public knowledge about the folk dance and its listing as national intangible cultural heritage in 2006. No scheduling or box-office information appears anywhere; the programme's cover says so.

This is a personal toy, not an official page of the theatre or the production; it sells nothing and makes no network requests. When a new show comes along the title will change: edit the three `SHOW` lines at the top of `src/game.js` and the two programme pages about the show.

## Controls

- You start standing; the top bar says which hall has a seat. Press the first button (sit) or tap an empty seat. The first arrival takes the middle of the second row; later ones gather round it, corners last.
- Lantern (second button): one more lantern on the curtain; it stays for later visitors.
- Clap (third button): a ripple around your seat. After the hourly gong and at curtain-up, replays who clapped back then clap again.
- Tea (fourth button): only when a neighbour (adjacent seat, diagonals included) is present; the cup flies over and they nod.
- Photograph the stage: tap the stage. A flash, and a small instant print appears by your seat (up to three). Replays who took pictures flash at the same moment they did. Not allowed once the show has started.
- Programme: tap the booklet at stage left (or the "i" button). Five pages: cover, about the show, what is Yingge, house notes, who was here tonight (with a button to render the group picture, and a "clear the house" button: tap twice to delete every visit this browser remembers; replays leave, grey figures fill in).
- Trace limit: the browser keeps at most 12 visits, exactly one hall; with a full hall you are seated in hall 2, and replays leave on their own once they have sat as long as they did.
- Leave (fifth button): this visit is recorded; next time you enter you are already in the hall. The hall re-seats on the new history and you see "you · just now" sit down.
- Bells: first bell three minutes before curtain, second one minute before with the house lights fading over that minute, third bell at curtain: the drapes part on a row of Yingge dancers in silhouette, the visit is recorded, the five action buttons go dark, and an overlay offers the group picture or the next show.
- The gong time in the top bar is the next gong; tap it to hear one.
- Keys 1–5 map to the five buttons, S photographs the stage, B opens the programme (arrow keys turn pages), P renders the picture, M mutes, Esc closes overlays. Phone portrait first; landscape and desktop also work.

## Spec

- One line: wait for curtain in the same foyer as strangers without talking, using a few gestures a theatre already has to say "I am here, so are you", and then the show really starts.
- Aesthetics (MDA): fellowship (silent co-presence) and sensation (red and gold stage, the gong, backstage drums, the bells); expression as secondary.
- Venue: phone, portrait, usually muted, one hand, five minutes. Every action changes the picture, so it reads muted; all buttons visible without scrolling at 390×664.
- Arc plus loop: a sitting has a beginning (entering), a middle (backstage sounds, the gong) and an end (bells to curtain); the hall differs each visit (last time's you is there). We test "do you see yourself from last time" and "does five minutes end properly", not completion rate.
- Seating rules: twelve per hall; newcomers join the fullest hall that is not full; ties go to the lowest hall number; when all are full the lowest unused number opens; the last to leave closes a hall. Replays follow the same rules in the order they originally arrived, then you.
- Backstage: a seeded schedule per sitting, first event no earlier than 12 s, then every 20–40 s, drums, tuning and curtain-brush in rotation without immediate repeats; heads turn when something is heard.
- Bells: at 180 s, 60 s and 0 s before curtain, each once; a time jump catches up all at once. House light fades from 1 to 0.35 over the last minute and is 0.2 after curtain, dimming only the seats, not the stage.
- Colours (sRGB): curtain `#6a241a` `#7a2a1e`, stage gold `#c9a24a`, floor `#2a1e16` to `#1a120d`, seats `#9b2d20` at 55%, you `#e0b25a`, replays cycle twelve colours, grey figures `#8a8a8a` at 55%, programme paper `#efe6d2` with a `#9b2d20` spine.
- Layout: stage is the top 36% of the canvas (30% in landscape), 4×3 seats in the lower 60%; figures scale down when row pitch is under 58 px so landscape phones do not overlap. The curtain parts to both sides over 2.6 s onto warm light and seven dancers with raised sticks.
- Performance: Canvas 2D, no images or font files, a bit over a hundred primitives per frame.
- Sound: all Web Audio synthesis, created on first touch; ±6% random pitch except bells, drums and tuning. The gong is a 98 Hz fundamental with four inharmonic partials over 3.2 s; bells are 1760 Hz sines with one high partial, one to three strokes; drums are six low-passed noise hits with a 90→52 Hz sine in a Yingge pattern; tuning is two sines sliding past each other; the curtain is 2.4 s of band-passed noise over two low tones; the shutter is two very short noise clicks.
- The hourly gong follows the real clock in the local time zone, fires once on the frame that crosses the hour.

## Acceptance

| # | Item | Check | Result (2026-10-31) |
|---|---|---|---|
| 1 | Seating rules and seat order | `tests/core.test.cjs` 1a–1e | pass |
| 2 | Visit records round-trip, bad data dropped, max 12 | `tests/core.test.cjs` | pass |
| 3 | Replays and the player share the seating rules: 12 visits fill hall 1, you enter hall 2 | Node test + browser `?view=busy` hook | pass |
| 4 | Four viewports: 6 buttons fully visible, hit at centre, no overlap, page not scrollable | `tools/browser-check.cjs` (390×664, 412×700, 844×340, 1280×720) | 12/12 pass |
| 5 | Hourly gong on local hour, once; five-minute countdown | `tests/core.test.cjs` | pass |
| 6 | No history: 3 grey figures in your hall; ≥3 replays: none | Node test + `?view=first` / `?view=full` | pass |
| 7 | Published files: no external URLs, no network APIs, no local paths | `tests/publish.test.cjs` | pass |
| 8 | Reads as a theatre foyer (curtain, proscenium lanterns, seats, programme); an action changes the frame within 100 ms with a sound name | author read four-viewport screenshots + browser check after clap | author only; no stranger yet |
| 9 | Not a copy of the temple site: no temple vocabulary, theatre verbs | `tests/publish.test.cjs` | pass |
| 10 | Show facts public only; programme states source and "will change"; no business figures | `tests/publish.test.cjs` | pass |
| 11 | Real taps: sit → lantern → clap → tap stage for a photo → programme to page 3 → leave → sit again and see "you · just now" → pass tea → gong → picture → jump to bell 1, bell 2 (lights down), bell 3 (curtain up, overlay, buttons off) → next show → clear the house from the programme's last page (two taps, storage emptied, grey figures back) | `tools/walkthrough.cjs` (390×664, real clicks) | 21/21 pass |
| 12 | Bell times, each once, catch-up on a jump; house-light curve | `tests/core.test.cjs` | pass |
| 13 | Backstage schedule: first ≥12 s, gaps 20–40 s, three kinds without immediate repeats, reproducible | `tests/core.test.cjs` | pass |
| 14 | Stage photos recorded and replayed; frozen at t=301: all bells caught up, curtain open, light 0.2, buttons off, overlay shown | Node test + `tools/browser-check.cjs` group 13 (`?view=full&t=301`) | pass |

Not tried on a real phone yet; nobody has listened to the sounds, only their trigger names are verified.

## Fixed views

| URL | State |
|---|---|
| `?view=first` | no history: you alone in hall 1 with three grey figures |
| `?view=busy` | 12 synthetic visits: hall 1 full, you in hall 2 (1/12, three grey figures) |
| `?view=full` | 9 synthetic visits: hall 1 at 10/12, no grey figures, 9 lanterns |
| `&t=<s>` | advance the timeline to t and freeze; `t=301` is the after-curtain freeze |
| `&mute=1`, `&seed=<n>` | mute; seed for the grey figures' and backstage schedules |

With `view` set, localStorage is neither read nor written. Hooks: `window.__foyer` (`act(code)`, `snapshot()`, `gong()`, `photo()`, `openProgramme(p)`, `flip(d)`, `jumpTo(sec)` moves curtain to sec seconds from now, `nextShow()`, `pause()`, `step(ms)`, `reset()`) and the shared `window.__PLAYTEST__`.

## Origin

Inspired in October 2026 by a Korean web temple where strangers sit in silence together: others are present but nobody has to speak; a full room opens the next; grey labelled figures keep an empty room company. This borrows that atmosphere layer and changes the setting to a theatre foyer; it pairs with Shared Table (the teahouse) in this repo. The first version had only the five actions and a playtest called it monotonous; the programme, stage photos, backstage sounds and the bells-to-curtain ending were added the same day without new buttons. Sharing traces between visitors is not built.
