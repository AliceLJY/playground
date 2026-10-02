# Floor Plan · 3D Sample

Starting from a floor plan found online: read the walls, openings and rooms, compute the areas, extrude a model you can orbit, then add a CAD sheet, two path-traced renders and a winter-solstice sunlight study. Four tabs, best viewed upright on a phone; on a desktop it narrows to a centred column.

**[View online](https://aliceljy.github.io/playground/floorplan/)**

## The four tabs

- 3D: simplified massing — drag to orbit, pinch or scroll to zoom — with the areas of all 8 rooms below, 263.1 m² in total.
- Plan: the ground-floor sheet at 1:100, rendered after reading back the exported CAD drawing (DXF).
- Renders: the living and dining room from one camera in oak and in walnut, path traced at 256 samples.
- Sunlight: assuming Beijing on the winter solstice, a heat map of direct-sun hours across the floor, and the rooms ranked by how long their floors are in direct sun.

## How it was made

- It started from [a video by @AndyL5cc](https://x.com/AndyL5cc/status/2104917432825680278) in which one floor plan becomes a CAD drawing, a 3D model, path-traced renders and a phone page. A public-domain plan was used here to build a sample and find out what that pipeline really needs; it later grew into a roughly 45-second walkthrough video. This page is the phone page shown in that video.
- Plan reading, furniture labelling, CAD export, the sunlight calculation and the path tracing all ran in the author's local video project. The plan, furniture and sunlight data are bundled into `share.js`, and the four images in `assets/` are real outputs of that project. This folder holds only the finished page for publishing.
- Three changes from the project's original: the title, the kicker and the footer no longer say "local page"; on a desktop the page narrows to a centred column; and when the screen is narrower than a desktop, the 3D camera pulls back in proportion (`setView` in `share.js`) so the whole house stays in frame on a phone.

## Sources

- Floor plan: [Sample Floorplan.jpg](https://commons.wikimedia.org/wiki/File:Sample_Floorplan.jpg) by Boereck on Wikimedia Commons, public domain.
- Furniture, soft furnishings and sky light in the renders: Poly Haven models and HDRI, CC0. Only the rendered images are included here; no model files are distributed.
- See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

## Verification

Checked before publishing on 2026-10-02 in Playwright-driven Chromium on a Mac mini (Apple M4, WebGL on the real GPU), once from the source files and once from the site assembled by the workflow, at 1440×900 and 390×844, device pixel ratio 1: each of the four tabs opened and all four images loaded, with no errors other than the browser's own favicon 404. Pixels were read from the 3D canvas: at phone width, before the change, the leftmost and rightmost columns had 22 and 43 pixels on the walls (the house ran out of frame); after it, both are 0, with 35–43 pixels of margin on each side. At desktop width the house sits exactly where it did before, so the camera there is unchanged.

After going live on 2026-10-02, Alice tried it on her own phone: orbiting and zooming were smooth.
