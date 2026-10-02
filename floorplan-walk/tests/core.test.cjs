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

test('layout: the default layout has every plan piece once, each with a builder, a plausible size and a colour (SPEC 2)', async () => {
  const [C, K, X] = await load();
  const L = C.defaultLayout();
  assert.strictEqual(L.filter((i) => i.id.startsWith('f')).length, 36, 'plan pieces without the fireplace, which is built in');
  assert.strictEqual(L.filter((i) => i.id.startsWith('d')).length, 5, 'decor pieces');
  assert.ok(L.findIndex((i) => i.type !== 'rug') === 2, 'the two rugs come first so everything else is drawn over them');
  for (const style of Object.keys(C.STYLES)) for (const s of C.furnitureSpecs(style, L)) {
    const known = s.type.startsWith('x:') ? X.EXTRA_TYPES.includes(s.type) : K.KIT_TYPES.includes(s.type);
    assert.ok(known, `${s.id}: builder "${s.type}" does not exist`);
    assert.ok(s.w >= 250 && s.w <= 5000 && s.d >= 250 && s.d <= 3200, `${s.id} ${s.type} is ${s.w} x ${s.d} mm, outside 250-5000 x 250-3200`);
    assert.match(s.color, /^#[0-9a-f]{6}$/i, `${s.id} colour ${s.color}`);
  }
  assert.strictEqual(C.furnitureSpecs('oak', L).filter((s) => s.fixed).length, 1, 'the fireplace is the one fixed piece');
});

test('layout: every library entry can be built in 3D (SPEC 11)', async () => {
  const [C, K, X] = await load();
  const S = await import('../src/symbols.js');
  const types = S.LIB.flatMap((c) => c.items.map((i) => i[0]));
  assert.strictEqual(types.length, 60);
  for (const t of types) assert.ok(K.KIT_TYPES.includes(t), `library type "${t}" has no 3D builder`);
  for (const t of [...new Set(types), ...X.EXTRA_TYPES.filter((x) => x !== 'x:stair')]) {
    const svg = S.symbol(t, 1200, 800, '#cccccc');
    assert.ok(typeof svg === 'string' && svg.length > 20, `no 2D symbol for "${t}"`);
    assert.match(C.itemColor({ type: t }, 'walnut'), /^#[0-9a-f]{6}$/i, `no colour for "${t}"`);
  }
});

test('layout: kitchen counters back onto a wall and keep wall cabinets off the windows, wherever they are put (SPEC 2)', async () => {
  const [C] = await load();
  const counters = C.defaultLayout().filter((i) => i.type === 'counter');
  assert.strictEqual(counters.length, 4);
  const at = (px) => counters.find((i) => Math.abs(i.cx / C.MM - px) < 3);
  const west = at(51), north = at(76.5), south = at(116), pen = at(159.5);
  assert.deepStrictEqual([west.rot, north.rot, south.rot, pen.rot], [270, 0, 180, 180]);
  assert.strictEqual(C.counterOpts(west).upper, false, 'the west run has two windows behind it: no wall cabinets');
  assert.strictEqual(C.counterOpts(north).upper, true);
  assert.strictEqual(C.counterOpts(south).upper, true);
  assert.strictEqual(C.counterOpts(pen).upper, false, 'the peninsula stands free: no wall cabinets');
  // drag the south run into the middle of the living room: it no longer touches a wall, so the wall cabinets go
  assert.strictEqual(C.counterOpts({ ...south, cx: 500 * C.MM, cy: 300 * C.MM }).upper, false);
});

test('layout: rotation on the plan and in 3D agree, and bounding boxes follow it (SPEC 11)', async () => {
  const [C] = await load();
  const sofa = { id: 't', type: 'sofa', cx: 15000, cy: 9000, w: 2400, d: 900, rot: 90 };
  assert.deepStrictEqual(C.aabb(sofa), { hw: 450, hh: 1200 });
  const [spec] = C.furnitureSpecs('oak', [sofa]);
  assert.ok(Math.abs(spec.yaw + Math.PI / 2) < 1e-9, 'rot 90 on the plan (back to the east) is yaw -90 degrees in 3D');
  assert.ok(Math.abs(spec.rect[2] - spec.rect[0] - 0.9) < 1e-9 && Math.abs(spec.rect[3] - spec.rect[1] - 2.4) < 1e-9, `world box ${spec.rect}`);
  assert.strictEqual(C.norm(-90), 270);
});

test('snapping: a dragged piece lands flush on a wall face nearby and on the 10 mm grid elsewhere (SPEC 11)', async () => {
  const [C] = await load();
  const sofa = C.defaultLayout().find((i) => i.type === 'sofa' && i.rot === 0);      // backs onto the north wall of the living room
  const { hh } = C.aabb(sofa);
  const flush = C.snapMove(sofa, sofa.cx, sofa.cy, 600)[1];           // it stands about 0.47 m off the wall on the plan
  const wallFace = flush - hh;
  // "solid" here is a wall or a window: windows stand a few centimetres proud of the wall and count as faces too
  const solid = (xmm, ymm) => C.inWallPx(xmm / C.MM, ymm / C.MM) || C.house.openings.some((o) => o.kind === 'window' && xmm / C.MM >= o.rect_px[0] && xmm / C.MM <= o.rect_px[2] && ymm / C.MM >= o.rect_px[1] && ymm / C.MM <= o.rect_px[3]);
  const xs = [-0.9, -0.5, 0, 0.5, 0.9].map((k) => sofa.cx + k * sofa.w / 2);
  assert.ok(xs.some((x) => solid(x, wallFace - 40)), `nothing solid behind the snapped back edge at y=${wallFace.toFixed(0)}`);
  assert.ok(xs.every((x) => !solid(x, wallFace + 40)), `the snapped piece overlaps something solid at y=${wallFace.toFixed(0)}`);
  assert.strictEqual(C.snapMove(sofa, sofa.cx + 3, wallFace + hh + 90, 150)[1], flush, '90 mm off the wall snaps back onto it');
  assert.deepStrictEqual(C.snapMove(sofa, 15003, 8504, 150), [15000, 8500], 'in the open it only rounds to the grid');
  assert.deepStrictEqual(C.snapMove(sofa, sofa.cx + 3, wallFace + hh + 90, 150, false), [Math.round((sofa.cx + 3) / 10) * 10, Math.round((wallFace + hh + 90) / 10) * 10], 'wall snap off');
});

test('layout and walking: furniture moved onto the route blocks it, and moving it away clears it (SPEC 11)', async () => {
  const [C] = await load();
  const base = C.defaultLayout();
  try {
    C.setLayout(base);
    assert.ok(C.autopilot('tour').done);
    // a wardrobe pushed against the hall side of the double door: the tour's waypoint in front of that door is now inside it
    C.setLayout([...base, { id: 'w', type: 'wardrobe', cx: 348.5 * C.MM, cy: 385 * C.MM, w: 2400, d: 600, rot: 0 }]);
    const blockedRun = C.autopilot('tour', { maxT: 30 });
    assert.ok(!blockedRun.done && blockedRun.reached <= 3, `the tour should not get past the wardrobe (done ${blockedRun.done}, reached waypoint ${blockedRun.reached})`);
    assert.ok(blockedRun.crossings.every((c) => c.id !== 'o17'), 'it must not have gone through the double door');
    // chairs are not solid: one in the same spot does not stop anyone
    C.setLayout([...base, { id: 'c', type: 'chair', cx: 348.5 * C.MM, cy: 385 * C.MM, w: 450, d: 480, rot: 0 }]);
    assert.ok(C.autopilot('tour').done);
  } finally { C.setLayout(base); }
});

test('style: oak and walnut recolour the same layout without moving anything (SPEC 6)', async () => {
  const [C] = await load();
  const L = C.defaultLayout(), oak = C.furnitureSpecs('oak', L), walnut = C.furnitureSpecs('walnut', L);
  const changed = oak.filter((s, i) => s.color !== walnut[i].color).length;
  assert.ok(changed >= 30, `only ${changed} pieces change colour between styles, expected at least 30`);
  oak.forEach((s, i) => assert.deepStrictEqual([s.x, s.z, s.w, s.d, s.yaw], [walnut[i].x, walnut[i].z, walnut[i].w, walnut[i].d, walnut[i].yaw], `${s.id} moved between styles`));
  const mine = { id: 'm', type: 'sofa', cx: 1, cy: 1, w: 2000, d: 900, rot: 0, color: '#123456' };
  assert.strictEqual(C.itemColor(mine, 'oak'), '#123456'); assert.strictEqual(C.itemColor(mine, 'walnut'), '#123456', 'a colour picked by hand stays');
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
