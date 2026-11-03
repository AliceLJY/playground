const test = require('node:test');
const assert = require('node:assert/strict');
const F = require('../src/core.js');
const E = require('../src/experiment.js');
global.self = global;
require('../src/library.js');
const sample = { index: 0, category: 'events', importance: 0.5, age: 30, pinned: false, recalls: [], history: null, tier: 'peripheral' };
const library = global.FADE_LIBRARY.rows.map(([category, importance, age, count, since, tier, pinned], index) => ({
  index, category, importance, age, pinned: !!pinned, recalls: [], tier: { p: 'peripheral', w: 'working', c: 'core' }[tier],
  history: count ? { count, last: since === null ? null : Math.max(0, age - since) } : null,
}));
function schedule(state, days) {
  for (const day of days) {
    state = E.act(state, { type: 'day', day });
    state = E.act(state, { type: 'add' });
  }
  return state;
}
const reveal = (s) => E.act(s, { type: 'reveal' });

test('E1 真实操作意图：选日、放三枚、揭晓可完成，第 180 天两份结果不同', () => {
  const s = reveal(schedule(E.create(sample), [0, 60, 174]));
  assert.equal(s.phase, 'result');
  assert.deepEqual(s.days, [0, 60, 174]);
  const r = E.compare(s);
  assert.equal(r.success, true);
  assert.equal(r.yours.factor, 1);
  assert.ok(r.plain.factor < 1, '不干预样本必须真的会褪色');
  assert.equal(r.yours.count - r.plain.count, 3, '三次实际发生，不能只检测预算配置');
  assert.equal(r.yours.tier, 'working');
  assert.equal(r.plain.tier, 'peripheral');
});

test('E2 三次都太早真的未达目标，重试清空计划，仍能重新完成', () => {
  let s = reveal(schedule(E.create(sample), [0, 1, 2]));
  const r = E.compare(s);
  assert.equal(r.success, false);
  assert.ok(r.yours.factor < 1 && r.yours.factor > r.plain.factor, '应褪色但保留次数升层收益');
  s = E.act(s, { type: 'retry' });
  assert.equal(s.phase, 'plan'); assert.deepEqual(s.days, []); assert.equal(s.day, 0);
  assert.equal(E.compare(s), null);
  s = reveal(schedule(s, [0, 60, 174]));
  assert.equal(E.compare(s).success, true);
});

test('E2 不足三次、重复、越界与第四枚不推进；撤回返还一枚', () => {
  let s = E.create(sample);
  assert.equal(reveal(s).phase, 'plan');
  for (const day of [-1, 180, 1.5, NaN, Infinity, '60']) {
    s = E.act(s, { type: 'day', day });
    assert.equal(s.day, 0); assert.deepEqual(s.days, []);
    assert.match(s.message, /0–179/);
  }
  s = schedule(s, [0, 0]);
  assert.deepEqual(s.days, [0]); assert.match(s.message, /不消耗/);
  assert.equal(reveal(s).phase, 'plan');
  s = schedule(s, [60, 174, 175]);
  assert.deepEqual(s.days, [0, 60, 174]);
  assert.match(s.message, /用完/);
  s = E.act(s, { type: 'remove', day: 60 });
  assert.deepEqual(s.days, [0, 174]);
  assert.equal(reveal(s).phase, 'plan');
  s = E.act(s, { type: 'add' });
  assert.deepEqual(s.days, [0, 174, 175]);
  assert.equal(reveal(s).phase, 'result');
});

test('E3 七天边界按原记忆年龄加 180 天，非重新从写入日计龄', () => {
  const early = E.compare(reveal(schedule(E.create(sample), [0, 60, 173])));
  const late = E.compare(reveal(schedule(E.create(sample), [0, 60, 174])));
  assert.equal(early.gap, 7); assert.ok(early.yours.factor < 1);
  assert.equal(late.gap, 6); assert.equal(late.yours.factor, 1);
  assert.equal(early.plain.day, sample.age + 180);
  assert.equal(early.plain.factor, F.stateAt(sample, sample.age + 180).factor);
  assert.notEqual(early.plain.factor, F.stateAt(sample, 180).factor);
  assert.equal(early.curves[0].plain, F.stateAt(sample, sample.age).factor);
});

test('E3 每日真实样本逐日对照 core；必须实际发生召回、豁免结束和升层', () => {
  const candidates = library.filter(E.eligible);
  assert.ok(candidates.length > 100, '必须真有正在衰减的样本');
  let withHistory = 0, promoted = 0, cliffs = 0, old = 0;
  for (const m of candidates) {
    const before = JSON.stringify(m);
    const s = reveal(schedule(E.create(m), [0, 60, 174]));
    const r = E.compare(s);
    const planned = { ...m, recalls: [m.age, m.age + 60, m.age + 174] };
    assert.equal(r.curves.length, 181);
    for (const p of r.curves) {
      assert.equal(p.plain, F.stateAt(m, m.age + p.day).factor);
      assert.equal(p.yours, F.stateAt(planned, m.age + p.day).factor);
    }
    assert.equal(r.yours.count - r.plain.count, 3);
    assert.equal(r.success, true);
    assert.ok(r.curves.some((p) => p.yours > p.plain), '实际产生干预差异');
    if (m.history) withHistory++;
    if (m.age > 180) old++;
    if (r.yours.tier !== r.plain.tier) promoted++;
    if (r.curves[6].yours === 1 && r.curves[7].yours < 1) cliffs++;
    assert.equal(JSON.stringify(m), before, '推演不修改原数据');
  }
  assert.ok(withHistory > 0 && old > 0 && promoted > 0 && cliffs > 0, '历史、老样本、升层与豁免结束均需真实发生');
});

test('E4 完成或放弃后退出归空，重进不带标记；原数据与默认状态不变', () => {
  const memory = Object.freeze({ ...sample, recalls: Object.freeze([]), history: Object.freeze({ count: 2, last: 10 }) });
  const before = F.stateAt(memory, memory.age);
  for (const complete of [false, true]) {
    let s = schedule(E.create(memory), [0, 60, 174]);
    if (complete) s = reveal(s);
    E.compare(s);
    s = E.act(s, { type: 'exit' });
    assert.equal(s, null);
    assert.deepEqual(F.stateAt(memory, memory.age), before);
    assert.deepEqual(memory.recalls, []);
    assert.equal(memory.history.count, 2);
    assert.deepEqual(E.create(memory).days, []);
  }
});

test('E1 选样排除钉住、永久豁免和当天已召回；空候选不伪造数据', () => {
  for (const m of [
    { ...sample, pinned: true }, { ...sample, category: 'patterns' }, { ...sample, importance: 0.95 },
    { ...sample, history: { count: 1, last: sample.age } },
  ]) { assert.equal(E.create(m), null); assert.equal(E.choose([m]), null); }
  assert.equal(E.choose([]), null); assert.equal(E.create(null), null);
  const chosen = E.choose(library);
  assert.ok(chosen && E.eligible(chosen));
  const preferred = library.find((m) => E.eligible(m) && !m.history && F.stateAt(m, m.age).tier === 'peripheral');
  assert.equal(chosen, preferred || library.find(E.eligible));
});

test('E4 结果阶段不能偷偷继续召回或改日期，重试才解锁', () => {
  const s = reveal(schedule(E.create(sample), [0, 60, 174]));
  for (const intent of [{ type: 'add' }, { type: 'day', day: 70 }, { type: 'remove', day: 0 }]) assert.equal(E.act(s, intent), s);
  assert.equal(E.act(null, { type: 'add' }), null);
});
