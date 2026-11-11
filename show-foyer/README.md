# Foyer · Five Minutes Before Curtain

Before a show, a small online foyer opens: one stage, twelve seats, strangers waiting together. No chat. You can only do the few things people do in a foyer anyway: sit down, light a lantern for the stage, clap, pass a cup of tea to a neighbour, tap the stage to photograph it, leaf through the programme by the proscenium, leave. When a hall is full the next arrival opens hall 2; on the hour a gong sounds, the old theatre call. Backstage, drums warm up, someone tunes, the curtain is brushed, and heads turn. Three minutes before curtain the first bell, one minute before the second, the house lights go down, and on the third bell the curtain parts and the show begins; the foyer is over. Sit again with "next show".

A real half hour is compressed to a five-minute sitting. It is the same mechanism as Shared Table (`datai-teahouse`) in a different setting: no server, no accounts, no chat box. The others in the hall are of two kinds: **replays of your own earlier visits** (the browser keeps your last 12 visits, how long you stayed and when you lit a lantern, clapped or took a picture; next time they sit in the hall, labelled "you · yesterday"), and **grey figures** (added when fewer than three others are present, labelled "figure · not a person", never counted).

**[Play online](https://aliceljy.github.io/playground/show-foyer/)**

With no saved visits, “A cup of tea in return” is part of normal waiting: sit for 25 seconds and a neighbour labelled “领位人 · 非真人” (usher · simulated) arrives. Offer tea for a stamped paper keepsake in your group photo. The visible “直接候场” button skips the invitation while keeping your seat and countdown. Leaving or curtain-up saves this ordinary visit, including tea actions; neither the usher nor the ticket is stored as history. Existing history disables the automatic invitation. Reloading before any visit is saved, or with unavailable storage, still uses this entry. The programme cover keeps the separate replay, which does not save history (see [SPEC.md](SPEC.md)).

Automation can use `?intro=skip`; fixed `?view=` states also retain the original foyer.

## About the show

The show title and company on the page are real, public information: the dance drama *Yingge* was created by Guangzhou Song and Dance Theatre and has toured widely; in August 2026 it was performed in Beijing at the 7th National Ethnic Minority Arts Festival (Xinhua, 2026-08-21: [report](https://www.news.cn/culture/20260821/932cd7fea0a74d1f9ae58ad9555e21a7/c.html)). The programme's "about the show" page only paraphrases that report (Yingge dance as the vehicle, intangible-heritage crafts woven in, a story of a people standing together), and its "what is Yingge" page states common public knowledge about the folk dance and its listing as national intangible cultural heritage in 2006. No scheduling or box-office information appears anywhere; the programme's cover says so.

This is a personal toy, not an official page of the theatre or the production; it sells nothing and makes no network requests. When a new show comes along the title will change: edit the three `SHOW` lines at the top of `src/game.js` and the two programme pages about the show.

## Controls

- You start standing; the top bar says which hall has a seat. Press the first button (sit) or tap an empty seat. On desktop and phones, its backrest and visible cushion accept taps along their drawn outlines, leaving gaps between seats inactive. The first arrival takes the middle of the second row; later ones gather round it, corners last. Brass backrest plates omit seat numbers on small screens.
- Lantern (second button): one more paper lantern stands at the front of the stage and throws a warm cone up the curtain. The whole stage brightens a step per lantern (about a second's fade): with none it is dark down to the gilt frame, with five it is in full warm light. The count itself is unlimited as before, and lanterns stay for later visitors. At most twelve lanterns are drawn on stage; further presses only increase the count.
- Clap (third button): a ripple around your seat. After the hourly gong and at curtain-up, replays who clapped back then clap again.
- Tea (fourth button): only when a neighbour (adjacent seat, diagonals included) is present; the cup flies over and they nod.
- Photograph the stage: tap the stage. A flash, and a small instant print appears by your seat (up to three). Replays who took pictures flash at the same moment they did. Not allowed once the show has started.
- Programme: tap the booklet at stage left (or the "i" button). Five pages: cover, about the show, what is Yingge, house notes, who was here tonight (with a button to render the group picture, and a "clear the house" button: tap twice to delete every visit this browser remembers; replays leave, grey figures fill in).
- Trace limit: the browser keeps at most 12 visits, exactly one hall; with a full hall you are seated in hall 2, and replays leave on their own once they have sat as long as they did.
- Leave (fifth button): this visit is recorded; next time you enter you are already in the hall. The hall re-seats on the new history and you see "you · just now" sit down.
- Bells: first bell three minutes before curtain, second one minute before with the house lights fading over that minute, third bell at curtain: the drapes part on a row of Yingge dancers in silhouette, the visit is recorded, the five action buttons go dark, and an overlay offers the group picture or the next show. Closing the ending picture (including Esc) returns to that overlay; Esc keeps the next-show route available.
- Sound: open the programme and tap “声音：开/关” beside its title. It shares the M-key toggle and remembers the browser’s choice; muting suspends live audio and enabling resumes it. First visits still default to sound on, unlocked by a user gesture; `mute=1` forces this visit to start muted.
- The gong time in the top bar is the next gong; tap it to hear one.
- Keys 1–5 map to the five buttons, S photographs the stage, B opens the programme (arrow keys turn pages), P renders the picture, M mutes, Esc closes overlays while keeping the next-show route after curtain. Phone portrait first; landscape and desktop also work.

## Spec

- One line: wait for curtain in the same foyer as strangers without talking, using a few gestures a theatre already has to say "I am here, so are you", and then the show really starts.
- Aesthetics (MDA): fellowship (silent co-presence) and sensation (red and gold stage, the gong, backstage drums, the bells); expression as secondary.
- Venue: phone, portrait, usually muted, one hand, five minutes. Every action changes the picture, so it reads muted; main controls are visible without scrolling at 390×664. On short screens only the programme body scrolls; navigation, sound and close stay on the paper. Touch targets are at least 44×44 CSS px; also check 320×568, 844×340 and 1365×900.
- Arc plus loop: a sitting has a beginning (entering), a middle (backstage sounds, the gong) and an end (bells to curtain); the hall differs each visit (last time's you is there). We test "do you see yourself from last time" and "does five minutes end properly", not completion rate.
- Seating rules: twelve per hall; newcomers join the fullest hall that is not full; ties go to the lowest hall number; when all are full the lowest unused number opens; the last to leave closes a hall. Replays follow the same rules in the order they originally arrived, then you.
- Backstage: a seeded schedule per sitting, first event no earlier than 12 s, then every 20–40 s, drums, tuning and curtain-brush in rotation without immediate repeats; heads turn when something is heard.
- Bells: at 180 s, 60 s and 0 s before curtain, each once; a time jump catches up all at once. House light fades from 1 to 0.35 over the last minute and is 0.2 after curtain, dimming only the seats, not the stage.
- Colours (sRGB): curtain folds from trough `#2c0c08` to ridge `#b4483a`, stage gold `#c9a24a` (highlight `#f2d58a`), stage boards `#3a2414` to `#6a4428`, house floor `#2c1b13` to `#170e09`, red velvet seats `#b2402e` to `#3e110b` with brass plates `#e8c878`, light added as `rgba(255,190,110)`, you `#e0b25a`, replays cycle twelve colours, grey figures `#8a8a8a` at 55%, programme paper `#efe6d2` with a `#9b2d20` spine.
- Layout: seen from the back of the house toward the proscenium. The stage is the top 36% of the canvas (30% in landscape; at most 230 px, or 290 px when the canvas is 700 px or wider): gilt columns and header, a swagged valance with gold fringe, a velvet main curtain and a plank stage; wide screens add panelled side walls with sconces. 4×3 seats in the lower 60%, side by side on portrait and desktop (spaced for name tags on short landscape canvases), back row smaller than front (scale 0.92 / 1 / 1.08); each has a backrest, armrests and a brass row-seat plate, an empty seat shows its lowered cushion, an occupied one shows head and shoulders. Your seat has a gilt-edged back, a gold pool on the floor and a gold ring round your head. Figures scale with the seat, so landscape phones neither clip nor overlap. The curtain parts to both sides over 2.6 s onto warm light and seven dancers with raised sticks.
- Performance: Canvas 2D, no image/font files, Three.js, dependencies or build step. Target midrange phone browsers and desktop Chromium at 60 fps. Measure 390×664 (DPR2) and 1365×900 (DPR1), normal antialiasing, DPR capped at 2, render scale 1: open `?view=full&t=6`, sit, resume real RAF, and sample 120 frames with 10 people and 9 lanterns. Canvas paint operations are in the hundreds, capped at 1500 per frame (fill/stroke, rectangles, text, drawImage etc., not WebGL draw calls); simulation plus draw callback p95 ≤16.7 ms. Record the graphics backend; a local pass does not prove phone frame rate.
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
| 15 | Curtain left/middle/right, boards and both frame columns each brighten at 0/1/3/5 lamps: each step ≥3, span ≥25; isolated cone luminance excess ≥4 and R−B excess ≥3; column pixels separately check the total-light fade at 120/600/1000/2000 ms (bounds in SPEC) | `tools/stage-light-check.cjs` (1440×810 and 1440×1080 DPR1; 390×664 DPR2; `?view=first&t=6`) | Round-two browser checks pending; earlier readings do not verify these checks |

### F1 repair verification (2026-11-03)

- Item 1: closing the ending photo by button or Esc returns to curtain-up; Esc at curtain-up keeps “next show” available, and the next sitting can start. All 12 return checks (three branches × four viewports) failed before and pass after.
- Item 2: the programme sound button reuses `setMuted`. Real Web Audio suspend/resume, M-key synchronization and persisted mute choice pass. All four viewports lacked a touch sound entry before. First-visit sound remains on.
- Item 3: top-bar info/gong and overlay buttons have targets ≥44×44 CSS px. Only the programme body scrolls; navigation/close stay on paper. Landscape photo height leaves room for close. `tools/regression.cjs` checks every enabled button across five pages, saved visits and clear confirmation: dimensions, viewport bounds, centre hit and paper bounds. All 52 layout groups failed before and pass after.
- Item 4: both READMEs now include budgets, audience and AI disclosure; two added Node documentation checks failed before and pass after. The stranger retelling has not been tested: ask a first-time visitor who the people are and when the visit ends. Automated checks do not replace that acceptance.

Current Node result: **21 tests, 21 pass, 0 fail**. New browser regression: **100/100** (the old version failed 68 of 76 checks; sound and restart fixes enabled 24 further checks). Existing fixed views: **13/13 groups**; original walkthrough: **21/21**. Viewports: 390×664, 320×568, 844×340 at DPR2, and 1365×900 at DPR1; default antialiasing/render path, no quality reduction. The new checks start at the normal URL without forcing `mute=1`. Logs/screenshots are outside Git in `out-F1/foyer-red/`, `foyer-green/`, `foyer-fixed/` and `foyer-walk/`; each was visually inspected for reachable return controls and readable navigation/close on the paper.

Chromium 156.0.8078.4, Apple M4 Metal (not SwiftShader). `tools/performance.cjs` samples 120 real RAF frames: phone p95 **0.50 ms**, maximum **175** paint calls; desktop p95 **0.60 ms**, maximum **246**. This verifies the local callback budget, not midrange-phone frame rate.

`tools/record.cjs` records `foyer-record/opening-30s.mp4`: 780×1328 portrait, 30 fps, 900 continuous frames from normal entry, real touch gestures for sitting, lantern, clap, stage photo, programme, leave/re-enter, tea, gong and photo, plus keyboard M. No state jumps occur in those 30 seconds. `opening-and-ending.mp4` adds an explicitly accelerated ending after second 30, through photo → close → next show → sit again, for 1080 frames total. All 22 contact sheets were read frame by frame (900 opening plus 180 ending frames); gestures, curtain motion and return remained correct. All 11 state checks pass with zero page errors. Only recording disables CSS transitions/animations to avoid wall-clock drift. Videos contain no audio track and do not claim a listening test or a full five-minute demonstration.

Reproduce: run `node --test tests/*.test.cjs` here; serve the repository locally, then run each `NODE_PATH="$(npm root -g)" node tools/<tool>.cjs <page-url> <external-output-dir>` for `regression`, `performance`, `record`, `browser-check` and `walkthrough`. There is no build: the tested `index.html` + `src/` are the published files. This reuses existing overlays/audio and native CSS, without new dependencies or gameplay.

Not tried on a real phone yet; nobody has listened to the sounds, only their trigger names are verified.

## Fixed views

| URL | State |
|---|---|
| `?view=first` | no history: you alone in hall 1 with three grey figures |
| `?view=busy` | 12 synthetic visits: hall 1 full, you in hall 2 (1/12, three grey figures) |
| `?view=full` | 9 synthetic visits: hall 1 at 10/12, no grey figures, 9 lanterns |
| `&t=<s>` | advance the timeline to t and freeze; `t=301` is the after-curtain freeze |
| `&mute=1`, `&seed=<n>` | mute; seed for the grey figures' and backstage schedules |

With `view` set, localStorage is neither read nor written. Hooks: `window.__foyer` (read-only `geometry` with logical coordinates for the stage, curtain, boards, frame and first light cone, `act(code)`, `snapshot()`, `gong()`, `photo()`, `openProgramme(p)`, `flip(d)`, `jumpTo(sec)` moves curtain to sec seconds from now, `nextShow()`, `pause()`, `step(ms)`, `reset()`) and the shared `window.__PLAYTEST__`.

## Origin

Inspired in October 2026 by a Korean web temple where strangers sit in silence together: others are present but nobody has to speak; a full room opens the next; grey labelled figures keep an empty room company. This borrows that atmosphere layer and changes the setting to a theatre foyer; it pairs with Shared Table (the teahouse) in this repo. The first version had only the five actions and a playtest called it monotonous; the programme, stage photos, backstage sounds and the bells-to-curtain ending were added the same day without new buttons. Sharing traces between visitors is not built.

## Audience and AI materials

- For visitors who want a quiet few minutes on a phone and a chance to encounter a replay of their previous visit.
- Code, the Canvas stage, figures and paper keepsake, replay gestures and Web Audio synthesis were made with AI assistance. No external generated images, 3D models, motion capture, recordings or music files are used. Show facts come from the public report cited above.
