// 分厅规则、落座顺序、来访记录与回放、灰影补位、整点锣：node --test tests/*.test.cjs
// 每条断言对应 README「验收」里的条目号。
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/core.js');

const fill = (house, ids) => ids.map((id) => D.seat(house, id).hall);
const ids = (n, p) => Array.from({ length: n }, (_, i) => (p || 'u') + i);

test('验收 1a 满厅开新厅：12 位坐满第 1 厅，第 13 位开第 2 厅', () => {
  const h = D.createHouse();
  assert.deepEqual(fill(h, ids(12)), Array(12).fill(1), '前 12 位都该在第 1 厅');
  assert.equal(D.seat(h, 'x').hall, 2);
  assert.deepEqual(D.hallList(h), [{ no: 1, count: 12, cap: 12 }, { no: 2, count: 1, cap: 12 }]);
});

test('验收 1b 新人进最满的未满厅：第 1 厅 5 人、第 2 厅 9 人，新人到第 2 厅', () => {
  const h = D.createHouse();
  fill(h, ids(12, 'a'));           // 第 1 厅满
  fill(h, ids(9, 'b'));            // 第 2 厅 9 人
  for (let i = 0; i < 7; i++) D.leave(h, 'a' + i);   // 第 1 厅剩 5 人
  assert.deepEqual(D.hallList(h).map((t) => t.count), [5, 9]);
  assert.equal(D.seat(h, 'x').hall, 2, '该进更满的第 2 厅，不是厅号更小的第 1 厅');
});

test('验收 1c 平手取最小厅号；1d 空厅撤掉，新厅取最小未用号', () => {
  const h = D.createHouse(3);
  fill(h, ids(9));                 // 三个厅各 3 人
  D.leave(h, 'u0'); D.leave(h, 'u3'); D.leave(h, 'u6');   // 各剩 2 人，平手
  assert.equal(D.seat(h, 'x').hall, 1, '平手该取最小厅号');
  D.leave(h, 'u4'); D.leave(h, 'u5');                      // 第 2 厅空了
  assert.deepEqual(D.hallList(h).map((t) => t.no), [1, 3], '空厅该被撤掉');
  fill(h, ['y', 'z']);                                     // 第 1、3 厅坐满
  assert.equal(D.seat(h, 'w').hall, 2, '都满了，新厅该取最小未用的 2 号');
  assert.throws(() => D.seat(h, 'w'), /已经坐在/);
  assert.equal(D.leave(h, 'nobody'), null);
});

test('验收 1e 落座顺序：第一位坐第二排正中偏左，前几位围着它坐，不先坐角落', () => {
  const order = D.seatOrder(4, 3);
  assert.equal(order.length, 12);
  assert.equal(new Set(order).size, 12, '每个座位只出现一次');
  assert.equal(order[0], 4 + 1, '第一位该坐第二排第二座（下标 5）');
  assert.ok(order.slice(0, 4).every((i) => i % 4 === 1 || i % 4 === 2), '前四位都在中间两列');
  assert.ok([0, 3, 8, 11].every((corner) => order.indexOf(corner) >= 8), '四个角落排在最后');
  const h = D.createHouse();
  assert.equal(D.seat(h, 'a').seat, 5);
  assert.equal(D.seat(h, 'b').seat, 6);
});

test('邻座判定：同排相邻与斜对角算邻座，隔一个座、隔一排不算，自己不算', () => {
  assert.ok(D.adjacent(5, 6, 4) && D.adjacent(5, 1, 4) && D.adjacent(5, 10, 4));
  assert.ok(!D.adjacent(5, 7, 4) && !D.adjacent(0, 8, 4) && !D.adjacent(5, 5, 4));
  assert.ok(!D.adjacent(3, 4, 4), '第 1 排最右和第 2 排最左不相邻（换行不算）');
});

test('验收 2 来访记录往返：录 → 编码 → 解码 → 同一条时间线；坏数据被丢掉；最多留 12 次', () => {
  const v = D.newVisit(1700000000000);
  assert.ok(D.recordAct(v, 0, 0)); assert.ok(D.recordAct(v, 4.26, 1)); assert.ok(D.recordAct(v, 2.0, 2), '时间倒退要被抬到上一条，不丢');
  assert.ok(!D.recordAct(v, 3, 7), '7 不是观众动作'); assert.ok(!D.recordAct(v, -1, 1));
  D.closeVisit(v, 95.44);
  assert.deepEqual(v.acts, [[0, 0], [4.3, 1], [4.3, 2]]);
  assert.equal(v.dur, 95.4);
  const back = D.decodeVisits(D.encodeVisits([v, { bad: true }, { v: 1, at: 1, dur: 1, acts: [[1, 9]] }]));
  assert.deepEqual(back, [v]);
  assert.deepEqual(D.decodeVisits('not json'), []);
  assert.deepEqual(D.decodeVisits('{"a":1}'), []);
  let list = [];
  for (let i = 0; i < 15; i++) list = D.pushVisit(list, D.closeVisit(D.newVisit(i), 10));
  assert.equal(list.length, 12); assert.equal(list[0].at, 3, '留最近 12 次，最早的 3 次被挤掉');
  assert.equal(D.decodeVisits(D.encodeVisits(list)).length, 12);
});

test('验收 3 幽灵与观众走同一套分厅：12 次来访 → 第 1 厅满、观众进第 2 厅；9 次 → 观众进第 1 厅第 10 座', () => {
  const plan = D.planGhosts(D.syntheticVisits(12, 7));
  assert.equal(plan.ghosts.length, 12);
  assert.ok(plan.ghosts.every((g) => g.hall === 1));
  assert.equal(plan.me.hall, 2);
  assert.deepEqual(D.hallList(plan.house), [{ no: 1, count: 12, cap: 12 }, { no: 2, count: 1, cap: 12 }]);
  const plan2 = D.planGhosts(D.syntheticVisits(9, 5));
  assert.equal(plan2.me.hall, 1);
  assert.equal(D.hallList(plan2.house)[0].count, 10);
  assert.ok(plan2.ghosts.every((g) => g.end >= D.MIN_GHOST_STAY), '幽灵至少坐满最短时长');
  assert.ok(plan2.ghosts.every((g) => g.acts.every((a) => a[1] !== 0 && a[1] !== 4)), '落座与离席不进动作表');
  const seats = plan2.ghosts.map((g) => g.seat).concat(plan2.me.seat);
  assert.equal(new Set(seats).size, 10, '座位不重叠');
});

test('验收 6 灰影补位：厅里别人不足 3 个就补到 3 个，够了一个不补；日程只做看台 / 挪一挪、45 秒一轮且时刻单调', () => {
  assert.equal(D.residentsFor(0), 3); assert.equal(D.residentsFor(2), 1); assert.equal(D.residentsFor(3), 0); assert.equal(D.residentsFor(9), 0);
  for (let i = 0; i < 3; i++) {
    const s = D.residentSchedule(11, i), s2 = D.residentSchedule(11, i);
    assert.deepEqual(s, s2, '同种子可复现');
    assert.equal(s.period, 45);
    assert.ok(s.acts.length >= 2);
    let last = -1;
    for (const a of s.acts) { assert.ok(a[0] > last && a[0] < 45); assert.ok(a[1] === 6 || a[1] === 7, '灰影不点灯、不鼓掌、不递茶、不拍照'); last = a[0]; }
  }
  assert.notDeepEqual(D.residentSchedule(11, 0), D.residentSchedule(11, 1), '不同灰影日程不同');
});

test('dueActs 只取 (prev, tau] 之间的动作，一个动作不会被取两次', () => {
  const acts = [[1, 1], [2.5, 2], [2.5, 3], [7, 1]];
  assert.deepEqual(D.dueActs(acts, -1, 1), [[1, 1]]);
  assert.deepEqual(D.dueActs(acts, 1, 2.5), [[2.5, 2], [2.5, 3]]);
  assert.deepEqual(D.dueActs(acts, 2.5, 6.9), []);
  assert.deepEqual(D.dueActs(acts, 6.9, 100), [[7, 1]]);
});

test('验收 5 整点锣：下一声在下一个整点；跨过整点才算响；时区偏移按本地算', () => {
  const H = 3600000;
  const t = 1700000000000;                            // 2023-11-14 22:13:20 UTC
  const next = D.nextGong(t, 0);
  assert.equal(next % H, 0); assert.ok(next > t && next - t <= H);
  assert.equal(next, 1700002800000);                  // 23:00:00 UTC
  assert.ok(!D.gongCrossed(t, t + 1000, 0));
  assert.ok(D.gongCrossed(next - 500, next, 0), '恰好到整点算响');
  assert.ok(D.gongCrossed(next - 500, next + 2000, 0));
  assert.ok(!D.gongCrossed(next, next + 1000, 0), '响过一次后，同一小时内不再响');
  assert.ok(!D.gongCrossed(t + 5, t, 0), '时间不前进不响');
  const tz = -8 * H;                                  // 东八区：getTimezoneOffset = -480 分钟
  const nextLocal = D.nextGong(t, tz);
  assert.equal(((nextLocal - tz) % H + H) % H, 0, '按本地时区取整点');
  assert.equal(nextLocal, next, '整点在任何整小时时区下都是同一批时刻');
});

test('验收 5 开演倒计时：进厅按 5 分钟倒数，到点显示「开演」', () => {
  const at = 1700000000000;
  const c = D.curtainAt(at);
  assert.equal(c - at, 5 * 60000);
  assert.equal(D.countdown(at, c).text, '05:00');
  assert.equal(D.countdown(at + 61000, c).text, '03:59');
  assert.equal(D.countdown(c + 1, c).text, '开演');
  assert.equal(D.countdown(c + 1, c).left, 0);
});

test('验收 12 三遍铃：一铃开演前 3 分钟、二铃前 1 分钟、三铃开演；每遍只响一次；时间跳得多时一次补齐', () => {
  const at = 1700000000000, c = D.curtainAt(at);
  assert.deepEqual(D.BELLS, [[180, 1], [60, 2], [0, 3]]);
  assert.deepEqual(D.bellsDue(at, at + 1000, c), []);
  assert.deepEqual(D.bellsDue(c - 180500, c - 180000, c), [1], '恰好到一铃时刻算响');
  assert.deepEqual(D.bellsDue(c - 180000, c - 179000, c), [], '响过一次不再响');
  assert.deepEqual(D.bellsDue(c - 61000, c - 59000, c), [2]);
  assert.deepEqual(D.bellsDue(c - 500, c, c), [3]);
  assert.deepEqual(D.bellsDue(at, c + 5000, c), [1, 2, 3], '一次跨过三个时刻就三遍都补上');
  assert.deepEqual(D.bellsDue(c + 1, c + 9000, c), [], '开演后不再响');
});

test('验收 12 场灯：二铃前全亮，二铃起一分钟内从 1 渐暗到 0.35，开演后 0.2', () => {
  const at = 1700000000000, c = D.curtainAt(at);
  assert.equal(D.houseLight(at, c), 1);
  assert.equal(D.houseLight(c - 60001, c), 1);
  const mid = D.houseLight(c - 30000, c);
  assert.ok(mid > 0.6 && mid < 0.7, '二铃后半分钟该暗到六七成');
  assert.ok(D.houseLight(c - 1, c) < 0.36 && D.houseLight(c - 1, c) >= 0.35);
  assert.equal(D.houseLight(c, c), 0.2);
  assert.equal(D.houseLight(c + 99999, c), 0.2);
});

test('验收 13 幕后动静：五分钟内每 20–40 秒一下，第一下不早于 12 秒，三种轮着不连续重复，可复现；backstageDue 不重取', () => {
  const a = D.backstageSchedule(11), b = D.backstageSchedule(11);
  assert.deepEqual(a, b, '同种子可复现');
  assert.ok(a.length >= 6 && a.length <= 15, '五分钟该有 6 到 15 下，实际 ' + a.length);
  assert.ok(a[0][0] >= 12);
  for (let i = 0; i < a.length; i++) {
    assert.ok(['drum', 'tune', 'curtain'].includes(a[i][1]));
    assert.ok(a[i][0] < 300);
    if (i) { const gap = a[i][0] - a[i - 1][0]; assert.ok(gap >= 20 && gap <= 40, '间隔 ' + gap); assert.notEqual(a[i][1], a[i - 1][1], '不连续两下同一种'); }
  }
  assert.ok(new Set(a.map((e) => e[1])).size === 3, '三种都该出现');
  assert.notDeepEqual(D.backstageSchedule(12), a);
  assert.deepEqual(D.backstageDue(a, -1, a[0][0]), [a[0]]);
  assert.deepEqual(D.backstageDue(a, a[0][0], a[0][0] + 0.1), []);
  assert.deepEqual(D.backstageDue([[10, 'drum'], [31, 'tune']], 5, 40).map((e) => e[1]), ['drum', 'tune']);
});

test('验收 14 拍舞台（动作码 5）记进来访、能被回放；6、7 不是观众动作', () => {
  const v = D.newVisit(1);
  assert.ok(D.recordAct(v, 2, 5)); assert.ok(!D.recordAct(v, 3, 6)); assert.ok(!D.recordAct(v, 3, 7));
  assert.deepEqual(D.decodeVisits(D.encodeVisits([D.closeVisit(v, 20)]))[0].acts, [[2, 5]]);
  assert.equal(D.MAX_ACT, 5);
  assert.equal(D.ACTS.find((a) => a.code === 5).zh, '拍舞台');
  const synth = D.syntheticVisits(9, 5);
  assert.ok(synth.some((x) => x.acts.some((a) => a[1] === 5)), '合成来访里有人拍过舞台');
  const plan = D.planGhosts(synth);
  assert.ok(plan.ghosts.some((g) => g.acts.some((a) => a[1] === 5)), '拍舞台进了幽灵的动作表');
});
