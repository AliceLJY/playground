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
