// Pieces the upstream kit does not have, built with the kit's own helpers so they share its look:
// oval dining table, round coffee table, pendant lamp, fireplace, and the staircase.
// Local convention matches the kit: back towards -z, y = 0 on the floor, sizes in metres here.
import { house, M, WALL_H, toX, toZ } from './core.js';

export const EXTRA_TYPES = ['x:ovaltable', 'x:roundcoffee', 'x:pendant', 'x:fireplace', 'x:stair'];

export function buildExtra(spec, kit, THREE, style) {
  const { box, rbox, cyl, lathe, rod, blob, mat, woodM, ceramic, glowMat, vase, plate, darker, blackMetal, rng } = kit.h;
  const g = new THREE.Group(), w = spec.w / 1000, d = spec.d / 1000, c = spec.color, R = rng(spec.seedx * 7 + spec.seedy * 13);
  switch (spec.type) {
    case 'x:ovaltable': {
      const top = cyl(0.5, 0.5, 0.04, mat(c, { roughness: 0.4 }), 0, 0.715, 0, 64);
      top.scale.set(w, 1, d);
      g.add(top);
      const lw = woodM(darker(c, 0.55));
      [-1, 1].forEach((s) => g.add(lathe([[0.26, 0], [0.26, 0.02], [0.08, 0.06], [0.055, 0.4], [0.07, 0.66], [0.16, 0.715]], lw, s * w * 0.24, 0, 0, 32)));
      g.add(box(w * 0.48, 0.05, 0.06, lw, 0, 0.6, 0));
      g.add(box(w * 0.5, 0.003, 0.34, mat('#b9a58c', { roughness: 0.96 }), 0, 0.755, 0));
      vase(g, 0, 0.758, 0, 0.065, 0.22, '#e9e2d6', R);
      [[-0.3, -1], [0.3, -1], [-0.3, 1], [0.3, 1], [-1, 0], [1, 0]].forEach(([a, b]) => {
        const x = b === 0 ? a * (w / 2 - 0.2) : a * w * 0.55, z = b * (d / 2 - 0.2);
        plate(g, 0.12, x, 0.756, z);
      });
      break;
    }
    case 'x:roundcoffee': {
      const r = Math.min(w, d) / 2, lw = woodM(darker(c, 0.6));
      g.add(cyl(r, r * 0.98, 0.035, mat(c, { roughness: 0.35 }), 0, 0.37, 0, 56), cyl(r * 0.62, r * 0.62, 0.02, woodM(darker(c, 0.85)), 0, 0.13, 0, 40));
      for (let k = 0; k < 3; k++) { const a = k * 2.094 + 0.5; g.add(rod([Math.cos(a) * r * 0.78, 0, Math.sin(a) * r * 0.78], [Math.cos(a) * r * 0.6, 0.37, Math.sin(a) * r * 0.6], 0.014, lw, 0.022)); }
      g.add(box(0.3, 0.03, 0.22, '#2f5d62', -r * 0.3, 0.405, 0.05), box(0.26, 0.025, 0.19, '#d9b36c', -r * 0.3, 0.435, 0.06));
      vase(g, r * 0.35, 0.405, -r * 0.15, 0.055, 0.18, '#e9e2d6', R);
      break;
    }
    case 'x:pendant': {
      const m = mat(c, { roughness: 0.35, metalness: 0.5 });
      g.add(cyl(0.004, 0.004, WALL_H - 1.9, m, 0, 1.9, 0, 6), cyl(0.05, 0.05, 0.02, m, 0, WALL_H - 0.02, 0, 16));
      g.add(lathe([[0.3, 0], [0.24, 0.12], [0.1, 0.24], [0.03, 0.28]], glowMat('#f6ecd9', '#ffdca0', 0.45), 0, 1.62, 0, 48));
      g.add(blob(0.04, 0.04, 0.04, glowMat('#fff', '#ffe2b0', 1.2), 0, 1.68, 0, 12));
      break;
    }
    case 'x:fireplace': {
      // chimney breast against the wall up to the ceiling, firebox, mantel, hearth slab and a picture above
      const stone = mat('#d9d3c8', { roughness: 0.85 }), dark = mat('#8f8982', { roughness: 0.9 }), depth = 0.45, bz = -d / 2;
      g.add(box(w * 1.02, WALL_H, depth, stone, 0, 0, bz + depth / 2));
      g.add(box(0.84, 0.62, 0.06, mat('#1a1816', { roughness: 0.95 }), 0, 0.09, bz + depth + 0.002));
      g.add(box(0.5, 0.12, 0.03, glowMat('#3a1c0c', '#ff7a2a', 0.9), 0, 0.12, bz + depth + 0.02));
      g.add(box(w + 0.2, 0.08, depth + 0.14, dark, 0, 1.16, bz + depth / 2 + 0.07));
      g.add(box(w + 0.3, 0.05, d * 0.8, dark, 0, 0, bz + d * 0.4));
      g.add(box(0.9, 0.7, 0.03, woodM('#3a3027'), 0, 1.5, bz + depth + 0.015), box(0.8, 0.6, 0.005, '#c9bfae', 0, 1.55, bz + depth + 0.032));
      g.add(box(0.5, 0.25, 0.003, '#7d8ea3', -0.08, 1.66, bz + depth + 0.036), box(0.26, 0.2, 0.003, '#b88a6a', 0.2, 1.6, bz + depth + 0.037));
      vase(g, w * 0.36, 1.24, bz + depth / 2 + 0.07, 0.05, 0.2, '#e9e2d6', R, false);
      break;
    }
    default: g.add(box(w, 0.8, d, c));
  }
  return g;
}

// The staircase: one box per tread, heights from the plan data, placed in world coordinates.
export function buildStairs(kit, THREE) {
  const g = new THREE.Group(), m = kit.h.woodM('#b08a60');
  for (const s of house.furniture) {
    if (s.type !== 'stair') continue;
    const [x0, y0, x1, y1] = s.rect_px;
    g.add(kit.h.box((x1 - x0) * M, s.h, (y1 - y0) * M, m, toX((x0 + x1) / 2), 0, toZ((y0 + y1) / 2)));
  }
  return g;
}
