// 行走规则的逻辑测试。node --test tests/*.test.cjs
const test = require('node:test'), assert = require('node:assert');
let C; test.before(async () => { C = await import('../src/core.js'); });
const near = (p, q, tol = 0.5) => Math.hypot(p.x - q.x, p.z - q.z) <= tol;

test('起点和明信片机位落脚处都站得住', () => {
  assert.equal(C.blockedBy(C.START.x, C.START.z), null);
  assert.equal(C.groundY(C.START.x, C.START.z), 0);
});
test('整圈路线走得通：石板路→踏步→前廊→屋内→曲廊→石桥→东岸→石桌→起点', () => {
  let p = { x: C.TOUR[0].x, z: C.TOUR[0].z }, maxY = 0, lastY = C.groundY(p.x, p.z);
  for (let i = 1; i < C.TOUR.length; i++) {
    const t = C.TOUR[i];
    for (let k = 0; k < 600 && !near(p, t, 0.2); k++) {
      const q = C.walkToward(p.x, p.z, t.x, t.z, 1 / 30);
      assert.ok(q.x !== p.x || q.z !== p.z, `卡在去第 ${i} 个路点的路上 (${p.x.toFixed(2)}, ${p.z.toFixed(2)})，挡住它的是 ${C.blockedBy(p.x + (t.x - p.x) * 0.05, p.z + (t.z - p.z) * 0.05)}`);
      p = q; const y = C.groundY(p.x, p.z);
      assert.ok(Math.abs(y - lastY) <= 0.3 + 1e-9, `脚下高度跳了 ${Math.abs(y - lastY).toFixed(2)}`);
      lastY = y; maxY = Math.max(maxY, y);
    }
    assert.ok(near(p, t, 0.25), `没走到第 ${i} 个路点`);
  }
  assert.ok(maxY >= C.bridgeY(0.35) - 0.05, '应当走过桥顶');
});
test('走不进荷塘：从石桌朝池心硬走十秒，停在岸上', () => {
  const p = C.walkToward(C.TABLE.x - 1.6, C.TABLE.z - 0.6, 4, 5, 10);
  assert.ok(!C.inPond(p.x, p.z), `人在水里 (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
  assert.ok(p.z > 9.8, '应当被岸线拦住');
});
test('上不了平台侧面，只能走踏步', () => {
  const side = C.pavToWorld(-C.PAV.halfL - 1.5, 1.5), into = C.pavToWorld(-2, 1.5);
  const p = C.walkToward(side.x, side.z, into.x, into.z, 6);
  assert.equal(C.groundY(p.x, p.z), 0, '从西头草地直接上了前廊');
  const foot = C.pavToWorld(-3.27, C.PAV.zFront + C.PAV.stepsLen + 0.6), top = C.pavToWorld(-3.27, 1.5);
  const q = C.walkToward(foot.x, foot.z, top.x, top.z, 8);
  assert.ok(Math.abs(C.groundY(q.x, q.z) - C.DECK_Y) < 1e-9, '走踏步应当能上前廊');
});
test('踏步半腰从侧面跨不上去（那里没有墙挡着，靠的是抬脚高度）', () => {
  const a = C.pavToWorld(C.PAV.stepsX[0] - 1.2, C.PAV.zFront + 1.0), b = C.pavToWorld(-3.27, C.PAV.zFront + 1.0);
  assert.ok(C.groundY(b.x, b.z) > 0.4, '目标点应当在踏步半腰');
  const p = C.walkToward(a.x, a.z, b.x, b.z, 6);
  assert.equal(C.groundY(p.x, p.z), 0, '从侧面直接站上了踏步半腰');
});
test('屋墙穿不过去，门洞进得去', () => {
  const a = C.pavToWorld(1.5, 1.5), b = C.pavToWorld(1.5, -1.9);
  const p = C.walkToward(a.x, a.z, b.x, b.z, 5);
  assert.ok(C.worldToPav(p.x, p.z).z > C.PAV.zWall, '穿过了正面墙');
  const d0 = C.pavToWorld(-3.0, 1.5), d1 = C.pavToWorld(-3.0, -1.2);
  const q = C.walkToward(d0.x, d0.z, d1.x, d1.z, 5);
  assert.ok(C.worldToPav(q.x, q.z).z < 0, '门洞应当进得去');
});
test('月洞门走得过，旁边的白墙走不过', () => {
  const p = C.walkToward(C.GATE.x, 4, C.GATE.x, -2.5, 6);
  assert.ok(p.z < C.WALL_Z - 1, '月洞门没走过去');
  const q = C.walkToward(C.GATE.x - 3, 4, C.GATE.x - 3, -2.5, 6);
  assert.ok(q.z > C.WALL_Z, '穿过了白墙');
});
test('乱走三个种子各两万步：不进水、不进墙、不出界、不跳高', () => {
  for (const seed of [1, 7, 42]) {
    let s = seed, rnd = () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
    let p = { x: C.START.x, z: C.START.z }, a = 0, y = 0;
    for (let i = 0; i < 20000; i++) {
      if (i % 40 === 0) a = rnd() * Math.PI * 2;
      const q = C.moveWalker(p.x, p.z, Math.cos(a) * 0.09, Math.sin(a) * 0.09), ny = C.groundY(q.x, q.z);
      assert.equal(C.blockedBy(q.x, q.z), null, `种子 ${seed} 第 ${i} 步进了 ${C.blockedBy(q.x, q.z)}`);
      assert.ok(Math.abs(ny - y) <= 0.3 + 1e-9, `种子 ${seed} 第 ${i} 步高度跳了 ${Math.abs(ny - y).toFixed(2)}`);
      p = q; y = ny;
    }
  }
});
test('石矶上三条路都通：前廊来、曲廊去北岸、石桥去东岸；石桥两头高度接得上', () => {
  assert.ok(Math.abs(C.groundY(C.BRIDGE.a.x, C.BRIDGE.a.z) - C.DECK_Y) < 0.05, '桥西头应当和廊台一样高');
  assert.ok(C.groundY(C.BRIDGE.b.x - 0.05, C.BRIDGE.b.z) < 0.1, '桥东头应当落到地面');
  const p = C.walkToward(C.ISLET.x, C.ISLET.z, C.BRIDGE.b.x + 0.6, C.BRIDGE.b.z + 0.15, 8);
  assert.ok(p.x > C.BRIDGE.b.x && C.groundY(p.x, p.z) === 0, '从石矶过桥应当走到东岸');
});
test('地名：屋内、桥上、竹院各认得出', () => {
  const r = C.pavToWorld(0, -1.9); assert.equal(C.placeName(r.x, r.z), '水榭 · 屋内');
  assert.equal(C.placeName((C.BRIDGE.a.x + C.BRIDGE.b.x) / 2, (C.BRIDGE.a.z + C.BRIDGE.b.z) / 2), '石拱桥');
  assert.equal(C.placeName(C.GATE.x, -2), '月洞门内 · 竹院');
});
