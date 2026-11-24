// Pure timing, docking, sun and camera logic for the orbital station. No Three.js here, so
// Node tests and the page evaluate exactly the same functions.
// World frame: +Y is the station spin axis and points away from Earth; Earth's centre is on -Y.
export const CYCLE = 50;            // one docking cycle and one camera tour, seconds
export const RING = { radius: 62, inner: 55.5, outer: 68.5, half: 5, floor: 67.3, glassLow: -2.6, glassHigh: 3.4 };
export const RING_PERIOD = 30;      // seconds per habitat revolution (illustrative, not a gravity design)
export const HUB = { radius: 6, top: 12, bottom: -16, adapterRadius: 3.6 };
export const PORT = { y: 18, radius: 2.6, latches: 12 };
export const TRUSS = { top: -16, bottom: -96, half: 1.6, wingY: -90, wingInner: 6, wingOuter: 100, wingHalf: 6.5 };
export const EARTH = { center: [0, -3300, 0], radius: 2800 };
export const BETA = 20 * Math.PI / 180;   // sun angle out of the orbit plane
export const HOLD = [36, 66, 44];          // shuttle station-keeping point
export const GATE = [0, 48, 0];            // approach gate on the port axis
export const MISALIGN = { offset: [2.2, 0, -1.4], roll: 14 * Math.PI / 180 };
export const CONTACT_SPEED = 0.12;         // m/s at first touch
export const PHASES = [
  { key: 'depart', name: '离港', start: 0, end: 6 },
  { key: 'hold', name: '待命', start: 6, end: 17 },
  { key: 'approach', name: '接近', start: 17, end: 25 },
  { key: 'align', name: '对齐', start: 25, end: 31 },
  { key: 'contact', name: '接触', start: 31, end: 35 },
  { key: 'settle', name: '停稳', start: 35, end: 40 },
  { key: 'docked', name: '锁定', start: 40, end: 44 },
  { key: 'depart', name: '离港', start: 44, end: 50 },
];
export const TOUCH = 34.2;                 // first contact inside the contact phase
export const SHOTS = [
  { key: 'establish', name: '建立全景', en: 'ESTABLISHING', start: 0, at: 2.5 },
  { key: 'truss', name: '桁架掠过', en: 'TRUSS PASS', start: 5, at: 7.5 },
  { key: 'ring', name: '环区旋转', en: 'RING SPIN', start: 10, at: 12.5 },
  { key: 'garden', name: '花园甲板', en: 'GARDEN DECK', start: 15, at: 17.5 },
  { key: 'approach', name: '接近', en: 'APPROACH', start: 20, at: 22.5 },
  { key: 'align', name: '对齐', en: 'ALIGN', start: 25, at: 28.5 },
  { key: 'port', name: '对接口', en: 'DOCKING PORT', start: 30, at: 34.6 },
  { key: 'settle', name: '停稳', en: 'HARD MATE', start: 35, at: 39 },
  { key: 'sunrise', name: '地球日出', en: 'SUNRISE', start: 40, at: 43.2 },
  { key: 'axis', name: '轴向俯视', en: 'SPIN AXIS', start: 45, at: 47.5 },
];
SHOTS.forEach((shot, i) => { shot.index = i; shot.end = i + 1 < SHOTS.length ? SHOTS[i + 1].start : CYCLE; });
export const BLEND = 1.8;                  // seconds of eased camera travel into the next shot
export const FADE = 0.32;                  // seconds of fade out (and again in) for a cut
// Transitions that would fly the camera through hull or across hundreds of metres are cuts through black.
export const CUT_INTO = new Set(['truss', 'ring', 'garden', 'approach', 'sunrise', 'axis']);

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smooth = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
export const minJerk = (u) => { u = clamp(u); return u * u * u * (10 - 15 * u + 6 * u * u); };
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
const bezier = (p0, p1, p2, p3, u) => {
  const v = 1 - u;
  return [0, 1, 2].map(i => v * v * v * p0[i] + 3 * v * v * u * p1[i] + 3 * v * u * u * p2[i] + u * u * u * p3[i]);
};
const rotY = (p, a) => { const c = Math.cos(a), s = Math.sin(a); return [c * p[0] + s * p[2], p[1], -s * p[0] + c * p[2]]; };
export const ringAngle = (t) => 2 * Math.PI * t / RING_PERIOD;
// Ring-local point (azimuth psi measured from +X toward +Z) to world at time t.
export function ringPoint(psi, r, y, t) { const a = psi - ringAngle(t); return [r * Math.cos(a), y, r * Math.sin(a)]; }
// Centre line of the garden footpath across the deck (y, metres) at ring-local azimuth psi.
export const gardenPath = (psi) => -0.6 * Math.sin(9 * psi);
export const EYE = 1.75;                   // garden camera height above the deck, metres
export function phaseAt(t) { const c = mod(t); return PHASES.find(p => c >= p.start && c < p.end) || PHASES[PHASES.length - 1]; }
export function shotAt(t) { const c = mod(t); return SHOTS.find(s => c >= s.start && c < s.end) || SHOTS[SHOTS.length - 1]; }

// Sun direction (unit vector toward the sun). One orbit per cycle, faster through the short eclipse.
// Knots: sunrise 42 s, local noon 52.5 s (= 2.5 s), sunset 89.2 s (= 39.2 s), next sunrise 92 s.
const RISE = Math.PI - Math.acos(Math.cos(Math.asin(EARTH.radius / Math.abs(EARTH.center[1]))) / Math.cos(BETA));
// Knot tangents (rad/s) are chosen to stay monotone (Fritsch-Carlson alpha^2 + beta^2 <= 9 on every segment):
// slow at sunrise so the sun takes a few seconds to clear the limb, slow all afternoon, fast in the dark.
const KNOTS = [[42, -RISE, 0.025], [52.5, 0, 0.07], [89.2, RISE, 0.15], [92, 2 * Math.PI - RISE, 0.025]];
function hermite(t) {
  const k = KNOTS, tt = 42 + mod(t - 42);
  let i = 0; while (i < k.length - 2 && tt > k[i + 1][0]) i++;
  const h = k[i + 1][0] - k[i][0], u = (tt - k[i][0]) / h, u2 = u * u, u3 = u2 * u;
  return (2 * u3 - 3 * u2 + 1) * k[i][1] + (u3 - 2 * u2 + u) * h * k[i][2] + (-2 * u3 + 3 * u2) * k[i + 1][1] + (u3 - u2) * h * k[i + 1][2];
}
export const SUN_KNOTS = KNOTS;
export function sunPhase(t) { return hermite(t); }
export function sunDir(t) {
  const phi = hermite(t);
  return [Math.cos(BETA) * Math.sin(phi), Math.cos(BETA) * Math.cos(phi), Math.sin(BETA)];
}
// 0..1 fraction of the sun's disc visible from point p (soft over ~0.5 degrees of the limb).
export function sunVisibility(p, s = null, t = 0) {
  s = s || sunDir(t);
  const c = sub(EARTH.center, p), along = dot(c, s);
  if (along < 0) return 1;
  const miss = Math.sqrt(Math.max(0, dot(c, c) - along * along));
  return smooth((miss - EARTH.radius + 18) / 36);
}

// Quaternion helpers, [x, y, z, w].
export function quatFromAxisAngle(axis, a) { const s = Math.sin(a / 2); return [axis[0] * s, axis[1] * s, axis[2] * s, Math.cos(a / 2)]; }
export function quatMul(a, b) {
  return [a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1], a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3], a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]];
}
export function quatRotate(q, v) {
  const u = [q[0], q[1], q[2]], s = q[3], uv = cross(u, v), uuv = cross(u, uv);
  return add(v, add(scale(uv, 2 * s), scale(uuv, 2)));
}
export function slerp(a, b, u) {
  let d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
  if (d < 0) { b = b.map(x => -x); d = -d; }
  if (d > 0.9995) { const r = a.map((x, i) => lerp(x, b[i], u)); const l = Math.hypot(...r); return r.map(x => x / l); }
  const th = Math.acos(d), sa = Math.sin((1 - u) * th) / Math.sin(th), sb = Math.sin(u * th) / Math.sin(th);
  return a.map((x, i) => x * sa + b[i] * sb);
}
// Quaternion that turns local -Y (the shuttle's nose) to direction d, then rolls by r about d.
function noseTo(d, roll) {
  const from = [0, -1, 0], to = norm(d), c = dot(from, to);
  let q;
  if (c < -0.9999) q = [1, 0, 0, 0];
  else { const ax = cross(from, to); q = norm4([ax[0], ax[1], ax[2], 1 + c]); }
  return quatMul(quatFromAxisAngle(to, roll), q);
}
const norm4 = (q) => { const l = Math.hypot(...q); return q.map(x => x / l); };
const Q_DOCK = [0, 0, 0, 1];
const Q_HOLD = noseTo(sub(GATE, HOLD), 0.55);
const Q_GATE = noseTo([0, -1, 0], MISALIGN.roll);
const GATE_OFF = add(GATE, MISALIGN.offset);
const CTRL_A = add(HOLD, [-8, 4, -12]), CTRL_B = add(GATE_OFF, [0, 20, 0]);
const PRE = PORT.y + 3;
const APPROACH_DIR = norm(sub(GATE_OFF, HOLD));
export const DEPART_END = 6;               // the departure leg runs 44 s → 50 s → 6 s

// Shuttle pose. position = centre of the shuttle's docking ring (its nose). Returns velocity too.
export function shuttleAt(t) {
  const c = mod(t);
  let p, q, latched = 0, compress = 0, capture = false, rcs = 0;
  if (c >= 44 || c < DEPART_END) {
    // Undock and back away to the hold point; the leg wraps through the start of the cycle (12 s).
    const s = c >= 44 ? c - 44 : c + CYCLE - 44, u = minJerk(s / (DEPART_END + CYCLE - 44));
    p = bezier([0, PORT.y, 0], [0, PORT.y + 16, 0], add(HOLD, [-8, 10, -12]), HOLD, u);
    q = slerp(Q_DOCK, Q_HOLD, smooth((s - 0.6) / 9));
    latched = s < 0.4 ? PORT.latches : 0;
  } else if (c < 17) {
    const b = Math.sin(Math.PI * (c - DEPART_END) / (17 - DEPART_END)) ** 2;
    p = add(HOLD, [0.35 * b, 0.18 * b, -0.25 * b]); q = Q_HOLD;
  } else if (c < 25) {
    const u = minJerk((c - 17) / 8);
    p = bezier(HOLD, CTRL_A, CTRL_B, GATE_OFF, u); q = slerp(Q_HOLD, Q_GATE, smooth((c - 17) / 6.5));
  } else if (c < 31) {
    const u = minJerk((c - 25) / 6);
    p = [lerp(GATE_OFF[0], 0, u), lerp(GATE_OFF[1], PRE, u), lerp(GATE_OFF[2], 0, u)];
    q = slerp(Q_GATE, Q_DOCK, minJerk((c - 25) / 5));
    rcs = [0.08, 0.3, 0.55, 0.78].some(k => Math.abs((c - 25) / 6 - k) < 0.025) ? 1 : 0;
  } else if (c < TOUCH) {
    // Cubic Hermite from rest at PRE to the contact speed at the port face.
    const h = TOUCH - 31, u = (c - 31) / h, u2 = u * u, u3 = u2 * u;
    const y = (2 * u3 - 3 * u2 + 1) * PRE + (-2 * u3 + 3 * u2) * PORT.y + (u3 - u2) * h * -CONTACT_SPEED;
    p = [0, y, 0]; q = Q_DOCK;
  } else if (c < 40) {
    // Soft capture: the ring rides 0.12 m into the attenuators, then the hooks pull it to hard mate.
    const s = c - TOUCH;
    const soft = 0.12 * (1 - Math.exp(-s / 0.35)) * Math.exp(-Math.max(0, s - 0.9) / 0.6);
    compress = soft; capture = true;
    latched = clamp(Math.floor((c - 35.5) / 3 * PORT.latches + 1e-9), 0, PORT.latches);
    if (c < 35.5) latched = 0;
    const wobble = c > 36.2 ? 0.02 * Math.exp(-(c - 36.2) / 0.7) * Math.sin((c - 36.2) * 9) : 0;
    p = [0, PORT.y - soft + wobble, 0]; q = Q_DOCK;
  } else {
    p = [0, PORT.y, 0]; q = Q_DOCK; latched = PORT.latches; capture = true;
  }
  const nose = quatRotate(q, [0, -1, 0]), right = quatRotate(q, [1, 0, 0]);
  const lateral = Math.hypot(p[0], p[2]);
  const rollErr = Math.atan2(cross(right, [1, 0, 0])[1], dot(right, [1, 0, 0]));
  return { position: p, quaternion: q, nose, distance: p[1] - PORT.y, lateral, axisError: Math.acos(clamp(-nose[1], -1, 1)), rollError: rollErr, latched, compress, capture, rcs };
}
export function shuttleVelocity(t, h = 1 / 120) { return scale(sub(shuttleAt(t + h).position, shuttleAt(t - h).position), 0.5 / h); }

// Station RCS puffs right after contact, and robotic arm joint angles (radians).
export const stationRcs = (t) => { const c = mod(t); return c > TOUCH + 0.05 && c < TOUCH + 0.75 ? 1 - (c - TOUCH - 0.05) / 0.7 : 0; };
export function armAt(t) {
  const c = mod(t);
  const out = smooth((c - 22) / 5) * (1 - smooth((c - 40.5) / 3.5));
  return { yaw: lerp(-0.4, 0.9, out), shoulder: lerp(0.25, 1.05, out), elbow: lerp(2.55, 1.35, out), wrist: lerp(-1.2, -0.25, out), out };
}

// ---- Cameras ----
// A pose is {position, target, up, fov}. Shots receive (t, aspect); u is 0..1 across the shot.
const Y = [0, 1, 0];
function around(az, el, dist, target) {
  return add(target, [dist * Math.cos(el) * Math.cos(az), dist * Math.sin(el), dist * Math.cos(el) * Math.sin(az)]);
}
// Push the camera back along its view line until a sphere (centre c, radius r) fits horizontally.
function fit(pose, aspect, c, r, hMargin = 0.9) {
  const dir = norm(sub(pose.target, pose.position));
  const vf = pose.fov * Math.PI / 180, hf = 2 * Math.atan(Math.tan(vf / 2) * aspect);
  const need = r / Math.sin(Math.min(vf, hf) / 2 * hMargin);
  const dist = dot(sub(c, pose.position), dir);
  if (dist >= need) return pose;
  return { ...pose, position: sub(pose.position, scale(dir, need - dist)) };
}
function widen(fov, aspect, max) { return aspect >= 1 ? fov : Math.min(max, fov * (1 + 0.85 * (1 - aspect))); }
const D = Math.PI / 180;
export const shotPose = {
  establish(t, aspect, u) {
    const target = [0, -22, 0];
    const pose = { position: around((78 + 10 * u) * D, 27 * D, 255, target), target, up: Y, fov: widen(36, aspect, 48) };
    return fit(pose, aspect, [0, -26, 0], 92);
  },
  truss(t, aspect, u) {
    const y = lerp(-26, -74, smooth(u * 0.92 + 0.04));
    const pose = { position: [15.5, y, 11.5], target: [0, y - 15, -1], up: Y, fov: widen(46, aspect, 62) };
    return pose;
  },
  ring(t, aspect, u) {
    const pose = { position: around(14 * D, 0, 1, [0, 0, 0]), target: [0, 0, 0], up: Y, fov: widen(40, aspect, 56) };
    pose.position = [92 * Math.cos(12 * D), 19, 92 * Math.sin(12 * D)];
    pose.target = [57 * Math.cos(38 * D), -1.5 + 2 * u, 57 * Math.sin(38 * D)];
    return pose;
  },
  garden(t, aspect, u) {
    // Co-rotating with the habitat: a slow walk along the deck, head toward the spin axis.
    // Eye height on the footpath itself: higher up the camera sat inside the tree crowns.
    const psi = 200 * D + u * 2.4 * D, look = psi + 12 * D;
    const position = ringPoint(psi, RING.floor - EYE, gardenPath(psi), t), ahead = ringPoint(look, RING.floor - 2.2, gardenPath(look) * 0.6, t);
    const up = norm(scale([position[0], 0, position[2]], -1));
    return { position, target: ahead, up, fov: widen(58, aspect, 74), frame: 'ring' };
  },
  approach(t, aspect, u) {
    // Chase from behind along the fixed approach line (a velocity-based heading flips when the shuttle stops).
    const s = shuttleAt(t), dir = APPROACH_DIR;
    const side = norm(cross(dir, Y));
    const position = add(s.position, add(scale(dir, -24), add(scale(Y, 9), scale(side, 8))));
    const target = mix(s.position, [0, PORT.y, 0], 0.32);
    return fit({ position, target, up: Y, fov: widen(44, aspect, 58) }, aspect, mix(s.position, [0, PORT.y, 0], 0.5), len(sub(s.position, [0, PORT.y, 0])) * 0.55 + 4);
  },
  align(t, aspect, u) {
    const pose = { position: [36 - 3 * u, 30, 21], target: [0, 27.5, 0], up: Y, fov: widen(34, aspect, 50) };
    return fit(pose, aspect, [0, 30, 0], 21);
  },
  port(t, aspect, u) {
    return { position: [8.6 - 0.8 * u, 21.6, 6.9 + 0.5 * u], target: [0, 19.1, 0], up: Y, fov: widen(42, aspect, 60) };
  },
  settle(t, aspect, u) {
    const pose = { position: around((152 + 8 * u) * D, 14 * D, 30, [0, 20, 0]), target: [0, 20.5, 0], up: Y, fov: widen(40, aspect, 56) };
    return fit(pose, aspect, [0, 21, 0], 12.5);
  },
  sunrise(t, aspect, u) {
    // Behind the station from the rising sun, offset toward Earth so the camera's own sunrise comes
    // about a second after the station's: the sun clears the limb right behind the ring's silhouette.
    const { s, w, m } = SUNRISE_RIG;
    const position = add(scale(s, -SUNRISE_RIG.back), scale(w, m - 6 * u));
    const target = add(scale(w, 24 - 4 * u), scale(s, 0));
    return { position, target, up: scale(w, -1), fov: widen(24, aspect, 38) };
  },
  axis(t, aspect, u) {
    const pose = { position: [10, 205 - 14 * u, 22], target: [0, -6, 10], up: [0, 0, -1], fov: widen(48, aspect, 62) };
    return fit(pose, aspect, [0, 0, 0], 86);
  },
};
// The sunrise rig is solved once: m puts the camera's grazing ray exactly on the limb at SUNRISE_AT.
export const SUNRISE_AT = 43.0;
export const SUNRISE_RIG = (() => {
  const s = sunDir(SUNRISE_AT), back = 640;
  const w = norm(sub(EARTH.center, scale(s, dot(EARTH.center, s))));
  const miss = (m) => { const p = add(scale(s, -back), scale(w, m)), c = sub(EARTH.center, p), a = dot(c, s); return Math.sqrt(dot(c, c) - a * a) - EARTH.radius; };
  let lo = -400, hi = 900;
  for (let i = 0; i < 60; i++) { const mid = (lo + hi) / 2; if (miss(mid) > 0) lo = mid; else hi = mid; }
  return { s, w, m: (lo + hi) / 2, back };
})();
export function shotPoseAt(key, t, aspect) {
  const shot = SHOTS.find(s => s.key === key), u = clamp((mod(t) - shot.start) / (shot.end - shot.start));
  return { ...shotPose[key](t, aspect, u), shot: key };
}
const mixPose = (a, b, w) => ({ position: mix(a.position, b.position, w), target: mix(a.target, b.target, w), up: norm(mix(a.up, b.up, w)), fov: lerp(a.fov, b.fov, w) });

// Tour camera at time t: eased blends between shots, fade cuts where flagged. fade = 0..1 black.
export function tourPose(t, aspect) {
  const c = mod(t), shot = shotAt(c), prev = SHOTS[(shot.index + SHOTS.length - 1) % SHOTS.length];
  const since = c - shot.start, toEnd = shot.end - c, next = SHOTS[(shot.index + 1) % SHOTS.length];
  let pose = shotPoseAt(shot.key, c, aspect), fade = 0;
  if (CUT_INTO.has(shot.key) && since < FADE) fade = 1 - since / FADE;
  else if (CUT_INTO.has(next.key) && toEnd < FADE) fade = 1 - toEnd / FADE;
  else if (!CUT_INTO.has(shot.key) && since < BLEND) {
    const before = shotPose[prev.key](c, aspect, 1);
    pose = { ...mixPose(before, pose, smooth(since / BLEND)), shot: shot.key };
  }
  return { ...pose, fade, shot: shot.key };
}

// Camera travel when a viewer presses a shot button: eased from where the camera is now, or a cut
// through black when the move would cross the hull or hundreds of metres. `wall` is real time, so a
// paused scene still finishes its camera move; `t` is scene time and drives everything in the shot.
export class ViewController {
  constructor() { this.mode = 'tour'; this.key = 'establish'; this.from = null; this.since = 0; this.fadeAt = -1; this.pending = null; }
  select(key, current, wall) {
    this.mode = 'shot';
    const crossing = CUT_INTO.has(key) || CUT_INTO.has(this.key) || !current;
    if (crossing) { this.pending = key; this.fadeAt = wall; this.from = null; }
    else { this.from = current; this.since = wall; this.key = key; this.pending = null; }
  }
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
    const shot = SHOTS.find(s => s.key === this.key);
    // A held shot repeats its own camera move while scene time runs on (or stays still when paused).
    // Ping-pong across the window so a held shot never snaps back to its start.
    const span = shot.end - shot.start, r = mod(t - shot.start, 2 * span) / span, u = r <= 1 ? r : 2 - r;
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

// Project a world point through a pose: returns normalized screen coords (0..1, y down) and depth.
export function project(pose, aspect, p) {
  const f = norm(sub(pose.target, pose.position)), r = norm(cross(f, pose.up)), u = cross(r, f);
  const d = sub(p, pose.position), z = dot(d, f);
  const th = Math.tan(pose.fov * Math.PI / 360);
  return { x: 0.5 + dot(d, r) / (z * th * aspect) / 2, y: 0.5 - dot(d, u) / (z * th) / 2, z };
}
// Ray-sphere entry distance for the earth, or Infinity.
export function earthHit(origin, dir) {
  const oc = sub(origin, EARTH.center), b = dot(oc, dir), c = dot(oc, oc) - EARTH.radius ** 2, h = b * b - c;
  if (h < 0) return Infinity; const t = -b - Math.sqrt(h); return t > 0 ? t : Infinity;
}
export const mulberry = (seed) => () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let x = Math.imul(seed ^ seed >>> 15, 1 | seed); x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x; return ((x ^ x >>> 14) >>> 0) / 4294967296; };
