// The building: walls extruded from the cleaned wall polygons, lintels and sills, window frames and glass, door leaves on
// hinges, baseboards, floors per room, ceiling slab and outside ground. Adapted from the film project's house.js.
// The structure is built twice, full height and cut at 1.2 m, and the two are swapped; doors turn in both.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { house, M, WALL_H, toX, toZ, DOORS, leafDir, STYLES } from './core.js';
import { woodFloor, tiles } from './textures.js';

export const CUT_H = 1.2;
const std = (color, roughness = 0.85, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness, ...extra });
const OP = Object.fromEntries(house.openings.map((o) => [o.id, o]));

function polyToShape(poly, ShapeCls = THREE.Shape) {
  const s = new ShapeCls();
  poly.forEach(([px, py], i) => { const x = toX(px), y = -toZ(py); if (i) s.lineTo(x, y); else s.moveTo(x, y); });
  return s;
}
function merged(geos, material, { cast = true, receive = true } = {}) {
  if (!geos.length) return new THREE.Group();
  const m = new THREE.Mesh(mergeGeometries(geos.map((g) => (g.index ? g.toNonIndexed() : g)), false), material);
  m.castShadow = cast; m.receiveShadow = receive;
  return m;
}
function boxGeo(w, h, d, x, y, z, rotY = 0) {
  const g = new THREE.BoxGeometry(w, h, d);
  if (rotY) g.rotateY(rotY);
  g.translate(x, y, z);
  return g;
}

export function buildHouse() {
  const group = new THREE.Group();
  const MAT = {
    wall: std(0xf3f0ea, 0.92),
    wallTop: std(0x2e2c2a, 0.8),
    ground: new THREE.ShadowMaterial({ opacity: 0.2 }),      // the ground only shows shadows; the page background shows through
    glass: new THREE.MeshStandardMaterial({ color: 0xcfe6ef, roughness: 0.05, transparent: true, opacity: 0.26, depthWrite: false, side: THREE.DoubleSide }),
    frame: std(0xf4f3f0, 0.45),
    door: std(0xd8bf9a, 0.55),
    baseboard: std(0xf1eee8, 0.5),
    ceiling: std(0xf7f6f3, 0.95),
    handle: std(0xb8b4ac, 0.3, { metalness: 0.9 }),
  };
  const floorTex = { oak: woodFloor({ ...STYLES.oak.floor }), walnut: woodFloor({ ...STYLES.walnut.floor }) };
  const FLOOR = {
    wood: std(0xffffff, 0.55, { map: floorTex.oak }),
    kitchenTile: std(0xffffff, 0.45, { map: tiles({ seed: 11, base: [214, 210, 202], tile: 0.6 }) }),
    bathTile: std(0xffffff, 0.4, { map: tiles({ seed: 12, base: [226, 224, 220], tile: 0.3, size: 1.2 }) }),
    stone: std(0xffffff, 0.6, { map: tiles({ seed: 13, base: [196, 190, 180], jitter: 16, tile: 0.8, size: 3.2, grout: [150, 144, 136] }) }),
  };
  const floorOf = { '客餐厅': 'wood', '家庭室': 'wood', '过道': 'wood', '门厅': 'stone', '厨房': 'kitchenTile', '卫生间': 'bathTile', '洗衣房': 'kitchenTile', '储藏间': 'kitchenTile' };

  const ground = new THREE.Mesh(new THREE.CircleGeometry(70, 96), MAT.ground);
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  group.add(ground);

  const FW = 0.055, FD = 0.07;       // window frame width and depth
  const LEAF_T = 0.04, LEAF_H = 2.05;

  function buildStructure(top) {
    const g = new THREE.Group();
    const wallGeos = [], capGeos = [], frameGeos = [], glassGeos = [], bbGeos = [];
    for (const w of house.walls) {
      const shape = polyToShape(w.outer);
      for (const h of w.holes) shape.holes.push(polyToShape(h, THREE.Path));
      const geo = new THREE.ExtrudeGeometry(shape, { depth: top, bevelEnabled: false, curveSegments: 1 });
      geo.rotateX(-Math.PI / 2);
      wallGeos.push(geo);
      const cap = new THREE.ShapeGeometry(shape);
      cap.rotateX(-Math.PI / 2);
      cap.translate(0, top + 0.003, 0);
      capGeos.push(cap);
    }
    const rectSlab = ([x0, y0, x1, y1], yb, yt, list = wallGeos) => {
      if (yt - yb < 0.01) return;
      list.push(boxGeo((x1 - x0) * M, yt - yb, (y1 - y0) * M, toX((x0 + x1) / 2), (yb + yt) / 2, toZ((y0 + y1) / 2)));
    };
    const capRect = ([x0, y0, x1, y1], y) => {
      const c = new THREE.PlaneGeometry((x1 - x0) * M, (y1 - y0) * M);
      c.rotateX(-Math.PI / 2);
      c.translate(toX((x0 + x1) / 2), y + 0.003, toZ((y0 + y1) / 2));
      capGeos.push(c);
    };
    // window frame and glass along an axis-aligned opening, between sill and head
    function frameAlong(o, sill, head, { mullion = true } = {}) {
      const [x0, y0, x1, y1] = o.rect_px;
      const H = head - sill;
      if (H < 0.2) return;
      if (o.horizontal) {
        const zc = toZ((y0 + y1) / 2), xa = toX(x0), xb = toX(x1), L = xb - xa;
        frameGeos.push(boxGeo(FW, H, FD, xa + FW / 2, sill + H / 2, zc), boxGeo(FW, H, FD, xb - FW / 2, sill + H / 2, zc));
        frameGeos.push(boxGeo(L, FW, FD, (xa + xb) / 2, head - FW / 2, zc), boxGeo(L, FW, FD, (xa + xb) / 2, sill + FW / 2, zc));
        if (mullion && L > 1.0) frameGeos.push(boxGeo(FW * 0.8, H, FD, (xa + xb) / 2, sill + H / 2, zc));
        glassGeos.push(boxGeo(L - 2 * FW, H - 2 * FW, 0.008, (xa + xb) / 2, sill + H / 2, zc));
      } else {
        const xc = toX((x0 + x1) / 2), za = toZ(y0), zb = toZ(y1), L = zb - za;
        frameGeos.push(boxGeo(FD, H, FW, xc, sill + H / 2, za + FW / 2), boxGeo(FD, H, FW, xc, sill + H / 2, zb - FW / 2));
        frameGeos.push(boxGeo(FD, FW, L, xc, head - FW / 2, (za + zb) / 2), boxGeo(FD, FW, L, xc, sill + FW / 2, (za + zb) / 2));
        if (mullion && L > 1.0) frameGeos.push(boxGeo(FD, H, FW * 0.8, xc, sill + H / 2, (za + zb) / 2));
        glassGeos.push(boxGeo(0.008, H - 2 * FW, L - 2 * FW, xc, sill + H / 2, (za + zb) / 2));
      }
    }
    // Lintels and sills reach 2 px into the wall on both sides: the cleaned wall polygons stop a hair short of the opening.
    const along = (o) => { const [x0, y0, x1, y1] = o.rect_px; return o.horizontal ? [x0 - 2, y0, x1 + 2, y1] : [x0, y0 - 2, x1, y1 + 2]; };
    for (const o of house.openings) {
      rectSlab(along(o), o.head_m, top);                     // lintel
      if (o.kind === 'window') {
        const sill = Math.min(o.sill_m, top);
        rectSlab(along(o), 0, sill);                         // wall under the window
        if (top < o.head_m) capRect(o.rect_px, sill);
        frameAlong(o, o.sill_m, Math.min(o.head_m, top));
      } else if (top >= o.head_m) capRect(o.rect_px, top);
    }
    // the two kitchen bay windows sit in 45-degree walls
    for (const dw of house.diagonal_windows) {
      const prism = (yb, yt) => {
        const geo = new THREE.ExtrudeGeometry(polyToShape(dw.quad_px), { depth: yt - yb, bevelEnabled: false, curveSegments: 1 });
        geo.rotateX(-Math.PI / 2);
        geo.translate(0, yb, 0);
        return geo;
      };
      if (top > dw.head_m) wallGeos.push(prism(dw.head_m, top));
      wallGeos.push(prism(0, Math.min(dw.sill_m, top)));
      const cap = new THREE.ShapeGeometry(polyToShape(dw.quad_px));
      cap.rotateX(-Math.PI / 2);
      cap.translate(0, (top > dw.head_m ? top : Math.min(dw.sill_m, top)) + 0.003, 0);
      capGeos.push(cap);
      const head = Math.min(dw.head_m, top), Hh = head - dw.sill_m;
      if (Hh < 0.2) continue;
      const ax = toX(dw.a_px[0]), az = toZ(dw.a_px[1]), bx = toX(dw.b_px[0]), bz = toZ(dw.b_px[1]);
      const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L;
      const rotY = Math.atan2(-uz, ux), cx = (ax + bx) / 2, cz = (az + bz) / 2;
      for (const sgn of [-1, 1]) frameGeos.push(boxGeo(FW, Hh, FD, cx + sgn * ux * (L / 2 - FW / 2), dw.sill_m + Hh / 2, cz + sgn * uz * (L / 2 - FW / 2), rotY));
      frameGeos.push(boxGeo(L, FW, FD, cx, head - FW / 2, cz, rotY), boxGeo(L, FW, FD, cx, dw.sill_m + FW / 2, cz, rotY));
      glassGeos.push(boxGeo(L - 2 * FW, Hh - 2 * FW, 0.008, cx, dw.sill_m + Hh / 2, cz, rotY));
    }
    // glazed doors stay shut: frame and glass from the floor up; so do the fixed panels beside the front door
    for (const d of house.doors) if (d.glazed) frameAlong(OP[d.id], 0, Math.min(OP[d.id].head_m, top));
    for (const d of DOORS) for (const p of d.panels_px) frameAlong({ rect_px: p, horizontal: d.horizontal }, 0, Math.min(OP[d.id].head_m, top), { mullion: false });

    // hinged leaves: one pivot per leaf at its hinge, the leaf reaching out along local +x
    const pivots = [];
    const dh = Math.min(LEAF_H, top);
    DOORS.forEach((d, di) => d.leaves.forEach((lf) => {
      const pivot = new THREE.Group();
      pivot.position.set(lf.hx, 0, lf.hz);
      const leaf = new THREE.Mesh(new THREE.BoxGeometry(lf.len, dh, LEAF_T), MAT.door);
      leaf.position.set(lf.len / 2, dh / 2, 0);
      leaf.castShadow = leaf.receiveShadow = true;
      pivot.add(leaf);
      if (top > 1.05) {
        const handle = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.022, LEAF_T + 0.07), MAT.handle);
        handle.position.set(lf.len - 0.08, 1.02, 0);
        pivot.add(handle);
      }
      g.add(pivot);
      pivots.push({ pivot, lf, di });
    }));

    for (const s of house.baseboards) {
      const ax = toX(s.a[0]), az = toZ(s.a[1]), bx = toX(s.b[0]), bz = toZ(s.b[1]);
      const L = Math.hypot(bx - ax, bz - az);
      if (L < 0.12) continue;
      const t = 0.014, h = 0.085;
      bbGeos.push(boxGeo(L, h, t, (ax + bx) / 2 + (s.n[0] * t) / 2, h / 2 + 0.004, (az + bz) / 2 + (s.n[1] * t) / 2, Math.atan2(-(bz - az), bx - ax)));
    }
    const glass = merged(glassGeos, MAT.glass, { cast: false, receive: false });
    g.add(merged(wallGeos, MAT.wall), merged(capGeos, MAT.wallTop, { cast: false }), merged(frameGeos, MAT.frame), glass, merged(bbGeos, MAT.baseboard, { cast: false }));
    return { group: g, pivots, glass };
  }

  const full = buildStructure(WALL_H), cut = buildStructure(CUT_H);
  cut.group.visible = false;
  group.add(full.group, cut.group);

  const floors = new THREE.Group();
  group.add(floors);
  for (const z of house.floor_zones) {
    const geos = z.polygons_px.map((poly) => {
      const g = new THREE.ShapeGeometry(polyToShape(poly));
      g.rotateX(-Math.PI / 2);
      g.translate(0, 0.004, 0);
      return g;
    });
    const m = new THREE.Mesh(geos.length > 1 ? mergeGeometries(geos) : geos[0], FLOOR[floorOf[z.room] || 'wood']);
    m.receiveShadow = true;
    m.userData.room = z.room;
    floors.add(m);
  }

  // ceiling slab over the whole footprint; it sinks 3 cm into the wall tops so no sunlight slips through the seam in the shadow map
  const ceilGeo = new THREE.ExtrudeGeometry(polyToShape(house.footprint_px), { depth: 0.18, bevelEnabled: false, curveSegments: 1 });
  ceilGeo.rotateX(-Math.PI / 2);
  ceilGeo.translate(0, WALL_H - 0.03, 0);
  const ceiling = new THREE.Mesh(ceilGeo, MAT.ceiling);
  ceiling.castShadow = true; ceiling.receiveShadow = true;
  group.add(ceiling);

  function setStyle(key) {
    const s = STYLES[key];
    FLOOR.wood.map = floorTex[key];
    FLOOR.wood.needsUpdate = true;
    MAT.door.color.set(s.door);
    MAT.baseboard.color.set(s.baseboard);
    MAT.wall.color.set(s.wall);
    MAT.frame.color.set(s.frame);
  }
  function setCut(on) { full.group.visible = !on; cut.group.visible = on; }
  // "shadow" keeps the ceiling casting shadows without drawing it, so sunlight only enters through the windows when seen from above.
  // (three.js picks shadow casters by the main camera's layers, so hiding it on another layer would also stop the shadow.)
  function setCeiling(mode) {
    ceiling.visible = mode !== 'off';
    ceiling.material.colorWrite = mode === 'solid';
    ceiling.material.depthWrite = mode === 'solid';
  }
  function setDoors(state) {
    for (const s of [full, cut]) for (const { pivot, lf, di } of s.pivots) {
      const [dx, dz] = leafDir(lf, state[di].k);
      pivot.rotation.y = Math.atan2(-dz, dx);
    }
  }
  function setRise(k) { full.group.scale.y = cut.group.scale.y = Math.max(0.002, k); }
  function setFloorAlpha(a) {
    floors.visible = a > 0.001;
    for (const m of new Set(floors.children.map((c) => c.material))) { m.transparent = a < 0.999; m.opacity = a; }
  }
  setStyle('oak');
  setCeiling('shadow');
  return { group, full, cut, floors, ceiling, ground, MAT, FLOOR, setStyle, setCut, setCeiling, setDoors, setRise, setFloorAlpha };
}
