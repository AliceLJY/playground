// 凸透镜成像 — pure logic, no three.js. Node tests import this file directly; the page renders what it computes.
// Units: centimetres. The bench is a 0–100 cm ruler; the lens stands at the 40 cm mark.
// Optics is the thin-lens model taught in school: 1/u + 1/v = 1/f, real distances positive, a virtual image has v < 0.

export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, k) => a + (b - a) * k;

export const F = 10;              // focal length
export const LENS_X = 40;         // lens position on the ruler
export const BENCH = [0, 100];
export const APERTURE = 6;        // lens diameter, sets how fast the picture blurs off focus
export const OBJ_H = 3;           // flame tip above the optical axis (the object point the ray diagram traces)
export const CANDLE = [LENS_X - 37, LENS_X - 4.5]; // candle between the 3 and 35.5 cm marks: u from 4.5 (holders touch) to 37
export const SCREEN = [LENS_X + 2, BENCH[1]];       // screen between 42 and 100: s from 2 to 60
export const SHARP = 0.3;         // blur circle on the screen (cm) below which the picture counts as sharp
export const SNAP = 0.6;          // the candle clicks onto f and 2f when dragged this close
export const HOLD = 0.5;          // seconds a sharp picture (or the focal spot) must stay put, not merely be swept past

// ---------------- the lens ----------------
// image of an object u in front of the lens. kind: 'real' | 'virtual' | 'none' (object on the focal point)
export function image(u, f = F) {
  if (Math.abs(u - f) < 1e-6) return { kind: 'none', v: Infinity, m: Infinity };
  const v = (u * f) / (u - f);
  return { kind: v > 0 ? 'real' : 'virtual', v, m: -v / u };   // m < 0: inverted
}

// the five cases of the textbook table; the boundaries are exact once the candle has snapped onto them
export const REGIONS = {
  far:   { range: 'u ＞ 2f',      upright: false, size: '缩小', real: true,  imgRange: 'f ＜ v ＜ 2f', use: '照相机' },
  two:   { range: 'u ＝ 2f',      upright: false, size: '等大', real: true,  imgRange: 'v ＝ 2f',      use: '测焦距' },
  mid:   { range: 'f ＜ u ＜ 2f', upright: false, size: '放大', real: true,  imgRange: 'v ＞ 2f',      use: '投影仪' },
  focal: { range: 'u ＝ f',       upright: null,  size: '—',    real: null,  imgRange: '不成像',      use: '平行光源' },
  near:  { range: 'u ＜ f',       upright: true,  size: '放大', real: false, imgRange: '与物同侧',    use: '放大镜' },
};
export const REGION_ORDER = ['far', 'two', 'mid', 'focal', 'near'];
export function region(u, f = F) {
  const e = 1e-6;
  if (Math.abs(u - 2 * f) < e) return 'two';
  if (Math.abs(u - f) < e) return 'focal';
  if (u > 2 * f) return 'far';
  if (u > f) return 'mid';
  return 'near';
}
export function describe(key) {
  const r = REGIONS[key];
  if (key === 'focal') return '不成像';
  return `${r.upright ? '正立' : '倒立'}、${r.size}的${r.real ? '实像' : '虚像'}`;
}

// candle drag: clamp to the bench, click onto f and 2f
export function snapCandle(x, f = F) {
  x = clamp(x, CANDLE[0], CANDLE[1]);
  for (const k of [2 * f, f]) if (Math.abs(LENS_X - x - k) < SNAP) return LENS_X - k;
  return x;
}
export const clampScreen = (x) => clamp(x, SCREEN[0], SCREEN[1]);

// what the screen at distance s shows. blur: diameter of the blur circle in cm (Infinity: nothing lands as a picture)
export function onScreen(u, s, f = F) {
  const im = image(u, f);
  if (im.kind !== 'real') return { kind: im.kind, blur: Infinity, sharp: false, reachable: false, v: im.v, m: im.m };
  const blur = (APERTURE * Math.abs(s - im.v)) / im.v;
  const reachable = im.v <= SCREEN[1] - LENS_X;
  return { kind: 'real', blur, sharp: blur < SHARP, reachable, v: im.v, m: im.m };
}

// the screen position that would be sharp, if the bench allows it
export const bestScreen = (u, f = F) => { const im = image(u, f); return im.kind === 'real' ? LENS_X + im.v : null; };

// parallel light (step 1): the spot on a screen at s has diameter APERTURE*|s-f|/f; smallest at s = f
export const sunSpot = (s, f = F) => (APERTURE * Math.abs(s - f)) / f;

// ---------------- ray diagram ----------------
// three textbook rays from the flame tip, in bench coordinates (x on the ruler, y above the axis).
// solid: segments light really travels; dashed: backward extensions that locate a virtual image.
export function rays(u, xEnd = BENCH[1], f = F) {
  const L = LENS_X, h = OBJ_H, ox = L - u, im = image(u, f);
  const solid = [], dashed = [];
  // 1. parallel to the axis, then bent through the far focal point
  solid.push([ox, h, L, h], [L, h, xEnd, h - (h / f) * (xEnd - L)]);
  // 2. through the centre, undeviated
  solid.push([ox, h, xEnd, h - (h / u) * (xEnd - ox)]);
  // 3. along the line through the near focal point, then parallel to the axis. Inside f the line comes from the focal
  //    point behind the candle; either way it meets the lens at y3 = -h f / (u - f). On f itself rays 1 and 2 leave parallel.
  if (im.kind !== 'none') {
    const y3 = (-h * f) / (u - f);
    solid.push([ox, h, L, y3], [L, y3, xEnd, y3]);
    if (im.kind === 'virtual') {
      const vx = L + im.v, vy = im.m * h;
      dashed.push([L, h, vx, vy], [L, y3, vx, vy], [ox, h, vx, vy]);
    }
  }
  return { solid, dashed, image: im.kind === 'none' ? null : { x: L + im.v, y: im.m * h } };
}

// ---------------- the lesson ----------------
// Each step has a goal the learner reaches with their own hands; done(state) reads the live bench, never a button.
// state: { u, s, sun, eye, predicted, found: Set of region keys, focusFound }
export const QUESTION = '放大镜和投影仪用的都是凸透镜，为什么一个看到正的像，一个投出倒的像？';
export const STEPS = [
  { id: 'focus', title: '找焦点', goal: '打开平行光，拖动光屏，找到最小最亮的光斑', done: (s) => s.focusFound },
  { id: 'guess', title: '先猜一猜', goal: '蜡烛放得很远时，光屏上会出现什么样的像？', done: (s) => s.predicted != null },
  { id: 'far', title: '放远处', goal: '把蜡烛放到 2 倍焦距以外，再拖光屏找到清晰的像', done: (s) => s.found.has('far') },
  { id: 'two', title: '2 倍焦距', goal: '把蜡烛拖到 2 倍焦距处（会自动卡住），找清晰的像', done: (s) => s.found.has('two') },
  { id: 'mid', title: '再近一点', goal: '把蜡烛放在 1 倍和 2 倍焦距之间，找清晰的像', done: (s) => s.found.has('mid') },
  { id: 'focal', title: '放到焦点上', goal: '把蜡烛拖到焦点上，来回移动光屏，看看能不能找到像', done: (s) => s.found.has('focal') },
  { id: 'near', title: '比焦点还近', goal: '把蜡烛放到焦点以内，光屏上找不到像了，点「用眼睛看」', done: (s) => s.found.has('near') },
  { id: 'answer', title: '揭晓', goal: '规律都找齐了，回到开头那个问题', done: () => false },
];
export const GUESS = ['正立、放大', '倒立、缩小', '倒立、放大', '看不到像'];
export const GUESS_RIGHT = 1;

// fold one moment of the bench into the record of what has been found. Returns the newly found region or null.
// A real image (and the focal spot under parallel light) counts only after it has stayed sharp for HOLD seconds with
// nothing being dragged: sweeping the screen through the sharp spot is not finding it. The focal case counts once the
// screen has swept at least 15 cm while the candle sat on f; the virtual case once the learner looks through the lens.
export function observe(state, dt = 1 / 60, f = F) {
  const u = LENS_X - state.candle, s = state.screen - LENS_X, key = region(u, f);
  const held = (ok) => { state.hold = ok && !state.dragging ? (state.hold || 0) + dt : 0; return state.hold >= HOLD; };
  if (state.sun) {
    if (held(sunSpot(s, f) < SHARP) && !state.focusFound) { state.focusFound = true; return 'focus'; }
    return null;
  }
  if (key === 'focal') {
    state.hold = 0;
    state.sweep = state.sweep || { lo: s, hi: s };
    state.sweep.lo = Math.min(state.sweep.lo, s); state.sweep.hi = Math.max(state.sweep.hi, s);
    if (state.sweep.hi - state.sweep.lo >= 15 && !state.found.has('focal')) { state.found.add('focal'); return 'focal'; }
    return null;
  }
  state.sweep = null;
  if (key === 'near') {
    state.hold = 0;
    if (state.eye && !state.found.has('near')) { state.found.add('near'); return 'near'; }
    return null;
  }
  if (held(onScreen(u, s, f).sharp) && !state.found.has(key)) { state.found.add(key); return key; }
  return null;
}

export function newState() {
  return { candle: LENS_X - 30, screen: LENS_X + 30, sun: false, eye: false, predicted: null, focusFound: false, found: new Set(), sweep: null, hold: 0, dragging: false };
}

// the first step not yet done (the answer step once everything is found)
export function currentStep(state) {
  const s = { ...state, u: LENS_X - state.candle };
  const i = STEPS.findIndex((st) => !st.done(s));
  return i < 0 ? STEPS.length - 1 : i;
}
