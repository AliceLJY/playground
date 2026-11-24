// Docking, rotation, sun and camera rules from SPEC.md, checked on the real motion functions.
const test = require('node:test');
const assert = require('node:assert/strict');
const core = import('../src/core.js');

const STEP = 1 / 60;
const sample = (from, to, fn, dt = STEP) => { for (let t = from; t <= to + 1e-9; t += dt) fn(t); };

test('A1 four docking steps run in order: 接近 8 s, 对齐 6 s, 接触 4 s, 停稳 5 s', async () => {
  const { PHASES, phaseAt, CYCLE } = await core;
  const order = PHASES.map(p => p.key);
  for (const k of ['approach', 'align', 'contact', 'settle']) assert.ok(order.includes(k), `missing step ${k}`);
  assert.ok(order.indexOf('approach') < order.indexOf('align') && order.indexOf('align') < order.indexOf('contact') && order.indexOf('contact') < order.indexOf('settle'), 'steps out of order');
  const dur = Object.fromEntries(PHASES.map(p => [p.key, p.end - p.start]));
  assert.deepEqual([dur.approach, dur.align, dur.contact, dur.settle], [8, 6, 4, 5], 'step durations drifted from the spec (each step must stay ≥ 4 s to be readable)');
  assert.equal(PHASES[0].start, 0); assert.equal(PHASES.at(-1).end, CYCLE);
  for (let i = 1; i < PHASES.length; i++) assert.equal(PHASES[i].start, PHASES[i - 1].end, 'phases must tile the cycle');
  assert.equal(phaseAt(CYCLE + 20).key, 'approach', 'phase lookup must wrap with the cycle');
});

test('A1 the shuttle path is continuous over the whole cycle, including the wrap back to station-keeping', async () => {
  const { shuttleAt, CYCLE } = await core;
  let prev = shuttleAt(-STEP), worst = 0, worstAt = 0, worstRot = 0;
  sample(0, CYCLE + 1, (t) => {
    const s = shuttleAt(t), d = Math.hypot(...s.position.map((v, i) => v - prev.position[i]));
    const qd = Math.abs(s.quaternion.reduce((a, v, i) => a + v * prev.quaternion[i], 0));
    if (d > worst) { worst = d; worstAt = t; }
    worstRot = Math.max(worstRot, 2 * Math.acos(Math.min(1, qd)));
    prev = s;
  });
  // Time is compressed (50 s per docking), so legs are fast; 0.3 m per 1/60 s = 18 m/s is the spec ceiling.
  assert.ok(worst < 0.3, `shuttle jumps ${worst.toFixed(3)} m in one frame at ${worstAt.toFixed(2)} s`);
  assert.ok(worstRot < 0.05, `shuttle attitude jumps ${(worstRot * 180 / Math.PI).toFixed(2)}° in one frame`);
});

test('A1 contact is gentle and the settle step ends aligned with all 12 hooks closed', async () => {
  const { shuttleAt, shuttleVelocity, TOUCH, PORT } = await core;
  const v = Math.hypot(...shuttleVelocity(TOUCH - 0.01));
  assert.ok(v > 0.05 && v <= 0.2, `closing speed at first touch ${v.toFixed(3)} m/s, spec 0.05–0.2 m/s`);
  const before = shuttleAt(TOUCH - 0.02);
  assert.ok(before.distance > 0 && before.distance < 0.01, 'the docking rings must not touch before TOUCH');
  assert.ok(before.lateral < 0.005, `lateral miss at contact ${before.lateral} m`);
  const end = shuttleAt(39.9);
  assert.ok(end.lateral < 0.01 && Math.abs(end.distance) < 0.01, 'settled shuttle must sit on the port axis and face');
  assert.ok(end.axisError < 0.1 * Math.PI / 180 && Math.abs(end.rollError) < 0.1 * Math.PI / 180, 'settled shuttle must be aligned within 0.1°');
  assert.equal(end.latched, PORT.latches);
  // Hooks close one at a time during 停稳, never during 接触.
  let last = 0;
  sample(31, 40, (t) => { const s = shuttleAt(t); assert.ok(s.latched >= last, 'hooks must only close'); last = s.latched; if (t < 35) assert.equal(s.latched, 0, 'no hook closes before 停稳'); });
});

test('A1 every docking step is visibly different on the readouts', async () => {
  const { shuttleAt } = await core;
  const a = shuttleAt(17), b = shuttleAt(25), c = shuttleAt(31), d = shuttleAt(35), e = shuttleAt(40);
  assert.ok(a.distance - b.distance > 15, '接近 must close at least 15 m');
  assert.ok(b.lateral > 2 && c.lateral < 0.01, '对齐 must remove a visible lateral offset (> 2 m) to zero');
  assert.ok(Math.abs(b.rollError) > 10 * Math.PI / 180 && Math.abs(c.rollError) < 0.01, '对齐 must remove a visible roll error (> 10°)');
  assert.ok(c.distance > 2 && d.distance < 0.2, '接触 must close the last metres to the port face');
  assert.equal(d.latched, 0); assert.equal(e.latched, 12);
});

test('A1 the shuttle never passes through the station', async () => {
  const { shuttleAt, CYCLE, RING, HUB, PORT, ringAngle } = await core;
  sample(0, CYCLE, (t) => {
    const s = shuttleAt(t), p = s.position, r = Math.hypot(p[0], p[2]);
    // Nose stays above the port face (allowing the 0.12 m attenuator stroke) whenever it is over the hub.
    if (r < HUB.radius + 3) assert.ok(p[1] > PORT.y - 0.15, `shuttle inside the hub at ${t.toFixed(2)} s`);
    // Body (about 9 m long, nose to tail along the nose axis) keeps clear of the ring torus.
    for (let k = 0; k <= 9; k += 1.5) {
      const q = p.map((v, i) => v - s.nose[i] * k), rr = Math.hypot(q[0], q[2]);
      const inTorus = rr > RING.inner - 3 && rr < RING.outer + 3 && Math.abs(q[1]) < RING.half + 3;
      assert.ok(!inTorus, `shuttle clips the ring at ${t.toFixed(2)} s`);
    }
  });
  assert.equal(typeof ringAngle(0), 'number');
});

test('A2 the ring turns at one steady rate and the station applies it', async () => {
  const { ringAngle, RING_PERIOD } = await core;
  const w = (t) => (ringAngle(t + 0.01) - ringAngle(t)) / 0.01;
  const w0 = w(0);
  sample(0, 100, (t) => assert.ok(Math.abs(w(t) - w0) < 1e-9, 'ring angular velocity must be constant'), 0.37);
  assert.ok(Math.abs(w0 - 2 * Math.PI / RING_PERIOD) < 1e-9);
  assert.ok(RING_PERIOD >= 20 && RING_PERIOD <= 60, 'ring period outside the readable 20–60 s band');
});

test('A6 the sun rises behind the station once per cycle, monotonically, and the sunrise shot catches it', async () => {
  const { sunPhase, sunVisibility, sunDir, shotPoseAt, SUNRISE_AT, CYCLE } = await core;
  let prev = sunPhase(42);
  sample(42.01, 42 + CYCLE, (t) => { const p = sunPhase(t); assert.ok(p >= prev - 1e-9, `sun runs backwards at ${t.toFixed(2)} s`); prev = p; });
  const station = (t) => sunVisibility([0, 0, 0], sunDir(t));
  assert.ok(station(41.5) < 0.01 && station(42.6) > 0.99, 'station sunrise must happen at about 42 s');
  let dark = 0; sample(0, CYCLE, (t) => { if (station(t) < 0.5) dark += STEP; });
  assert.ok(dark > 1.5 && dark < 5, `eclipse lasts ${dark.toFixed(2)} s; spec 1.5–5 s`);
  const cam = (t) => sunVisibility(shotPoseAt('sunrise', t, 1.6).position, sunDir(t));
  assert.ok(cam(SUNRISE_AT - 0.2) < 0.05 && cam(SUNRISE_AT + 0.2) > 0.95, 'camera sunrise must land at SUNRISE_AT inside the sunrise shot');
  assert.ok(SUNRISE_AT > 40 && SUNRISE_AT < 45);
});

test('A3 one-click tour lasts 50 s with ten shots of at least 4 s, each overlapping what it shows', async () => {
  const { SHOTS, CYCLE, PHASES } = await core;
  assert.equal(CYCLE, 50); assert.equal(SHOTS.length, 10);
  for (const k of ['establish', 'truss', 'port', 'garden', 'sunrise']) assert.ok(SHOTS.some(s => s.key === k), `required shot ${k} missing`);
  for (const s of SHOTS) {
    assert.ok(s.end - s.start >= 4, `${s.key} shorter than 4 s`);
    assert.ok(s.at >= s.start && s.at < s.end, `${s.key} fixed-view time outside its window`);
  }
  const span = (k) => PHASES.find(p => p.key === k);
  const overlaps = (shot, phase) => { const s = SHOTS.find(x => x.key === shot), p = span(phase); return s.start < p.end && p.start < s.end; };
  for (const [shot, phase] of [['approach', 'approach'], ['align', 'align'], ['port', 'contact'], ['settle', 'settle']]) assert.ok(overlaps(shot, phase), `${shot} shot misses the ${phase} step`);
  const at = (k) => SHOTS.find(s => s.key === k).at;
  assert.ok(at('port') > 34.2 && at('port') < 35, 'docking-port still must show first contact');
});

// Screen-space framing: key parts of each shot projected through the shot's own camera.
// Desktop 1440×900 keeps clear of the corners; phone portrait 390×664 keeps clear of the title,
// the telemetry strip (top 23 %) and the caption and buttons (bottom 32 %).
const SAFE = { desktop: { aspect: 1440 / 900, x: [0.04, 0.96], y: [0.06, 0.86] }, portrait: { aspect: 390 / 664, x: [0.03, 0.97], y: [0.23, 0.70] } };
async function subjects(key, t) {
  const c = await core, s = c.shuttleAt(t).position, r = c.RING.outer;
  return {
    establish: { 'ring +x': [r, 0, 0], 'ring -x': [-r, 0, 0], 'ring +z': [0, 0, r], 'ring -z': [0, 0, -r], port: [0, c.PORT.y, 0], 'truss end': [0, c.TRUSS.bottom, 0] },
    truss: { 'truss ahead': [0, c.shotPoseAt('truss', t, 1).position[1] - 14, 0] },
    ring: { 'ring module': c.shotPoseAt('ring', t, 1.6).target },
    approach: { shuttle: s, port: [0, c.PORT.y, 0] },
    align: { shuttle: s, port: [0, c.PORT.y, 0] },
    port: { 'shuttle ring': s, 'port collar +x': [c.PORT.radius, c.PORT.y, 0], 'port collar -x': [-c.PORT.radius, c.PORT.y, 0] },
    settle: { shuttle: s, 'hooks +x': [c.PORT.radius, c.PORT.y, 0], 'hooks -x': [-c.PORT.radius, c.PORT.y, 0] },
    sunrise: { hub: [0, 0, 0], 'ring +x': [r, 0, 0], 'ring -x': [-r, 0, 0] },
    axis: { 'ring +x': [r, 0, 0], 'ring -x': [-r, 0, 0], 'ring +z': [0, 0, r], 'ring -z': [0, 0, -r] },
    garden: {},
  }[key];
}
for (const [vp, safe] of Object.entries(SAFE)) {
  test(`A4 every shot frames its subject inside the ${vp} safe area`, async () => {
    const { SHOTS, shotPoseAt, project } = await core;
    for (const shot of SHOTS) {
      for (const t of [shot.start + 0.2, shot.at, shot.end - 0.2]) {
        const pose = shotPoseAt(shot.key, t, safe.aspect);
        for (const [name, p] of Object.entries(await subjects(shot.key, t))) {
          const q = project(pose, safe.aspect, p);
          assert.ok(q.z > 0, `${shot.key} @${t.toFixed(1)} s: ${name} behind the ${vp} camera`);
          assert.ok(q.x >= safe.x[0] && q.x <= safe.x[1] && q.y >= safe.y[0] && q.y <= safe.y[1],
            `${shot.key} @${t.toFixed(1)} s: ${name} at (${q.x.toFixed(2)}, ${q.y.toFixed(2)}) leaves the ${vp} safe area`);
        }
      }
    }
  });
}

test('A4 the establishing and sunrise shots include Earth; the sunrise sun sits near the station silhouette', async () => {
  const { shotPoseAt, project, earthHit, sunDir, norm, sub, cross, add, scale } = await core;
  for (const aspect of [1.6, 390 / 664]) {
    for (const key of ['establish', 'sunrise', 'axis']) {
      const pose = shotPoseAt(key, key === 'sunrise' ? 43.2 : 2.5, aspect);
      // Ray through the lower-middle of the frame must hit Earth.
      const f = norm(sub(pose.target, pose.position)), r = norm(cross(f, pose.up)), u = cross(r, f), th = Math.tan(pose.fov * Math.PI / 360);
      const dir = norm(add(f, add(scale(r, 0), scale(u, -0.8 * th))));
      assert.ok(earthHit(pose.position, dir) < Infinity, `${key} @ aspect ${aspect.toFixed(2)}: no Earth in the lower frame`);
    }
    const pose = shotPoseAt('sunrise', 43.2, aspect), sun = project(pose, aspect, scale(sunDir(43.2), 1e5)), hub = project(pose, aspect, [0, 0, 0]);
    assert.ok(sun.z > 0 && Math.hypot(sun.x - hub.x, (sun.y - hub.y) / aspect) < 0.4, 'sunrise: sun must rise close behind the station');
  }
});

test('A4 the garden camera stands on the deck inside the hull with trees ahead', async () => {
  const { shotPoseAt, RING, ringPoint, project, SHOTS } = await core;
  const g = SHOTS.find(s => s.key === 'garden');
  for (const aspect of [1.6, 390 / 664]) {
    for (let t = g.start; t <= g.end; t += 0.5) {
      const pose = shotPoseAt('garden', t, aspect), p = pose.position, r = Math.hypot(p[0], p[2]);
      assert.ok(r > RING.inner + 1 && r < RING.floor - 1 && Math.abs(p[1]) < RING.half - 1, `garden camera outside the deck at ${t}`);
      const ahead = project(pose, aspect, pose.target);
      assert.ok(ahead.z > 0 && Math.abs(ahead.x - 0.5) < 0.01);
    }
  }
  assert.equal(typeof ringPoint(0, 1, 0, 0)[0], 'number');
});

test('A5 the tour camera never jumps except under a full fade, including the 50 s → 0 s wrap', async () => {
  const { tourPose, CYCLE, CUT_INTO } = await core;
  for (const aspect of [1.6, 390 / 664]) {
    // Per-frame motion relative to how far the camera stands from what it looks at, so a glide over
    // hundreds of metres in the wide shots and a 1 m slide at the port are judged on one screen scale.
    const frames = [];
    for (let t = -1 / 30; t <= CYCLE + 1; t += 1 / 30) frames.push({ t, ...tourPose(t, aspect) });
    const rel = frames.map((p, i) => {
      if (!i) return 0;
      const q = frames[i - 1], dist = Math.min(...[p, q].map(f => Math.hypot(...f.position.map((v, k) => v - f.target[k]))));
      return Math.max(Math.hypot(...p.position.map((v, k) => v - q.position[k])), Math.hypot(...p.target.map((v, k) => v - q.target[k]))) / dist;
    });
    let cuts = 0;
    for (let i = 2; i < frames.length - 1; i++) {
      // A jump is either a large step (> 15 % of the viewing distance in 1/30 s) or a step that
      // stands out against both neighbours (> 4x), which a smooth glide never does.
      const spike = rel[i] > 0.02 && rel[i] > 4 * Math.max(rel[i - 1], rel[i + 1]);
      if (rel[i] > 0.15 || spike) {
        const p = frames[i], q = frames[i - 1];
        assert.ok(Math.max(p.fade, q.fade) > 0.85, `tour camera jumps ${(rel[i] * 100).toFixed(1)} % of its viewing distance at ${p.t.toFixed(2)} s without a fade (aspect ${aspect.toFixed(2)})`);
        cuts++;
      }
    }
    assert.ok(cuts <= CUT_INTO.size, `more hard cuts (${cuts}) than shots flagged as cuts (${CUT_INTO.size})`);
    assert.ok(CUT_INTO.size <= 6, 'at least four shots must glide in, not cut');
  }
});

test('A5 a button press glides or fades the camera and never moves a part or the clock', async () => {
  const { ViewController, shotPoseAt, BLEND, FADE } = await core;
  const view = new ViewController(), t = 7, aspect = 1.6;
  view.tour(t);
  let cur = view.pose(t, aspect, 0);
  view.select('truss', cur, 0);
  let prev = cur, worst = 0;
  for (let wall = 0; wall <= BLEND + 0.2; wall += 1 / 60) {
    const p = view.pose(t, aspect, wall); worst = Math.max(worst, Math.hypot(...p.position.map((v, i) => v - prev.position[i]))); prev = p;
  }
  assert.ok(worst < 3, `blend step ${worst.toFixed(2)} m per frame`);
  const end = shotPoseAt('truss', t, aspect);
  assert.ok(Math.hypot(...prev.position.map((v, i) => v - end.position[i])) < 1e-6, 'blend must land on the shot');
  assert.ok(!view.moving);
  // Into the garden is a cut through black: the camera only changes while fully dark.
  view.select('garden', prev, 10);
  let before = view.pose(t, aspect, 10), sawBlack = false;
  for (let wall = 10; wall <= 10 + 2 * FADE + 0.1; wall += 1 / 120) {
    const p = view.pose(t, aspect, wall), move = Math.hypot(...p.position.map((v, i) => v - before.position[i]));
    if (move > 1) assert.ok(p.fade > 0.95, 'cut must happen under black');
    if (p.fade > 0.95) sawBlack = true; before = p;
  }
  assert.ok(sawBlack);
  // A held shot ping-pongs instead of snapping back to its start.
  view.select('truss', view.pose(t, aspect, 20), 20);
  for (let w = 20; w < 20 + 2 * FADE + 0.1; w += 0.05) view.pose(t, aspect, w);
  let held = view.pose(5, aspect, 30), jump = 0;
  for (let tt = 5; tt < 25; tt += 1 / 30) { const p = view.pose(tt, aspect, 30); jump = Math.max(jump, Math.hypot(...p.position.map((v, i) => v - held.position[i]))); held = p; }
  assert.ok(jump < 1, `held shot snaps ${jump.toFixed(2)} m`);
});
