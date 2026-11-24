// Pure motion logic for the painterly peacock: no Three.js here, so the Node tests and the page run exactly
// the same functions. World frame: +Y up, the ground is y = 0, the camera stands on the +Z side looking
// toward -Z. A heading of 0 means the bird faces the camera.
//
// Who drives the body (one owner per channel, see SPEC.md "动作归属"):
//   root (where it stands and which way it faces): pickup > scroll walk (approach / retreat) > display > follow > idle
//   neck and head: pickup > peck > shake (while displaying) > watch > rest
//   vertical (crouch, flight, landing): jump only
//   tail fan: the fan target (hover or the phone button); every other action reads the live tail slots
// A pickup in progress ignores walkTo, scroll walks, jump and peck; extra feathers clicked meanwhile are queued.

export const K = 26;                 // train feathers, each with its own id and socket
export const STEP = 1 / 120;         // fixed simulation step, seconds
export const BODY = { y: 0.72, rx: 0.17, ry: 0.19, rz: 0.34 };
export const NECK = { n: 7, seg: 0.13, base: [0, 0.14, 0.27] };
export const NECK_LEN = NECK.n * NECK.seg;
// Bone length for a given base-to-head distance: 12 % longer than the straight line, never shorter than
// NECK_MIN of the full neck, never longer than the full neck.
export const NECK_MIN = 0.5;
export const neckSeg = (d) => clamp(d * 1.12, NECK_MIN * NECK_LEN, NECK_LEN) / NECK.n;
export const BEAK = 0.16;            // head joint to beak tip
export const LEG = { hip: [0.085, -0.09, 0.03], thigh: 0.30, shank: 0.36, foot: 0.10 };
export const WING = { shoulder: [0.15, 0.07, 0.13], len: 0.36 };
export const REACH = 0.72;           // where it stands, in front of a fallen quill, to pick it up
export const SLIDE = 0.14;           // the last straight push of the quill back into its socket
export const FAN_RATE = 0.55;        // fan opens or closes at most this much per second (0..1)
export const QUEUE_MAX = 3;
export const SPEED = { walk: 0.85, back: 0.5, turn: 2.8 };
export const JUMP = { crouch: 0.16, dip: 0.12, v0: 2.7, g: 9.8, land: 0.3, landDip: 0.13 };
export const PICK = { reach: 0.6, grip: 0.18, lift: 0.55, turn: 0.95, insert: 0.4, settle: 0.5, walkTimeout: 9 };
export const TOL = { grip: 0.012, carry: 0.02, insert: 0.02, insertAngle: 3 * Math.PI / 180 };
// Screen safe zones (0..1, y down) for every point of the bird, the fallen feather included.
// Desktop: clear of the bottom hint line and the sound button; phone: clear of the touch buttons.
// The title is a foreground layer on purpose: the bird may pass behind it.
export const SAFE = { desktop: { x: [0.05, 0.95], y: [0.085, 0.89] }, phone: { x: [0.04, 0.96], y: [0.13, 0.84] } };
export const safeFor = (aspect) => (aspect < 1 ? SAFE.phone : SAFE.desktop);

// ---------- small maths on plain arrays ----------
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
export const smooth = (u) => { u = clamp(u); return u * u * (3 - 2 * u); };
export const ease = (u) => { u = clamp(u); return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2; };
export const lerp = (a, b, u) => a + (b - a) * u;
export const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const scale = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
export const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
export const len = (a) => Math.hypot(a[0], a[1], a[2]);
export const dist = (a, b) => len(sub(a, b));
export const norm = (a) => { const l = len(a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
export const mix = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
export const angleBetween = (a, b) => Math.acos(clamp(dot(norm(a), norm(b)), -1, 1));
export const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
export function slerp(a, b, u) {
  a = norm(a); b = norm(b);
  const d = clamp(dot(a, b), -1, 1), th = Math.acos(d);
  if (th < 1e-5) return b.slice();
  if (Math.PI - th < 1e-3) { // opposite: turn through any perpendicular
    const p = norm(Math.abs(a[1]) < 0.9 ? cross(a, [0, 1, 0]) : cross(a, [1, 0, 0]));
    return norm(add(scale(a, Math.cos(Math.PI * u)), scale(p, Math.sin(Math.PI * u))));
  }
  const s = Math.sin(th);
  return add(scale(a, Math.sin((1 - u) * th) / s), scale(b, Math.sin(u * th) / s));
}
export function mulberry(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const bez3 = (p0, p1, p2, p3, u) => { const v = 1 - u; return add(add(scale(p0, v * v * v), scale(p1, 3 * v * v * u)), add(scale(p2, 3 * v * u * u), scale(p3, u * u * u))); };
const bez2 = (p0, p1, p2, u) => { const v = 1 - u; return add(add(scale(p0, v * v), scale(p1, 2 * v * u)), scale(p2, u * u)); };

// A frame: origin o and orthonormal axes x (bird's left when it faces the camera), y (up), z (forward).
export const toWorld = (f, p) => add(f.o, add(add(scale(f.x, p[0]), scale(f.y, p[1])), scale(f.z, p[2])));
export const dirWorld = (f, v) => add(add(scale(f.x, v[0]), scale(f.y, v[1])), scale(f.z, v[2]));
export const toLocal = (f, p) => { const d = sub(p, f.o); return [dot(d, f.x), dot(d, f.y), dot(d, f.z)]; };
export const dirLocal = (f, v) => [dot(v, f.x), dot(v, f.y), dot(v, f.z)];
export const forward = (h) => [Math.sin(h), 0, Math.cos(h)];
export function headingFrame(root, heading, lift = 0) {
  const z = forward(heading), y = [0, 1, 0], x = cross(y, z);
  return { o: [root[0], root[1] + lift, root[2]], x, y, z };
}
// Body frame: origin at the body's centre; pitch > 0 tips the breast down.
export function bodyFrame(root, heading, pitch, lift) {
  const f = forward(heading), up = [0, 1, 0], x = cross(up, f);
  const c = Math.cos(pitch), s = Math.sin(pitch);
  return { o: [root[0], BODY.y + lift, root[2]], x, y: add(scale(up, c), scale(f, s)), z: sub(scale(f, c), scale(up, s)) };
}
// Head frame from the neck's last joint and the head's forward direction.
export function headFrame(o, fwd) {
  const z = norm(fwd), ref = Math.abs(z[1]) > 0.98 ? [0, 0, 1] : [0, 1, 0];
  const x = norm(cross(ref, z)), y = cross(z, x);
  return { o, x, y, z };
}
const headDir = (hf, yaw, pitch) => dirWorld(hf, [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)]);

// ---------- the train: every feather knows its id and its socket ----------
export const FEATHERS = Array.from({ length: K }, (_, i) => {
  const u = (i / (K - 1)) * 2 - 1, layer = i % 2;
  const length = 1.0 + 0.36 * (1 - Math.pow(Math.abs(u), 1.6)) + (layer ? -0.07 : 0.05);
  const beta = u * 0.16, p0 = -0.3 - 0.05 * layer, alpha = u * 1.36, tau = 0.24;
  return {
    id: i, u, layer, length, eye: 0.86,
    anchor: [0.075 * u, 0.15 - 0.015 * u * u, -0.21 - 0.014 * layer],
    folded: { d: [Math.sin(beta) * Math.cos(p0), Math.sin(p0), -Math.cos(beta) * Math.cos(p0)], s: [Math.cos(beta), 0, Math.sin(beta)] },
    fanned: { d: [Math.sin(alpha), Math.cos(alpha) * Math.cos(tau), -Math.cos(alpha) * Math.sin(tau)], s: [Math.cos(alpha), -Math.sin(alpha) * Math.cos(tau), Math.sin(alpha) * Math.sin(tau)] },
  };
});
export const EYE_SIZE = 0.115;       // diameter of the eye spot
// Per-feather opening: the centre rises first, the outer feathers follow, so the fan opens a little at a time.
export const featherFan = (fan, u) => smooth((fan - 0.22 * Math.abs(u)) / 0.78);
const rotX = (v, a) => { const c = Math.cos(a), s = Math.sin(a); return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c]; };
// Socket direction in body-local space for a given fan amount, tail sway and shiver.
export function slotLocal(F, fan, psi = 0, shiver = 0) {
  const k = featherFan(fan, F.u);
  let d = slerp(F.folded.d, F.fanned.d, k);
  let s = mix(F.folded.s, F.fanned.s, k);
  s = norm(sub(s, scale(d, dot(s, d))));
  const sway = psi * (1 - 0.6 * k) + shiver * k;
  d = rotX(d, sway); s = rotX(s, sway);
  return { d, s };
}

// ---------- stage, camera, projection ----------
export function regionFor(aspect) {
  if (aspect < 1) { const hw = clamp(0.1 + (aspect - 0.45) * 1.0, 0.12, 0.45); return { x0: -hw, x1: hw, z0: -0.55, z1: 0.45 }; }
  const hw = clamp(0.4 + (aspect - 1) * 1.2, 0.4, 1.15);
  return { x0: -hw, x1: hw, z0: -0.9, z1: 0.75 };
}
export const clampRegion = (r, p, m = 0) => [clamp(p[0], r.x0 - m, r.x1 + m), clamp(p[1], r.z0 - m, r.z1 + m)];
export function project(cam, aspect, p) {
  const f = norm(sub(cam.target, cam.position)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f);
  const v = sub(p, cam.position), zc = dot(v, f), t = Math.tan((cam.fov * Math.PI) / 360);
  const nx = dot(v, r) / (zc * t * aspect), ny = dot(v, u) / (zc * t);
  return { x: (nx + 1) / 2, y: (1 - ny) / 2, depth: zc };
}
// Ground point under a screen position (0..1, y down); null above the horizon.
export function screenToGround(cam, aspect, sx, sy) {
  const f = norm(sub(cam.target, cam.position)), r = norm(cross(f, [0, 1, 0])), u = cross(r, f), t = Math.tan((cam.fov * Math.PI) / 360);
  const nx = sx * 2 - 1, ny = 1 - sy * 2;
  const d = norm(add(f, add(scale(r, nx * t * aspect), scale(u, ny * t))));
  if (d[1] > -1e-4) return null;
  const k = -cam.position[1] / d[1];
  return [cam.position[0] + d[0] * k, cam.position[2] + d[2] * k];
}
// How far any part of the bird can reach from where it stands (fan open or closed, any heading) and how
// high (fan top plus the jump), measured on the real poses below once at start-up.
let ENVELOPE = null;
export function envelope() {
  if (ENVELOPE) return ENVELOPE;
  let r = 0, top = 0;
  for (const fan of [0, 0.5, 1]) for (const psi of [-0.25, 0, 0.25]) {
    const bf = bodyFrame([0, 0, 0], 0, 0, 0);
    for (const F of FEATHERS) {
      const sl = slotLocal(F, fan, psi), q = toWorld(bf, F.anchor), tip = add(q, scale(dirWorld(bf, sl.d), F.length));
      for (const p of [q, tip]) { r = Math.max(r, Math.hypot(p[0], p[2])); top = Math.max(top, p[1]); }
    }
  }
  r = Math.max(r, REACH + 0.2) + 0.12;       // peck and a quill's length beyond it
  ENVELOPE = { r, top: top + jumpApex() + 0.08, bottom: 0 };
  return ENVELOPE;
}
export const jumpApex = () => (JUMP.v0 * JUMP.v0) / (2 * JUMP.g) - JUMP.dip;
const camCache = new Map();
export function cameraFor(aspect) {
  const key = aspect.toFixed(3);
  if (camCache.has(key)) return camCache.get(key);
  const reg = regionFor(aspect), env = envelope(), safe = safeFor(aspect);
  const fov = aspect < 1 ? 42 : 30, el = 0.24, cx = (reg.x0 + reg.x1) / 2, cz = (reg.z0 + reg.z1) / 2;
  const pts = [];
  for (const x of [reg.x0, cx, reg.x1]) for (const z of [reg.z0, cz, reg.z1]) for (let a = 0; a < 24; a++) {
    const th = (a / 24) * Math.PI * 2;
    for (const y of [env.bottom, env.top]) pts.push([x + env.r * Math.cos(th), y, z + env.r * Math.sin(th)]);
  }
  const fits = (cam) => pts.every(p => { const s = project(cam, aspect, p); return s.depth > 0.3 && s.x >= safe.x[0] && s.x <= safe.x[1] && s.y >= safe.y[0] && s.y <= safe.y[1]; });
  const make = (d, ty) => ({ position: [cx, ty + d * Math.sin(el), cz + d * Math.cos(el)], target: [cx, ty, cz], fov, up: [0, 1, 0] });
  let best = null;
  for (let ty = 0.3; ty <= 1.6 + 1e-9; ty += 0.025) {
    let lo = 2, hi = 60;
    if (!fits(make(hi, ty))) continue;
    for (let k = 0; k < 40; k++) { const mid = (lo + hi) / 2; if (fits(make(mid, ty))) hi = mid; else lo = mid; }
    if (!best || hi < best.d) best = { d: hi, ty };
  }
  const cam = make(best.d * 1.01, best.ty);
  camCache.set(key, cam);
  return cam;
}

// ---------- the simulation ----------
const restHead = (lift, bob = 0) => [0, 1.68 + lift, 0.40 + bob];   // head joint in the heading frame; ~91 % of the neck chain, so it stands as a gentle curve, not a looped S
const REST_PITCH = -0.12;
// At rest it stands three-quarter on, turned toward the middle of the stage, so the folded train shows.
export const IDLE_TURN = 0.8;
export const LAND_Y = 0.045;          // quill height of a fallen feather (its vane rests on one edge)
export function createSim({ seed = 7, aspect = 1.6 } = {}) {
  const S = {};
  function reset(newSeed = S.seed ?? seed) {
    Object.assign(S, {
      seed: newSeed, rng: mulberry(newSeed * 9973 + 17), t: 0, aspect: S.aspect ?? aspect,
      root: [0, 0, 0], heading: IDLE_TURN, vel: [0, 0], speed: 0,
      loco: { mode: 'idle', target: null, idle: 0, face: null, back: false, then: null },
      hover: false, hoverOverride: null, fanLatch: false, fan: 0, fanDir: 0,
      psi: 0, psiV: 0, wing: 0, pitch: 0, lift: 0, prevLift: 0, liftV: 0,
      jump: null, peck: null, pickup: null, queue: [], events: [], counter: 0,
      feathers: FEATHERS.map(F => ({ id: F.id, state: 'attached', quill: [0, 0, 0], dir: [0, 0, -1], side: [1, 0, 0], fall: null, grip: null })),
      feet: [-1, 1].map(side => ({ side, target: [side * 0.1, 0, 0.03], swing: null, planted: true })),
      lastStep: 0, stepToggle: 0,
      pose: null,
    });
    S.region = regionFor(S.aspect);
    solve(0);
    return S;
  }
  const emit = (type, extra = {}) => S.events.push({ type, t: +S.t.toFixed(4), ...extra });
  const idleFace = () => (S.root[0] > 0.05 ? -IDLE_TURN : IDLE_TURN);
  const hoverOn = () => (S.hoverOverride === null ? S.hover : S.hoverOverride);
  const busy = () => S.pickup !== null;

  // ---- commands ----
  const api = {
    get state() { return S; },
    reset: (n) => { reset(n); return true; },
    setAspect(a) { S.aspect = a; S.region = regionFor(a); const c = clampRegion(S.region, [S.root[0], S.root[2]]); S.root = [c[0], 0, c[1]]; },
    setHover(b) { S.hover = Boolean(b); },
    setHoverOverride(b) { S.hoverOverride = b === null || b === undefined ? null : Boolean(b); },
    setFanLatch(b) { S.fanLatch = Boolean(b); },
    walkTo(x, z) {
      if (busy()) return false;
      const c = clampRegion(S.region, [x, z]);
      S.loco = { ...S.loco, mode: 'follow', target: c, idle: 0, back: false, then: null };
      return true;
    },
    // dir > 0: one step toward the camera, then a hard peck; dir < 0: back away, still facing the camera.
    approach(dir) {
      if (busy()) return false;
      const z = clamp((S.loco.mode === 'approach' && S.loco.target ? S.loco.target[1] : S.root[2]) + (dir > 0 ? 0.55 : -0.55), S.region.z0, S.region.z1);
      S.loco = { mode: 'approach', target: [S.root[0], z], idle: 0, face: 0, back: dir < 0, then: dir > 0 ? 'peck' : null };
      return true;
    },
    jump() {
      if (busy() || S.jump) return false;
      S.jump = { phase: 'crouch', t: 0, y: 0, vy: 0 };
      return true;
    },
    peck(strong = false) {
      if (busy() || S.peck) return false;
      S.peck = { t: 0, strong: Boolean(strong), hit: false };
      return true;
    },
    // Detach a feather and have the bird fetch it. Repeats of the same id, feathers already off and clicks
    // past the queue limit are ignored: nothing is ever copied.
    pluck(id) {
      const f = S.feathers[id];
      if (!f || f.state !== 'attached' || S.queue.includes(id) || (S.pickup && S.pickup.id === id)) return false;
      if (S.pickup) { if (S.queue.length >= QUEUE_MAX) return false; S.queue.push(id); emit('queued', { id }); return 'queued'; }
      startPickup(id);
      return true;
    },
    step(dt) { const n = Math.max(1, Math.round(dt / STEP)); for (let i = 0; i < n; i++) tick(STEP); return S.pose; },
    drainEvents() { const e = S.events; S.events = []; return e; },
    action,
    owners,
    snapshot,
  };

  function startPickup(id) {
    const f = S.feathers[id];
    detach(f);
    S.pickup = { id, phase: 'wait', t: 0, total: 0 };
    S.loco = { mode: 'idle', target: null, idle: 0, face: null, back: false, then: null };
    emit('pluck', { id });
  }
  function detach(f) {
    // Fall from where it is attached now to a landing spot the bird can reach and the camera can see.
    const F = FEATHERS[f.id], env = envelope();
    const q0 = f.quill.slice(), d0 = f.dir.slice(), s0 = f.side.slice();
    // It drifts sideways (as seen from the camera) and a little toward the viewer, so the bird walks over
    // and picks it up side-on instead of with its back to the camera.
    const R = S.region, m = REACH - 0.2;
    let sideX = Math.sign(q0[0] - S.root[0]) || (S.rng() < 0.5 ? -1 : 1);
    const dx = 0.75 + 0.3 * S.rng(), dz = 0.15 + 0.3 * S.rng();
    const spot = (sx) => clampRegion(R, [q0[0] + sx * dx, q0[2] + dz], m);
    let land = spot(sideX);
    if (Math.abs(land[0] - q0[0]) < 0.45) { const alt = spot(-sideX); if (Math.abs(alt[0] - q0[0]) > Math.abs(land[0] - q0[0])) { land = alt; sideX = -sideX; } }
    const a = (S.rng() - 0.5) * 0.9;
    let h = norm([sideX * Math.cos(a), 0, Math.sin(a)]);
    const inner = env.r * 0.9, out = (p) => p[0] < R.x0 - inner || p[0] > R.x1 + inner || p[1] < R.z0 - inner || p[1] > R.z1 + inner;
    if (out([land[0] + h[0] * F.length, land[1] + h[2] * F.length])) h = [-h[0], 0, -h[2]];
    // Barbs keep it from lying quite flat: rolled about its shaft, the vane tips up toward the camera.
    const dF = h, flat = norm(cross([0, 1, 0], dF)), roll = 0.5;
    const tilt = (sg) => norm(add(scale(flat, Math.cos(roll)), scale([0, 1, 0], sg * Math.sin(roll))));
    const seen = (sv) => Math.abs(dot(cross(sv, dF), [0, 0.24, 0.97]));
    const sF = seen(tilt(1)) >= seen(tilt(-1)) ? tilt(1) : tilt(-1);
    const dur = 1.6 + 0.5 * clamp(q0[1] / 1.5) + 0.3 * S.rng();
    f.state = 'falling';
    f.fall = { t: 0, dur, q0, d0, s0, land: [land[0], LAND_Y, land[1]], dF, sF, phase: S.rng() * 6.28, sway: 0.05 + 0.05 * S.rng() };
  }

  // ---- what each channel is doing ----
  function owners() {
    const p = S.pickup;
    return {
      root: p ? 'pickup' : S.loco.mode === 'approach' ? (S.loco.back ? 'retreat' : 'approach') : hoverOn() ? 'display' : S.loco.mode === 'follow' ? 'follow' : 'idle',
      neck: p && p.phase !== 'wait' ? 'pickup' : S.peck ? 'peck' : p ? 'watch' : hoverOn() ? 'shake' : 'rest',
      vertical: S.jump ? 'jump' : 'ground',
      tail: S.fan > 0.001 || S.fanDir ? 'fan' : 'folded',
    };
  }
  function action() {
    if (S.pickup) return 'pickup:' + S.pickup.phase;
    if (S.jump) return 'jump:' + S.jump.phase;
    if (S.peck) return S.peck.strong ? 'peck:strong' : 'peck';
    if (S.loco.mode === 'approach') return S.loco.back ? 'retreat' : 'approach';
    if (S.loco.mode === 'follow' && S.speed > 0.02) return 'walk';
    if (hoverOn() || S.fan > 0.02) return 'display';
    return 'idle';
  }

  // ---- one fixed step ----
  function tick(dt) {
    S.t += dt;
    // Fan
    const fanTarget = hoverOn() || S.fanLatch ? 1 : 0;
    const dir = Math.sign(fanTarget - S.fan);
    if (dir !== 0 && dir !== S.fanDir) emit(dir > 0 ? 'fanOpen' : 'fanClose');
    S.fanDir = dir;
    S.fan = clamp(S.fan + clamp(fanTarget - S.fan, -FAN_RATE * dt, FAN_RATE * dt));
    // Pickup brain (sets the root goal for this step)
    let goal = null;
    if (S.pickup) goal = pickupGoal(dt);
    // Root
    moveRoot(dt, goal);
    // Vertical
    updateJump(dt);
    // Peck clock
    if (S.peck && !(S.pickup && S.pickup.phase !== 'wait')) {
      S.peck.t += dt;
      const T = peckTimes(S.peck.strong);
      if (!S.peck.hit && S.peck.t >= T.a + T.s) { S.peck.hit = true; emit('peck', { strong: S.peck.strong }); }
      if (S.peck.t >= T.a + T.s + T.h + T.r) S.peck = null;
    } else if (S.peck && S.pickup && S.pickup.phase !== 'wait') S.peck = null;
    solve(dt);
    if (S.pickup) pickupAfter(dt);
  }

  function moveRoot(dt, goal) {
    let target = null, face = null, back = false, vmax = SPEED.walk, stop = 0.035;
    const L = S.loco;
    if (goal) { target = goal.target; face = goal.face; vmax = goal.vmax ?? SPEED.walk; stop = 0.008; }
    else if (L.mode === 'approach') { target = L.target; face = 0; back = L.back; vmax = back ? SPEED.back : SPEED.walk * 0.8; }
    else if (hoverOn()) { target = null; face = 0; }
    else if (L.mode === 'follow') target = L.target;
    else { L.idle += dt; if (L.idle > 1.2) face = idleFace(); }
    const pos = [S.root[0], S.root[2]];
    let speed = 0, desired = S.heading;
    if (target) {
      const dx = target[0] - pos[0], dz = target[1] - pos[1], d = Math.hypot(dx, dz);
      if (back) {
        desired = face;
        const err = Math.abs(wrap(desired - S.heading));
        speed = -Math.min(vmax, d * 2) * clamp(Math.cos(err)) ** 2;
        if (d < 0.02) speed = 0;
      } else if (d > stop) {
        desired = Math.atan2(dx, dz);
        const err = Math.abs(wrap(desired - S.heading));
        speed = Math.min(vmax, d * 2.5) * clamp(Math.cos(err)) ** 3;
      } else if (face !== null) desired = face;
      if (!back && d <= 0.035 && L.mode === 'follow' && !goal) { L.mode = 'idle'; L.idle = 0; }
      if (!goal && L.mode === 'approach' && d < 0.04) {
        const then = L.then; S.loco = { mode: 'idle', target: null, idle: 0, face: null, back: false, then: null };
        if (then === 'peck') api.peck(true);
      }
    } else if (face !== null) desired = face;
    const turn = clamp(wrap(desired - S.heading), -SPEED.turn * dt, SPEED.turn * dt);
    S.heading = wrap(S.heading + turn);
    const f = forward(S.heading);
    let nx = pos[0] + f[0] * speed * dt, nz = pos[1] + f[2] * speed * dt;
    const c = clampRegion(S.region, [nx, nz]);
    S.vel = [(c[0] - pos[0]) / dt, (c[1] - pos[1]) / dt];
    S.speed = Math.hypot(...S.vel);
    S.turnRate = turn / dt;
    S.root = [c[0], 0, c[1]];
  }

  function updateJump(dt) {
    const J = S.jump;
    let lift = 0;
    if (J) {
      J.t += dt;
      if (J.phase === 'crouch') {
        lift = -JUMP.dip * Math.sin((Math.PI / 2) * clamp(J.t / JUMP.crouch));
        if (J.t >= JUMP.crouch) { J.phase = 'air'; J.t = 0; J.y = -JUMP.dip; J.vy = JUMP.v0; emit('jump'); }
      } else if (J.phase === 'air') {
        J.vy -= JUMP.g * dt; J.y += J.vy * dt; lift = J.y;
        if (J.y <= 0 && J.vy < 0) { J.phase = 'land'; J.t = 0; J.impact = -J.vy; lift = 0; emit('land', { speed: +J.impact.toFixed(2) }); for (const ft of S.feet) { ft.swing = null; ft.planted = true; } }
      } else {
        const u = J.t / JUMP.land;
        lift = -JUMP.landDip * Math.sin(Math.PI * clamp(u)) * Math.exp(-1.2 * u);
        if (J.t >= JUMP.land) { S.jump = null; lift = 0; }
      }
    }
    S.liftV = (lift - S.lift) / dt;
    S.prevLift = S.lift; S.lift = lift;
  }

  function peckTimes(strong) { return strong ? { a: 0.12, s: 0.09, h: 0.06, r: 0.28 } : { a: 0.08, s: 0.07, h: 0.04, r: 0.22 }; }

  // ---- pickup: root goals before the pose is solved ----
  function pickupGoal(dt) {
    const P = S.pickup, f = S.feathers[P.id];
    P.t += dt; P.total += dt;
    if (P.phase === 'wait') {
      // Turn toward where the feather will land; walk nowhere yet.
      const land = f.fall ? f.fall.land : f.quill;
      const face = Math.atan2(land[0] - S.root[0], land[2] - S.root[2]);
      if (f.state === 'grounded' && !S.jump && !S.peck) {
        P.phase = 'walk'; P.t = 0;
        const plan = standPoint(f.quill);
        P.stand = plan.stand; P.face = plan.face;
      }
      return { target: null, face };
    }
    if (P.phase === 'walk') {
      const d = Math.hypot(P.stand[0] - S.root[0], P.stand[1] - S.root[2]);
      const err = Math.abs(wrap(P.face - S.heading));
      if ((d < 0.02 && err < 0.03) || P.t > PICK.walkTimeout) { P.phase = 'reach'; P.t = 0; P.from = null; return { target: null, face: P.face }; }
      return { target: P.stand, face: P.face, vmax: SPEED.walk };
    }
    return { target: null, face: P.face ?? S.heading };
  }
  function standPoint(q) {
    const R = S.region, inside = (p) => p[0] >= R.x0 - 1e-9 && p[0] <= R.x1 + 1e-9 && p[1] >= R.z0 - 1e-9 && p[1] <= R.z1 + 1e-9;
    const fromBird = norm([q[0] - S.root[0], 0, q[2] - S.root[2]]), c = [(R.x0 + R.x1) / 2, (R.z0 + R.z1) / 2];
    const fromCentre = norm([q[0] - c[0], 0, q[2] - c[1]]);
    const cands = [fromBird, fromCentre];
    for (let a = 0; a < 16; a++) cands.push([Math.sin((a / 16) * Math.PI * 2), 0, Math.cos((a / 16) * Math.PI * 2)]);
    let best = null;
    for (const v of cands) {
      if (!Number.isFinite(v[0]) || len(v) < 0.5) continue;
      const st = [q[0] - v[0] * REACH, q[2] - v[2] * REACH];
      if (!inside(st)) continue;
      const cost = Math.hypot(st[0] - S.root[0], st[1] - S.root[2]) + 0.4 * angleBetween(v, fromBird);
      if (!best || cost < best.cost) best = { cost, stand: st, face: Math.atan2(v[0], v[2]) };
    }
    if (!best) { const st = clampRegion(R, [q[0], q[2]]); best = { stand: st, face: Math.atan2(q[0] - st[0], q[2] - st[1]) }; }
    return best;
  }
  // ---- pickup: phase changes that depend on the solved pose ----
  function pickupAfter() {
    const P = S.pickup, f = S.feathers[P.id], pose = S.pose;
    if (P.phase === 'reach' && P.t >= PICK.reach) {
      P.phase = 'grip'; P.t = 0;
      const err = dist(pose.beak, f.quill);
      P.gripError = err;
      // Hold the quill where it is relative to the head: the beak is already on it.
      f.state = 'carried';
      f.grip = { rel: dirLocal(pose.head, sub(f.quill, pose.beak)), dir0: f.dir.slice(), side0: f.side.slice() };
      emit('grip', { id: f.id, error: +err.toFixed(4) });
    } else if (P.phase === 'grip' && P.t >= PICK.grip) { P.phase = 'lift'; P.t = 0; P.from = null; }
    else if (P.phase === 'lift' && P.t >= PICK.lift) { P.phase = 'turn'; P.t = 0; P.from = null; }
    else if (P.phase === 'turn' && P.t >= PICK.turn) { P.phase = 'insert'; P.t = 0; P.from = null; }
    else if (P.phase === 'insert' && P.t >= PICK.insert) {
      const slot = slotWorld(f.id), e = dist(f.quill, slot.q), a = angleBetween(f.dir, slot.d);
      P.insertError = e; P.insertAngle = a;
      f.state = 'attached'; f.grip = null; f.fall = null;
      f.quill = slot.q; f.dir = slot.d; f.side = slot.s;
      emit('return', { id: f.id, error: +e.toFixed(4), angle: +a.toFixed(4) });
      P.phase = 'settle'; P.t = 0; P.from = null; P.done = true;
    } else if (P.phase === 'settle' && P.t >= PICK.settle) {
      S.pickup = null;
      const next = S.queue.shift();
      if (next !== undefined) startPickup(next);
    }
  }
  function slotWorld(id) {
    const F = FEATHERS[id], bf = S.pose.bodyFrame, sl = slotLocal(F, S.fan, S.psi, S.shiver || 0);
    return { q: toWorld(bf, F.anchor), d: dirWorld(bf, sl.d), s: dirWorld(bf, sl.s) };
  }

  // ---- pose ----
  function solve(dt) {
    // Body pitch, eased toward what the active owners ask for.
    const P = S.pickup;
    let pitchT = S.speed > 0.05 ? 0.05 : 0;
    if (P && (P.phase === 'reach' || P.phase === 'grip')) pitchT = 0.32;
    if (P && P.phase === 'lift') pitchT = 0.32 * (1 - ease(P.t / PICK.lift));
    if (S.peck && S.peck.strong) { const T = peckTimes(true), u = S.peck.t; pitchT = u < T.a ? -0.08 : u < T.a + T.s + T.h ? 0.18 : 0.0; }
    if (S.jump) pitchT = S.jump.phase === 'crouch' ? 0.14 : S.jump.phase === 'air' ? -0.06 : 0.1;
    S.pitch += (pitchT - S.pitch) * (1 - Math.exp(-14 * dt));
    // Tail sway: the train lags the body's vertical motion (droops on take-off, bounces on landing).
    const psiT = clamp(-S.liftV * 0.09, -0.3, 0.3);
    S.psiV += ((psiT - S.psi) * 90 - S.psiV * 11) * dt; S.psi += S.psiV * dt;
    S.shiver = S.fan > 0.95 ? 0.012 * Math.sin(S.t * 31) : 0;
    // Wings
    const wingT = S.jump ? (S.jump.phase === 'air' ? 0.85 : S.jump.phase === 'crouch' ? 0.15 : 0.3) : 0.12 * S.fan;
    S.wing += (wingT - S.wing) * (1 - Math.exp(-10 * dt));

    const bf = bodyFrame(S.root, S.heading, S.pitch, S.lift);
    const hf = headingFrame(S.root, S.heading, 0);
    // Feet and legs
    const legs = solveLegs(dt, bf, hf);
    // Neck target
    const nt = neckTarget(dt, bf, hf);
    const base = toWorld(bf, NECK.base);
    const neck = solveNeck(base, nt.h, nt.f, bf);
    const headJ = neck[neck.length - 1];
    const head = headFrame(headJ, nt.f);
    const beak = add(headJ, scale(head.z, BEAK));
    const wings = [-1, 1].map(side => {
      const o = toWorld(bf, [side * WING.shoulder[0], WING.shoulder[1], WING.shoulder[2]]);
      const a = S.wing * 1.1;
      const out = norm(add(scale(bf.x, side * Math.sin(a) * 0.6), add(scale(bf.y, Math.sin(a) * 0.8), scale(bf.z, -Math.cos(a)))));
      return { o, z: out, up: norm(add(bf.y, scale(bf.x, -side * Math.sin(a)))), side };
    });
    S.pose = { bodyFrame: bf, headingFrame: hf, neck, head, beak, legs, wings };
    updateFeathers(dt, bf, head, beak);
    S.pose.feathers = S.feathers;
  }

  function solveLegs(dt, bf, hf) {
    const fwd = hf.z, right = hf.x, J = S.jump, air = J && J.phase === 'air';
    const home = (side) => [S.root[0] + right[0] * side * 0.1 + fwd[0] * 0.03, 0, S.root[2] + right[2] * side * 0.1 + fwd[2] * 0.03];
    const lead = [S.vel[0] * 0.2, 0, S.vel[1] * 0.2];
    if (!air) {
      for (const ft of S.feet) if (ft.swing) {
        ft.swing.t += dt; const u = clamp(ft.swing.t / ft.swing.dur);
        const p = mix(ft.swing.from, ft.swing.to, smooth(u)); p[1] = 0.07 * Math.sin(Math.PI * u);
        ft.target = p;
        if (u >= 1) { ft.target = [ft.swing.to[0], 0, ft.swing.to[2]]; ft.swing = null; emit('step'); S.lastStep = S.t; }
      }
      if (!S.feet.some(ft => ft.swing) && !(J && J.phase !== 'land')) {
        const errs = S.feet.map(ft => dist(ft.target, add(home(ft.side), lead)));
        const moving = S.speed > 0.03 || Math.abs(S.turnRate || 0) > 0.3;
        const thresh = moving ? 0.09 : 0.03;
        const k = errs[0] >= errs[1] ? 0 : 1, other = 1 - k;
        let pick = errs[k] > thresh ? k : -1;
        if (pick >= 0 && moving && S.stepToggle === pick && errs[other] > thresh * 0.5) pick = other; // alternate
        if (pick >= 0 && (moving || S.t - S.lastStep > 0.25)) {
          const ft = S.feet[pick];
          ft.swing = { from: ft.target.slice(), to: add(home(ft.side), scale(lead, 1.1)), t: 0, dur: moving ? 0.24 : 0.2 };
          S.stepToggle = pick;
        }
      }
    }
    return S.feet.map(ft => {
      const hip = toWorld(bf, [ft.side * LEG.hip[0], LEG.hip[1], LEG.hip[2]]);
      let target = ft.target;
      if (air) {
        const tuck = add(hip, add(scale([0, 1, 0], -0.36), scale(fwd, -0.12)));
        const reachDown = home(ft.side);
        const k = clamp(-J.vy / JUMP.v0);
        target = mix(tuck, reachDown, smooth(k));
        ft.target = [target[0], Math.max(0, target[1]), target[2]];
      }
      const ik = twoBone(hip, target, LEG.thigh, LEG.shank, scale(fwd, -1));
      if (air) ft.target = [ik.foot[0], Math.max(0, ik.foot[1]), ik.foot[2]];
      return { hip, knee: ik.knee, foot: ik.foot, reached: ik.reached, side: ft.side, heading: S.heading };
    });
  }

  function neckTarget(dt, bf, hf) {
    const P = S.pickup, t = S.t, lift = S.lift;
    const bob = S.speed > 0.05 ? 0.04 * Math.sin(t * 2 * Math.PI * 1.9) : 0.006 * Math.sin(t * 1.7);
    const rest = () => ({ h: toWorld(hf, restHead(lift, bob)), f: headDir(hf, 0, REST_PITCH) });
    let goal = rest();
    if (P && P.phase !== 'wait') goal = pickupNeck(P, hf, rest, bf);
    else if (P && P.phase === 'wait' && !S.peck) {
      const f = S.feathers[P.id], v = dirLocal(hf, sub(f.quill, toWorld(hf, restHead(lift))));
      const yaw = clamp(Math.atan2(v[0], v[2]), -1.2, 1.2), pitch = clamp(Math.atan2(v[1], Math.hypot(v[0], v[2])), -1.0, 0.3);
      const r = rest(); goal = { h: add(r.h, dirWorld(hf, [Math.sin(yaw) * 0.08, 0, 0])), f: headDir(hf, yaw, pitch) };
    } else if (S.peck) {
      const T = peckTimes(S.peck.strong), u = S.peck.t, r = rest();
      const strong = S.peck.strong;
      const hit = strong ? [0, 0.24, 0.95] : [0, 0.62, 0.78], fp = headDir(hf, 0, strong ? -0.75 : -0.5);
      const hitH = sub(toWorld(hf, [hit[0], hit[1] + lift, hit[2]]), scale(fp, BEAK));
      const back = add(r.h, dirWorld(hf, [0, 0.05, -0.08]));
      if (u < T.a) goal = { h: mix(r.h, back, smooth(u / T.a)), f: slerp(r.f, headDir(hf, 0, 0.1), smooth(u / T.a)) };
      else if (u < T.a + T.s) { const k = (u - T.a) / T.s; goal = { h: mix(back, hitH, k * k), f: slerp(headDir(hf, 0, 0.1), fp, k) }; }
      else if (u < T.a + T.s + T.h) goal = { h: hitH, f: fp };
      else { const k = smooth((u - T.a - T.s - T.h) / T.r); goal = { h: mix(hitH, r.h, k), f: slerp(fp, r.f, k) }; }
    } else if (hoverOn()) {
      const amp = 0.32 * smooth(S.fan * 3);
      const r = rest();
      goal = { h: add(r.h, dirWorld(hf, [Math.sin(t * 2 * Math.PI * 3) * 0.03 * smooth(S.fan * 3), 0, 0])), f: headDir(hf, amp * Math.sin(t * 2 * Math.PI * 3), REST_PITCH) };
    }
    return goal;
  }

  function pickupNeck(P, hf, rest, bf) {
    // Swing the head out in front of the body between a high point and the ground, instead of along the
    // straight line between them: that line passes within 0.27 m of the neck base, where any neck folds.
    const base = toWorld(bf, NECK.base);
    const swing = (a, b, k) => {
      const mid = mix(a, b, 0.5); let h = [mid[0] - base[0], 0, mid[2] - base[2]];
      if (len(h) < 0.15) h = dirWorld(hf, [0, 0, 1]);
      const c = add(base, add(scale(norm(h), 0.8), [0, 0.15, 0]));
      return bez2(a, c, b, k);
    };
    const f = S.feathers[P.id], u = P.t;
    const pickF = headDir(hf, 0, -1.05);
    const F = FEATHERS[P.id];
    const sideSign = F.u >= 0 ? 1 : -1;
    const insF = headDir(hf, sideSign * 0.85 * Math.PI, -0.95);
    const liftH = toWorld(hf, [0, 1.55, 0.5]), liftF = headDir(hf, 0, -0.35);   // high enough that the neck is not left with slack to loop
    const slot = () => slotWorld(P.id);
    if (!P.from) P.from = { h: S.pose.neck[S.pose.neck.length - 1], f: S.pose.head.z };
    if (P.phase === 'reach') {
      const k = ease(u / PICK.reach), gh = sub(f.quill, scale(pickF, BEAK));
      return { h: swing(P.from.h, gh, k), f: slerp(P.from.f, pickF, k) };
    }
    if (P.phase === 'grip') return { h: sub(S.pose.beak, scale(pickF, BEAK)), f: pickF };
    if (P.phase === 'lift') { const k = ease(u / PICK.lift); return { h: swing(P.from.h, liftH, k), f: slerp(P.from.f, liftF, k) }; }
    if (P.phase === 'turn') {
      const k = ease(u / PICK.turn), s = slot();
      const pre = sub(add(s.q, scale(s.d, SLIDE)), scale(insF, BEAK));
      const over = toWorld(hf, [sideSign * 0.15, 1.7, 0.12]);   // arch high over the back on the way to the train
      const yaw = lerp(0, sideSign * 0.85 * Math.PI, k), pitch = lerp(-0.35, -0.95, k);
      return { h: bez2(P.from.h, over, pre, k), f: headDir(hf, yaw, pitch) };
    }
    if (P.phase === 'insert') {
      const k = smooth(u / PICK.insert), s = slot();
      const q = add(s.q, scale(s.d, SLIDE * (1 - k)));
      return { h: sub(q, scale(insF, BEAK)), f: insF };
    }
    // settle
    const k = ease(u / PICK.settle), r = rest();
    return { h: mix(P.from.h, r.h, k), f: slerp(P.from.f, r.f, k) };
  }

  function solveNeck(base, target, fwd, bf) {
    const n = NECK.n;
    // Keep the target within reach (the tests check that the beak still meets the quill).
    let tgt = target; const d0 = dist(base, tgt);
    if (d0 > NECK_LEN * 0.995) tgt = add(base, scale(norm(sub(tgt, base)), NECK_LEN * 0.995));
    // A bird pulls its neck in when the head comes close to the body (the vertebrae fold into an S under
    // the feathers), so the drawn neck is only a little longer than the straight line to the head. With a
    // fixed 0.91 m neck and the head 0.4-0.7 m away, the spare length had nowhere to go but into loops.
    const l = neckSeg(dist(base, tgt));
    // Start from a smooth guide curve whose length matches the chain, sampled at equal arc length, so the
    // result does not depend on the previous frame. The guide is a quadratic (a parabola arc, which cannot
    // loop or form a cusp) whose control point is pushed out from the middle of the base-to-head line, so
    // the bend peaks mid-neck and every joint shares it. The bulge goes toward the base's usual
    // forward-up direction, taken square to that line. (Until 2026-11-25 this was a cubic with both end
    // directions fixed; reaching down or back it looped, single joints bending 165-180°, and standing it
    // showed a small Z mid-neck.)
    const arc = (c) => { const ps = Array.from({ length: 41 }, (_, i) => c(i / 40)); let L = 0; const acc = [0]; for (let i = 1; i < ps.length; i++) { L += dist(ps[i], ps[i - 1]); acc.push(L); } return { ps, acc, L }; };
    const want = n * l * 1.015;
    const d1r = norm(add(scale(bf.z, 0.55), scale(bf.y, 0.85)));
    const ch = sub(tgt, base), chn = norm(ch), mid = add(base, scale(ch, 0.5));
    let side = sub(d1r, scale(chn, dot(d1r, chn)));
    if (len(side) < 0.2) side = sub(bf.z, scale(chn, dot(bf.z, chn)));
    side = norm(side);
    const curve = (m) => { const c = add(mid, scale(side, m)); return (u) => bez2(base, c, tgt, u); };
    let lo = 0, hi = 2;
    for (let k = 0; k < 24; k++) { const m = (lo + hi) / 2; if (arc(curve(m)).L < want) lo = m; else hi = m; }
    const A = arc(curve(lo));
    let pts = Array.from({ length: n + 1 }, (_, i) => {
      const s = (i / n) * A.L; let j = 1; while (j < A.acc.length - 1 && A.acc[j] < s) j++;
      const u = (s - A.acc[j - 1]) / Math.max(1e-9, A.acc[j] - A.acc[j - 1]);
      return mix(A.ps[j - 1], A.ps[j], clamp(u));
    });
    for (let it = 0; it < 24; it++) {
      pts[n] = tgt.slice();
      for (let i = n - 1; i >= 0; i--) pts[i] = add(pts[i + 1], scale(norm(sub(pts[i], pts[i + 1])), l));
      pts[0] = base.slice();
      for (let i = 1; i <= n; i++) pts[i] = add(pts[i - 1], scale(norm(sub(pts[i], pts[i - 1])), l));
      if (dist(pts[n], tgt) < 1e-5) break;
    }
    return pts;
  }

  function updateFeathers(dt, bf, head, beak) {
    const P = S.pickup;
    for (const f of S.feathers) {
      const F = FEATHERS[f.id];
      if (f.state === 'attached') {
        const sl = slotLocal(F, S.fan, S.psi, S.shiver);
        f.quill = toWorld(bf, F.anchor); f.dir = dirWorld(bf, sl.d); f.side = dirWorld(bf, sl.s);
      } else if (f.state === 'falling') {
        const fl = f.fall; fl.t += dt;
        const u = clamp(fl.t / fl.dur), k = smooth(u);
        const turn = smooth(u / 0.8);
        let d = slerp(fl.d0, fl.dF, turn);
        let s = mix(fl.s0, fl.sF, turn); s = norm(sub(s, scale(d, dot(s, d))));
        const ramp = smooth(fl.t / 0.25);
        const roll = 0.5 * Math.sin(fl.phase + fl.t * 4.2) * (1 - u) * ramp;
        const n = cross(s, d); s = norm(add(scale(s, Math.cos(roll)), scale(n, Math.sin(roll))));
        const flutter = fl.sway * Math.sin(fl.phase + fl.t * 2 * Math.PI * 1.2) * (1 - u) * ramp;
        let q = mix(fl.q0, fl.land, k);
        q = add(q, scale(cross([0, 1, 0], norm([d[0] + 1e-6, 0, d[2]])), flutter));
        q[1] = Math.max(q[1], 0.012 - F.length * Math.min(0, d[1]), 0.012);
        f.quill = q; f.dir = norm(d); f.side = s;
        if (u >= 1) { f.state = 'grounded'; f.quill = fl.land.slice(); f.dir = fl.dF.slice(); f.side = fl.sF.slice(); emit('landed', { id: f.id }); }
      } else if (f.state === 'carried') {
        f.quill = add(beak, dirWorld(head, f.grip.rel));
        const ph = P ? P.phase : 'settle', hf = S.pose.headingFrame;
        const held = dirWorld(hf, norm([0, 0.85, -0.5])), heldS = hf.x;
        let d, s;
        if (ph === 'grip') { d = f.grip.dir0; s = f.grip.side0; }
        else if (ph === 'lift') { const k = ease(P.t / PICK.lift); d = slerp(f.grip.dir0, held, k); s = mix(f.grip.side0, heldS, k); }
        else { const sl = slotWorld(f.id); if (ph === 'turn') { const k = ease(P.t / PICK.turn); d = slerp(held, sl.d, k); s = mix(heldS, sl.s, k); } else { d = sl.d; s = sl.s; } }
        d = norm(d); s = norm(sub(s, scale(d, dot(s, d))));
        f.dir = d; f.side = s;
      }
    }
  }

  function snapshot() {
    const pose = S.pose, counts = { attached: 0, falling: 0, grounded: 0, carried: 0 };
    for (const f of S.feathers) counts[f.state]++;
    const r3 = (v) => v.map(x => +x.toFixed(4));
    return {
      time: +S.t.toFixed(4), seed: S.seed,
      peacock: {
        position: r3(S.root), heading: +S.heading.toFixed(4), fan: +S.fan.toFixed(4), lift: +S.lift.toFixed(4), pitch: +S.pitch.toFixed(4),
        head: r3(pose.neck[pose.neck.length - 1]), beak: r3(pose.beak), facing: r3(forward(S.heading)),
      },
      action: action(), owners: owners(), hover: hoverOn(), fanLatch: S.fanLatch,
      pickup: S.pickup ? { id: S.pickup.id, phase: S.pickup.phase, t: +S.pickup.t.toFixed(3) } : null,
      queue: S.queue.slice(),
      feathers: S.feathers.map(f => ({ id: f.id, state: f.state, quill: r3(f.quill), tip: r3(add(f.quill, scale(f.dir, FEATHERS[f.id].length))) })),
      counts: { ...counts, total: S.feathers.length },
    };
  }

  reset(seed);
  return api;
}

// Every point of the bird worth checking against the frame edges and for broken joints.
export function posePoints(pose) {
  const pts = [], bf = pose.bodyFrame;
  for (const s of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) pts.push(toWorld(bf, [s[0] * BODY.rx, s[1] * BODY.ry, s[2] * BODY.rz]));
  pts.push(...pose.neck, pose.beak, add(pose.neck[pose.neck.length - 1], scale(pose.head.y, 0.14)));
  for (const L of pose.legs) pts.push(L.hip, L.knee, L.foot);
  for (const w of pose.wings) pts.push(add(w.o, scale(w.z, WING.len)));
  for (const f of pose.feathers) { const F = FEATHERS[f.id]; pts.push(f.quill, add(f.quill, scale(f.dir, F.length * F.eye)), add(f.quill, scale(f.dir, F.length))); }
  return pts;
}
// Broken-body readings: bone lengths, joints that should coincide, feet under the ground.
export function integrity(pose) {
  let bone = 0, joint = 0, ground = 0;
  // Neck bones are all the same length (the neck shortens as a whole when the head comes in, see neckSeg).
  const segs = []; for (let i = 1; i < pose.neck.length; i++) segs.push(dist(pose.neck[i], pose.neck[i - 1]));
  const seg0 = segs.reduce((a, b) => a + b, 0) / segs.length;
  for (const sg of segs) bone = Math.max(bone, Math.abs(sg - seg0));
  bone = Math.max(bone, Math.max(0, NECK_MIN * NECK.seg - seg0 - 1e-9), Math.max(0, seg0 - NECK.seg - 1e-9));
  joint = Math.max(joint, dist(pose.neck[0], toWorld(pose.bodyFrame, NECK.base)));
  joint = Math.max(joint, Math.abs(dist(pose.beak, pose.neck[pose.neck.length - 1]) - BEAK));
  for (const L of pose.legs) {
    bone = Math.max(bone, Math.abs(dist(L.hip, L.knee) - LEG.thigh), Math.abs(dist(L.knee, L.foot) - LEG.shank));
    joint = Math.max(joint, dist(L.hip, toWorld(pose.bodyFrame, [L.side * LEG.hip[0], LEG.hip[1], LEG.hip[2]])));
    ground = Math.max(ground, -L.foot[1]);
  }
  for (const f of pose.feathers) {
    if (f.state === 'attached') joint = Math.max(joint, dist(f.quill, toWorld(pose.bodyFrame, FEATHERS[f.id].anchor)));
    const tipY = f.quill[1] + f.dir[1] * FEATHERS[f.id].length;
    if (f.state !== 'attached') ground = Math.max(ground, -f.quill[1], -tipY);
  }
  return { bone, joint, ground };
}

// two-bone IK: knee bends toward `pole`
export function twoBone(a, target, l1, l2, pole) {
  const d = sub(target, a), D = len(d), maxD = l1 + l2 - 1e-4, minD = Math.abs(l1 - l2) + 1e-4;
  const reached = D <= maxD && D >= minD;
  const dd = clamp(D, minD, maxD), dir = norm(d);
  const x = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd), h = Math.sqrt(Math.max(0, l1 * l1 - x * x));
  let perp = sub(pole, scale(dir, dot(pole, dir)));
  if (len(perp) < 1e-6) perp = Math.abs(dir[1]) < 0.9 ? cross(dir, [0, 1, 0]) : cross(dir, [1, 0, 0]);
  perp = norm(perp);
  const knee = add(a, add(scale(dir, x), scale(perp, h)));
  const foot = add(a, scale(dir, dd));
  return { knee, foot, reached };
}

// Fixed URL scenes, reached by real play from a fixed seed (never posed by hand).
export const SCENES = ['stand', 'display', 'fallen', 'carrying', 'returned'];
export const DEMO_FEATHER = 16;
export function playScene(sim, name) {
  sim.reset(7);
  const until = (cond, max = 20) => { let t = 0; while (!cond() && t < max) { sim.step(0.05); t += 0.05; } return t < max; };
  const S = sim.state;
  if (name === 'stand') { sim.step(2.0); return 'stand'; }
  sim.setHoverOverride(true); sim.step(3.4);
  if (name === 'display') return 'display';
  sim.pluck(DEMO_FEATHER);
  if (!until(() => S.feathers[DEMO_FEATHER].state === 'grounded')) return 'failed';
  if (name === 'fallen') { sim.step(0.35); return 'fallen'; }
  if (!until(() => S.pickup && S.pickup.phase === 'turn' && S.pickup.t > PICK.turn * 0.55)) return 'failed';
  if (name === 'carrying') return 'carrying';
  if (!until(() => !S.pickup)) return 'failed';
  sim.step(1.2);
  return name === 'returned' ? 'returned' : 'failed';
}
