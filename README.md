# playground

Small things built for fun. One repo, one subfolder each, one Pages site. The front page has two shelves: games to play, and 3D exhibits to turn around and look at.

**Live: https://aliceljy.github.io/playground/**

## Games

| Toy | What it is | Stack |
|---|---|---|
| [Back to the Pit](yingge-pit/) · [play](https://aliceljy.github.io/playground/yingge-pit/) | On a little Yingge stage a white-robed puppet climbs out of the orchestra pit; tap a lane the moment its iron rod lights and a Yingge paper puppet bats it back down. Three waves, a big gong, and two players can share one phone | 2D canvas, stage and puppets from a short film's art, the boss drawn in code, synthesised gongs and drums, touch and keyboard, portrait or landscape |
| [Herb Match](herb-match/) · [play](https://aliceljy.github.io/playground/herb-match/) | Herbs fall from an apothecary shelf; file each into the cold, cool, warm or hot basket before it lands, and a wrong answer flips its label to explain. For learning the four natures, not medical advice | 2D canvas, flat herbs drawn in code, synthesised sound, touch and mouse, portrait or landscape |
| [Qilou Brawl](qilou-brawl/) · [play](https://aliceljy.github.io/playground/qilou-brawl/) | A street brawl down a dusk arcade street in old Guangzhou to a lion-dance ring: dim-sum grannies, a belly-charging landlord, then the lion-dance head; punch and kick chains, rolls, blocks and a gong-and-drum power mode | Rigged Gaussian-splat characters generated from single images with PINOC, on PlayCanvas; code-built street and synthesised drums; keyboard/mouse and touch |
| [Late-Night Grocery](diorama-walk/) · [play](https://aliceljy.github.io/playground/diorama-walk/) | A rainy-night street-corner miniature: zoom in and you walk into the one old grocery still lit, to work a night shift. There are scares; follow the shift rules until you get out | Three.js grey-box blocks, synthesised positional sound, keyboard/mouse and touch, standalone offline HTML |
| [Shadow Gong](shadow-gong/) · [play](https://aliceljy.github.io/playground/shadow-gong/) | A parry duel on a shadow-puppet screen after the show: block the moment a blade lights up, and a perfect timing rings the gong and slows time before the finishing blow | Three.js 2.5D, procedural puppets and synthesised sound, keyboard/mouse and touch, standalone offline HTML |
| [Slipper Smash](slipper-smash/) · [play](https://aliceljy.github.io/playground/slipper-smash/) | Swipe a flip-flop across leaping cockroaches in a rainy Guangzhou alley, spare the milk tea, then wear down the boss | 2D canvas, synthesised sound, touch and mouse, portrait or landscape |
| [Rooftop Splash](rooftop-splash/) · [play](https://aliceljy.github.io/playground/rooftop-splash/) | A first-person rooftop water fight with bot teams, three blasters, water balloons and respawns | Three.js, procedural scenery, keyboard/mouse and touch, standalone offline HTML |
| [Xiaoju Racing](xiaoju-racing/) · [play](https://aliceljy.github.io/playground/xiaoju-racing/) | A furry orange tabby races five cats through a Guangzhou-inspired circuit, with drifting and nitro | Three.js, procedural fur and standalone offline HTML |
| [Aju’s Guangzhou Ride](aju-guangzhou-ride/) · [play](https://aliceljy.github.io/playground/aju/) | An orange cat bikes across Guangzhou — calico challenges and neighbourhood exploration | Three.js, packed into a single offline HTML |

## 3D exhibits

| Exhibit | What it is | Stack |
|---|---|---|
| [Sandworm](sandworm/) · [view](https://aliceljy.github.io/playground/sandworm/) | A fictional engineering archive for a mechanical sandworm tunnelling under the desert: six camera presets, X-ray for the buried part, armour that pulls apart | Three.js, procedural modelling, keyboard/mouse and touch, standalone offline HTML |
| [Floor Plan · 3D Sample](floorplan/) · [view](https://aliceljy.github.io/playground/floorplan/) | A public-domain floor plan read into walls, openings and rooms, extruded into a model you can orbit, with a CAD sheet, path-traced renders and a winter-solstice sunlight study | Three.js phone page; data and renders come from a local video project |
| [Floor Plan · Walk-in](floorplan-walk/) · [view](https://aliceljy.github.io/playground/floorplan-walk/) | The same floor plan as a coloured plan you furnish yourself: drag pieces in from a library, switch to 3D and the house grows out of the plan; orbit it or walk in through the front door; real sunlight, night, cut walls, whole-house wood swap | SVG plan + Three.js, 60 furniture pieces (symbols and models ported from floorplan-3d, MIT), keyboard/mouse and touch, standalone offline HTML |
| [Cabin Above the Snowline](snowline-cabin/) · [view](https://aliceljy.github.io/playground/snowline-cabin/) | A lit cabin on a snowy summit at night: tap the dark summits around it to light their lamps (seven bring shooting stars), drag the hour from dusk to dawn, or step inside and sit by the fire | Three.js scene built entirely in code, no models or image files; mouse and touch; one offline file |
| [Clockwork · Generated from One Image](clockwork/) · [view](https://aliceljy.github.io/playground/clockwork/) | A clock diagram handed to Gemini 4 Argon, which wrote this 3D page in one pass: a three-stage gear train meshing at the ratios printed on the diagram | Generated by Gemini 4 Argon, Three.js, mouse and touch |
| [Shanhe Scroll](shanhe-scroll/) · [view](https://aliceljy.github.io/playground/shanhe/) | A historical scroll you can step into: a paper timeline opens exhibit cards, each card walks you into a 360° panorama | Three.js panorama sphere, swap one data file to change the subject |

## Adding a new toy

Start with the [production and acceptance guide](AGENTS.md) and write a one-page spec in the toy's own folder.

1. Drop it in its own folder at the repo root.
2. Add a build step to `.github/workflows/pages.yml` that copies its static output into `_site/<name>/`.
3. Add a card to the matching shelf (games or 3D exhibits) in the root `index.html`.

Static toys only need a copy step. Anything needing a build gets its build command in that same workflow — see how `aju-guangzhou-ride` inlines its sources via `build.py`.

## Local preview

Each folder runs standalone over plain HTTP (ES modules need a real server, `file://` will not work):

```bash
cd shanhe-scroll && python3 -m http.server 8777
```

## Licence

Toy sources are mine. Bundled `three.js` keeps its own MIT licence — see the `THIRD_PARTY_NOTICES` / `THREE-LICENSE` files in each folder. External material used by the exhibits (the floor plan, the models) and their design references are listed in their own `THIRD_PARTY_NOTICES` too.
