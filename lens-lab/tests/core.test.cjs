// Logic checks for 凸透镜成像. Run in this folder: node --test tests/*.test.cjs
// Each test names the SPEC.md item it guards and drives the same code the page runs (src/core.js).
// Pixels, layout and touch are checked in a browser by tools/browser-check.cjs.
const test = require('node:test');
const assert = require('node:assert');
const load = () => import('../src/core.js');
const near = (a, b, e = 1e-6) => Math.abs(a - b) < e;

test('SPEC 1: the thin-lens equation and the five textbook cases', async () => {
  const c = await load(), f = c.F;
  for (let u = 2; u <= 37; u += 0.25) {
    const im = c.image(u);
    if (near(u, f)) { assert.equal(im.kind, 'none'); continue; }
    assert.ok(near(1 / u + 1 / im.v, 1 / f, 1e-9), `1/u+1/v=1/f fails at u=${u}`);
    const key = c.region(u), r = c.REGIONS[key];
    if (key === 'near') { assert.equal(im.kind, 'virtual'); assert.ok(im.m > 1, `u=${u}: a magnifier image is upright and larger, m=${im.m}`); }
    if (key === 'far') { assert.ok(im.m < 0 && im.m > -1 && im.v > f && im.v < 2 * f, `u=${u}: beyond 2f the image is inverted, smaller, f<v<2f`); }
    if (key === 'mid') { assert.ok(im.m < -1 && im.v > 2 * f, `u=${u}: between f and 2f the image is inverted, larger, v>2f`); }
    if (key === 'two') { assert.ok(near(im.m, -1) && near(im.v, 2 * f)); }
    assert.equal(r.upright, im.m > 0, `u=${u}: table says upright=${r.upright}`);
  }
  assert.equal(c.describe('far'), '倒立、缩小的实像');
  assert.equal(c.describe('mid'), '倒立、放大的实像');
  assert.equal(c.describe('near'), '正立、放大的虚像');
});

test('SPEC 2: the candle clicks onto f and 2f, and only there', async () => {
  const c = await load(), L = c.LENS_X, f = c.F;
  assert.equal(c.snapCandle(L - 2 * f + 0.4), L - 2 * f);
  assert.equal(c.snapCandle(L - f - 0.5), L - f);
  assert.equal(c.snapCandle(L - 15), L - 15);
  assert.equal(c.snapCandle(-50), c.CANDLE[0]);
  assert.equal(c.snapCandle(L + 5), c.CANDLE[1]);
  // fine-step buttons step off f and 2f (they froze there when they shared the drag's snap reach)
  for (const k of [f, 2 * f]) for (const d of [c.NUDGE, -c.NUDGE]) {
    const x = c.nudgeCandle(L - k, d);
    assert.ok(Math.abs(x - (L - k + d)) < 1e-9, `nudge ${d} from u=${k} landed on ${L - x}`);
  }
  // and stepping back in 0.5 cm steps lands exactly on them again
  let x = L - f - 1.5; for (let i = 0; i < 3; i++) x = c.nudgeCandle(x, 0.5); assert.equal(x, L - f);
  // every region can be reached by dragging
  const seen = new Set();
  for (let x = -5; x <= L + 5; x += 0.1) seen.add(c.region(L - c.snapCandle(x)));
  assert.deepEqual([...seen].sort(), [...c.REGION_ORDER].sort());
});

test('SPEC 3: the screen is sharp only at the image distance, and every real case is reachable on the bench', async () => {
  const c = await load(), L = c.LENS_X;
  for (const u of [30, 20, 15, 13]) {
    const best = c.bestScreen(u);
    assert.ok(best <= c.SCREEN[1], `u=${u}: image at ${best} is past the bench end`);
    assert.ok(c.onScreen(u, best - L).sharp);
    assert.ok(!c.onScreen(u, best - L + 3).sharp && !c.onScreen(u, best - L - 3).sharp, `u=${u}: 3 cm off focus must look blurred`);
    // the sharp band is narrow enough to need a search but wide enough for a finger (0.3–5 cm; it widens with v, as on a real bench)
    let lo = Infinity, hi = -Infinity;
    for (let s = 2; s <= 60; s += 0.01) if (c.onScreen(u, s).sharp) { lo = Math.min(lo, s); hi = Math.max(hi, s); }
    assert.ok(hi - lo > 0.3 && hi - lo < 5, `u=${u}: sharp band ${(hi - lo).toFixed(2)} cm`);
  }
  // just outside f the image lies past the end of the bench: the page must say so instead of pretending
  assert.equal(c.onScreen(11, 50).reachable, false);
  assert.ok(c.SCREEN[0] - L >= 6, 'the screen stops clear of the lens (tilted board, holders)');
  assert.ok(L - c.CANDLE[1] >= 4.4, 'the candle holder stops clear of the lens holder');
  for (const u of [10, 6]) assert.equal(c.onScreen(u, 30).sharp, false, 'no picture on the screen at or inside f');
});

test('SPEC 4: ray diagram — the three rays meet at the image point', async () => {
  const c = await load(), f = c.F;
  const yAt = (seg, x) => seg[1] + ((seg[3] - seg[1]) * (x - seg[0])) / (seg[2] - seg[0]);
  for (const u of [30, 20, 15, 12]) {
    const r = c.rays(u, 400);
    const outs = [r.solid[1], r.solid[2], r.solid[4]];
    for (const s of outs) assert.ok(near(yAt(s, r.image.x), r.image.y, 1e-6), `u=${u}: a ray misses the real image`);
    assert.equal(r.dashed.length, 0);
  }
  for (const u of [8, 5, 3]) {
    const r = c.rays(u);
    assert.equal(r.dashed.length, 3, `u=${u}: three backward extensions locate the virtual image`);
    for (const d of r.dashed) assert.ok(near(d[2], r.image.x) && near(d[3], r.image.y));
    assert.ok(r.image.x < c.LENS_X - u, 'the virtual image is behind the candle, on the same side');
    assert.ok(r.image.y > c.OBJ_H, 'and taller than the flame');
  }
  const r = c.rays(f);
  assert.equal(r.image, null);
  const k1 = (r.solid[1][3] - r.solid[1][1]) / (r.solid[1][2] - r.solid[1][0]), k2 = (r.solid[2][3] - r.solid[2][1]) / (r.solid[2][2] - r.solid[2][0]);
  assert.ok(near(k1, k2), 'on the focal point the rays leave parallel and never meet');
});

test('SPEC 5: a lesson is completed by hand, in any order, and cannot be faked by pressing a button', async () => {
  const c = await load(), L = c.LENS_X, f = c.F;
  const st = c.newState();
  // hold the bench still for t seconds at 60 fps; returns the first thing found
  const hold = (t = 0.6) => { let hit = null; for (let i = 0; i < Math.round(t * 60); i++) hit = hit || c.observe(st, 1 / 60); return hit; };
  assert.equal(c.currentStep(st), 0);
  // parallel light: only a screen at f makes the smallest spot
  st.sun = true; st.screen = L + 14; assert.equal(hold(), null);
  st.screen = L + f; assert.equal(c.observe(st), null, 'one frame on the focal spot is not enough');
  assert.equal(hold(), 'focus');
  st.sun = false; assert.equal(c.currentStep(st), 1);
  st.predicted = 2; assert.equal(c.currentStep(st), 2);
  // a blurred picture does not count
  st.candle = L - 30; st.screen = c.bestScreen(30) + 2; assert.equal(hold(), null);
  // sweeping through the sharp spot while dragging does not count, even if held there mid-drag
  st.screen = c.bestScreen(30); st.dragging = true; assert.equal(hold(1), null);
  st.dragging = false; assert.equal(hold(0.3), null, 'released for 0.3 s: not yet');
  assert.equal(hold(0.3), 'far');
  // doing a later case first is remembered; the step bar skips it when it gets there
  st.candle = L - 15; st.screen = c.bestScreen(15); assert.equal(hold(), 'mid');
  assert.equal(c.currentStep(st), 3);
  st.candle = L - 20; st.screen = c.bestScreen(20); hold(); assert.equal(c.currentStep(st), 5);
  // focal point: needs a real sweep of the screen
  st.candle = L - f; st.screen = L + 20; c.observe(st); st.screen = L + 30; assert.equal(c.observe(st), null);
  st.screen = L + 36; assert.equal(c.observe(st), 'focal');
  // inside f: looking at the screen finds nothing, looking through the lens does
  st.candle = L - 6; st.screen = L + 30; assert.equal(hold(), null);
  st.eye = true; assert.equal(c.observe(st), 'near');
  assert.equal(c.currentStep(st), c.STEPS.length - 1);
  assert.equal(c.GUESS[c.GUESS_RIGHT], '倒立、缩小');
});
