const test = require('node:test');
const assert = require('node:assert');
const X = require('../src/core.js');
const SEEDS = [1, 2, 3, 4, 5];

test('塔身几何：腰部最细半径 10–16 米，位于塔高 40%–70%（SPEC 验收 1）', () => {
  const w = X.waist();
  assert.ok(w.r >= 10 && w.r <= 16, `腰半径 ${w.r.toFixed(1)} 米，超出 10–16`);
  assert.ok(w.t >= 0.4 && w.t <= 0.7, `腰高 ${(w.t * 100).toFixed(0)}%，超出 40%–70%`);
});

test('倾角：腰下好爬、腰上仰角更费体力', () => {
  assert.ok(X.leanMult(0, 0.2) < 1, '腰下应 <1');
  assert.ok(X.leanMult(0, 0.9) > 1.2, '腰上应 >1.2');
});

test('精准档五个种子都能通关，用时 3–7 分钟（SPEC 验收 2）', () => {
  for (const seed of SEEDS) {
    const r = X.simulate(seed, 'precise', 900);
    assert.ok(r.done, `种子 ${seed} 没爬到顶，最高 ${r.maxY.toFixed(0)} 米`);
    assert.ok(r.time >= 180 && r.time <= 420, `种子 ${seed} 用时 ${r.time.toFixed(0)} 秒，超出 180–420`);
  }
});

test('手抖档：总会掉几次，但多数能在 12 分钟内通关（SPEC 验收 3，两侧）', () => {
  let slips = 0, finished = 0;
  for (const seed of SEEDS) {
    const r = X.simulate(seed, 'clumsy', 720);
    slips += r.falls + r.gustFalls + r.pigeonHits;
    if (r.done) finished++;
  }
  assert.ok(slips >= 1, '手抖档一次都没失手，太简单');
  assert.ok(finished >= 3, `手抖档只有 ${finished}/5 通关，太难`);
});

test('莽撞档：一定会体力归零滑回，之后还能接着爬（SPEC 验收 4）', () => {
  const s = X.createState(3), pilot = X.makePilot('reckless', 3);
  let lost = 0, climbedAfter = false;
  while (s.time < 200) {
    X.step(s, pilot(s), 1 / 30);
    if (s.events.some(e => e.type === 'lost-grip')) lost = s.events.filter(e => e.type === 'lost-grip').length;
    if (lost && s.mode === 'climb' && X.y(s) > 5) climbedAfter = true;
  }
  assert.ok(lost >= 1, '莽撞档从没松手');
  assert.ok(climbedAfter, '滑回后没能接着爬');
});

test('阵风：预警 ≥1.5 秒、反应窗 ≥0.15 秒，按时抓紧能扛住、晚了会掉（SPEC 验收 5）', () => {
  const g = X.makeGusts(1, 600);
  for (const x of g) assert.ok(x.start - x.warnAt >= 1.5, '预警不足 1.5 秒');
  assert.ok(X.CFG.gust.grace >= 0.15);
  const run = (pressAt) => {
    const s = X.createState(1); s.t = X.ringT(5) + 0.3 / X.CFG.height; // mid-column, off any platform
    const first = s.gusts[0];
    s.time = first.warnAt;
    while (s.time < first.end + 0.1 && s.mode !== 'fall') X.step(s, { brace: s.time >= pressAt }, 1 / 60);
    return s.events.some(e => e.type === 'gust-fall');
  };
  const first = X.makeGusts(1, 60)[0];
  assert.equal(run(first.start - 0.2), false, '提前抓紧也掉了');
  assert.equal(run(first.start + 0.1), false, '宽限内晚 0.1 秒按也应算');
  assert.equal(run(first.start + 0.4), true, '晚 0.4 秒还没掉，窗口太宽');
  assert.equal(run(1e9), true, '不按也没掉');
});

test('鸽子：爬进有鸽子的那段会扣体力并被推回段底', () => {
  const s = X.createState(2);
  s.pigeons.clear(); s.pigeons.set('6:0', { k: 6, c: 0, hop: 99 });
  s.t = X.ringT(6);
  const st0 = s.stamina;
  for (let i = 0; i < 60 && !s.events.some(e => e.type === 'pigeon'); i++) X.step(s, { up: true }, 1 / 30);
  assert.ok(s.events.some(e => e.type === 'pigeon'), '没撞到鸽子');
  assert.ok(s.stamina < st0 - 15, '鸽子没扣体力');
  while (s.mode === 'fall') X.step(s, {}, 1 / 30);
  assert.ok(Math.abs(X.y(s) - X.ringY(6)) < 0.5, '没被推回段底');
});

test('换柱只能在环梁节点上', () => {
  const s = X.createState(1); s.t = X.ringT(4) + 3 / X.CFG.height;
  X.step(s, { right: true }, 1 / 30);
  assert.notEqual(s.mode, 'shift', '柱中段也能换柱');
  s.t = X.ringT(4);
  X.step(s, { right: true }, 1 / 30);
  assert.equal(s.mode, 'shift');
});

test('白天黑夜跟本机时钟：6–16 点白天、17–18 点黄昏、19–5 点夜晚', () => {
  const want = { 0: 'night', 5: 'night', 6: 'day', 12: 'day', 16: 'day', 17: 'dusk', 18: 'dusk', 19: 'night', 23: 'night' };
  for (const [h, m] of Object.entries(want)) assert.equal(X.timeMode(+h), m, `${h} 点应是 ${m}`);
  assert.ok(X.skyProgress('day', 1) < 0.35, '白天爬到顶也不该天黑');
  assert.ok(X.skyProgress('night', 0) >= 0.88, '夜里一开始就是夜景');
  assert.ok(X.skyProgress('dusk', 0) < 0.05 && X.skyProgress('dusk', 1) > 0.95, '黄昏模式越爬越黑');
});

test('广州时间：不管玩家在哪个时区，都按东八区算', () => {
  const c = X.gzClock(new Date('2026-11-22T12:30:00Z'));   // 广州 20:30
  assert.equal(c.hour, 20);
  assert.equal(X.gzClock(new Date('2026-11-22T22:00:00Z')).hour, 6);
});

test('塔身灯光 19:00 亮、23:00 熄；「湾区新韵」六章约 4 分 20 秒，与经典版交替', () => {
  assert.equal(X.lightsOn(18.99 * 3600), false);
  assert.equal(X.lightsOn(19 * 3600), true);
  assert.equal(X.lightsOn(22.99 * 3600), true);
  assert.equal(X.lightsOn(23 * 3600), false);
  assert.equal(X.lightsOn(1 * 3600), false, '凌晨不该亮');
  const seen = [];
  for (let s = 19 * 3600; s < 19 * 3600 + 260; s += 5) { const p = X.lightProgram(s); if (p.program === 'bay' && seen.at(-1) !== p.name) seen.push(p.name); }
  assert.deepEqual(seen, ['潮涌', '蹁跹', '聚势', '同心', '星河', '华章']);
  assert.equal(X.lightProgram(19 * 3600 + 300).program, 'classic');
  assert.equal(X.lightProgram(19 * 3600 + 530).name, '潮涌', '第二轮又从潮涌开始');
});

test('黄昏模式越爬越晚，爬到半路赶上 19:00 亮灯', () => {
  const on = f => X.lightsOn(X.virtualSec('dusk', true, 0, f));
  assert.equal(on(0), false);
  assert.equal(on(1), true);
  const firstOn = [...Array(101).keys()].map(i => i / 100).find(on);
  assert.ok(firstOn > 0.6 && firstOn < 0.85, `亮灯发生在 ${firstOn}`);
});

test('松手就歇：柱子中间松开 ↑，会去抓最近的那道横梁回体力（Alice 11-23：「体力不够的话，我要怎么歇会？」）', () => {
  const s = X.createState(6); s.pigeons.clear(); s.gusts = [];
  s.t = X.ringT(8) + 3 / X.CFG.height; s.stamina = 30;          // 横梁上方 3 米，下面那道更近
  for (let i = 0; i < 30 * 4; i++) X.step(s, {}, 1 / 30);           // 什么都不按 4 秒
  assert.ok(Math.abs(X.y(s) - X.ringY(8)) < 0.01, `没退到横梁上，现在 ${X.y(s).toFixed(1)} 米`);
  assert.ok(s.stamina > 50, `松手 4 秒体力只有 ${s.stamina.toFixed(0)}，没在歇`);
  assert.ok(s.resting, '歇着时 resting 应为 true，界面靠它亮「歇脚中」');
});

test('松手时上面的横梁更近，就往上够过去，不白退一大段', () => {
  const s = X.createState(6); s.pigeons.clear(); s.gusts = [];
  s.t = X.ringT(8) + 8.5 / X.CFG.height; s.stamina = 40;        // 离上面那道只差约 1.4 米
  for (let i = 0; i < 30 * 3; i++) X.step(s, {}, 1 / 30);
  assert.ok(Math.abs(X.y(s) - X.ringY(9)) < 0.01, `应停在上面那道横梁，现在 ${X.y(s).toFixed(1)} 米`);
  assert.ok(s.resting);
});

test('左右键和屏幕一致：按 → 去的柱子在屏幕右边（Alice 11-23：「怎么左右键相反的呢」）', () => {
  // the camera sits outside the tower looking in; screen-right = column direction × outward
  for (const [c, k] of [[0, 2], [7, 23], [15, 44]]) {
    for (const [key, sign] of [['right', 1], ['left', -1]]) {
      const s = X.createState(1); s.col = c; s.t = X.ringT(k); s.pigeons.clear(); s.gusts = [];
      X.step(s, { [key]: true }, 1 / 30);
      const to = s.anim.to, t = X.ringT(k), p = X.colPoint(c, t), q = X.colPoint(to, t), o = X.outward(c, t), e = X.colEnds(c);
      const u = [e.p1.x - e.p0.x, e.p1.y - e.p0.y, e.p1.z - e.p0.z], n = Math.hypot(...u); u.forEach((v, i) => u[i] = v / n);
      const r = [u[1] * o.z - u[2] * o.y, u[2] * o.x - u[0] * o.z, u[0] * o.y - u[1] * o.x];
      const dot = r[0] * (q.x - p.x) + r[1] * (q.y - p.y) + r[2] * (q.z - p.z);
      assert.ok(dot * sign > 0, `柱 ${c} 第 ${k} 道横梁按 ${key}，去的柱子在屏幕${dot > 0 ? '右' : '左'}边`);
    }
  }
});

test('黑鸢：预警 ≥2 秒；锁定你的柱子，扑下来前换柱就躲开，不动就被撞下去', () => {
  assert.ok(X.CFG.kite.warn >= 2.0);
  const run = (dodge) => {
    const s = X.createState(2); s.pigeons.clear(); s.gusts = [];
    const k = s.kites[0]; s.t = X.ringT(20); s.maxY = X.y(s);         // 197 米，横梁上
    s.time = k.warnAt - 0.05;
    while (s.time < k.strike + 0.3) X.step(s, dodge && s.time > k.warnAt + 0.5 && s.mode === 'climb' && !s.anim ? { left: true } : {}, 1 / 30);
    return { hit: s.events.some(e => e.type === 'kite-hit'), dodged: s.events.some(e => e.type === 'kite-dodged'), warned: s.events.some(e => e.type === 'kite-warn') };
  };
  const stay = run(false), move = run(true);
  assert.ok(stay.warned && stay.hit, '不动应被撞');
  assert.ok(move.dodged && !move.hit, '换了柱子还被撞');
});

test('黑鸢：90 米以下不扑，和阵风错开（不用同时抓紧又换柱）', () => {
  const s = X.createState(3); s.gusts = [];
  const k = s.kites[0]; s.t = X.ringT(5); s.time = k.warnAt - 0.05;
  while (s.time < k.strike + 0.3) X.step(s, {}, 1 / 30);
  assert.ok(!s.events.some(e => e.type === 'kite-warn'), '低处也扑了');
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = X.makeGusts(seed, 900), ks = X.makeKites(seed, g, 900);
    for (const kk of ks) for (const gg of g) assert.ok(kk.strike < gg.warnAt - 1 || kk.warnAt > gg.end + 1, `种子 ${seed}：黑鸢 ${kk.strike.toFixed(1)} 秒和阵风 ${gg.start.toFixed(1)} 秒撞在一起`);
  }
});

test('黑鸢难度两侧：手抖档偶尔被扑中，但多数躲得开', () => {
  let hit = 0, dodged = 0;
  for (const seed of [1, 2, 3, 4, 5]) { const r = X.simulate(seed, 'clumsy', 720); hit += r.kiteHits; dodged += r.kiteDodged; }
  assert.ok(hit >= 1, '手抖档一次没被扑中，黑鸢太好躲');
  assert.ok(hit / (hit + dodged) < 0.35, `手抖档被扑中 ${(100 * hit / (hit + dodged)).toFixed(0)}%，太难`);
});

test('歇脚台在真实位置：蜘蛛侠栈道入口 168、出口 334、旋转餐厅 423 米（离实际 ≤ 3 米）', () => {
  X.CFG.checkpoints.forEach((k, i) => assert.ok(Math.abs(X.ringY(k) - X.CFG.checkpointRealY[i]) <= 3, `${X.CFG.checkpointNames[i]} 在 ${X.ringY(k).toFixed(1)} 米`));
});
