# playground

Small things built for fun. One repo, one subfolder each, one Pages site.

**Live: https://aliceljy.github.io/playground/**

| Toy | What it is | Stack |
|---|---|---|
| [Xiaoju Racing](xiaoju-racing/) · [play](https://aliceljy.github.io/playground/xiaoju-racing/) | A furry orange tabby races five cats through a Guangzhou-inspired circuit, with drifting and nitro | Three.js, procedural fur and standalone offline HTML |
| [阿橘的广州骑游](aju-guangzhou-ride/) · [play](https://aliceljy.github.io/playground/aju/) | An orange cat bikes across Guangzhou — calico challenges and neighbourhood exploration | Three.js, packed into a single offline HTML |
| [山河卷](shanhe-scroll/) · [play](https://aliceljy.github.io/playground/shanhe/) | A historical scroll you can step into: a paper timeline opens exhibit cards, each card walks you into a 360° panorama | Three.js panorama sphere, swap one data file to change the subject |

## Adding a new toy

1. Drop it in its own folder at the repo root.
2. Add a build step to `.github/workflows/pages.yml` that copies its static output into `_site/<name>/`.
3. Add a card to the root `index.html`.

Static toys only need a copy step. Anything needing a build gets its build command in that same workflow — see how `aju-guangzhou-ride` inlines its sources via `build.py`.

## Local preview

Each folder runs standalone over plain HTTP (ES modules need a real server, `file://` will not work):

```bash
cd shanhe-scroll && python3 -m http.server 8777
```

## Licence

Toy sources are mine. Bundled `three.js` keeps its own MIT licence — see the `THIRD_PARTY_NOTICES` / `THREE-LICENSE` files in each folder.
