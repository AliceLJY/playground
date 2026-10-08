// 微缩街角·走进去 — pure logic, no three.js. Node tests import this file directly; the page renders what it computes.
// Units: metres. World origin at the centre of the base top, +y up, +z towards the street. Yaw 0 looks along -z.

// ---------------- small maths ----------------
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const clamp01 = (v) => clamp(v, 0, 1);
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (a, b, t) => { const k = clamp01((t - a) / (b - a)); return k * k * (3 - 2 * k); };
export const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const lerpAngle = (a, b, k) => a + wrapAngle(b - a) * k;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export function rng(seed) {                      // mulberry32: the same seed gives the same rain everywhere
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function invEaseInOut(e) {                 // inverse of easeInOut by bisection (monotonic)
  let lo = 0, hi = 1;
  for (let i = 0; i < 50; i++) { const m = (lo + hi) / 2; if (easeInOut(m) < e) lo = m; else hi = m; }
  return (lo + hi) / 2;
}

// ---------------- palette (sRGB hex, SPEC 配色) ----------------
export const COLORS = {
  sky: '#0E1420', baseSide: '#1B2230', street: '#2A2F38', sidewalk: '#3A3F48',
  storeWall: '#C9CED6', nextWall: '#8A6F5A', glass: '#9FC4D8', storeLight: '#FFF4E0', nextLight: '#FFB46B',
  freezer: '#DDF3FF', vending: '#F2F7FF', lamp: '#FFC27A', rain: '#A9C4DD', accent: '#E8B04A',
};
export const GLASS_OPACITY = 0.25, RAIN_OPACITY = 0.35;
// Colours the spec leaves open (furniture, floors, roofs). Greys and browns that sit between the spec colours.
export const EXTRA_COLORS = {
  storeRoof: '#7E776C', nextRoof: '#6C5747', storeFloor: '#7A7062', storeGrid: '#5C5449', nextFloor: '#5E4B3D', storeWall: '#4A453D',
  shelf: '#5A4632', shelfBoard: '#6E5640', freezerBody: '#A9B2BE', counter: '#4E3D2E', dark: '#11151D', mat: '#2E2A26',
  frame: '#9AA0A6', bar: '#5A4436', stool: '#3E3A37', shelf2: '#4D3D33', vendBody: '#B5BFCC', pole: '#3A404B',
  bench: '#5F5246', fence: '#2E343E', stripe: '#8E949E', storeCeiling: '#2C2925', ceilingGrid: '#36322D', signText: '#2A1E14', sign2Text: '#3A2618', annex: '#1C2028', annexFloor: '#15181F', backGlow: '#2C3B44',
  // round 8: the old grocery (SPEC 老旧杂货店的深夜氛围). Interior surfaces are dark on purpose: the bulbs make the light pools.
  storeFacade: '#4A3A2C', goods: '#7B6A4E', goods2: '#5E6B5A', goods3: '#8A5A44', box: '#8A6A45', hang: '#76603F', cord: '#1A1816',
  chest: '#8E9196', chestLid: '#A7ABB0', oldCounter: '#4E3D2E', tvBody: '#262629', register: '#4A4D52', alu: '#9AA0A6',
  oldSign: '#CDBB92', oldSignText: '#2A1E14', awning: '#666B70', windowGlass: '#85734A', backDoor: '#5B4330', puddle: '#FFB45A',
  bulb: '#FFB45A', tube: '#CFE8E4', dog: '#4A3324', dogDark: '#2E2018', nextDark: '#2A2622',
};

// ---------------- layout (SPEC 尺度与布局) ----------------
export const BASE = { half: 13, thick: 0.6 };
export const WALK_BOX = BASE.half - 1.5;         // walkable square: base inset 1.5 m
export const ROAD = { z0: 3.5, z1: 10.5 };        // 7 m street
export const SIDEWALK_H = 0.12;                  // pavement and shop floors stand 0.12 above the road
export const FACADE_Z = 0.5;                     // shop fronts; the 3 m pavement runs from here to the road
export const WALL_T = 0.2;
export const DOOR_H = 2.3;
export const EYE_H = 1.6;
export const R = 0.25;                           // walker radius
export const WALK_SPEED = 1.3, RUN_SPEED = 2.6;
export const groundAt = (x, z) => (z > ROAD.z0 && z < ROAD.z1 ? 0 : SIDEWALK_H);

export const STORE = { id: 'store', name: '杂货店', x0: -3, x1: 9, z0: -8.5, z1: FACADE_Z, h: 3.6, door: { cx: 5.0, w: 1.8 } };
export const NEXT = { id: 'next', name: '隔壁小店', x0: -9, x1: -3, z0: -7.5, z1: FACADE_Z, h: 3.4, door: { cx: -6.0, w: 1.2 } };
export const BUILDINGS = [STORE, NEXT];
// round 8: the grocery front is wood with one small dirty window in front of the till, and a tin awning over the door
export const WINDOW = { x0: 6.8, x1: 8.7, y0: SIDEWALK_H + 0.55, y1: 2.6, opacity: 0.35 };
export const AWNING = { x0: 3.7, x1: 6.3, z0: FACADE_Z, z1: FACADE_Z + 1.1, y: 2.6 };
export const ANNEX = { x0: 5.75, x1: 7.25, z0: -9.9, z1: -8.5, h: 2.5, t: 0.15 };   // the back room behind the staff door (惊吓版)
const annexBoxes = () => { const A = ANNEX; return [['annex-w', A.x0, 0, A.z0, A.x0 + A.t, A.h, A.z1], ['annex-e', A.x1 - A.t, 0, A.z0, A.x1, A.h, A.z1], ['annex-back', A.x0, 0, A.z0, A.x1, A.h, A.z0 + A.t], ['annex-roof', A.x0, A.h - A.t, A.z0, A.x1, A.h, A.z1]]; };

// Doors: proximity opening, frame-rate independent (SPEC 里面怎么走 / 碰撞)
export const DOOR_NEAR = 2.2, DOOR_SPEED = 1.6, DOOR_PASS = 0.75;
export const DOORS = BUILDINGS.map((b) => ({
  id: b.id, cx: b.door.cx, cz: b.z1 - WALL_T / 2, w: b.door.w,
  x0: b.door.cx - b.door.w / 2, x1: b.door.cx + b.door.w / 2, z0: b.z1 - WALL_T, z1: b.z1,
}));
export const newDoors = () => DOORS.map(() => ({ k: 0, want: 0 }));

// The grocery's furniture (round 8). Heights are above the shop floor. The three aisles are the gaps between the wall shelf
// and the three freestanding rows: 0.95, 1.00 and 1.05 m wide, each 5 m deep, open at both ends.
export const GROCERY = (() => {
  const rows = [['shelf-w', -2.8, -2.25], ['shelf-a', -1.3, -0.75], ['shelf-b', 0.25, 0.8], ['shelf-c', 1.85, 2.4]];
  const zFront = -1.5, zEnd = -6.5, h = 1.9;
  const shelves = rows.map(([id, x0, x1]) => ({ id, x0, x1, z0: zEnd, z1: zFront, h })).concat([{ id: 'shelf-e', x0: 8.25, x1: 8.8, z0: -5.6, z1: -3.4, h }]);
  const aisles = rows.slice(1).map(([, x0], i) => ({ i, x0: rows[i][2], x1: x0, cx: (rows[i][2] + x0) / 2, zFront, zEnd }));
  return {
    shelves, aisles, shelfH: h,
    solids: [                                         // [id, x0, y0, z0, x1, y1, z1], y above the floor
      ['chest', -2.4, 0, -8.3, 1.4, 0.9, -7.55],      // chest freezer on the back wall
      ['counter', 7.0, 0, -3.0, 7.6, 1.0, -0.6],      // the old till, near the small window
      ['tv', 7.08, 1.0, -2.72, 7.5, 1.42, -2.22],     // old television on the till, screen facing the shop
      ['register', 7.12, 1.0, -1.5, 7.48, 1.24, -1.1],
      ['box-1', 3.0, 0, -4.6, 3.6, 0.6, -4.0], ['box-2', 3.05, 0.6, -4.55, 3.5, 1.0, -4.1],
      ['box-3', -2.7, 0, -0.6, -2.0, 0.7, 0.15], ['box-4', 8.1, 0, -7.4, 8.75, 0.55, -6.7], ['box-5', 2.6, 0, -7.9, 3.2, 0.45, -7.3],
      ['box-out-1', 3.0, 0, FACADE_Z + 0.1, 3.7, 0.55, FACADE_Z + 0.7], ['box-out-2', 3.1, 0.55, FACADE_Z + 0.15, 3.55, 0.85, FACADE_Z + 0.6],   // by the door, outside
    ],
    tv: { x: 7.075, z0: -2.66, z1: -2.28, y0: SIDEWALK_H + 1.05, y1: SIDEWALK_H + 1.37 },   // the screen, facing -x
    bulbs: [[7.45, 2.75, -1.55], [-0.25, 2.75, -4.0]],                                         // over the till, over the middle aisle
    tube: { x0: 3.0, x1: 4.2, z: -2.8, y: 3.25 },
    hang: [[-0.25, -3.0], [1.33, -5.2], [3.3, -1.1], [-1.78, -5.6], [5.6, -4.8]],               // strings of goods hanging from the ceiling
  };
})();
const B3 = (id, kind, x0, y0, z0, x1, y1, z1, extra = {}) => ({ id, kind, x0, y0, z0, x1, y1, z1, ...extra });

// Every solid as a 3D box. Walls are split at the door openings; the closed door leaves are their own box.
// "lift" marks the parts that are hidden while the camera rises out of that building (roof, fascia, lintel).
const STATIC_SOLIDS = (() => {
  const S = [], T = WALL_T;
  for (const b of BUILDINGS) {
    const d = DOORS.find((q) => q.id === b.id);
    S.push(B3(b.id + ':back', 'wall', b.x0, 0, b.z0, b.x1, b.h, b.z0 + T));
    S.push(B3(b.id + ':west', 'wall', b.x0, 0, b.z0, b.x0 + T, b.h, b.z1));
    S.push(B3(b.id + ':east', 'wall', b.x1 - T, 0, b.z0, b.x1, b.h, b.z1));
    S.push(B3(b.id + ':front-l', 'wall', b.x0 + T, 0, b.z1 - T, d.x0, b.h, b.z1));
    S.push(B3(b.id + ':front-r', 'wall', d.x1, 0, b.z1 - T, b.x1 - T, b.h, b.z1));
    S.push(B3(b.id + ':lintel', 'wall', d.x0, SIDEWALK_H + DOOR_H, b.z1 - T, d.x1, b.h, b.z1, { lift: b.id }));
    S.push(B3(b.id + ':roof', 'roof', b.x0, b.h - 0.2, b.z0, b.x1, b.h, b.z1, { lift: b.id }));
  }
  const F = SIDEWALK_H;
  // the grocery (round 8): tall wooden shelves (1.9 m) making three narrow aisles, a chest freezer on the back wall, the old
  // till with a television and a cash register on it, cardboard boxes on the floor
  for (const sh of GROCERY.shelves) S.push(B3(sh.id, 'furniture', sh.x0, F, sh.z0, sh.x1, F + sh.h, sh.z1));
  for (const [id, x0, y0, z0, x1, y1, z1] of GROCERY.solids) S.push(B3(id, 'furniture', x0, F + y0, z0, x1, F + y1, z1));
  S.push(B3('awning', 'roof', AWNING.x0, AWNING.y - 0.12, AWNING.z0, AWNING.x1, AWNING.y + 0.05, AWNING.z1, { lift: 'store' }));   // above head height
  // the back room behind the staff door (dim, cannot be entered: the back wall's box still closes the doorway)
  for (const [id, a, b, c, d, e, f] of annexBoxes()) S.push(B3(id, 'wall', a, b, c, d, e, f));
  // the shop next door: one bar and four stools
  S.push(B3('bar', 'furniture', -8.4, F, -5.2, -4.0, F + 1.05, -4.6));
  for (const cx of [-7.6, -6.7, -5.8, -4.9]) S.push(B3('stool@' + cx, 'furniture', cx - 0.2, F, -4.2, cx + 0.2, F + 0.7, -3.8));
  S.push(B3('kitchen-shelf', 'furniture', -8.6, F, -7.3, -5.0, F + 1.8, -6.9));
  // street furniture: vending machine (0.9 x 0.7 x 1.83) right of the store door, lamp (4.5 m), bench
  S.push(B3('vending', 'furniture', 5.95, F, FACADE_Z, 6.85, F + 1.83, FACADE_Z + 0.7));   // right beside the door: in full view from the landing spot
  S.push(B3('lamp', 'furniture', -1.65, F, 2.95, -1.35, F + 4.5, 3.25));     // pole base; the lantern on top is no wider than 0.4
  S.push(B3('bench', 'furniture', 0.2, F, FACADE_Z + 0.12, 1.8, F + 0.45, FACADE_Z + 0.57));
  // low fences close the gaps beside the shops, so the walkable street ends at the shop fronts
  S.push(B3('fence-e', 'furniture', STORE.x1, F, FACADE_Z - 0.15, BASE.half, F + 1.0, FACADE_Z + 0.05));
  S.push(B3('fence-w', 'furniture', -BASE.half, F, FACADE_Z - 0.15, NEXT.x0, F + 1.0, FACADE_Z + 0.05));
  return S;
})();
export const LAMP = { x: -1.5, z: 3.1, top: SIDEWALK_H + 4.5 };
const DOOR_SOLIDS = DOORS.map((d, i) => B3(d.id + ':door', 'door', d.x0, SIDEWALK_H, d.z0, d.x1, SIDEWALK_H + DOOR_H, d.z1, { door: i }));

// All solids, with door leaves marked active while they still block (opening below DOOR_PASS).
export function solids(doors = newDoors(), backAngle = BACKDOOR.half) {
  const [x0, z0, x1, z1] = backdoorBox(backAngle);
  return STATIC_SOLIDS.concat(DOOR_SOLIDS.map((s) => ({ ...s, active: doors[s.door].k < DOOR_PASS })),
    [B3('backdoor-leaf', 'furniture', x0, SIDEWALK_H, z0, x1, SIDEWALK_H + BACKDOOR.h, z1)]);
}
// 2D boxes [x0, z0, x1, z1] that stop a walker: anything overlapping the body height above the floor.
const BODY = [SIDEWALK_H + 0.02, SIDEWALK_H + 1.9];
const STATIC_WALK = STATIC_SOLIDS.filter((s) => s.y1 > BODY[0] && s.y0 < BODY[1]).map((s) => [s.x0, s.z0, s.x1, s.z1]);
export function walkBoxes(doors, backAngle = BACKDOOR.half) {
  const out = STATIC_WALK.slice();
  DOOR_SOLIDS.forEach((s) => { if (!doors || doors[s.door].k < DOOR_PASS) out.push([s.x0, s.z0, s.x1, s.z1]); });
  out.push(backdoorBox(backAngle));
  return out;
}
// The staff door on the store's back wall: hinged at x 6.0. Half open (35 deg) normally; the scare version opens it wide
// (80 deg) and slams it shut. Round 8: an old wooden door that swings into the back room (dir -1, towards -z), so from
// anywhere in the shop the leaf never stands in front of the doorway. Its box is the axis-aligned box of the leaf.
export const BACKDOOR = { hx: 6.0, hz: -8.3, w: 1.0, h: 2.1, half: (35 * Math.PI) / 180, wide: (80 * Math.PI) / 180, cx: 6.5, cz: -8.3, dir: -1 };
export const leafAngle = (angle) => BACKDOOR.dir * angle;     // the leaf's world angle about the hinge (+ = into the shop)
export function backdoorBox(angle) {
  const a = leafAngle(angle), ex = BACKDOOR.hx + Math.cos(a) * BACKDOOR.w, ez = BACKDOOR.hz + Math.sin(a) * BACKDOOR.w;
  return [Math.min(BACKDOOR.hx, ex) - 0.02, Math.min(BACKDOOR.hz, ez) - 0.02, Math.max(BACKDOOR.hx, ex) + 0.02, Math.max(BACKDOOR.hz, ez) + 0.02];
}
export const buildingAt = (x, z, front = 0) => BUILDINGS.find((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1 + front) || null;
export const insideInterior = (x, z) => BUILDINGS.some((b) => x > b.x0 + WALL_T && x < b.x1 - WALL_T && z > b.z0 + WALL_T && z < b.z1 - WALL_T);
// Outdoor walkable area (pavement, street, far kerb) inside the walkable square; landings always end here.
export const OUTDOOR = { x0: -WALK_BOX, x1: WALK_BOX, z0: FACADE_Z, z1: WALK_BOX };

// ---------------- collision ----------------
export function boxDist(x, z, b) {
  const dx = x - clamp(x, b[0], b[2]), dz = z - clamp(z, b[1], b[3]);
  return Math.hypot(dx, dz);
}
// Circle against boxes: push out along the shortest way. A few passes settle corners.
export function resolveCircle(p, boxes, r = R) {
  const lim = WALK_BOX - r;
  for (let it = 0; it < 6; it++) {
    let moved = false;
    for (const b of boxes) {
      const qx = clamp(p.x, b[0], b[2]), qz = clamp(p.z, b[1], b[3]);
      const dx = p.x - qx, dz = p.z - qz, d2 = dx * dx + dz * dz;
      if (d2 >= r * r - 1e-12) continue;
      moved = true;
      if (d2 > 1e-14) { const d = Math.sqrt(d2), k = (r - d) / d; p.x += dx * k; p.z += dz * k; }
      else {                                   // centre inside the box: leave by the nearest side
        const l = p.x - b[0], rr = b[2] - p.x, t = p.z - b[1], bo = b[3] - p.z, m = Math.min(l, rr, t, bo);
        if (m === l) p.x = b[0] - r; else if (m === rr) p.x = b[2] + r; else if (m === t) p.z = b[1] - r; else p.z = b[3] + r;
      }
    }
    const cx = clamp(p.x, -lim, lim), cz = clamp(p.z, -lim, lim);
    if (cx !== p.x || cz !== p.z) { p.x = cx; p.z = cz; moved = true; }
    if (!moved) break;
  }
}
// Move by (dx, dz) in small sub-steps (no tunnelling through 0.2 m walls). Records the path for the doors.
export function moveCircle(p, dx, dz, boxes, dt, path) {
  const len = Math.hypot(dx, dz), n = Math.max(1, Math.ceil(len / 0.05));
  const x0 = p.x, z0 = p.z;
  for (let i = 0; i < n; i++) {
    const ax = p.x, az = p.z;
    p.x += dx / n; p.z += dz / n;
    resolveCircle(p, boxes);
    if (path) path.push([ax, az, p.x, p.z, dt / n]);
  }
  return Math.hypot(p.x - x0, p.z - z0);
}

// ---------------- doors ----------------
// Open while the walker is within DOOR_NEAR of the door centre. The walker moves in straight lines within a
// (sub)step, so the time spent inside the radius is solved exactly: the opening never depends on the step size.
function ramp(st, open, t) { if (t > 0) st.k = clamp01(st.k + (open ? 1 : -1) * DOOR_SPEED * t); }
// `ov` is an extra interval [start, end) of absolute time in which the door wants to be open (the scare version's door
// that opens by itself); `onOpen(t)` is called at the exact moment the door starts wanting to open (the doorbell).
export function doorSegment(st, d, x0, z0, x1, z1, dt, t0 = 0, ov = null, onOpen = null) {
  const ax = x0 - d.cx, az = z0 - d.cz, bx = x1 - x0, bz = z1 - z0, R2 = DOOR_NEAR * DOOR_NEAR;
  const A = bx * bx + bz * bz, B = 2 * (ax * bx + az * bz), Cc = ax * ax + az * az - R2;
  let ta = 1, tb = 1;
  if (A < 1e-14) { if (Cc < 0) { ta = 0; tb = 1; } }
  else {
    const disc = B * B - 4 * A * Cc;
    if (disc > 0) { const q = Math.sqrt(disc); ta = clamp01((-B - q) / (2 * A)); tb = clamp01((-B + q) / (2 * A)); }
  }
  const wins = !ov ? [] : Array.isArray(ov[0]) ? ov : [ov];   // one interval or a list of them (round 8: E3, then the dog leaving)
  const cuts = [0, ta * dt, tb * dt, dt];
  for (const w of wins) for (const c of [w[0] - t0, w[1] - t0]) if (c > 0 && c < dt) cuts.push(c);
  cuts.sort((a, b) => a - b);
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], b = cuts[i + 1];
    if (b - a <= 1e-12) continue;
    const m = (a + b) / 2, want = (m > ta * dt && m < tb * dt) || wins.some((w) => t0 + m >= w[0] && t0 + m < w[1]) ? 1 : 0;
    if (want && !st.want && onOpen) onOpen(t0 + a);
    st.want = want;
    ramp(st, !!want, b - a);
  }
}
export function stepDoorsPath(doors, path, t0 = 0, ov = null, onOpen = null) {
  let t = t0;
  for (const [x0, z0, x1, z1, dt] of path) {
    DOORS.forEach((d, i) => doorSegment(doors[i], d, x0, z0, x1, z1, dt, t, i === 0 ? ov : null, onOpen ? (tt) => onOpen(i, tt) : null));
    t += dt;
  }
}
export function closeDoors(doors, dt) { doors.forEach((st) => { st.want = 0; ramp(st, false, dt); }); }

// ---------------- camera maths ----------------
export function basis(yaw, pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const f = [-sy * cp, sp, -cy * cp], r = [cy, 0, -sy];
  const u = [r[1] * f[2] - r[2] * f[1], r[2] * f[0] - r[0] * f[2], r[0] * f[1] - r[1] * f[0]];
  return { f, r, u };
}
// Screen position in [0, 1] from the top-left, and depth along the view direction.
export function project(cam, fov, aspect, p) {
  const { f, r, u } = basis(cam.yaw, cam.pitch);
  const d = [p[0] - cam.x, p[1] - cam.y, p[2] - cam.z], zc = dot(d, f), t = Math.tan((fov * Math.PI) / 360);
  return { x: 0.5 + dot(d, r) / (zc * t * aspect) / 2, y: 0.5 - dot(d, u) / (zc * t) / 2, depth: zc };
}
export function screenRay(cam, fov, aspect, sx, sy) {
  const { f, r, u } = basis(cam.yaw, cam.pitch), t = Math.tan((fov * Math.PI) / 360);
  const nx = (2 * sx - 1) * t * aspect, ny = (1 - 2 * sy) * t;
  const d = [f[0] + r[0] * nx + u[0] * ny, f[1] + r[1] * nx + u[1] * ny, f[2] + r[2] * nx + u[2] * ny], L = Math.hypot(...d);
  return { o: [cam.x, cam.y, cam.z], d: d.map((v) => v / L) };
}
export function rayBox(o, d, b) {
  let t0 = 0, t1 = Infinity;
  const ax = [[o[0], d[0], b.x0, b.x1], [o[1], d[1], b.y0, b.y1], [o[2], d[2], b.z0, b.z1]];
  for (const [oi, di, lo, hi] of ax) {
    if (Math.abs(di) < 1e-12) { if (oi < lo || oi > hi) return Infinity; continue; }
    let ta = (lo - oi) / di, tb = (hi - oi) / di;
    if (ta > tb) [ta, tb] = [tb, ta];
    t0 = Math.max(t0, ta); t1 = Math.min(t1, tb);
    if (t0 > t1) return Infinity;
  }
  return t0;
}
export const orbitCamera = (o) => {
  const sp = Math.sin(o.phi);
  return { x: o.cx + o.r * sp * Math.sin(o.theta), y: o.cy + o.r * Math.cos(o.phi), z: o.cz + o.r * sp * Math.cos(o.theta), yaw: o.theta, pitch: -(Math.PI / 2 - o.phi) };
};

// ---------------- the one progress value s (SPEC 构图与过渡) ----------------
// Inside: 65° vertical, but never narrower than 45° across (tall phones), and never more than 85° vertical.
export const deg = (r) => (r * 180) / Math.PI, rad = (d) => (d * Math.PI) / 180;
export const fovInside = (aspect) => clamp(deg(2 * Math.atan(Math.tan(rad(22.5)) / aspect)), 65, 85);
export const hfov = (vfov, aspect) => deg(2 * Math.atan(Math.tan(rad(vfov) / 2) * aspect));
export const MAP = {
  fov: (s, aspect = 16 / 9) => 35 + (fovInside(aspect) - 35) * smooth(0.3, 1, s),
  tilt: (s) => 1 - smooth(0.2, 0.75, s),
  fog: (s) => 0.035 * smooth(0.35, 1, s),
  rainMix: (s) => smooth(0.4, 0.9, s),            // 0: rain in a box over the base, 1: a 12 m cylinder round the camera
  rainOpacity: (s) => lerp(0.18, 0.35, smooth(0.4, 0.9, s)),
  rainHeight: (s) => lerp(6, 9.5, smooth(0.4, 0.9, s)),   // box 6 m over the base -> cylinder 9.5 m tall
  rainShown: (s) => lerp(0.5, 1, smooth(0.4, 0.9, s)),    // share of the 2400 streaks drawn
  groundAlpha: (s) => smooth(0.5, 0.75, s),       // the 200 x 200 street-coloured ground, only after s = 0.5
  baseSides: (s) => s <= 0.8,
  lowpass: (s) => 600 * Math.pow(4000 / 600, clamp01(s)),
  volume: (s) => 0.15 + 0.35 * clamp01(s),
};
export function looks(s, aspect = 16 / 9) {
  return { s, fov: MAP.fov(s, aspect), tilt: MAP.tilt(s), fog: MAP.fog(s), rainMix: MAP.rainMix(s), rainOpacity: MAP.rainOpacity(s), rainHeight: MAP.rainHeight(s),
    rainShown: MAP.rainShown(s), groundAlpha: MAP.groundAlpha(s), baseSides: MAP.baseSides(s), lowpass: MAP.lowpass(s), volume: MAP.volume(s) };
}
export const S_PER_Z = 0.3, Z_ENTER = 0.85, R_IN = 14;   // manual zoom: s = 0.3 z, radius hero -> 14 m, auto entry at z >= 0.85
export const ENTER_TIME = 1.4, EXIT_TIME = 1.2;
export const rOf = (z, rHero) => rHero * Math.pow(R_IN / rHero, z);
export const zOf = (r, rHero) => Math.log(r / rHero) / Math.log(R_IN / rHero);

// ---------------- framing (SPEC: hero) ----------------
export const HERO = { theta: 0.42, phi: 0.96, center: [2.2, 0.6, 5.0], fov: 35 };   // centre pulled towards the camera so the model sits mid-frame
export const PHI_RANGE = [0.45, 1.2];
const corners = (b) => { const o = []; for (const x of [b.x0, b.x1]) for (const y of [b.y0, b.y1]) for (const z of [b.z0, b.z1]) o.push([x, y, z]); return o; };
export const BASE_BOX = { x0: -BASE.half, y0: -BASE.thick, z0: -BASE.half, x1: BASE.half, y1: 0, z1: BASE.half };
const BASE_PTS = corners(BASE_BOX);
const MODEL_PTS = BASE_PTS.concat(...STATIC_SOLIDS.map(corners), corners({ x0: LAMP.x - 0.2, x1: LAMP.x + 0.2, y0: 0, y1: LAMP.top, z0: LAMP.z - 0.2, z1: LAMP.z + 0.2 }));
export function screenBoxOf(cam, fov, aspect, pts) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of pts) { const q = project(cam, fov, aspect, p); x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  return { x0, y0, x1, y1, w: x1 - x0, h: y1 - y0 };
}
export const SCREEN_POINTS = { base: BASE_PTS, model: MODEL_PTS };
// The tilt-shift focus follows the store front: the four corners of the facade, and the lit sign over the door.
export const STOREFRONT = [[STORE.x0, SIDEWALK_H, STORE.z1], [STORE.x0, STORE.h, STORE.z1], [STORE.x1, SIDEWALK_H, STORE.z1], [STORE.x1, STORE.h, STORE.z1]];
export const SIGN = { x0: STORE.door.cx - 1.5, x1: STORE.door.cx + 1.5, y0: 2.95, y1: 3.3, z: STORE.z1 + 0.075 };
export const FOCUS_BAND = 0.1;                     // the clear band: focus line ± 10% of the screen height
// Screen height (0 top, 1 bottom) of the focus line: middle of the projected store front, held in [0.15, 0.85].
export function focusLine(cam, fov, aspect) {
  let y0 = Infinity, y1 = -Infinity;
  for (const p of STOREFRONT) { const q = project(cam, fov, aspect, p); if (q.depth < 0.1) return 0.5; y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y); }
  return clamp((y0 + y1) / 2, 0.15, 0.85);
}
export const boxesAt = (cam, fov, aspect) => ({ base: screenBoxOf(cam, fov, aspect, BASE_PTS), model: screenBoxOf(cam, fov, aspect, MODEL_PTS) });
export const heroOrbitAt = (r) => ({ cx: HERO.center[0], cy: HERO.center[1], cz: HERO.center[2], r, theta: HERO.theta, phi: HERO.phi });
// Landscape: the base box takes 70% of the width. Portrait (aspect < 0.8): fit by width. Then back off until the whole
// model (roofs and lamp included) keeps at least 4% from every edge.
export function heroRadius(aspect) {
  const target = aspect < 0.8 ? 0.82 : 0.7, margin = 0.04;
  const at = (r) => boxesAt(orbitCamera(heroOrbitAt(r)), HERO.fov, aspect);
  let lo = 5, hi = 4000;
  for (let i = 0; i < 80; i++) { const m = Math.sqrt(lo * hi); if (at(m).base.w > target) lo = m; else hi = m; }
  let r = hi;
  const fits = (b) => b.model.x0 >= margin && b.model.y0 >= margin && b.model.x1 <= 1 - margin && b.model.y1 <= 1 - margin;
  for (let i = 0; i < 400 && !fits(at(r)); i++) r *= 1.01;
  return r;
}

// ---------------- aiming, landing, path ----------------
export const AIMS = {
  door: [STORE.door.cx, SIDEWALK_H + 1.2, STORE.z1],
  street: [1.0, 0, 6.8],
  roof: [(STORE.x0 + STORE.x1) / 2, STORE.h, (STORE.z0 + STORE.z1) / 2],
  next: [NEXT.door.cx, SIDEWALK_H + 1.2, NEXT.z1],          // round 8: the shop next door (lands outside its door)
};
export function aimPoint(aim) {
  if (typeof aim === 'string') { if (!AIMS[aim]) throw new Error('unknown aim ' + aim); return AIMS[aim].slice(); }
  const b = buildingAt(aim.x, aim.z);
  return [aim.x, b ? b.h : groundAt(aim.x, aim.z), aim.z];
}
// First thing the aiming ray meets: a building (its box from the ground to the roof) or the ground.
export function aimHit(o, d) {
  let best = { kind: 'none', t: Infinity };
  for (const b of BUILDINGS) {
    const t = rayBox(o, d, { x0: b.x0, x1: b.x1, y0: 0, y1: b.h, z0: b.z0, z1: b.z1 });
    if (t < best.t) best = { kind: 'building', b, t };
  }
  if (d[1] < -1e-6) {
    let t = (SIDEWALK_H - o[1]) / d[1];
    if (groundAt(o[0] + d[0] * t, o[2] + d[2] * t) === 0) t = -o[1] / d[1];
    if (t > 0 && t < best.t) {
      const x = o[0] + d[0] * t, z = o[2] + d[2] * t, b = buildingAt(x, z);
      best = b ? { kind: 'building', b, t } : { kind: 'ground', x, z, t };
    }
  }
  return best;
}
// Push a point until it is at least `clear` from every solid (doors counted shut), staying outdoors.
export function pushClear(x, z, clear = 0.4, area = OUTDOOR) {
  const boxes = walkBoxes(null), p = { x, z };
  for (let it = 0; it < 12; it++) {
    let moved = false;
    for (const b of boxes) {
      const qx = clamp(p.x, b[0], b[2]), qz = clamp(p.z, b[1], b[3]), dx = p.x - qx, dz = p.z - qz, d = Math.hypot(dx, dz);
      if (d >= clear - 1e-9) continue;
      moved = true;
      if (d > 1e-9) { p.x = qx + (dx / d) * clear; p.z = qz + (dz / d) * clear; }
      else {
        const l = p.x - b[0], rr = b[2] - p.x, t = p.z - b[1], bo = b[3] - p.z, m = Math.min(l, rr, t, bo);
        if (m === l) p.x = b[0] - clear; else if (m === rr) p.x = b[2] + clear; else if (m === t) p.z = b[1] - clear; else p.z = b[3] + clear;
      }
    }
    const cx = clamp(p.x, area.x0 + clear, area.x1 - clear), cz = clamp(p.z, area.z0 + clear, area.z1 - clear);
    if (cx !== p.x || cz !== p.z) { p.x = cx; p.z = cz; moved = true; }
    if (!moved) break;
  }
  return [p.x, p.z];
}
export const DOOR_LANDING = 2.6;                 // metres out from the door, on the kerb side of the pavement: the door is shut on landing
export const doorLanding = (b) => ({ x: b.door.cx, z: b.z1 + DOOR_LANDING, yaw: 0, building: b.id });   // facing the door (-z)
export function landingFor(hit, yaw) {
  if (hit.kind === 'building') return doorLanding(hit.b);
  const gx = hit.kind === 'ground' ? hit.x : 0, gz = hit.kind === 'ground' ? hit.z : 6.8;
  const [x, z] = pushClear(clamp(gx, OUTDOOR.x0, OUTDOOR.x1), clamp(gz, OUTDOOR.z0, OUTDOOR.z1), 0.4);
  return { x, z, yaw, building: null };
}
export const bez = (p0, p1, p2, t) => [0, 1, 2].map((i) => (1 - t) * (1 - t) * p0[i] + 2 * t * (1 - t) * p1[i] + t * t * p2[i]);
// Is a camera point clear of every solid by `margin`, and above the ground? `skipLift` names a building whose
// roof, fascia and lintel are hidden (rising out of it).
export function cameraClear(p, margin = 0.1, skipLift = null, doors = null) {
  if (p[1] < groundAt(p[0], p[2]) + margin) return false;
  for (const s of solids(doors || newDoors())) {
    if (s.kind === 'door' && (!s.active || DOORS[s.door].id === skipLift)) continue;
    if (skipLift && s.lift === skipLift) continue;
    if (p[0] > s.x0 - margin && p[0] < s.x1 + margin && p[1] > s.y0 - margin && p[1] < s.y1 + margin && p[2] > s.z0 - margin && p[2] < s.z1 + margin) return false;
  }
  return true;
}
// The control point sits straight above the ground end at max(start height, 8 m). If that curve would still touch a
// solid (possible when it sweeps low over a roof edge next to the landing), it is raised until the curve is clear.
export const PATH_SAMPLES = 160;
export function controlHeight(P0, P2, skipLift = null) {
  let h = Math.max(P0[1], 8);
  for (let tries = 0; tries < 16; tries++) {
    const P1 = [P2[0], h, P2[2]];
    let ok = true;
    for (let i = 1; i < PATH_SAMPLES && ok; i++) ok = cameraClear(bez(P0, P1, P2, i / PATH_SAMPLES), 0.1, skipLift);
    if (ok) return { h, raised: tries > 0 };
    h *= 1.2;
  }
  return { h, raised: true };
}
// Camera along a transition. er = 0 at the orbit end, 1 at the ground end (entering runs it forwards, leaving backwards).
export function pathPose(tr, er) {
  const p = bez(tr.P0, tr.P1, tr.P2, er);
  return { x: p[0], y: p[1], z: p[2], yaw: lerpAngle(tr.yawO, tr.yawG, smooth(0, 0.9, er)), pitch: lerp(tr.pitchO, tr.pitchG, smooth(0.25, 1, er)) };
}


// ---------------- 惊吓版: E0–E5 (SPEC 惊吓版) ----------------
// Everything is decided here from simulation time and the player's pose; the page only draws what this returns.
// Triggers are checked on a fixed 1/240 s grid using the exact pose inside each step, so 30 and 120 steps per second
// fire at the same instants; every duration is then measured from that instant.
export const HORROR = {
  tick: 1 / 240,
  figure: { h: 1.7, bodyR: 0.19, headR: 0.12, color: '#0A0C10' },
  spots: {
    counter: { x: 8.2, z: -0.9, yaw: Math.atan2(8.2 - 5.0, -0.9 - FACADE_Z) },                    // behind the till, facing the door
    window: { x: 7.9, z: FACADE_Z - WALL_T - 0.35, yaw: 0 },                                         // round 8: behind the small window; round 9: back to the street (SPEC 第九轮「照旧背对街站着」)
    backroom: { x: 6.55, z: -9.0, yaw: Math.PI },                                                  // in the staff doorway, facing into the store
  },
  e0: { delay: 0.2, dark: 0.35, level: 0.03 },
  // round 6: E2 on any of 4 m walked in the shop / within 3 m of the freezer wall / 12 s in the shop; the ceiling panels blink twice first
  // round 8: the tube blinks twice, then bulb 1, bulb 2 and the tube go out one by one, the television goes black and the
  // chest freezer stops humming: 1.6 s of silence (rain only), then everything back
  e2: { walk: 4, wall: 3, time: 12, blinks: [[0, 0.1], [0.2, 0.3]], seq: 0.4, step: 0.15, lights: 3, silence: 1.6 },
  // round 6: 3 s after E2, door out of view and >= 3 m away; after 15 s it opens in view (still >= 3 m away)
  e3: { dist: 3, wait: 3, fallback: 15, extra: (10 * Math.PI) / 180, hold: 1.2 },
  // round 6: within 2.0 m, door in the middle half of the view, >= 1.3 m from the hinge
  e4: { dist: 2.0, middle: 0.25, seen: 1, hingeClear: 1.3, reveal: 0.25, slam: 0.12, shake: 0.025, shakeTime: 0.25, darken: 0.1, vibrate: [90, 50, 140] },
  // round 6: knocking behind the staff door once it is wide: first 0.3 s after, then every 6 s, 20% louder each time, at most 2.5x the base
  knock: { delay: 0.3, every: 6, first: 1.0, grow: 1.2, max: 2.5, pos: [BACKDOOR.cx, SIDEWALK_H + 1.2, BACKDOOR.cz - 0.3] },   // just behind the staff door
  e5: { above: 0.2 },
  // round 8, P1: after E2, at the mouth of an aisle looking down it (its far end in the middle third of the view): a figure at
  // the far end, appearing as the tube flickers and gone at the next flicker 0.6 s later (that flicker is added for it)
  p1: { show: 0.6, ahead: 1.0, inside: 0.5, middle: 1 / 6, back: 0.35 },
  // round 8, P2: after E2, within 2.5 m of the television and looking at it: 0.8 s of black screen with a figure behind you on it
  p2: { dist: 2.5, middle: 1 / 6, black: 0.8 },
};
// The fluorescent tube's flicker (round 8): irregular, from a fixed seed. Flickers start 0.4-6 s apart, each 1-3 blinks of
// 0.07 s off with 0.08 s on between them (so one flicker always ends before the next can start).
export const TUBE = { seed: 20261008, gap: [0.4, 6], count: [1, 3], off: 0.07, on: 0.08, horizon: 7200 };
export const TUBE_EVENTS = (() => {
  const r = rng(TUBE.seed), ev = [];
  for (let t = lerp(TUBE.gap[0], TUBE.gap[1], r()); t < TUBE.horizon; t += lerp(TUBE.gap[0], TUBE.gap[1], r())) ev.push({ t, n: TUBE.count[0] + Math.floor(r() * (TUBE.count[1] - TUBE.count[0] + 1)) });
  return ev;
})();
const flickerIndex = (t) => { let lo = 0, hi = TUBE_EVENTS.length - 1; if (t < TUBE_EVENTS[0].t) return -1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (TUBE_EVENTS[m].t <= t) lo = m; else hi = m - 1; } return lo; };
export function tubeFlickerOff(t) {                 // the tube's own flicker: true while a blink has it off
  const i = flickerIndex(t); if (i < 0) return false;
  const e = TUBE_EVENTS[i], u = t - e.t, per = TUBE.off + TUBE.on, k = Math.floor(u / per);
  return k < e.n && u - k * per < TUBE.off;
}
export const nextFlicker = (t) => { const i = flickerIndex(t - 1e-9) + 1; return i < TUBE_EVENTS.length ? TUBE_EVENTS[i].t : Infinity; };   // the next flicker starting at or after t
// The stray dog (round 8 追加, D1-D4): comes in with E3, shakes off the rain, walks 2-3 m in, growls at the staff door,
// whimpers and runs out; in the calm version it sniffs about wagging its tail and trots out. Footprint 0.8 x 0.32 m; it
// keeps out of solids as a circle of 0.45 m (the footprint's half diagonal is 0.431 m, so a circle kept clear keeps the
// footprint clear however it is turned) and at least 1.2 m from the walker; it never blocks the walker.
export const DOG = { len: 0.8, wid: 0.32, r: 0.45, start: [STORE.door.cx, FACADE_Z + 1.2], inside: [STORE.door.cx, FACADE_Z - WALL_T - 0.5], away: [STORE.door.cx, FACADE_Z + 1.6],
  enter: 1.2, shake: 1.0, walk: 0.8, walkDist: 2.5, turn: 3.0, growl: 3.0, whimper: 0.5, run: 3.0, sniff: 2.0, trot: 2.0, keep: 1.2, flee: 2.0, giveUp: 1.8, step: 0.3, hold: 0.3,
  // round 9: blocked on its way out for 3 s, it squeezes past along the other side of the doorway (at least 0.6 m from the
  // walker); if neither side leaves that much room it lies down by the till until the doorway is clear
  blockWait: 3, squeezeKeep: 0.6, lane: 0.43, hide: [6.5, -2.0], clearDoor: 2.0 };
export const E2_DARK = HORROR.e2.seq + HORROR.e2.lights * HORROR.e2.step;     // television black and the hum off: the silence starts
export const E2_TOTAL = E2_DARK + HORROR.e2.silence;                   // everything back on
export const E4_BANG = HORROR.e4.reveal + HORROR.e4.slam;              // the door hits the frame
// Sound levels (round 8): the rain (with the rain on the tin awning), the tube's buzz, the television's snow (louder near the
// till) and the chest freezer's hum are the base; the hanging bell about 2x, the bang about 4x. In the E2 silence only the
// rain is left. `st`: { hum, tube, tv } on/off (0-1) and the walker's distances to the television and the awning.
export const AUDIO = { buzz: 0.04, snow: 0.05, freezer: 0.06, awning: 0.05, bell: 2, slam: 4, sting: 1.6, paw: 0.5, shake: 0.9, growl: 1.4, whimper: 1.0 };
export const snowNear = (d) => clamp(1 - (d - 0.8) / 5, 0.15, 1);           // television snow: full within 0.8 m, 15% from 5.8 m
export const awningNear = (d) => clamp(1 - d / 9, 0.2, 1);                  // rain on the awning: loudest under it
export function audioLevels(s, st = {}) {
  const { hum = 1, tube = 1, tv = 1, dTv = 4, dAwning = 4 } = typeof st === 'number' ? { hum: st } : st;
  const inside = smooth(0.6, 1, s), rain = MAP.volume(s), awning = AUDIO.awning * awningNear(dAwning) * Math.max(inside, 0.4);
  const buzz = AUDIO.buzz * inside * tube, snow = AUDIO.snow * inside * tv * snowNear(dTv), freezer = AUDIO.freezer * inside * hum;
  const base = rain + awning + buzz + snow + freezer;
  return { rain, awning, buzz, snow, freezer, fluor: buzz, base, bell: AUDIO.bell * base, slam: AUDIO.slam * base, sting: AUDIO.sting * base };
}
const DOOR0_EYE = [STORE.door.cx, SIDEWALK_H + DOOR_H / 2, FACADE_Z - WALL_T / 2];
const doorSound = (i) => [DOORS[i].cx, SIDEWALK_H + DOOR_H - 0.1, DOORS[i].cz];   // where a door chime comes from
const BACKDOOR_C = [BACKDOOR.cx, SIDEWALK_H + BACKDOOR.h / 2, BACKDOOR.cz];
// Opaque boxes for "can the camera see this point" (round 8, rebuilt for the wooden front): every solid, with the grocery
// front cut into its wooden pieces around the glass door and the small window (the collision walls are whole), and the
// awning. Glass is never an occluder. (Round 3's fascia and kerb boxes passed their coordinates one place off — B3 without
// its `kind` — and so occluded nothing; the wooden pieces replace them.)
export const FRONT_PIECES = (() => {
  const F = SIDEWALK_H, z0 = STORE.z1 - WALL_T, z1 = STORE.z1, d = STORE.door, dx0 = d.cx - d.w / 2, dx1 = d.cx + d.w / 2, top = STORE.h, W = WINDOW;
  return [
    B3('store:front-left', 'wall', STORE.x0 + WALL_T, 0, z0, dx0, 2.8, z1),
    B3('store:front-mid', 'wall', dx1, 0, z0, W.x0, 2.8, z1),
    B3('store:front-right', 'wall', W.x1, 0, z0, STORE.x1 - WALL_T, 2.8, z1),
    B3('store:front-sill', 'wall', W.x0, 0, z0, W.x1, W.y0, z1),
    B3('store:front-head', 'wall', W.x0, W.y1, z0, W.x1, 2.8, z1),
    B3('store:lintel', 'wall', dx0, F + DOOR_H, z0, dx1, 2.8, z1, { lift: 'store' }),
    B3('store:front-upper', 'wall', STORE.x0 + WALL_T, 2.8, z0, STORE.x1 - WALL_T, top, z1, { lift: 'store' }),
  ];
})();
const OCCLUDERS = STATIC_SOLIDS.filter((b) => !['store:front-l', 'store:front-r', 'store:lintel'].includes(b.id)).concat(FRONT_PIECES);
export const figurePointsAt = (p) => { const F = SIDEWALK_H, f = HORROR.figure;
  return [[p.x, F + 0.85, p.z], [p.x, F + f.h - 0.02, p.z], [p.x, F + 0.1, p.z], [p.x - f.bodyR, F + 0.85, p.z], [p.x + f.bodyR, F + 0.85, p.z]]; };
export const figurePoints = (spot) => figurePointsAt(HORROR.spots[spot]);
// Is any of these points on screen and not behind an opaque box? `skip` names a lifted building (roof hidden).
export function pointsVisible(cam, fov, aspect, pts, skip = null) {
  for (const q of pts) {
    const pr = project(cam, fov, aspect, q);
    if (pr.depth < 0.05 || pr.x < 0 || pr.x > 1 || pr.y < 0 || pr.y > 1) continue;
    const o = [cam.x, cam.y, cam.z], d = [q[0] - o[0], q[1] - o[1], q[2] - o[2]], L = Math.hypot(...d), u = d.map((v) => v / L);
    if (!OCCLUDERS.some((b) => !(skip && b.lift === skip) && rayBox(o, u, b) < L - 0.05)) return true;
  }
  return false;
}
// Can the camera see the figure in the staff doorway (round 7, E4)? Sight lines to its five sample points, against every
// solid (furniture, walls; glass not counted) with the back wall opened at the staff doorway the way the page draws it
// (its collision box closes the doorway), plus the staff door leaf as a thin box turned to its current angle about the hinge.
const LEAF_T = 0.04;                              // leaf thickness, as drawn
const SIGHT = OCCLUDERS.filter((b) => b.id !== 'store:back').concat([   // the back wall, opened at the staff doorway
  B3('store:back-l', 'wall', STORE.x0, 0, STORE.z0, BACKDOOR.hx, STORE.h - 0.2, STORE.z0 + WALL_T),
  B3('store:back-r', 'wall', BACKDOOR.hx + BACKDOOR.w, 0, STORE.z0, STORE.x1, STORE.h - 0.2, STORE.z0 + WALL_T),
  B3('store:back-top', 'wall', BACKDOOR.hx, SIDEWALK_H + BACKDOOR.h + 0.02, STORE.z0, BACKDOOR.hx + BACKDOOR.w, STORE.h - 0.2, STORE.z0 + WALL_T)]);
// Distance along a ray to the staff door leaf at `angle` (Infinity if missed): the ray in the leaf's own frame (x along
// the leaf from the hinge, z across it), then the usual slab test.
export function leafHit(o, u, angle) {
  const c = Math.cos(leafAngle(angle)), s = Math.sin(leafAngle(angle)), dx = o[0] - BACKDOOR.hx, dz = o[2] - BACKDOOR.hz;
  const lo = [dx * c + dz * s, o[1] - SIDEWALK_H, -dx * s + dz * c], lu = [u[0] * c + u[2] * s, u[1], -u[0] * s + u[2] * c];
  return rayBox(lo, lu, { x0: 0, x1: BACKDOOR.w, y0: 0, y1: BACKDOOR.h, z0: -LEAF_T / 2, z1: LEAF_T / 2 });
}
// One flag per sample point: on screen and nothing in between (the staff door leaf at its current angle included).
export function sightlines(cam, fov, aspect, pts, backAngle) {
  const o = [cam.x, cam.y, cam.z];
  return pts.map((q) => {
    const pr = project(cam, fov, aspect, q);
    if (pr.depth < 0.05 || pr.x < 0 || pr.x > 1 || pr.y < 0 || pr.y > 1) return false;
    const d = [q[0] - o[0], q[1] - o[1], q[2] - o[2]], L = Math.hypot(...d), u = d.map((v) => v / L);
    return !SIGHT.some((b) => rayBox(o, u, b) < L - 0.05) && !(leafHit(o, u, backAngle) < L - 0.05);
  });
}
export const figureSightlines = (cam, fov, aspect, backAngle) => sightlines(cam, fov, aspect, figurePoints('backroom'), backAngle);
// P1: where the figure stands in an aisle (its far end, facing the mouth), and which aisle the walker is looking down.
export const aisleSpot = (a) => ({ x: a.cx, z: a.zEnd + HORROR.p1.back, yaw: Math.PI });
export function aisleLook(P, backAngle = BACKDOOR.half) {
  for (const a of GROCERY.aisles) {
    if (Math.abs(P.x - a.cx) > (a.x1 - a.x0) / 2 || P.z > a.zFront + HORROR.p1.ahead || P.z < a.zFront - HORROR.p1.inside) continue;
    const q = project(P.cam, P.fov, P.aspect, [a.cx, SIDEWALK_H + 1.2, a.zEnd]);
    if (!(q.depth > 0.05 && Math.abs(q.x - 0.5) <= HORROR.p1.middle && q.y > 0 && q.y < 1)) continue;
    if (sightlines(P.cam, P.fov, P.aspect, figurePointsAt(aisleSpot(a)), backAngle).some(Boolean)) return a.i;
  }
  return -1;
}
// P2: is the walker within 2.5 m of the television, in front of its screen and looking at it?
export const TV_CENTRE = [GROCERY.tv.x, (GROCERY.tv.y0 + GROCERY.tv.y1) / 2, (GROCERY.tv.z0 + GROCERY.tv.z1) / 2];
export function tvLook(P, backAngle = BACKDOOR.half) {
  const c = TV_CENTRE;
  if (P.x >= c[0] - 0.05 || Math.hypot(P.x - c[0], P.z - c[2]) > HORROR.p2.dist) return false;
  const q = project(P.cam, P.fov, P.aspect, c);
  if (!(q.depth > 0.05 && Math.abs(q.x - 0.5) <= HORROR.p2.middle && q.y > 0 && q.y < 1)) return false;
  return sightlines(P.cam, P.fov, P.aspect, [c], backAngle)[0];
}
// Where on the black screen the figure behind the walker shows (0 = the viewer's left edge): beside the walker's own
// reflection, which sits where the walker stands along the screen.
export const tvReflectU = (x, z) => clamp((z - GROCERY.tv.z0) / (GROCERY.tv.z1 - GROCERY.tv.z0) + 0.12, 0.2, 0.8);
// ---------------- 第九轮：夜班须知、违反第 1 条、湿脚印、抬头的结局 (SPEC 夜班须知、脚印与抬头的结局) ----------------
// The note on the till (N2): its words exactly as the SPEC gives them, where it lies, and when the hint shows (within 1.5 m,
// the note in the middle half of the view across and on screen, nothing in between).
export const NOTE_TEXT = ['夜班须知', '1. 灯灭的时候，站着别动。', '2. 门自己开了，就当没看见。', '3. 不要盯着电视超过十秒。', '4. 后面那扇门有人敲，不要过去。', '5. 下班前，记得看一眼橱窗。'];
export const NOTE_CALM = ['今日特价：汽水两块'];
export const NOTE = { x: 7.24, z: -1.9, w: 0.16, l: 0.21, yaw: 0.18, near: 1.5, middle: 0.25 };
export const notePoint = () => [NOTE.x, SIDEWALK_H + 1.0 + 0.004, NOTE.z];
export function noteHint(P, backAngle = BACKDOOR.half) {
  if (!P || P.mode !== 'walk' || Math.hypot(P.x - NOTE.x, P.z - NOTE.z) > NOTE.near) return false;
  const q = project(P.cam, P.fov, P.aspect, notePoint());
  if (!(q.depth > 0.05 && Math.abs(q.x - 0.5) <= NOTE.middle && q.y > 0 && q.y < 1)) return false;
  return sightlines(P.cam, P.fov, P.aspect, [notePoint()], backAngle)[0];
}
// Rule 1 (N3): the lights go out in E2 (all three off, from the tube going out to everything back) and twice more after E3,
// 1.2 s each (both bulbs and the tube), starting between E3+15 and E3+30 s (fixed seed, at least 3 s apart, never over
// another event: one that would start during E2, P1, P2, E4 or a figure still standing waits for it). A walker who moves
// more than 0.3 m in the dark finds the figure in front of them as the light comes back: 3.0, 2.0, 1.2 m for the first,
// second, third time, for 1.2 s, gone at the next tube flicker. Standing still: only a quiet breath beside them.
export const RULE1 = { move: 0.3, dist: [3.0, 2.0, 1.2], tol: 0.2, stay: 1.2, short: 1.2, window: [15, 30], gap: 3, seed: 20261009, breath: 0.3, clear: 0.25, wait: 0.25 };
export function shortBlackouts(t3, visit = 1) {
  const r = rng(RULE1.seed + visit), span = RULE1.window[1] - RULE1.window[0] - RULE1.short, need = RULE1.short + RULE1.gap;
  const a = r() * (span - need), b = a + need + r() * (span - a - need);
  return [t3 + RULE1.window[0] + a, t3 + RULE1.window[0] + b];
}
const clearLine = (o, q, backAngle) => { const d = [q[0] - o[0], q[1] - o[1], q[2] - o[2]], L = Math.hypot(...d), u = d.map((v) => v / L);
  return !SIGHT.some((b) => rayBox(o, u, b) < L - 0.05) && !(leafHit(o, u, backAngle) < L - 0.05); };
// Where the figure stands: straight ahead along the line of sight at that distance, or the nearest spot within 30 deg and
// 0.2 m of it; on the shop floor, clear of every solid, its head on screen, the lines to its head and middle unblocked.
export function rule1Spot(P, dist, backAngle = BACKDOOR.half) {
  const fx = -Math.sin(P.cam.yaw), fz = -Math.cos(P.cam.yaw), o = [P.cam.x, P.cam.y, P.cam.z], F = SIDEWALK_H, f = HORROR.figure;
  for (const da of [0, 0.09, -0.09, 0.17, -0.17, 0.26, -0.26, 0.35, -0.35, 0.44, -0.44, 0.52, -0.52]) for (const dd of [0, -0.1, 0.1, -0.2, 0.2]) {
    const c = Math.cos(da), sn = Math.sin(da), ux = fx * c - fz * sn, uz = fx * sn + fz * c, d = dist + dd, x = P.x + d * ux, z = P.z + d * uz;
    if (!(insideInterior(x, z) && buildingAt(x, z) === STORE) || !STATIC_WALK.every((b) => boxDist(x, z, b) >= RULE1.clear)) continue;
    const head = [x, F + f.h - f.headR, z], mid = [x, F + 0.85, z];
    if (!clearLine(o, head, backAngle) || !clearLine(o, mid, backAngle)) continue;
    const q = project(P.cam, P.fov, P.aspect, head);
    if (!(q.depth > 0.05 && q.x > 0.05 && q.x < 0.95 && q.y > 0.02 && q.y < 0.98)) continue;
    return { x, z, yaw: Math.atan2(-(P.x - x), -(P.z - z)), d: Math.hypot(x - P.x, z - P.z) };
  }
  return null;
}
// Wet footprints (N4): from just inside the door to the staff door along the open floor (clear of the shelves, the till and
// the crates), bare feet, left and right in turn 0.6 m apart, one every 0.5 s from E3; each fades 20 s after it appears.
export const FOOT = { every: 0.5, step: 0.6, side: 0.1, fade: 20, fadeDur: 1.0, len: 0.25, wid: 0.1, path: [[STORE.door.cx, 0.0], [5.35, -3.2], [6.1, -6.6], [6.45, -7.85]] };
export const FOOTPRINTS = (() => {
  const P = FOOT.path, segs = [];
  let total = 0;
  for (let i = 1; i < P.length; i++) { const L = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); segs.push({ a: P[i - 1], b: P[i], L, s0: total }); total += L; }
  const out = [];
  for (let i = 0; i * FOOT.step <= total + 1e-9; i++) {
    const s = i * FOOT.step, g = segs.find((q) => s <= q.s0 + q.L + 1e-9) || segs[segs.length - 1], dx = (g.b[0] - g.a[0]) / g.L, dz = (g.b[1] - g.a[1]) / g.L;
    const side = i % 2 === 0 ? -1 : 1, u = s - g.s0;                       // left foot first; (-dz, dx) points to the right
    out.push({ i, x: g.a[0] + dx * u + side * FOOT.side * -dz, z: g.a[1] + dz * u + side * FOOT.side * dx, yaw: Math.atan2(-dx, -dz), foot: side < 0 ? 'L' : 'R', dt: i * FOOT.every });
  }
  return out;
})();
export const FOOT_ARRIVE = FOOTPRINTS[FOOTPRINTS.length - 1].dt;           // the last print (at the staff door), after E3
export const footAlpha = (age) => (age < 0 ? 0 : age < FOOT.fade ? 1 : Math.max(0, 1 - (age - FOOT.fade) / FOOT.fadeDur));
// The ending (N5): a visit with E4 in it leaves the figure behind the window as E5 does; once it has been on screen for 2 s
// running, its head turns and lifts onto the camera over 1.5 s and then follows the camera; the body turns after it at
// 0.5 rad/s. Without E4 it stays as it is, its back to the street.
export const ENDING = { see: 2.0, turn: 1.5, body: 0.5 };
export const endHeadPoint = () => { const sp = HORROR.spots.window; return [sp.x, SIDEWALK_H + HORROR.figure.h - HORROR.figure.headR, sp.z]; };
const angleTo = (cam, p) => { const { f } = basis(cam.yaw, cam.pitch), d = [p[0] - cam.x, p[1] - cam.y, p[2] - cam.z], L = Math.hypot(...d); return Math.acos(clamp((f[0] * d[0] + f[1] * d[1] + f[2] * d[2]) / L, -1, 1)); };
function createHorror(S, calm) {
  const blank = () => ({ E0: null, E1: null, E2: null, E3: null, E4: null, E5: null, P1: null, P2: null, R1: null, END: null });
  const fresh = () => ({ E2: false, E3: false, E4: false, P1: false, P2: false, dog: false });
  const H = { calm, visit: 0, figure: calm ? null : 'counter', fired: blank(), done: fresh(), e0: null, e2: null, e3: null, e4: null, wideAt: null, e5Plan: null, e5Dark: null,
    c2: null, c3: null, p1: null, p1arm: null, p2: null, dog: null, lastP: null,
    blk: [], r1: { n: 0, fig: null, log: [] }, foot0: null, footNext: 0, end: null,   // round 9: blackouts, rule-1 figures, footprints, the ending
    walked: 0, inside: 0, last: null, knock: null, sounds: [], vibes: [], history: [] };
  const fire = (name, t) => { H.fired[name] = t; H.history.push({ e: name, t, visit: H.visit }); };
  const backAngle = (t) => {
    if (H.e4 && t >= H.e4.t0 + HORROR.e4.reveal) return BACKDOOR.wide * Math.max(0, 1 - (t - H.e4.t0 - HORROR.e4.reveal) / HORROR.e4.slam);
    return H.wideAt !== null && t >= H.wideAt ? BACKDOOR.wide : BACKDOOR.half;
  };
  const dark = (b, t) => b && t >= b.start && t < b.end;
  const light = (t) => (dark(H.e0, t) || dark(H.e5Dark, t) ? HORROR.e0.level : 1);
  // round 8 lights: two bulbs and the tube; E2 puts them out one by one (after two tube blinks), the tube also flickers on
  // its own and once more for P1; the television's snow and the freezer's hum stop in the E2 silence
  const e2Off = (i, t) => !!(H.e2 && t >= H.e2.t0 + HORROR.e2.seq + i * HORROR.e2.step && t < H.e2.t0 + E2_TOTAL);
  const e2Blink = (t) => !!(H.e2 && HORROR.e2.blinks.some(([a, b]) => t >= H.e2.t0 + a && t < H.e2.t0 + b));
  const p1Blink = (t) => !!(H.p1 && t >= H.p1.t1 && t < H.p1.t1 + TUBE.off);
  const silent = (t) => !!(H.e2 && t >= H.e2.t0 + E2_DARK && t < H.e2.t0 + E2_TOTAL);
  // round 9: the two short blackouts after E3 (both bulbs and the tube), the dark spells rule 1 is about, the figure it brings
  const shortOff = (t) => H.blk.some((b) => b.kind === 'short' && b.begun && t >= b.start && t < b.end);
  const blackoutNow = (t) => H.blk.some((b) => (b.kind === 'e2' || b.begun) && t >= b.start && t < b.end);
  const rule1Fig = (t) => { const f = H.r1.fig; return f && t >= f.t0 && t < f.t1 ? f : null; };
  const busy = (t) => !!((H.e2 && t >= H.e2.t0 && t < H.e2.t0 + E2_TOTAL) || (H.p1 && t >= H.p1.t0 && t < H.p1.t1 + TUBE.off) || (H.p2 && t >= H.p2.t0 && t < H.p2.t1)
    || (H.e4 && t >= H.e4.t0 && t < H.e4.bang + HORROR.e4.shakeTime) || rule1Fig(t) || blackoutNow(t));
  const bulbs = (t) => [0, 1].map((i) => (e2Off(i, t) || shortOff(t) ? 0 : 1) * light(t));
  const tubeOff = (t) => e2Off(2, t) || e2Blink(t) || tubeFlickerOff(t) || p1Blink(t) || shortOff(t);
  const tube = (t) => (tubeOff(t) ? 0 : 1) * light(t);
  const hum = (t) => (silent(t) ? 0 : 1);
  const p2On = (t) => !!(H.p2 && t >= H.p2.t0 && t < H.p2.t1);
  const tv = (t) => ({ snow: silent(t) || p2On(t) ? 0 : 1, reflect: p2On(t), u: H.p2 ? H.p2.u : 0.5, level: light(t) });
  const aisleFigure = (t) => (H.p1 && t >= H.p1.t0 && t < H.p1.t1 ? H.p1.aisle : null);
  // round 9: the footprints shown at t (with how faded each is), the newest, and whether the trail has reached the staff door
  const footprints = (t) => (H.foot0 === null ? [] : FOOTPRINTS.filter((f) => t >= H.foot0 + f.dt - 1e-9).map((f) => ({ ...f, at: H.foot0 + f.dt, alpha: footAlpha(t - H.foot0 - f.dt) })).filter((f) => f.alpha > 0));
  const newestFoot = (t) => { if (H.foot0 === null) return null; let n = null; for (const f of FOOTPRINTS) if (t >= H.foot0 + f.dt - 1e-9) n = f; return n; };
  const footArrived = (t) => H.foot0 !== null && t >= H.foot0 + FOOT_ARRIVE - 1e-9;
  const endPose = () => (H.end && H.figure === 'window' ? { armed: H.end.armed, looking: H.end.t0 !== null, t0: H.end.t0, bodyYaw: H.end.bodyYaw, headYaw: H.end.headYaw, pitch: H.end.pitch, headRel: wrapAngle(H.end.headYaw - H.end.bodyYaw), target: H.end.target && { ...H.end.target } } : null);
  const scare = (t) => !!(H.e4 && t >= H.e4.t0 && t < H.e4.t0 + E4_BANG);
  const shake = (t) => {
    const u = H.e4 ? t - H.e4.t0 - E4_BANG : -1;
    if (u < 0 || u >= HORROR.e4.shakeTime) return [0, 0, 0];
    const a = HORROR.e4.shake * (1 - u / HORROR.e4.shakeTime);
    return [a * Math.sin(2 * Math.PI * 26 * u), 0.6 * a * Math.sin(2 * Math.PI * 33 * u + 1.3), 0];
  };
  const darken = (t) => { const u = H.e4 ? t - H.e4.t0 - E4_BANG : -1; return u >= 0 && u < HORROR.e4.darken ? 1 : 0; };
  // the store door opening by itself (E3; in the calm version the same moment opens it for the dog, without an E3)
  const startE3 = (t, k0, inView = false) => {
    const holdEnd = t + (1 - k0) / DOOR_SPEED + HORROR.e3.hold, w = { t0: t, k0, holdEnd, closedAt: holdEnd + 1 / DOOR_SPEED, inView };
    if (H.calm) H.c3 = w; else {
      H.e3 = w; H.done.E3 = true; fire('E3', t);
      H.foot0 = t; H.footNext = 0;                    // round 9: wet footprints from the door, as the dog comes in
      for (const st of shortBlackouts(t, H.visit)) H.blk.push({ kind: 'short', start: st, end: st + RULE1.short, begun: false, moved: 0, last: null, done: false, breathed: false });
    }
    startDog(t);
  };
  const startE4 = (t, seen = null) => {
    H.e4 = { t0: t, bang: t + E4_BANG, seen }; H.done.E4 = true; fire('E4', t);
    H.sounds.push({ kind: 'slam', t: t + E4_BANG, pos: BACKDOOR_C.slice() }, { kind: 'sting', t: t + E4_BANG, pos: BACKDOOR_C.slice() });
    H.vibes.push({ t: t + E4_BANG, pattern: HORROR.e4.vibrate.slice() });
  };
  // ---------------- the dog ----------------
  const door3 = () => H.e3 || H.c3;
  // the store door's openness from the scripted openings alone (the walker can only open it further): for the dog's collisions
  const doorK = (t) => {
    let k = 0;
    const w = door3();
    if (w && t >= w.t0) k = t <= w.holdEnd ? Math.min(1, w.k0 + DOOR_SPEED * (t - w.t0)) : Math.max(0, 1 - DOOR_SPEED * (t - w.holdEnd));
    const d = H.dog;
    if (d && d.exitOpen !== null && t >= d.exitOpen) {
      const end = d.exitEnd === null ? Infinity : d.exitEnd;
      k = Math.max(k, t <= end ? Math.min(1, d.exitK0 + DOOR_SPEED * (t - d.exitOpen)) : Math.max(0, 1 - DOOR_SPEED * (t - end)));
    }
    return k;
  };
  // walls, shelves, crates, the closed doorway, and the store door's two sliding leaves where the scripted opening has put them
  // (the walker can only open it further)
  const dogBoxes = (t) => {
    const b = STATIC_WALK.slice(), k = doorK(t);
    if (k < DOOR_PASS) { const d = DOORS[0]; b.push([d.x0, d.z0, d.x1, d.z1]); }
    for (const l of doorLeaves(DOORS.map((_, i) => ({ k: i === 0 ? k : 1 })))) if (l.door === 0) b.push([l.x0, l.z0, l.x1, l.z1]);
    return b;
  };
  const dogClear = (x, z, r = DOG.r) => STATIC_WALK.every((b) => boxDist(x, z, b) >= r);
  const toYaw = (dx, dz) => Math.atan2(-dx, -dz);
  const doorYaw = (d) => toYaw(BACKDOOR.cx - d.x, BACKDOOR.cz - d.z);
  // round 9: it growls at the newest wet footprint (the staff door when there are none, as in the calm version)
  const lookYaw = (d, t) => { const f = newestFoot(t); return f ? toYaw(f.x - d.x, f.z - d.z) : doorYaw(d); };
  const turnTo = (d, want, dt) => { const err = wrapAngle(want - d.yaw), step = DOG.turn * dt; return Math.abs(err) <= step ? want : d.yaw + Math.sign(err) * step; };
  function startDog(t) {
    H.dog = { t0: t, phase: 'enter', pt: t, x: DOG.start[0], z: DOG.start[1], yaw: 0, dist: 0, nextPaw: t + 0.12, stop: null, exitOpen: null, exitK0: 0, exitEnd: null, closedAt: null, goneAt: null,
      log: [{ phase: 'enter', t, x: DOG.start[0], z: DOG.start[1] }], calm: H.calm, minGap: Infinity };
    H.done.dog = true;
  }
  const dogPhase = (d, ph, t) => { d.phase = ph; d.pt = t; d.log.push({ phase: ph, t, x: d.x, z: d.z }); };
  const dogSound = (d, kind, t, extra = {}) => H.sounds.push({ kind, t, pos: [d.x, SIDEWALK_H + 0.4, d.z], ...extra });
  // 2-3 m into the shop from just inside the door, as far from the walker as it can, on a clear straight line
  function chooseStop(d) {
    const w = H.lastP || [d.x, d.z - 10];
    let best = null;
    for (const th of [0, 0.35, -0.35, 0.6, -0.6]) {
      const x = d.x + DOG.walkDist * Math.sin(th), z = d.z - DOG.walkDist * Math.cos(th);
      let ok = true;
      for (let k = 1; k <= 10 && ok; k++) ok = dogClear(d.x + (x - d.x) * k / 10, d.z + (z - d.z) * k / 10);
      if (!ok) continue;
      const score = Math.min(3, Math.hypot(x - w[0], z - w[1])) - 0.2 * Math.abs(th);
      if (!best || score > best.score) best = { x, z, score };
    }
    return best ? [best.x, best.z] : [d.x, d.z - DOG.walkDist];
  }
  function openExit(d, t) { d.exitOpen = t; d.exitK0 = doorK(t); }
  // the other side of the doorway from the walker, 0.43 m off its middle: the way there, through it and out, if every point
  // of it stays clear of solids and the door's leaves and at least 0.6 m (+0.05) from where the walker stands
  function squeezeWay(d, t) {
    const w = H.lastP, cx = STORE.door.cx, lx = cx + (w[0] < cx ? 1 : -1) * DOG.lane, boxes = dogBoxes(t);
    const way = [[lx, Math.min(d.z, DOG.inside[1] - 0.5)], [lx, FACADE_Z + 0.7], DOG.away];
    let a = [d.x, d.z];
    for (const b of way) {
      const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.1));
      for (let k = 1; k <= n; k++) { const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n; if (Math.hypot(x - w[0], z - w[1]) < DOG.squeezeKeep + 0.05 || !boxes.every((q) => boxDist(x, z, q) >= DOG.r - 1e-9)) return null; }
      a = b;
    }
    return way.map((q) => q.slice());
  }
  // the doorway is clear: the walker is 2 m or more from it and the way there and out keeps 1.2 m from them
  function doorClear(d) {
    const w = H.lastP;
    if (Math.hypot(w[0] - DOG.inside[0], w[1] - DOG.inside[1]) < DOG.clearDoor) return false;
    let a = [d.x, d.z];
    for (const b of [DOG.inside, DOG.away]) { for (let k = 1; k <= 20; k++) { const x = a[0] + (b[0] - a[0]) * k / 20, z = a[1] + (b[1] - a[1]) * k / 20; if (Math.hypot(x - w[0], z - w[1]) < DOG.keep) return false; } a = b; }
    return true;
  }
  function dogStep(t) {
    const d = H.dog;
    if (!d || d.goneAt !== null) return;
    const dt = HORROR.tick, calmDog = d.calm;
    let target = null, sp = 0, lockYaw = null;
    const near = (p, e = 0.06) => Math.hypot(p[0] - d.x, p[1] - d.z) < e;
    switch (d.phase) {
      case 'enter':
        target = DOG.inside; sp = DOG.enter;
        if (near(DOG.inside)) { dogPhase(d, 'shake', t); dogSound(d, 'shake', t); }
        break;
      case 'shake':
        if (t - d.pt >= DOG.shake) { d.stop = chooseStop(d); dogPhase(d, 'walk', t); }
        break;
      case 'walk':
        target = d.stop; sp = DOG.walk;
        if (near(d.stop)) dogPhase(d, 'turn', t);
        break;
      case 'turn': {
        const want = lookYaw(d, t), err = wrapAngle(want - d.yaw), step = DOG.turn * dt;
        d.yaw = Math.abs(err) <= step ? want : d.yaw + Math.sign(err) * step;
        lockYaw = d.yaw;
        if (Math.abs(wrapAngle(want - d.yaw)) < 1e-6) { dogPhase(d, calmDog ? 'sniff' : 'growl', t); if (!calmDog) dogSound(d, 'growl', t, { dur: DOG.growl }); }
        break;
      }
      case 'growl':
        lockYaw = turnTo(d, lookYaw(d, t), dt);
        if (t - d.pt >= DOG.growl) { dogPhase(d, 'whimper', t); dogSound(d, 'whimper', t); openExit(d, t); }
        break;
      case 'whimper':
        lockYaw = turnTo(d, lookYaw(d, t), dt);
        if (t - d.pt >= DOG.whimper) dogPhase(d, 'out', t);
        break;
      case 'sniff':
        if (t - d.pt >= DOG.sniff) { openExit(d, t); dogPhase(d, 'out', t); }
        break;
      case 'out':
        sp = calmDog ? DOG.trot : DOG.run;
        if (!d.lined && near(DOG.inside, 0.15)) d.lined = true;   // first back to just inside the door, then straight out
        target = d.lined ? DOG.away : DOG.inside;
        if (d.exitEnd === null && d.z > FACADE_Z + DOG.r + 0.05) { d.exitEnd = t + DOG.hold; d.closedAt = d.exitEnd + 1 / DOOR_SPEED; }
        if (near(DOG.away, 0.08)) { d.goneAt = t; d.log.push({ phase: 'gone', t, x: d.x, z: d.z }); return; }
        break;
      case 'squeeze':                                  // round 9: past the walker along the other side of the doorway
        sp = DOG.trot;
        while (d.way.length > 1 && near(d.way[0], 0.1)) d.way.shift();
        target = d.way[0];
        if (d.exitEnd === null && d.z > FACADE_Z + DOG.r + 0.05) { d.exitEnd = t + DOG.hold; d.closedAt = d.exitEnd + 1 / DOOR_SPEED; }
        if (near(DOG.away, 0.08)) { d.goneAt = t; d.log.push({ phase: 'gone', t, x: d.x, z: d.z }); return; }
        break;
      case 'hide':                                     // round 9: lying by the till until the doorway is clear
        if (!near(DOG.hide, 0.08)) { target = DOG.hide; sp = DOG.trot; }
        else if (H.lastP && doorClear(d)) { d.lined = false; d.blocked = 0; d.prog = null; dogPhase(d, 'out', t); }
        break;
    }
    // where it wants to go; a walker coming closer than 1.8 m makes it give up and leave, and closer than 2 m it runs: of 16
    // directions, the clear one (0.5 m ahead) that puts the most room between them, leaning towards the way out
    let vx = 0, vz = 0;
    if (target) { const dx = target[0] - d.x, dz = target[1] - d.z, L = Math.hypot(dx, dz); if (L > 1e-9) { const v = Math.min(sp, L / dt); vx = (dx / L) * v; vz = (dz / L) * v; } }
    const w = H.lastP;
    // round 9: on its way out (or squeezing past), no headway for 3 s with the walker within 2 m: try the other side of the
    // doorway, else lie down by the till
    if (w && target && (d.phase === 'out' || d.phase === 'squeeze')) {
      const dT = Math.hypot(target[0] - d.x, target[1] - d.z);
      if (!d.prog) d.prog = { t, dist: dT };
      else if (t - d.prog.t >= 0.5 - 1e-9) {
        const stuck = d.prog.dist - dT < 0.1 && Math.hypot(d.x - w[0], d.z - w[1]) < DOG.flee;
        d.blocked = stuck ? (d.blocked || 0) + (t - d.prog.t) : 0; d.prog = { t, dist: dT };
      }
      if ((d.blocked || 0) >= DOG.blockWait - 1e-9) {
        d.blocked = 0; d.prog = null;
        const way = d.phase === 'out' ? squeezeWay(d, t) : null;
        if (way) { d.way = way; dogPhase(d, 'squeeze', t); } else dogPhase(d, 'hide', t);
        return;
      }
    }
    const squeezing = d.phase === 'squeeze', keep = squeezing ? DOG.squeezeKeep + 0.15 : DOG.keep + 0.4;
    if (w) {
      const ex = d.x - w[0], ez = d.z - w[1], de = Math.hypot(ex, ez);
      d.minGap = Math.min(d.minGap, de);
      if (de < DOG.giveUp && ['enter', 'shake', 'walk', 'turn', 'growl', 'sniff'].includes(d.phase)) {
        if (calmDog) { openExit(d, t); dogPhase(d, 'out', t); } else { dogPhase(d, 'whimper', t); dogSound(d, 'whimper', t); openExit(d, t); }
      }
      if (de < DOG.flee && !squeezing && !(d.phase === 'hide' && de >= DOG.keep)) {   // going to lie down it only runs from a walker inside 1.2 m
        const boxes = dogBoxes(t), out = d.lined || d.z > DOG.inside[1] ? DOG.away : DOG.inside, ox = out[0] - d.x, oz = out[1] - d.z, oL = Math.hypot(ox, oz) || 1;
        let best = null;
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * 2 * Math.PI, ux = Math.cos(a), uz = Math.sin(a), q = { x: d.x + ux * 0.5, z: d.z + uz * 0.5 };
          if (!boxes.every((b) => boxDist(q.x, q.z, b) >= DOG.r - 1e-9)) continue;
          const score = Math.hypot(q.x - w[0], q.z - w[1]) + 0.6 * (ux * ox + uz * oz) / oL;
          if (!best || score > best.score) best = { ux, uz, score };
        }
        if (best) { const k = clamp((DOG.flee - de) / (DOG.flee - DOG.keep - 0.3), 0, 1); vx = vx * (1 - k) + best.ux * DOG.run * k; vz = vz * (1 - k) + best.uz * DOG.run * k; }
      }
      // and within 1.6 m it never takes a step towards the walker: it goes round, or waits (a walker standing in the doorway
      // keeps it in until they move)
      if (de < keep && de > 1e-9) { const ux = ex / de, uz = ez / de, toward = -(vx * ux + vz * uz); if (toward > 0) { vx += toward * ux; vz += toward * uz; } }
    }
    if (vx || vz) {
      const p = { x: d.x + vx * dt, z: d.z + vz * dt };
      resolveCircle(p, dogBoxes(t), DOG.r);
      const mx = p.x - d.x, mz = p.z - d.z, moved = Math.hypot(mx, mz);
      d.x = p.x; d.z = p.z; d.dist += moved;
      if (lockYaw === null && moved > 1e-5) { const want = toYaw(mx, mz), err = wrapAngle(want - d.yaw), step = 8 * dt; d.yaw += Math.abs(err) <= step ? err : Math.sign(err) * step; }
      if (moved > 1e-5 && t >= d.nextPaw && d.phase !== 'growl' && d.phase !== 'whimper') { dogSound(d, 'paw', t); d.nextPaw = t + (moved / dt > 1.5 ? 0.14 : 0.28); }
    }
    if (lockYaw !== null) d.yaw = lockYaw;
  }
  const dogView = (t) => {
    const d = H.dog;
    if (!d || d.goneAt !== null) return null;
    const ph = d.phase, u = t - d.pt;
    const lying = ph === 'hide' && Math.hypot(d.x - DOG.hide[0], d.z - DOG.hide[1]) < 0.1;
    return { x: d.x, z: d.z, yaw: d.yaw, phase: ph, legs: d.dist / 0.32 * Math.PI, crouch: ph === 'growl' ? Math.min(1, u / 0.3) : ph === 'whimper' ? 0.6 : lying ? 1 : ph === 'squeeze' ? 0.4 : 0,
      tail: ph === 'growl' || ph === 'whimper' || ph === 'hide' || ph === 'squeeze' || (ph === 'out' && !d.calm) ? 'tuck' : d.calm ? 'wag' : 'up', lying, shake: ph === 'shake' ? u : null, sniff: ph === 'sniff', calm: d.calm };
  };
  // round 9, rule 1: the short blackouts begin (or wait for whatever is on), the walker's steps in the dark are added up, and
  // as each dark spell ends a walker who moved > 0.3 m gets the figure ahead of them; one who stood still, a breath
  function rule1Step(t, P) {
    for (const b of H.blk) {
      if (b.kind === 'short' && !b.begun && t >= b.start - 1e-9) { if (busy(t)) { b.start = t + RULE1.wait; b.end = b.start + RULE1.short; } else { b.begun = true; b.start = t; b.end = t + RULE1.short; } }
      if (!b.begun || b.done || t < b.start - 1e-9) continue;
      if (t < b.end - 1e-9) {
        const step = b.last ? Math.hypot(P.x - b.last[0], P.z - b.last[1]) : 0;
        if (step < 0.05) b.moved += step;           // a jump (the test hook) is not a step
        b.last = [P.x, P.z];
        if (!b.breathed && t >= b.end - RULE1.breath - 1e-9) {
          b.breathed = true;
          if (b.moved <= RULE1.move) { const bx = P.x + 0.35 * Math.sin(P.cam.yaw), bz = P.z + 0.35 * Math.cos(P.cam.yaw); H.sounds.push({ kind: 'breath', t, pos: [bx, SIDEWALK_H + 1.5, bz] }); }
        }
        continue;
      }
      b.done = true;
      const entry = { kind: b.kind, start: b.start, end: b.end, moved: b.moved, figure: null };
      if (b.moved > RULE1.move && H.r1.n < RULE1.dist.length) {
        const sp = rule1Spot(P, RULE1.dist[H.r1.n], backAngle(t));
        if (sp) { H.r1.n++; H.r1.fig = { ...sp, n: H.r1.n, want: RULE1.dist[H.r1.n - 1], t0: b.end, t1: nextFlicker(b.end + RULE1.stay) }; entry.figure = { ...H.r1.fig }; fire('R1', b.end); }
        else entry.blocked = true;
      }
      H.r1.log.push(entry);
    }
  }
  // round 9, the ending: after a visit with E4, once the figure behind the window has been on screen 2 s running
  function endStep(t, P) {
    const E = H.end;
    if (!E || !E.armed || H.figure !== 'window') return;
    const head = endHeadPoint();
    if (E.t0 === null) {
      E.seen = pointsVisible(P.cam, P.fov, P.aspect, figurePoints('window'), P.lift) ? E.seen + HORROR.tick : 0;
      if (E.seen < ENDING.see - 1e-9) return;
      E.t0 = t; H.sounds.push({ kind: 'drone', t, pos: head.slice() }); fire('END', t);
    }
    const dx = P.cam.x - head[0], dy = P.cam.y - head[1], dz = P.cam.z - head[2], ty = Math.atan2(-dx, -dz), tp = Math.atan2(dy, Math.hypot(dx, dz)), k = smooth(0, ENDING.turn, t - E.t0);
    E.target = { yaw: ty, pitch: tp };
    E.headYaw = HORROR.spots.window.yaw + wrapAngle(ty - HORROR.spots.window.yaw) * k; E.pitch = tp * k;
    const err = wrapAngle(ty - E.bodyYaw), stepB = ENDING.body * HORROR.tick; E.bodyYaw += Math.abs(err) <= stepB ? err : Math.sign(err) * stepB;
  }
  function evalAt(t, P, kAt) {
    if (H.e0 && !H.e0.done && t >= H.e0.removeAt - 1e-9) { H.figure = null; H.end = null; H.e0.done = true; fire('E0', H.e0.removeAt); }
    if (P.mode !== 'walk') H.last = null;
    if (P.mode === 'walk') {
      H.lastP = [P.x, P.z];
      const e2 = HORROR.e2, inStore = insideInterior(P.x, P.z) && buildingAt(P.x, P.z) === STORE;
      if (inStore) {
        const d = H.last ? Math.hypot(P.x - H.last[0], P.z - H.last[1]) : 0;
        if (d < 0.05) H.walked += d;                   // a jump (the test hook that puts the walker somewhere) is not walking
        H.inside += HORROR.tick;
      }
      H.last = [P.x, P.z];
      if (!H.calm) rule1Step(t, P);
      const t2 = H.calm ? H.c2 : H.e2 && H.e2.t0;    // the calm version keeps the same clock for the dog, without E2 itself
      if ((t2 === null || t2 === undefined) && inStore) {
        const why = { walk: H.walked >= e2.walk, wall: P.z - (STORE.z0 + WALL_T) <= e2.wall, time: H.inside >= e2.time - 1e-9 };
        if (why.walk || why.wall || why.time) {
          if (H.calm) H.c2 = t;
          else {
            H.e2 = { t0: t, why, walked: H.walked, inside: H.inside }; H.done.E2 = true; fire('E2', t);
            H.blk.push({ kind: 'e2', start: t + HORROR.e2.seq + (HORROR.e2.lights - 1) * HORROR.e2.step, end: t + E2_TOTAL, begun: true, moved: 0, last: null, done: false, breathed: false });   // round 9: all three lights out
          }
        }
      }
      const s2 = H.calm ? H.c2 : H.e2 && H.e2.t0, e2end = s2 !== null && s2 !== undefined ? s2 + E2_TOTAL : Infinity;
      if (e2end < Infinity && !door3() && t >= e2end + HORROR.e3.wait - 1e-9 && Math.hypot(P.x - DOOR0_EYE[0], P.z - DOOR0_EYE[2]) >= HORROR.e3.dist) {
        const unseen = angleTo(P.cam, DOOR0_EYE) > rad(P.hfov / 2) + HORROR.e3.extra;
        if (unseen || t >= e2end + HORROR.e3.fallback - 1e-9) startE3(t, kAt(t), !unseen);
      }
      if (!H.calm) {
        // P1: down an aisle, at the next tube flicker (it must still be looking down the same aisle then)
        if (H.e2 && !H.done.P1 && t >= e2end - 1e-9 && !blackoutNow(t)) {
          const a = aisleLook(P, backAngle(t));
          if (H.p1arm) {
            if (t >= H.p1arm.at - 1e-9) {
              if (a === H.p1arm.aisle) { H.p1 = { t0: H.p1arm.at, t1: H.p1arm.at + HORROR.p1.show, aisle: a }; H.done.P1 = true; fire('P1', H.p1arm.at); }
              H.p1arm = null;
            } else if (a !== H.p1arm.aisle) H.p1arm = null;
          } else if (a >= 0) H.p1arm = { aisle: a, at: nextFlicker(t) };
        }
        // P2: the television goes black with a figure behind you on it
        if (H.e2 && !H.done.P2 && t >= e2end - 1e-9 && !blackoutNow(t) && tvLook(P, backAngle(t))) {
          H.p2 = { t0: t, t1: t + HORROR.p2.black, u: tvReflectU(P.x, P.z) }; H.done.P2 = true; fire('P2', t);
        }
        // the staff door swings wide unseen, never into the walker, and only once the dog has gone and the door is shut, and
        // (round 9) the wet footprints have reached it
        const dogGone = !H.dog || (H.dog.closedAt !== null && t >= H.dog.closedAt - 1e-9);
        if (H.e3 && H.wideAt === null && dogGone && footArrived(t) && t >= H.e3.closedAt - 1e-9 && angleTo(P.cam, BACKDOOR_C) > rad(P.hfov / 2) + HORROR.e3.extra
          && Math.hypot(P.x - BACKDOOR.hx, P.z - BACKDOOR.hz) >= HORROR.e4.hingeClear) { H.wideAt = t; H.knock = { next: t + HORROR.knock.delay, mult: HORROR.knock.first }; }
        if (H.wideAt !== null && !H.done.E4 && !blackoutNow(t) && Math.hypot(P.x - BACKDOOR.cx, P.z - BACKDOOR.cz) <= HORROR.e4.dist && Math.hypot(P.x - BACKDOOR.hx, P.z - BACKDOOR.hz) >= HORROR.e4.hingeClear) {
          const q = project(P.cam, P.fov, P.aspect, BACKDOOR_C);
          if (q.depth > 0.05 && Math.abs(q.x - 0.5) <= HORROR.e4.middle && q.y > 0 && q.y < 1) {
            const seen = figureSightlines(P.cam, P.fov, P.aspect, backAngle(t)).filter(Boolean).length;   // round 7: the figure must be in sight
            if (seen >= HORROR.e4.seen) startE4(t, seen);
          }
        }
      }
    }
    dogStep(t);
    if (H.calm) return;
    // round 9: the footprints' wet steps, each at its print; the knocking starts by E3+20 s at the latest
    while (H.foot0 !== null && H.footNext < FOOTPRINTS.length && t >= H.foot0 + FOOTPRINTS[H.footNext].dt - 1e-9) {
      const f = FOOTPRINTS[H.footNext++]; H.sounds.push({ kind: 'wetstep', t: H.foot0 + f.dt, pos: [f.x, SIDEWALK_H + 0.02, f.z], foot: f.foot });
    }
    if (H.e3 && !H.knock && !H.done.E4 && P.mode === 'walk' && t >= H.e3.t0 + 20 - 1e-9) H.knock = { next: t, mult: HORROR.knock.first, late: true };
    if (P.mode !== 'walk') endStep(t, P);
    // knocking behind the wide staff door until E4 (stops when the visit ends)
    while (H.knock && !H.done.E4 && t >= H.knock.next - 1e-9) {
      H.sounds.push({ kind: 'knock', t: H.knock.next, mult: H.knock.mult, pos: HORROR.knock.pos.slice() });
      H.knock.mult = Math.min(HORROR.knock.max, H.knock.mult * HORROR.knock.grow); H.knock.next += HORROR.knock.every;
    }
    // E5, planned when the exit starts (see onExitStart): placed unseen, or in a 0.35 s blackout when no such moment exists.
    if (H.e5Plan && !H.e5Plan.done && t >= H.e5Plan.at - 1e-9) {
      H.e5Plan.done = true;
      if (H.e5Plan.dark) H.e5Dark = { start: H.e5Plan.at, end: H.e5Plan.at + HORROR.e0.dark, placeAt: H.e5Plan.at + HORROR.e0.dark / 2, done: false };
      else { H.figure = 'window'; fire('E5', H.e5Plan.at); }
    }
    if (H.e5Dark && !H.e5Dark.done && t >= H.e5Dark.placeAt - 1e-9) { H.figure = 'window'; H.e5Dark.done = true; fire('E5', H.e5Dark.placeAt); }
  }
  return {
    H, backAngle, light, bulbs, tube, tv, hum, aisleFigure, dogView, doorK, scare, shake, darken, footprints, newestFoot, footArrived, rule1Fig, blackoutNow, endPose,
    onEnterStart(t) {
      H.visit++; H.fired = blank(); H.done = fresh(); H.e2 = H.e3 = H.e4 = null; H.wideAt = null; H.e5Plan = null; H.e5Dark = null;
      H.c2 = H.c3 = null; H.p1 = H.p1arm = H.p2 = null; H.dog = null;
      H.blk = []; H.r1 = { n: 0, fig: null, log: [] }; H.foot0 = null; H.footNext = 0;
      H.walked = 0; H.inside = 0; H.last = null; H.knock = null;
      H.e0 = !H.calm && H.figure ? { start: t + HORROR.e0.delay, end: t + HORROR.e0.delay + HORROR.e0.dark, removeAt: t + HORROR.e0.delay + HORROR.e0.dark / 2, done: false } : null;
    },
    // The exit path is fixed once it starts, so E5 looks ahead along it on the same tick grid: the first tick above the
    // roofs at which the camera cannot see the spot behind the window. If the camera sees that spot all the way up
    // (leaving while facing the shop from across the street), the shop lights cut for 0.35 s at the first tick above the
    // roofs, as in E0, and the figure is placed in the dark.
    onExitStart(t0, poseAt, dur) {
      H.e5Plan = null; H.e5Dark = null; H.knock = null; H.dog = null; H.p1arm = null;
      H.blk = H.blk.filter((b) => b.done); H.r1.fig = null;                 // round 9: no dark spells or figures once you are leaving
      H.end = !H.calm && H.done.E4 && H.done.E2 ? { armed: true, seen: 0, t0: null, bodyYaw: HORROR.spots.window.yaw, headYaw: HORROR.spots.window.yaw, pitch: 0, target: null } : { armed: false, seen: 0, t0: null, bodyYaw: HORROR.spots.window.yaw, headYaw: HORROR.spots.window.yaw, pitch: 0, target: null };
      if (H.calm || !H.done.E2 || !poseAt) return;
      let firstAbove = null;
      for (let k = Math.floor(t0 / HORROR.tick + 1e-6) + 1; k * HORROR.tick <= t0 + dur + 1e-9; k++) {
        const t = k * HORROR.tick, P = poseAt(t);
        if (P.cam.y <= STORE.h + HORROR.e5.above || P.lift) continue;   // above the roofs, and every roof back in place
        if (firstAbove === null) firstAbove = t;
        if (!pointsVisible(P.cam, P.fov, P.aspect, figurePoints('window'), P.lift)) { H.e5Plan = { at: t, dark: false, done: false }; return; }
      }
      if (firstAbove !== null) H.e5Plan = { at: firstAbove, dark: true, done: false };
    },
    onExitFinish() { H.done = fresh(); H.e2 = H.e3 = H.e4 = null; H.wideAt = null; H.c2 = H.c3 = null; H.p1 = H.p2 = null; },
    advance(t0, t1, poseAt, kAt) { for (let k = Math.floor(t0 / HORROR.tick + 1e-6) + 1; k * HORROR.tick <= t1 + 1e-9; k++) { const t = k * HORROR.tick; evalAt(t, poseAt(Math.min(t, t1)), kAt); } },
    // the store door's scripted openings: E3 (or the calm version's same moment for the dog), then once more for the dog leaving
    doorOverride: () => {
      const w = door3(), out = [];
      if (w) out.push([w.t0, w.holdEnd]);
      if (H.dog && H.dog.exitOpen !== null) out.push([H.dog.exitOpen, H.dog.exitEnd === null ? Infinity : H.dog.exitEnd]);
      return out.length ? out : null;
    },
    onDoorOpen(i, t) { H.sounds.push({ kind: 'bell', t, door: DOORS[i].id, pos: doorSound(i) }); fire('E1', t); },
    trigger(name, t, k0 = 0) {
      if (name === 'E1') { H.sounds.push({ kind: 'bell', t, door: 'store', pos: doorSound(0) }); fire('E1', t); return true; }
      if (H.calm) return false;
      if (name === 'E0') { if (!H.figure) return false; H.e0 = { start: t, end: t + HORROR.e0.dark, removeAt: t + HORROR.e0.dark / 2, done: false }; return true; }
      if (name === 'E2') { H.e2 = { t0: t }; H.done.E2 = true; fire('E2', t); return true; }
      if (name === 'E3') { startE3(t, k0); return true; }
      if (name === 'E4') { if (H.wideAt === null) H.wideAt = t; startE4(t); return true; }
      if (name === 'E5') { H.figure = 'window'; H.e5Plan = null; fire('E5', t); return true; }
      return false;
    },
    snapshot(t) {
      return { visit: H.visit, fired: { ...H.fired }, figure: H.figure, calm: H.calm, scare: scare(t), light: light(t), bulbs: bulbs(t), tube: tube(t), tv: tv(t), hum: hum(t), aisle: aisleFigure(t),
        walked: H.walked, inside: H.inside, knock: H.knock && { ...H.knock }, back: (backAngle(t) * 180) / Math.PI,
        shake: shake(t), darken: darken(t), done: { ...H.done }, wideAt: H.wideAt, e5Plan: H.e5Plan && { ...H.e5Plan }, e5Dark: H.e5Dark && { ...H.e5Dark }, e0: H.e0 && { ...H.e0 }, e2: H.e2 && { ...H.e2 }, e3: H.e3 && { ...H.e3 }, e4: H.e4 && { ...H.e4 },
        c2: H.c2, c3: H.c3 && { ...H.c3 }, p1: H.p1 && { ...H.p1 }, p1arm: H.p1arm && { ...H.p1arm }, p2: H.p2 && { ...H.p2 },
        dog: H.dog && { ...H.dog, log: H.dog.log.map((x) => ({ ...x })), stop: H.dog.stop && H.dog.stop.slice(), way: H.dog.way && H.dog.way.map((q) => q.slice()) }, dogView: dogView(t),
        blackouts: H.blk.map((b) => ({ kind: b.kind, start: b.start, end: b.end, begun: b.begun, moved: b.moved, done: b.done })), rule1: { n: H.r1.n, fig: H.r1.fig && { ...H.r1.fig }, log: H.r1.log.map((x) => ({ ...x })), now: rule1Fig(t) && { ...rule1Fig(t) } },
        foot0: H.foot0, footprints: footprints(t), footArrived: footArrived(t), end: H.end && { ...H.end, target: H.end.target && { ...H.end.target } }, endPose: endPose(),
        sounds: H.sounds.map((x) => ({ ...x })), vibes: H.vibes.map((x) => ({ ...x, pattern: x.pattern.slice() })), history: H.history.map((x) => ({ ...x })) };
    },
  };
}

// ---------------- the simulation ----------------
// ---------------- 第四轮：摇杆、手机转头、「看整间店」 (SPEC 店里的操作与「看整间店」视角) ----------------
export const PAD = { left: 0.45, low: 0.6, radius: 60, dead: 0.1, tapPx: 8, tapMs: 300, pinch: 0.75, gain: 1.6, together: 150, decidePx: 12, radial: 0.7 };
// The joystick spot: the left 45% of the screen, lower 40% of its height (round 5).
export const inJoyZone = (x, y, w, h) => x < PAD.left * w && y >= PAD.low * h;
// Two fingers that came down together (within 150 ms): a pinch when, since then, they moved mostly along the line
// between them (radial share >= 70%) and against each other (radial difference >= 70% of the radial sum; one finger
// still and the other moving along the line counts). a, b: { x0, y0 } where they were when the pair formed, { x, y } now.
export function pairIsPinch(a, b) {
  const ux = b.x0 - a.x0, uy = b.y0 - a.y0, L = Math.hypot(ux, uy) || 1, nx = ux / L, ny = uy / L;
  const dax = a.x - a.x0, day = a.y - a.y0, dbx = b.x - b.x0, dby = b.y - b.y0;
  const ra = dax * nx + day * ny, rb = dbx * nx + dby * ny, total = Math.hypot(dax, day) + Math.hypot(dbx, dby), radial = Math.abs(ra) + Math.abs(rb);
  return total > 0 && radial >= PAD.radial * total && Math.abs(rb - ra) >= PAD.radial * radial;
}
// The faint ring on the joystick spot: touch devices, walking, joystick not down (round 5).
export const joyHint = (mode, pad, coarse) => !!coarse && mode === 'walk' && !pad.joy && !pad.pending;
export const LOOK_MOUSE = 0.005, ROT_MOUSE = 0.006, ROT_TOUCH = 0.006;   // rad per css px: mouse look, orbit drag (unchanged since round 1)
export const touchTurn = (px, width) => (px * Math.PI) / Math.max(1, width);   // touch look: a swipe across the whole width turns 180 deg
// Joystick: finger offset (dx, dy) in css px from where it came down -> walking velocity relative to the view.
export function joyVelocity(dx, dy, yaw) {
  const L = Math.hypot(dx, dy), m = Math.min(1, L / PAD.radius);
  if (m < PAD.dead) return { vx: 0, vz: 0, m };
  const ux = dx / L, uy = dy / L, sp = WALK_SPEED * m, sn = Math.sin(yaw), cs = Math.cos(yaw);
  return { vx: (sn * uy + cs * ux) * sp, vz: (cs * uy - sn * ux) * sp, m };        // screen up = forward (-sin, -cos), right = (cos, -sin)
}
// Keyboard (round 6): W S and the up/down arrows walk forward and back, A D step sideways, the left/right arrows and
// Q E turn at a steady 2.0 rad/s (Shift runs but does not turn faster). Returns the walking velocity and the turn rate.
export const TURN_RATE = 2.0;
export function keyMotion(k, yaw) {
  const f = (k.fwd ? 1 : 0) - (k.back ? 1 : 0), s = (k.right ? 1 : 0) - (k.left ? 1 : 0), turn = ((k.turnL ? 1 : 0) - (k.turnR ? 1 : 0)) * TURN_RATE;
  if (!f && !s) return { vx: 0, vz: 0, turn };
  const sp = k.run ? RUN_SPEED : WALK_SPEED, n = Math.hypot(f, s);
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
  return { vx: ((fx * f + rx * s) / n) * sp, vz: ((fz * f + rz * s) / n) * sp, turn };
}
export const ROOM = { rise: 1.0, land: 1.0, phi: 0.6, phiTall: 0.35, phiRange: [0.25, 1.0], margin: 0.06, marginTall: [0.05, 0], fog: 0.008, roofBack: [0.1, 0.55] };
export const isTall = (aspect) => aspect < 0.8;   // portrait screens (round 5: the room view turns the shop's long side upright)
export const fovRoom = (aspect) => (isTall(aspect) ? 40 : clamp(deg(2 * Math.atan(Math.tan(rad(20)) / Math.min(1, aspect))), 40, 80));   // 40 deg vertical; landscape and fold: 40 deg each way at least
// Where the room view starts: behind the walker's line of sight; on a portrait screen the nearest of the two angles that
// put the shop's long side upright on the screen (looking along it).
export function roomTheta(b, yaw, aspect) {
  if (!isTall(aspect)) return yaw;
  const along = b.x1 - b.x0 >= b.z1 - b.z0 ? [Math.PI / 2, -Math.PI / 2] : [0, Math.PI];
  return along.reduce((best, a) => (Math.abs(wrapAngle(a - yaw)) < Math.abs(wrapAngle(best - yaw)) ? a : best));
}
export const roomInterior = (b) => ({ x0: b.x0 + WALL_T, x1: b.x1 - WALL_T, z0: b.z0 + WALL_T, z1: b.z1 - WALL_T });
export const roomFloor = (b) => { const A = roomInterior(b), F = SIDEWALK_H; return [[A.x0, F, A.z0], [A.x1, F, A.z0], [A.x1, F, A.z1], [A.x0, F, A.z1]]; };
// The room view: an orbit round the shop's floor centre, from far enough that the floor and the wall tops are all in frame.
export function roomOrbit(b, theta, phi, aspect) {
  const A = roomInterior(b), cx = (A.x0 + A.x1) / 2, cz = (A.z0 + A.z1) / 2, cy = SIDEWALK_H, fov = fovRoom(aspect), top = b.h - 0.2;
  const pts = roomFloor(b).concat(roomFloor(b).map(([x, , z]) => [x, top, z]));
  const [mF, mW] = isTall(aspect) ? ROOM.marginTall : [ROOM.margin, ROOM.margin], inside = (v, m) => v.depth > 0.1 && v.x >= m && v.x <= 1 - m && v.y >= m && v.y <= 1 - m;
  const fits = (r) => { const cam = orbitCamera({ cx, cy, cz, r, theta, phi }); return pts.every((q, i) => inside(project(cam, fov, aspect, q), i < 4 ? mF : mW)); };   // floor corners, then wall tops
  let lo = 2, hi = 150;
  for (let i = 0; i < 40; i++) { const mid = (lo + hi) / 2; if (fits(mid)) hi = mid; else lo = mid; }
  return { id: b.id, cx, cy, cz, r: hi, theta, phi, fov };
}
// Where a landing from the room view ends up: inside this shop clear of the furniture, at the other shop's door, or outdoors.
export function roomLanding(b, x, z) {
  if (x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1) { const [qx, qz] = pushClear(x, z, 0.35, roomInterior(b)); return { x: qx, z: qz, building: b.id }; }
  const other = buildingAt(x, z);
  if (other) return doorLanding(other);
  const [qx, qz] = pushClear(clamp(x, OUTDOOR.x0, OUTDOOR.x1), clamp(z, OUTDOOR.z0, OUTDOOR.z1), 0.4);
  return { x: qx, z: qz, building: null };
}
// The look of a pose blended towards the room view by q (fov, light fog, rain over the base instead of round the camera).
export function blendLooks(s, aspect, q) {
  const L = looks(s, aspect);
  if (q <= 0) return L;
  L.fov = lerp(L.fov, fovRoom(aspect), q); L.fog = lerp(L.fog, ROOM.fog, q); L.rainMix = lerp(L.rainMix, 0, q);
  L.rainHeight = lerp(L.rainHeight, 9.5, q); L.rainShown = lerp(L.rainShown, 1, q); L.rainOpacity = lerp(L.rainOpacity, 0.3, q);
  return L;
}

export const DT_VIEW = 1 / 60;
export function createSim({ aspect = 16 / 9, calm = false } = {}) {
  const S = {
    aspect, rHero: heroRadius(aspect), mode: 'orbit', t: 0, rainT: 0, auto: true,
    orbit: null, z: 0, s: 0, cam: null, trans: null, trigger: null, lift: null, landing: null, room: null, pendingEscape: false,
    player: { x: 0, z: 0, eyeY: EYE_H, yaw: 0, pitch: 0, route: null, ri: 0, stuck: 0, input: [0, 0], look: null, joy: null },
    doors: newDoors(), entries: 0, exits: 0, raised: 0,
  };
  S.orbit = heroOrbitAt(rOf(0, S.rHero));
  const HZ = createHorror(S, calm);
  S.h = HZ.H;

  // Transitions: enter (orbit -> walk), exit (walk or room -> orbit), rise (walk -> room), land (room -> walk).
  // er runs 0 at P0 (orbit or room camera) to 1 at P2 (eye or room camera for an exit from the room view).
  const erOf = (tr, tau) => { const e = easeInOut(clamp01(tau / tr.dur)); return tr.kind === 'enter' || tr.kind === 'land' ? e : 1 - e; };
  const sOf = (tr, er) => (tr.kind === 'rise' || tr.kind === 'land' ? 1 : tr.s0 + (1 - tr.s0) * er);
  const roomQ = (tr, er) => (tr.kind === 'rise' || tr.kind === 'land' ? 1 - er : tr.room ? er : 0);   // how much of the room look
  function refresh() {
    if (S.mode === 'orbit') { S.s = S_PER_Z * S.z; S.cam = orbitCamera(S.orbit); }
    else if (S.mode === 'walk') { S.s = 1; const p = S.player; S.cam = { x: p.x, y: p.eyeY, z: p.z, yaw: p.yaw, pitch: p.pitch }; }
    else if (S.mode === 'room') { S.s = 1; S.cam = orbitCamera(S.room); }
    else { const tr = S.trans, er = erOf(tr, tr.tau); S.s = sOf(tr, er); S.cam = pathPose(tr, er); }
  }
  function looksNow() {
    if (S.mode === 'room') return blendLooks(1, S.aspect, 1);
    if (S.trans) return blendLooks(S.s, S.aspect, roomQ(S.trans, erOf(S.trans, S.trans.tau)));
    return looks(S.s, S.aspect);
  }
  const fovNow = () => looksNow().fov;
  // Roofs: hidden in the room view (roof, ceiling, light panels: parts 'room'); while rising out of a shop to the
  // table the lifted parts of round 1 (roof, fascia, lintel, sign: parts 'lift'). The alpha also tells E5 whether a
  // roof is back in place.
  function roofOf(b, cam = S.cam, mode = S.mode, tr = S.trans, tau = tr ? tr.tau : 0) {
    if (S.room && S.room.id === b.id && (mode === 'room' || mode === 'rising' || mode === 'landing'))
      return { a: mode === 'room' ? 0 : 1 - smooth(b.h - 0.4, b.h + 0.2, cam.y), parts: 'room' };
    if (mode === 'exiting' && tr && S.lift === b.id) {
      if (tr.room) return { a: smooth(ROOM.roofBack[0], ROOM.roofBack[1], tau / tr.dur), parts: 'room' };
      const over = cam.x > b.x0 && cam.x < b.x1 && cam.z > b.z0 && cam.z < b.z1 + 0.15;
      return { a: over ? smooth(b.h + 0.6, b.h + 3.0, cam.y) : 1, parts: 'lift' };
    }
    return { a: 1, parts: 'lift' };
  }
  const roofs = () => Object.fromEntries(BUILDINGS.map((b) => [b.id, roofOf(b)]));
  function setAspect(a) {
    if (Math.abs(a - S.aspect) < 1e-9) return;
    S.aspect = a; S.rHero = heroRadius(a);
    if (S.mode === 'orbit') S.orbit.r = rOf(S.z, S.rHero);
    if (S.room) { const b = BUILDINGS.find((q) => q.id === S.room.id); S.room = roomOrbit(b, S.room.theta, S.room.phi, a); }
    refresh();
  }
  // Keep the orbit centre over the model: the further out, the closer to the hero centre (at z = 0 it is the hero centre).
  function clampCentre(o, z) {
    const lim = 12 * clamp01(z / Z_ENTER), dx = o.cx - HERO.center[0], dz = o.cz - HERO.center[2], d = Math.hypot(dx, dz);
    if (d > lim) { const k = lim / d; o.cx = HERO.center[0] + dx * k; o.cz = HERO.center[2] + dz * k; }
    o.cy = clamp(o.cy, 0, HERO.center[1]);
  }
  function rotate(dTheta, dPhi) {
    if (S.mode !== 'orbit') return;
    S.orbit.theta += dTheta; S.orbit.phi = clamp(S.orbit.phi + dPhi, PHI_RANGE[0], PHI_RANGE[1]);
    refresh();
  }
  // Zoom by `factor` on the radius towards the point under the screen position (sx, sy): a homothety about that
  // point keeps it under the finger. Zooming in to z >= 0.85 starts the automatic entry aimed through (sx, sy).
  function zoomAt(factor, sx = 0.5, sy = 0.5) {
    if (S.mode !== 'orbit') return false;
    const ray = screenRay(S.cam, fovNow(), S.aspect, sx, sy);
    const hit = aimHit(ray.o, ray.d);
    const P = hit.kind === 'none' ? [S.orbit.cx, 0, S.orbit.cz] : ray.o.map((v, i) => v + ray.d[i] * hit.t);
    const z1 = clamp(zOf(S.orbit.r * factor, S.rHero), 0, 1), r1 = rOf(z1, S.rHero), k = r1 / S.orbit.r;
    S.orbit.cx = P[0] + (S.orbit.cx - P[0]) * k; S.orbit.cy = P[1] + (S.orbit.cy - P[1]) * k; S.orbit.cz = P[2] + (S.orbit.cz - P[2]) * k;
    S.orbit.r = r1; S.z = z1; clampCentre(S.orbit, z1);
    refresh();
    if (factor < 1 && S.z >= Z_ENTER - 1e-9) { startEnter(screenRay(S.cam, fovNow(), S.aspect, sx, sy)); return true; }
    return false;
  }
  function startEnter(ray) {
    const hit = aimHit(ray.o, ray.d), L = landingFor(hit, S.orbit.theta), cam = orbitCamera(S.orbit);
    S.trigger = { orbit: { ...S.orbit }, z: S.z, s: S_PER_Z * S.z, hit: hit.kind === 'building' ? 'building:' + hit.b.id : hit.kind };
    const P0 = [cam.x, cam.y, cam.z], P2 = [L.x, groundAt(L.x, L.z) + EYE_H, L.z], ch = controlHeight(P0, P2, null);
    if (ch.raised) S.raised++;
    S.trans = { kind: 'enter', tau: 0, dur: ENTER_TIME, P0, P1: [L.x, ch.h, L.z], P2, yawO: cam.yaw, pitchO: cam.pitch, yawG: L.yaw, pitchG: 0, s0: S.trigger.s, raised: ch.raised };
    S.landing = L; S.lift = null; S.mode = 'entering'; S.entries++;
    HZ.onEnterStart(S.t);
    refresh();
  }
  // Programmatic entry: zoom towards the aim point (same homothety the fingers make) up to the threshold, then enter.
  function enter(aim) {
    if (S.mode !== 'orbit') return false;
    const P = aimPoint(aim);
    if (S.z < Z_ENTER) {
      const r1 = rOf(Z_ENTER, S.rHero), k = r1 / S.orbit.r;
      S.orbit.cx = P[0] + (S.orbit.cx - P[0]) * k; S.orbit.cy = P[1] + (S.orbit.cy - P[1]) * k; S.orbit.cz = P[2] + (S.orbit.cz - P[2]) * k;
      S.orbit.r = r1; S.z = Z_ENTER; clampCentre(S.orbit, S.z); refresh();
    }
    const o = [S.cam.x, S.cam.y, S.cam.z], d = P.map((v, i) => v - o[i]), L = Math.hypot(...d);
    startEnter({ o, d: d.map((v) => v / L) });
    return true;
  }
  // Camera pose of an entry or exit at time tau into it (pure: also used to look ahead along an exit for E5).
  function transPose(tr, tau, mode) {
    const er = erOf(tr, tau), s = sOf(tr, er), f = blendLooks(s, S.aspect, roomQ(tr, er)).fov, c = pathPose(tr, er);
    const b = S.lift && BUILDINGS.find((q) => q.id === S.lift), see = b && roofOf(b, c, mode, tr, tau).a < 1;   // a lifted roof not yet back
    return { mode, cam: c, fov: f, hfov: hfov(f, S.aspect), aspect: S.aspect, lift: see ? S.lift : null };
  }
  const roomPose = () => { const f = fovRoom(S.aspect); return { mode: 'room', cam: orbitCamera(S.room), fov: f, hfov: hfov(f, S.aspect), aspect: S.aspect, lift: S.room.id }; };
  function exit() {
    if (S.mode !== 'walk' && S.mode !== 'room') return false;
    const p = S.player, cam = orbitCamera(S.trigger.orbit), fromRoom = S.mode === 'room';
    let P2, yawG, pitchG;
    if (fromRoom) { const c = orbitCamera(S.room); S.lift = S.room.id; P2 = [c.x, c.y, c.z]; yawG = c.yaw; pitchG = c.pitch; }
    else { const b = buildingAt(p.x, p.z, 0.15); S.lift = b ? b.id : null; P2 = [p.x, p.eyeY, p.z]; yawG = p.yaw; pitchG = p.pitch; }   // inside, or in the doorway
    const P0 = [cam.x, cam.y, cam.z], ch = controlHeight(P0, P2, S.lift);
    if (ch.raised) S.raised++;
    S.trans = { kind: 'exit', tau: 0, dur: EXIT_TIME, P0, P1: [P2[0], Math.max(ch.h, fromRoom ? P2[1] : 0), P2[2]], P2, yawO: cam.yaw, pitchO: cam.pitch, yawG, pitchG, s0: S.trigger.s, raised: ch.raised, room: fromRoom };
    p.route = null; p.input = [0, 0]; p.look = null; p.joy = null; p.turn = 0;
    S.mode = 'exiting'; S.exits++; S.pendingEscape = false;
    const tr = S.trans, tStart = S.t;
    HZ.onExitStart(tStart, (t) => transPose(tr, Math.min(tr.dur, t - tStart), 'exiting'), tr.dur);
    refresh();
    return true;
  }
  function finish() {
    const tr = S.trans, p = S.player;
    if (tr.kind === 'enter' || tr.kind === 'land') {
      const L = tr.kind === 'enter' ? S.landing : tr.target;
      Object.assign(p, { x: L.x, z: L.z, eyeY: groundAt(L.x, L.z) + EYE_H, yaw: tr.kind === 'enter' ? L.yaw : tr.yawG, pitch: 0, route: null, ri: 0, stuck: 0, input: [0, 0], look: null, joy: null, turn: 0 });
      S.mode = 'walk';
      if (tr.kind === 'land') { S.room = null; S.lift = null; }
    } else if (tr.kind === 'rise') S.mode = 'room';
    else {
      S.orbit = { ...S.trigger.orbit }; S.z = S.trigger.z; S.mode = 'orbit'; S.lift = null; S.room = null;
      HZ.onExitFinish();
    }
    S.trans = null;
    if (S.pendingEscape && (S.mode === 'walk' || S.mode === 'room')) exit();
    S.pendingEscape = false;
  }
  // Pinch in / wheel back: in a shop -> the room view; outdoors -> out to the table; in the room view -> out to the table.
  function back() {
    if (S.mode === 'room') return exit();
    if (S.mode !== 'walk') return false;
    const p = S.player, b = buildingAt(p.x, p.z, 0.15);
    if (!b) return exit();
    const room = roomOrbit(b, roomTheta(b, p.yaw, S.aspect), isTall(S.aspect) ? ROOM.phiTall : ROOM.phi, S.aspect), c = orbitCamera(room);
    S.room = room; S.lift = b.id;
    const P0 = [c.x, c.y, c.z], P2 = [p.x, p.eyeY, p.z], ch = controlHeight(P0, P2, b.id);
    if (ch.raised) S.raised++;
    S.trans = { kind: 'rise', tau: 0, dur: ROOM.rise, P0, P1: [p.x, Math.max(ch.h, c.y), p.z], P2, yawO: c.yaw, pitchO: c.pitch, yawG: p.yaw, pitchG: p.pitch, s0: 1, raised: ch.raised };
    p.route = null; p.input = [0, 0]; p.look = null; p.joy = null; p.turn = 0;
    S.mode = 'rising'; refresh();
    return true;
  }
  // Esc: straight out from any level (after a running rise or landing).
  function escape() {
    if (S.mode === 'walk' || S.mode === 'room') return exit();
    if (S.mode === 'rising' || S.mode === 'landing') { S.pendingEscape = true; return true; }
    return false;
  }
  // From the room view down to a ground point: eye height, level, facing the way the camera faced.
  function landAtPoint(x, z) {
    if (S.mode !== 'room') return false;
    const b = BUILDINGS.find((q) => q.id === S.room.id), c = orbitCamera(S.room), L = roomLanding(b, x, z);
    const P0 = [c.x, c.y, c.z], P2 = [L.x, groundAt(L.x, L.z) + EYE_H, L.z], ch = controlHeight(P0, P2, b.id);
    if (ch.raised) S.raised++;
    S.trans = { kind: 'land', tau: 0, dur: ROOM.land, P0, P1: [L.x, Math.max(ch.h, c.y), L.z], P2, yawO: c.yaw, pitchO: c.pitch, yawG: c.yaw, pitchG: 0, s0: 1, raised: ch.raised, target: { ...L, aimed: [x, z] } };
    S.mode = 'landing'; refresh();
    return true;
  }
  // The ground point under a screen position (0-1), for the current camera; null if the ray misses the ground.
  function groundPoint(sx, sy) {
    const ray = screenRay(S.cam, fovNow(), S.aspect, sx, sy);
    if (ray.d[1] > -0.02) return null;
    let t = (SIDEWALK_H - ray.o[1]) / ray.d[1], x = ray.o[0] + ray.d[0] * t, z = ray.o[2] + ray.d[2] * t;
    if (groundAt(x, z) === 0) { t = -ray.o[1] / ray.d[1]; x = ray.o[0] + ray.d[0] * t; z = ray.o[2] + ray.d[2] * t; }
    return t > 0 ? [x, z] : null;
  }
  const landAt = (sx, sy) => { const g = S.mode === 'room' && groundPoint(sx, sy); return g ? landAtPoint(g[0], g[1]) : false; };
  function roomRotate(dTheta, dPhi) {
    if (S.mode !== 'room') return;
    const b = BUILDINGS.find((q) => q.id === S.room.id);
    S.room = roomOrbit(b, S.room.theta + dTheta, clamp(S.room.phi + dPhi, ROOM.phiRange[0], ROOM.phiRange[1]), S.aspect);
    refresh();
  }
  // A tap: walk there (walking), or land there (room view).
  function tapAt(sx, sy) {
    if (S.mode === 'room') return landAt(sx, sy);
    if (S.mode !== 'walk') return false;
    const ray = screenRay(S.cam, fovNow(), S.aspect, sx, sy), floor = groundAt(S.player.x, S.player.z);
    if (ray.d[1] > -0.02) return false;
    const t = (floor - ray.o[1]) / ray.d[1];
    return t > 0 && t < 40 ? walkTo(ray.o[0] + ray.d[0] * t, ray.o[2] + ray.d[2] * t) : false;
  }
  // Joystick offset in css px (from where the finger came down); the walking direction follows the view every step.
  function joy(dx, dy) {
    const p = S.player;
    if (S.mode !== 'walk') { p.joy = null; return; }
    p.joy = [dx, dy];
    if (Math.hypot(dx, dy) >= PAD.dead * PAD.radius) p.route = null;
  }
  const joyEnd = () => { S.player.joy = null; };
  // One walking step. Route legs carry their leftover time to the next leg, so the position at a given time does not
  // depend on the step size (for unobstructed legs).
  function stepWalk(dt, t0) {
    const p = S.player, boxes = walkBoxes(S.doors, HZ.backAngle(t0)), path = [], turn = p.turn || 0;
    if (turn) p.look = null;                            // turning keys take over from a running look-at
    const yaw0 = p.yaw, pitch0 = p.pitch, look = p.look ? { ...p.look } : null, k0 = S.doors[0].k;
    const jv = p.joy && joyVelocity(p.joy[0], p.joy[1], p.yaw), inp = jv ? [jv.vx, jv.vz] : p.input;
    if (inp[0] || inp[1]) {
      p.route = null;
      moveCircle(p, inp[0] * dt, inp[1] * dt, boxes, dt, path);
    } else if (p.route) {
      let left = dt, guard = 0;
      while (left > 1e-12 && p.route && guard++ < 16) {
        const [tx, tz] = p.route[p.ri], dx = tx - p.x, dz = tz - p.z, dist = Math.hypot(dx, dz);
        if (dist < 1e-6) { if (++p.ri >= p.route.length) p.route = null; continue; }
        const tLeg = Math.min(left, dist / WALK_SPEED), want = WALK_SPEED * tLeg;
        const got = moveCircle(p, (dx / dist) * want, (dz / dist) * want, boxes, tLeg, path);
        left -= tLeg;
        if (got < want * 0.3) { p.stuck += tLeg; if (p.stuck >= 1) { p.route = null; break; } }
        else p.stuck = 0;
        if (Math.hypot(tx - p.x, tz - p.z) < 1e-4) { p.x = tx; p.z = tz; if (++p.ri >= p.route.length) p.route = null; }
      }
      if (left > 1e-12) path.push([p.x, p.z, p.x, p.z, left]);
    }
    const used = path.reduce((a, q) => a + q[4], 0);
    if (dt - used > 1e-12) path.push([p.x, p.z, p.x, p.z, dt - used]);
    // pose at any instant of this step: position along the recorded path, head turn as the exact exponential
    const fovIn = MAP.fov(1, S.aspect), hIn = hfov(fovIn, S.aspect);
    const poseAt = (t) => {
      let tau = t - t0, x = path[0][0], z = path[0][1];
      for (const [ax, az, bx, bz, sdt] of path) { if (tau <= sdt) { const f = sdt > 1e-12 ? tau / sdt : 1; x = ax + (bx - ax) * f; z = az + (bz - az) * f; break; } tau -= sdt; x = bx; z = bz; }
      const e = Math.exp(-5 * (t - t0)), yaw = turn ? yaw0 + turn * (t - t0) : look ? look.yaw + wrapAngle(yaw0 - look.yaw) * e : yaw0, pitch = look ? look.pitch + (pitch0 - look.pitch) * e : pitch0;
      return { mode: 'walk', x, z, cam: { x, y: groundAt(x, z) + EYE_H, z, yaw, pitch }, fov: fovIn, hfov: hIn, aspect: S.aspect, lift: null };
    };
    HZ.advance(t0, t0 + dt, poseAt, (t) => Math.max(0, k0 - DOOR_SPEED * (t - t0)));
    stepDoorsPath(S.doors, path, t0, HZ.doorOverride(), HZ.onDoorOpen);
    if (turn) p.yaw += turn * dt;                       // constant rate: the same angle at any step size
    if (p.look) {
      const k = 1 - Math.exp(-dt * 5);
      p.yaw = lerpAngle(p.yaw, p.look.yaw, k); p.pitch = lerp(p.pitch, p.look.pitch, k);
      if (Math.abs(wrapAngle(p.look.yaw - p.yaw)) < 0.003 && Math.abs(p.look.pitch - p.pitch) < 0.003) { p.yaw = p.look.yaw; p.pitch = p.look.pitch; p.look = null; }
    }
    const target = groundAt(p.x, p.z) + EYE_H;
    p.eyeY = target + (p.eyeY - target) * Math.exp(-dt / 0.1);
  }
  function update(dt) {
    const t0 = S.t;
    S.t += dt; S.rainT += dt;
    if (S.mode === 'walk') stepWalk(dt, t0);
    else {
      const tr = S.trans, tau0 = tr ? tr.tau : 0, mode = S.mode, orbitCam = orbitCamera(S.orbit);
      HZ.advance(t0, S.t, (t) => {
        if (!tr) {
          if (mode === 'room') return roomPose();
          const s = S_PER_Z * S.z, f = MAP.fov(s, S.aspect); return { mode, cam: orbitCam, fov: f, hfov: hfov(f, S.aspect), aspect: S.aspect, lift: null };
        }
        return transPose(tr, Math.min(tr.dur, tau0 + (t - t0)), mode);
      }, () => 0);
      // Doors close outside walk mode (nobody near them), except that a door E3 has opened keeps its own timeline, and
      // rising out of a doorway that door waits until the camera is above it.
      const held = S.doors.map((st, i) => (S.mode === 'exiting' && S.lift === DOORS[i].id && S.cam.y < SIDEWALK_H + DOOR_H + 0.3 ? { ...st } : null));
      stepDoorsPath(S.doors, [[1e3, 1e3, 1e3, 1e3, dt]], t0, HZ.doorOverride(), HZ.onDoorOpen);
      held.forEach((h, i) => { if (h) Object.assign(S.doors[i], h); });
      if (S.trans) { S.trans.tau = Math.min(S.trans.dur, S.trans.tau + dt); if (S.trans.tau >= S.trans.dur - 1e-9) finish(); }
    }
    refresh();
  }
  // Run an entry or exit forward to the moment s reaches `target` exactly (used for the fixed s = 0.5 view).
  function advanceToS(target, dt = DT_VIEW) {
    for (let i = 0; i < 1000 && S.mode === 'entering'; i++) {
      const tr = S.trans, eNeed = (target - tr.s0) / (1 - tr.s0), tauNeed = tr.dur * invEaseInOut(eNeed);
      if (tr.tau + dt >= tauNeed) { const rest = tauNeed - tr.tau; update(rest); return; }
      update(dt);
    }
  }
  const walkTo = (x, z) => walkRoute([[x, z]]);
  function walkRoute(pts) {
    if (S.mode !== 'walk' || !pts.length) return false;
    const lim = WALK_BOX - R;
    Object.assign(S.player, { route: pts.map(([x, z]) => [clamp(x, -lim, lim), clamp(z, -lim, lim)]), ri: 0, stuck: 0 });
    return true;
  }
  function drive(vx, vz) { S.player.input = [vx, vz]; if (vx || vz) S.player.route = null; }
  function turn(rate) { S.player.turn = S.mode === 'walk' ? rate : 0; if (rate) S.player.look = null; }   // rad/s, + = to the left
  function lookBy(dYaw, dPitch) {
    if (S.mode !== 'walk') return;
    const p = S.player; p.look = null; p.yaw += dYaw; p.pitch = clamp(p.pitch + dPitch, -1.2, 1.2); refresh();
  }
  function lookAt(x, y, z) {
    const p = S.player, dx = x - p.x, dz = z - p.z;
    p.look = { yaw: p.yaw + wrapAngle(Math.atan2(-dx, -dz) - p.yaw), pitch: clamp(Math.atan2(y - p.eyeY, Math.hypot(dx, dz)), -1.2, 1.2) };
  }
  function place(x, z, yaw = S.player.yaw) {     // test hook: put the walker somewhere (walk mode only)
    if (S.mode !== 'walk') return false;
    Object.assign(S.player, { x, z, yaw, eyeY: groundAt(x, z) + EYE_H, route: null, input: [0, 0], look: null, stuck: 0, turn: 0 });
    refresh(); return true;
  }
  const levelOf = () => (S.mode === 'orbit' ? 'outside' : S.mode === 'room' ? 'room' : S.mode === 'walk' ? (buildingAt(S.player.x, S.player.z, 0.15) ? 'inside' : 'street') : S.mode);
  function snapshot() {
    const L = looksNow(), p = S.player, c = S.cam;
    return {
      mode: S.mode, level: levelOf(), room: S.room && { ...S.room }, pendingEscape: S.pendingEscape, s: S.s, z: S.z, t: S.t, rainT: S.rainT, aspect: S.aspect, rHero: S.rHero,
      orbit: { ...S.orbit }, cam: { ...c }, eye: c.y - groundAt(c.x, c.z),
      fov: L.fov, hfov: hfov(L.fov, S.aspect), tilt: L.tilt, fog: L.fog, rainMix: L.rainMix, rainOpacity: L.rainOpacity, rainHeight: L.rainHeight, rainShown: L.rainShown,
      groundAlpha: L.groundAlpha, baseSides: L.baseSides, lowpass: L.lowpass, volume: L.volume,
      doors: S.doors.map((d, i) => ({ id: DOORS[i].id, k: d.k, want: d.want })),
      player: { x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch, walking: !!p.route, looking: !!p.look, joy: p.joy && [...p.joy], stuck: p.stuck, turn: p.turn || 0 },
      trigger: S.trigger && { orbit: { ...S.trigger.orbit }, z: S.trigger.z, s: S.trigger.s, hit: S.trigger.hit },
      landing: S.landing && { ...S.landing }, lift: S.lift, entries: S.entries, exits: S.exits, raised: S.raised,
      transition: S.trans && { kind: S.trans.kind, tau: S.trans.tau, dur: S.trans.dur, raised: S.trans.raised, room: !!S.trans.room, target: S.trans.target && { ...S.trans.target } },
      back: (HZ.backAngle(S.t) * 180) / Math.PI,
    };
  }
  const horror = () => HZ.snapshot(S.t);
  const trigger = (name) => { const ok = HZ.trigger(name, S.t, S.doors[0].k); refresh(); return ok; };
  const soundState = () => {
    const c = S.cam, tv = HZ.tv(S.t), tube = HZ.tube(S.t);
    return { hum: HZ.hum(S.t) * HZ.light(S.t), tube: tube > 0 ? 1 : 0, tv: tv.snow * tv.level, dTv: Math.hypot(c.x - TV_CENTRE[0], c.z - TV_CENTRE[2]), dAwning: Math.hypot(c.x - (AWNING.x0 + AWNING.x1) / 2, c.z - (AWNING.z0 + AWNING.z1) / 2) };
  };
  const levels = () => ({ light: HZ.light(S.t), bulbs: HZ.bulbs(S.t), tube: HZ.tube(S.t), tv: HZ.tv(S.t), hum: HZ.hum(S.t), aisle: HZ.aisleFigure(S.t), dog: HZ.dogView(S.t), door: HZ.doorK(S.t),
    back: HZ.backAngle(S.t), figure: S.h.figure, scare: HZ.scare(S.t), shake: HZ.shake(S.t), darken: HZ.darken(S.t), audio: audioLevels(S.s, soundState()),
    // round 9: the figure rule 1 brings, the wet footprints, the ending's pose, a dark spell on, the note's hint
    rule1: HZ.rule1Fig(S.t), foot: HZ.footprints(S.t), end: HZ.endPose(), blackout: HZ.blackoutNow(S.t), note: noteNear() });
  const view = () => { const L = levels(); return { bulbs: L.bulbs, tube: L.tube, tv: L.tv, staffOpen: L.back, foot: L.foot.map((f) => ({ i: f.i, x: f.x, z: f.z })) }; };   // round 9: what a visitor sees
  const noteNear = () => noteHint({ mode: S.mode, x: S.player.x, z: S.player.z, cam: S.cam, fov: fovNow(), aspect: S.aspect }, HZ.backAngle(S.t));
  refresh();
  return { S, update, refresh, rotate, zoomAt, enter, exit, walkTo, walkRoute, drive, turn, lookBy, lookAt, place, setAspect, advanceToS, snapshot, fov: fovNow, horror, trigger, levels,
    looksNow, roofs, back, escape, landAt, landAtPoint, groundPoint, roomRotate, tapAt, joy, joyEnd, view, noteNear };
}

// ---------------- touch: joystick, look, pinch, tap (SPEC 店里的操作) ----------------
// Pure: the page feeds pointer events (css px, ms), the pad drives the simulation. A finger that comes down in the left
// 45% while walking is the joystick (one at a time); any other finger is free. Two free fingers are a pinch; one free
// finger drags (orbit: rotate; walking: turn the head, a full screen width = 180 deg; room view: go round the shop).
// The joystick finger is never part of a pinch. A short press (< 8 px, < 300 ms) with nothing else down is a tap.
export function createTouchPad(sim, { width = 390, height = 844 } = {}) {
  const pts = new Map();
  let W = width, H = height, joyId = null, dragId = null, pinch = null, pending = null;
  const mode = () => sim.S.mode, free = () => [...pts.keys()].filter((k) => k !== joyId);
  const startPinch = (ids, d0) => { const [a, b] = ids.map((k) => pts.get(k)); pinch = { ids, d0: d0 ?? Math.hypot(a.x - b.x, a.y - b.y), d: Math.hypot(a.x - b.x, a.y - b.y), done: false }; dragId = null; };
  function pinchMoved() {
    const [a, b] = pinch.ids.map((k) => pts.get(k)), d = Math.hypot(a.x - b.x, a.y - b.y), m = mode(), mx = (a.x + b.x) / 2 / W, my = (a.y + b.y) / 2 / H;
    if (m === 'orbit') { if (d > 1 && pinch.d > 1) sim.zoomAt(Math.pow(pinch.d / d, PAD.gain), mx, my); }
    else if (!pinch.done && d < PAD.pinch * pinch.d0 && (m === 'walk' || m === 'room')) { pinch.done = true; sim.back(); }
    else if (!pinch.done && d > pinch.d0 / PAD.pinch && m === 'room') { pinch.done = true; sim.landAt(mx, my); }
    pinch.d = d;
  }
  return {
    resize(w, h) { W = Math.max(1, w); H = Math.max(1, h); },
    get joy() { const p = joyId != null && pts.get(joyId); return p ? { x0: p.x0, y0: p.y0, x: p.x, y: p.y } : null; },
    get pinching() { return !!pinch; },
    get pending() { return !!pending; },
    down(id, x, y, t) {
      const walking = mode() === 'walk', p = { x, y, x0: x, y0: y, t0: t, live: false, spent: false, zone: walking && inJoyZone(x, y, W, H) };
      const others = [...pts.keys()];
      pts.set(id, p);
      if (!walking) {                                     // outside and in the room view: no joystick, two fingers are a pinch
        const f = free();
        if (f.length === 2) startPinch(f); else if (f.length === 1) dragId = id;
        return;
      }
      if (pending || pinch || others.length > 1) { p.spent = true; return; }   // a third finger does nothing
      if (others.length === 0) { if (p.zone) joyId = id; else dragId = id; return; }
      const o = pts.get(others[0]), together = t - o.t0 <= PAD.together;
      if (together && (p.zone || o.zone)) {               // two fingers together, one on the joystick spot: wait and see how they move
        if (joyId !== null) { joyId = null; sim.joyEnd(); }
        dragId = null; pending = { ids: [others[0], id], a: { x: o.x, y: o.y }, b: { x, y } };
        return;
      }
      if (joyId === others[0]) { dragId = id; return; }   // the joystick came first: the new finger turns the head
      if (p.zone) { joyId = id; return; }                 // a head-turning finger came first: the new one on the spot is the joystick
      startPinch([others[0], id]);                        // neither on the joystick spot: a pinch, as before
    },
    move(id, x, y) {
      const p = pts.get(id);
      if (!p) return;
      const dx = x - p.x, dy = y - p.y;
      p.x = x; p.y = y;
      if (Math.hypot(x - p.x0, y - p.y0) >= PAD.tapPx) p.live = true;
      if (pending && pending.ids.includes(id)) {
        const [ia, ib] = pending.ids, A = pts.get(ia), B = pts.get(ib);
        if (Math.hypot(A.x - pending.a.x, A.y - pending.a.y) + Math.hypot(B.x - pending.b.x, B.y - pending.b.y) < PAD.decidePx) return;
        const pa = pending; pending = null;
        if (pairIsPinch({ x0: pa.a.x, y0: pa.a.y, x: A.x, y: A.y }, { x0: pa.b.x, y0: pa.b.y, x: B.x, y: B.y })) { startPinch([ia, ib], Math.hypot(pa.a.x - pa.b.x, pa.a.y - pa.b.y)); pinchMoved(); }
        else {                                            // the finger on the joystick spot (the first if both) walks, the other turns
          joyId = A.zone ? ia : ib; dragId = joyId === ia ? ib : ia; pts.get(dragId).live = true;
          const J = pts.get(joyId); sim.joy(J.x - J.x0, J.y - J.y0);
        }
        return;
      }
      if (id === joyId) { sim.joy(x - p.x0, y - p.y0); return; }
      if (pinch && pinch.ids.includes(id)) { pinchMoved(); return; }
      if (id !== dragId || p.spent || !p.live) return;
      const m = mode();
      if (m === 'orbit') sim.rotate(-dx * ROT_TOUCH, -dy * ROT_TOUCH);
      else if (m === 'walk') sim.lookBy(touchTurn(dx, W), touchTurn(dy, W));
      else if (m === 'room') sim.roomRotate(-dx * ROT_TOUCH, -dy * ROT_TOUCH);
    },
    up(id, x, y, t, cancelled = false) {
      const p = pts.get(id);
      if (!p) return;
      const tap = !cancelled && !p.live && !p.spent && pts.size === 1 && Math.hypot(x - p.x0, y - p.y0) < PAD.tapPx && t - p.t0 < PAD.tapMs;
      if (id === joyId) { joyId = null; sim.joyEnd(); }
      pts.delete(id);
      if (id === dragId) dragId = null;
      if (pending && pending.ids.includes(id)) { pending = null; for (const k of pts.keys()) pts.get(k).spent = true; }   // undecided pair broken up
      if (pinch && pinch.ids.includes(id)) { pinch = null; for (const k of free()) pts.get(k).spent = true; }
      if (tap) sim.tapAt(x / W, y / H);
    },
  };
}

// ---------------- fixed views (SPEC 固定机位): produced by running the simulation, then frozen ----------------
export const VIEW_SCRIPTS = {
  hero: { rainT: 2.0 },
  mid: { aim: 'door', s: 0.5 },
  door: { aim: 'door' },
  inside: { aim: 'door', route: [[5.0, -0.6], [6.2, -2.3]], look: [1.5, 1.25, -7.95] },          // by the till, looking at the freezers
  next: { aim: { x: -6.0, z: -3.5 }, route: [[-6.0, -0.6], [-6.0, -2.2]], look: [-6.3, 0.95, -5.6] }, // inside the shop next door, facing the bar
  room: { aim: 'door', route: [[5.0, -0.6], [6.2, -2.3]], look: [1.5, 1.25, -7.95], room: true },     // by the till, then pinch: the whole shop from above
  scare: {}, reveal: {},                                                                              // scripted by playScare
};
// When the staff door may go wide (round 8): E3's door shut again, and the dog gone with the door shut behind it.
export const scareReady = (h) => (!h.e3 ? Infinity : Math.max(h.e3.closedAt, !h.dog ? 0 : h.dog.closedAt === null ? Infinity : h.dog.closedAt));
// A scripted visit for the scare version: freezers (E2), the door behind you (E3), the staff door (E4), then out (E5).
export const SCARE_PLAN = { aisle: [[5.0, -0.6], [4.2, -6.5]], behind: [4.2, 1.6, 2.5], staff: [BACKDOOR.cx, SIDEWALK_H + 1.05, BACKDOOR.cz], front: [6.6, -5.6], near: [6.5, -6.85], out: [[5.0, -0.6], [5.0, 3.1]] };
export function playScare(sim, { dt = DT_VIEW, upTo = 'out', after = 0, aim = 'door' } = {}) {
  const S = sim.S, h = () => sim.horror(), until = (pred, maxT = 30) => { let t = 0; for (; t < maxT && !pred(); t += dt) sim.update(dt); return t; };
  const P = SCARE_PLAN, log = {};
  sim.enter(aim); until(() => S.mode === 'walk', 10);
  sim.walkRoute(P.aisle); until(() => !S.player.route);
  until(() => h().e2 && S.t >= h().e2.t0 + E2_TOTAL, 5);
  if (upTo === 'E2') { until(() => false, after); return log; }
  if (upTo === 'reveal') { sim.walkRoute(P.out); until(() => !S.player.route, 20); sim.exit(); until(() => S.mode === 'orbit', 5); until(() => false, after); return log; }
  until(() => S.t >= scareReady(h()), 25);           // round 8: after the dog has gone
  sim.lookAt(...P.behind); until(() => !S.player.look, 6);
  sim.lookAt(...P.staff); until(() => !S.player.look, 6);
  // round 6: come at the staff door from the front (E4 now catches you at 2.0 m; from the side the open leaf hides the doorway)
  sim.walkTo(...P.front); until(() => !S.player.route, 6);
  sim.lookAt(...P.staff); until(() => !S.player.look, 6);
  sim.walkTo(...P.near); until(() => !S.player.route || !!h().e4, 6);
  S.player.route = null;                                     // stops where E4 caught it (round 6: from 2.0 m)
  sim.lookAt(...P.staff); until(() => !!h().e4 || !S.player.look, 6);
  if (upTo === 'scare') { const t4 = h().e4 && h().e4.t0; if (t4 != null) until(() => S.t >= t4 + after, 2); return log; }
  until(() => h().e4 && S.t >= h().e4.bang + 0.6, 6);
  if (upTo === 'E4') return log;
  sim.walkRoute(P.out); until(() => !S.player.route, 20);
  sim.exit(); until(() => S.mode === 'orbit', 5);
  return log;
}
// ---------------- the first-visit wanderer (round 6, F1) ----------------
// A stand-in for someone on their first visit. It knows nothing about where or when the scares happen: it lands at the
// shop, walks in, wanders along the aisles turning left and right with the arrow keys every few seconds, heads for the
// middle-rear of the shop, and from then on walks toward the loudest sound it has just heard (looking around when it
// hears nothing). What it may use: its own position and heading, the shop's outline, whether it is stuck, and the
// sounds that have played (where they came from, how loud). It acts only through keys: forward and the two turning
// keys. Every random choice comes from the seed. These parameters were fixed before the first run and not tuned.
export const WANDER = {
  extraIn: [0.5, 1.5],       // s: keeps walking after the doorway
  browse: [6, 10],           // s: wandering the aisles
  leg: [1.2, 2.5],           // s: each stretch of walking between two look-arounds
  sweep: [0.6, 1.4],         // rad: how far it looks to each side
  rearX: [0.35, 0.65], rearZ: [0.2, 0.45],   // middle-rear of the shop, as fractions of its inside width and depth (from the back)
  rearTimeout: 12, arrive: 0.8,
  idleTurn: [0.8, 2.0], idleWait: [0.5, 1.5], idleWalk: [0.6, 1.2],
  hear: 3,                   // s: a sound counts as "current" for this long after it plays
  reach: 1.0, forget: 8,     // stops chasing a sound when this close to it, or this long after it played
  stuck: 0.5, aim: 0.12, walkErr: 0.6,
};
// Round 9 (N7): the same visitor with the sound off. It hears nothing; after browsing it goes by what it can see: the newest
// wet footprint in view (newer than the last it reached), else the staff doorway standing wide open (the back room's light),
// else any lit thing in view it has not been to in the last 20 s (the pool under each bulb, the tube's, the television, the
// staff doorway), chosen by the seed; with nothing in view it looks around. "In view" = on screen with a clear line of sight
// (the drawn footprints, the drawn lights and door). Fixed with the round-9 code, before the first run, and not tuned.
export const WANDER_SIGHT = { revisit: 20, reach: 0.9, footReach: 0.6, searchTurns: 3 };
// What a visitor can see of the scene, for that wanderer (sim.view()): the lights as drawn, the footprints drawn on the
// floor, how far the staff door stands open; and where the lit things are, with when each counts as lit. Nothing about
// when or why a scare starts.
export const LIT_THINGS = [
  { id: 'till', at: [6.3, SIDEWALK_H + 0.02, -1.6], go: [6.3, -1.6], on: (V) => V.bulbs[0] > 0.5 },
  { id: 'aisle', at: [-0.25, SIDEWALK_H + 0.02, -4.0], go: [-0.25, -4.0], on: (V) => V.bulbs[1] > 0.5 },
  { id: 'tube', at: [3.6, SIDEWALK_H + 0.02, -2.8], go: [3.6, -2.8], on: (V) => V.tube > 0.5 },
  { id: 'tv', at: TV_CENTRE.slice(), go: [6.3, (GROCERY.tv.z0 + GROCERY.tv.z1) / 2], on: (V) => V.tv.snow > 0 || V.tv.reflect },
  { id: 'staff', at: [BACKDOOR.cx, SIDEWALK_H + 1.0, BACKDOOR.cz], go: [BACKDOOR.cx, BACKDOOR.cz], on: () => true, wide: (V) => V.staffOpen > BACKDOOR.half + 0.1 },
];
export function createWanderer(sim, seed = 1, { aim = 'door', senses = 'sound' } = {}) {
  const r = rng(seed), R = ([a, b]) => a + (b - a) * r(), sign = () => (r() < 0.5 ? -1 : 1), S = sim.S, Wd = WANDER;
  const ix0 = STORE.x0 + WALL_T, ix1 = STORE.x1 - WALL_T, iz0 = STORE.z0 + WALL_T, iz1 = STORE.z1 - WALL_T;
  const inShop = () => { const p = S.player; return p.x > ix0 && p.x < ix1 && p.z > iz0 && p.z < iz1; };
  const rear = [lerp(ix0, ix1, R(Wd.rearX)), lerp(iz0, iz1, R(Wd.rearZ))];
  // the shop entrance is in plain sight: a point out in front of it, then one just inside (round 7: landings away from the door)
  const doorOut = [STORE.door.cx, STORE.z1 + 1.0], doorIn = [STORE.door.cx, STORE.z1 - 1.2];
  const gain = (ev) => (ev.kind === 'knock' ? ev.mult : ev.kind === 'bell' ? AUDIO.bell : ev.kind === 'slam' ? AUDIO.slam : 0);
  const st = { phase: 'land', t0: 0, until: 0, queue: [], heard: null, wentT: -Infinity, track: null, through: false, log: [] };
  const go = (phase, extra = {}) => { st.phase = phase; st.t0 = S.t; st.queue = []; st.track = null; Object.assign(st, extra); st.log.push({ t: S.t, phase, x: S.player.x, z: S.player.z }); };
  const idle = () => ({ fwd: false, back: false, left: false, right: false, turnL: false, turnR: false, run: false });
  // stuck: walking forward but hardly moving for a while
  const stuckCheck = (walking) => {
    const p = S.player;
    if (!walking) { st.track = null; return false; }
    if (!st.track) { st.track = { x: p.x, z: p.z, t: S.t }; return false; }
    if (S.t - st.track.t < Wd.stuck) return false;
    const moved = Math.hypot(p.x - st.track.x, p.z - st.track.z), bad = moved < WALK_SPEED * Wd.stuck * 0.3;
    st.track = { x: p.x, z: p.z, t: S.t };
    return bad;
  };
  const doQueue = (k, dt) => {        // runs the front action: walk for a time, turn by an angle, or wait
    const a = st.queue[0];
    if (!a) return false;
    if (a.kind === 'walk') { k.fwd = true; a.left -= dt; }
    else if (a.kind === 'turn') { if (a.left > 0) k.turnL = true; else k.turnR = true; a.left -= Math.sign(a.left) * TURN_RATE * dt; if (Math.abs(a.left) < 1e-9 || Math.sign(a.left) !== a.sign) a.left = 0; }
    else a.left -= dt;
    if (a.kind === 'turn' ? a.left === 0 : a.left <= 0) st.queue.shift();
    return true;
  };
  const turnBy = (ang) => ({ kind: 'turn', left: ang, sign: Math.sign(ang) });
  const lookAround = () => { const a = R(Wd.sweep) * sign(); return [turnBy(a), turnBy(-2 * a), turnBy(a)]; };
  const unstick = () => [turnBy(sign() * R([Math.PI / 2, Math.PI])), { kind: 'walk', left: 0.8 }];
  const steer = (k, x, z) => {        // turn toward a point, walk when roughly facing it
    const p = S.player, want = Math.atan2(-(x - p.x), -(z - p.z)), err = wrapAngle(want - p.yaw);
    if (err > Wd.aim) k.turnL = true; else if (err < -Wd.aim) k.turnR = true;
    if (Math.abs(err) < Wd.walkErr) k.fwd = true;
    return Math.hypot(x - p.x, z - p.z);
  };
  // what it hears: sounds that have played in the last few seconds, loudness falling off with distance
  const listen = () => {
    const p = S.player, now = S.t;
    let best = null;
    for (const ev of sim.horror().sounds) {
      if (!ev.pos || ev.t > now || ev.t <= now - Wd.hear || ev.t <= st.wentT) continue;   // a sound it has already gone to does not call it back
      const lv = gain(ev) / Math.max(1, Math.hypot(ev.pos[0] - p.x, ev.pos[2] - p.z));
      if (lv > 0 && (!best || lv > best.lv + 1e-9 || (lv > best.lv - 1e-9 && ev.t > best.t))) best = { lv, t: ev.t, kind: ev.kind, pos: ev.pos };
    }
    if (best && (!st.heard || best.t > st.heard.t)) { st.log.push({ t: now, phase: 'heard', kind: best.kind, x: p.x, z: p.z }); st.heard = best; }
  };
  // what it can see (round 9, senses: 'sight'): a point on screen with nothing opaque in between
  const sees = (q, V) => { const cam = S.cam, fov = sim.fov(), pr = project(cam, fov, S.aspect, q);
    return pr.depth > 0.05 && pr.x >= 0 && pr.x <= 1 && pr.y >= 0 && pr.y <= 1 && sightlines(cam, fov, S.aspect, [q], V.staffOpen)[0]; };
  const F0 = SIDEWALK_H, LIT = LIT_THINGS, STAFF = LIT_THINGS.find((o) => o.wide);
  const sight = { goal: null, lastFoot: -1, visited: {}, search: 0 };
  function looking(k, dt) {
    const p = S.player, L = sim.view(), now = S.t;
    // 1. the newest footprint it can see, newer than the last one it reached
    let foot = null;
    for (const f of L.foot) if (f.i > sight.lastFoot && (!foot || f.i > foot.i) && sees([f.x, F0 + 0.01, f.z], L)) foot = f;
    if (foot) { if (!sight.goal || sight.goal.kind !== 'foot') st.log.push({ t: now, phase: 'saw-foot-' + foot.i, x: p.x, z: p.z }); sight.goal = { kind: 'foot', i: foot.i, go: [foot.x, foot.z] }; sight.search = 0; st.queue = st.queue.filter((a) => a.unstick); }
    // 2. the staff doorway standing wide open
    else if (STAFF.wide(L) && (!sight.goal || sight.goal.kind !== 'wide') && sees(STAFF.at, L)) { sight.goal = { kind: 'wide', go: STAFF.go.slice() }; st.queue = st.queue.filter((a) => a.unstick); st.log.push({ t: now, phase: 'saw-open-door', x: p.x, z: p.z }); }
    // 3. a lit thing in view not visited lately
    else if (!sight.goal && !st.queue.length) {
      const can = LIT.filter((o) => o.on(L) && now - (sight.visited[o.id] ?? -Infinity) > WANDER_SIGHT.revisit && Math.hypot(o.go[0] - p.x, o.go[1] - p.z) > WANDER_SIGHT.reach && sees(o.at, L));
      if (can.length) { const o = can[Math.floor(r() * can.length)]; sight.goal = { kind: 'lit', id: o.id, go: o.go.slice() }; st.log.push({ t: now, phase: 'saw-' + o.id, x: p.x, z: p.z }); }
    }
    if (st.queue.length && (st.queue[0].unstick || !sight.goal)) { const walking = st.queue[0].kind === 'walk'; doQueue(k, dt); if (stuckCheck(walking && k.fwd)) st.queue = unstick().map((a) => ({ ...a, unstick: true })); return k; }
    if (sight.goal) {
      const g = sight.goal, d = steer(k, g.go[0], g.go[1]);
      if (d < (g.kind === 'foot' ? WANDER_SIGHT.footReach : WANDER_SIGHT.reach)) {
        if (g.kind === 'foot') sight.lastFoot = g.i; else if (g.kind === 'lit') sight.visited[g.id] = now;
        sight.goal = null; st.queue = lookAround();
      } else if (stuckCheck(k.fwd)) { if (g.kind === 'lit') sight.visited[g.id] = now; if (g.kind === 'foot') sight.lastFoot = g.i; sight.goal = null; st.queue = unstick().map((a) => ({ ...a, unstick: true })); }
      return k;
    }
    // nothing in view: look around, then a few steps
    st.queue.push(turnBy(sign() * R(Wd.idleTurn)), { kind: 'wait', left: R(Wd.idleWait) }, { kind: 'walk', left: R(Wd.idleWalk) });
    return k;
  }
  function decide(dt) {
    const k = idle(), p = S.player;
    if (S.mode === 'orbit' && st.phase === 'land') { sim.enter(aim); go('landing'); return k; }
    if (S.mode !== 'walk') return k;
    if (st.phase === 'landing') go('enter');
    if (st.phase === 'enter') {                      // walk to the shop door and through it
      if (inShop()) { go('in', { until: S.t + R(Wd.extraIn) }); return decide(0); }
      if (st.queue.length) { doQueue(k, dt); return k; }
      const tgt = st.through ? doorIn : doorOut;
      if (steer(k, tgt[0], tgt[1]) < 0.5) st.through = true;
      if (stuckCheck(k.fwd)) st.queue = unstick();
      return k;
    }
    if (st.phase === 'in') { k.fwd = true; if (S.t >= st.until) go('browse', { until: S.t + R(Wd.browse) }); return k; }
    if (st.phase === 'browse') {
      if (S.t >= st.until) { if (senses === 'sight') { go('look'); return decide(0); } go('rear', { until: S.t + Wd.rearTimeout }); return decide(0); }
      if (!st.queue.length) st.queue.push({ kind: 'walk', left: R(Wd.leg) }, ...lookAround());
      const walking = st.queue[0].kind === 'walk';
      doQueue(k, dt);
      if (stuckCheck(walking && k.fwd)) st.queue = unstick();
      return k;
    }
    if (st.phase === 'rear') {
      if (st.queue.length) { doQueue(k, dt); return k; }
      const d = steer(k, rear[0], rear[1]);
      if (d < Wd.arrive || S.t >= st.until) { go('listen'); return k; }
      if (stuckCheck(k.fwd)) st.queue = unstick();
      return k;
    }
    if (st.phase === 'look') return looking(k, dt);
    // listen: walk toward the loudest current sound, otherwise look around
    listen();
    if (st.heard && (S.t - st.heard.t > Wd.forget || Math.hypot(st.heard.pos[0] - p.x, st.heard.pos[2] - p.z) < Wd.reach)) { st.wentT = st.heard.t; st.heard = null; }
    if (st.queue.length && st.queue[0].unstick) { doQueue(k, dt); return k; }
    if (st.heard) {
      st.queue = [];
      steer(k, st.heard.pos[0], st.heard.pos[2]);
      if (stuckCheck(k.fwd)) st.queue = unstick().map((a) => ({ ...a, unstick: true }));
      return k;
    }
    if (!st.queue.length) st.queue.push(turnBy(sign() * R(Wd.idleTurn)), { kind: 'wait', left: R(Wd.idleWait) }, { kind: 'walk', left: R(Wd.idleWalk) });
    const walking = st.queue[0].kind === 'walk';
    doQueue(k, dt);
    if (stuckCheck(walking && k.fwd)) st.queue = unstick();
    return k;
  }
  // one step through the keys (the page uses decide() and its own key handling instead)
  function step(dt) {
    const k = decide(dt);
    if (S.mode === 'walk') { const m = keyMotion(k, S.player.yaw); sim.drive(m.vx, m.vz); sim.turn(m.turn); }
    sim.update(dt);
    return k;
  }
  return { decide, step, get phase() { return st.phase; }, get log() { return st.log; }, rear, seed, aim, senses, get goal() { return sight.goal; } };
}
export function runView(sim, view, aimOverride) {
  if (view === 'scare') { playScare(sim, { upTo: 'scare', after: 0.15 }); return true; }
  if (view === 'reveal') { playScare(sim, { upTo: 'reveal' }); return true; }
  const v = VIEW_SCRIPTS[view];
  if (!v) return false;
  const until = (pred, maxT = 60) => { for (let t = 0; t < maxT && !pred(); t += DT_VIEW) sim.update(DT_VIEW); };
  if (v.rainT != null) { sim.S.rainT = v.rainT; sim.refresh(); return true; }
  sim.enter(aimOverride || v.aim);
  if (v.s != null) { sim.advanceToS(v.s); return true; }
  until(() => sim.S.mode === 'walk');
  if (v.route) { sim.walkRoute(v.route); until(() => !sim.S.player.route); }
  if (v.look) { sim.lookAt(...v.look); until(() => !sim.S.player.look); }
  if (v.room) { sim.back(); until(() => sim.S.mode === 'room'); }
  return true;
}

// ---------------- what the page draws (boxes per material; door leaves and the rest are built in main.js) ----------------
export function visualBoxes() {
  const V = [], F = SIDEWALK_H, T = WALL_T;
  const add = (mat, x0, y0, z0, x1, y1, z1) => V.push({ mat, x0, y0, z0, x1, y1, z1 });
  add('sidewalk', -BASE.half, 0, -BASE.half, BASE.half, F, ROAD.z0);                 // pavement, back lot, under the shops
  add('sidewalk', -BASE.half, 0, ROAD.z1, BASE.half, F, BASE.half);                  // far kerb
  for (let i = 0; i < 6; i++) add('stripe', 0.4 + i * 0.75, 0, 4.0, 0.85 + i * 0.75, 0.012, 10.0);   // zebra crossing
  for (const b of BUILDINGS) {
    const d = DOORS.find((q) => q.id === b.id), wall = b.id === 'store' ? 'storeWall' : 'nextWall', top = b.h - 0.2;
    if (b.id === 'store') {                         // back wall with the open staff doorway (the back wall's solid still closes it)
      add(wall, b.x0, 0, b.z0, BACKDOOR.hx, top, b.z0 + T);
      add(wall, BACKDOOR.hx + BACKDOOR.w, 0, b.z0, b.x1, top, b.z0 + T);
      add(wall, BACKDOOR.hx, F + BACKDOOR.h + 0.02, b.z0, BACKDOOR.hx + BACKDOOR.w, top, b.z0 + T);
      add(wall, BACKDOOR.hx, 0, b.z0, BACKDOOR.hx + BACKDOOR.w, F + 0.006, b.z0 + T);   // sill flush with the floors (at F it z-fought the pavement top)
    } else add(wall, b.x0, 0, b.z0, b.x1, top, b.z0 + T);
    add(wall, b.x0, 0, b.z0 + T, b.x0 + T, top, b.z1);
    add(wall, b.x1 - T, 0, b.z0 + T, b.x1, top, b.z1);
    add(b.id + 'Roof', b.x0, top, b.z0, b.x1, b.h, b.z1);
    add(b.id + 'Floor', b.x0 + T, F, b.z0 + T, b.x1 - T, F + 0.006, b.z1 - T);
    if (b.id === 'store') {                         // round 8: wooden front, the glass door, one small window, a hand-painted sign, a tin awning
      const W = WINDOW, A = AWNING;
      for (const pc of FRONT_PIECES) add(pc.id === 'store:front-upper' ? 'storeFacade:upper' : 'storeFacade', pc.x0, pc.y0, pc.z0, pc.x1, pc.y1, pc.z1);
      add('windowGlass', W.x0, W.y0, b.z1 - 0.12, W.x1, W.y1, b.z1 - 0.08);
      for (const x of [W.x0, (W.x0 + W.x1) / 2, W.x1]) add('frame', x - 0.03, W.y0, b.z1 - 0.13, x + 0.03, W.y1, b.z1 - 0.07);
      for (const y of [W.y0, W.y1]) add('frame', W.x0, y - 0.03, b.z1 - 0.13, W.x1, y + 0.03, b.z1 - 0.07);
      for (const x of [d.x0, d.x1]) add('frame', x - 0.03, F, b.z1 - 0.09, x + 0.03, F + DOOR_H, b.z1 - 0.01);       // aluminium door frame
      add('frame', d.x0, F + DOOR_H - 0.03, b.z1 - 0.09, d.x1, F + DOOR_H + 0.03, b.z1 - 0.01);
      add('sign', d.cx - 1.25, 2.86, b.z1, d.cx + 1.25, 3.3, b.z1 + 0.06);
      for (let i = 0; i < 4; i++) add('signText', d.cx - 1.05 + i * 0.56, 2.93 + (i % 2) * 0.03, b.z1 + 0.06, d.cx - 0.6 + i * 0.56, 3.2 - ((i + 1) % 2) * 0.02, b.z1 + 0.075);   // four brush-stroke blocks
      add('awning', A.x0, A.y, A.z0, A.x1, A.y + 0.04, A.z1);                                                       // tin sheet
      add('awning', A.x0, A.y - 0.1, A.z1 - 0.04, A.x1, A.y + 0.04, A.z1);                                          // its front lip
      for (const x of [A.x0 + 0.1, A.x1 - 0.1]) add('awning', x - 0.02, A.y - 0.5, b.z1, x + 0.02, A.y, b.z1 + 0.04);   // brackets
    } else {                                        // timber front with one window right of the door
      add(wall + ':upper', b.x0 + T, F + DOOR_H, b.z1 - T, b.x1 - T, top, b.z1);
      add(wall, b.x0 + T, 0, b.z1 - T, d.x0, F + DOOR_H, b.z1);
      add(wall, d.x1, 0, b.z1 - T, -5.1, F + DOOR_H, b.z1);
      add(wall, -3.5, 0, b.z1 - T, b.x1 - T, F + DOOR_H, b.z1);
      add(wall, -5.1, 0, b.z1 - T, -3.5, 0.95, b.z1);
      add('glass', -5.1, 0.95, b.z1 - 0.12, -3.5, F + DOOR_H, b.z1 - 0.08);
      add('sign2', d.cx - 0.8, 2.55, b.z1, d.cx + 0.8, 2.9, b.z1 + 0.05);
      for (let i = 0; i < 2; i++) add('sign2Text', d.cx - 0.55 + i * 0.6, 2.6, b.z1 + 0.05, d.cx - 0.05 + i * 0.6, 2.85, b.z1 + 0.065);
    }
  }
  // the grocery's inside (round 8): wooden shelves crammed with goods, chest freezer, old till with a television and a register,
  // cardboard boxes, strings of goods hanging from the ceiling
  const rnd = rng(8808);
  for (const sh of GROCERY.shelves) {
    const faces = sh.id === 'shelf-w' ? [1] : sh.id === 'shelf-e' ? [-1] : [-1, 1], cx = (sh.x0 + sh.x1) / 2;
    add('shelf', sh.x0, F, sh.z0, sh.x1, F + sh.h, sh.z0 + 0.04); add('shelf', sh.x0, F, sh.z1 - 0.04, sh.x1, F + sh.h, sh.z1);   // end panels
    if (faces.length === 2) add('shelf', cx - 0.02, F, sh.z0, cx + 0.02, F + sh.h, sh.z1);                                   // back board
    else add('shelf', faces[0] > 0 ? sh.x0 : sh.x1 - 0.04, F, sh.z0, faces[0] > 0 ? sh.x0 + 0.04 : sh.x1, F + sh.h, sh.z1);
    const ys = [0.06, 0.5, 0.94, 1.38];
    for (const y of ys.concat([sh.h - 0.04])) add('shelfBoard', sh.x0, F + y, sh.z0, sh.x1, F + y + 0.04, sh.z1);
    for (const y of ys) for (const f of faces) {
      const xa = f > 0 ? (faces.length === 2 ? cx + 0.03 : sh.x0 + 0.06) : sh.x0 + 0.03, xb = f > 0 ? sh.x1 - 0.03 : (faces.length === 2 ? cx - 0.03 : sh.x1 - 0.06);
      for (let z = sh.z0 + 0.08; z < sh.z1 - 0.12;) {
        const w = 0.12 + rnd() * 0.3, hgt = 0.12 + rnd() * 0.26, gap = rnd() < 0.18 ? 0.15 + rnd() * 0.25 : 0.02;
        if (z + w > sh.z1 - 0.08) break;
        add(['goods', 'goods2', 'goods3'][Math.floor(rnd() * 3)], xa, F + y + 0.04, z, xb - rnd() * 0.08, F + y + 0.04 + hgt, z + w);
        z += w + gap;
      }
    }
  }
  const G = Object.fromEntries(GROCERY.solids.map(([id, ...r]) => [id, r]));
  { const [x0, , z0, x1, , z1] = G.chest; add('freezerBody', x0, F, z0, x1, F + 0.85, z1); add('chestLid', x0 + 0.03, F + 0.85, z0 + 0.03, x1 - 0.03, F + 0.9, z1 - 0.03); }
  { const [x0, , z0, x1, y1, z1] = G.counter; add('counter', x0, F, z0, x1, F + y1, z1); }
  { const [x0, y0, z0, x1, y1, z1] = G.tv; add('tvBody', x0, F + y0, z0, x1, F + y1, z1); }
  { const [x0, y0, z0, x1, y1, z1] = G.register; add('register', x0, F + y0, z0, x1, F + y1, z1); }
  for (const [id, x0, y0, z0, x1, y1, z1] of GROCERY.solids) if (id.startsWith('box')) add(id.startsWith('box-out') ? 'boxOut' : 'box', x0, F + y0, z0, x1, F + y1, z1);
  const ceil = STORE.h - 0.21;
  for (const [x, z] of GROCERY.hang) {
    add('hang', x - 0.16, 2.3, z - 0.12, x + 0.16, 2.72, z + 0.12);
    add('cord', x - 0.006, 2.72, z - 0.006, x + 0.006, ceil, z + 0.006);
  }
  for (const [x, y, z] of GROCERY.bulbs) add('cord', x - 0.006, y + 0.05, z - 0.006, x + 0.006, ceil, z + 0.006);   // flex cords of the two bulbs
  { const T = GROCERY.tube; for (const x of [T.x0 + 0.1, T.x1 - 0.1]) add('cord', x - 0.008, T.y + 0.02, T.z - 0.008, x + 0.008, ceil, T.z + 0.008); }
  // the back room seen through the staff door: dark walls, one dim cold panel to silhouette whoever stands there
  for (const [, a, b, c, d2, e, f] of annexBoxes()) add('annex', a, b, c, d2, e, f);
  add('annexFloor', 5.9, F, -9.75, 7.1, F + 0.006, -8.5);
  add('backGlow', 5.95, F + 0.25, -9.749, 7.05, F + 2.15, -9.74);
  add('mat', DOORS[0].x0, F, -1.0, DOORS[0].x1, F + 0.012, FACADE_Z - T);
  add('storeCeiling', STORE.x0 + T, STORE.h - 0.212, STORE.z0 + T, STORE.x1 - T, STORE.h - 0.202, STORE.z1 - T);   // dark ceiling under the roof slab
  // next door
  add('bar', -8.4, F, -5.2, -4.0, F + 1.05, -4.6);
  for (const cx of [-7.6, -6.7, -5.8, -4.9]) add('stool', cx - 0.2, F, -4.2, cx + 0.2, F + 0.7, -3.8);
  add('shelf2', -8.6, F, -7.3, -5.0, F + 1.8, -6.9);
  add('nextLightPanel', -7.6, NEXT.h - 0.27, -5.6, -4.4, NEXT.h - 0.2, -5.3);
  add('nextLightPanel', -6.8, NEXT.h - 0.27, -2.4, -5.2, NEXT.h - 0.2, -2.1);
  // street
  add('vendBody', 5.95, F, FACADE_Z, 6.85, F + 1.83, FACADE_Z + 0.7);
  add('vending', 6.03, F + 0.55, FACADE_Z + 0.7, 6.77, F + 1.75, FACADE_Z + 0.72);
  add('vending', 5.94, F + 1.45, FACADE_Z + 0.08, 5.95, F + 1.75, FACADE_Z + 0.62);   // lit strip on the side facing the door
  add('pole', LAMP.x - 0.06, F, LAMP.z - 0.06, LAMP.x + 0.06, LAMP.top - 0.3, LAMP.z + 0.06);
  add('pole', LAMP.x - 0.15, F, LAMP.z - 0.15, LAMP.x + 0.15, F + 0.3, LAMP.z + 0.15);
  add('lamp', LAMP.x - 0.2, LAMP.top - 0.3, LAMP.z - 0.2, LAMP.x + 0.2, LAMP.top, LAMP.z + 0.2);
  add('bench', 0.2, F + 0.38, FACADE_Z + 0.12, 1.8, F + 0.45, FACADE_Z + 0.57);
  for (const x of [0.3, 1.6]) add('bench', x, F, FACADE_Z + 0.15, x + 0.1, F + 0.38, FACADE_Z + 0.54);
  add('fence', STORE.x1, F, FACADE_Z - 0.15, BASE.half, F + 1.0, FACADE_Z + 0.05);
  add('fence', -BASE.half, F, FACADE_Z - 0.15, NEXT.x0, F + 1.0, FACADE_Z + 0.05);
  return V;
}
// Sliding door leaves: two per door, each half the opening, sliding sideways behind the fixed front.
export function doorLeaves(doors) {
  const out = [];
  DOORS.forEach((d, i) => {
    const half = d.w / 2, k = doors[i].k;
    for (const side of [-1, 1]) {
      const cx = d.cx + side * (half / 2 + half * k);
      out.push({ door: i, side, x0: cx - half / 2, x1: cx + half / 2, y0: SIDEWALK_H, y1: SIDEWALK_H + DOOR_H, z0: d.z0 - 0.02, z1: d.z0 + 0.04 });
    }
  });
  return out;
}
export const FLOOR_GRID = { x0: STORE.x0 + WALL_T, x1: STORE.x1 - WALL_T, z0: STORE.z0 + WALL_T, z1: STORE.z1 - WALL_T, step: 0.6, y: SIDEWALK_H + 0.008 };
