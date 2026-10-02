// Logic checks for the walk-in exhibit. Run in this folder: node --test tests/*.test.cjs
// Each test names the SPEC.md item it guards. Rendering is checked in a browser (tools/browser-check.cjs), not here.
const test = require('node:test');
const assert = require('node:assert');
const load = () => Promise.all([import('../src/core.js'), import('../src/kit.js'), import('../src/extras.js')]);

test('data: 8 rooms, 263.1 m2 in total, 37 furniture pieces and 16 stair treads (SPEC 1)', async () => {
  const [C] = await load();
  assert.strictEqual(C.house.rooms.length, 8);
  const total = C.house.rooms.reduce((s, r) => s + r.area_m2, 0);
  assert.ok(Math.abs(total - 263.1) < 0.05, `room areas sum to ${total.toFixed(2)}, expected 263.1`);
  assert.strictEqual(C.house.furniture.filter((f) => f.type !== 'stair').length, 37);
  assert.strictEqual(C.house.furniture.filter((f) => f.type === 'stair').length, 16);
});

test('furniture: every piece maps to a builder that exists, with a plausible size (SPEC 2)', async () => {
  const [C, K, X] = await load();
  for (const style of Object.keys(C.STYLES)) {
    const specs = C.furnitureSpecs(style);
    assert.strictEqual(specs.filter((s) => !s.decor && !s.stair).length, 37);
    for (const s of specs) {
      assert.ok(s.type, `${s.id} (${s.plan}) has no builder`);
      const known = s.type.startsWith('x:') ? X.EXTRA_TYPES.includes(s.type) : K.KIT_TYPES.includes(s.type);
      assert.ok(known, `${s.id}: builder "${s.type}" does not exist`);
      if (s.stair) continue;
      assert.ok(s.w >= 250 && s.w <= 5000 && s.d >= 250 && s.d <= 3200, `${s.id} ${s.type} is ${s.w} x ${s.d} mm, outside 250-5000 x 250-3200`);
      assert.match(s.color, /^#[0-9a-f]{6}$/i, `${s.id} colour ${s.color}`);
    }
  }
});

test('furniture: kitchen counters back onto a wall and keep wall cabinets off the windows (SPEC 2)', async () => {
  const [C] = await load();
  const counters = C.furnitureSpecs('oak').filter((s) => s.plan === 'counter');
  assert.strictEqual(counters.length, 4);
  const byX = (px) => counters.find((s) => Math.abs(s.seedx - px) < 3);
  const west = byX(51), north = byX(77), south = byX(116), pen = byX(160);
  assert.deepStrictEqual([west.back, north.back, south.back, pen.back], ['w', 'n', 's', null]);
  assert.strictEqual(west.opts.upper, false, 'the west run has two windows behind it: no wall cabinets');
  assert.strictEqual(north.opts.upper, true);
  assert.strictEqual(south.opts.upper, true);
  assert.strictEqual(pen.opts.upper, false, 'the peninsula stands free: no wall cabinets');
});

test('style: oak and walnut give different colours to the same pieces (SPEC 6)', async () => {
  const [C] = await load();
  const oak = C.furnitureSpecs('oak'), walnut = C.furnitureSpecs('walnut');
  const changed = oak.filter((s, i) => !s.stair && s.color !== walnut[i].color).length;
  assert.ok(changed >= 30, `only ${changed} pieces change colour between styles, expected at least 30`);
  oak.forEach((s, i) => assert.deepStrictEqual([s.x, s.z, s.w, s.d, s.yaw], [walnut[i].x, walnut[i].z, walnut[i].w, walnut[i].d, walnut[i].yaw], `${s.id} moved between styles`));
});

test('walking: each route arrives, never touches a wall, never sticks, and its doors are open when crossed (SPEC 3)', async () => {
  const [C] = await load();
  const want = { tour: ['o20', 'o17'], family: ['o24'], kitchen: ['o16'] };
  for (const [name, doorIds] of Object.entries(want)) {
    const log = C.autopilot(name);
    assert.ok(log.done, `${name}: stopped at waypoint ${log.reached} of ${C.ROUTES[name].length} after ${log.t.toFixed(1)} s`);
    assert.ok(log.minClear >= C.WALK_R - 1e-6, `${name}: came within ${log.minClear.toFixed(3)} m of a wall, limit ${C.WALK_R}`);
    assert.ok(log.stuck < 0.5, `${name}: stood still for ${log.stuck.toFixed(2)} s`);
    assert.deepStrictEqual(log.crossings.map((c) => c.id), doorIds, `${name}: doors crossed`);
    for (const c of log.crossings) assert.ok(c.k >= 0.75, `${name}: door ${c.id} was only ${(c.k * 100).toFixed(0)}% open when crossed`);
    for (const [x, z] of log.path) { const [px, py] = C.toPx(x, z); assert.ok(!C.inWallPx(px, py), `${name}: path enters a wall at ${px.toFixed(0)},${py.toFixed(0)}`); }
  }
});

test('walking: a shut door, a window and the outer wall all stop the walker (SPEC 4)', async () => {
  const [C] = await load();
  const shut = C.newDoorState(0);
  // straight at the front door with the doors held shut
  const a = { x: C.toX(417), z: C.toZ(600) };
  for (let i = 0; i < 600; i++) C.stepWalk(a, 0, -C.WALK_SPEED, 1 / 60, shut);
  assert.ok(a.z > C.toZ(553), `walked through the shut front door to z=${a.z.toFixed(2)}`);
  // from inside every room, 10 s in each of 8 directions: still inside the footprint, never inside a wall
  for (const r of C.house.rooms) for (let k = 0; k < 8; k++) {
    const p = { x: C.toX(r.center_px[0]), z: C.toZ(r.center_px[1]) }, ang = (k * Math.PI) / 4;
    if (C.blocked(p.x, p.z, shut)) continue;                  // a room centre can sit under furniture
    for (let i = 0; i < 600; i++) C.stepWalk(p, Math.cos(ang) * C.RUN_SPEED, Math.sin(ang) * C.RUN_SPEED, 1 / 60, shut);
    const [px, py] = C.toPx(p.x, p.z);
    assert.ok(C.insideFootprintPx(px, py), `${r.name_zh} direction ${k}: ended outside the house at ${px.toFixed(0)},${py.toFixed(0)}`);
    assert.ok(!C.inWallPx(px, py), `${r.name_zh} direction ${k}: ended inside a wall`);
  }
});

test('doors: opening does not depend on frame rate, and they close again behind the walker (SPEC 3)', async () => {
  const [C] = await load();
  const i = C.DOORS.findIndex((d) => d.id === 'o20'), d = C.DOORS[i];
  const run = (dt) => { const s = C.newDoorState(0); for (let t = 0; t < 0.3 - 1e-9; t += dt) C.stepDoors(s, d.cx, d.cz + 1, dt); return s[i].k; };
  assert.ok(Math.abs(run(1 / 30) - run(1 / 120)) < 1e-6, `30 fps gives ${run(1 / 30)}, 120 fps gives ${run(1 / 120)}`);
  const s = C.newDoorState(0);
  for (let t = 0; t < 1; t += 1 / 60) C.stepDoors(s, d.cx, d.cz + 1, 1 / 60);
  assert.strictEqual(s[i].k, 1);
  for (let t = 0; t < 1; t += 1 / 60) C.stepDoors(s, d.cx, d.cz + 5, 1 / 60);
  assert.strictEqual(s[i].k, 0);
});

test('sun: the slider reads the computed winter-solstice track (SPEC 7)', async () => {
  const [C] = await load();
  for (const [min, az, alt] of C.house.sun.steps) {
    const s = C.sunAt(min);
    assert.ok(Math.abs(s.az - az) < 1e-9 && Math.abs(s.alt - alt) < 1e-9, `minute ${min}`);
  }
  const noon = C.sunAt(12 * 60 + 13);
  assert.ok(Math.abs(noon.alt - C.house.sun.noon_altitude_deg) < 0.1, `noon altitude ${noon.alt}`);
  const v = C.sunVec(noon.az, noon.alt);
  assert.ok(v[2] > 0.85 && Math.abs(v[0]) < 0.05 && v[1] > 0.4, `at noon the sun should stand in the south (+z): ${v.map((x) => x.toFixed(2))}`);
  const am = C.sunVec(...Object.values(C.sunAt(C.SUNRISE + 30))), pm = C.sunVec(...Object.values(C.sunAt(C.SUNSET - 30)));
  assert.ok(am[0] > 0.5 && pm[0] < -0.5, 'morning sun in the east (+x), evening sun in the west (-x)');
});

test('views: six presets, each aimed inside the house (SPEC 5)', async () => {
  const [C] = await load();
  assert.deepStrictEqual(C.VIEW_KEYS, ['hero', 'top', 'living', 'kitchen', 'family', 'entry']);
  for (const k of C.VIEW_KEYS) {
    const v = C.VIEWS[k], [px, py] = C.toPx(v.target[0], v.target[2]);
    assert.ok(C.insideFootprintPx(px, py), `${k} aims outside the house`);
    assert.ok(C.posePosition(v)[1] > 3, `${k} camera is below 3 m`);
  }
});
