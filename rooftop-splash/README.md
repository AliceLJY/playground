# Rooftop Splash

A sunny rooftop water fight: first-person movement, three water blasters, water balloons, cover, bot teammates and opponents, respawning, and a three-minute team score match.

**[Play online](https://aliceljy.github.io/playground/rooftop-splash/)** · [中文说明](README_CN.md)

Choose blue or orange, 3v3 / 4v4 / 6v6, a score limit and bot difficulty. All other players are computer-controlled; this is a single-player game, not online multiplayer. Reach the target score, or lead when time expires. A soaked player returns after three seconds with full water and brief spawn protection. Firing ends protection.

## Controls

| Input | Action |
| --- | --- |
| WASD / arrows | Move |
| Mouse / left button | Aim / fire |
| Right button | Aim down sights; zoom with the pressure blaster |
| Shift / Space / C | Run / jump / crouch |
| 1, 2, 3 / Q / wheel | Select / cycle water blasters |
| R / G | Refill / throw water balloon |
| Tab / Esc | Scoreboard / pause |

Touch controls include a left movement stick, right look area and action buttons. Landscape is recommended. When pointer lock is unavailable, hold and drag the scene to aim. Losing focus pauses the match.

## Preview and checks

From the repository root:

```sh
python3 -m http.server 8789 --bind 127.0.0.1
node --test rooftop-splash/tests/*.test.cjs
node --check rooftop-splash/src/arena.js
node --check rooftop-splash/src/core.js
node --check rooftop-splash/src/world.js
node --check rooftop-splash/src/game.js
python3 rooftop-splash/build.py
```

Open `http://127.0.0.1:8789/rooftop-splash/`. The build generates a standalone HTML file with no external runtime requests, suitable for offline play. GitHub Pages publishes that same bundle.

## Changing the setting

- `src/arena.js`: dimensions, spawn points, prop bounds and colors. The same bounds drive collisions, line-of-sight checks, bot navigation and the minimap.
- `src/world.js`: procedural scenery, character and blaster models.
- `src/core.js`: renderer-independent movement and combat simulation.
- `src/game.js`, `index.html`, `src/style.css`: controls, sound, display and labels.

Changing geometry requires checking spawn clearance, traversable routes and shooting occlusion again. A toy-room arena or a moon-base practice match can reuse the gameplay module with new scenery, characters and interface copy.

The small arena uses a one-metre navigation grid and box collision bounds. It has no networking, backend, destructible terrain or persistent account progression. More complex layouts would need a finer navigation model. Third-party libraries keep their own license; see [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Inspiration

The interaction reference is [Transport Ship](https://claude-opus-5-5-cf-transport-ship.pages.dev/) by [riba2534](https://github.com/riba2534/claude-opus-5-5-demo). This project independently implements a water-fight theme; no source code, game assets, logos or original military setting were copied from that reference.
