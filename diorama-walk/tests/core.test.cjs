// Logic checks for 微缩街角·走进去. Run in this folder: node --test tests/*.test.cjs
// Each test names the SPEC.md item it guards. These drive the same simulation the page runs (src/core.js);
// pixels, the tilt-shift blur and touch input are checked in a browser by tools/browser-check.cjs, not here.
const test = require('node:test');
const assert = require('node:assert');
const load = () => import('../src/core.js');
const DT = 1 / 60;
const run = (sim, pred, maxT = 30, dt = DT) => { let t = 0; for (; t < maxT && !pred(); t += dt) sim.update(dt); return t; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const angDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

// Every frame of a transition: the camera point is outside every solid box grown by 0.1 m.
function transitionFrames(C, sim, dt = DT) {
  const frames = [];
  for (let t = 0; t < 5 && (sim.S.mode === 'entering' || sim.S.mode === 'exiting'); t += dt) {
    frames.push({ ...sim.S.cam, lift: sim.S.lift, s: sim.S.s });
    sim.update(dt);
  }
  return frames;
}
function badFrames(C, frames) {
  return frames.filter((f) => !C.cameraClear([f.x, f.y, f.z], 0.1, f.lift));
}

test('layout matches the spec sizes (SPEC 尺度与布局)', async () => {
  const C = await load();
  const s = C.STORE, n = C.NEXT;
  assert.deepStrictEqual([s.x1 - s.x0, s.z1 - s.z0, s.h], [12, 9, 3.6], 'store outer 12 x 9 x 3.6');
  assert.deepStrictEqual([n.x1 - n.x0, n.z1 - n.z0, n.h], [6, 8, 3.4], 'shop next door 6 x 8 x 3.4');
  assert.strictEqual(n.x1, s.x0, 'the shop next door touches the store on its -x side');
  assert.strictEqual(C.WALL_T, 0.2);
  assert.deepStrictEqual([C.STORE.door.w, C.NEXT.door.w], [1.8, 1.2], 'door openings');
  assert.ok(s.door.cx > (s.x0 + s.x1) / 2, 'store door right of centre');
  const all = C.solids(), by = (p) => all.filter((b) => b.id.startsWith(p));
  const dims = (b) => [+(b.x1 - b.x0).toFixed(3), +(b.y1 - b.y0).toFixed(3), +(b.z1 - b.z0).toFixed(3)];
  const shelves = by('shelf@').sort((a, b) => a.x0 - b.x0);
  assert.strictEqual(shelves.length, 3);
  for (const b of shelves) assert.deepStrictEqual(dims(b).slice().sort((p, q) => p - q), [0.6, 1.5, 5]);
  for (let i = 1; i < 3; i++) assert.ok(shelves[i].x0 - shelves[i - 1].x1 >= 1.2, 'aisle between shelf rows >= 1.2 m');
  assert.deepStrictEqual(dims(by('freezer')[0]), [7, 2, 0.7]);
  assert.deepStrictEqual(dims(by('counter')[0]).slice().sort((p, q) => p - q), [0.6, 1, 2.4]);
  assert.deepStrictEqual(dims(by('vending')[0]), [0.9, 1.83, 0.7]);
  assert.ok(near(by('lamp')[0].y1 - C.SIDEWALK_H, 4.5, 1e-9), 'lamp 4.5 m');
  assert.strictEqual(by('bar').length, 1); assert.strictEqual(by('stool@').length, 4); assert.strictEqual(by('bench').length, 1);
  assert.strictEqual(C.ROAD.z0 - C.FACADE_Z, 3, 'pavement 3 m deep'); assert.strictEqual(C.ROAD.z1 - C.ROAD.z0, 7, 'street 7 m');
  assert.strictEqual(C.SIDEWALK_H, 0.12); assert.strictEqual(C.WALK_BOX, 11.5, 'walkable square = base inset 1.5 m');
});

test('one progress s drives everything (SPEC 构图与过渡)', async () => {
  const C = await load();
  const L0 = C.looks(0), L1 = C.looks(1);
  assert.deepStrictEqual([L0.fov, L1.fov], [35, 65]);
  assert.deepStrictEqual([L0.tilt, L1.tilt], [1, 0]);
  assert.strictEqual(L0.fog, 0); assert.ok(near(L1.fog, 0.035, 1e-12));
  for (let s = 0; s <= 0.5; s += 0.01) assert.strictEqual(C.looks(s).groundAlpha, 0, `big ground hidden at s=${s.toFixed(2)}`);
  assert.ok(C.looks(0.6).groundAlpha > 0 && C.looks(1).groundAlpha === 1);
  assert.strictEqual(C.looks(0.8).baseSides, true); assert.strictEqual(C.looks(0.81).baseSides, false);
  assert.ok(near(L0.lowpass, 600, 1e-9) && near(L1.lowpass, 4000, 1e-6) && near(L0.volume, 0.15, 1e-12) && near(L1.volume, 0.5, 1e-12));
  // rain: faint, low and sparse outside; spec opacity, tall cylinder and every streak inside
  assert.deepStrictEqual([L0.rainOpacity, L0.rainHeight, L0.rainShown], [0.18, 6, 0.5]);
  assert.deepStrictEqual([L1.rainOpacity, L1.rainHeight, L1.rainShown], [0.35, 9.5, 1]);
  // inside field of view: 65 deg vertical in landscape; on tall screens at least 45 deg across, at most 85 deg vertical
  for (const [a, v] of [[16 / 9, 65], [1, 65], [0.9, 65]]) assert.strictEqual(C.looks(1, a).fov, v, `aspect ${a.toFixed(2)}`);
  const phone = C.looks(1, 390 / 844);
  assert.ok(phone.fov > 65 && phone.fov <= 85 && near(C.hfov(phone.fov, 390 / 844), 45, 1e-9), `390x844: ${phone.fov.toFixed(1)} deg vertical, ${C.hfov(phone.fov, 390 / 844).toFixed(1)} across`);
  assert.strictEqual(C.looks(1, 0.4).fov, 85, 'very tall screens stop at 85 deg vertical');
  assert.strictEqual(C.looks(0, 390 / 844).fov, 35, 'outside stays at 35 deg');
  // manual zoom: s = 0.3 z, radius from hero to 14 m, entry at z >= 0.85
  const sim = C.createSim({ aspect: 16 / 9 });
  assert.ok(near(C.rOf(1, sim.S.rHero), 14, 1e-9));
  let entered = false;
  for (let i = 0; i < 200 && !entered; i++) {
    entered = sim.zoomAt(0.97, 0.55, 0.6);
    if (!entered) { assert.ok(near(sim.S.s, 0.3 * sim.S.z, 1e-12)); assert.ok(sim.S.z < 0.85); }
  }
  assert.ok(entered, 'zooming in starts the entry');
  assert.ok(sim.S.trigger.z >= 0.85 && sim.S.trigger.z < 0.9, `entry triggered at z=${sim.S.trigger.z.toFixed(3)}`);
  run(sim, () => sim.S.mode === 'walk');
  assert.strictEqual(sim.S.s, 1);
});

test('three landings are right and the descent touches nothing (SPEC 1)', async () => {
  const C = await load();
  const results = {};
  for (const aim of ['door', 'street', 'roof', { x: -6, z: -3.5 }]) {
    const sim = C.createSim({ aspect: 16 / 9 });
    sim.enter(aim);
    const frames = transitionFrames(C, sim);
    const st = sim.snapshot(), key = typeof aim === 'string' ? aim : 'next-roof';
    results[key] = st;
    assert.strictEqual(st.mode, 'walk', key);
    assert.ok(near(st.eye, 1.6, 0.02), `${key}: eye ${st.eye}`);
    assert.ok(Math.abs(st.cam.pitch) < 0.05, `${key}: pitch ${st.cam.pitch}`);
    assert.strictEqual(st.tilt, 0); assert.ok(near(st.fog, 0.035, 0.001));
    assert.ok(frames.length >= 80, `${key}: ${frames.length} frames sampled`);
    const bad = badFrames(C, frames);
    assert.strictEqual(bad.length, 0, `${key}: camera inside a solid on ${bad.length} frames, first ${JSON.stringify(bad[0])}`);
  }
  // aiming at a roof: land 2.4-2.8 m outside that building's door, facing it, still on the pavement
  for (const [key, b] of [['roof', C.STORE], ['next-roof', C.NEXT]]) {
    const st = results[key], d = Math.hypot(st.cam.x - b.door.cx, st.cam.z - b.z1);
    assert.ok(d >= 2.4 && d <= 2.8, `${key}: ${d.toFixed(3)} m from the door`);
    assert.ok(st.cam.z < C.ROAD.z0 && C.groundAt(st.cam.x, st.cam.z) === C.SIDEWALK_H, `${key}: on the pavement (z=${st.cam.z})`);
    assert.ok(angDiff(st.cam.yaw, 0) < 0.2, `${key}: yaw ${st.cam.yaw}`);
  }
  const door = results.door;
  assert.ok(near(door.cam.x, C.STORE.door.cx, 1e-9) && near(door.cam.z, C.STORE.z1 + 2.6, 1e-9), 'aiming at the door lands 2.6 m in front of it');
  const street = results.street;
  assert.ok(street.cam.z > C.ROAD.z0 && street.cam.z < C.ROAD.z1, `street landing on the street (z=${street.cam.z.toFixed(2)})`);
});

test('the door is shut on landing and opens after about one step towards it (SPEC 落点, 门)', async () => {
  const C = await load();
  for (const aim of ['door', { x: -6, z: -3.5 }]) {
    const sim = C.createSim({ aspect: 16 / 9 });
    sim.enter(aim); run(sim, () => sim.S.mode === 'walk');
    const i = aim === 'door' ? 0 : 1, d = C.DOORS[i], p = sim.S.player;
    assert.ok(Math.hypot(p.x - d.cx, p.z - d.cz) > C.DOOR_NEAR, 'landing is beyond the opening distance');
    run(sim, () => false, 1.0);
    assert.strictEqual(sim.S.doors[i].k, 0, 'still shut after standing a second');
    sim.walkTo(p.x, p.z - 0.7);                      // one step towards the door
    run(sim, () => !sim.S.player.route, 3);
    run(sim, () => false, 0.6);
    assert.ok(sim.S.doors[i].k >= 0.75, `open after a step: k=${sim.S.doors[i].k.toFixed(2)}`);
  }
});

test('landing rules: footprint goes to the door, outside is clamped, solids are kept 0.4 m away (SPEC 落点)', async () => {
  const C = await load();
  const down = (x, z) => C.aimHit([x, 30, z + 0.001], [0, -1, 0]);
  const L1 = C.landingFor(down(2, -4), 0);
  assert.deepStrictEqual([L1.building, L1.x, L1.z, L1.yaw], ['store', 5, 3.1, 0], 'straight down on the store roof');
  const L2 = C.landingFor(down(-7, -1), 0.3);
  assert.deepStrictEqual([L2.building, L2.x, L2.z], ['next', -6, 3.1]);
  const L3 = C.landingFor({ kind: 'ground', x: 12.7, z: 12.6 }, 0.3);
  assert.ok(L3.x <= 11.5 && L3.z <= 11.5, `clamped into the walkable square: ${L3.x}, ${L3.z}`);
  const L4 = C.landingFor({ kind: 'ground', x: 11, z: -6 }, 0);                 // back lot beside the store
  assert.ok(L4.z >= C.FACADE_Z, `back lot pulled to the street side: z=${L4.z}`);
  for (const [x, z] of [[6.9, 0.9], [-1.5, 3.1], [1.0, 0.8], [10.5, 0.45], [5.0, 0.45]]) {
    const L = C.landingFor({ kind: 'ground', x, z }, 0);
    const clear = Math.min(...C.walkBoxes(null).map((b) => C.boxDist(L.x, L.z, b)));
    assert.ok(clear >= 0.4 - 1e-6, `(${x}, ${z}) -> (${L.x.toFixed(2)}, ${L.z.toFixed(2)}) is ${clear.toFixed(3)} m from the nearest solid`);
  }
});

test('descents from many orbit poses and aims never touch a solid (SPEC 1, 路径)', async () => {
  const C = await load();
  let n = 0, raised = 0;
  const aims = ['door', 'street', 'roof', { x: -6, z: -3 }, { x: -10, z: 9 }, { x: 10.8, z: 1.0 }, { x: -1.4, z: 3.6 }, { x: 6.9, z: 1.6 }, { x: 0, z: 11 }];
  for (const aspect of [16 / 9, 390 / 844]) for (let i = 0; i < 12; i++) for (const phi of [0.45, 0.96, 1.2]) for (const aim of aims) {
    const sim = C.createSim({ aspect });
    sim.rotate((i / 12) * Math.PI * 2 - C.HERO.theta, phi - C.HERO.phi);
    sim.enter(aim);
    const bad = badFrames(C, transitionFrames(C, sim));
    assert.strictEqual(bad.length, 0, `aspect ${aspect.toFixed(2)} theta ${(i / 12 * 360).toFixed(0)}deg phi ${phi} aim ${JSON.stringify(aim)}: ${bad.length} frames inside a solid`);
    assert.ok(near(sim.S.cam.y - C.groundAt(sim.S.cam.x, sim.S.cam.z), 1.6, 0.02));
    n++; raised += sim.S.raised;
  }
  console.log(`# ${n} descents clean; control point raised above max(start, 8 m) on ${raised}`);
});

test('leaving returns to the exact orbit of the moment of entry (SPEC 2)', async () => {
  const C = await load();
  for (const aim of ['door', 'street', 'roof']) {
    const sim = C.createSim({ aspect: 16 / 9 });
    sim.rotate(0.7, 0.1);
    for (let i = 0; i < 12; i++) sim.zoomAt(0.95, 0.45, 0.55);
    sim.enter(aim);
    const trig = sim.snapshot();                   // the moment the entry starts
    run(sim, () => sim.S.mode === 'walk');
    sim.walkTo(sim.S.player.x + 1.5, sim.S.player.z + 1.0); run(sim, () => !sim.S.player.route, 8);
    sim.lookBy(0.8, 0.3);
    sim.exit();
    run(sim, () => sim.S.mode === 'orbit');
    const st = sim.snapshot(), o = st.orbit, t = trig.trigger.orbit;
    assert.ok(Math.hypot(o.cx - t.cx, o.cy - t.cy, o.cz - t.cz) < 0.05 && Math.abs(o.r - t.r) < 0.05, `${aim}: centre/radius`);
    assert.ok(angDiff(o.theta, t.theta) < 0.01 && angDiff(o.phi, t.phi) < 0.01, `${aim}: angles`);
    for (const k of ['s', 'fog', 'baseSides', 'groundAlpha', 'tilt', 'fov']) assert.strictEqual(st[k], trig[k], `${aim}: ${k} back to ${trig[k]}, got ${st[k]}`);
    assert.ok(st.doors.every((d) => d.k === 0), `${aim}: doors closed`);
  }
});

test('five entries and exits leave nothing behind (SPEC 3)', async () => {
  const C = await load();
  const sim = C.createSim({ aspect: 16 / 9 });
  for (let i = 0; i < 10; i++) sim.zoomAt(0.95, 0.5, 0.55);
  const aims = ['door', 'street', 'roof', { x: -6, z: -3.5 }, 'door'];
  let before = null;
  for (let c = 0; c < 5; c++) {
    sim.enter(aims[c]);
    if (!before) before = sim.snapshot();          // first entry, before any step of it
    run(sim, () => sim.S.mode === 'walk');
    sim.walkTo(sim.S.player.x - 1.2, sim.S.player.z - 2.5); run(sim, () => !sim.S.player.route, 6);
    sim.exit(); run(sim, () => sim.S.mode === 'orbit');
  }
  const after = sim.snapshot();
  for (const k of ['cx', 'cy', 'cz', 'r']) assert.ok(Math.abs(after.orbit[k] - before.orbit[k]) < 0.05, k);
  for (const k of ['theta', 'phi']) assert.ok(angDiff(after.orbit[k], before.orbit[k]) < 0.01, k);
  for (const k of ['s', 'z', 'fog', 'tilt', 'fov', 'baseSides', 'groundAlpha', 'rainMix', 'lowpass', 'volume']) assert.strictEqual(after[k], before[k], k);
  for (const k of ['x', 'y', 'z']) assert.ok(Math.abs(after.cam[k] - before.cam[k]) < 0.05, 'cam ' + k);
  assert.ok(after.doors.every((d) => d.k === 0 && d.want === 0), 'all doors closed');
  assert.strictEqual(after.mode, 'orbit');
});

// Walk from the door landing into the store, to the till, out, along the pavement and into the shop next door.
const ROUTE = [[5.0, -0.6], [6.4, -2.6], [5.0, -0.6], [5.0, 1.8], [-6.0, 1.8], [-6.0, -0.6], [-6.0, -2.6]];
function walkRoute(C, dt) {
  const sim = C.createSim({ aspect: 16 / 9 });
  sim.enter('door'); run(sim, () => sim.S.mode === 'walk', 10, dt);
  sim.walkRoute(ROUTE);
  const samples = [], frameK = [], reached = new Set();
  let t = 0, overlap = 0;
  const every = Math.round(1 / 30 / dt);
  for (let i = 0; sim.S.player.route && t < 40; i++) {
    sim.update(dt); t += dt;
    const p = sim.S.player;
    if ((i + 1) % every === 0) samples.push({ t: +(t.toFixed(6)), k: sim.S.doors.map((d) => d.k) });
    ROUTE.forEach(([x, z], j) => { if (Math.hypot(p.x - x, p.z - z) < 0.05) reached.add(j); });
    for (const [di, b] of [[0, C.STORE], [1, C.NEXT]]) if (Math.abs(p.x - b.door.cx) < b.door.w / 2 && p.z < b.z1 + 0.35 && p.z > b.z1 - 0.05) frameK.push({ door: di, k: sim.S.doors[di].k, z: p.z });
    overlap = Math.max(overlap, ...C.walkBoxes(sim.S.doors).map((b) => C.R - C.boxDist(p.x, p.z, b)));
  }
  return { sim, samples, frameK, reached, overlap, t };
}
test('walk into the store, to the till, out and into the shop next door; doors do not depend on frame rate (SPEC 4)', async () => {
  const C = await load();
  const a = walkRoute(C, 1 / 30), b = walkRoute(C, 1 / 120);
  for (const r of [a, b]) {
    assert.strictEqual(r.reached.size, ROUTE.length, `reached ${[...r.reached]} of ${ROUTE.length} waypoints in ${r.t.toFixed(1)} s`);
    assert.ok(r.frameK.length > 0 && r.frameK.every((f) => f.k >= 0.75), `door openness at the frame: min ${Math.min(...r.frameK.map((f) => f.k))}`);
    assert.ok(r.overlap < 1e-3, `walker overlapped a solid by ${r.overlap}`);
    assert.ok(C.insideInterior(r.sim.S.player.x, r.sim.S.player.z) && C.buildingAt(r.sim.S.player.x, r.sim.S.player.z).id === 'next', 'ends inside the shop next door');
  }
  const byT = new Map(b.samples.map((s) => [s.t, s.k]));
  let worst = 0, n = 0;
  for (const s of a.samples) { const k2 = byT.get(s.t); if (!k2) continue; n++; s.k.forEach((k, i) => { worst = Math.max(worst, Math.abs(k - k2[i])); }); }
  assert.ok(n > 300, `${n} common sample times`);
  assert.ok(worst < 0.02, `door openness differs by up to ${worst} between 30 and 120 steps per second`);
  // both doors actually moved through the whole range on this route
  const ks = a.samples.flatMap((s) => s.k);
  assert.ok(Math.max(...ks) === 1 && a.samples.some((s) => s.k[0] === 0 && s.t > 3), 'store door opened fully and closed again');
});

test('running into walls and shelves never goes through (SPEC 5)', async () => {
  const C = await load();
  for (const [x, z] of [[0.0, -3.5], [4.5, -5.0], [6.4, -2.6]]) for (let d = 0; d < 8; d++) {
    const sim = C.createSim({ aspect: 16 / 9 });
    sim.enter('door'); run(sim, () => sim.S.mode === 'walk');
    sim.place(x, z);
    const a = (d / 8) * Math.PI * 2;
    sim.drive(Math.cos(a) * C.RUN_SPEED, Math.sin(a) * C.RUN_SPEED);
    let worst = 0, out = 0;
    for (let t = 0; t < 10; t += DT) {
      sim.update(DT);
      const p = sim.S.player;
      worst = Math.max(worst, ...C.walkBoxes(sim.S.doors, sim.levels().back).map((b) => C.R - C.boxDist(p.x, p.z, b)));
      out = Math.max(out, Math.abs(p.x) - C.WALK_BOX, Math.abs(p.z) - C.WALK_BOX);
    }
    assert.ok(worst < 1e-3, `from (${x}, ${z}) heading ${d * 45}deg: overlapped a solid by ${worst.toFixed(4)} m`);
    assert.ok(out <= 0, `from (${x}, ${z}) heading ${d * 45}deg: left the walkable square by ${out}`);
  }
});

test('one long session of running about (the scare events fire on the way): never inside a solid, the staff door included (SPEC 5, 惊吓版)', async () => {
  const C = await load();
  const sim = C.createSim({ aspect: 16 / 9 });
  sim.enter('door'); run(sim, () => sim.S.mode === 'walk');
  let worst = 0, where = '';
  for (const [x, z] of [[0.0, -3.5], [4.5, -5.0], [6.4, -2.6], [6.45, -7.35], [5.4, -7.6]]) for (let d = 0; d < 8; d++) {
    sim.place(x, z);
    const a = (d / 8) * Math.PI * 2;
    sim.drive(Math.cos(a) * C.RUN_SPEED, Math.sin(a) * C.RUN_SPEED);
    for (let t = 0; t < 10; t += DT) {
      sim.update(DT);
      const p = sim.S.player, o = Math.max(...C.walkBoxes(sim.S.doors, sim.levels().back).map((b) => C.R - C.boxDist(p.x, p.z, b)));
      if (o > worst) { worst = o; where = `from (${x}, ${z}) heading ${d * 45}deg at (${p.x.toFixed(2)}, ${p.z.toFixed(2)}), staff door ${(sim.levels().back * 180 / Math.PI).toFixed(0)}deg`; }
    }
    sim.drive(0, 0);
  }
  const f = sim.horror().fired;
  assert.ok(f.E2 != null && f.E3 != null && f.E4 != null, `the scare events happened on the way: ${JSON.stringify(f)}`);
  assert.ok(worst < 1e-3, `overlapped a solid by ${worst.toFixed(4)} m ${where}`);
});

test('the staff door does not swing wide while the walker stands in its sweep (惊吓版 E4)', async () => {
  const C = await load();
  const sim = C.createSim({ aspect: 16 / 9 });
  sim.enter('door'); run(sim, () => sim.S.mode === 'walk');
  sim.walkRoute(C.SCARE_PLAN.aisle); run(sim, () => !sim.S.player.route);
  run(sim, () => sim.horror().e3 && sim.S.t >= sim.horror().e3.closedAt, 8);
  sim.walkTo(6.42, -7.3); run(sim, () => !sim.S.player.route);           // beside the staff door, in its sweep, facing away from it
  sim.lookAt(6.42, 1.6, 0.0); run(sim, () => !sim.S.player.look, 4); run(sim, () => false, 2);
  const p = sim.S.player;
  assert.ok(Math.hypot(p.x - C.BACKDOOR.hx, p.z - C.BACKDOOR.hz) < C.HORROR.e4.hingeClear, 'standing in the sweep');
  assert.strictEqual(sim.horror().wideAt, null, 'door stays half open while you stand in its way');
  sim.walkTo(5.0, -5.0); run(sim, () => !sim.S.player.route); run(sim, () => false, 1);
  assert.ok(sim.horror().wideAt != null, 'and swings wide once you are clear and not looking');
  assert.ok(Math.max(...C.walkBoxes(sim.S.doors, sim.levels().back).map((b) => C.R - C.boxDist(sim.S.player.x, sim.S.player.z, b))) < 1e-3);
});

test('a tap into a wall slides along it, and gives up one second after it is stuck (SPEC 里面怎么走)', async () => {
  const C = await load();
  const sim = C.createSim({ aspect: 16 / 9 });
  sim.enter('door'); run(sim, () => sim.S.mode === 'walk');
  // head-on into the freezers: walks the aisle, then stands still against them; the walk must end 1 s after the last movement
  sim.place(0.0, -3.5);
  sim.walkTo(0.0, -12);
  let t = 0, lastMove = 0, prev = { x: sim.S.player.x, z: sim.S.player.z };
  for (; t < 20 && sim.S.player.route; t += DT) {
    sim.update(DT);
    const p = sim.S.player;
    if (Math.hypot(p.x - prev.x, p.z - prev.z) > 1e-4) lastMove = t + DT;
    prev = { x: p.x, z: p.z };
  }
  assert.ok(!sim.S.player.route, 'the walk ended');
  assert.ok(Math.abs(t - lastMove - 1) < 0.05, `stopped ${(t - lastMove).toFixed(3)} s after the last movement`);
  assert.ok(near(sim.S.player.z, -7.6 + C.R, 1e-3), `stands against the freezer front (z=${sim.S.player.z.toFixed(3)})`);
  // at an angle into the east wall: slides along it instead of stopping at the first touch
  sim.place(7.5, -4.2);
  sim.walkTo(12, -7.0);
  let touched = null;
  for (t = 0; t < 20 && sim.S.player.route; t += DT) {
    sim.update(DT);
    if (touched === null && sim.S.player.x > C.STORE.x1 - C.WALL_T - C.R - 1e-3) touched = { t, z: sim.S.player.z };
  }
  assert.ok(touched, 'reached the wall');
  assert.ok(touched.z - sim.S.player.z > 1.0, `slid ${(touched.z - sim.S.player.z).toFixed(2)} m along the wall after touching it`);
  assert.ok(sim.S.player.x <= C.STORE.x1 - C.WALL_T - C.R + 1e-6, 'never inside the wall');
});

test('leaving from inside a shop: roof lifted, no other solid crossed, doors shut at the end (SPEC 退出)', async () => {
  const C = await load();
  for (const [x, z] of [[0, -3.5], [5.0, 0.4], [-6.0, -2.0], [8.4, -7.9]]) {
    const sim = C.createSim({ aspect: 16 / 9 });
    sim.enter(x < -3 ? { x: -6, z: -3.5 } : 'door'); run(sim, () => sim.S.mode === 'walk');
    if (Math.abs(z - 0.4) < 1e-9) { sim.walkTo(x, z); run(sim, () => !sim.S.player.route, 6); }   // stand in the doorway
    else sim.place(x, z);
    run(sim, () => false, 1.5);
    sim.exit();
    assert.ok(sim.S.lift, `(${x}, ${z}) lifts a roof`);
    const bad = badFrames(C, transitionFrames(C, sim));
    assert.strictEqual(bad.length, 0, `(${x}, ${z}): ${bad.length} frames inside a solid, first ${JSON.stringify(bad[0])}`);
    assert.strictEqual(sim.S.mode, 'orbit');
    assert.ok(sim.S.doors.every((d) => d.k === 0), 'doors closed');
  }
});

test('hero framing (SPEC 6, logic side; the browser reads the real camera)', async () => {
  const C = await load();
  for (const [name, a] of [['1280x720', 16 / 9], ['1024x768', 4 / 3], ['1920x1080', 16 / 9], ['unfolded ~0.9', 0.9], ['390x844', 390 / 844], ['folded 0.44', 0.44]]) {
    const r = C.heroRadius(a), b = C.boxesAt(C.orbitCamera(C.heroOrbitAt(r)), 35, a);
    const m = Math.min(b.model.x0, b.model.y0, 1 - b.model.x1, 1 - b.model.y1);
    assert.ok(m >= 0.03, `${name}: margin ${m.toFixed(3)}`);
    if (a >= 0.8) assert.ok(b.base.w >= 0.55 && b.base.w <= 0.85, `${name}: base width ${b.base.w.toFixed(3)}`);
    else assert.ok(b.base.w >= 0.6, `${name}: base width ${b.base.w.toFixed(3)}`);
  }
});

test('fixed views come out of the simulation (SPEC 固定机位)', async () => {
  const C = await load();
  const view = (v, aim) => { const sim = C.createSim({ aspect: 16 / 9 }); C.runView(sim, v, aim); return sim.snapshot(); };
  const mid = view('mid', 'door');
  assert.strictEqual(mid.mode, 'entering'); assert.ok(near(mid.s, 0.5, 1e-6), `mid s=${mid.s}`);
  const door = view('door');
  assert.strictEqual(door.mode, 'walk'); assert.ok(near(door.cam.z, C.STORE.z1 + 2.6, 1e-9) && Math.abs(door.cam.yaw) < 1e-9);
  const inside = view('inside');
  assert.ok(C.buildingAt(inside.cam.x, inside.cam.z).id === 'store' && Math.hypot(inside.cam.x - 6.2, inside.cam.z + 2.3) < 0.05, 'by the till');
  const toFreezer = Math.atan2(-(1.5 - inside.cam.x), -(-7.95 - inside.cam.z));
  assert.ok(angDiff(inside.cam.yaw, toFreezer) < 0.01, 'looking at the freezers');
  const next = view('next');
  assert.ok(C.buildingAt(next.cam.x, next.cam.z).id === 'next' && C.insideInterior(next.cam.x, next.cam.z), 'inside the shop next door');
  const hero = view('hero');
  assert.strictEqual(hero.mode, 'orbit'); assert.strictEqual(hero.s, 0); assert.strictEqual(hero.rainT, 2);
});

// ---------------- 惊吓版 (SPEC 惊吓版, H2–H5, H7, H8) ----------------
const hist = (sim, e, visit) => sim.horror().history.filter((x) => x.e === e && (visit == null || x.visit === visit));

test('H2: the figure only disappears while the shop is dark, above the roofs, on every visit', async () => {
  const C = await load();
  for (const dt of [1 / 30, 1 / 60, 1 / 120]) {
    const sim = C.createSim({ aspect: 16 / 9 });
    for (let visit = 1; visit <= 2; visit++) {
      const before = sim.horror().figure;
      assert.ok(before, `visit ${visit} starts with the figure at ${before}`);
      sim.enter('door');
      let prev = { fig: sim.horror().figure, light: sim.levels().light }, removed = null;
      for (let i = 0; i < 400 && sim.S.mode !== 'walk'; i++) {
        sim.update(dt);
        const now = { fig: sim.horror().figure, light: sim.levels().light };
        if (prev.fig && !now.fig) removed = { light: now.light, prevLight: prev.light, camY: sim.S.cam.y };
        assert.ok(!(prev.fig && prev.light === 1 && !now.fig && now.light === 1), 'gone from one lit frame to the next lit frame');
        prev = now;
      }
      const tE0 = sim.horror().fired.E0;
      assert.ok(removed, `visit ${visit}: figure removed during the descent (dt ${dt})`);
      assert.ok(removed.light <= 0.05 && removed.prevLight <= 0.05, `removal frame lit at ${removed.light}`);
      assert.ok(removed.camY > C.STORE.h, `camera still above the roof (${removed.camY.toFixed(2)} m)`);
      const h = sim.horror(), dark = h.e0;
      assert.ok(tE0 > dark.start && tE0 < dark.end && dark.end - dark.start <= 0.35 + 1e-9, 'E0 inside a 0.35 s blackout');
      if (visit === 1) {                             // make the second visit start with the figure behind the glass (E5)
        sim.walkRoute(C.SCARE_PLAN.aisle); run(sim, () => !sim.S.player.route, 30, dt); run(sim, () => sim.S.t >= sim.horror().e2.t0 + C.E2_TOTAL, 5, dt);
        sim.walkRoute(C.SCARE_PLAN.out); run(sim, () => !sim.S.player.route, 30, dt);
        sim.exit(); run(sim, () => sim.S.mode === 'orbit', 5, dt);
        assert.strictEqual(sim.horror().figure, 'window');
      }
    }
  }
});

test('H3: freezers go dark one by one, both hums stop for 1.6 s, once per visit', async () => {
  const C = await load();
  const sim = C.createSim({ aspect: 16 / 9 });
  sim.enter('door'); run(sim, () => sim.S.mode === 'walk');
  sim.walkRoute(C.SCARE_PLAN.aisle);
  const offAt = [null, null, null, null, null];
  let humOff = null, humOn = null, t2 = null;
  for (let i = 0; i < 3000; i++) {
    sim.update(1 / 120);
    const L = sim.levels(), h = sim.horror(), t = sim.S.t;
    if (h.e2 && t2 == null) t2 = h.e2.t0;
    L.freezer.forEach((v, k) => { if (v === 0 && offAt[k] == null) offAt[k] = t; });
    if (L.hum === 0 && humOff == null) humOff = t;
    if (humOff != null && L.hum === 1 && humOn == null) { humOn = t; assert.ok(L.freezer.every((v) => v === 1), 'freezers back together with the sound'); }
    if (humOff != null) { assert.ok(L.hum === 1 || (L.audio.fluor === 0 && L.audio.freezer === 0), 'both hum gains are zero in the silence'); }
    if (humOn != null && !sim.S.player.route) break;
  }
  assert.ok(t2 != null && offAt.every((v) => v != null), `E2 fired at ${t2}`);
  const order = offAt.slice().sort((a, b) => a - b), span = order[4] - order[0];
  assert.ok(span <= 1.2 && span > 0.3, `one by one over ${span.toFixed(3)} s`);
  assert.ok(Math.abs(humOn - humOff - 1.6) <= 0.1, `silence ${(humOn - humOff).toFixed(3)} s`);
  // back into the aisle in the same visit: nothing again
  sim.walkTo(4.2, -4.0); run(sim, () => !sim.S.player.route); sim.walkTo(4.2, -6.6); run(sim, () => !sim.S.player.route);
  assert.strictEqual(hist(sim, 'E2', 1).length, 1, 'E2 once per visit');
});

test('H4: the door opens by itself 3 s after E2 at the earliest, out of sight and at least 3 m away (round 6)', async () => {
  const C = await load(), TK = C.HORROR.tick + 1e-9, e2end = (sim) => sim.horror().e2.t0 + C.E2_TOTAL;
  // (a) 3 m in, door behind you: nothing before E2 (it comes after 12 s in the shop), then E3 exactly 3 s after E2 ends
  let sim = C.createSim({ aspect: 16 / 9 });
  sim.enter('door'); run(sim, () => sim.S.mode === 'walk');
  sim.walkRoute([[5.0, -0.6], [5.0, -2.7]]); run(sim, () => !sim.S.player.route);
  run(sim, () => sim.horror().fired.E2 != null || sim.horror().fired.E3 != null, 20);
  assert.ok(sim.horror().fired.E2 != null, 'E2 came (12 s in the shop)');
  assert.strictEqual(sim.horror().fired.E3, null, 'no E3 before E2');
  run(sim, () => sim.horror().fired.E3 != null, 8, 1 / 120);
  const a3 = sim.horror().fired.E3;
  assert.ok(a3 != null && Math.abs(a3 - (e2end(sim) + 3)) <= TK, `E3 ${a3 && (a3 - e2end(sim)).toFixed(4)} s after E2 ended`);
  // (c) door out of sight but only 2.4 m away: nothing, not even after the 15 s fallback (that one also needs 3 m)
  sim = C.createSim({ aspect: 16 / 9 });
  sim.enter('door'); run(sim, () => sim.S.mode === 'walk');
  sim.walkRoute([[5.0, -0.6], [4.6, -2.0]]); run(sim, () => !sim.S.player.route);
  sim.lookAt(4.6, 1.6, -9.0); run(sim, () => !sim.S.player.look, 4);
  run(sim, () => sim.horror().fired.E2 != null, 20);
  run(sim, () => sim.S.t >= e2end(sim) + 20, 25);
  const p0 = sim.S.player;
  assert.ok(Math.hypot(p0.x - 5.0, p0.z - 0.4) < 3, 'closer than 3 m');
  assert.strictEqual(sim.horror().fired.E3, null, 'out of sight but closer than 3 m: no E3, even 20 s after E2');
  // (d) walk away (door behind you): E3 fires once past 3 m; door to 1.0, holds 1.2 s, back to 0; one bell; nothing at the door
  const solidsBefore = JSON.stringify(C.solids(C.newDoors()).map((b) => b.id));
  sim.walkTo(4.6, -6.2);
  const ks = []; let t3 = null;
  for (let i = 0; i < 1200; i++) {
    sim.update(1 / 120);
    const h = sim.horror();
    if (h.fired.E3 != null && t3 == null) { t3 = h.fired.E3; const p = sim.S.player, d = Math.hypot(p.x - 5.0, p.z - 0.4); assert.ok(d >= 3 && d < 3.05, `${d.toFixed(3)} m from the door when it starts`); }
    if (t3 != null) { ks.push([sim.S.t - t3, sim.S.doors[0].k]); assert.ok(!h.figure && !h.scare, 'nothing appears'); }
    if (t3 != null && sim.S.t > t3 + 3) break;
  }
  assert.ok(t3 != null, 'E3 fired after walking away');
  assert.strictEqual(sim.horror().e3.inView, false, 'out of sight');
  const full = ks.filter(([, k]) => k === 1), tFull0 = full[0][0], tFull1 = full[full.length - 1][0];
  assert.ok(Math.abs(tFull1 - tFull0 - 1.2) <= 1 / 120 + 1e-9, `held open ${(tFull1 - tFull0).toFixed(3)} s`);
  assert.strictEqual(ks[ks.length - 1][1], 0, 'closed again');
  const bells = sim.horror().sounds.filter((x) => x.kind === 'bell' && x.t >= t3 - 1e-9 && x.t <= t3 + 3);
  assert.strictEqual(bells.length, 1, `bells during E3: ${bells.length}`);
  assert.ok(Math.abs(bells[0].t - t3) < 1e-9, 'the bell rings as it starts to open');
  assert.strictEqual(JSON.stringify(C.solids(C.newDoors()).map((b) => b.id)), solidsBefore, 'no new solid at the door');
});

test('H5: staff door scare only after E3; figure 0.25 s, slam within 0.12 s, small shake, one vibration, loud bang', async () => {
  const C = await load();
  // (a1) straight to the staff door past the till, looking at it: E2 comes on the way, but until E3 the staff door stays half open and no E4
  let sim = C.createSim({ aspect: 16 / 9 });
  sim.enter('door'); run(sim, () => sim.S.mode === 'walk');
  sim.walkRoute([[5.0, -0.6], [6.5, -3.5], C.SCARE_PLAN.near]); run(sim, () => !sim.S.player.route);
  sim.lookAt(...C.SCARE_PLAN.staff); run(sim, () => !sim.S.player.look, 4);
  run(sim, () => sim.horror().fired.E3 != null, 20, 1 / 240);
  const f1 = sim.horror().fired, p1 = sim.S.player;
  assert.ok(Math.hypot(p1.x - C.BACKDOOR.cx, p1.z - C.BACKDOOR.cz) <= 2.0, 'standing at the staff door');
  assert.ok(f1.E2 !== null && f1.E3 !== null && f1.E4 === null && sim.horror().wideAt === null, `no E4 before E3: ${JSON.stringify(f1)}`);
  // (a2) after E2 and E3, but the staff door was in view the whole time after E3: it never changed, so no E4
  sim = C.createSim({ aspect: 16 / 9 });
  sim.enter('door'); run(sim, () => sim.S.mode === 'walk');
  sim.walkRoute(C.SCARE_PLAN.aisle); run(sim, () => !sim.S.player.route);
  run(sim, () => sim.horror().fired.E3 != null, 12);
  sim.lookAt(...C.SCARE_PLAN.staff); run(sim, () => !sim.S.player.look, 4);
  sim.walkTo(...C.SCARE_PLAN.near); run(sim, () => !sim.S.player.route); sim.lookAt(...C.SCARE_PLAN.staff); run(sim, () => !sim.S.player.look, 4);
  run(sim, () => false, 1);
  assert.ok(sim.horror().fired.E3 != null && sim.horror().wideAt === null, 'E3 happened, the staff door never left the view');
  assert.strictEqual(sim.horror().fired.E4, null, 'no E4 while the door is still the way it was');
  // (b) the full visit
  sim = C.createSim({ aspect: 16 / 9 });
  C.playScare(sim, { upTo: 'scare', after: 0 });
  const h = sim.horror(), t4 = h.fired.E4, p = sim.S.player;
  assert.ok(t4 != null && h.fired.E3 != null && t4 > h.e3.closedAt, 'E4 after E3 is over');
  assert.ok(Math.hypot(p.x - C.BACKDOOR.cx, p.z - C.BACKDOOR.cz) <= 2.0, 'within 2.0 m');
  assert.ok(Math.hypot(p.x - C.BACKDOOR.hx, p.z - C.BACKDOOR.hz) >= 1.3, 'clear of the hinge');
  const q = C.project(sim.S.cam, sim.fov(), sim.S.aspect, [C.BACKDOOR.cx, C.SIDEWALK_H + C.BACKDOOR.h / 2, C.BACKDOOR.cz]);
  assert.ok(Math.abs(q.x - 0.5) <= 1 / 4 + 0.01, `door at ${q.x.toFixed(3)} of the width`);
  const walker = { x: p.x, z: p.z };
  const tl = [];
  for (let i = 0; i < 240; i++) { sim.update(1 / 240); const L = sim.levels(); tl.push({ t: sim.S.t - t4, back: L.back, scare: L.scare, shake: Math.hypot(...L.shake), dark: L.darken }); }
  const seen = tl.filter((x) => x.scare), lastWide = tl.filter((x) => Math.abs(x.back - C.BACKDOOR.wide) < 1e-9).pop(), firstShut = tl.find((x) => x.back === 0);
  assert.ok(Math.abs(lastWide.t - 0.25) <= 0.05, `figure shown ${lastWide.t.toFixed(3)} s before the slam`);
  assert.ok(firstShut.t - lastWide.t <= 0.12 + 1 / 240 + 1e-9, `slam took ${(firstShut.t - lastWide.t).toFixed(3)} s`);
  assert.ok(seen.length && seen[seen.length - 1].t <= firstShut.t + 1e-9, 'figure gone once the door is shut');
  const shaking = tl.filter((x) => x.shake > 0), maxShake = Math.max(...tl.map((x) => x.shake));
  assert.ok(maxShake <= 0.03 && shaking.length && shaking[shaking.length - 1].t - shaking[0].t <= 0.3, `shake ${maxShake.toFixed(4)} m over ${(shaking[shaking.length - 1].t - shaking[0].t).toFixed(3)} s`);
  assert.ok(sim.S.player.x === walker.x && sim.S.player.z === walker.z, 'the walker did not move');
  assert.ok(Math.abs(tl.filter((x) => x.dark).length / 240 - 0.1) <= 2 / 240, 'darkened for 0.1 s');
  const v = sim.horror().vibes;
  assert.strictEqual(v.length, 1); assert.deepStrictEqual(v[0].pattern, [90, 50, 140]);
  const lv = C.audioLevels(1);
  assert.ok(lv.slam / lv.base >= 3 && Math.abs(lv.bell / lv.base - 2) < 1e-9, `bang ${(lv.slam / lv.base).toFixed(2)}x, bell ${(lv.bell / lv.base).toFixed(2)}x the bed`);
  const sounds = sim.horror().sounds.filter((x) => x.kind === 'slam' || x.kind === 'sting');
  assert.ok(sounds.length === 2 && sounds.every((x) => Math.abs(x.t - (t4 + C.E4_BANG)) < 1e-9), 'bang and sting when the door hits');
});

test('H6 (logic): the figure goes behind the glass only where the camera cannot see it, or while the shop is dark', async () => {
  const C = await load();
  const cases = {                                     // where the exit starts from, and what the walker looks at
    street: { route: C.SCARE_PLAN.out, look: [5.0, 1.6, 9.0] },
    road: { route: [...C.SCARE_PLAN.out, [5.0, 7.0]], look: [5.0, 1.6, 0.0] },          // across the street, facing the shop
    inside: { route: [[5.0, -0.6], [6.2, -2.3]], look: [1.5, 1.25, -7.95] },             // by the till: leaves through the lifted roof
  };
  const used = new Set();
  for (const [name, c] of Object.entries(cases)) for (const dt of [1 / 30, 1 / 120]) {
    const sim = C.createSim({ aspect: 16 / 9 }), S = sim.S;
    C.playScare(sim, { upTo: 'E4', dt });
    sim.walkRoute(c.route); run(sim, () => !S.player.route, 20, dt);
    sim.lookAt(...c.look); run(sim, () => !S.player.look, 6, dt);
    sim.exit();
    let placed = null;
    for (let t = 0; t < 5 && S.mode !== 'orbit'; t += dt) {
      const before = sim.horror().figure;
      sim.update(dt);
      if (!before && sim.horror().figure === 'window') {
        placed = { seen: C.pointsVisible(S.cam, sim.fov(), S.aspect, C.figurePoints('window'), S.lift), light: sim.levels().light, camY: S.cam.y, how: sim.horror().e5Dark ? 'dark' : 'unseen' };
      }
    }
    assert.ok(placed, `${name}, dt ${dt}: E5 happened during the exit`);
    assert.ok(!placed.seen || placed.light <= 0.05, `${name}, dt ${dt}: placed in view with the light at ${placed.light}`);
    assert.ok(placed.camY > C.STORE.h, `${name}: above the roofs (${placed.camY.toFixed(2)} m)`);
    assert.strictEqual(sim.horror().figure, 'window');
    used.add(placed.how);
  }
  assert.deepStrictEqual([...used].sort(), ['dark', 'unseen'], `both ways of placing it were exercised: ${[...used]}`);
  // a visit without E2 leaves nothing behind the glass
  const sim = C.createSim({ aspect: 16 / 9 }), S = sim.S;
  sim.enter('door'); run(sim, () => S.mode === 'walk', 10);
  assert.strictEqual(sim.horror().figure, null);
  sim.exit(); run(sim, () => S.mode === 'orbit', 5);
  assert.strictEqual(sim.horror().fired.E5, null); assert.strictEqual(sim.horror().figure, null, 'no E2, no figure behind the glass');
});

test('H7: three visits in a row; each event once per visit; the figure comes and goes the same way', async () => {
  const C = await load();
  const sim = C.createSim({ aspect: 16 / 9 });
  for (let visit = 1; visit <= 3; visit++) {
    C.playScare(sim, { upTo: 'out' });
    const h = sim.horror();
    assert.strictEqual(h.visit, visit);
    for (const e of ['E0', 'E2', 'E3', 'E4', 'E5']) assert.strictEqual(hist(sim, e, visit).length, 1, `visit ${visit}: ${e} ${hist(sim, e, visit).length} times`);
    assert.strictEqual(h.figure, 'window', `visit ${visit} ends with the figure behind the glass`);
    assert.strictEqual(sim.S.mode, 'orbit');
  }
});

test('H8 (logic): calm version has no figure and no E0, E2-E5; the doorbell still rings', async () => {
  const C = await load();
  const sim = C.createSim({ aspect: 16 / 9, calm: true });
  assert.strictEqual(sim.horror().figure, null);
  C.playScare(sim, { upTo: 'out' });
  const kinds = new Set(sim.horror().history.map((x) => x.e));
  assert.deepStrictEqual([...kinds], ['E1'], `events in calm mode: ${[...kinds]}`);
  assert.strictEqual(sim.horror().figure, null);
  assert.strictEqual(sim.trigger('E4'), false, 'test trigger refuses in calm mode');
});

test('scare events happen at the same instants at 30 and 120 steps per second', async () => {
  const C = await load();
  const timed = (dt) => {
    const sim = C.createSim({ aspect: 16 / 9 }), P = C.SCARE_PLAN, S = sim.S;
    const plan = [[0, () => sim.enter('door')], [2, () => sim.walkRoute(P.aisle)], [15, () => sim.lookAt(...P.behind)], [17.5, () => sim.lookAt(...P.staff)],
      [19, () => sim.walkTo(...P.near)], [21, () => sim.lookAt(...P.staff)], [23, () => sim.walkRoute(P.out)], [32, () => sim.exit()]];
    let next = 0;
    for (let i = 0; S.t < 35 - 1e-9; i++) {
      while (next < plan.length && S.t >= plan[next][0] - 1e-9) plan[next++][1]();
      sim.update(dt);
    }
    return sim.horror().history;
  };
  const a = timed(1 / 30), b = timed(1 / 120);
  assert.deepStrictEqual(a.map((x) => x.e), b.map((x) => x.e), 'same events in the same order');
  for (const e of ['E0', 'E2', 'E3', 'E4', 'E5']) assert.ok(a.some((x) => x.e === e), `${e} happened`);
  const worst = Math.max(...a.map((x, i) => Math.abs(x.t - b[i].t)));
  assert.ok(worst < 1e-6, `event times differ by up to ${worst}`);
});

// ---------------- 第四轮：摇杆、手机转头、「看整间店」 (SPEC 店里的操作, R1-R6, R8) ----------------
const SCREENS = { phone: [390, 844], fold: [880, 920], desk: [1280, 720] };
async function walkIn(C, [w, h] = SCREENS.phone, { aim = 'door', route = [[5.0, -0.6], [6.2, -2.3]] } = {}) {
  const sim = C.createSim({ aspect: w / h });
  sim.enter(aim); run(sim, () => sim.S.mode === 'walk');
  if (route) { sim.walkRoute(route); run(sim, () => !sim.S.player.route); }
  return { sim, pad: C.createTouchPad(sim, { width: w, height: h }), w, h };
}
const stepFor = (sim, secs, each) => { for (let t = 0; t < secs - 1e-9; t += DT) { sim.update(DT); if (each) each(); } };
// two free fingers on the right half, brought together to `ratio` of their starting distance
function pinchRight(pad, w, h, ratio, t0 = 0, ids = [11, 12]) {
  const cx = w * 0.76, cy = h * 0.55, d0 = w * 0.18;
  pad.down(ids[0], cx - d0 / 2, cy, t0); pad.down(ids[1], cx + d0 / 2, cy, t0 + 5);
  for (let i = 1; i <= 10; i++) { const d = d0 * (1 + (ratio - 1) * (i / 10)); pad.move(ids[0], cx - d / 2, cy); pad.move(ids[1], cx + d / 2, cy); }
  pad.up(ids[0], cx - (d0 * ratio) / 2, cy, t0 + 400); pad.up(ids[1], cx + (d0 * ratio) / 2, cy, t0 + 405);
}

test('R1: the joystick walks along the view in proportion to the push, stops when let go, and never turns the view', async () => {
  const C = await load();
  const { sim, pad } = await walkIn(C), p = sim.S.player;
  sim.place(5.0, -1.5, 0);
  const yaw0 = p.yaw, at = () => [p.x, p.z];
  pad.down(1, 100, 650, 0);                                   // left 45%: a joystick appears where the thumb lands
  assert.ok(pad.joy && pad.joy.x0 === 100 && pad.joy.y0 === 650, 'joystick under the thumb');
  let a = at(); pad.move(1, 100, 590); stepFor(sim, 1);       // pushed fully up for 1 s
  let b = at(), d = Math.hypot(b[0] - a[0], b[1] - a[1]), dir = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));
  assert.ok(Math.abs(d - 1.3) <= 0.1, `full push for 1 s: ${d.toFixed(3)} m`);
  assert.ok(angDiff(dir, p.yaw) < 0.02, 'along the line of sight');
  a = at(); pad.move(1, 100, 620); stepFor(sim, 1);           // half way
  b = at(); const half = Math.hypot(b[0] - a[0], b[1] - a[1]);
  assert.ok(Math.abs(half / d - 0.5) <= 0.1, `half push: ${half.toFixed(3)} m, ${(half / d).toFixed(2)} of full`);
  a = at(); pad.move(1, 100, 645); stepFor(sim, 0.5);         // 5 px: inside the 6 px dead zone
  b = at(); assert.ok(Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9, 'dead zone: no movement');
  a = at(); pad.move(1, 160, 650); stepFor(sim, 0.5);         // pushed right: steps sideways, view unchanged
  b = at(); const side = Math.atan2(-(b[0] - a[0]), -(b[1] - a[1]));
  assert.ok(angDiff(side, p.yaw - Math.PI / 2) < 0.02 && Math.abs(Math.hypot(b[0] - a[0], b[1] - a[1]) - 0.65) < 0.05, 'pushed right: 0.65 m to the right of the view');
  assert.strictEqual(p.yaw, yaw0, 'pushing sideways does not turn the view');
  pad.move(1, 100, 590); stepFor(sim, 0.2); pad.up(1, 100, 590, 3000);
  a = at(); stepFor(sim, 0.2); b = at();
  assert.ok(Math.hypot(b[0] - a[0], b[1] - a[1]) < 1e-9, 'let go: stopped within 0.2 s');
  assert.strictEqual(p.yaw, yaw0, 'the view did not turn');
  assert.strictEqual(pad.joy, null);
});

test('R2: one finger held over 150 ms, then the other: walking and turning at once, never taken for a pinch', async () => {
  const C = await load();
  for (const order of ['joystick first', 'drag first']) {
    const { sim, pad } = await walkIn(C), p = sim.S.player;
    sim.place(5.0, -1.5, 0);
    const x0 = p.x, z0 = p.z, yaw0 = p.yaw, modes = new Set();
    if (order === 'joystick first') { pad.down(1, 90, 700, 0); pad.down(2, 300, 520, 300); }   // 300 ms apart: no waiting to decide
    else { pad.down(2, 300, 520, 0); pad.down(1, 90, 700, 300); }
    let closest = Infinity;
    for (let i = 1; i <= 60; i++) {                               // thumb pushed up, other hand dragged left: the fingers end up close together
      pad.move(1, 90 + i * 1.2, 700 - Math.min(45, i));
      pad.move(2, 300 - i * 1.8, 520 + i * 1.5);
      closest = Math.min(closest, Math.hypot(300 - i * 1.8 - (90 + i * 1.2), 520 + i * 1.5 - (700 - Math.min(45, i))));
      sim.update(DT); modes.add(sim.S.mode);
      assert.ok(!pad.pinching, 'never a pinch');
    }
    pad.up(1, 162, 655, 2000); pad.up(2, 192, 610, 2000);
    assert.ok(closest < 0.75 * Math.hypot(210, 180), `${order}: the two fingers came within ${closest.toFixed(0)} px (a pinch would have fired)`);
    assert.deepStrictEqual([...modes], ['walk'], `${order}: stayed walking (${[...modes]})`);
    assert.ok(Math.hypot(p.x - x0, p.z - z0) > 0.3, `${order}: walked ${Math.hypot(p.x - x0, p.z - z0).toFixed(2)} m`);
    assert.ok(Math.abs(p.yaw - yaw0) > 0.3, `${order}: turned ${(p.yaw - yaw0).toFixed(2)} rad`);
  }
});

test('R3: a touch swipe across the whole width turns 180 deg, vertical at the same ratio; the mouse is as before', async () => {
  const C = await load();
  for (const [name, [w, h]] of Object.entries({ phone: SCREENS.phone, fold: SCREENS.fold })) {
    const { sim, pad } = await walkIn(C, [w, h]), p = sim.S.player;
    sim.place(5.0, -1.5, 0);
    const yaw0 = p.yaw;
    pad.down(1, w - 1, h / 2, 0);                                 // starts on the right (not the joystick), slides to the left edge
    for (let x = w - 1; x > 1; x -= 7) pad.move(1, x, h / 2);
    pad.move(1, 1, h / 2); pad.up(1, 1, h / 2, 900);
    const turned = Math.abs(p.yaw - yaw0) * (w / (w - 2));        // scaled to a full-width swipe
    assert.ok(Math.abs(turned - Math.PI) <= 0.1 * Math.PI, `${name}: full width turns ${(turned * 180 / Math.PI).toFixed(1)} deg`);
    const pitch0 = p.pitch;
    pad.down(2, w * 0.8, h * 0.3, 2000); pad.move(2, w * 0.8, h * 0.3 + w / 8); pad.up(2, w * 0.8, h * 0.3 + w / 8, 2500);
    assert.ok(Math.abs(p.pitch - pitch0 - Math.PI / 8) < 1e-9, `${name}: 1/8 of the width down tilts ${(p.pitch - pitch0).toFixed(4)} rad`);
  }
  assert.strictEqual(C.LOOK_MOUSE, 0.005); assert.strictEqual(C.ROT_MOUSE, 0.006);
});

test('R4: pinching inside a shop rises to the room view; roof and ceiling off, floor in frame, nothing crossed (both shops)', async () => {
  const C = await load();
  for (const [id, aim, route] of [['store', 'door', [[5.0, -0.6], [6.2, -2.3]]], ['next', { x: -6.0, z: -3.5 }, [[-6.0, -0.6], [-6.0, -2.2]]]]) {
    for (const [name, scr] of Object.entries(SCREENS)) {
      const { sim, pad, w, h } = await walkIn(C, scr, { aim, route });
      assert.strictEqual(sim.snapshot().level, 'inside');
      pinchRight(pad, w, h, 0.6);
      assert.strictEqual(sim.S.mode, 'rising', `${id} ${name}: pinch inside -> rising, not out (${sim.S.mode})`);
      const modes = new Set(), bad = [];
      for (let i = 0; i < 200 && sim.S.mode !== 'room'; i++) {
        sim.update(DT); modes.add(sim.S.mode);
        const c = sim.S.cam;
        if (!C.cameraClear([c.x, c.y, c.z], 0.1, sim.S.lift)) bad.push(c.y.toFixed(2));
      }
      assert.strictEqual(sim.S.mode, 'room', `${id} ${name}: reached the room view`);
      assert.ok(!modes.has('exiting') && !modes.has('orbit'), 'did not go out');
      assert.strictEqual(bad.length, 0, `${id} ${name}: camera inside a solid on ${bad.length} frames`);
      const rf = sim.roofs();
      assert.ok(rf[id].a === 0 && rf[id].parts === 'room', `${id}: roof and ceiling off`);
      for (const other of Object.keys(rf).filter((k) => k !== id)) assert.strictEqual(rf[other].a, 1, 'the other shop keeps its roof');
      const b = C.BUILDINGS.find((q) => q.id === id), corners = C.roomFloor(b).map((q) => C.project(sim.S.cam, sim.fov(), w / h, q));
      assert.ok(corners.every((q) => q.depth > 0 && q.x >= 0 && q.x <= 1 && q.y >= 0 && q.y <= 1), `${id} ${name}: floor corners ${corners.map((q) => `(${q.x.toFixed(2)},${q.y.toFixed(2)})`).join(' ')}`);
    }
  }
});

test('R5: from the room view a spread lands on the aimed floor; a pinch goes out to the table as in item 2', async () => {
  const C = await load();
  for (const [name, scr] of Object.entries(SCREENS)) {
    const { sim, pad, w, h } = await walkIn(C, scr);
    pinchRight(pad, w, h, 0.6); run(sim, () => sim.S.mode === 'room', 3);
    const aim = [5.4, -4.6], q = C.project(sim.S.cam, sim.fov(), w / h, [aim[0], C.SIDEWALK_H, aim[1]]), sx = q.x * w, sy = q.y * h;
    pad.down(21, sx - 25, sy, 5000); pad.down(22, sx + 25, sy, 5005);          // spread around that spot
    for (let i = 1; i <= 8; i++) { pad.move(21, sx - 25 - i * 6, sy); pad.move(22, sx + 25 + i * 6, sy); }
    pad.up(21, sx - 73, sy, 5300); pad.up(22, sx + 73, sy, 5305);
    assert.strictEqual(sim.S.mode, 'landing', `${name}: spread -> landing`);
    const camYaw = sim.S.trans.yawO, bad = [];
    for (let i = 0; i < 200 && sim.S.mode !== 'walk'; i++) { sim.update(DT); const c = sim.S.cam; if (!C.cameraClear([c.x, c.y, c.z], 0.1, sim.S.lift)) bad.push(i); }
    const p = sim.S.player, s = sim.snapshot();
    assert.ok(Math.hypot(p.x - aim[0], p.z - aim[1]) <= 0.3, `${name}: landed ${Math.hypot(p.x - aim[0], p.z - aim[1]).toFixed(3)} m from the aimed spot`);
    assert.ok(Math.abs(s.eye - 1.6) <= 0.02 && Math.abs(p.pitch) < 0.05, `eye ${s.eye.toFixed(3)}, pitch ${p.pitch}`);
    assert.ok(angDiff(p.yaw, camYaw) < 1e-9, 'facing the way the camera faced');
    assert.strictEqual(bad.length, 0, 'the landing crossed nothing');
    // back up, then pinch again: out to the table exactly as an exit from walking (item 2)
    pinchRight(pad, w, h, 0.6, 8000); run(sim, () => sim.S.mode === 'room', 3);
    const trig = sim.S.trigger;
    pinchRight(pad, w, h, 0.6, 9000, [31, 32]);
    assert.ok(sim.S.mode === 'exiting' && sim.S.trans.room, `${name}: pinch in the room view -> out`);
    let prevS = sim.S.s, jump = 0, prevFov = sim.fov(), fovJump = 0;
    for (let i = 0; i < 200 && sim.S.mode !== 'orbit'; i++) { sim.update(DT); jump = Math.max(jump, Math.abs(sim.S.s - prevS)); fovJump = Math.max(fovJump, Math.abs(sim.fov() - prevFov)); prevS = sim.S.s; prevFov = sim.fov(); }
    assert.ok(jump < 0.05 && fovJump < 3, `${name}: s and the view angle change smoothly on the way out (largest step ${jump.toFixed(3)}, ${fovJump.toFixed(2)} deg)`);
    const o = sim.S.orbit, t = trig.orbit, L = C.looks(trig.s, w / h), after = sim.snapshot();
    assert.ok(Math.hypot(o.cx - t.cx, o.cy - t.cy, o.cz - t.cz) < 0.05 && Math.abs(o.r - t.r) < 0.05 && angDiff(o.theta, t.theta) < 0.01 && angDiff(o.phi, t.phi) < 0.01, 'back at the entry orbit');
    assert.ok(after.s === trig.s && after.fog === L.fog && after.baseSides === L.baseSides && after.groundAlpha === L.groundAlpha, 's, fog, base sides, ground as at the entry');
    assert.ok(Object.values(sim.roofs()).every((r) => r.a === 1), 'roofs back');
  }
});

test('R6: pinching on the pavement goes straight out; Esc goes straight out from every level', async () => {
  const C = await load();
  const { sim, pad, w, h } = await walkIn(C, SCREENS.phone, { route: null });   // landed on the pavement, 2.6 m from the door
  assert.strictEqual(sim.snapshot().level, 'street');
  const modes = new Set();
  pinchRight(pad, w, h, 0.6);
  for (let i = 0; i < 200 && sim.S.mode !== 'orbit'; i++) { modes.add(sim.S.mode); sim.update(DT); }
  assert.ok(modes.has('exiting') && !modes.has('rising') && !modes.has('room'), `pavement pinch: ${[...modes]}`);
  // Esc: from inside (no room view on the way), from the room view, and during the rise
  for (const where of ['inside', 'room', 'rising']) {
    const { sim: s2 } = await walkIn(C, SCREENS.desk), seen = new Set();
    if (where !== 'inside') { s2.back(); if (where === 'room') run(s2, () => s2.S.mode === 'room', 3); else s2.update(DT * 5); }
    assert.ok(s2.escape(), `Esc ${where}`);
    for (let i = 0; i < 300 && s2.S.mode !== 'orbit'; i++) { seen.add(s2.S.mode); s2.update(DT); }
    assert.strictEqual(s2.S.mode, 'orbit', `Esc ${where}: outside`);
    assert.ok(!seen.has('walk') && !seen.has('landing') && (where !== 'inside' || !seen.has('room')), `Esc ${where}: ${[...seen]}`);
  }
});

test('R8 (logic): the room view starts no scare event, a running one finishes, and E5 waits until the roof is back', async () => {
  const C = await load();
  // E2 has just fired (E3 would follow once it is over): rise at once and stay 10 s, turning the view about
  let sim;
  for (const [w, h] of Object.values(SCREENS)) for (const turn of [0, 1.1, 2.3, 3.4, 4.6, 5.7]) {
    sim = C.createSim({ aspect: w / h });
    sim.enter('door'); run(sim, () => sim.S.mode === 'walk');
    sim.walkRoute(C.SCARE_PLAN.aisle); run(sim, () => !sim.S.player.route);
    assert.ok(sim.horror().fired.E2 != null && sim.horror().fired.E3 == null);
    sim.back(); const n0 = sim.horror().history.length;
    run(sim, () => sim.S.mode === 'room', 3); sim.roomRotate(turn, 0.35);
    stepFor(sim, 10);
    assert.strictEqual(sim.S.mode, 'room');
    assert.strictEqual(sim.horror().history.length, n0, `${w}x${h}, turned ${turn}: events in the room view: ${sim.horror().history.slice(n0).map((x) => x.e)}`);
    assert.ok(sim.horror().wideAt === null && sim.levels().hum === 1, 'nothing changed; the freezer blackout ran its course');
  }
  // a door E3 has opened keeps its own timeline after rising
  sim = C.createSim({ aspect: 16 / 9 });
  sim.enter('door'); run(sim, () => sim.S.mode === 'walk');
  sim.walkRoute(C.SCARE_PLAN.aisle); run(sim, () => !sim.S.player.route); run(sim, () => sim.horror().fired.E3 != null, 6);
  assert.ok(sim.horror().fired.E3 != null && sim.S.doors[0].k < 0.5, 'E3 has just started');
  sim.back();
  const ks = []; stepFor(sim, 3.5, () => ks.push(sim.S.doors[0].k));
  assert.ok(Math.max(...ks) === 1 && ks[ks.length - 1] === 0, `E3's door: up to ${Math.max(...ks)}, ends ${ks[ks.length - 1]}`);
  // E5 when leaving from the room view: only once the roof is fully back
  let placed = null;
  sim.exit();
  for (let i = 0; i < 200 && sim.S.mode !== 'orbit'; i++) {
    const before = sim.horror().figure; sim.update(DT);
    if (!before && sim.horror().figure === 'window') placed = { roof: sim.roofs().store.a, t: sim.S.trans ? sim.S.trans.tau : null };
  }
  assert.ok(placed, 'E5 happened leaving from the room view');
  assert.strictEqual(placed.roof, 1, `roof at ${placed.roof} when the figure was placed`);
});

// ---------------- 第五轮：两指几乎同时落下、竖屏整间店、提示圈、左上方转头 (SPEC R10-R13) ----------------
test('R10: two fingers down together: moving against each other along their line is a pinch, otherwise walk and turn; a joystick held 300 ms stays a joystick', async () => {
  const C = await load();
  for (const [name, scr] of Object.entries({ phone: SCREENS.phone, fold: SCREENS.fold })) {
    const [w, h] = scr, jx = w * 0.2, jy = h * 0.82;                       // on the joystick spot (lower left)
    // (1) together (30 ms apart), one on the spot, closing along the line between them -> the room view
    let { sim, pad } = await walkIn(C, scr);
    const bx = w * 0.78, by = h * 0.62;
    pad.down(1, jx, jy, 0); pad.down(2, bx, by, 30);
    assert.ok(pad.pending && !pad.joy && !pad.pinching, `${name} (1): undecided while the fingers have not moved`);
    for (let i = 1; i <= 10; i++) { const k = i / 10 * 0.45; pad.move(1, jx + (bx - jx) * k / 2, jy + (by - jy) * k / 2); pad.move(2, bx - (bx - jx) * k / 2, by - (by - jy) * k / 2); }
    assert.strictEqual(sim.S.mode, 'rising', `${name} (1): together and closing -> the room view (${sim.S.mode})`);
    // (2) together, the lower-left one pushed up, the right one swiping across (both directions) -> walk and turn
    for (const dir of [1, -1]) {
      ({ sim, pad } = await walkIn(C, scr)); sim.place(5.0, -1.5, 0);
      const p = sim.S.player, x0 = p.x, z0 = p.z, yaw0 = p.yaw, rx = w * 0.72, ry = jy - 8, modes = new Set();
      pad.down(1, jx, jy, 0); pad.down(2, rx, ry, 25);
      for (let i = 1; i <= 40; i++) { pad.move(1, jx, jy - Math.min(40, i * 2)); pad.move(2, rx + dir * i * 2, ry); sim.update(DT); modes.add(sim.S.mode); }
      assert.deepStrictEqual([...modes], ['walk'], `${name} (2) swipe ${dir > 0 ? 'out' : 'in'}: stayed walking (${[...modes]})`);
      assert.ok(pad.joy && !pad.pinching, `${name} (2): joystick + head-turn`);
      assert.ok(Math.hypot(p.x - x0, p.z - z0) > 0.3 && Math.abs(p.yaw - yaw0) > 0.2, `${name} (2): walked ${Math.hypot(p.x - x0, p.z - z0).toFixed(2)} m, turned ${(p.yaw - yaw0).toFixed(2)}`);
    }
    // (3) joystick held 300 ms, then the second finger, closing in -> still walk and turn
    ({ sim, pad } = await walkIn(C, scr)); sim.place(5.0, -1.5, 0);
    pad.down(1, jx, jy, 0); pad.move(1, jx, jy - 30);
    pad.down(2, bx, by, 300);
    assert.ok(!pad.pending, `${name} (3): no waiting to decide after 300 ms`);
    const modes3 = new Set();
    for (let i = 1; i <= 30; i++) { pad.move(1, jx + i * 2, jy - 30 - i); pad.move(2, bx - i * 4, by + i * 2); sim.update(DT); modes3.add(sim.S.mode); }
    assert.deepStrictEqual([...modes3], ['walk'], `${name} (3): stayed walking (${[...modes3]})`);
    assert.ok(!pad.pinching && pad.joy, `${name} (3): joystick + head-turn`);
    // (4) together, both moving the same way along their line (a two-finger slide): not a pinch
    ({ sim, pad } = await walkIn(C, scr));
    pad.down(1, jx, jy, 0); pad.down(2, bx, by, 20);
    for (let i = 1; i <= 8; i++) { const ux = (bx - jx), uy = (by - jy), L = Math.hypot(ux, uy); pad.move(1, jx + ux / L * i * 3, jy + uy / L * i * 3); pad.move(2, bx + ux / L * i * 3, by + uy / L * i * 3); }
    assert.ok(!pad.pinching && sim.S.mode === 'walk', `${name} (4): a two-finger slide is not a pinch`);
    // (5) together, neither on the joystick spot: a pinch straight away, as before
    ({ sim, pad } = await walkIn(C, scr));
    pad.down(1, w * 0.6, h * 0.3, 0); pad.down(2, w * 0.9, h * 0.3, 20);
    assert.ok(pad.pinching && !pad.pending, `${name} (5): both off the spot -> pinch at once`);
  }
});

test('R11: on a portrait screen the room view turns the shop long side upright and fills at least 45% of the height', async () => {
  const C = await load();
  for (const [w, h] of [[390, 844], [380, 870]]) for (const [id, aim, route] of [['store', 'door', [[5.0, -0.6], [6.2, -2.3]]], ['next', { x: -6.0, z: -3.5 }, [[-6.0, -0.6], [-6.0, -2.2]]]]) {
    const { sim } = await walkIn(C, [w, h], { aim, route });
    sim.back(); run(sim, () => sim.S.mode === 'room', 3);
    const b = C.BUILDINGS.find((q) => q.id === id), q = C.roomFloor(b).map((pt) => C.project(sim.S.cam, sim.fov(), w / h, pt));
    const ys = q.map((v) => v.y), xs = q.map((v) => v.x), hh = Math.max(...ys) - Math.min(...ys);
    assert.ok(q.every((v) => v.depth > 0 && v.x >= 0 && v.x <= 1 && v.y >= 0 && v.y <= 1), `${w}x${h} ${id}: corners in frame`);
    assert.ok(hh >= 0.45, `${w}x${h} ${id}: floor box ${(hh * 100).toFixed(1)}% of the height`);
    const long = b.x1 - b.x0 >= b.z1 - b.z0 ? 'x' : 'z', yaw = sim.S.cam.yaw;
    assert.ok(long === 'x' ? Math.abs(Math.cos(yaw)) < 1e-9 : Math.abs(Math.sin(yaw)) < 1e-9, `${id}: looking along the long side (yaw ${yaw.toFixed(3)})`);
  }
  // landscape keeps round 4: the view starts behind the walker's line of sight
  const { sim } = await walkIn(C, SCREENS.desk); const yaw = sim.S.player.yaw;
  sim.back(); run(sim, () => sim.S.mode === 'room', 3);
  assert.ok(angDiff(sim.S.room.theta, yaw) < 1e-9 && sim.S.room.phi === C.ROOM.phi, 'landscape unchanged');
});

test('R12: the joystick ring shows on touch screens while walking with no joystick down, and never with a mouse', async () => {
  const C = await load();
  const { sim, pad } = await walkIn(C);
  assert.strictEqual(C.joyHint(sim.S.mode, pad, true), true, 'walking, touch, nothing down: shown');
  assert.strictEqual(C.joyHint(sim.S.mode, pad, false), false, 'mouse: never');
  pad.down(1, 80, 700, 0);
  assert.strictEqual(C.joyHint(sim.S.mode, pad, true), false, 'joystick down: hidden');
  pad.up(1, 80, 700, 100);
  assert.strictEqual(C.joyHint(sim.S.mode, pad, true), true, 'let go: back');
  pad.down(2, 80, 700, 1000); pad.down(3, 300, 600, 1020);
  assert.ok(pad.pending && C.joyHint(sim.S.mode, pad, true) === false, 'two fingers deciding: hidden');
  pad.up(2, 80, 700, 1100); pad.up(3, 300, 600, 1100);
  sim.back(); run(sim, () => sim.S.mode === 'room', 3);
  assert.strictEqual(C.joyHint(sim.S.mode, pad, true), false, 'room view: no ring');
});

test('R13: a finger on the upper left turns the head; no joystick, no walking', async () => {
  const C = await load();
  for (const [w, h] of [SCREENS.phone, SCREENS.fold]) {
    const { sim, pad } = await walkIn(C, [w, h]), p = sim.S.player;
    sim.place(5.0, -1.5, 0);
    const x0 = p.x, z0 = p.z, yaw0 = p.yaw, sx = w * 0.2, sy = h * 0.3;
    assert.ok(!C.inJoyZone(sx, sy, w, h) && C.inJoyZone(sx, h * 0.8, w, h), 'upper left is off the spot, lower left is on it');
    pad.down(1, sx, sy, 0); assert.strictEqual(pad.joy, null, 'no joystick on the upper left');
    for (let i = 1; i <= 10; i++) pad.move(1, sx + i * 10, sy);
    stepFor(sim, 0.5); pad.up(1, sx + 100, sy, 800);
    assert.ok(Math.abs(Math.abs(p.yaw - yaw0) - C.touchTurn(100, w)) < 1e-9, `${w}x${h}: turned ${(p.yaw - yaw0).toFixed(4)} rad`);
    assert.ok(Math.hypot(p.x - x0, p.z - z0) < 1e-9, 'did not walk');
  }
});

// ---------------- 第六轮：电脑转身、惊吓好找 (SPEC 电脑转身与惊吓好找, K1, F1-F4) ----------------
const KEYS0 = { fwd: false, back: false, left: false, right: false, turnL: false, turnR: false, run: false };
function holdKeys(C, sim, keys, secs, hz) {
  const dt = 1 / hz, k = { ...KEYS0, ...keys };
  for (let i = 0; i < Math.round(secs * hz); i++) { const m = C.keyMotion(k, sim.S.player.yaw); sim.drive(m.vx, m.vz); sim.turn(m.turn); sim.update(dt); }
  sim.drive(0, 0); sim.turn(0);
}
async function standInside(C) {
  const sim = C.createSim({ aspect: 16 / 9 });
  sim.enter('door'); run(sim, () => sim.S.mode === 'walk');
  sim.walkRoute([[5.0, -0.6], [4.6, -3.2]]); run(sim, () => !sim.S.player.route);
  return sim;
}

test('K1 (logic): the turning keys turn 2.0 rad/s in place at any step rate; the sidestep keys move without turning', async () => {
  const C = await load();
  for (const hz of [30, 120]) {
    for (const [keys, sign] of [[{ turnL: true }, 1], [{ turnR: true }, -1], [{ turnL: true, run: true }, 1]]) {
      const sim = await standInside(C), p0 = { ...sim.S.player };
      holdKeys(C, sim, keys, 1, hz);
      const p = sim.S.player, dy = p.yaw - p0.yaw;
      assert.ok(Math.abs(dy - sign * 2.0) <= 0.1, `${hz}/s ${JSON.stringify(keys)}: turned ${dy.toFixed(4)} rad`);
      assert.ok(Math.abs(dy - sign * 2.0) < 1e-9, `exactly 2.0 rad (${dy})`);
      assert.ok(p.x === p0.x && p.z === p0.z, 'did not move');
    }
    for (const [keys, sx] of [[{ left: true }, -1], [{ right: true }, 1]]) {
      const sim = await standInside(C), p0 = { ...sim.S.player };
      holdKeys(C, sim, keys, 0.5, hz);
      const p = sim.S.player, along = (p.x - p0.x) * Math.cos(p0.yaw) - (p.z - p0.z) * Math.sin(p0.yaw);
      assert.strictEqual(p.yaw, p0.yaw, 'yaw unchanged');
      assert.ok(sx * along > 0.6, `${hz}/s ${JSON.stringify(keys)}: moved ${along.toFixed(3)} m sideways`);
    }
  }
  // the same yaw at both step rates, and the camera follows the turn inside one step
  const a = await standInside(C), b = await standInside(C);
  holdKeys(C, a, { turnL: true }, 0.7, 30); holdKeys(C, b, { turnL: true }, 0.7, 120);
  assert.ok(Math.abs(a.S.player.yaw - b.S.player.yaw) < 1e-9 && Math.abs(a.S.cam.yaw - b.S.cam.yaw) < 1e-9, 'same yaw at 30 and 120 steps/s');
});

test('F1: a first-visit wanderer that knows nothing of the triggers meets E2, E3, E4 in order within 90 s (3 seeds; phone, fold and desk)', async () => {
  const C = await load();
  // it must not read when or where the scares happen: only its own pose, the shop outline, being stuck, and the sounds that played
  const src = C.createWanderer.toString();
  for (const bad of ['HORROR', 'BACKDOOR', 'DOOR0', 'DOORS', 'SCARE_PLAN', 'wideAt', 'fired', '.done', 'history', '.e2', '.e3', '.e4', 'E2_', 'E4_', 'trigger', 'levels(']) assert.ok(!src.includes(bad), `wanderer reads ${bad}`);
  const out = [];
  for (const [name, asp] of [['desk', 16 / 9], ['phone', 390 / 844], ['fold', 880 / 920]]) for (const seed of [1, 2, 3]) {
    const sim = C.createSim({ aspect: asp }), w = C.createWanderer(sim, seed), dt = 1 / 60;
    for (let t = 0; t < 90 - 1e-9 && !sim.horror().done.E4; t += dt) w.step(dt);
    const h = sim.horror(), at = (e) => { const x = h.history.find((y) => y.e === e); return x ? x.t : null; }, T = [at('E2'), at('E3'), at('E4')];
    out.push(`${name} seed ${seed}: E2 ${T[0] && T[0].toFixed(2)} E3 ${T[1] && T[1].toFixed(2)} E4 ${T[2] && T[2].toFixed(2)} | ${w.log.filter((e) => e.phase !== 'heard').map((e) => e.phase + '@' + e.t.toFixed(1)).join(' ')}`);
    assert.ok(T.every((x) => x != null) && T[0] < T[1] && T[1] < T[2] && T[2] <= 90, `${name} seed ${seed} stuck: ${JSON.stringify({ T, wide: h.wideAt, phase: w.phase, at: [sim.S.player.x, sim.S.player.z], log: w.log.slice(-6) })}`);
  }
  console.log('F1 ' + out.join('\nF1 '));
});

test('F2: E2 fires on 4 m walked in the shop, within 3 m of the freezer wall, or 12 s in the shop, each on its own; once a visit; two panel blinks first', async () => {
  const C = await load(), E = C.HORROR.e2, back = C.STORE.z0 + C.WALL_T;
  const visit = (route, place, wait) => {
    const sim = C.createSim({ aspect: 16 / 9 });
    sim.enter('door'); run(sim, () => sim.S.mode === 'walk');
    if (place) sim.place(...place);
    if (route) sim.walkRoute(route);
    run(sim, () => sim.horror().fired.E2 != null, wait || 20, 1 / 240);
    return sim;
  };
  // 4 m walked, back and forth by the door: well before 12 s and far from the back wall
  let sim = visit([[5.0, -0.6], [5.0, -2.4], [5.0, -0.4], [5.0, -2.4]]);
  let e2 = sim.horror().e2;
  assert.deepStrictEqual(e2.why, { walk: true, wall: false, time: false }, `walk: ${JSON.stringify(e2)}`);
  assert.ok(e2.walked >= E.walk && e2.walked < E.walk + 0.02, `walked ${e2.walked.toFixed(3)} m`);
  // 3 m from the freezer wall: put inside (a jump is not walking), then 1.4 m toward the back
  sim = visit([[7.5, -5.6]], [7.5, -4.0, 0]);
  e2 = sim.horror().e2;
  assert.deepStrictEqual(e2.why, { walk: false, wall: true, time: false }, `wall: ${JSON.stringify(e2)}`);
  assert.ok(Math.abs(sim.S.player.z - back - E.wall) < 0.02, `${(sim.S.player.z - back).toFixed(3)} m from the freezer wall`);
  // 12 s just inside the door, standing still
  sim = visit([[5.0, -0.5]], null, 20);
  e2 = sim.horror().e2;
  assert.deepStrictEqual(e2.why, { walk: false, wall: false, time: true }, `time: ${JSON.stringify(e2)}`);
  assert.ok(Math.abs(e2.inside - E.time) <= C.HORROR.tick + 1e-9, `${e2.inside.toFixed(4)} s in the shop`);
  // once a visit: keep walking to the back wall for a while
  sim.walkRoute([[5.0, -6.0], [3.5, -7.0], [5.0, -1.0], [5.0, -6.5]]); run(sim, () => !sim.S.player.route, 30);
  assert.strictEqual(hist(sim, 'E2').length, 1, 'E2 once');
  // the panels: off 0-0.1 s and 0.2-0.3 s; then the freezers one by one from 0.4 s, 0.12 s apart; hums off from 0.88 s for 1.6 s
  sim = visit([[5.0, -0.6], [5.0, -2.4], [5.0, -0.4], [5.0, -2.4]]);
  const t0 = sim.horror().e2.t0, tl = [];
  for (let i = 0; i < 3 / (1 / 240); i++) { const L = sim.levels(); tl.push({ t: sim.S.t - t0, panel: L.panel, fr: L.freezer.slice(), hum: L.hum }); sim.update(1 / 240); }
  const offRuns = []; let cur = null;
  for (const x of tl) { if (x.panel === 0 && !cur) cur = [x.t, x.t]; else if (x.panel === 0) cur[1] = x.t; else if (cur) { offRuns.push(cur); cur = null; } }
  assert.strictEqual(offRuns.length, 2, `panel blinks: ${JSON.stringify(offRuns)}`);
  for (const [k, [a, b]] of offRuns.entries()) {
    assert.ok(Math.abs(a - E.blinks[k][0]) <= 1 / 240 + 1e-9 && Math.abs(b + 1 / 240 - E.blinks[k][1]) <= 1 / 240 + 1e-9, `blink ${k}: ${a.toFixed(4)}-${(b + 1 / 240).toFixed(4)}`);
    assert.ok(Math.abs(b + 1 / 240 - a - 0.1) <= 1 / 240 + 1e-9, 'each off 0.1 s');
  }
  assert.ok(tl.filter((x) => x.t < 0.3).every((x) => x.fr.every((f) => f === 1) && x.hum === 1), 'freezers and hums stay on during the blinks');
  for (let i = 4; i >= 0; i--) {
    const off = tl.find((x) => x.fr[i] === 0).t;
    assert.ok(Math.abs(off - (E.seq + (4 - i) * E.step)) <= 1 / 240 + 1e-9, `freezer ${i} off at ${off.toFixed(4)}`);
  }
  const humOff = tl.find((x) => x.hum === 0).t, humOn = tl.find((x) => x.t > humOff && x.hum === 1).t;
  assert.ok(Math.abs(humOff - C.E2_DARK) <= 1 / 240 + 1e-9 && Math.abs(humOn - humOff - E.silence) <= 1 / 240 + 1e-9, `hums off ${humOff.toFixed(3)} for ${(humOn - humOff).toFixed(3)} s`);
  assert.ok(tl.filter((x) => x.t >= C.E2_TOTAL + 1e-9).every((x) => x.panel === 1 && x.fr.every((f) => f === 1) && x.hum === 1), 'all back after');
});

test('F3: looking at the door from 3 m or more, E3 opens it in view 15 s after E2 ends: open, hold, shut, one bell', async () => {
  const C = await load();
  const sim = C.createSim({ aspect: 16 / 9 });
  sim.enter('door'); run(sim, () => sim.S.mode === 'walk');
  sim.walkRoute([[5.0, -0.6], [5.0, -2.8]]); run(sim, () => !sim.S.player.route);
  sim.lookAt(5.0, 1.3, 0.4); run(sim, () => !sim.S.player.look, 4);
  run(sim, () => sim.horror().fired.E2 != null, 20);
  const e2end = sim.horror().e2.t0 + C.E2_TOTAL;
  run(sim, () => sim.horror().fired.E3 != null, 25, 1 / 120);
  const h = sim.horror(), p = sim.S.player;
  assert.ok(Math.hypot(p.x - 5.0, p.z - 0.4) >= 3, 'at least 3 m from the door');
  const q = C.project(sim.S.cam, sim.fov(), sim.S.aspect, [5.0, C.SIDEWALK_H + 1.1, 0.4]);
  assert.ok(q.depth > 0 && q.x > 0 && q.x < 1, 'door in view');
  assert.ok(h.e3.inView === true && Math.abs(h.fired.E3 - (e2end + 15)) <= C.HORROR.tick + 1e-9, `E3 ${(h.fired.E3 - e2end).toFixed(4)} s after E2 ended, inView ${h.e3.inView}`);
  const t3 = h.fired.E3, ks = [];
  for (let i = 0; i < 360; i++) { sim.update(1 / 120); ks.push([sim.S.t - t3, sim.S.doors[0].k]); }
  const full = ks.filter(([, k]) => k === 1);
  assert.ok(full.length && Math.abs(full[full.length - 1][0] - full[0][0] - 1.2) <= 1 / 120 + 1e-9, 'holds 1.2 s');
  assert.strictEqual(ks[ks.length - 1][1], 0, 'shut again');
  assert.strictEqual(sim.horror().sounds.filter((x) => x.kind === 'bell' && x.t >= t3 - 1e-9).length, 1, 'one bell');
});

test('F4: knocks behind the wide staff door every 6 s, 20% louder each time up to 2.5x, from the staff door; none after E4, none in calm', async () => {
  const C = await load(), K = C.HORROR.knock;
  const sim = C.createSim({ aspect: 16 / 9 }), S = sim.S, h = () => sim.horror();
  sim.enter('door'); run(sim, () => S.mode === 'walk');
  sim.walkRoute(C.SCARE_PLAN.aisle); run(sim, () => !S.player.route);
  run(sim, () => h().e3 && S.t >= h().e3.closedAt, 15);
  assert.strictEqual(h().sounds.filter((x) => x.kind === 'knock').length, 0, 'no knock before the staff door goes wide');
  sim.lookAt(...C.SCARE_PLAN.behind); run(sim, () => h().wideAt != null, 6);
  const wide = h().wideAt;
  assert.ok(wide != null, 'staff door went wide');
  run(sim, () => false, 45);                                    // facing away, far from it: knocking goes on
  const kn = h().sounds.filter((x) => x.kind === 'knock');
  assert.ok(kn.length >= 7, `${kn.length} knocks in 45 s`);
  assert.ok(Math.abs(kn[0].t - wide - K.delay) < 1e-9 && kn[0].t > wide, `first knock ${(kn[0].t - wide).toFixed(3)} s after the door went wide`);
  for (let i = 1; i < kn.length; i++) {
    assert.ok(Math.abs(kn[i].t - kn[i - 1].t - 6) <= 0.2, `gap ${i}: ${(kn[i].t - kn[i - 1].t).toFixed(3)} s`);
    const want = Math.min(2.5, kn[i - 1].mult * 1.2);
    assert.ok(Math.abs(kn[i].mult - want) < 1e-9, `knock ${i}: ${kn[i].mult.toFixed(4)} (want ${want.toFixed(4)})`);
  }
  assert.ok(kn.every((x) => x.mult <= 2.5 + 1e-12) && kn.some((x) => x.mult === 2.5), `capped at 2.5: ${kn.map((x) => x.mult.toFixed(3)).join(' ')}`);
  for (const x of kn) {
    assert.ok(Math.hypot(x.pos[0] - C.BACKDOOR.cx, x.pos[2] - C.BACKDOOR.cz) <= 0.5 && x.pos[2] < C.BACKDOOR.cz, `source at ${x.pos.map((v) => v.toFixed(2))}: behind the staff door`);
  }
  // E4: no more knocks after it
  sim.lookAt(...C.SCARE_PLAN.staff); run(sim, () => !S.player.look, 4);
  sim.walkTo(...C.SCARE_PLAN.near); run(sim, () => !!h().e4, 8);
  const t4 = h().fired.E4;
  assert.ok(t4 != null, 'E4');
  run(sim, () => false, 20);
  assert.strictEqual(h().sounds.filter((x) => x.kind === 'knock' && x.t > t4).length, 0, 'no knock after E4');
  // calm: the wanderer walks 90 s and never hears a knock
  const calm = C.createSim({ aspect: 16 / 9, calm: true }), w = C.createWanderer(calm, 1);
  for (let t = 0; t < 90; t += 1 / 60) w.step(1 / 60);
  assert.strictEqual(calm.horror().sounds.filter((x) => x.kind === 'knock').length, 0, 'calm: no knock');
  assert.ok(calm.horror().sounds.some((x) => x.kind === 'bell'), 'calm: the doorbell still rings');
});
