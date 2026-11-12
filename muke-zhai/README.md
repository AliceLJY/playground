# Muke Village: Fighting Makes Friends

[中文](README_CN.md)

A scene from the Peking opera *Muke Zhai*: Mu Guiying first drives off Meng Liang, then crosses spears with Yang Zongbao, and somewhere in the fight they stop fighting. A two-to-three-minute side-view mini game. The tone is sweet; nobody falls down.

## Spec

- **One-line experience**: you play Mu Guiying. Read the enemy's telegraph, then parry, dodge, or wait for the opening and strike back. Fight one knocks three golden helmet-plates off Meng Liang; fight two fills Yang Zongbao's "heart" meter to 100, and the two stand shoulder to shoulder. Core verb: read the telegraph, choose to parry, dodge or wait.
- **Main aesthetic**: narrative (one scene played from opening to curtain) first, sensation (lantern light on a night stage, motion, gong and clapper rhythm) second.
- **Venue**: mostly a phone in portrait, one thumb, probably muted; keyboard on desktop. One run is two to three minutes.
- **Shape**: arc. You play it through once, so we check that a stranger can finish it and retell it; autopilots separately check duration and difficulty from both sides.
- **Palette** (sRGB): three families. Indigo-to-violet shadows (about `#1b1a3a`); muted vermilion and old wood brown (curtain, floor); lantern amber (about `#ffaa50`) is the only bright colour. UI gold `#c9a45c`, subtitle paper `#e4d3ae`, heart bar gradient `#6e1f28 -> #d79078`. No pure black, white or red.
- **Composition**: 960x540 logical canvas scaled to fit. Feet stand at y = 448 (83% of the height); Mu Guiying is about 250 px from helmet to boot (46% of the height). The backdrop `assets/stage.webp` (1920x1080) fills the frame, with the proscenium, side curtains and five lanterns baked in; on a portrait phone the canvas shows a roughly 4:5 window (400x540 logical, full height from beam to stage edge) that follows the midpoint of the two fighters smoothly and clamps at the backdrop edges, so the hero is about 270 CSS px tall; landscape and desktop keep the full frame. Light comes from the lanterns above.
- **Look**: see `ART.md`. Each sprite frame gets a night tint (multiply only, `rgb(196,182,224)`, darkened further away from lanterns), desaturation 0.9 with slightly raised contrast, a narrow warm top rim light; on telegraph the opponent's outline flashes twice and the weapon gets a small highlight (no opacity change), a three-layer contact shadow and a faint floor reflection, cached on offscreen canvases. In front: vignette, grain, dust motes, and very dark blurred stage-edge silhouettes.
- **Performance budget**: phone Chrome / Safari at 60 fps; per frame one backdrop, two characters and a few effects; the offscreen cache fills lazily per frame seen (not measured on a real phone).
- **Backdrop is swappable**: `src/backdrop.js` is self-contained; changing the backdrop means changing that file and `assets/stage.webp`.

### Controls and moves


Keyboard: left/right or A/D to walk; J to thrust; K to guard (hold to block; pressing within 0.2 s before the enemy's hit counts as a parry); L or Space to roll (invulnerable mid-roll, can cancel your own attack). Touch: two arrows bottom-left, three action buttons bottom-right. A mute button sits top-right; sound starts after the first tap. Six keys (◀ ▶ Dodge Guard Thrust Ult) stay at the bottom; on desktop each carries a small keycap (← → / L·Space / K / J / K+J), can be clicked or held with the mouse, and lights up when you press the matching key. Keycaps are hidden on phones.

| Move | Input | Numbers (measured in `tests/combo.test.cjs`) |
|---|---|---|
| Thrust | J | 1.1x anim speed; hitstop 70 ms, knock 0.3. A hit in his recovery or after a parry drops a whole golden plate; any other hit loosens one notch (three notches drop one, at least 2.2 s apart). Fight two: +3 heart on a plain hit (>= 2.4 s apart), +8 in recovery |
| Triple thrust | J J J | Press each in the second half of the previous thrust (buffered). Second 1.25x, hitstop 60 ms; third 0.85x with a wind-up, hitstop 130 ms, knock 0.62 (about 2x), shake 0.6. Fight two: +6 on the third |
| Dash thrust | hold ← / → for over 0.35 s then J, or tap the same direction twice within 0.25 s then J; a fresh press or point-blank range (< 120) is a plain thrust | Slides up to 230 px (plain 110), never off stage; hitstop 100 ms, knock 0.55, +0.22 s of recovery; fight two: +5 |
| Flip thrust | J in the second half of a dodge (L) | Lands at 85% of the dodge, after invulnerability ends; hitstop 90 ms, knock 0.4; fight two: +5 |
| Ultimate | once Shi is full, K and J within 0.08 s, or the sixth key | 0.4 s of 0.35x slow motion, camera pushes in 10%, five thrusts 150 ms apart with three fading afterimages, last thrust holds 250 ms with a big gong and a big knock-back; invulnerable and unblockable. Meng Liang: a whole plate and a long stun; Yang Zongbao: +25 heart |

**Shi** is the thin bar under Qi: +5-6 per plain hit, +8-10 for heavy moves, +12 in recovery, +15 parry, +20 clash, +4 block; being hit does not lower it; the ultimate resets it. The first time it fills, a line appears ("Shi is full. Press K and J together") and Guard and Thrust glow with a thin line between them; after one cast it never appears again.

**Yang Zongbao's triple thrust**: about 14% of his attacks, with a longer telegraph (560 ms); every strike keeps a reaction window of at least 450 ms; parry all three for +20 heart. Meng Liang gets 0.7 s of armour after a heavy hit and strikes back at once; he flinches at most once per 1.4 s, so mashing cannot stun-lock him.

### Charge bar, Yang Zongbao, two leads

- **Charge bar**: during an opponent's telegraph a thin bar appears over his head (under Meng Liang's plates, above Yang Zongbao), filling at a constant rate; the instant it is full the strike lands. The last 0.2 s (the parry window) is a brighter warm colour and the bar body brightens slightly when the head enters it. A triple thrust shows one bar per strike with three small dots. Holding Guard gives a faint warm aura on the spear and a thin ring at her feet (gone on release); pressing inside the bright segment adds a small confirm flash at the bar head before the parry feedback. Inside the bright segment = parry, earlier = block.
- **Yang Zongbao is on stage from the start**: Mu Guiying at left, Meng Liang in the middle, Yang Zongbao at the right door (6% smaller and darker, further back), idle. He neither fights, nor can be hit, nor takes part in collisions. He recoils (first three hurt frames) or half-guards when she parries or casts the ultimate, steps forward half a step each time Meng Liang loses a plate, and slips into the curtain when the fight drifts right. Fight one already has the heart meter: parry +4, triple-thrust third hit +3, ultimate +5, at most 20, a small warm mote drifts to the bar when he reacts; fight two continues from that number.
- **No black screen between fights**: Meng Liang walks into the right door, Yang Zongbao walks up and faces her, then speaks; in the finale Meng Liang peeks half a body from behind the right curtain (dimmed).
- **Bodies have volume**: body circles of radius ~42 (distance >= 84) push each other apart; the ultimate first widens the gap to >= 130; dash and ultimate stop at just-in-reach (>= 105).
- **Hits never whiten the body**: only a narrow bright edge on the side that was hit (~60 ms) plus a shake; characters are never translucent or fully white (the browser check compares renders with and without the flash, < 6% changed pixels).
- **Portrait camera**: a 400-wide window follows the pair's midpoint; in fight one it leans right by up to 120 when they fight in the right half so Yang Zongbao comes into view, but never pushes Mu Guiying or Meng Liang out, so he is off-screen while they fight on the left.

### Heart bar, story intro, name plates

- **Heart bar follows Yang Zongbao**: the long bar at the top centre is gone; a small bar (about 110 wide, a small heart at the left end, dark vermilion to warm pink with a bright leading edge) floats above his plumes, already in fight one while he stands at the door, fading (never vanishing) when he slips into the curtain. It swells slightly when the heart rises and a tiny mote drifts from the contact point or his body into the bar. In fight two his charge bar sits one row below it, not overlapping, not covering his face; Meng Liang's plates and charge bar stay put. On a portrait phone, when he is out of the camera window (fight one, both on the left) a small marker hugs the right edge (heart, an arc of the current heart, a right arrow) and is replaced by the bar when he comes into view.
- **Louder charge bar**: about 130 wide and 8 tall, a warmer brighter amber for the bright segment, the whole frame flashes when the head enters it; in tutorial step three a breathing arrow points at it from the left.
- **Story intro**: the first launch shows a playbill-style page (dark ground, thin frame, calligraphic type, wide letter-spacing, the dimmed stage backdrop): title "Muke Zhai", "a scene from traditional Peking opera", three lines of background, and "You play Mu Guiying." at the foot. Click or press any key to continue; game time does not run during it; it never auto-shows again, and a "Story" button next to "Moves" replays it. Tutorial, camera positions, `?stage=2` and `?tutorial=...` skip it; `?story=1` forces it, `?view=story` freezes on it.
- **Name plates**: on first entrance each of the three gets a thin small plate over the head for 2.5 s then fades (Mu Guiying "daughter of the lord of Muke Village", Meng Liang "under the Yang generals, here for the dragon-taming wood", Yang Zongbao "a young Yang general, arriving soon"; the game shows the Chinese text).
- **Ending**: after "Nobody won this fight..." a second small line, "In the opera the two marry and later ride to the Song camp against the Liao", stays 5 s, and only then "Play again". The first time the fight-one heart rises a short line "Yang Zongbao is watching." shows once for 2 s.

### Tutorial, demo and move list

- First launch runs a tutorial (remembered in `localStorage`; `?tutorial=0` off, `?tutorial=1` forced; camera positions skip it): walk, thrust, guard (Meng Liang raises his axe at 0.35x speed; the line follows the state: "He raised his axe, watch the bar over his head" -> half way "When the bar reaches the bright part, hold K (Guard)" -> pressed inside it "Caught" -> gone after the parry; pressing too early is only a block with "Blocked. Wait for the bright part to knock him back" and another try; you must really parry once to pass; not pressing costs no qi, and after three misses it parries for you inside the bright part), punish while he is stunned (stun lengthened to 1.2 s, first plate drops), dodge, triple thrust, then "That's it. Knock off the last two plates." One lesson per step, advance only when done; a Skip button sits top-right. The key to press glows with a slow warm breathing edge.
- After the tutorial the top-right shows Tutorial, Moves and Watch demo. The demo runs a separate game with the precise autopilot for about 15 s (triple thrust, dash, parry, dodge into flip thrust, ultimate), keys light as it presses them and a one-word caption appears; a tap or key returns to your own game, untouched. Shi is pre-filled before the ultimate in the demo only.
- Fight two opens with one extra line: "Two thrusts at the same moment clash, and that counts too." for 3 seconds.


### Acceptance

| # | Item | How it is checked | Threshold |
|---|---|---|---|
| 1 | Frame data complete, hit and hold frames in range | `tests/core.test.cjs` 1 | pass |
| 2 | Enemy telegraph is long enough | test 2: warn-to-hit time of every real enemy attack in simulation | each >= 450 ms (Meng Liang about 985, Yang Zongbao about 717) |
| 3 | Precise and shaky autopilots finish across 5 seeds, sane duration | test 3 | finish, **40-240 s** (measured: precise 45-71 s, shaky 55-70 s). The lower bound moved from 60: triple thrust and the ultimate make runs faster; the two-sided checks (shaky gets hit, never runs out) stay |
| 4 | Difficulty from both sides | test 4 | shaky autopilot is hit >= 3 times over 5 seeds and never runs out of qi |
| 4b | Mashing cannot win | `tests/combo.test.cjs` C13: reckless autopilot mashes J, 8 seeds | all run out of qi within 150 s; scoring has cooldowns and a clash needs a thrust started 0.45 s after the last one ended |
| 5 | Parries, clashes, blocks, dodges, triple thrusts, ultimates and fully-parried triple thrusts really happen in the samples | test 5 | parries >= 10, clashes >= 3, blocks >= 5, dodges >= 1, triples >= 3, ultimates >= 3, fully parried >= 1 |
| 6 | Reckless autopilot loses and can retry | test 6: only mashes thrust; qi runs out, "retry" appears, qi refills and the fight is clearable | 3 seeds |
| 7 | Attacks never slide off stage or overshoot | test 7 | 0 out-of-bounds steps, slide <= 110 px |
| 8 | No stuck windows | test 8 | 0 |
| 9 | Input latency and buffering | tests 9, 11 | thrust to hit frame <= 240 ms; presses during hitstop are kept |
| 10 | Hitstop and screen shake | tests 10, 12 | both sides freeze 70-110 ms on a hit; trauma 0.1 barely moves, full <= 16 px |
| 11 | No page errors, no failed requests, no overflow | `tools/browser-check.cjs`, desktop 1280x720 and phone 390x664, four entry points each | 0 / 0 / 0 |
| 12 | Camera hook reports the requested state | same | telegraph, 190-215 px apart, shoulder to shoulder |
| 13 | Characters are really drawn | same: render with and without actors, count changed pixels inside each character's cell | >= 10% (sprites are darkened; flat-lit originals read about 25-35%) |
| 14 | Most of the screen is dark | same, whole-frame luminance | median <= 0.3, bright share <= 6% (measured median about 0.10, under 2%) |
| 15 | Five touch buttons fully in view, non-overlapping, off the canvas, >= 44 px; portrait canvas >= 55% of the viewport, hero >= 240 CSS px tall; subtitle, prompt and HUD boxes pairwise non-overlapping | same, 390x664, all four entry points | all hold |
| 15b | Six keys always visible on desktop, with keycaps, clickable | same, desktop 1280x720 | in view, non-overlapping, off the canvas; J lights Thrust; mouse-holding Guard enters guard |
| 17 | Moves | `tests/combo.test.cjs` C1-C12 | numbers in the table above; C5 third thrust hitstop >= 108 ms and knock >= 1.5x the first two; C6 dash goes 60 px further; C7 flip thrust only in the second half of the dodge; C9 simultaneous press 0.08 s counts, 0.2 s does not; C10-C12 ultimate invulnerability, unblockable, both opponents |
| 18 | Tutorial and demo | `tests/tutorial.test.cjs` T1-T7 + browser check `?view=teach3`, `?view=demo` | advance only when done, auto-parry after three misses, skip works, no qi lost in the tutorial, your state is identical field by field after a demo; Guard glows; a real touch hold on Guard advances the tutorial |
| 20 | Charge bar | browser check `?view=meng`, `?view=teach3`; `tests/stage.test.cjs` S1-S2 | in view, no overlaps with other UI; bright segment luminance >= 1.25x the body; constant fill, last 0.2 s bright; parry inside, block before |
| 21 | Hints appear and leave | `tests/stage.test.cjs` S3-S6 | on the tick an action is done the line changes or clears (limit 0.3 s); every tutorial step checked; the Shi-full line clears the moment the ultimate is cast |
| 22 | Yang Zongbao always present | S7-S10 + browser check `?view=open`, `?view=act1` | present every tick of fight one with a sane state; with or without him Mu Guiying and Meng Liang end up identical step by step; fight-one heart <= 20; no black screen, someone always on stage |
| 23 | No body overlap, no dash misfire, no whiteout | S11-S12, `combo.test.cjs` C6, browser check `?view=chain3` | distance >= 84; a fresh press, point-blank and a 0.4 s double tap are plain thrusts; flash changes < 6% of pixels |
| 24 | Heart bar over Yang Zongbao | browser check `?view=duel/act1/open/ult/meng`, desktop and phone | bar centre within 26 px of his screen x, bar bottom 0-120 px above his cell top; edge marker on phone when he is out of view; the long top bar is gone; no overlaps with charge bar, plates, qi, shi, subtitle, keys or the Skip/Tutorial/Story/Moves/Demo buttons |
| 25 | Story intro and plates | `tests/stage.test.cjs` S13-S15 + browser check `?view=story`, `?view=open` | shown by default on first launch, closes on a click, time frozen meanwhile, no auto-show afterwards but a Story button exists; three plates fade in and out over 2.5 s |
| 26 | Ending lines and "Yang Zongbao is watching." | S16-S17 | the two lines appear in order, the second stays 5 s before "Play again"; the watching line shows exactly once per game for about 2 s |
| 19 | Ultimate look | browser check `?view=ult` | afterimages really drawn (>= 400 changed pixels against a render without them); bright share still <= 6%; Shi bar and new key do not overlap other UI |
| 16 | Side by side with reference | by eye: the desktop `?view=duel` shot against the four closing items of `ART.md` (shadows, one bright colour, characters floating, UI stealing attention) | written verdict per item, see the delivery notes |

### Camera positions

- `?view=meng`: fight one, Meng Liang's telegraph (body flash, a line on the floor).
- `?view=duel`: fight two, the two stand about 200 px apart.
- `?view=end`: shoulder-to-shoulder finale, drifting hearts, closing subtitle.
- `?view=story`: the intro page. `?story=1`: force the intro.
- `?view=open`: the opening frame, all three on stage with their plates. `?view=act1`: mid fight one, Meng Liang striking, Yang Zongbao at the door.
- `?view=teach3`: tutorial step three, the axe rising slowly, bar half full, Guard glowing.
- `?view=demo`: demo in progress (frozen just after it presses Guard).
- `?view=ult`: third thrust of the ultimate. `?view=chain3`: third thrust of a triple thrust landing.
- `?stage=2`: start in fight two. `?seed=N` changes the seed.

Frozen states come from real simulation (autopilot or key presses), never hand-placed. Hook: `window.__PLAYTEST__ = { ready, snapshot(), reset(), setSeed(n), step(ms), press(key) }`, plus `play()`, `coverage()`, `luma()`.

## How it works

- All logic is in `src/core.js`: fixed 60 Hz step, seeded RNG, no DOM, so a whole run can be simulated headless in Node. The autopilots (precise, shaky, reckless) live there too and are shared by the frozen camera positions and the tests.
- Feel: attack snapping (face the nearest opponent, short slide into reach), per-actor hitstop on hit (light 70 ms, heavy 110 ms, everything else keeps running), input buffering during hitstop, sparks at the contact point flying along the spear, screen shake from squared trauma.
- Play: in fight one Meng Liang has three golden plates and telegraphs his axe about 0.6 s ahead; hit him in recovery or after a parry to knock one off. Fight two has no health bar, only a 0-100 heart meter: parry +12, block +6, hit in his recovery +8, clash +15, hit while he guards +3 (once per guard). Five qi; at zero you get "retry" and replay the current fight.
- Sound: WebAudio-synthesised clapper, small gong, a crisp ping and a big gong; pitch jitter +-6% from a seeded RNG; starts after the first tap.

## Known gaps

- Feel and sound have not been playtested by a person; telegraph, reaction window and cooldown values were tuned against autopilots and may not suit real players.
- Asset flaws: Meng Liang's walk has huge strides; Mu Guiying's victory has a jump cut between frames 4 and 5; matting edges may carry a little residue.
- Not tested on a real phone, only a 390x664 Chromium emulation; audio was not verified.
- One opponent at a time; the backdrop is a static image plus post effects, lanterns only breathe.

## Run locally

```bash
cd muke-zhai && python3 -m http.server 8793
node --test tests/*.test.cjs
NODE_PATH="$(npm root -g)" node tools/browser-check.cjs http://127.0.0.1:8793/ shots
```

## Who might open this, and AI assets

For anyone who likes Chinese opera and wants two or three minutes of "fighting makes friends" on a phone.

Character art was generated with Codex; the motions were made with Grok image-to-video, then cut out, aligned and packed into sprite atlases with agent-sprite-forge; the stage backdrop is AI-generated; clapper and gong sounds are synthesised in code; the code was written in AI collaboration.

Credit: WeChat account "我的AI小木屋" / GitHub @AliceLJY.
