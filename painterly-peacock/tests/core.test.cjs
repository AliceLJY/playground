// Behaviour rules from SPEC.md, checked on the very functions the page runs (core.js has no Three.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const core = import('../src/core.js');

const ASPECTS = [['desktop', 1440 / 900], ['phone', 390 / 664]];
const runUntil = (sim, cond, max = 30, dt = 1 / 60, each) => { let t = 0; while (!cond() && t < max) { sim.step(dt); t += dt; if (each) each(); } return t < max; };
const eyeOf = (C, f) => f.quill.map((v, k) => v + f.dir[k] * C.FEATHERS[f.id].length * C.FEATHERS[f.id].eye);
function checkBody(C, sim, label) {
  const it = C.integrity(sim.state.pose);
  assert.ok(it.bone < 1e-6, `${label}: a bone changed length by ${it.bone}`);
  assert.ok(it.joint < 1e-6, `${label}: a joint came apart by ${it.joint}`);
  assert.ok(it.ground < 1e-6, `${label}: something went ${it.ground} m under the ground`);
}
function checkFeathers(C, sim, label) {
  const fs = sim.state.feathers;
  assert.equal(fs.length, C.K, `${label}: feather count changed`);
  assert.deepEqual(fs.map(f => f.id), [...Array(C.K).keys()], `${label}: feather ids changed`);
  for (const f of fs) assert.ok(['attached', 'falling', 'grounded', 'carried'].includes(f.state), `${label}: feather ${f.id} in state ${f.state}`);
  const carried = fs.filter(f => f.state === 'carried').length;
  assert.ok(carried <= 1, `${label}: ${carried} feathers in the beak`);
}

test('P1 full pickup chain: the plucked feather falls, is fetched, gripped, carried and goes back into its own socket', async () => {
  const C = await core;
  for (const [vp, aspect] of ASPECTS) for (const seed of [1, 7, 23]) for (const id of [0, 5, 12, 16, 25]) for (const open of [true, false]) {
    const label = `${vp} seed ${seed} feather ${id} fan ${open ? 'open' : 'folded'}`;
    const sim = C.createSim({ seed, aspect });
    sim.setHoverOverride(open); sim.step(open ? 3.4 : 1);
    assert.equal(sim.pluck(id), true, label);
    const seen = new Set(), events = [];
    const ok = runUntil(sim, () => !sim.state.pickup, 30, 1 / 60, () => {
      if (sim.state.pickup) seen.add(sim.state.pickup.phase);
      events.push(...sim.drainEvents());
      checkFeathers(C, sim, label);
    });
    assert.ok(ok, `${label}: pickup never finished`);
    for (const ph of ['wait', 'walk', 'reach', 'grip', 'lift', 'turn', 'insert', 'settle']) assert.ok(seen.has(ph), `${label}: skipped ${ph}`);
    const grip = events.find(e => e.type === 'grip'), ret = events.find(e => e.type === 'return');
    assert.ok(events.some(e => e.type === 'landed' && e.id === id), `${label}: never landed`);
    assert.ok(grip && grip.error <= C.TOL.grip, `${label}: beak missed the quill by ${grip && grip.error}`);
    assert.ok(ret && ret.error <= C.TOL.insert, `${label}: put back ${ret && ret.error} m from its socket`);
    assert.ok(ret.angle <= C.TOL.insertAngle, `${label}: put back ${ret.angle} rad off its socket direction`);
    sim.step(0.5);
    const f = sim.state.feathers[id], F = C.FEATHERS[id], bf = sim.state.pose.bodyFrame;
    assert.equal(f.state, 'attached', label);
    assert.ok(C.dist(f.quill, C.toWorld(bf, F.anchor)) < 1e-9, `${label}: not sitting on its own anchor`);
    const sl = C.slotLocal(F, sim.state.fan, sim.state.psi, sim.state.shiver);
    assert.ok(C.angleBetween(f.dir, C.dirWorld(bf, sl.d)) < 1e-6, `${label}: not following its own socket`);
    assert.equal(sim.state.feathers.filter(x => x.state === 'attached').length, C.K, `${label}: not all feathers home`);
  }
});

test('P2 the feather total never changes: repeated clicks on the same feather never copy it, clicks on gone feathers do nothing', async () => {
  const C = await core;
  const sim = C.createSim({ seed: 3, aspect: 1.6 });
  sim.setHoverOverride(true); sim.step(3.4);
  assert.equal(sim.pluck(9), true);
  for (let i = 0; i < 20; i++) { assert.equal(sim.pluck(9), false, 'second click on the same feather'); sim.step(0.05); checkFeathers(C, sim, 'repeat'); }
  assert.equal(sim.pluck(-1), false); assert.equal(sim.pluck(C.K), false); assert.equal(sim.pluck(2.5), false);
  runUntil(sim, () => !sim.state.pickup, 30, 1 / 60, () => { if (sim.state.pickup) assert.equal(sim.pluck(9), false); checkFeathers(C, sim, 'hammering'); });
  assert.equal(sim.snapshot().counts.attached, C.K);
  assert.equal(sim.snapshot().counts.total, C.K);
});

test('P3 between grip and insert the beak tip and the quill never separate', async () => {
  const C = await core;
  for (const [vp, aspect] of ASPECTS) for (const seed of [2, 7, 11]) for (const id of [1, 8, 13, 20, 24]) {
    const label = `${vp} seed ${seed} feather ${id}`;
    const sim = C.createSim({ seed, aspect });
    sim.setHoverOverride(seed % 2 === 0); sim.step(2);
    sim.pluck(id);
    let carriedSteps = 0, worst = 0;
    runUntil(sim, () => !sim.state.pickup, 30, 1 / 120, () => {
      const f = sim.state.feathers[id];
      if (f.state === 'carried') { carriedSteps++; worst = Math.max(worst, C.dist(sim.state.pose.beak, f.quill)); }
    });
    assert.ok(carriedSteps > 120 * (C.PICK.grip + C.PICK.lift + C.PICK.turn) * 0.9, `${label}: carried for only ${carriedSteps} steps`);
    assert.ok(worst <= C.TOL.carry, `${label}: beak and quill ${worst.toFixed(4)} m apart while carried`);
  }
});

test('P4 clicks on other feathers during a pickup are queued (at most a few) or ignored, and every one goes home', async () => {
  const C = await core;
  for (const seed of [4, 7, 19]) {
    const sim = C.createSim({ seed, aspect: 1.6 });
    sim.setHoverOverride(true); sim.step(3.4);
    sim.pluck(10);
    const clicked = new Set([10]), phases = new Set();
    let n = 0;
    runUntil(sim, () => !sim.state.pickup && sim.state.queue.length === 0, 90, 1 / 60, () => {
      const P = sim.state.pickup;
      if (P && !phases.has(P.phase + P.id)) {
        phases.add(P.phase + P.id);
        for (const id of [3, 3, 17, 22, 0, 25, 10]) { const r = sim.pluck(id); if (r) clicked.add(id); n++; }
      }
      assert.ok(sim.state.queue.length <= C.QUEUE_MAX, 'queue grew past its limit');
      checkFeathers(C, sim, `seed ${seed}`); checkBody(C, sim, `seed ${seed}`);
    });
    assert.ok(n > 10, 'test did click during the pickup');
    assert.ok(clicked.size > 1 && clicked.size <= 1 + C.QUEUE_MAX + 4, `clicked ${clicked.size}`);
    sim.step(1);
    assert.equal(sim.snapshot().counts.attached, C.K, `seed ${seed}: a feather was left behind`);
  }
});

test('P5 jump at half fan, peck while walking, wheel walks: the body never comes apart and each channel has one owner', async () => {
  const C = await core;
  for (const [vp, aspect] of ASPECTS) {
    const sim = C.createSim({ seed: 5, aspect });
    const R = sim.state.region;
    sim.setHover(true);
    assert.ok(runUntil(sim, () => sim.state.fan >= 0.5, 5), 'fan reaches half');
    sim.setHover(false);
    assert.equal(sim.jump(), true);
    const phases = new Set(); let landed = false;
    runUntil(sim, () => !sim.state.jump, 4, 1 / 120, () => {
      if (sim.state.jump) phases.add(sim.state.jump.phase);
      if (sim.drainEvents().some(e => e.type === 'land')) landed = true;
      checkBody(C, sim, `${vp} jump`);
      assert.equal(sim.owners().vertical, sim.state.jump ? 'jump' : 'ground');
    });
    for (const ph of ['crouch', 'air', 'land']) assert.ok(phases.has(ph), `${vp}: jump skipped ${ph}`);
    assert.ok(landed, `${vp}: no landing`);
    // Peck while walking from one side to the other.
    sim.walkTo(R.x0, R.z0); sim.step(0.4);
    assert.equal(sim.peck(false), true);
    let pecked = false;
    runUntil(sim, () => pecked && !sim.state.peck, 4, 1 / 120, () => {
      if (sim.drainEvents().some(e => e.type === 'peck')) pecked = true;
      checkBody(C, sim, `${vp} peck while walking`);
      if (sim.state.peck) assert.equal(sim.owners().neck, 'peck');
    });
    assert.ok(pecked, `${vp}: peck never landed`);
    // Wheel down then up: toward the camera with a hard peck, then back.
    const z0 = sim.state.root[2];
    sim.approach(1); runUntil(sim, () => sim.action() === 'peck:strong', 4, 1 / 60, () => checkBody(C, sim, `${vp} approach`));
    assert.ok(sim.state.root[2] > z0, `${vp}: did not come closer`);
    runUntil(sim, () => !sim.state.peck, 3);
    const z1 = sim.state.root[2];
    sim.approach(-1); assert.equal(sim.owners().root, 'retreat');
    sim.step(1.5);
    assert.ok(sim.state.root[2] < z1, `${vp}: did not back off`);
    assert.ok(Math.abs(C.wrap(sim.state.heading)) < 0.35, `${vp}: turned its back while backing off`);
    // Jump and peck are refused during a pickup (pickup owns the body).
    sim.pluck(4); sim.step(0.1);
    assert.equal(sim.jump(), false); assert.equal(sim.peck(), false); assert.equal(sim.walkTo(0, 0), false); assert.equal(sim.approach(1), false);
  }
});

test('P6 the whole bird, and any fallen feather, stay inside the screen safe zone under random play', async () => {
  const C = await core;
  for (const [vp, aspect] of ASPECTS) {
    const cam = C.cameraFor(aspect), safe = C.safeFor(aspect);
    for (let seed = 1; seed <= 8; seed++) {
      const sim = C.createSim({ seed, aspect }), r = C.mulberry(seed * 31), R = sim.state.region;
      for (let t = 0; t < 30; t += 0.05) {
        if (r() < 0.03) sim.walkTo(R.x0 - 1 + r() * (R.x1 - R.x0 + 2), R.z0 - 1 + r() * (R.z1 - R.z0 + 2));
        if (r() < 0.008) sim.approach(r() < 0.5 ? 1 : -1);
        if (r() < 0.006) sim.jump();
        if (r() < 0.006) sim.peck(r() < 0.5);
        if (r() < 0.01) sim.setHover(r() < 0.5);
        if (r() < 0.006) sim.pluck(Math.floor(r() * C.K));
        sim.step(0.05);
        for (const p of C.posePoints(sim.state.pose)) {
          const q = C.project(cam, aspect, p);
          assert.ok(q.depth > 0 && q.x >= safe.x[0] && q.x <= safe.x[1] && q.y >= safe.y[0] && q.y <= safe.y[1],
            `${vp} seed ${seed} t ${t.toFixed(2)}: point at ${q.x.toFixed(3)},${q.y.toFixed(3)} outside ${JSON.stringify(safe)}`);
        }
        checkFeathers(C, sim, `${vp} seed ${seed}`);
      }
    }
  }
});

test('P7 walking: body, head and folded train point the same way, and the bird faces where it goes', async () => {
  const C = await core;
  const sim = C.createSim({ seed: 8, aspect: 1.6 }), R = sim.state.region;
  const goals = [[R.x1, R.z1], [R.x0, R.z0], [R.x1, R.z0], [R.x0, R.z1], [0, 0]];
  let checked = 0;
  for (const g of goals) {
    sim.walkTo(g[0], g[1]);
    runUntil(sim, () => false, 3.5, 1 / 60, () => {
      const S = sim.state; if (S.speed < 0.25) return;
      const fwd = C.forward(S.heading), vel = C.norm([S.vel[0], 0, S.vel[1]]);
      assert.ok(C.dot(fwd, vel) > 0.94, `walking sideways: heading·velocity ${C.dot(fwd, vel).toFixed(3)}`);
      const head = S.pose.neck[S.pose.neck.length - 1];
      assert.ok(C.dot(C.sub(head, S.root), fwd) > 0.1, 'head is not in front of the body');
      for (const f of S.feathers) if (f.state === 'attached') {
        const tip = C.add(f.quill, C.scale(f.dir, C.FEATHERS[f.id].length));
        assert.ok(C.dot(C.sub(tip, S.root), fwd) < -0.5, `feather ${f.id} tip is not behind the bird`);
      }
      checked++;
    });
  }
  assert.ok(checked > 100, `only ${checked} walking steps checked`);
});

test('P8 hover opens the train gradually by moving the feathers (not a swap), leaving closes it, and the eyes do not clump', async () => {
  const C = await core;
  const sim = C.createSim({ seed: 7, aspect: 1.6 });
  sim.setHover(true);
  let prev = sim.state.feathers.map(f => f.dir.slice()), fanPrev = sim.state.fan, steps = 0;
  runUntil(sim, () => sim.state.fan >= 1, 5, 1 / 60, () => {
    const dFan = sim.state.fan - fanPrev; fanPrev = sim.state.fan;
    assert.ok(dFan >= -1e-9 && dFan <= C.FAN_RATE / 60 + 1e-9, `fan jumped by ${dFan}`);
    const now = sim.state.feathers.map(f => f.dir.slice());
    for (let i = 0; i < C.K; i++) assert.ok(C.angleBetween(prev[i], now[i]) < 0.08, `feather ${i} jumped`);
    prev = now; steps++;
  });
  assert.ok(steps > 60, `opened in ${steps} steps: too fast to see`);
  assert.equal(sim.owners().root, 'display'); assert.equal(sim.owners().neck, 'shake');
  assert.ok(Math.abs(C.wrap(sim.state.heading)) < 0.05, 'displaying with its back to the viewer');
  sim.step(0.3);
  const eyes = sim.state.feathers.map(f => eyeOf(C, f));
  let minD = Infinity; for (let i = 0; i < eyes.length; i++) for (let j = i + 1; j < eyes.length; j++) minD = Math.min(minD, C.dist(eyes[i], eyes[j]));
  assert.ok(minD >= C.EYE_SIZE, `eye spots overlap in the full fan (closest ${minD.toFixed(3)} m)`);
  sim.setHover(false);
  assert.ok(runUntil(sim, () => sim.state.fan <= 0, 5), 'never closed');
});

test('P9 the same seed and the same inputs give the same snapshot; the five URL scenes are reached by play', async () => {
  const C = await core;
  const run = () => { const s = C.createSim({ seed: 12, aspect: 1.6 }); s.setHover(true); s.step(2); s.pluck(7); s.step(1.3); s.jump(); s.step(4); return JSON.stringify(s.snapshot()); };
  assert.equal(run(), run());
  const want = { stand: ['idle', 0], display: ['display', 0], fallen: ['pickup:walk', 1], carrying: ['pickup:turn', 1], returned: ['display', 0] };
  for (const name of C.SCENES) {
    const sim = C.createSim({ seed: 7, aspect: 1.6 });
    assert.equal(C.playScene(sim, name), name);
    const snap = sim.snapshot();
    assert.equal(snap.action, want[name][0], name);
    assert.equal(snap.counts.total, C.K);
    assert.equal(C.K - snap.counts.attached, want[name][1], `${name}: feathers off the bird`);
    checkBody(C, sim, name);
  }
});

// 2026-11-24 real-GPU review: while fetching a feather the neck folded double (single joints 165-180°, the
// whole neck turning more than a full circle), which looked like it was about to snap. A bird's neck curves
// along its length; this pins that down for every pickup the P1 matrix plays.
test('P10 while fetching a feather the neck curves along its length and never kinks', async () => {
  const C = await core;
  const bend = (n) => { let m = 0; for (let j = 1; j < n.length - 1; j++) m = Math.max(m, C.angleBetween(C.sub(n[j], n[j - 1]), C.sub(n[j + 1], n[j]))); return m * 180 / Math.PI; };
  const CORE = new Set(['reach', 'grip', 'lift', 'turn', 'insert']);
  for (const [vp, aspect] of ASPECTS) for (const seed of [1, 7, 23]) for (const id of [0, 5, 12, 16, 25]) for (const open of [true, false]) {
    const label = `${vp} seed ${seed} feather ${id} fan ${open ? 'open' : 'folded'}`;
    const sim = C.createSim({ seed, aspect });
    sim.setHoverOverride(open); sim.step(open ? 3.4 : 1);
    sim.pluck(id);
    let worstCore = 0, worstAll = 0, at = '';
    runUntil(sim, () => !sim.state.pickup, 30, 1 / 120, () => {
      const b = bend(sim.state.pose.neck), ph = sim.state.pickup ? sim.state.pickup.phase : 'done';
      if (b > worstAll) { worstAll = b; at = ph; }
      if (CORE.has(ph)) worstCore = Math.max(worstCore, b);
    });
    assert.ok(worstCore <= 30, `${label}: a neck joint bent ${worstCore.toFixed(0)}° while reaching, holding or putting back`);
    assert.ok(worstAll <= 60, `${label}: a neck joint bent ${worstAll.toFixed(0)}° (${at})`);
  }
});
