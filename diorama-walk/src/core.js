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
  storeRoof: '#AAB0B9', nextRoof: '#6C5747', storeFloor: '#C7CBD1', storeGrid: '#8D949E', nextFloor: '#5E4B3D',
  shelf: '#8B94A1', shelfBoard: '#B7BEC8', freezerBody: '#A9B2BE', counter: '#7D8591', dark: '#11151D', mat: '#3A4252',
  frame: '#2B313B', bar: '#5A4436', stool: '#3E3A37', shelf2: '#4D3D33', vendBody: '#B5BFCC', pole: '#3A404B',
  bench: '#5F5246', fence: '#2E343E', stripe: '#8E949E', storeCeiling: '#D2D6DC', ceilingGrid: '#8A919B', signText: '#1E2532', sign2Text: '#3A2618', annex: '#1C2028', annexFloor: '#15181F', backGlow: '#2C3B44',
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

export const STORE = { id: 'store', name: '便利店', x0: -3, x1: 9, z0: -8.5, z1: FACADE_Z, h: 3.6, door: { cx: 5.0, w: 1.8 } };
export const NEXT = { id: 'next', name: '隔壁小店', x0: -9, x1: -3, z0: -7.5, z1: FACADE_Z, h: 3.4, door: { cx: -6.0, w: 1.2 } };
export const BUILDINGS = [STORE, NEXT];
export const ANNEX = { x0: 5.75, x1: 7.25, z0: -9.9, z1: -8.5, h: 2.5, t: 0.15 };   // the back room behind the staff door (惊吓版)
const annexBoxes = () => { const A = ANNEX; return [['annex-w', A.x0, 0, A.z0, A.x0 + A.t, A.h, A.z1], ['annex-e', A.x1 - A.t, 0, A.z0, A.x1, A.h, A.z1], ['annex-back', A.x0, 0, A.z0, A.x1, A.h, A.z0 + A.t], ['annex-roof', A.x0, A.h - A.t, A.z0, A.x1, A.h, A.z1]]; };

// Doors: proximity opening, frame-rate independent (SPEC 里面怎么走 / 碰撞)
export const DOOR_NEAR = 2.2, DOOR_SPEED = 1.6, DOOR_PASS = 0.75;
export const DOORS = BUILDINGS.map((b) => ({
  id: b.id, cx: b.door.cx, cz: b.z1 - WALL_T / 2, w: b.door.w,
  x0: b.door.cx - b.door.w / 2, x1: b.door.cx + b.door.w / 2, z0: b.z1 - WALL_T, z1: b.z1,
}));
export const newDoors = () => DOORS.map(() => ({ k: 0, want: 0 }));

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
  // convenience store: three shelf rows (5 x 0.6 x 1.5), freezers on the back wall (7 x 0.7 x 2.0), till (2.4 x 0.6 x 1.0)
  for (const cx of [-1.2, 0.8, 2.8]) S.push(B3('shelf@' + cx, 'furniture', cx - 0.3, F, -6.2, cx + 0.3, F + 1.5, -1.2));
  S.push(B3('freezer', 'furniture', -2.0, F, -8.3, 5.0, F + 2.0, -7.6));
  S.push(B3('counter', 'furniture', 7.0, F, -3.0, 7.6, F + 1.0, -0.6));          // till near the glass: the figure behind it shows from outside
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
// The staff door on the store's back wall: hinged at x 6.0, swings into the store. Half open (35 deg) normally; the
// scare version opens it wide (80 deg) and slams it shut. Its box is the axis-aligned box of the leaf.
export const BACKDOOR = { hx: 6.0, hz: -8.3, w: 1.0, h: 2.1, half: (35 * Math.PI) / 180, wide: (80 * Math.PI) / 180, cx: 6.5, cz: -8.3 };
export function backdoorBox(angle) {
  const ex = BACKDOOR.hx + Math.cos(angle) * BACKDOOR.w, ez = BACKDOOR.hz + Math.sin(angle) * BACKDOOR.w;
  return [Math.min(BACKDOOR.hx, ex) - 0.02, BACKDOOR.hz, Math.max(BACKDOOR.hx, ex) + 0.02, Math.max(BACKDOOR.hz + 0.04, ez + 0.02)];
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
  const cuts = [0, ta * dt, tb * dt, dt];
  if (ov) for (const c of [ov[0] - t0, ov[1] - t0]) if (c > 0 && c < dt) cuts.push(c);
  cuts.sort((a, b) => a - b);
  for (let i = 0; i + 1 < cuts.length; i++) {
    const a = cuts[i], b = cuts[i + 1];
    if (b - a <= 1e-12) continue;
    const m = (a + b) / 2, want = (m > ta * dt && m < tb * dt) || (ov && t0 + m >= ov[0] && t0 + m < ov[1]) ? 1 : 0;
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
    window: { x: STORE.door.cx - STORE.door.w / 2 - 0.5, z: FACADE_Z - 0.05 - 0.4, yaw: Math.PI },    // left of the door, 0.4 m behind the glass, facing the street
    backroom: { x: 6.55, z: -9.0, yaw: Math.PI },                                                  // in the staff doorway, facing into the store
  },
  e0: { delay: 0.2, dark: 0.35, level: 0.03 },
  e2: { x0: -2.0, x1: 5.0, z0: -7.6, z1: -7.6 + 1.8, sections: 5, step: 0.12, silence: 1.6 },
  e3: { dist: 5, extra: (10 * Math.PI) / 180, hold: 1.2 },
  e4: { dist: 1.6, hingeClear: 1.3, reveal: 0.25, slam: 0.12, shake: 0.025, shakeTime: 0.25, darken: 0.1, vibrate: [90, 50, 140] },
  e5: { above: 0.2 },
};
export const E2_DARK = (HORROR.e2.sections - 1) * HORROR.e2.step;     // last freezer section off: the silence starts
export const E2_TOTAL = E2_DARK + HORROR.e2.silence;                   // everything back on
export const E4_BANG = HORROR.e4.reveal + HORROR.e4.slam;              // the door hits the frame
// Sound levels: rain plus both hums is the base; the doorbell about 2x, the bang about 4x (SPEC 声音).
export const AUDIO = { fluor: 0.05, freezer: 0.06, bell: 2, slam: 4, sting: 1.6 };
export function audioLevels(s, hum = 1) {
  const inside = smooth(0.6, 1, s), rain = MAP.volume(s), base = rain + (AUDIO.fluor + AUDIO.freezer) * inside;
  return { rain, fluor: AUDIO.fluor * inside * hum, freezer: AUDIO.freezer * inside * hum, base, bell: AUDIO.bell * base, slam: AUDIO.slam * base, sting: AUDIO.sting * base };
}
const DOOR0_EYE = [STORE.door.cx, SIDEWALK_H + DOOR_H / 2, FACADE_Z - WALL_T / 2];
const BACKDOOR_C = [BACKDOOR.cx, SIDEWALK_H + BACKDOOR.h / 2, BACKDOOR.cz];
// Opaque boxes for "can the camera see this point": every solid except the glazed store front, plus its fascia and kerb.
const OCCLUDERS = STATIC_SOLIDS.filter((b) => !['store:front-l', 'store:front-r', 'store:lintel'].includes(b.id))
  .concat([B3('store:fascia', STORE.x0, 2.8, STORE.z1 - WALL_T, STORE.x1, STORE.h, STORE.z1, { lift: 'store' }), B3('store:kerb', STORE.x0, 0, STORE.z1 - WALL_T, STORE.x1, SIDEWALK_H + 0.06, STORE.z1)]);
export const figurePoints = (spot) => { const F = SIDEWALK_H, f = HORROR.figure, p = HORROR.spots[spot];
  return [[p.x, F + 0.85, p.z], [p.x, F + f.h - 0.02, p.z], [p.x, F + 0.1, p.z], [p.x - f.bodyR, F + 0.85, p.z], [p.x + f.bodyR, F + 0.85, p.z]]; };
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
const angleTo = (cam, p) => { const { f } = basis(cam.yaw, cam.pitch), d = [p[0] - cam.x, p[1] - cam.y, p[2] - cam.z], L = Math.hypot(...d); return Math.acos(clamp((f[0] * d[0] + f[1] * d[1] + f[2] * d[2]) / L, -1, 1)); };
function createHorror(S, calm) {
  const blank = () => ({ E0: null, E1: null, E2: null, E3: null, E4: null, E5: null });
  const H = { calm, visit: 0, figure: calm ? null : 'counter', fired: blank(), done: { E2: false, E3: false, E4: false }, e0: null, e2: null, e3: null, e4: null, wideAt: null, e5Plan: null, e5Dark: null,
    sounds: [], vibes: [], history: [] };
  const fire = (name, t) => { H.fired[name] = t; H.history.push({ e: name, t, visit: H.visit }); };
  const backAngle = (t) => {
    if (H.e4 && t >= H.e4.t0 + HORROR.e4.reveal) return BACKDOOR.wide * Math.max(0, 1 - (t - H.e4.t0 - HORROR.e4.reveal) / HORROR.e4.slam);
    return H.wideAt !== null && t >= H.wideAt ? BACKDOOR.wide : BACKDOOR.half;
  };
  const dark = (b, t) => b && t >= b.start && t < b.end;
  const light = (t) => (dark(H.e0, t) || dark(H.e5Dark, t) ? HORROR.e0.level : 1);
  const freezer = (t) => [0, 1, 2, 3, 4].map((i) => (H.e2 && t >= H.e2.t0 + (4 - i) * HORROR.e2.step && t < H.e2.t0 + E2_TOTAL ? 0 : 1) * light(t));
  const hum = (t) => (H.e2 && t >= H.e2.t0 + E2_DARK && t < H.e2.t0 + E2_TOTAL ? 0 : 1);
  const scare = (t) => !!(H.e4 && t >= H.e4.t0 && t < H.e4.t0 + E4_BANG);
  const shake = (t) => {
    const u = H.e4 ? t - H.e4.t0 - E4_BANG : -1;
    if (u < 0 || u >= HORROR.e4.shakeTime) return [0, 0, 0];
    const a = HORROR.e4.shake * (1 - u / HORROR.e4.shakeTime);
    return [a * Math.sin(2 * Math.PI * 26 * u), 0.6 * a * Math.sin(2 * Math.PI * 33 * u + 1.3), 0];
  };
  const darken = (t) => { const u = H.e4 ? t - H.e4.t0 - E4_BANG : -1; return u >= 0 && u < HORROR.e4.darken ? 1 : 0; };
  const startE3 = (t, k0) => {
    const holdEnd = t + (1 - k0) / DOOR_SPEED + HORROR.e3.hold;
    H.e3 = { t0: t, k0, holdEnd, closedAt: holdEnd + 1 / DOOR_SPEED }; H.done.E3 = true; fire('E3', t);
  };
  const startE4 = (t) => {
    H.e4 = { t0: t, bang: t + E4_BANG }; H.done.E4 = true; fire('E4', t);
    H.sounds.push({ kind: 'slam', t: t + E4_BANG }, { kind: 'sting', t: t + E4_BANG });
    H.vibes.push({ t: t + E4_BANG, pattern: HORROR.e4.vibrate.slice() });
  };
  function evalAt(t, P, kAt) {
    if (H.e0 && !H.e0.done && t >= H.e0.removeAt - 1e-9) { H.figure = null; H.e0.done = true; fire('E0', H.e0.removeAt); }
    if (H.calm) return;
    if (P.mode === 'walk') {
      const e2 = HORROR.e2;
      if (!H.done.E2 && P.x > e2.x0 && P.x < e2.x1 && P.z > e2.z0 && P.z < e2.z1) { H.e2 = { t0: t }; H.done.E2 = true; fire('E2', t); }
      if (H.e2 && !H.done.E3 && t >= H.e2.t0 + E2_TOTAL - 1e-9 && Math.hypot(P.x - DOOR0_EYE[0], P.z - DOOR0_EYE[2]) >= HORROR.e3.dist
        && angleTo(P.cam, DOOR0_EYE) > rad(P.hfov / 2) + HORROR.e3.extra) startE3(t, kAt(t));
      // the staff door swings wide unseen, and never into the walker: out of view, and the walker outside its sweep
      if (H.e3 && H.wideAt === null && t >= H.e3.closedAt - 1e-9 && angleTo(P.cam, BACKDOOR_C) > rad(P.hfov / 2) + HORROR.e3.extra
        && Math.hypot(P.x - BACKDOOR.hx, P.z - BACKDOOR.hz) >= HORROR.e4.hingeClear) H.wideAt = t;
      if (H.wideAt !== null && !H.done.E4 && Math.hypot(P.x - BACKDOOR.cx, P.z - BACKDOOR.cz) <= HORROR.e4.dist && Math.hypot(P.x - BACKDOOR.hx, P.z - BACKDOOR.hz) >= HORROR.e4.hingeClear) {
        const q = project(P.cam, P.fov, P.aspect, BACKDOOR_C);
        if (q.depth > 0.05 && Math.abs(q.x - 0.5) <= 1 / 6 && q.y > 0 && q.y < 1) startE4(t);
      }
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
    H, backAngle, light, freezer, hum, scare, shake, darken,
    onEnterStart(t) {
      H.visit++; H.fired = blank(); H.done = { E2: false, E3: false, E4: false }; H.e2 = H.e3 = H.e4 = null; H.wideAt = null; H.e5Plan = null; H.e5Dark = null;
      H.e0 = !H.calm && H.figure ? { start: t + HORROR.e0.delay, end: t + HORROR.e0.delay + HORROR.e0.dark, removeAt: t + HORROR.e0.delay + HORROR.e0.dark / 2, done: false } : null;
    },
    // The exit path is fixed once it starts, so E5 looks ahead along it on the same tick grid: the first tick above the
    // roofs at which the camera cannot see the spot behind the glass. If the camera sees that spot all the way up
    // (leaving while facing the shop from across the street), the shop lights cut for 0.35 s at the first tick above the
    // roofs, as in E0, and the figure is placed in the dark.
    onExitStart(t0, poseAt, dur) {
      H.e5Plan = null; H.e5Dark = null;
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
    onExitFinish() { H.done = { E2: false, E3: false, E4: false }; H.e2 = H.e3 = H.e4 = null; H.wideAt = null; },
    advance(t0, t1, poseAt, kAt) { for (let k = Math.floor(t0 / HORROR.tick + 1e-6) + 1; k * HORROR.tick <= t1 + 1e-9; k++) { const t = k * HORROR.tick; evalAt(t, poseAt(Math.min(t, t1)), kAt); } },
    doorOverride: () => (H.e3 ? [H.e3.t0, H.e3.holdEnd] : null),
    onDoorOpen(i, t) { H.sounds.push({ kind: 'bell', t, door: DOORS[i].id }); fire('E1', t); },
    trigger(name, t, k0 = 0) {
      if (name === 'E1') { H.sounds.push({ kind: 'bell', t, door: 'store' }); fire('E1', t); return true; }
      if (H.calm) return false;
      if (name === 'E0') { if (!H.figure) return false; H.e0 = { start: t, end: t + HORROR.e0.dark, removeAt: t + HORROR.e0.dark / 2, done: false }; return true; }
      if (name === 'E2') { H.e2 = { t0: t }; H.done.E2 = true; fire('E2', t); return true; }
      if (name === 'E3') { startE3(t, k0); return true; }
      if (name === 'E4') { if (H.wideAt === null) H.wideAt = t; startE4(t); return true; }
      if (name === 'E5') { H.figure = 'window'; H.e5Plan = null; fire('E5', t); return true; }
      return false;
    },
    snapshot(t) {
      return { visit: H.visit, fired: { ...H.fired }, figure: H.figure, calm: H.calm, scare: scare(t), light: light(t), freezer: freezer(t), hum: hum(t), back: (backAngle(t) * 180) / Math.PI,
        shake: shake(t), darken: darken(t), done: { ...H.done }, wideAt: H.wideAt, e5Plan: H.e5Plan && { ...H.e5Plan }, e5Dark: H.e5Dark && { ...H.e5Dark }, e0: H.e0 && { ...H.e0 }, e2: H.e2 && { ...H.e2 }, e3: H.e3 && { ...H.e3 }, e4: H.e4 && { ...H.e4 },
        sounds: H.sounds.map((x) => ({ ...x })), vibes: H.vibes.map((x) => ({ ...x, pattern: x.pattern.slice() })), history: H.history.map((x) => ({ ...x })) };
    },
  };
}

// ---------------- the simulation ----------------
// ---------------- 第四轮：摇杆、手机转头、「看整间店」 (SPEC 店里的操作与「看整间店」视角) ----------------
export const PAD = { left: 0.45, radius: 60, dead: 0.1, tapPx: 8, tapMs: 300, pinch: 0.75, gain: 1.6 };
export const LOOK_MOUSE = 0.005, ROT_MOUSE = 0.006, ROT_TOUCH = 0.006;   // rad per css px: mouse look, orbit drag (unchanged since round 1)
export const touchTurn = (px, width) => (px * Math.PI) / Math.max(1, width);   // touch look: a swipe across the whole width turns 180 deg
// Joystick: finger offset (dx, dy) in css px from where it came down -> walking velocity relative to the view.
export function joyVelocity(dx, dy, yaw) {
  const L = Math.hypot(dx, dy), m = Math.min(1, L / PAD.radius);
  if (m < PAD.dead) return { vx: 0, vz: 0, m };
  const ux = dx / L, uy = dy / L, sp = WALK_SPEED * m, sn = Math.sin(yaw), cs = Math.cos(yaw);
  return { vx: (sn * uy + cs * ux) * sp, vz: (cs * uy - sn * ux) * sp, m };        // screen up = forward (-sin, -cos), right = (cos, -sin)
}
export const ROOM = { rise: 1.0, land: 1.0, phi: 0.6, phiRange: [0.25, 1.0], margin: 0.06, fog: 0.008, roofBack: [0.1, 0.55] };
export const fovRoom = (aspect) => clamp(deg(2 * Math.atan(Math.tan(rad(20)) / Math.min(1, aspect))), 40, 80);   // 40 deg each way at least
export const roomInterior = (b) => ({ x0: b.x0 + WALL_T, x1: b.x1 - WALL_T, z0: b.z0 + WALL_T, z1: b.z1 - WALL_T });
export const roomFloor = (b) => { const A = roomInterior(b), F = SIDEWALK_H; return [[A.x0, F, A.z0], [A.x1, F, A.z0], [A.x1, F, A.z1], [A.x0, F, A.z1]]; };
// The room view: an orbit round the shop's floor centre, from far enough that the floor and the wall tops are all in frame.
export function roomOrbit(b, theta, phi, aspect) {
  const A = roomInterior(b), cx = (A.x0 + A.x1) / 2, cz = (A.z0 + A.z1) / 2, cy = SIDEWALK_H, fov = fovRoom(aspect), top = b.h - 0.2;
  const pts = roomFloor(b).concat(roomFloor(b).map(([x, , z]) => [x, top, z]));
  const fits = (r) => { const cam = orbitCamera({ cx, cy, cz, r, theta, phi }); return pts.every((q) => { const v = project(cam, fov, aspect, q); return v.depth > 0.1 && v.x >= ROOM.margin && v.x <= 1 - ROOM.margin && v.y >= ROOM.margin && v.y <= 1 - ROOM.margin; }); };
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
    p.route = null; p.input = [0, 0]; p.look = null; p.joy = null;
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
      Object.assign(p, { x: L.x, z: L.z, eyeY: groundAt(L.x, L.z) + EYE_H, yaw: tr.kind === 'enter' ? L.yaw : tr.yawG, pitch: 0, route: null, ri: 0, stuck: 0, input: [0, 0], look: null, joy: null });
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
    const room = roomOrbit(b, p.yaw, ROOM.phi, S.aspect), c = orbitCamera(room);
    S.room = room; S.lift = b.id;
    const P0 = [c.x, c.y, c.z], P2 = [p.x, p.eyeY, p.z], ch = controlHeight(P0, P2, b.id);
    if (ch.raised) S.raised++;
    S.trans = { kind: 'rise', tau: 0, dur: ROOM.rise, P0, P1: [p.x, Math.max(ch.h, c.y), p.z], P2, yawO: c.yaw, pitchO: c.pitch, yawG: p.yaw, pitchG: p.pitch, s0: 1, raised: ch.raised };
    p.route = null; p.input = [0, 0]; p.look = null; p.joy = null;
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
    const p = S.player, boxes = walkBoxes(S.doors, HZ.backAngle(t0)), path = [];
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
      const e = Math.exp(-5 * (t - t0)), yaw = look ? look.yaw + wrapAngle(yaw0 - look.yaw) * e : yaw0, pitch = look ? look.pitch + (pitch0 - look.pitch) * e : pitch0;
      return { mode: 'walk', x, z, cam: { x, y: groundAt(x, z) + EYE_H, z, yaw, pitch }, fov: fovIn, hfov: hIn, aspect: S.aspect, lift: null };
    };
    HZ.advance(t0, t0 + dt, poseAt, (t) => Math.max(0, k0 - DOOR_SPEED * (t - t0)));
    stepDoorsPath(S.doors, path, t0, HZ.doorOverride(), HZ.onDoorOpen);
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
    Object.assign(S.player, { x, z, yaw, eyeY: groundAt(x, z) + EYE_H, route: null, input: [0, 0], look: null, stuck: 0 });
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
      player: { x: p.x, z: p.z, yaw: p.yaw, pitch: p.pitch, walking: !!p.route, looking: !!p.look, joy: p.joy && [...p.joy], stuck: p.stuck },
      trigger: S.trigger && { orbit: { ...S.trigger.orbit }, z: S.trigger.z, s: S.trigger.s, hit: S.trigger.hit },
      landing: S.landing && { ...S.landing }, lift: S.lift, entries: S.entries, exits: S.exits, raised: S.raised,
      transition: S.trans && { kind: S.trans.kind, tau: S.trans.tau, dur: S.trans.dur, raised: S.trans.raised, room: !!S.trans.room, target: S.trans.target && { ...S.trans.target } },
      back: (HZ.backAngle(S.t) * 180) / Math.PI,
    };
  }
  const horror = () => HZ.snapshot(S.t);
  const trigger = (name) => { const ok = HZ.trigger(name, S.t, S.doors[0].k); refresh(); return ok; };
  const levels = () => ({ light: HZ.light(S.t), freezer: HZ.freezer(S.t), hum: HZ.hum(S.t), back: HZ.backAngle(S.t), figure: S.h.figure, scare: HZ.scare(S.t), shake: HZ.shake(S.t), darken: HZ.darken(S.t), audio: audioLevels(S.s, HZ.hum(S.t)) });
  refresh();
  return { S, update, refresh, rotate, zoomAt, enter, exit, walkTo, walkRoute, drive, lookBy, lookAt, place, setAspect, advanceToS, snapshot, fov: fovNow, horror, trigger, levels,
    looksNow, roofs, back, escape, landAt, landAtPoint, groundPoint, roomRotate, tapAt, joy, joyEnd };
}

// ---------------- touch: joystick, look, pinch, tap (SPEC 店里的操作) ----------------
// Pure: the page feeds pointer events (css px, ms), the pad drives the simulation. A finger that comes down in the left
// 45% while walking is the joystick (one at a time); any other finger is free. Two free fingers are a pinch; one free
// finger drags (orbit: rotate; walking: turn the head, a full screen width = 180 deg; room view: go round the shop).
// The joystick finger is never part of a pinch. A short press (< 8 px, < 300 ms) with nothing else down is a tap.
export function createTouchPad(sim, { width = 390, height = 844 } = {}) {
  const pts = new Map();
  let W = width, H = height, joyId = null, dragId = null, pinch = null;
  const mode = () => sim.S.mode, free = () => [...pts.keys()].filter((k) => k !== joyId);
  return {
    resize(w, h) { W = Math.max(1, w); H = Math.max(1, h); },
    get joy() { const p = joyId != null && pts.get(joyId); return p ? { x0: p.x0, y0: p.y0, x: p.x, y: p.y } : null; },
    get pinching() { return !!pinch; },
    down(id, x, y, t) {
      const p = { x, y, x0: x, y0: y, t0: t, live: false, spent: false };
      pts.set(id, p);
      if (mode() === 'walk' && joyId === null && x < PAD.left * W) { joyId = id; return; }
      const f = free();
      if (f.length === 2) { const [a, b] = f.map((k) => pts.get(k)), d = Math.hypot(a.x - b.x, a.y - b.y); pinch = { ids: f, d0: d, d, done: false }; dragId = null; }
      else if (f.length === 1) dragId = id;
    },
    move(id, x, y) {
      const p = pts.get(id);
      if (!p) return;
      const dx = x - p.x, dy = y - p.y;
      p.x = x; p.y = y;
      if (Math.hypot(x - p.x0, y - p.y0) >= PAD.tapPx) p.live = true;
      if (id === joyId) { sim.joy(x - p.x0, y - p.y0); return; }
      if (pinch && pinch.ids.includes(id)) {
        const [a, b] = pinch.ids.map((k) => pts.get(k)), d = Math.hypot(a.x - b.x, a.y - b.y), m = mode(), mx = (a.x + b.x) / 2 / W, my = (a.y + b.y) / 2 / H;
        if (m === 'orbit') { if (d > 1 && pinch.d > 1) sim.zoomAt(Math.pow(pinch.d / d, PAD.gain), mx, my); }
        else if (!pinch.done && d < PAD.pinch * pinch.d0 && (m === 'walk' || m === 'room')) { pinch.done = true; sim.back(); }
        else if (!pinch.done && d > pinch.d0 / PAD.pinch && m === 'room') { pinch.done = true; sim.landAt(mx, my); }
        pinch.d = d;
        return;
      }
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
// A scripted visit for the scare version: freezers (E2), the door behind you (E3), the staff door (E4), then out (E5).
export const SCARE_PLAN = { aisle: [[5.0, -0.6], [4.2, -6.5]], behind: [4.2, 1.6, 2.5], staff: [BACKDOOR.cx, SIDEWALK_H + 1.05, BACKDOOR.cz], near: [6.5, -6.85], out: [[5.0, -0.6], [5.0, 3.1]] };
export function playScare(sim, { dt = DT_VIEW, upTo = 'out', after = 0, aim = 'door' } = {}) {
  const S = sim.S, h = () => sim.horror(), until = (pred, maxT = 30) => { let t = 0; for (; t < maxT && !pred(); t += dt) sim.update(dt); return t; };
  const P = SCARE_PLAN, log = {};
  sim.enter(aim); until(() => S.mode === 'walk', 10);
  sim.walkRoute(P.aisle); until(() => !S.player.route);
  until(() => h().e2 && S.t >= h().e2.t0 + E2_TOTAL, 5);
  if (upTo === 'E2') { until(() => false, after); return log; }
  if (upTo === 'reveal') { sim.walkRoute(P.out); until(() => !S.player.route, 20); sim.exit(); until(() => S.mode === 'orbit', 5); until(() => false, after); return log; }
  until(() => h().e3 && S.t >= h().e3.closedAt, 6);
  sim.lookAt(...P.behind); until(() => !S.player.look, 6);
  sim.lookAt(...P.staff); until(() => !S.player.look, 6);
  sim.walkTo(...P.near); until(() => !S.player.route, 6);
  sim.lookAt(...P.staff); until(() => !!h().e4 || !S.player.look, 6);
  if (upTo === 'scare') { const t4 = h().e4 && h().e4.t0; if (t4 != null) until(() => S.t >= t4 + after, 2); return log; }
  until(() => h().e4 && S.t >= h().e4.bang + 0.6, 6);
  if (upTo === 'E4') return log;
  sim.walkRoute(P.out); until(() => !S.player.route, 20);
  sim.exit(); until(() => S.mode === 'orbit', 5);
  return log;
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
    if (b.id === 'store') {                         // whole front glazed up to 2.8 m, fascia above
      add(wall + ':upper', b.x0 + T, 2.8, b.z1 - T, b.x1 - T, top, b.z1);
      add(wall, b.x0 + T, 0, b.z1 - T, b.x1 - T, F + 0.06, b.z1);                    // kerb under the glass
      add('glass', b.x0 + T, F + 0.06, b.z1 - 0.07, d.x0, 2.8, b.z1 - 0.03);
      add('glass', d.x1, F + 0.06, b.z1 - 0.07, b.x1 - T, 2.8, b.z1 - 0.03);
      add('glassTransom', d.x0, F + DOOR_H, b.z1 - 0.07, d.x1, 2.8, b.z1 - 0.03);  // transom over the door (lifts with the fascia)
      for (const x of [b.x0 + T, -0.3, 2.0, d.x0, d.x1, 7.4, b.x1 - T]) add('frame', x - 0.025, F, b.z1 - 0.09, x + 0.025, 2.8, b.z1 - 0.01);
      add('frame', d.x0, F + DOOR_H - 0.025, b.z1 - 0.09, d.x1, F + DOOR_H + 0.025, b.z1 - 0.01);
      add('sign', d.cx - 1.5, 2.95, b.z1, d.cx + 1.5, 3.3, b.z1 + 0.06);
      for (let i = 0; i < 4; i++) add('signText', d.cx - 1.225 + i * 0.65, 3.0, b.z1 + 0.06, d.cx - 0.725 + i * 0.65, 3.25, b.z1 + 0.075);   // four letter blocks
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
  // store interior
  for (const cx of [-1.2, 0.8, 2.8]) {
    add('shelf', cx - 0.3, F, -6.2, cx + 0.3, F + 1.5, -1.2);
    for (const y of [0.45, 0.85, 1.25]) add('shelfBoard', cx - 0.32, F + y, -6.2, cx + 0.32, F + y + 0.03, -1.2);
  }
  add('freezerBody', -2.0, F, -8.3, 5.0, F + 2.0, -7.6);
  for (let i = 0; i < 5; i++) add('freezer' + i, -2.0 + i * 1.4 + 0.05, F + 0.25, -7.6, -2.0 + (i + 1) * 1.4 - 0.05, F + 1.85, -7.58);   // five doors, dimmed one by one in E2
  for (let i = 1; i < 5; i++) add('frame', -2.0 + i * 1.4 - 0.03, F + 0.25, -7.6, -2.0 + i * 1.4 + 0.03, F + 1.85, -7.56);
  add('counter', 7.0, F, -3.0, 7.6, F + 1.0, -0.6);
  // the back room seen through the staff door: dark walls, one dim cold panel to silhouette whoever stands there
  for (const [, a, b, c, d2, e, f] of annexBoxes()) add('annex', a, b, c, d2, e, f);
  add('annexFloor', 5.9, F, -9.75, 7.1, F + 0.006, -8.5);
  add('backGlow', 5.95, F + 0.25, -9.749, 7.05, F + 2.15, -9.74);
  add('mat', DOORS[0].x0, F, -1.0, DOORS[0].x1, F + 0.012, FACADE_Z - T);
  add('storeCeiling', STORE.x0 + T, STORE.h - 0.212, STORE.z0 + T, STORE.x1 - T, STORE.h - 0.202, STORE.z1 - T);   // light ceiling under the roof slab
  for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) add('storeLightPanel', -1.6 + i * 2.9, STORE.h - 0.27, -6.6 + j * 2.6, -0.4 + i * 2.9, STORE.h - 0.2, -6.25 + j * 2.6);
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
