// 雪线小木屋 — pure logic, no three.js. Node tests import this file directly; the page renders what it computes.
// Units: metres at toy scale. Origin: centre of the summit the lodge stands on, y = 0 at its snow surface, +y up.

// ---------------- small maths ----------------
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, k) => a + (b - a) * k;
export const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
export const mulberry32 = (seed) => () => {
  let t = (seed += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
export const SEED = 20261011;

// ---------------- the place ----------------
export const SUMMIT_R = 13;          // radius of the summit the lodge stands on
export const DECK_Y = 0.9;           // top of the stone base = deck level
export const CLOUD_Y = -11;          // top of the cloud sea
// Direction towards the moon (unit). The opening view looks towards it, so the moon sits behind the tower.
export const MOON_DIR = (() => { const v = [-0.52, 0.125, -0.83], l = Math.hypot(...v); return v.map((c) => c / l); })();

// Solid boxes of the lodge group. x/z centre, footprint w (x) by d (z), from y0 up to y0 + h (roof included).
// The page builds its geometry from these; the tests keep the camera out of them; hover uses them.
export const BUILDINGS = [
  { id: 'keep', name: '主屋', cx: -1, cz: 0, w: 9, d: 7, y0: DECK_Y, wallH: 5.4, roofH: 3.6, h: 9.0 },
  { id: 'tower', name: '瞭望塔', cx: -6.6, cz: -2.4, w: 3.8, d: 3.8, y0: 0, wallH: 10.5, roofH: 4.4, h: 14.9, round: true },
  { id: 'wing', name: '柴房侧翼', cx: 6.0, cz: 1.0, w: 5, d: 5.4, y0: 0.5, wallH: 2.9, roofH: 2.3, h: 5.2 },
  { id: 'stall', name: '茶摊', cx: 3.6, cz: 8.2, w: 2.6, d: 1.8, y0: 0, wallH: 2.2, roofH: 0.5, h: 2.7 },
];
export const HERO_BOX = { min: [-9.2, 0, -5.6], max: [9.2, 15.4, 9.6] };   // everything on the summit that must stay in frame

// Seven smaller summits. Every one has its own identifying thing; none repeats another.
// y = height of its snow surface, r = summit radius.
export const SATELLITES = [
  { id: 'red-hut', label: '红顶小屋和烟囱', x: -25, y: -3.0, z: -20, r: 5.0, features: ['hut-red', 'chimney', 'smoke'] },
  { id: 'white-porch', label: '白墙小屋和门廊灯', x: 27, y: -5.0, z: -14, r: 4.6, features: ['hut-white', 'porch-lamp'] },
  { id: 'bare-lantern', label: '空岩石上一盏灯', x: 15, y: -8.0, z: 27, r: 3.0, features: ['lantern'] },
  { id: 'beacon', label: '小烽火塔和旗', x: -38, y: 4.0, z: 8, r: 3.3, features: ['beacon-tower', 'flag'] },
  { id: 'hamlet-east', label: '东边三间屋的小村', x: 40, y: -1.0, z: 16, r: 7.0, features: ['hut-wood', 'hut-wood', 'hut-green', 'lantern'] },
  { id: 'hamlet-north', label: '北边带松林的小村', x: -10, y: 1.5, z: -44, r: 7.6, features: ['hut-red', 'hut-wood', 'hut-white', 'pines'] },
  { id: 'cairn', label: '玛尼堆和雪松', x: -22, y: -6.0, z: 30, r: 4.0, features: ['cairn', 'pines'] },
];
// Flag lines strung from the lodge to the two hamlets: the implied paths.
export const FLAG_LINES = [
  { from: [8.6, 4.2, 2.0], to: 'hamlet-east' },
  { from: [-6.6, 9.6, -3.6], to: 'hamlet-north' },
];
// Each summit sways its lantern and flag on its own phase so nothing moves in step.
export const phaseOf = (i) => (i * 2.399963) % (Math.PI * 2);   // golden angle

// ---------------- windows ----------------
// states: 'lit' bright warm, 'dim' low warm, 'dark' cold glass, 'flicker' lit and wavering
export function windowStates(count, seed = SEED) {
  const rnd = mulberry32(seed), out = [];
  for (let i = 0; i < count; i++) { const r = rnd(); out.push(r < 0.5 ? 'lit' : r < 0.68 ? 'dim' : r < 0.75 ? 'flicker' : 'dark'); }
  return out;
}
// Brightness multiplier of one window at time t (seconds). Only 'flicker' changes with time.
export function windowLevel(state, t, i) {
  if (state === 'lit') return 1;
  if (state === 'dim') return 0.3;
  if (state === 'dark') return 0;
  return 0.72 + 0.2 * Math.sin(t * 7.3 + i * 1.7) + 0.08 * Math.sin(t * 23.1 + i * 0.6);
}

// ---------------- camera path ----------------
// A closed loop: opening view, down to deck level, past the red hut, up to a high aerial, back to the start.
export const LOOP_S = 120;
export const PATH_KEYS = [
  { name: 'hero', pos: [22, 12, 40], target: [0.6, 5.5, 0] },
  { name: 'deck', pos: [16.5, 3.2, 18], target: [0.2, 3.5, 1.5] },
  { name: 'back', pos: [13, 3.8, -19], target: [-1, 4.4, 0] },
  { name: 'sat', pos: [-14.5, 2.8, -29.5], target: [-24, -0.6, -20.5] },
  { name: 'rise', pos: [-37, 23, -2], target: [-3, 2.5, -2] },
  { name: 'wide', pos: [-14, 62, 72], target: [8, -3, 6] },
];
export const VIEWS = { hero: 0, deck: 1 / 6, sat: 3 / 6, wide: 5 / 6 };
const cr = (p0, p1, p2, p3, k) => {
  const k2 = k * k, k3 = k2 * k;
  return 0.5 * (2 * p1 + (-p0 + p2) * k + (2 * p0 - 5 * p1 + 4 * p2 - p3) * k2 + (-p0 + 3 * p1 - 3 * p2 + p3) * k3);
};
export function pathAt(u) {
  const n = PATH_KEYS.length, s = (((u % 1) + 1) % 1) * n, i = Math.floor(s) % n, k = s - Math.floor(s);
  const K = (j) => PATH_KEYS[(i + j + n) % n];
  const at = (f) => [0, 1, 2].map((a) => cr(K(-1)[f][a], K(0)[f][a], K(1)[f][a], K(2)[f][a], k));
  return { pos: at('pos'), target: at('target') };
}

// ---------------- keeping the camera out of things ----------------
// Push a point out of every summit's bounding shape and above the cloud top. Used for manual orbit and the return blend.
export function resolve(p) {
  let [x, y, z] = p;
  const rr = Math.hypot(x, z), minR = y < 21 ? SUMMIT_R + 1.5 : 0;
  if (rr < minR) { const s = minR / Math.max(rr, 1e-6); x *= s; z *= s; }
  for (const s of SATELLITES) {
    const dx = x - s.x, dy = y - (s.y + 1.5), dz = z - s.z, d = Math.hypot(dx, dy, dz), need = s.r + 3.5;
    if (d < need) { const k = need / Math.max(d, 1e-6); x = s.x + dx * k; y = s.y + 1.5 + dy * k; z = s.z + dz * k; }
  }
  return [x, Math.max(y, CLOUD_Y + 4), z];
}
// Distance from a point to the nearest lodge box (0 when inside).
export function clearance(p) {
  let best = Infinity;
  for (const b of BUILDINGS) {
    const dx = Math.max(Math.abs(p[0] - b.cx) - b.w / 2, 0), dz = Math.max(Math.abs(p[2] - b.cz) - b.d / 2, 0);
    const dy = Math.max(b.y0 - p[1], p[1] - (b.y0 + b.h), 0);
    best = Math.min(best, Math.hypot(dx, dy, dz));
  }
  return best;
}

// ---------------- projection (same maths as the page's camera) ----------------
// vfov in degrees. shift = [sx, sy] moves the picture in NDC units (the page shifts the lodge off the copy).
export function fovFor(aspect) {
  const minHalfH = (24 * Math.PI) / 180, base = 40;
  return clamp(Math.max(base, (2 * Math.atan(Math.tan(minHalfH) / aspect) * 180) / Math.PI), base, 78);
}
export const shiftFor = (aspect) => (aspect >= 1.2 ? [0.28, 0.0] : aspect >= 0.8 ? [0.1, 0.08] : [0, 0.3]);
export function project(p, cam, target, aspect, shift = shiftFor(aspect)) {
  const f = [target[0] - cam[0], target[1] - cam[1], target[2] - cam[2]], fl = Math.hypot(...f);
  const fw = f.map((c) => c / fl);
  let r = [fw[2] * -1, 0, fw[0]];                     // forward x up(0,1,0)
  r = [-fw[2], 0, fw[0]]; const rl = Math.hypot(...r); r = r.map((c) => c / rl);
  const up = [r[1] * fw[2] - r[2] * fw[1], r[2] * fw[0] - r[0] * fw[2], r[0] * fw[1] - r[1] * fw[0]];
  const d = [p[0] - cam[0], p[1] - cam[1], p[2] - cam[2]];
  const zc = d[0] * fw[0] + d[1] * fw[1] + d[2] * fw[2];
  const xc = d[0] * r[0] + d[1] * r[1] + d[2] * r[2], yc = d[0] * up[0] + d[1] * up[1] + d[2] * up[2];
  const t = Math.tan((fovFor(aspect) * Math.PI) / 360);
  return { x: xc / (zc * t * aspect) + shift[0], y: yc / (zc * t) + shift[1], z: zc };   // NDC, +y up; z > 0 in front
}
export function boxCorners(b) {
  const out = [];
  for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) out.push([x, y, z]);
  return out;
}
// Screen box of a world box in 0..1 (x right, y down).
export function screenBox(b, cam, target, aspect) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, front = true;
  for (const c of boxCorners(b)) {
    const q = project(c, cam, target, aspect); if (q.z <= 0.1) front = false;
    x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x); y0 = Math.min(y0, q.y); y1 = Math.max(y1, q.y);
  }
  return { x0: (x0 + 1) / 2, x1: (x1 + 1) / 2, y0: (1 - y1) / 2, y1: (1 - y0) / 2, front };
}

// ---------------- the rig: auto loop, manual orbit, eased return ----------------
export const IDLE_S = 4.5;      // hands off this long, then the loop takes the view back
export const RETURN_S = 3.2;    // how long the hand-back takes
export const R_MIN = 17, R_MAX = 100;   // R_MAX is measured from the lodge, wherever the orbit centre currently is
export const ORBIT_TARGET = [0, 4.2, 0];
const toSph = (pos, tgt) => { const d = [pos[0] - tgt[0], pos[1] - tgt[1], pos[2] - tgt[2]], r = Math.hypot(...d); return { r, az: Math.atan2(d[0], d[2]), el: Math.asin(clamp(d[1] / r, -1, 1)) }; };
const fromSph = (s, tgt) => [tgt[0] + s.r * Math.cos(s.el) * Math.sin(s.az), tgt[1] + s.r * Math.sin(s.el), tgt[2] + s.r * Math.cos(s.el) * Math.cos(s.az)];

export function createRig({ u = 0, auto = true } = {}) {
  const rig = {
    mode: auto ? 'auto' : 'manual', auto, u, idle: 0, k: 0,
    sph: null, target: ORBIT_TARGET.slice(), from: null, pos: null, look: null,
  };
  const pose = () => (rig.mode === 'auto' ? pathAt(rig.u) : { pos: resolve(fromSph(rig.sph, rig.target)), target: rig.target });
  const grab = () => {            // take over from wherever the camera is right now, without a jump
    if (rig.mode === 'manual') return;
    const cur = { pos: rig.pos || pathAt(rig.u).pos, target: rig.look || pathAt(rig.u).target };
    rig.target = cur.target.slice(); rig.sph = toSph(cur.pos, rig.target); rig.mode = 'manual';
  };
  rig.drag = (dAz, dEl) => { grab(); rig.idle = 0; rig.sph.az -= dAz; rig.sph.el = clamp(rig.sph.el + dEl, Math.min(-0.12, rig.sph.el), Math.max(1.25, rig.sph.el)); };
  rig.zoom = (f) => {
    grab(); rig.idle = 0;
    const r = Math.max(rig.sph.r * f, Math.min(R_MIN, rig.sph.r));
    if (f > 1) { const p = fromSph({ ...rig.sph, r }, rig.target); if (Math.hypot(p[0] - ORBIT_TARGET[0], p[1] - ORBIT_TARGET[1], p[2] - ORBIT_TARGET[2]) > R_MAX) return; }
    rig.sph.r = r;
  };
  rig.setAuto = (on) => { rig.auto = on; if (!on) grab(); rig.idle = 0; };
  rig.reset = () => { grab(); rig.auto = true; rig.u = 0; rig.idle = IDLE_S; };
  rig.jump = (uu) => { rig.u = uu; rig.mode = 'auto'; rig.from = null; const p = pathAt(uu); rig.pos = p.pos; rig.look = p.target; };
  rig.update = (dt) => {
    if (rig.mode === 'auto') rig.u = (rig.u + dt / LOOP_S) % 1;
    else if (rig.mode === 'manual') {
      // ease the orbit centre back onto the lodge so a takeover near a far summit still orbits something
      // (the camera itself stays put while the centre slides: only the next drag feels the new centre)
      const keep = fromSph(rig.sph, rig.target);
      for (let a = 0; a < 3; a++) rig.target[a] += (ORBIT_TARGET[a] - rig.target[a]) * Math.min(1, dt * 0.6);
      rig.sph = toSph(keep, rig.target);
      rig.idle += dt;
      if (rig.auto && rig.idle >= IDLE_S) { rig.from = pose(); rig.mode = 'return'; rig.k = 0; }
    } else {
      rig.k = Math.min(1, rig.k + dt / RETURN_S); rig.u = (rig.u + (dt / LOOP_S) * rig.k) % 1;
      if (rig.k >= 1) { rig.mode = 'auto'; rig.from = null; }
    }
    let p;
    if (rig.mode === 'return') {
      // blend around the lodge (angle, height, radius), never straight through it
      const to = pathAt(rig.u), e = easeInOut(rig.k), a = rig.from.pos, b = to.pos;
      const azA = Math.atan2(a[0], a[2]), azB = Math.atan2(b[0], b[2]), az = azA + wrapAngle(azB - azA) * e;
      const rad = lerp(Math.hypot(a[0], a[2]), Math.hypot(b[0], b[2]), e);
      const raw = [rad * Math.sin(az), lerp(a[1], b[1], e), rad * Math.cos(az)], safe = resolve(raw);
      // resolve() guards the middle of the blend; fade it out at the end so the hand-over to the path has no step
      const g = e > 0.8 ? (1 - e) / 0.2 : 1;
      p = { pos: raw.map((c, i2) => lerp(c, safe[i2], g)), target: [0, 1, 2].map((i2) => lerp(rig.from.target[i2], to.target[i2], e)) };
    } else p = pose();
    rig.pos = p.pos; rig.look = p.target.slice();
    return p;
  };
  return rig;
}
