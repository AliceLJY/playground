const test = require('node:test');
const assert = require('node:assert/strict');
const load = () => Promise.all([import('../src/model.js'), import('../src/discovery.js'), import('../src/tour.js')]);

// Drive the same easing, cycle integration and pose as the page. Intents are the
// slider/arrow speed targets and the existing part selector; DOM wiring is tested in Chrome.
function driver(M, D, cycle = 0) {
  let s = D.discoveryIntent(D.discoveryIntent(D.newDiscovery(), 'invite'), 'start');
  let v = 0.25, target = v, focus = null, t = 0;
  const seen = new Set();
  return {
    get state() { return s; }, seen,
    speed(value) { target = value; },
    arrow(key) { target = M.clamp(target + (key === 'ArrowUp' ? 0.1 : -0.1), 0, M.SPEED_MAX); },
    focus(value) { focus = value; },
    intent(value) { s = D.discoveryIntent(s, value); },
    run(seconds, opts = {}) {
      for (let i = 0; i < Math.round(seconds * 60); i++) {
        t += 1 / 60; v += (target - v) * (1 - Math.exp(-3.2 / 60));
        cycle += M.strideFrequency(v) * M.SLOW / 60;
        const p = { ...M.pose(v, t, { cycle, ...opts }), explode: opts.explode || 0 };
        for (const leg of p.legs) {
          if (leg.stance && leg.load > 0.01 && Math.abs(leg.P[1]) < 0.3) seen.add(`${s.step}:${leg.id}:down`);
          if (!leg.stance && leg.P[1] > 0.3) seen.add(`${s.step}:${leg.id}:swing`);
        }
        s = D.observeDiscovery(s, p, 1 / 60, focus);
      }
    },
  };
}

test('NG3-1: invitation only at the 36-second tour boundary, frames unchanged', async () => {
  const [, D, T] = await load();
  assert.equal(T.advanceTour(35.9, 0.05).ended, false);
  assert.equal(T.advanceTour(35.99, 0.02).ended, true);
  assert.equal(T.tourAt(36).v, T.tourAt(0).v);
  let s = D.discoveryIntent(D.newDiscovery(), 'invite');
  assert.equal(s.status, 'invited');
  s = D.discoveryIntent(s, 'close');
  assert.deepEqual(D.discoveryIntent(s, 'invite'), D.newDiscovery('closed'));
});

test('NG3-2: arrow/slider/part/confirm sequence completes across 12 starting phases with real footfalls', async () => {
  const [M, D] = await load();
  for (let seed = 0; seed < 12; seed++) {
    const d = driver(M, D, seed / 12);
    for (let i = 0; i < 9; i++) d.arrow('ArrowUp'); // 0.25 → 1.15
    d.run(4); assert.equal(d.state.step, 1, `phase ${seed}: four legs`);
    d.speed(1.5); d.run(4); assert.equal(d.state.step, 2, `phase ${seed}: two legs`);
    d.focus('legs2'); d.run(1.6); assert.equal(d.state.ready, true);
    for (const [step, ids] of [[0, ['L2', 'R2', 'L3', 'R3']], [1, ['L3', 'R3']], [2, ['L3', 'R3']]]) {
      for (const id of ids) for (const phase of ['down', 'swing']) assert.ok(d.seen.has(`${step}:${id}:${phase}`), `non-vacuous: ${step} ${id} ${phase}`);
    }
    d.intent('confirm'); assert.equal(d.state.status, 'reward');
    d.intent('close'); assert.deepEqual(d.state, D.newDiscovery('closed'));
    d.speed(0.4); d.run(2); assert.deepEqual(d.state, D.newDiscovery('closed'), 'no progress/hint survives normal running');
  }
});

test('NG3-3: jumping straight to two legs cannot skip four; correction and early confirmation recover', async () => {
  const [M, D] = await load(), d = driver(M, D);
  d.speed(1.5); d.run(4);
  assert.equal(d.state.step, 0); assert.equal(d.state.held, 0); assert.match(d.state.hint, /中足/);
  assert.ok([...d.seen].some((x) => x.endsWith('L3:down')), 'wrong-speed run really included loaded hind contact');
  d.speed(1.15); d.run(3); assert.equal(d.state.step, 1);
  d.speed(0); d.run(4); assert.equal(d.state.step, 1); assert.equal(d.state.held, 0);
  d.speed(1.5); d.run(4); assert.equal(d.state.step, 2);
  d.focus('legs0'); d.intent('confirm'); d.run(2);
  assert.equal(d.state.status, 'active'); assert.equal(d.state.ready, false); assert.match(d.state.hint, /后足/);
  d.focus('legs2'); d.run(0.4); d.intent('confirm');
  assert.equal(d.state.status, 'active'); assert.ok(d.state.held > 0 && d.state.held < 1);
  d.run(1); d.intent('confirm'); assert.equal(d.state.status, 'reward');
});

test('NG3-3: an interrupted observation clears only this step, not previously found gait changes', async () => {
  const [M, D] = await load(), d = driver(M, D);
  d.speed(1.15); d.run(4); d.speed(1.5); d.run(4); d.focus('legs2'); d.run(0.5);
  assert.ok(d.state.held > 0.4); assert.ok(d.state.down || d.state.swing, 'partial observation has actual leg evidence');
  d.focus('legs1'); d.run(0.1);
  assert.equal(d.state.step, 2); assert.equal(d.state.held, 0); assert.equal(d.state.down, 0); assert.equal(d.state.swing, 0);
  d.focus('legs2'); d.run(1.5); assert.equal(d.state.ready, true);
  d.run(0.1, { swag: 1 }); assert.equal(d.state.ready, false); assert.equal(d.state.held, 0);
});

test('NG3-2/3: zone labels, frozen poses, unloaded feet and partly lifted legs are insufficient', async () => {
  const [M, D] = await load();
  const start = { ...D.newDiscovery('active'), step: 1 };
  const sample = (makePose) => {
    let s = start;
    for (let i = 0; i < 180; i++) s = D.observeDiscovery(s, makePose(i), 1 / 60, null);
    assert.equal(s.step, 1, 'insufficient physical evidence cannot complete a step');
  };
  sample(() => M.pose(1.5, 0, { cycle: 0.1 })); // one foot never swings/lands
  sample((i) => M.pose(1.3, i / 60, { cycle: i / 60 })); // zone says two, middle feet still partly loaded
  sample((i) => M.pose(1.5, i / 60, { cycle: i / 60, swag: 1 }));
  sample((i) => ({ ...M.pose(1.5, i / 60, { cycle: i / 60 }), explode: 1 }));
  sample((i) => { const p = M.pose(1.5, i / 60, { cycle: i / 60 }); p.legs = p.legs.map((l) => ({ ...l, load: 0 })); return p; });
  sample((i) => { const p = M.pose(1.5, i / 60, { cycle: i / 60 }); p.legs[0].P[1] = 0; return p; });
});

test('NG3-2: less than one continuous second or a single long frame cannot finish', async () => {
  const [M, D] = await load();
  let s = D.newDiscovery('active');
  for (let i = 0; i < 54; i++) s = D.observeDiscovery(s, M.pose(1.15, 0, { cycle: i / 54 }), 1 / 60);
  assert.ok(s.down && s.swing, 'short window still sampled real contact and swing');
  assert.equal(s.step, 0); assert.ok(s.held < 1);
  s = D.observeDiscovery(D.newDiscovery('active'), M.pose(1.15, 0), 30);
  assert.equal(s.step, 0); assert.ok(s.held <= 0.05);
});
