// Pure logic for the walk-in exhibit: coordinates, furniture layout, collision, doors, routes and sun position.
// No THREE and no DOM in here, so tests/*.test.cjs can run it under Node.
import house from '../data/house.js';

export { house };
export const M = house.m_per_px;
export const WALL_H = house.wall_height_m;
export const [IW, IH] = house.image_px;
const [BX0, BY0, BX1, BY1] = house.wall_bbox_px;
// Pixels to metres. Origin is the centre of the wall bounding box; north is -z, east is +x.
export const CX = (BX0 + BX1) / 2, CY = (BY0 + BY1) / 2;
export const toX = (px) => (px - CX) * M;
export const toZ = (py) => (py - CY) * M;
export const toPx = (x, z) => [x / M + CX, z / M + CY];

export const clamp01 = (v) => Math.min(1, Math.max(0, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const smooth = (a, b, t) => { const k = clamp01((t - a) / (b - a)); return k * k * (3 - 2 * k); };
export const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const easeOutCubic = (k) => 1 - Math.pow(1 - k, 3);
export const easeOutBack = (k) => { const c1 = 1.4, c3 = c1 + 1; return 1 + c3 * Math.pow(k - 1, 3) + c1 * Math.pow(k - 1, 2); };
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------- plan geometry (pixel space) ----------------
export function pointInPoly(x, y, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
export function inWallPx(x, y) {
  for (const w of house.walls) {
    if (!pointInPoly(x, y, w.outer)) continue;
    if (!w.holes.some((h) => pointInPoly(x, y, h))) return true;
  }
  return false;
}
const inRect = (x, y, [x0, y0, x1, y1], pad = 0) => x >= x0 - pad && x <= x1 + pad && y >= y0 - pad && y <= y1 + pad;
export const insideFootprintPx = (x, y) => pointInPoly(x, y, house.footprint_px);

// ---------------- styles ----------------
// Colours are sRGB hex. A style recolours floor, doors, trim and every piece of furniture together.
export const STYLES = {
  oak: {
    zh: '橡木', en: 'OAK',
    floor: { base: [196, 160, 118], dark: [170, 132, 92], light: [214, 184, 146], seed: 7 },
    wall: '#f3f0ea', door: '#d8bf9a', baseboard: '#f1eee8', frame: '#f4f3f0',
    sofa: '#b7c4b0', sofa2: '#c3cbd6', armchair: '#d6b99a', chair: '#cfc6b8', wood: '#e2cfb4', cabinet: '#efe6d8',
    counter: '#e9e5de', rug: '#d9cbb8', tv: '#e2cfb4', shelf: '#e2cfb4', appliance: '#e6ebee', vanity: '#eef1f3', plant: '#a9c39b', lamp: '#3d3a34',
  },
  walnut: {
    zh: '胡桃木', en: 'WALNUT',
    floor: { base: [104, 70, 48], dark: [80, 52, 36], light: [128, 88, 60], seed: 7 },
    wall: '#eee6db', door: '#5e3f2b', baseboard: '#5b3b27', frame: '#3a3a38',
    sofa: '#6f7884', sofa2: '#8a8173', armchair: '#8a5a44', chair: '#5c4a3d', wood: '#7a563c', cabinet: '#5b4333',
    counter: '#4f463e', rug: '#8c7b6a', tv: '#4a372a', shelf: '#6b4a34', appliance: '#c9ced3', vanity: '#5b4333', plant: '#9dbb8c', lamp: '#2b2a28',
  },
};

// ---------------- furniture layout ----------------
// Plan type -> kit type. "x:" entries are built by extras.js (pieces the upstream kit does not have).
export const TYPE_MAP = {
  sofa: 'sofa', armchair: 'armchair', chair: 'chair', table_round: 'roundtable', table_oval: 'x:ovaltable', coffee_round: 'x:roundcoffee',
  sideboard: 'cabinet', cabinet: 'cabinet', washer: 'washer', toilet: 'toilet', vanity: 'vanity', tv_unit: 'tvstand',
  counter: 'counter', island: 'island', shelf: 'bookshelf', plant: 'plant', plant_small: 'plant', fireplace: 'x:fireplace', stair: 'x:stair',
};
const COLOR_KEY = {
  sofa: 'sofa', armchair: 'armchair', chair: 'chair', table_round: 'wood', table_oval: 'wood', coffee_round: 'wood', sideboard: 'cabinet',
  cabinet: 'cabinet', washer: 'appliance', toilet: null, vanity: 'vanity', tv_unit: 'tv', counter: 'counter', island: 'counter', shelf: 'shelf',
  plant: 'plant', plant_small: 'plant',
};
export const YAW = { n: 0, s: Math.PI, w: Math.PI / 2, e: -Math.PI / 2 };   // the back of a piece (-z) turned towards that side
// Pieces a walker cannot pass through. Chairs and plants are left out so nobody gets stuck between them.
const SOLID = new Set(['sofa', 'armchair', 'table_round', 'table_oval', 'coffee_round', 'sideboard', 'cabinet', 'washer', 'toilet', 'vanity',
  'tv_unit', 'counter', 'island', 'shelf', 'fireplace']);

const SIDES = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
function sideTouchesWall(rect, side, reach = 7) {
  const [x0, y0, x1, y1] = rect, [dx, dy] = SIDES[side];
  const mx = dx ? (dx < 0 ? x0 : x1) : (x0 + x1) / 2, my = dy ? (dy < 0 ? y0 : y1) : (y0 + y1) / 2;
  const px = mx + dx * reach, py = my + dy * reach;
  return inWallPx(px, py) || house.openings.some((o) => o.kind === 'window' && inRect(px, py, o.rect_px)) || !insideFootprintPx(px, py);
}
// Which side a piece backs onto, for the pieces the plan gives no direction for: the long side that touches a wall.
export function inferBack(item) {
  if (item.back) return item.back;
  const [x0, y0, x1, y1] = item.rect_px, w = x1 - x0, h = y1 - y0;
  const order = w >= h * 1.3 ? ['n', 's'] : h >= w * 1.3 ? ['w', 'e'] : ['n', 'w', 's', 'e'];
  return order.find((s) => sideTouchesWall(item.rect_px, s)) || null;
}
function windowBehind(rect, back) {
  if (!back) return false;
  const [x0, y0, x1, y1] = rect;
  return house.openings.some((o) => {
    if (o.kind !== 'window') return false;
    const [a0, b0, a1, b1] = o.rect_px;
    if (back === 'n' || back === 's') {
      const edge = back === 'n' ? y0 : y1, near = back === 'n' ? b1 >= edge - 16 && b1 <= edge + 2 : b0 <= edge + 16 && b0 >= edge - 2;
      return near && a1 > x0 && a0 < x1;
    }
    const edge = back === 'w' ? x0 : x1, near = back === 'w' ? a1 >= edge - 16 && a1 <= edge + 2 : a0 <= edge + 16 && a0 >= edge - 2;
    return near && b1 > y0 && b0 < y1;
  });
}

// Things the plan does not draw but a lived-in room has. Positions are in plan pixels, chosen by eye against the plan.
const DECOR = [
  { type: 'rug', rect_px: [600, 188, 698, 270], back: 'n', colorKey: 'rug' },                 // under the living-room coffee table
  { type: 'rug', rect_px: [566, 448, 618, 528], back: 'w', colorKey: 'rug' },                 // family room, between armchairs and TV
  { type: 'floorlamp', rect_px: [557, 150, 571, 164], back: null, colorKey: 'lamp' },         // behind the living-room armchair
  { type: 'ksink', rect_px: [146, 261, 172, 276], back: 's', colorKey: null },                // double sink drawn on the peninsula
  { type: 'x:pendant', rect_px: [376, 247, 404, 275], back: null, colorKey: 'lamp' },         // over the dining table
];

// One spec per piece: where it stands, how big it is and what colour, independent of any 3D library.
export function furnitureSpecs(styleKey = 'oak') {
  const st = STYLES[styleKey];
  const specs = [];
  let washers = 0;
  const push = (item, i, decor) => {
    const [x0, y0, x1, y1] = item.rect_px;
    const fw = (x1 - x0) * M, fd = (y1 - y0) * M;
    let back = decor ? item.back : inferBack(item);
    let type = decor ? item.type : TYPE_MAP[item.type];
    if (item.type === 'washer' && washers++ === 1) type = 'dryer';
    const longX = fw >= fd;
    const along = back ? back === 'n' || back === 's' : longX;
    let w = along ? fw : fd, d = along ? fd : fw;
    let yaw = back ? YAW[back] : longX ? 0 : Math.PI / 2;
    const opts = {};
    if (item.type === 'counter') {
      const blocked = windowBehind(item.rect_px, back);
      opts.upper = !!back && !blocked;
      opts.splash = !!back && !blocked;
      if (!back) yaw = longX ? Math.PI : Math.PI / 2;   // peninsula: doors face the room, not the run it joins
    }
    if (item.type === 'coffee_round') { w *= 0.72; d *= 0.72; }
    if (item.type === 'table_oval') { w *= 0.94; d *= 0.94; }
    const key = decor ? item.colorKey : COLOR_KEY[item.type];
    let color = key ? st[key] : '#ffffff';
    if (item.type === 'sofa' && i % 2 === 0) color = st.sofa2;
    specs.push({
      id: (decor ? 'd' : 'f') + i, plan: item.type, type, w: Math.round(w * 1000), d: Math.round(d * 1000), color,
      x: toX((x0 + x1) / 2), z: toZ((y0 + y1) / 2), yaw, back, h: item.h || 0, opts,
      seedx: Math.round((x0 + x1) / 2), seedy: Math.round((y0 + y1) / 2),
      rect: [toX(x0), toZ(y0), toX(x1), toZ(y1)], solid: !decor && SOLID.has(item.type), decor: !!decor, stair: item.type === 'stair',
    });
  };
  house.furniture.forEach((it, i) => push(it, i, false));
  DECOR.forEach((it, i) => push(it, i, true));
  return specs;
}

// ---------------- doors ----------------
const LEAF_T = 0.04;
export const DOOR_OPEN = (85 * Math.PI) / 180;
const DOOR_TIME = 0.45;          // seconds from closed to open
const DOOR_NEAR = 1.9, DOOR_FAR = 2.6;   // open inside NEAR, close beyond FAR, keep state in between
const DOOR_PASS = 0.75;          // a door blocks until it is this far open

// Hinged doors with their leaves in world metres. Glazed doors stay shut and leafless openings have no door.
export const DOORS = house.doors.filter((d) => !d.leafless && !d.glazed).map((d) => {
  const [x0, y0, x1, y1] = d.rect_px;
  const leaves = d.leaves.map((lf) => {
    let hx, hz, ax, az, sx, sz;
    if (d.horizontal) {
      hx = toX(lf.hinge); hz = d.exterior ? toZ((y0 + y1) / 2) : toZ(d.swing === 'n' ? y0 : y1) + (d.swing === 'n' ? LEAF_T / 2 : -LEAF_T / 2);
      ax = lf.dir; az = 0; sx = 0; sz = d.swing === 'n' ? -1 : 1;
    } else {
      hz = toZ(lf.hinge); hx = d.exterior ? toX((x0 + x1) / 2) : toX(d.swing === 'w' ? x0 : x1) + (d.swing === 'w' ? LEAF_T / 2 : -LEAF_T / 2);
      az = lf.dir; ax = 0; sx = d.swing === 'w' ? -1 : 1; sz = 0;
    }
    return { hx, hz, ax, az, sx, sz, len: lf.len * M };
  });
  // The closed leaves as segments on the wall centre line; they block until the door is open enough.
  const closed = d.leaves.map((lf) => {
    const a = lf.hinge, b = lf.hinge + lf.dir * lf.len;
    return d.horizontal ? [toX(a), toZ((y0 + y1) / 2), toX(b), toZ((y0 + y1) / 2)] : [toX((x0 + x1) / 2), toZ(a), toX((x0 + x1) / 2), toZ(b)];
  });
  // Parts of the opening no leaf covers are fixed side panels (the entrance door has two).
  const lo = d.horizontal ? x0 : y0, hi = d.horizontal ? x1 : y1;
  const spans = d.leaves.map((lf) => [Math.min(lf.hinge, lf.hinge + lf.dir * lf.len), Math.max(lf.hinge, lf.hinge + lf.dir * lf.len)]).sort((p, q) => p[0] - q[0]);
  const panels = [];
  let cur = lo;
  for (const [a, b] of spans) { if (a - cur > 4) panels.push([cur, a]); cur = Math.max(cur, b); }
  if (hi - cur > 4) panels.push([cur, hi]);
  return {
    id: d.id, note: d.note, exterior: !!d.exterior, horizontal: d.horizontal, rect_px: d.rect_px, leaves, closed,
    panels_px: panels.map(([a, b]) => (d.horizontal ? [a, y0, b, y1] : [x0, a, x1, b])),
    cx: toX((x0 + x1) / 2), cz: toZ((y0 + y1) / 2),
  };
});
// Direction of a leaf at opening fraction k, as a unit vector from the hinge.
export function leafDir(leaf, k) {
  const th = k * DOOR_OPEN, c = Math.cos(th), s = Math.sin(th);
  return [leaf.ax * c + leaf.sx * s, leaf.az * c + leaf.sz * s];
}
export const newDoorState = (k = 0) => DOORS.map(() => ({ k, want: k > 0.5 ? 1 : 0 }));
// Doors open as the walker comes near and close again once they have left. A linear ramp, so the result does not depend on frame rate.
export function stepDoors(state, x, z, dt) {
  DOORS.forEach((d, i) => {
    const s = state[i], dist = Math.hypot(x - d.cx, z - d.cz);
    if (dist < DOOR_NEAR) s.want = 1; else if (dist > DOOR_FAR) s.want = 0;
    s.k = clamp01(s.k + ((s.want ? 1 : -1) * dt) / DOOR_TIME);
  });
}
// Outside walk mode: interior doors stand open as the plan draws them, outer doors are shut.
export function restDoors(state, dt) {
  DOORS.forEach((d, i) => { const s = state[i]; s.want = d.exterior ? 0 : 1; s.k = clamp01(s.k + ((s.want ? 1 : -1) * dt) / DOOR_TIME); });
}

// ---------------- collision ----------------
export const WALK_R = 0.22;       // walker radius, metres
export const EYE_H = 1.6;
function distSeg(x, z, [ax, az, bx, bz]) {
  const dx = bx - ax, dz = bz - az, l2 = dx * dx + dz * dz;
  const t = l2 ? clamp01(((x - ax) * dx + (z - az) * dz) / l2) : 0;
  return Math.hypot(x - (ax + t * dx), z - (az + t * dz));
}
const rectBox = ([x0, y0, x1, y1]) => [toX(x0), toZ(y0), toX(x1), toZ(y1)];
export const COLLIDERS = (() => {
  const segs = [], boxes = [];
  const ring = (poly) => poly.forEach(([x, y], i) => { const [x2, y2] = poly[(i + 1) % poly.length]; segs.push([toX(x), toZ(y), toX(x2), toZ(y2)]); });
  for (const w of house.walls) { ring(w.outer); w.holes.forEach(ring); }
  for (const dw of house.diagonal_windows) ring(dw.quad_px);
  for (const o of house.openings) if (o.kind === 'window') boxes.push(rectBox(o.rect_px));
  for (const d of house.doors) if (d.glazed) boxes.push(rectBox(d.rect_px));
  for (const d of DOORS) for (const p of d.panels_px) boxes.push(rectBox(p));
  const st = house.furniture.filter((f) => f.type === 'stair');
  if (st.length) boxes.push(rectBox([Math.min(...st.map((s) => s.rect_px[0])), Math.min(...st.map((s) => s.rect_px[1])), Math.max(...st.map((s) => s.rect_px[2])), Math.max(...st.map((s) => s.rect_px[3]))]));
  for (const f of house.furniture) if (SOLID.has(f.type)) {
    const b = rectBox(f.rect_px), pad = 0.05;
    boxes.push([b[0] + pad, b[1] + pad, b[2] - pad, b[3] - pad]);
  }
  return { segs, boxes };
})();
export const wallClearance = (x, z) => COLLIDERS.segs.reduce((m, s) => Math.min(m, distSeg(x, z, s)), Infinity);
export function blocked(x, z, doors, r = WALK_R) {
  if (Math.abs(x) > 40 || Math.abs(z) > 40) return true;
  for (const s of COLLIDERS.segs) if (distSeg(x, z, s) < r) return true;
  for (const [x0, z0, x1, z1] of COLLIDERS.boxes) {
    const dx = x - Math.max(x0, Math.min(x, x1)), dz = z - Math.max(z0, Math.min(z, z1));
    if (dx * dx + dz * dz < r * r) return true;
  }
  for (let i = 0; i < DOORS.length; i++) if (doors[i].k < DOOR_PASS) for (const s of DOORS[i].closed) if (distSeg(x, z, s) < r) return true;
  return false;
}
// Move by velocity (vx, vz) m/s for dt seconds, sliding along whatever is in the way. Returns the distance actually covered.
export function stepWalk(pos, vx, vz, dt, doors) {
  const n = Math.max(1, Math.ceil((Math.hypot(vx, vz) * dt) / 0.08));
  const sx = (vx * dt) / n, sz = (vz * dt) / n, x0 = pos.x, z0 = pos.z;
  for (let i = 0; i < n; i++) {
    if (!blocked(pos.x + sx, pos.z, doors)) pos.x += sx;
    if (!blocked(pos.x, pos.z + sz, doors)) pos.z += sz;
  }
  return Math.hypot(pos.x - x0, pos.z - z0);
}

// ---------------- routes ----------------
export const WALK_SPEED = 1.4, RUN_SPEED = 2.6;
// Waypoints in plan pixels. "tour" is what the walk-in button plays: up to the front door, through the hall, into the living room.
export const ROUTES = {
  tour: [[417, 600], [417, 505], [352, 420], [348, 386], [348, 336], [470, 330], [522, 300]],
  family: [[522, 300], [560, 336], [592, 346], [592, 398], [600, 470]],
  kitchen: [[417, 505], [330, 470], [289, 426], [240, 380], [231, 330], [231, 290], [215, 215]],
};
export const START = { x: toX(ROUTES.tour[0][0]), z: toZ(ROUTES.tour[0][1]), yaw: 0 };   // yaw 0 looks north (-z)
// Walk a route with the real collision and door code at a fixed step. Deterministic: same route, same result.
export function autopilot(name, { dt = 1 / 60, speed = WALK_SPEED, maxT = 90, from = null, doors = null } = {}) {
  const pts = ROUTES[name].map(([px, py]) => [toX(px), toZ(py)]);
  const pos = from ? { x: from.x, z: from.z } : { x: pts[0][0], z: pts[0][1] };
  const state = doors || newDoorState(0);
  const log = { name, t: 0, reached: 0, minClear: Infinity, stuck: 0, crossings: [], path: [[pos.x, pos.z]], pos, doors: state, yaw: 0 };
  const side = DOORS.map((d) => (d.horizontal ? Math.sign(pos.z - d.cz) : Math.sign(pos.x - d.cx)));
  let i = from ? 0 : 1, stuckT = 0;
  while (i < pts.length && log.t < maxT) {
    const [tx, tz] = pts[i], dx = tx - pos.x, dz = tz - pos.z, dist = Math.hypot(dx, dz);
    if (dist < 0.12) { i++; log.reached = i; continue; }
    stepDoors(state, pos.x, pos.z, dt);
    const moved = stepWalk(pos, (dx / dist) * speed, (dz / dist) * speed, dt, state);
    log.yaw = Math.atan2(-dx, -dz);
    stuckT = moved < speed * dt * 0.2 ? stuckT + dt : 0;
    log.stuck = Math.max(log.stuck, stuckT);
    log.minClear = Math.min(log.minClear, wallClearance(pos.x, pos.z));
    DOORS.forEach((d, k) => {
      const along = d.horizontal ? pos.x : pos.z, c = d.horizontal ? d.cx : d.cz, half = ((d.horizontal ? d.rect_px[2] - d.rect_px[0] : d.rect_px[3] - d.rect_px[1]) * M) / 2;
      const s = d.horizontal ? Math.sign(pos.z - d.cz) : Math.sign(pos.x - d.cx);
      if (s && s !== side[k]) { if (Math.abs(along - c) <= half) log.crossings.push({ id: d.id, k: state[k].k, t: log.t }); side[k] = s; }
    });
    log.t += dt;
    log.path.push([pos.x, pos.z]);
  }
  log.reached = i;
  log.done = i >= pts.length;
  return log;
}

// ---------------- sun ----------------
const SUN = house.sun;
const hm = (s) => { const [h, m] = s.split(':').map(Number); return h * 60 + m; };
export const SUNRISE = hm(SUN.sunrise), SUNSET = hm(SUN.sunset);
// Sun azimuth (degrees clockwise from north) and altitude at a minute of the day, interpolated between the 5-minute steps.
export function sunAt(min) {
  const st = SUN.steps, n = st.length;
  const at = (a, b) => { const k = (min - a[0]) / (b[0] - a[0]); return { az: lerp(a[1], b[1], k), alt: lerp(a[2], b[2], k) }; };
  if (min <= st[0][0]) return at(st[0], st[1]);
  if (min >= st[n - 1][0]) return at(st[n - 2], st[n - 1]);
  for (let i = 0; i < n - 1; i++) if (min >= st[i][0] && min <= st[i + 1][0]) return at(st[i], st[i + 1]);
  return { az: st[n - 1][1], alt: st[n - 1][2] };
}
// Unit vector pointing at the sun. North is -z, east is +x.
export function sunVec(az, alt) {
  const a = (az * Math.PI) / 180, e = (alt * Math.PI) / 180;
  return [Math.cos(e) * Math.sin(a), Math.sin(e), -Math.cos(e) * Math.cos(a)];
}
export const clock = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(Math.round(min) % 60).padStart(2, '0')}`;

// ---------------- camera presets ----------------
// Orbit poses: target (metres), polar angle from straight down, azimuth, distance, field of view.
const room = (name) => house.rooms.find((r) => r.name_zh === name);
const roomPose = (name, az, polar = 0.72, k = 1) => {
  const r = room(name), xs = r.polygon_px.map((p) => p[0]), ys = r.polygon_px.map((p) => p[1]);
  const size = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) * M;
  return { target: [toX(r.center_px[0]), 0.6, toZ(r.center_px[1])], polar, az, r: (size * 1.25 + 3) * k, fov: 35 };
};
export const VIEWS = {
  hero: { zh: '鸟瞰', target: [0, 0.3, 0.6], polar: 0.84, az: -0.72, azNarrow: -1.9, r: 27, fov: 35, fit: true },
  top: { zh: '平面', target: [0, 0, 0.6], polar: 0.0006, az: 0, azNarrow: -Math.PI / 2, r: 30, fov: 35, fit: true },
  living: { zh: '客餐厅', ...roomPose('客餐厅', 0.5, 0.78, 0.92) },
  kitchen: { zh: '厨房', ...roomPose('厨房', 0.9, 0.7) },
  family: { zh: '家庭室', ...roomPose('家庭室', -0.6, 0.72, 1.1) },
  entry: { zh: '门厅', ...roomPose('门厅', 0.15, 0.74, 1.05) },
};
export const VIEW_KEYS = Object.keys(VIEWS);
// Position of an orbit camera from its pose.
export function posePosition(p, r = p.r) {
  return [p.target[0] + r * Math.sin(p.polar) * Math.sin(p.az), p.target[1] + r * Math.cos(p.polar), p.target[2] + r * Math.sin(p.polar) * Math.cos(p.az)];
}
// Footprint extent in metres, used to pull the whole-house views back on narrow screens.
export const EXTENT = (() => {
  const xs = house.footprint_px.map((p) => toX(p[0])), zs = house.footprint_px.map((p) => toZ(p[1]));
  return { x0: Math.min(...xs), x1: Math.max(...xs), z0: Math.min(...zs), z1: Math.max(...zs) };
})();
