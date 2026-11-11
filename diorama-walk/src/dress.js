// 外观加工（纯数据，不依赖 three）：在 core.visualBoxes() 的基础上改几处、再加一批只看不碰的构件。
// 这里的东西都不是实体：不进碰撞、不进遮挡判断，玩法与惊吓判定一律不变（core.js 不动）。
// Node 测试（tests/look.test.cjs）用它检查外面看得见的面没有两两重合（重合的面会互相打架，闪出碎条纹）。
import { STORE, NEXT, WINDOW, SIDEWALK_H as F, FACADE_Z as FZ } from './core.js';

// Which material key each dressing box is drawn with (main.js / look.js give each key its surface), and which building it
// belongs to: `lift` parts fade with that building's roof when the camera rises out through it; `room` parts are also hidden
// in the room view (looking down into the shop).
const box = (mat, x0, y0, z0, x1, y1, z1, more = {}) => ({ mat, x0, y0, z0, x1, y1, z1, ...more });

// The page's own boxes, with two changes:
// 1. the front's upper band stopped at the roof slab's underside. It used to run up to the roof's top and out to the roof's
//    front face, so two faces of different colour lay on top of each other along the whole eave (z = 0.5, y 3.4-3.6, and the
//    top at y = 3.6) and the depth test picked one or the other pixel by pixel: the broken stripes along the roof edge.
// 2. the street lamp's pole and lantern boxes are left out; look.js draws a round pole with an arm and a lamp head instead
//    (same place, same light).
export function adjustBoxes(V) {
  return V.filter((b) => b.mat !== 'lamp' && b.mat !== 'pole' && b.mat !== 'signText' && b.mat !== 'sign2Text')
    .map((b) => (b.mat === 'storeFacade:upper' ? { ...b, y1: Math.min(b.y1, STORE.h - 0.2) } : b));
}

// Built one piece at a time: fascia and coping, parapets, an air conditioner with its brackets, the meter box and its conduit,
// sills and lintels, the threshold, a lightbox, a shutter box, rooftop units. All of it clear of where a walker or the camera
// goes: on the walls it sticks out at most 0.2 m below 2.3 m (the walker is a 0.25 m circle), anything further out is above head
// height or inside a solid's footprint.
export function dressBoxes() {
  const S = STORE, N = NEXT, D = [];
  const st = { lift: 'store', room: true }, nx = { lift: 'next', room: true };
  // store: a plastered fascia across the front with a coping on top, and parapets round the flat roof
  D.push(box('fascia', S.x0 - 0.06, 3.3, FZ, S.x1 + 0.06, 3.84, FZ + 0.16, st));
  D.push(box('coping', S.x0 - 0.1, 3.84, FZ - 0.04, S.x1 + 0.1, 3.9, FZ + 0.2, st));
  D.push(box('parapet', S.x0, S.h, S.z0, S.x1, S.h + 0.24, S.z0 + 0.15, st));
  D.push(box('parapet', S.x0, S.h, S.z0 + 0.15, S.x0 + 0.15, S.h + 0.24, FZ, st));
  D.push(box('parapet', S.x1 - 0.15, S.h, S.z0 + 0.15, S.x1, S.h + 0.24, FZ, st));
  D.push(box('coping', S.x0 - 0.02, S.h + 0.24, S.z0 - 0.02, S.x1 + 0.02, S.h + 0.28, S.z0 + 0.17, st));
  D.push(box('coping', S.x0 - 0.02, S.h + 0.24, S.z0 + 0.17, S.x0 + 0.17, S.h + 0.28, FZ - 0.04, st));
  D.push(box('coping', S.x1 - 0.17, S.h + 0.24, S.z0 + 0.17, S.x1 + 0.02, S.h + 0.28, FZ - 0.04, st));
  // next door: the same, a little lower
  D.push(box('fascia', N.x0 - 0.06, N.h - 0.28, FZ, N.x1 - 0.06, N.h + 0.2, FZ + 0.14, nx));
  D.push(box('coping', N.x0 - 0.1, N.h + 0.2, FZ - 0.03, N.x1 - 0.06, N.h + 0.25, FZ + 0.17, nx));
  D.push(box('parapet', N.x0, N.h, N.z0, N.x1, N.h + 0.2, N.z0 + 0.14, nx));
  D.push(box('parapet', N.x0, N.h, N.z0 + 0.14, N.x0 + 0.14, N.h + 0.2, FZ - 0.03, nx));
  D.push(box('parapet', N.x1 - 0.14, N.h, N.z0 + 0.14, N.x1, N.h + 0.2, FZ - 0.03, nx));
  // rooftop units: two air-conditioner condensers on a pad, a hatch, a vent box
  for (const x of [0.5, 1.6]) {
    D.push(box('acUnit', x, S.h + 0.1, S.z0 + 0.45, x + 0.85, S.h + 0.68, S.z0 + 0.8, st));
    D.push(box('metalDark', x + 0.05, S.h, S.z0 + 0.42, x + 0.1, S.h + 0.1, S.z0 + 0.83, st));
    D.push(box('metalDark', x + 0.75, S.h, S.z0 + 0.42, x + 0.8, S.h + 0.1, S.z0 + 0.83, st));
  }
  D.push(box('hatch', 3.4, S.h, -4.6, 4.3, S.h + 0.32, -3.8, st));
  D.push(box('acUnit', -1.9, S.h, -2.2, -1.3, S.h + 0.42, -1.7, st));
  D.push(box('acUnit', -7.6, N.h + 0.08, -6.5, -6.8, N.h + 0.6, -6.15, nx));
  D.push(box('metalDark', -7.55, N.h, -6.55, -6.85, N.h + 0.08, -6.1, nx));
  // on the front: an air conditioner high on the wall over the bench, on two angle brackets, dripping onto the pavement
  D.push(box('acUnit', 0.4, 2.92, FZ + 0.02, 1.25, 3.26, FZ + 0.4, st));
  for (const x of [0.46, 1.15]) {
    D.push(box('metalDark', x, 2.86, FZ, x + 0.04, 2.92, FZ + 0.38, st));
    D.push(box('metalDark', x, 2.62, FZ, x + 0.04, 2.92, FZ + 0.04, st));
  }
  // the electricity meter box and its conduit up to the fascia
  D.push(box('meter', 2.15, 1.45, FZ, 2.6, 1.95, FZ + 0.12));
  D.push(box('metalDark', 2.35, 1.95, FZ, 2.41, 3.3, FZ + 0.05));
  // window sill and lintel, door threshold
  D.push(box('sill', WINDOW.x0 + 0.08, WINDOW.y0 - 0.07, FZ, WINDOW.x1 + 0.04, WINDOW.y0, FZ + 0.12));
  D.push(box('sill', WINDOW.x0 + 0.08, WINDOW.y1, FZ, WINDOW.x1 + 0.04, WINDOW.y1 + 0.06, FZ + 0.06));
  D.push(box('sill', S.door.cx - S.door.w / 2 - 0.1, F, FZ, S.door.cx + S.door.w / 2 + 0.05, F + 0.015, FZ + 0.1));
  // a small lightbox standing out from the wall left of the awning (above head height, over the boxes by the door)
  D.push(box('lightbox', 3.13, 2.15, FZ + 0.1, 3.29, 3.05, FZ + 0.58, st));
  for (const y of [2.22, 2.94]) D.push(box('metalDark', 3.19, y, FZ, 3.23, y + 0.04, FZ + 0.1, st));
  // next door: the box of a rolled-up shutter over the door, and a sill under its window
  D.push(box('shutterBox', N.door.cx - N.door.w / 2 - 0.06, F + 2.31, FZ, N.door.cx + N.door.w / 2 + 0.06, F + 2.42, FZ + 0.16, nx));
  D.push(box('sill', -5.16, 0.88, FZ, -3.44, 0.95, FZ + 0.1));
  // a dashed centre line on the street (not across the zebra crossing)
  for (let x = -12; x < 12; x += 2) if (x + 1 < 0.2 || x > 4.8) D.push(box('stripe', x, 0, 6.97, x + 1, 0.008, 7.03));
  return D;
}

// Faces that may share a plane with a face of another material without showing: bottoms (nobody looks up through the
// pavement), the shop interiors, which this pass does not dress, and the window and door frames, whose end faces sit flush
// inside the uprights (enclosed, never seen; the uprights are the same frame material).
export const INTERIOR_MATS = ['storeFloor', 'nextFloor', 'shelf', 'shelfBoard', 'goods', 'goods2', 'goods3', 'freezerBody', 'chestLid', 'counter', 'tvBody', 'register', 'box', 'hang', 'cord', 'storeCeiling', 'mat', 'bar', 'stool', 'shelf2', 'nextLightPanel', 'annex', 'annexFloor', 'backGlow', 'frame', 'windowGlass'];

// Every pair of same-facing faces of different materials that lie in one plane and overlap (m2 per pair of materials and plane).
export function coplanarFaces(boxes, skip = INTERIOR_MATS) {
  const ax = ['x', 'y', 'z'], faces = [];
  boxes.forEach((b) => {
    if (skip.includes(b.mat)) return;
    for (let a = 0; a < 3; a++) for (const s of [-1, 1]) {
      if (a === 1 && s < 0) continue;
      const o = ax.filter((_, k) => k !== a);
      faces.push({ mat: b.mat, a, s, c: s < 0 ? b[ax[a] + '0'] : b[ax[a] + '1'], r: [b[o[0] + '0'], b[o[0] + '1'], b[o[1] + '0'], b[o[1] + '1']] });
    }
  });
  const hits = {};
  for (let p = 0; p < faces.length; p++) for (let q = p + 1; q < faces.length; q++) {
    const f = faces[p], g = faces[q];
    if (f.a !== g.a || f.s !== g.s || f.mat === g.mat || Math.abs(f.c - g.c) > 1e-6) continue;
    const w = Math.min(f.r[1], g.r[1]) - Math.max(f.r[0], g.r[0]), h = Math.min(f.r[3], g.r[3]) - Math.max(f.r[2], g.r[2]);
    if (w > 1e-6 && h > 1e-6) { const k = `${[f.mat, g.mat].sort().join(' / ')} ${ax[f.a]}${f.s > 0 ? '+' : '-'}=${f.c}`; hits[k] = (hits[k] || 0) + w * h; }
  }
  return hits;
}
