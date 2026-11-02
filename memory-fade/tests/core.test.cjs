// 记忆褪色 · 模型与弹簧：node --test tests/*.test.cjs
// 每条断言对应 SPEC.md「验收」里的条目号。
const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/core.js');

// 用 RecallNest 原代码（src/decay-engine.ts 的 weibullDecay，提交 42d6432）跑出来的值，2026-11-03 记下。
// 这里的公式是照抄过来的，对照表防的是抄的时候抄错、或以后改坏。
const REF = {"peripheral|0|60":1,"peripheral|30|60":0.865056,"peripheral|60|60":0.725,"peripheral|120|60":0.549802,"peripheral|365|60":0.450391,"peripheral|90|150":0.834953,"working|0|60":1,"working|30|60":0.897487,"working|60|60":0.825,"working|120|60":0.7375,"working|365|60":0.655162,"working|90|150":0.880914,"core|0|60":1,"core|30|60":0.950738,"core|60|60":0.925,"core|120|60":0.894871,"core|365|60":0.857941,"core|90|150":0.944633};

test('验收 1 衰减公式与 RecallNest 原代码一致（18 个点，误差 < 1e-6）', () => {
  for (const [k, v] of Object.entries(REF)) {
    const [tier, age, hl] = k.split('|');
    assert.ok(Math.abs(F.weibull(+age, +hl, tier) - v) < 1e-6, `${k}：算出 ${F.weibull(+age, +hl, tier)}，原代码是 ${v}`);
  }
});

test('验收 2 从没被想起：倍率随天数单调不增，始终不低于本层地板，到半衰期正好掉一半', () => {
  for (const imp of [0, 0.5, 0.85]) {
    const c = F.curve({ importance: imp, pinned: false, recalls: [] });
    const floor = F.TIERS[F.tierOf(imp, 0)].floor;
    for (let d = 1; d < c.length; d++) {
      assert.ok(c[d] <= c[d - 1] + 1e-12, `重要性 ${imp} 第 ${d} 天倍率回升了`);
      assert.ok(c[d] >= floor, `重要性 ${imp} 第 ${d} 天掉到地板 ${floor} 以下`);
    }
    assert.ok(Math.abs(c[60] - (floor + (1 - floor) / 2)) < 1e-9, '第 60 天该正好掉到地板与 1 的中点');
  }
});

test('验收 3 想起一次：之后 7 天倍率为 1，第 7 天恢复衰减且比没被想起时高', () => {
  const plain = { importance: 0.5, pinned: false, recalls: [] };
  const once = { importance: 0.5, pinned: false, recalls: [100] };
  for (let d = 100; d < 107; d++) assert.equal(F.stateAt(once, d).factor, 1, `第 ${d} 天在 7 天窗口内，应为 1`);
  const s = F.stateAt(once, 107);
  assert.ok(s.factor < 1 && s.why === 'reinforced', '第 7 天应恢复衰减');
  assert.ok(s.factor > F.stateAt(plain, 107).factor, '被想起过的应比没被想起的掉得少');
  assert.ok(F.stateAt(once, 99).factor === F.stateAt(plain, 99).factor, '想起之前的日子不受影响');
});

test('验收 4 半衰期拉长：公式值正确、越久没想起拉得越少、封顶 3 倍', () => {
  assert.equal(F.effectiveHalfLife(60, 0, 0), 60);
  assert.ok(Math.abs(F.effectiveHalfLife(60, 3, 0) - (60 + 30 * Math.log1p(3))) < 1e-9);
  assert.ok(F.effectiveHalfLife(60, 3, 90) < F.effectiveHalfLife(60, 3, 10), '距上次想起越久，加成越小');
  assert.equal(F.effectiveHalfLife(60, 1e6, 0), 180, '最多 3 倍');
});

test('验收 5 升层与豁免：3 次进工作层、10 次进核心层；钉住与重要性 0.95 永不掉分', () => {
  const r = (n) => Array.from({ length: n }, (_, i) => i * 10);
  assert.equal(F.stateAt({ importance: 0.3, pinned: false, recalls: r(2) }, 200).tier, 'peripheral');
  assert.equal(F.stateAt({ importance: 0.3, pinned: false, recalls: r(3) }, 200).tier, 'working');
  assert.equal(F.stateAt({ importance: 0.3, pinned: false, recalls: r(10) }, 200).tier, 'core');
  for (const d of [30, 180, 365]) {
    assert.equal(F.stateAt({ importance: 0.3, pinned: true, recalls: [] }, d).factor, 1);
    assert.equal(F.stateAt({ importance: 0.95, pinned: false, recalls: [] }, d).factor, 1);
  }
  // 次数凑够核心层但重要性不到 0.95：只是掉得慢，不豁免
  assert.ok(F.stateAt({ importance: 0.3, pinned: false, recalls: r(10) }, 300).factor < 1);
});

test('验收 6 弹簧：默认参数会回弹过头（10%–30%），1.5 秒内落定；减弱动效档不过冲', () => {
  const run = (ratio) => {
    const s = F.spring(170, ratio * 2 * Math.sqrt(170));
    s.x = 0; s.target = 100;
    let peak = 0, settled = null;
    for (let t = 0; t < 3; t += 1 / 60) {
      F.springStep(s, 1 / 60);
      peak = Math.max(peak, s.x);
      if (settled === null && t > 0.2 && Math.abs(s.x - 100) < 0.5 && Math.abs(s.v) < 2) settled = t;
    }
    return { overshoot: (peak - 100) / 100, settled };
  };
  const bouncy = run(0.55);
  assert.ok(bouncy.overshoot > 0.1 && bouncy.overshoot < 0.3, `过冲 ${bouncy.overshoot}`);
  assert.ok(bouncy.settled !== null && bouncy.settled < 1.5, `落定用了 ${bouncy.settled} 秒`);
  assert.ok(run(2).overshoot <= 1e-9, '减弱动效档不该过冲');
});

test('验收 6 弹簧和帧率无关：30 帧与 120 帧跑同样时长，位置差 < 0.5', () => {
  const at = (fps) => {
    const s = F.spring(170, 0.55 * 2 * Math.sqrt(170)); s.target = 100;
    for (let i = 0; i < fps * 0.4; i++) F.springStep(s, 1 / fps);
    return s.x;
  };
  assert.ok(Math.abs(at(30) - at(120)) < 0.5);
});

test('验收 5b 操作方法类（patterns）不按时间掉分；真实记忆的历史按「次数 + 最后一次」算', () => {
  assert.equal(F.stateAt({ importance: 0.2, pinned: false, recalls: [], category: 'patterns' }, 300).factor, 1);
  // 写入 100 天、被想起 3 次、最后一次在第 90 天：今天还在 7 天窗口外第 10 天，半衰期按 3 次与 10 天新鲜度拉长，且已升工作层
  const m = { importance: 0.5, pinned: false, recalls: [], category: 'events', history: { count: 3, last: 90 } };
  const s = F.stateAt(m, 100);
  assert.equal(s.tier, 'working');
  assert.ok(Math.abs(s.halfLife - F.effectiveHalfLife(60, 3, 10)) < 1e-9);
  assert.ok(Math.abs(s.factor - F.weibull(100, s.halfLife, 'working')) < 1e-12);
  assert.equal(F.stateAt(m, 95).why, 'recent');
  // 库里写明的层级高于启发式时用写明的
  assert.equal(F.stateAt({ ...m, history: null, tier: 'core' }, 100).tier, 'core');
});
