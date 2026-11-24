// Pure terrain, creature, timing and camera logic for the prehistoric island. No Three.js here, so the
// Node tests and the page evaluate exactly the same functions.
// World frame: +Y up, water surface at y = 0. The diorama is a cut block of sea floor and island:
// x from BLOCK.x0 to BLOCK.x1, z from BLOCK.z0 to BLOCK.z1 (+Z is the front cut face the visitor looks at).
export const CYCLE = 48;                       // one camera tour and one loop of every creature, seconds
export const WATER = 0;                        // water surface height
export const BLOCK = { x0: -96, x1: 96, z0: -96, z1: 44, bottom: -72, plinth: 6 };
export const ISLAND = { cx: -6, cz: -14, coast: 38, peak: 40, crater: 7, craterS: 0.13 };
export const SHELF = { depth: 6, crestS: 1.34, crest: 1.8, dropS: 1.48, dropWidth: 0.36, drop: 32 };
export const TRENCH = { x: 79, depth: 28, width: 8.5, from: 1.7 };
export const FLOOR_MIN = BLOCK.bottom + 4;     // the sea floor never touches the block's base

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smooth = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
export const mod = (t, m = CYCLE) => ((t % m) + m) % m;
export const lerp = (a, b, u) => a + (b - a) * u;
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const mix = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
export const mulberry = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
const D = Math.PI / 180;

// ---- Terrain ----
const hash2 = (x, y) => { const s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); };
function vnoise(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return lerp(lerp(hash2(xi, yi), hash2(xi + 1, yi), u), lerp(hash2(xi, yi + 1), hash2(xi + 1, yi + 1), u), v);
}
export const fbm = (x, y) => (vnoise(x, y) * 0.5 + vnoise(x * 2.03 + 7.1, y * 2.03 - 3.3) * 0.3 + vnoise(x * 4.07 - 2.2, y * 4.07 + 9.4) * 0.2) - 0.5;
// Coast radius by bearing: a lobed, uneven island rather than a disc.
export const coastRadius = (th) => ISLAND.coast * (1 + 0.11 * Math.sin(3 * th + 0.7) + 0.07 * Math.sin(5 * th + 2.1) + 0.04 * Math.sin(8 * th + 4.0));
// s: 0 at the summit, 1 on the shoreline, > 1 out to sea.
export function islandS(x, z) {
  const dx = x - ISLAND.cx, dz = z - ISLAND.cz;
  return Math.hypot(dx, dz) / coastRadius(Math.atan2(dz, dx));
}
export const trenchX = (z) => TRENCH.x + 5 * Math.sin(z / 28);
export function height(x, z) {
  const s = islandS(x, z), n = fbm(x * 0.035, z * 0.035), n2 = fbm(x * 0.09 + 11, z * 0.09 - 7);
  let y;
  if (s < 1) {
    const beach = 2.4 * smooth((1 - s) / 0.16);
    const mount = ISLAND.peak * Math.pow(smooth((0.86 - s) / 0.86), 1.35);
    const ridges = Math.abs(n2) * 9 * smooth((0.85 - s) / 0.5) * smooth(s / 0.25);
    const crater = -ISLAND.crater * smooth(1 - s / ISLAND.craterS);
    y = beach + mount + ridges + n * 3 * smooth((0.9 - s) / 0.3) + crater;
  } else {
    y = -SHELF.depth * smooth((s - 1) / 0.12)
      + SHELF.crest * Math.exp(-(((s - SHELF.crestS) / 0.07) ** 2))
      - SHELF.drop * smooth((s - SHELF.dropS) / SHELF.dropWidth)
      + n * 2.2 * smooth((s - 1) / 0.2)
      + n2 * 3 * smooth((s - 1.6) / 0.4);
    y -= TRENCH.depth * Math.exp(-(((x - trenchX(z)) / TRENCH.width) ** 2)) * smooth((s - TRENCH.from) / 0.35);
  }
  return Math.max(FLOOR_MIN, y);
}
export function normalAt(x, z, e = 0.6) {
  return norm([height(x - e, z) - height(x + e, z), 2 * e, height(x, z - e) - height(x, z + e)]);
}
export const slopeAt = (x, z) => Math.acos(clamp(normalAt(x, z)[1], -1, 1));
export const insideBlock = (x, z, m = 0) => x >= BLOCK.x0 + m && x <= BLOCK.x1 - m && z >= BLOCK.z0 + m && z <= BLOCK.z1 - m;
// Inside the water body (camera checks): within the block, under the surface, above the floor.
export const inWater = (p) => insideBlock(p[0], p[2]) && p[1] < WATER && p[1] > height(p[0], p[2]);
export const SUMMIT = (() => {
  let best = [ISLAND.cx, -Infinity, ISLAND.cz];
  for (let x = -30; x <= 20; x += 1) for (let z = -38; z <= 10; z += 1) { const y = height(x, z); if (y > best[1]) best = [x, y, z]; }
  return best;
})();
export const CRATER = [ISLAND.cx, height(ISLAND.cx, ISLAND.cz), ISLAND.cz];

// Terrain colour (sRGB hex) by height, slope and depth, so the Node tests read the same colours the page paints.
export const PALETTE = {
  abyss: '#3f4a55', mud: '#5d6066', drop: '#6d6052', reefSand: '#d9caa0', crest: '#b98a6a', lagoon: '#e3d6ae',
  wetSand: '#b8a479', sand: '#e6d3a3', grass: '#55702f', forest: '#3e5628', rock: '#73665a', ash: '#3b3533', crater: '#2b2422',
  strata: ['#8a7560', '#6f5c4a', '#9c8a6c', '#5a4a3e', '#7d6a55'], plinth: '#26221f',
};
export function terrainColor(x, z, y = height(x, z)) {
  const s = islandS(x, z), slope = slopeAt(x, z), n = fbm(x * 0.21, z * 0.21);
  if (y < -0.4) {
    if (s < 1.22) return n > 0.08 ? PALETTE.reefSand : PALETTE.lagoon;
    if (s < 1.46) return n > -0.05 ? PALETTE.crest : PALETTE.reefSand;
    if (y > -24) return PALETTE.drop;
    return y < -48 ? PALETTE.abyss : PALETTE.mud;
  }
  if (y < 0.7) return PALETTE.wetSand;
  if (s > 0.84 && y < 3.2) return PALETTE.sand;
  if (s < ISLAND.craterS * 1.05) return PALETTE.crater;
  if (y > 34 || slope > 0.95) return y > 38 ? PALETTE.ash : PALETTE.rock;
  return n > 0.04 ? PALETTE.forest : PALETTE.grass;
}

// ---- Vegetation (placement only; shapes live in world.js) ----
// Trees keep off the beach, the crater, cliffs and the herd's walk.
export function vegetation(seed = 7) {
  const rnd = mulberry(seed), out = [];
  const ok = (x, z, minY, maxY, spacing) => {
    const y = height(x, z), s = islandS(x, z);
    if (y < minY || y > maxY || s > 0.8 || s < 0.2 || slopeAt(x, z) > 0.9) return false;
    if (nearHerdWalk(x, z) < 9) return false;
    return out.every(p => Math.hypot(p.x - x, p.z - z) > spacing * Math.max(p.scale, 1) * 0.5 + spacing * 0.5);
  };
  const place = (type, n, minY, maxY, spacing, sMin, sMax) => {
    for (let k = 0, tries = 0; k < n && tries < n * 60; tries++) {
      const x = lerp(-50, 40, rnd()), z = lerp(-60, 30, rnd());
      if (!ok(x, z, minY, maxY, spacing)) continue;
      out.push({ type, x, y: height(x, z), z, scale: lerp(sMin, sMax, rnd()), rot: rnd() * Math.PI * 2, lean: (rnd() - 0.5) * 0.12 });
      k++;
    }
  };
  place('conifer', 150, 3.5, 27, 4.2, 0.8, 1.35);
  place('cycad', 90, 2.6, 20, 3.4, 0.75, 1.2);
  place('fern', 260, 2.4, 24, 1.6, 0.6, 1.3);
  return out;
}
// Crown spheres (centre, radius) per plant, for occlusion and clearance checks. Mirrors the shapes in world.js.
export function crown(p) {
  if (p.type === 'conifer') return { c: [p.x, p.y + 7.5 * p.scale, p.z], r: 3.4 * p.scale, top: p.y + 13 * p.scale };
  if (p.type === 'cycad') return { c: [p.x, p.y + 4.6 * p.scale, p.z], r: 3.2 * p.scale, top: p.y + 5.6 * p.scale };
  return { c: [p.x, p.y + 0.7 * p.scale, p.z], r: 1.3 * p.scale, top: p.y + 1.4 * p.scale };
}

// ---- Creatures (all schematic shapes; loops close every CYCLE seconds) ----
const TAU = Math.PI * 2;
// Herd: three long-necked plant-eaters walking slowly up and down the east beach.
// Spaced about 11 m apart along the shore and walking nearly in step, so the three never run into one another.
export const HERD = [{ s: 0.9, th0: -0.44, size: 1.0, lag: 0 }, { s: 0.92, th0: -0.10, size: 0.8, lag: 0.08 }, { s: 0.89, th0: 0.24, size: 0.55, lag: 0.16 }];
const herdPoint = (th, s) => { const r = coastRadius(th) * s; return [ISLAND.cx + r * Math.cos(th), ISLAND.cz + r * Math.sin(th)]; };
export function herdAt(i, t) {
  const a = HERD[i], w = Math.sin(TAU * mod(t) / CYCLE + a.lag);    // there and back once a cycle
  const th = a.th0 + 0.18 * w, dir = Math.cos(TAU * mod(t) / CYCLE + a.lag) >= 0 ? 1 : -1;
  const [x, z] = herdPoint(th, a.s), [x2, z2] = herdPoint(th + 0.01 * dir, a.s);
  const heading = Math.atan2(z2 - z, x2 - x);
  const step = TAU * mod(t) / 1.6 + i;                                  // stride phase
  return { position: [x, height(x, z), z], heading, size: a.size, step, neck: 0.25 * Math.sin(TAU * mod(t) / 7 + i * 2) };
}
function nearHerdWalk(x, z) {
  let d = Infinity;
  for (const a of HERD) for (let th = a.th0 - 0.24; th <= a.th0 + 0.24; th += 0.04) { const [hx, hz] = herdPoint(th, a.s); d = Math.min(d, Math.hypot(hx - x, hz - z)); }
  return d;
}
// Flyers: five gliding reptiles circling the volcano.
export const FLYERS = [0, 1, 2, 3, 4].map(i => ({ r: 30 + 4 * i, y: 64 + 3 * (i % 3), phase: i * 1.3, dir: i % 2 ? -1 : 1, span: 6.2 - 0.4 * i }));
export function flyerAt(i, t) {
  const f = FLYERS[i], a = f.phase + f.dir * TAU * mod(t) / CYCLE * (i % 2 ? 1 : 2);
  const position = [ISLAND.cx + f.r * Math.cos(a), f.y + 2.5 * Math.sin(TAU * mod(t) / 12 + i), ISLAND.cz + f.r * Math.sin(a)];
  const heading = a + f.dir * Math.PI / 2;
  return { position, heading, bank: -f.dir * 0.32, flap: Math.sin(TAU * mod(t) / 1.9 + i) * 0.5, span: f.span };
}
// Swimmers: two long-necked sea reptiles. One cruises over the drop-off in front, one patrols the trench.
// Paths are sampled on the true floor so they always keep clear water under them (checked in core.test).
export const SWIMMERS = [
  { c: [-80, -20, -14], rx: 9, rz: 40, dy: 4, laps: 1, size: 1.0 },
  { c: [0, -52, -14], rx: 3, rz: 48, dy: 3, laps: 1, size: 0.85 },
];
export function swimmerAt(i, t) {
  const w = SWIMMERS[i], a = TAU * w.laps * mod(t) / CYCLE * (i ? -1 : 1);
  const x = w.c[0] + w.rx * Math.cos(a), z = i ? w.c[2] + w.rz * Math.sin(a) : w.c[2] + w.rz * Math.sin(a);
  const xs = i ? trenchX(z) + w.rx * Math.cos(a) : x;
  const ahead = (k) => { const b = a + k * (i ? -1 : 1); const zz = w.c[2] + w.rz * Math.sin(b); return [i ? trenchX(zz) + w.rx * Math.cos(b) : w.c[0] + w.rx * Math.cos(b), zz]; };
  const [nx, nz] = ahead(0.02), heading = Math.atan2(nz - z, nx - xs), along = (d) => height(xs + d * w.size * Math.cos(heading), z + d * w.size * Math.sin(heading));
  // Depth follows the floor under the whole body (head 9.4 m ahead, tail 6 m behind at size 1), never within 4 m of the surface.
  const floor = Math.max(height(xs, z) + 6 * w.size, along(9.4) + 3, along(-6) + 3, along(4.7) + 4);
  const y = clamp(w.c[1] + w.dy * Math.sin(2 * a + i), floor + 1, WATER - 4);
  return { position: [xs, y, z], heading, size: w.size, stroke: Math.sin(TAU * mod(t) / 3.2 + i) };
}
// Spiral-shelled swimmers drifting along the reef edge.
export const SHELLS = Array.from({ length: 14 }, (_, k) => ({ th: -1.0 + k * 0.2 + 0.05 * Math.sin(k * 7), s: 1.52 + 0.06 * Math.sin(k * 3.1), size: 0.7 + 0.5 * ((k * 37) % 10) / 10 }));
export function shellAt(k, t) {
  const sh = SHELLS[k], th = sh.th + 0.05 * Math.sin(TAU * mod(t) / CYCLE + k);
  const r = coastRadius(th) * sh.s, x = ISLAND.cx + r * Math.cos(th), z = ISLAND.cz + r * Math.sin(th);
  const floor = height(x, z), y = Math.min(-2.6 - sh.size, floor + 4 + 1.2 * Math.sin(TAU * mod(t) / 8 + k));
  return { position: [x, y, z], heading: th + Math.PI / 2 + 0.3 * Math.sin(TAU * mod(t) / CYCLE * 2 + k), size: sh.size };
}
// Two fish schools sweeping the reef edge. Each member keeps its own offset; depth hugs the floor.
export const SCHOOLS = [{ th0: 0.35, s: 1.42, n: 70, seed: 11 }, { th0: 2.0, s: 1.45, n: 60, seed: 23 }];
export function schoolAt(j, t) {
  const sc = SCHOOLS[j], rnd = mulberry(sc.seed), a = sc.th0 + 0.55 * Math.sin(TAU * mod(t) / CYCLE + j);
  const r = coastRadius(a) * sc.s, cx = ISLAND.cx + r * Math.cos(a), cz = ISLAND.cz + r * Math.sin(a);
  const dir = Math.cos(TAU * mod(t) / CYCLE + j) >= 0 ? 1 : -1, heading = a + dir * Math.PI / 2;
  const members = [];
  for (let k = 0; k < sc.n; k++) {
    const ox = (rnd() - 0.5) * 9, oz = (rnd() - 0.5) * 6, oy = (rnd() - 0.5) * 1.6, ph = rnd() * TAU;
    const x = cx + ox + 0.4 * Math.sin(TAU * mod(t) / 2.5 + ph), z = cz + oz + 0.4 * Math.cos(TAU * mod(t) / 3 + ph);
    const floor = height(x, z), y = clamp(floor + 2.4 + oy + 0.8, floor + 1.2, WATER - 1.1);
    members.push({ position: [x, y, z], heading: heading + 0.25 * Math.sin(ph + mod(t)) });
  }
  return { centre: [cx, clamp(height(cx, cz) + 3.2, -40, -1.6), cz], members };
}

// ---- Cameras ----
// A pose is {position, target, up, fov}. Shots receive (t, aspect, u) with u 0..1 across the shot.
export const SHOTS = [
  { key: 'overview', name: '岛屿全景', en: 'OVERVIEW', start: 0, at: 3 },
  { key: 'cutaway', name: '水下剖面', en: 'CUTAWAY', start: 8, at: 11.5 },
  { key: 'reef', name: '礁盘', en: 'REEF FLAT', start: 16, at: 19.5 },
  { key: 'trench', name: '海沟', en: 'TRENCH', start: 24, at: 27.5 },
  { key: 'beach', name: '海滩', en: 'BEACH', start: 32, at: 35.5 },
  { key: 'summit', name: '火山口', en: 'CRATER', start: 40, at: 43.5 },
];
SHOTS.forEach((shot, i) => { shot.index = i; shot.end = i + 1 < SHOTS.length ? SHOTS[i + 1].start : CYCLE; });
export const BLEND = 1.6;                      // seconds of eased camera travel into the next shot
export const FADE = 0.32;                      // seconds of fade out (and again in) for a cut
// Moves that would cross the water wall or the forest are cuts through black (checked in core.test).
export const CUT_INTO = new Set(['beach', 'summit']);
export function shotAt(t) { const c = mod(t); return SHOTS.find(s => c >= s.start && c < s.end) || SHOTS[SHOTS.length - 1]; }
const Y = [0, 1, 0];
function around(az, el, dist, target) { return add(target, [dist * Math.cos(el) * Math.cos(az), dist * Math.sin(el), dist * Math.cos(el) * Math.sin(az)]); }
// Pull the camera back along its view line until a sphere (centre c, radius r) fits both ways.
function fit(pose, aspect, c, r, margin = 0.92) {
  const dir = norm(sub(pose.target, pose.position));
  const vf = pose.fov * D, hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
  const need = r / Math.sin(Math.min(vf, hf) / 2 * margin), dist = dot(sub(c, pose.position), dir);
  return dist >= need ? pose : { ...pose, position: sub(pose.position, scale(dir, need - dist)) };
}
const widen = (fov, aspect, max) => (aspect >= 1 ? fov : Math.min(max, fov * (1 + 0.85 * (1 - aspect))));
const tall = (aspect) => (aspect < 1 ? 1 : 0);
export const shotPose = {
  overview(t, aspect, u) {
    const target = [-2, -16 + 4 * tall(aspect), -18];
    const pose = { position: around((58 + 12 * u) * D, 26 * D, 300, target), target, up: Y, fov: widen(32, aspect, 46) };
    return fit(pose, aspect, [0, -14, -26], 116);
  },
  cutaway(t, aspect, u) {
    // Level with the waterline, square to the front cut: island above, reef, drop-off and trench below.
    const k = tall(aspect), target = [6 - 4 * u, -12 + 3 * k, 0];
    const pose = { position: [18 - 8 * u, 3 + 2 * k, 205], target, up: Y, fov: widen(38, aspect, 54) };
    return fit(pose, aspect, [4, -10, 20], 96);
  },
  reef(t, aspect, u) {
    const k = tall(aspect);
    return { position: [-30 + 10 * u, -1.8 + 1.5 * k, 78 + 10 * k], target: [-8 + 4 * u, -5 + 0.5 * k, 20], up: Y, fov: widen(36, aspect, 52) };
  },
  trench(t, aspect, u) {
    const k = tall(aspect);
    // From above the water off the front-right corner, looking down the trench as it runs back into the block,
    // so the trench and its swimmer fill the frame instead of the cut face of the bank beside it.
    return { position: [128 - 8 * u, 18 + 4 * k, 104 + 18 * k], target: [80, -56 + 2 * k, 18], up: Y, fov: widen(42, aspect, 58) };
  },
  beach(t, aspect, u) {
    // Out over the lagoon east of the beach, low, looking up the shore at the herd with the forest and cone behind.
    const k = tall(aspect), lead = herdAt(0, t).position;
    const position = [66 - 4 * u, 9 + 2 * k, 10 - 6 * u + 6 * k];
    return { position, target: [lead[0] - 6, lead[1] + 6 + 3 * k, lead[2] - 2], up: Y, fov: widen(42, aspect, 58) };
  },
  summit(t, aspect, u) {
    // Steep enough to see down into the 7 m deep crater and its lava pool; a low angle only shows the rim.
    const k = tall(aspect), target = [CRATER[0] + 2, CRATER[1] + 3 - 2 * k, CRATER[2] + 4];
    return { position: around((118 + 14 * u) * D, (50 + 4 * k) * D, 96 + 30 * k, target), target, up: Y, fov: widen(40, aspect, 56) };
  },
};
export function shotPoseAt(key, t, aspect) {
  const shot = SHOTS.find(s => s.key === key), u = clamp((mod(t) - shot.start) / (shot.end - shot.start));
  return { ...shotPose[key](t, aspect, u), shot: key };
}
const mixPose = (a, b, w) => ({ position: mix(a.position, b.position, w), target: mix(a.target, b.target, w), up: norm(mix(a.up, b.up, w)), fov: lerp(a.fov, b.fov, w) });
export function tourPose(t, aspect) {
  const c = mod(t), shot = shotAt(c), prev = SHOTS[(shot.index + SHOTS.length - 1) % SHOTS.length], next = SHOTS[(shot.index + 1) % SHOTS.length];
  const since = c - shot.start, toEnd = shot.end - c;
  let pose = shotPoseAt(shot.key, c, aspect), fade = 0;
  if (CUT_INTO.has(shot.key) && since < FADE) fade = 1 - since / FADE;
  else if (CUT_INTO.has(next.key) && toEnd < FADE) fade = 1 - toEnd / FADE;
  else if (!CUT_INTO.has(shot.key) && since < BLEND) pose = { ...mixPose(shotPose[prev.key](c, aspect, 1), pose, smooth(since / BLEND)), shot: shot.key };
  return { ...pose, fade, shot: shot.key };
}
// Camera when a visitor presses a shot button: eased from where the camera is, or a cut through black.
// `wall` is real time (a paused scene still finishes its camera move); `t` is scene time.
export class ViewController {
  constructor() { this.mode = 'tour'; this.key = 'overview'; this.from = null; this.since = 0; this.fadeAt = -1; this.pending = null; this.last = null; }
  select(key, current, wall) {
    this.mode = 'shot';
    if (CUT_INTO.has(key) || CUT_INTO.has(this.key) || !current) { this.pending = key; this.fadeAt = wall; this.from = null; }
    else { this.from = current; this.since = wall; this.key = key; this.pending = null; }
  }
  jump(key) { this.mode = 'shot'; this.key = key; this.from = null; this.pending = null; this.fadeAt = -1; }
  tour(t) { this.mode = 'tour'; this.from = null; this.pending = null; this.fadeAt = -1; this.key = shotAt(t).key; }
  get moving() { return Boolean(this.from || this.pending || this.fadeAt >= 0); }
  pose(t, aspect, wall = t) {
    if (this.mode === 'tour') { const p = tourPose(t, aspect); this.key = p.shot; return p; }
    let fade = 0;
    if (this.pending) {
      const s = wall - this.fadeAt;
      if (s < FADE) fade = s / FADE; else { this.key = this.pending; this.pending = null; this.fadeAt = wall; fade = 1; }
    } else if (this.fadeAt >= 0) {
      const s = wall - this.fadeAt;
      if (s < FADE) fade = 1 - s / FADE; else this.fadeAt = -1;
    }
    // A held shot ping-pongs across its own window, so it never snaps back to its start.
    const shot = SHOTS.find(s => s.key === this.key), span = shot.end - shot.start, r = mod(t - shot.start, 2 * span) / span, u = r <= 1 ? r : 2 - r;
    let pose = { ...shotPose[this.key](t, aspect, u), shot: this.key };
    if (this.pending && this.last) pose = this.last;
    if (this.from && !this.pending) {
      const w = smooth((wall - this.since) / BLEND);
      pose = { ...mixPose(this.from, pose, w), shot: this.key };
      if (w >= 1) this.from = null;
    }
    this.last = pose;
    return { ...pose, fade };
  }
}
// Project a world point through a pose: normalized screen coords (0..1, y down) and depth along the view.
export function project(pose, aspect, p) {
  const f = norm(sub(pose.target, pose.position)), r = norm(cross(f, pose.up)), u = cross(r, f);
  const d = sub(p, pose.position), z = dot(d, f), th = Math.tan(pose.fov * D / 2);
  return { x: 0.5 + dot(d, r) / (z * th * aspect) / 2, y: 0.5 - dot(d, u) / (z * th) / 2, z };
}
// Sun: a fixed late-afternoon light from the front right, so the front cut face is lit.
export const SUN = norm([0.55, 0.62, 0.56]);
