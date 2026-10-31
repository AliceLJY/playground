# Shared Table · Teahouse Morning

A Guangzhou teahouse at morning service, seats are scarce, and the waiter puts you at a table that still has a chair: you share it with strangers, which Cantonese calls *daap toi*. Everyone has their own pot and two baskets, everyone reads their own paper, nobody has to talk. You can do only a few things: sit down, pour tea, tap two fingers in thanks, lift the pot lid, turn the page, pick a dumpling, leave. When a table is full, the next guest opens a new one.

The morning passes: you come in at 7:00 and five real minutes later it is 11:00 and the hall closes, the light in the windows going from long warm slants to short white. Every half minute or so a dim sum cart stops at the table with three kinds, one to three pieces each, and the others reach for them too; whether and what you take is the one thing in this toy you have to compete for. Leaving gives you a bill card: how many you shared with, how long you sat, how many rounds you poured, what you took, how many times you thanked and were thanked. Long-press to save it.

It is the first thing in this playground with other people in it, but there is no server, no account and no chat box. The others at your table come in two kinds: **replays of your own earlier visits** (the browser keeps your last 12 visits: how long you sat, when you poured and tapped; next time they are seated at the tables, labelled "you · yesterday", "you · 3 days ago"), and **grey figures** (seated whenever fewer than two others are at your table, labelled "regular · not a person", never counted).

**[Play online](https://aliceljy.github.io/playground/datai-teahouse/)** (the page is in Chinese)

## Controls

- You arrive standing; the top bar says which table has a chair. Press 落座 (sit) or tap the scene.
- 斟茶 (pour): one round for the whole table; the pot drops a notch. People at the table tap back.
- 叩指 (finger tap): available only for 8 seconds after someone pours for you (the button lights up). Two fingers knocked twice on the table is how Guangzhou thanks a pour.
- 揭盖 (lift the lid): resting the lid on the pot's rim is the signal for more hot water; the waiter refills a few seconds later.
- 翻报纸 (turn the page), 夹一件 (pick one): everyone reads their own paper; your own steamer holds three pieces, after that you wait for the cart.
- The cart: when it stops at the table, three kinds with their remaining counts appear under the top bar; tap one to take it. The others take too, the counts really drop, and the cart leaves after nine seconds.
- Morning runs 7:00 to 11:00 in five real minutes. In the last quarter hour the light turns white, the birdcage comes down and the waiter starts clearing; if you are still seated at closing you are shown out and the bill says so.
- 离席 (leave): the bill card comes up first (long-press to save); 再开一市 (open another morning) takes you back to the door, with the hall rearranged from the new history so you watch "you · just now" sit down.
- Keys 1–7 are the seven buttons, M mutes. Phone portrait first, desktop works too.

## Spec

- One sentence: share a table with strangers at a teahouse without talking and without awkwardness, using the gestures the teahouse already has to say "I am here, so are you".
- Main aesthetics: fellowship (silent co-presence) and sensation (morning light and sound); secondary: expression (manners).
- Venue: phone held upright, usually muted, one hand, three to five minutes. So every action changes the picture, and all buttons are visible without scrolling at 390×664.
- A loop, each turn of which has an arc: one morning is five minutes, closing is the end, the bill is the record; each visit the table is different because your last self is there. Checked by "did the second visit show the first one", "does a full table open a new one" and "is there something on the cart worth competing for", not by a completion rate.
- A small decision every 20–40 seconds: the cart comes every 30–42 s and stays 9 s with three kinds of 1–3 pieces, and about six in ten grey figures reach for one within 1.5–6 s; a whole morning carries 24–60 pieces. The pot is empty after four rounds and refills 3.5 s after the lid is lifted.
- Seating, four rules: four to a table; a newcomer joins the fullest table with a free chair; ties go to the lowest table number; when every table is full, open the lowest unused number; when the last guest leaves, the table is removed. Replayed visitors and you go through the same rules, visitors seated in the order they originally arrived, then you.
- Colours (sRGB): wood `#6b4a2b`, cloth `#efe6d2`, window glass `#3f8f7a` `#c7532f` `#d9a441` `#4a6fa5`, bamboo `#c9a063`, tea `#b8762a`, you `#c7532f`, grey figures `#9a948c` at 60%.
- Framing: the back wall takes the top 36% of the canvas, the near table sits 56% down the floor and never wider than 68% of the canvas; you always sit front left; on a short landscape canvas the table shrinks so the front row stays on screen.
- Performance: Canvas 2D, no images or font files, roughly a hundred primitives a frame.
- Sound: all Web Audio, created on first touch, each sound detuned ±6% per play. Pouring is band-passed noise swept 420→1300 Hz over 1.3 s with a rising sine, the finger tap two 1.75 kHz triangle hits of 70 ms, the lid a 2.65 kHz porcelain ring, the paper two high-passed noise bursts, the room pink noise low-passed at 320 Hz, very quiet.

## Acceptance

| # | Item | How | Result (2026-10-31) |
|---|---|---|---|
| 1 | The four seating rules | `tests/core.test.cjs` 1a–1d | pass |
| 2 | Visit record round trip, bad data dropped, at most 12 kept | `tests/core.test.cjs` | pass |
| 3 | Replays and the player share the seating rules: 6 visits → table 1 full, you join table 2 | Node test + `?view=busy` read through the hook | pass |
| 4 | Four viewports: all 8 buttons fully visible, hit at their centre, no overlap, page not scrollable | `tools/browser-check.cjs` (390×664, 412×700, 844×340, 1280×720) | 12 of 12 pass |
| 5 | An action changes the picture within 100 ms and names a sound | browser check presses pour and reads `frameStamp` and `lastSound` | pass |
| 6 | No history: two grey figures and a 1 / 4 badge; two or more replays: no grey figures | Node test + `?view=first` / `?view=full` | pass |
| 7 | Published files make no outside requests and carry no local paths | `tests/publish.test.cjs` | pass |
| 8 | It reads as a teahouse: stained-glass windows, steamer, cups, newspaper, ceiling fan | a person reads the screenshots | author read all four viewports; no stranger yet |
| 9 | Nothing borrowed from the temple site: no temple words, the verbs are the teahouse's own | `tests/publish.test.cjs` | pass |
| 10 | First 30 seconds with real input: sit → pour → page → pick → wait for the cart → take one from it → pour until empty → lid → refill → leave → bill → another morning → sit again and see "you · just now" → it pours → tap | `tools/walkthrough.cjs` (390×664, real clicks) | 16 of 16 pass |
| 11 | The clock: 7:00 at the door, 9:00 halfway, pinned at 11:00 after closing | `tests/core.test.cjs` | pass |
| 12 | Cart schedule: first at 10–15 s, every 30–42 s, none in the last 40 s, three distinct kinds of 1–3 each; taking from an empty slot returns false; grey figures compete about six times in ten | `tests/core.test.cjs` + browser `?view=first&t=14` shows three chips, tapping one puts a piece on the plate | pass |
| 13 | Bill: six lines, duration and piece formatting; at closing the bill appears, the 再开一市 button is fully visible, and the clock is back at 7:00 at the door | `tests/core.test.cjs` + browser `?view=first&t=301` | pass |

Not tried on a real phone, and nobody has listened to the sounds yet: they were written to the spec above and the browser check only confirms that each action triggers its sound; how they feel is for a playtest.

## Fixed views

| URL | State |
|---|---|
| `?view=first` | no history: you open table 1 alone, two grey figures keep you company |
| `?view=busy` | 6 synthetic visits: table 1 full, you join table 2 (3 / 4) |
| `?view=full` | 3 synthetic visits: table 1 at 4 / 4, no grey figures |
| `&t=<seconds>` | advance the timeline to t and freeze (`t=14` has the cart at the table; `t=301` is closing time with the bill) |
| `&door=1` | stay standing at the door |
| `&mute=1`, `&seed=<n>` | mute; seed for the grey figures' routine |

With a `view` parameter the page neither reads nor writes localStorage. Hooks: `window.__datai` (`act(code)`, `snapshot()`, `pause()`, `step(ms)`) and the shared `window.__PLAYTEST__`.

## Running locally

```bash
cd datai-teahouse && python3 -m http.server 8793 --bind 127.0.0.1
```

Open `http://127.0.0.1:8793/`. Tests: `node --test tests/*.test.cjs`. Browser check: `NODE_PATH="$(npm root -g)" node tools/browser-check.cjs http://127.0.0.1:8793/ check-out`. Opening walkthrough: `node tools/walkthrough.cjs <url> <out>`. No build step.

## How it was made, what was borrowed

- The seating rules (open a new table when full, join the fullest open table, ties to the lowest number, remove empty tables) and "seat labelled figures when nobody is there" are lifted from how a Korean online temple site runs its halls: a nightclub would rather pack one booth than half-fill two. Only the rules were taken; names, copy, verbs and pictures are the teahouse's own, and where that site needs a server running day and night, this needs none.
- "Feeling of other people" and "real-time sync" are two different things: nobody has to be online right now, the trace you left last time is the other person. Cross-visitor traces (a Cloudflare Worker with KV) are designed but not built in this version.
- The manners are real: two fingers for a pour, the lid on the rim for water, a shared table with no obligation to chat, and a cart you have to be quick for.
- The first playtest came back "monotonous": seven buttons, pressed once each in two minutes, then nothing new. Against the eight questions in AGENTS.md the missing pieces were decisions, an ending and a venue that takes part, hence the cart (a small recurring decision), the morning arc (five minutes a sitting, the hall closes) and the bill (a record of the visit). No buttons were added.

## Files

- `index.html`: page and buttons.
- `src/core.js`: seating, visit records and replay, grey-figure fill, seeded random; shared by browser and Node.
- `src/game.js`: drawing, action state machine, synthesised sound, local storage, fixed views, hooks.
- `tests/core.test.cjs`, `tests/publish.test.cjs`: rules and publish scan, `node --test tests/*.test.cjs`.
- `tools/browser-check.cjs`, `tools/walkthrough.cjs`: four-viewport browser check (plus the cart and the closing bill) and the opening walkthrough with real input.

## Who opens it, AI assets

- Who opens it: people who grew up on morning tea and know what the finger tap and the lifted lid mean; and people curious how a web page can have other people in it without anyone speaking.
- AI assets: no AI-generated images, models or sounds. Everything on screen is drawn by code and every sound is synthesised; the code and text were made by a person working with AI.
