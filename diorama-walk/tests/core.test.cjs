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
      worst = Math.max(worst, ...C.walkBoxes(sim.S.doors).map((b) => C.R - C.boxDist(p.x, p.z, b)));
      out = Math.max(out, Math.abs(p.x) - C.WALK_BOX, Math.abs(p.z) - C.WALK_BOX);
    }
    assert.ok(worst < 1e-3, `from (${x}, ${z}) heading ${d * 45}deg: overlapped a solid by ${worst.toFixed(4)} m`);
    assert.ok(out <= 0, `from (${x}, ${z}) heading ${d * 45}deg: left the walkable square by ${out}`);
  }
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
