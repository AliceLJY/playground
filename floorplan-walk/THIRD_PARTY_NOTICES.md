# Third-party notices

## Three.js

The published page bundles Three.js 0.186.1 together with OrbitControls, RoundedBoxGeometry, RoomEnvironment and BufferGeometryUtils from its examples. MIT License, Copyright © 2010-2026 three.js authors. The build writes the full licence text into the top of the page.

## Furniture kit, 2D symbols and library: wy51ai/floorplan-3d

`src/kit.js` is ported from [wy51ai/floorplan-3d](https://github.com/wy51ai/floorplan-3d) (`index.html` at commit `730ec09`, 2026-10-02): the material cache, the geometry helpers and `buildFurniture()`, upstream lines 1631-1643, 1689-1785 and 1786-2272. Changes made here:

1. wrapped in `createKit()` so Three.js is passed in instead of read from module globals;
2. the kitchen counter accepts `upper`, `splash` and `props` set to `false`, to leave out wall cabinets, backsplash and worktop props;
3. `buildFurniture()` returns the piece at the origin and the caller places it.

`src/symbols.js` is ported from the same file: the furniture library list (lines 470-499), `shade()` (591-592), the floor patterns in `buildDefs()` (594-615) and the 2D furniture symbols in `furnSVG()` (617-724). The one change is that `buildDefs()` returns its markup instead of writing it into the page; symbols for the pieces added here sit in a separate function at the bottom of that file.

The page styles for the library cards, side panel, tables and the 2D/3D switch in `index.template.html` follow that project's stylesheet. The editing in `src/plan2d.js` (dragging out of the library, moving, the rotate and resize handles, undo) follows its approach and reuses a few of its expressions, rewritten for polygon walls.

Not taken from that project: the plan data, the plan drawing (walls, openings, dimension chains), the 3D building, doors, lighting, walking and collision.

```
MIT License

Copyright (c) 2026 wuyi

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

## Content

- Input floor plan: [Sample Floorplan.jpg](https://commons.wikimedia.org/wiki/File:Sample_Floorplan.jpg) by Boereck (2006), Wikimedia Commons, public domain. `assets/floorplan.jpg` is that image; the walls, openings, rooms and furniture positions in `data/house.js` were read from it.
- The sunlight track assumes Beijing on the winter solstice; the plan only shows a north arrow, so the place is an assumption.
- Inspiration for the whole floor-plan project: [a video by @AndyL5cc](https://x.com/AndyL5cc/status/2104917432825680278). None of its code or assets are used.
