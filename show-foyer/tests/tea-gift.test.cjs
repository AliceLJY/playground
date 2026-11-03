const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/core.js');
const me = { hall: 1, seat: 5, occupied: [9, 11] };
const tick = (s, dt, position = me) => D.teaGift(s, 'tick', { ...position, dt });
const sit = () => D.teaGift(D.newTeaGift(true), 0);

test('回礼：落座、等待、递茶意图完成；重复递茶不重复发票', () => {
  let s = D.newTeaGift(true);
  s = tick(s, 100); assert.equal(s.phase, 'door', '未落座不能开始计时');
  s = D.teaGift(s, 0); s = tick(s, 24.9);
  assert.equal(s.phase, 'waiting');
  assert.equal(D.teaGift(s, 3, me).ticket, null, '提前递茶不能发票');
  s = tick(s, .1); assert.equal(s.phase, 'invited');
  s = D.teaGift(s, 3, me); assert.equal(s.phase, 'done');
  assert.deepEqual(s.ticket, { hall: 1, seat: 5 });
  assert.strictEqual(D.teaGift(s, 3, me), s);
});

test('回礼：多种子、多座位、不同等待步长确实产生邀请与完成，不空验', () => {
  let invited = 0, completed = 0;
  for (const seed of [1, 11, 37, 91]) for (let seat = 0; seat < D.CAP; seat++) {
    const rand = D.rng(seed), position = { hall: 1, seat, occupied: [9, 11].filter(s => s !== seat) };
    let s = sit();
    while (s.phase === 'waiting' && s.elapsed < 26) s = tick(s, .01 + rand() * .09, position);
    assert.equal(s.phase, 'invited'); invited++;
    assert.ok(s.elapsed >= 25 && s.elapsed < 25.1, '首次邀请只能在 25 秒后的一个模拟步内');
    assert.ok(D.adjacent(seat, s.seat)); assert.ok(!position.occupied.includes(s.seat));
    s = tick(s, 2 + rand() * 6, position);
    assert.equal(s.ticket, null, '只等不递茶不能自动完成');
    s = D.teaGift(s, 3, position); if (s.ticket) completed++;
  }
  assert.equal(invited, 48, '样本必须真的出现 48 次邀请');
  assert.equal(completed, 48, '每个样本必须经递茶才实际完成');
});

test('回礼：早按、离席只重新计时；可再次落座完成', () => {
  let s = tick(sit(), 24);
  const early = D.teaGift(s, 3, me); assert.deepEqual(early, s, '早按无奖励也不扣等待进度');
  s = D.teaGift(s, 4); assert.deepEqual(s, D.newTeaGift(true));
  s = D.teaGift(s, 0); s = tick(s, 1); assert.equal(s.phase, 'waiting', '不能沿用离席前的 24 秒');
  s = tick(s, 24); s = D.teaGift(s, 3, me); assert.ok(s.ticket, '重试必须实际完成');
  s = D.teaGift(s, 4); assert.equal(s.ticket, null, '领奖后离席重试也要清票');
});

test('回礼：错过幕起不能再补领，无操作不能获奖；退出恢复默认空状态', () => {
  let s = tick(sit(), 30); assert.equal(s.phase, 'invited');
  s = D.teaGift(s, 'curtain'); assert.equal(s.phase, 'missed');
  assert.equal(D.teaGift(s, 3, me).ticket, null);
  assert.deepEqual(D.teaGift(s, 'exit'), D.newTeaGift(false));
  s = D.teaGift(tick(sit(), 25), 3, me);
  assert.ok(D.teaGift(s, 'curtain').ticket, '已领的票要留到结尾');
  s = D.teaGift(s, 'exit');
  assert.deepEqual(s, D.newTeaGift(false));
  for (const action of [0, 1, 2, 3, 4, 'tick', 'curtain']) assert.strictEqual(D.teaGift(s, action, { ...me, dt: 30 }), s, '默认流程不启用回礼');
});

test('回礼：非法时间不推进；没有空邻座时不重叠落座', () => {
  const s = sit();
  for (const dt of [-1, NaN, Infinity]) assert.strictEqual(tick(s, dt), s);
  const blocked = tick(s, 25, { ...me, occupied: D.ORDER });
  assert.equal(blocked.phase, 'waiting'); assert.equal(blocked.seat, null);
  const freed = tick(blocked, .1); assert.equal(freed.phase, 'invited');
});
