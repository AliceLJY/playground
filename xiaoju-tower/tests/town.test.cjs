// 第二章「下塔进城」：真实街区网格、跑与骑单车、碰撞、打卡赛、三花姐。数字对照 SPEC.md「第二章」一节。
const test = require('node:test');
const assert = require('node:assert');
const T = require('../src/town-core.js');
global.window = {}; require('../data/town.js');
const town = window.XJT_TOWN;
const G = T.decodeGrid(town), nav = T.buildNav(G);
const SEEDS16 = Array.from({ length: 16 }, (_, i) => i + 1);
const { SURF } = T;
const count = v => G.cells.reduce((n, c) => n + (c === v), 0);

test('网格来自真实 OSM：有江面、有楼、有海心桥，三个打卡点都走得到（SPEC 第二章 1）', () => {
  assert.strictEqual(G.cells.length, G.W * G.H);
  assert.ok(count(SURF.WATER) / G.cells.length > 0.2, '珠江应占画面两成以上');
  assert.ok(count(SURF.BUILDING) / G.cells.length > 0.1, '楼太少');
  assert.ok(count(SURF.FOOTBRIDGE) > 1000, '海心桥（OSM bicycle=no）应在网格里');
  assert.ok(T.canRun(T.surf(G, town.start.x, town.start.z)), '起点要站得住');
  assert.deepStrictEqual(town.stops.map(s => s.label), ['海心沙', '西塔', '东塔']);
  for (let i = 0; i < 3; i++) {
    const t = T.timeTo(G, nav, i, town.start.x, town.start.z, 0);
    assert.ok(t < 400, `从塔脚跑到${town.stops[i].label}要 ${t.toFixed(0)} 秒，应 < 400（走不到就是 1e9）`);
  }
});

test('过江只有海心桥，而且桥上不能骑车：只骑车、不许下车时从南岸到不了北岸', () => {
  // ride-only reachability: flood the bike layer from the start; no cell north of the river may be reached
  const seen = new Uint8Array(G.W * G.H), q = [];
  const sx = Math.round(town.start.x - G.X0), sz = Math.round(town.start.z - G.Z0);
  q.push(sz * G.W + sx); seen[sz * G.W + sx] = 1;
  let northest = 1e9;
  while (q.length) {
    const id = q.pop(), x = id % G.W, z = (id - x) / G.W; northest = Math.min(northest, z + G.Z0);
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= G.W || nz >= G.H) continue;
      const k = nz * G.W + nx; if (seen[k] || !T.canRide(G.cells[k])) continue; seen[k] = 1; q.push(k);
    }
  }
  assert.ok(northest > -400, `骑车最北到了 z=${northest.toFixed(0)}，过了江（海心沙在 z≈-570）`);
  // and riding straight onto the bridge is refused with a message
  const s = T.createTown(G, 1); s.riding = true;
  let near = null;
  for (let r = 0; r < 600 && !near; r++) for (let x = -600; x < 0 && !near; x++) { const z = -60 - r; if (T.surf(G, x, z) === SURF.FOOTBRIDGE && T.surf(G, x, z + 3) !== SURF.FOOTBRIDGE && T.canRide(T.surf(G, x, z + 4))) near = { x, z: z + 4 }; }
  assert.ok(near, '找不到海心桥南端');
  s.x = near.x; s.z = near.z; s.h = 0;
  let nag = 0;
  for (let i = 0; i < 90; i++) { T.stepTown(G, s, { up: true }, 1 / 30); if (s.events.some(e => e.type === 'no-bike')) nag++; assert.ok(T.surf(G, s.x, s.z) !== SURF.FOOTBRIDGE, '骑上了海心桥'); }
  assert.ok(nag > 0, '骑车撞到海心桥应提示「桥上不能骑车」');
});

test('跑和骑手感不同：骑车路上更快但起步慢、转弯大、松手还会溜；跑步起步快、松手就停、草地上比车快', () => {
  const road = (() => { for (const r of town.roads) if (r.k === 'secondary') for (let i = 0; i < r.p.length; i += 2) { const x = r.p[i], z = r.p[i + 1]; if (T.surf(G, x, z) === SURF.ROAD && !T.blockedAt(G, x, z, true)) return { x, z }; } })();
  const runner = T.createTown(G, 1), rider = T.createTown(G, 1); rider.riding = true;
  for (const s of [runner, rider]) { s.x = road.x; s.z = road.z; }
  const to90 = s => { let t = 0; const top = T.topSpeed(G, s); s.speed = 0; while (s.speed < top * 0.9 && t < 10) { s.speed += Math.min(top - s.speed, (s.riding ? T.TCFG.bike.accel : T.TCFG.run.accel) / 30); t += 1 / 30; } return t; };
  assert.ok(T.topSpeed(G, rider) >= T.topSpeed(G, runner) * 1.4, `路上骑车 ${T.topSpeed(G, rider)} m/s 应比跑 ${T.topSpeed(G, runner)} 快 40% 以上`);
  const ta = to90(runner), tb = to90(rider);
  assert.ok(ta < 0.5 && tb > 2, `跑步到 90% 速度 ${ta.toFixed(2)} 秒应 <0.5，骑车 ${tb.toFixed(2)} 秒应 >2`);
  // turning rate at cruising speed (real step: hold ← and read the heading change over 0.5 s)
  const turnRate = s => { s.speed = T.topSpeed(G, s); s.h = 0; const h0 = s.h; for (let i = 0; i < 15; i++) T.stepTown(G, s, { up: true, left: true }, 1 / 30); return Math.abs(T.wrapAngle(s.h - h0)) / 0.5; };
  const r1 = turnRate(Object.assign(T.createTown(G, 1), { x: road.x, z: road.z })), r2 = turnRate(Object.assign(T.createTown(G, 1), { x: road.x, z: road.z, riding: true }));
  assert.ok(r1 > r2 * 1.4, `全速转向：跑 ${r1.toFixed(2)} rad/s 应比骑车 ${r2.toFixed(2)} 快 40% 以上`);
  // let go at top speed: how far you roll
  const roll = s => { s.speed = T.topSpeed(G, s); s.h = 0; const x0 = s.x, z0 = s.z; for (let i = 0; i < 90; i++) T.stepTown(G, s, {}, 1 / 30); return Math.hypot(s.x - x0, s.z - z0); };
  const a = roll(Object.assign(T.createTown(G, 1), { x: road.x, z: road.z })), b = roll(Object.assign(T.createTown(G, 1), { x: road.x, z: road.z, riding: true }));
  assert.ok(a < 3 && b > 15, `松手 3 秒：跑步滑 ${a.toFixed(1)} 米应 <3，骑车溜 ${b.toFixed(1)} 米应 >15`);
  // grass: running beats the bike
  const g = { x: 0, z: 0 }; let found = false;
  for (let z = -900; z < 200 && !found; z += 3) for (let x = -600; x < 600 && !found; x += 3) if (T.surf(G, x, z) === SURF.GREEN && T.surf(G, x + 2, z) === SURF.GREEN && T.surf(G, x, z + 2) === SURF.GREEN) { g.x = x; g.z = z; found = true; }
  const gr = Object.assign(T.createTown(G, 1), g), gb = Object.assign(T.createTown(G, 1), g, { riding: true });
  assert.ok(T.topSpeed(G, gr) > T.topSpeed(G, gb), '草地上跑应比骑车快');
});

test('单车只能在单车点扫，扫车 2 秒、锁车 0.6 秒；按 E 的意图在别处什么也不做', () => {
  const s = T.createTown(G, 1);
  assert.strictEqual(T.actionAt(G, s), null, '起点不在单车点上');
  T.stepTown(G, s, { act: true }, 1 / 30); assert.strictEqual(s.mode, 'go');
  const d = town.docks[0]; s.x = d.x; s.z = d.z;
  assert.strictEqual(T.actionAt(G, s), 'scan');
  T.stepTown(G, s, { act: true }, 1 / 30); assert.strictEqual(s.mode, 'scan');
  let t = 0; while (s.mode === 'scan') { T.stepTown(G, s, {}, 1 / 30); t += 1 / 30; }
  assert.ok(s.riding && Math.abs(t - T.TCFG.scanTime) < 0.1, `扫车用了 ${t.toFixed(2)} 秒`);
  T.stepTown(G, s, { act: true }, 1 / 30); t = 0; while (s.mode === 'lock') { T.stepTown(G, s, {}, 1 / 30); t += 1 / 30; }
  assert.ok(!s.riding && Math.abs(t - T.TCFG.lockTime) < 0.1, `锁车用了 ${t.toFixed(2)} 秒`);
});

test('不穿模：乱按 3 分钟（跑、骑各一遍，含江边和楼群），身体从没进过楼或水里', () => {
  for (const riding of [false, true]) for (const seed of [1, 2, 3]) {
    const rng = T.PROFILES && ((a) => () => (a = (a * 1103515245 + 12345) % 2147483648) / 2147483648)(seed * 97 + (riding ? 1 : 0));
    const s = T.createTown(G, seed); s.riding = riding;
    const d = town.docks[(seed * 7 + (riding ? 3 : 0)) % town.docks.length]; s.x = d.x; s.z = d.z;   // start on a pavement among the blocks
    let inp = {}, until = 0, inside = 0, moved = 0, lx = s.x, lz = s.z;
    while (s.time < 180) {
      if (s.time >= until) { inp = { up: rng() < 0.8, down: rng() < 0.1, left: rng() < 0.3, right: rng() < 0.3 }; until = s.time + 0.3 + rng() * 2; }
      T.stepTown(G, s, inp, 1 / 30);
      if (T.blockedAt(G, s.x, s.z, s.riding)) inside++;
      moved += Math.hypot(s.x - lx, s.z - lz); lx = s.x; lz = s.z;
    }
    assert.strictEqual(inside, 0, `${riding ? '骑' : '跑'} 种子 ${seed} 有 ${inside} 帧在楼或水里`);
    assert.ok(moved > 200, `${riding ? '骑' : '跑'} 种子 ${seed} 只动了 ${moved.toFixed(0)} 米，疑似卡死`);
    assert.ok(s.hits > 30, `${riding ? '骑' : '跑'} 种子 ${seed} 只碰到墙 ${s.hits || 0} 帧，乱按应该常撞（防空验）`);
  }
});

test('左右键和新机位一致：按 ← 角色朝屏幕左边转，按 → 朝右（机位在身后、看向前方）', () => {
  for (const h0 of [0, 1.3, -2.2, 3.0]) {
    const R = T.screenRight(h0), f0 = T.fwd(h0);
    // the follow camera looks along the heading with +y up: its right vector is forward × up
    const camRight = { x: -f0.z, z: f0.x };
    assert.ok(Math.abs(R.x - camRight.x) < 1e-9 && Math.abs(R.z - camRight.z) < 1e-9);
    for (const [key, sign] of [['left', -1], ['right', 1]]) {
      const s = T.createTown(G, 1); s.h = h0;
      for (let i = 0; i < 6; i++) T.stepTown(G, s, { [key]: true }, 1 / 30);
      const f = T.fwd(s.h), side = f.x * R.x + f.z * R.z;
      assert.ok(side * sign > 0.05, `朝向 ${h0}，按 ${key} 后前方在屏幕${side > 0 ? '右' : '左'}边`);
    }
  }
});

test('打卡赛：精准档三处都打到、用时 3–7 分钟，骑车比全程跑快至少 10 秒；整局没有卡死窗口', () => {
  const p = T.simulateTown(G, nav, 1, 'precise'), w = T.simulateTown(G, nav, 1, 'walker');
  assert.ok(p.done && p.stamps.length === 3, '精准档没打完三处');
  assert.ok(p.time >= 180 && p.time <= 420, `精准档用时 ${p.time.toFixed(0)} 秒，超出 180–420`);
  assert.ok(p.rides >= 1 && p.bikeDist > 500, '精准档应该骑过车');
  assert.ok(w.done && w.time - p.time >= 10, `骑车只比全程跑快 ${(w.time - p.time).toFixed(1)} 秒，单车不算一个选择`);
  for (const seed of SEEDS16.slice(0, 8)) for (const prof of ['precise', 'clumsy']) {
    const r = T.simulateTown(G, nav, seed, prof);
    assert.ok(r.done, `${prof} 种子 ${seed} 15 分钟没打完`);
    assert.strictEqual(r.stalls, 0, `${prof} 种子 ${seed} 有 ${r.stalls} 个卡死窗口（按着键 3 秒没动）`);
    assert.strictEqual(r.inside, 0, `${prof} 种子 ${seed} 穿进了楼或水`);
  }
});

test('跟三花姐比，两侧写在手抖档上：16 局手抖档赢 4–12 局；精准档至少赢 12 局，且赢得比手抖档多（SPEC 第二章 5）', () => {
  // 2026-11-23 Duet 真人两局（电脑 11:18、手机 6:25）都比手抖档慢，三花姐因此放慢；最接近真人的是手抖档，两侧断言放在它身上
  let wp = 0, wc = 0, skipped = 0, beatClumsy = 0, posedLong = 0;
  for (const seed of SEEDS16) {
    const a = T.simulateTownRace(G, nav, seed, 'precise'), b = T.simulateTownRace(G, nav, seed, 'clumsy');
    if (a.won) wp++; if (b.won) wc++;
    assert.ok(a.rival.done && a.rival.stamps.length === 3, `种子 ${seed} 三花姐没打完`);
    if (a.rival.rides === 0) skipped++;
    if (b.rival.time < b.player.time) beatClumsy++;
    if (a.rival.time > 420) posedLong++;
  }
  assert.ok(wc >= 4 && wc <= 12, `手抖档赢 ${wc}/16`);
  assert.ok(wp >= 12 && wp > wc, `精准档赢 ${wp}/16，手抖档 ${wc}`);
  // the sample really contains both kinds of day (guards against an empty pass)
  assert.ok(skipped >= 1 && beatClumsy >= 4, `三花姐不骑车 ${skipped} 局、赢手抖档 ${beatClumsy} 局，两样都要有`);
});

// ---------- Duet 试玩反馈（2026-11-23）先写成检查 ----------
// 在 Duet 卡住的三处（海心沙内湖东头、岛上海心桥头护栏、西塔旁楼角），朝 16 个方向按住 ↑ 2 秒：
// 只要不是几乎正对着墙（与墙法线夹角 > 35°），就得顺着墙滑出去至少 3 米。
function wallNormal(x, z, riding) {
  let nx = 0, nz = 0;
  for (let k = 0; k < 32; k++) { const a = k / 32 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a); if (!(riding ? T.canRide : T.canRun)(T.surf(G, x + c * 2.2, z + s * 2.2))) { nx -= c; nz -= s; } }
  const L = Math.hypot(nx, nz); return L ? { x: nx / L, z: nz / L } : null;
}
function freeNear(x, z, riding) {
  for (let r = 0; r < 6; r += 0.25) for (let k = 0; k < 24; k++) { const a = k / 24 * Math.PI * 2, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (!T.blockedAt(G, px, pz, riding) && wallNormal(px, pz, riding)) return { x: px, z: pz }; }
}
test('Duet 卡住的三处：贴着锯齿岸边和楼角按 ↑，不是正对墙就能滑出去（跑、骑都算）', () => {
  const spots = [[191, -547], [191, -573], [-350, -518], [-185, -1065]];
  const stuck = [];
  for (const [sx, sz] of spots) for (const riding of [false, true]) {
    const p = freeNear(sx, sz, riding); if (!p) continue;
    const n = wallNormal(p.x, p.z, riding);
    for (let k = 0; k < 16; k++) {
      const h = k / 16 * Math.PI * 2, f = T.fwd(h), into = -(f.x * n.x + f.z * n.z);   // 1 = straight into the wall
      if (into > Math.cos(35 * Math.PI / 180)) continue;
      const s = T.createTown(G, 1); s.x = p.x; s.z = p.z; s.h = h; s.riding = riding;
      for (let i = 0; i < 60; i++) T.stepTown(G, s, { up: true }, 1 / 30);
      const d = Math.hypot(s.x - p.x, s.z - p.z);
      if (d < 3) stuck.push(`${sx},${sz} ${riding ? '骑' : '跑'} 朝向${(h * 180 / Math.PI).toFixed(0)}° 只走了 ${d.toFixed(2)} 米`);
    }
  }
  assert.deepStrictEqual(stuck, [], stuck.slice(0, 6).join('；'));
});

test('单车松手不会溜出几十米：全速松手 6 秒内停住、溜不到 45 米；停住后按 ↓ 能慢慢往后推', () => {
  const road = (() => { for (const r of town.roads) if (r.k === 'secondary') for (let i = 0; i + 3 < r.p.length; i += 2) { const x = r.p[i], z = r.p[i + 1], L = Math.hypot(r.p[i + 2] - x, r.p[i + 3] - z); if (L > 80 && !T.blockedAt(G, x, z, true)) return { x, z, h: Math.atan2(r.p[i + 2] - x, -(r.p[i + 3] - z)) }; } })();
  const s = Object.assign(T.createTown(G, 1), road, { riding: true }); s.speed = T.topSpeed(G, s);
  const x0 = s.x, z0 = s.z; let t = 0;
  while (s.speed > 0.05 && t < 20) { T.stepTown(G, s, {}, 1 / 30); t += 1 / 30; }
  const d = Math.hypot(s.x - x0, s.z - z0);
  assert.ok(t <= 6 && d < 45, `松手 ${t.toFixed(1)} 秒才停、溜了 ${d.toFixed(0)} 米`);
  const x1 = s.x, z1 = s.z;
  for (let i = 0; i < 60; i++) T.stepTown(G, s, { down: true }, 1 / 30);
  const back = (s.x - x1) * -T.fwd(s.h).x + (s.z - z1) * -T.fwd(s.h).z;
  assert.ok(back > 1, `骑车停住后按 ↓ 2 秒只往后挪了 ${back.toFixed(2)} 米`);
});

test('骑车照着路线走，草地上骑不到 1.5 秒（Duet 第三轮：西塔↔东塔、海心沙→西塔几段都在草坪上骑了十几秒）', () => {
  const st = town.stops, bad = [];
  for (const [a, b] of [[1, 2], [2, 1], [0, 2], [0, 1]]) {
    const s = T.createTown(G, 1); s.x = st[a].x; s.z = st[a].z; s.riding = true; s.stamps = [0, 1, 2].filter(k => k !== b);
    const p = T.makePilot(G, nav, 'precise', 1); let green = 0;
    while (!s.done && s.time < 200) { T.stepTown(G, s, p(s), 1 / 30); if (s.riding && T.surf(G, s.x, s.z) === T.SURF.GREEN) green += 1 / 30; }
    if (green > 1.5) bad.push(`${st[a].label}→${st[b].label} 草地上骑了 ${green.toFixed(1)} 秒`);
  }
  assert.deepStrictEqual(bad, [], bad.join('；'));
});
