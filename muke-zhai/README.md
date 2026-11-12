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
| Dash thrust | hold ← / → then J, or tap the same direction twice within 0.25 s then J | Slides up to 230 px (plain 110), never off stage; hitstop 100 ms, knock 0.55, +0.22 s of recovery; fight two: +5 |
| Flip thrust | J in the second half of a dodge (L) | Lands at 85% of the dodge, after invulnerability ends; hitstop 90 ms, knock 0.4; fight two: +5 |
| Ultimate | once Shi is full, K and J within 0.08 s, or the sixth key | 0.4 s of 0.35x slow motion, camera pushes in 10%, five thrusts 150 ms apart with three fading afterimages, last thrust holds 250 ms with a big gong and a big knock-back; invulnerable and unblockable. Meng Liang: a whole plate and a long stun; Yang Zongbao: +25 heart |

**Shi** is the thin bar under Qi: +5-6 per plain hit, +8-10 for heavy moves, +12 in recovery, +15 parry, +20 clash, +4 block; being hit does not lower it; the ultimate resets it. The first time it fills, a line appears ("Shi is full. Press K and J together") and Guard and Thrust glow with a thin line between them; after one cast it never appears again.

**Yang Zongbao's triple thrust**: about 14% of his attacks, with a longer telegraph (560 ms); every strike keeps a reaction window of at least 450 ms; parry all three for +20 heart. Meng Liang gets 0.7 s of armour after a heavy hit and strikes back at once; he flinches at most once per 1.4 s, so mashing cannot stun-lock him.

### Tutorial, demo and move list

- First launch runs a tutorial (remembered in `localStorage`; `?tutorial=0` off, `?tutorial=1` forced; camera positions skip it): walk, thrust, guard (Meng Liang raises his axe at 0.35x speed; holding Guard returns normal speed and parries; if you do not press you take the hit without losing qi, and after three misses it parries for you), punish while he is stunned (stun lengthened to 1.2 s, first plate drops), dodge, triple thrust, then "That's it. Knock off the last two plates." One lesson per step, advance only when done; a Skip button sits top-right. The key to press glows with a slow warm breathing edge.
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
| 19 | Ultimate look | browser check `?view=ult` | afterimages really drawn (>= 400 changed pixels against a render without them); bright share still <= 6%; Shi bar and new key do not overlap other UI |
| 16 | Side by side with reference | by eye: the desktop `?view=duel` shot against the four closing items of `ART.md` (shadows, one bright colour, characters floating, UI stealing attention) | written verdict per item, see the delivery notes |

### Camera positions

- `?view=meng`: fight one, Meng Liang's telegraph (body flash, a line on the floor).
- `?view=duel`: fight two, the two stand about 200 px apart.
- `?view=end`: shoulder-to-shoulder finale, drifting hearts, closing subtitle.
- `?view=teach3`: tutorial step three, the axe rising slowly, Guard glowing.
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
