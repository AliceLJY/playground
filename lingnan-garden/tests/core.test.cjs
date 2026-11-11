// 行走规则的逻辑测试。node --test tests/*.test.cjs
const test = require('node:test'), assert = require('node:assert');
let C; test.before(async () => { C = await import('../src/core.js'); });
const near = (p, q, tol = 0.5) => Math.hypot(p.x - q.x, p.z - q.z) <= tol;

test('起点站得住，脚下是庭院地面', () => {
  assert.equal(C.blockedBy(C.START.x, C.START.z), null);
  assert.equal(C.groundY(C.START.x, C.START.z), 0);
});
test('整圈路线走得通：庭院→北墙的门→窄巷→屋后→廊子→檐廊→屋内→廊桥→八角亭→石桌→起点', () => {
  let p = { x: C.TOUR[0].x, z: C.TOUR[0].z }, maxY = 0, lastY = C.groundY(p.x, p.z); const seen = new Set();
  for (let i = 1; i < C.TOUR.length; i++) {
    const t = C.TOUR[i];
    for (let k = 0; k < 900 && !near(p, t, 0.2); k++) {
      const q = C.walkToward(p.x, p.z, t.x, t.z, 1 / 30);
      assert.ok(q.x !== p.x || q.z !== p.z, `卡在去第 ${i} 个路点的路上 (${p.x.toFixed(2)}, ${p.z.toFixed(2)})，挡住它的是 ${C.blockedBy(p.x + (t.x - p.x) * 0.05, p.z + (t.z - p.z) * 0.05)}`);
      p = q; const y = C.groundY(p.x, p.z);
      assert.ok(Math.abs(y - lastY) <= 0.3 + 1e-9, `脚下高度跳了 ${Math.abs(y - lastY).toFixed(2)}`);
      lastY = y; maxY = Math.max(maxY, y); seen.add(C.placeName(p.x, p.z));
    }
    assert.ok(near(p, t, 0.25), `没走到第 ${i} 个路点`);
  }
  assert.ok(maxY >= C.BRIDGE.peak - 0.05, '应当走过桥顶');
  for (const name of ['窄巷', '屋后', '廊子', '敞厅 · 檐廊', '敞厅 · 屋内', '廊桥', '八角亭']) assert.ok(seen.has(name), `一圈里没经过「${name}」`);
});
test('走不进长方荷池：从南岸朝池心硬走十秒，停在岸上', () => {
  const p = C.walkToward(3.0, 9.0, 3.0, 3.0, 10);
  assert.ok(!C.inPond(p.x, p.z), `人在水里 (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
  assert.ok(p.z > C.RECT.z1, '应当被池岸拦住');
});
test('走不进八角池和水道：从岸上各朝水里硬走，都停在岸上', () => {
  for (const [x, z, tx, tz] of [[13.0, 10.2, 12.6, 6.0], [9.0, 0.6, 10.6, 3.4], [7.4, 0.9, 7.4, 2.8], [7.3, 5.0, 7.3, 2.6]]) {
    const p = C.walkToward(x, z, tx, tz, 8);
    assert.ok(!C.inPond(p.x, p.z), `从 (${x}, ${z}) 走进了水里 (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
  }
});
test('上不了台基侧面，只能走踏步', () => {
  const p = C.walkToward(-7.2, -0.35, -3.0, -0.35, 6);
  assert.equal(C.groundY(p.x, p.z), 0, '从踏步旁边直接上了檐廊');
  const q = C.walkToward(-7.6, -1.5, -4.0, -1.5, 8);
  assert.ok(Math.abs(C.groundY(q.x, q.z) - C.DECK_Y) < 1e-9, '走踏步应当能上檐廊');
});
test('踏步半腰从侧面跨不上去（那里没有墙挡着，靠的是抬脚高度）', () => {
  assert.ok(C.groundY(-5.8, -1.5) > 0.3, '目标点应当在踏步高处');
  const p = C.walkToward(-5.8, 0.3, -5.8, -1.5, 6);
  assert.equal(C.groundY(p.x, p.z), 0, '从侧面直接站上了踏步高处');
});
test('檐廊临水一面有石栏：从檐廊朝荷池走，停在台上', () => {
  const p = C.walkToward(-1.0, -1.2, -1.0, 3.0, 6);
  assert.ok(p.z < C.PAV.zFront - 0.25 && Math.abs(C.groundY(p.x, p.z) - C.DECK_Y) < 1e-9, `越过了石栏 (${p.x.toFixed(2)}, ${p.z.toFixed(2)})`);
});
test('屋墙穿不过去，门洞进得去', () => {
  const p = C.walkToward(0, -1.5, 0, -4.0, 5);
  assert.ok(p.z > C.PAV.zWall, '穿过了正面墙');
  const q = C.walkToward(-4.57, -1.5, -4.57, -3.6, 5);
  assert.ok(q.z < C.PAV.zWall - 0.5, '门洞应当进得去');
});
test('庭院北墙的门走得过，旁边的砖墙走不过', () => {
  const mid = (C.DOOR.x0 + C.DOOR.x1) / 2;
  const p = C.walkToward(mid, 0.2, mid, -4.6, 6);
  assert.ok(p.z < C.LINK_Z - 1, '门没走过去');
  const q = C.walkToward(-11.2, 0.2, -11.2, -4.6, 6);
  assert.ok(q.z > C.LINK_Z, '穿过了砖墙');
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
test('廊桥：北头和廊子一样高，南头落到地面，走得过去', () => {
  const bx = (C.BRIDGE.x0 + C.BRIDGE.x1) / 2;
  assert.ok(Math.abs(C.groundY(bx, C.BRIDGE.z0 + 0.1) - C.DECK_Y) < 0.01, '桥北头应当和廊子一样高');
  assert.ok(C.groundY(bx, C.BRIDGE.z1 - 0.02) < 0.1, '桥南头应当落到地面');
  const p = C.walkToward(bx, -1.4, bx, 6.6, 8);
  assert.ok(p.z > C.BRIDGE.z1 && C.groundY(p.x, p.z) === 0, '从廊子过桥应当走到南岸');
});
test('八角亭：只有南面的石板桥进得去', () => {
  const p = C.walkToward(C.OCT.x, 9.3, C.OCT.x, C.OCT.z + 0.4, 8);
  assert.equal(C.placeName(p.x, p.z), '八角亭'); assert.ok(Math.abs(C.groundY(p.x, p.z) - C.OCT_Y) < 1e-9);
  const q = C.walkToward(C.OCT.x, C.OCT.z + 0.4, C.OCT.x + 3, C.OCT.z + 0.4, 6);
  assert.equal(C.placeName(q.x, q.z), '八角亭', '从亭子的窗穿出去了');
});
test('地名：屋内、廊桥、窄巷、壁山下各认得出', () => {
  assert.equal(C.placeName(-2.4, -4.4), '敞厅 · 屋内');
  assert.equal(C.placeName(5.9, 2.75), '廊桥');
  assert.equal(C.placeName(-7.6, -4.0), '窄巷');
  assert.equal(C.placeName(9.4, 0.6), '壁山下');
});
