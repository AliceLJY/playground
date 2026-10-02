# Shadow Gong

After the show, a shadow puppet with a small bronze gong guards the oil lamp behind the screen. Moths, living scissors and a rat king that steals lamp oil take turns on the cloth. When a weapon lights up, press guard once: a perfectly timed press rings the gong, makes the lamp flare and slows time for a moment, and leaves the opponent open. Fill its posture and step in for the finishing blow.

**[Play online](https://aliceljy.github.io/playground/shadow-gong/)**

Four scenes per run — moths, scissors, a mixed crowd and the rat king — in three to five minutes. Each break between scenes refills a little lamp oil, and a loss at the rat king can be retried from the rat king.

## Controls

- Guard: K, Space or right mouse button. Only the moment of the press counts: press once when you see the white glint. Holding guard is just a plain block, and mashing makes the timing window narrower with every press.
- Strike and execute: J or left mouse button. Blows land only on an opened opponent: the first strike after a perfect parry, a stunned or recoiling opponent, or the recovery after its last swing. Otherwise moths flit away and blades turn the drumstick aside.
- Dodge: L or Shift. Red attacks cannot be blocked, only dodged.
- Move: A and D or the arrow keys. Esc pauses.
- Touch: ◀ ▶ at the bottom left, gong, drumstick and dodge buttons at the bottom right. Landscape plays best.

## How it is built

- The one-page spec is [SPEC.md](SPEC.md) (in Chinese): palette values, composition rules, performance budget and ten acceptance checks.
- Combat lives in `src/core.js`, free of rendering, so it runs under node. Tests cover the parry window, telegraph lead, the cap on simultaneous attackers and the length of a run. The composition tests take puppet skeletons from real simulated matches and project them with the game's own camera framing.
- Every puppet part is a hinged flat piece drawn procedurally on a canvas, cut-outs included. All sound is synthesised with WebAudio; there are no image, font or audio files.
- Fixed camera views: `?view=hero`, `?view=wide`, `?view=stress`, plus `&plain=1` for the plain-block comparison. The debug hook is `window.__duel`.

## Run locally

```bash
cd shadow-gong && python3 -m http.server 8917
```

Open `http://127.0.0.1:8917/`. Tests: `node --test tests/*.test.cjs`. Standalone build: `python3 build.py`.

## Credits

The parry mechanics follow ideas from [Long Wind](https://github.com/jbang2004/long-wind): press timestamps decide a parry, telegraphs lead each blow by a fixed amount of simulation time, attack tokens cap simultaneous attackers, posture leads to executions, and hits use hit-stop and slow motion. The subject, characters, setting, interface, code, puppets and sound are original to this project. No Long Wind code or assets are used.

## Verification

See [VERIFICATION.md](VERIFICATION.md) (in Chinese). Feel, sound and fun still need a human playtest.
