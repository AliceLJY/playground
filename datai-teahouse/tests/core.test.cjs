// 分桌规则、来访记录与灰影补位：node --test tests/*.test.cjs
// 每条断言对应 README「验收」里的条目号。分桌四条（验收 1）是这件玩意的骨架，先写它们。
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/core.js');

const fill = (hall, ids) => ids.map((id) => D.seat(hall, id).table);

test('验收 1a 满桌开新桌：四位坐满第 1 桌，第五位开第 2 桌', () => {
  const h = D.createHall(4);
  assert.deepEqual(fill(h, ['a', 'b', 'c', 'd']), [1, 1, 1, 1], '前四位都该在第 1 桌');
  assert.equal(D.seat(h, 'e').table, 2, '第 1 桌满了，第五位该开第 2 桌');
  assert.deepEqual(D.tableList(h), [{ no: 1, count: 4, cap: 4 }, { no: 2, count: 1, cap: 4 }]);
});

test('验收 1b 新人进最满的未满桌：第 1 桌 2 人、第 2 桌 3 人，新人到第 2 桌', () => {
  const h = D.createHall(4);
  fill(h, ['a', 'b', 'c', 'd']);      // 第 1 桌满
  fill(h, ['e', 'f', 'g']);           // 第 2 桌 3 人
  D.leave(h, 'a'); D.leave(h, 'b');   // 第 1 桌剩 2 人
  assert.deepEqual(D.tableList(h).map((t) => t.count), [2, 3]);
  assert.equal(D.seat(h, 'x').table, 2, '该进更满的第 2 桌，不是桌号更小的第 1 桌');
  // 第 2 桌现在满了，再来一位：第 1 桌（2 人）是唯一未满桌
  assert.equal(D.seat(h, 'y').table, 1);
});

test('验收 1c 平手取最小编号', () => {
  // 先坐满三桌，再让人离席，摆出 [2, 4, 2] 的局面（直接按规则坐是摆不出来的，新人总往最满的桌去）
  const h = D.createHall(4);
  fill(h, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l']);
  D.leave(h, 'c'); D.leave(h, 'd'); D.leave(h, 'k'); D.leave(h, 'l');
  assert.deepEqual(D.tableList(h).map((t) => [t.no, t.count]), [[1, 2], [2, 4], [3, 2]]);
  assert.equal(D.seat(h, 'x').table, 1, '第 1、3 桌各 2 人，取桌号小的第 1 桌');
  // 第 1 桌被撤后，第 2、3 桌平手时取第 2 桌
  const h2 = D.createHall(4);
  fill(h2, ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l']);
  for (const id of ['a', 'b', 'c', 'd']) D.leave(h2, id);   // 第 1 桌撤掉
  D.leave(h2, 'e'); D.leave(h2, 'f'); D.leave(h2, 'i'); D.leave(h2, 'j');
  assert.deepEqual(D.tableList(h2).map((t) => [t.no, t.count]), [[2, 2], [3, 2]]);
  assert.equal(D.seat(h2, 'x').table, 2);
});

test('验收 1d 空桌删除，新桌取最小未用号', () => {
  const h = D.createHall(4);
  fill(h, ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.deepEqual(D.tableList(h).map((t) => [t.no, t.count]), [[1, 4], [2, 2]], 'f 该和 e 搭第 2 桌');
  assert.equal(D.leave(h, 'e'), 2);
  assert.equal(D.leave(h, 'f'), 2);
  assert.equal(h.tables.has(2), false, '最后一位走了，第 2 桌该撤掉');
  assert.deepEqual(D.summary(h), { tables: 1, guests: 4 });
  assert.equal(D.seat(h, 'g').table, 2, '第 1 桌满，再开桌取最小未用号 2，不是 3');
  // 撤掉中间一桌后的编号：1、2、3 都有人，撤 2，再开新桌取 2
  const h2 = D.createHall(1);
  fill(h2, ['a', 'b', 'c']);
  D.leave(h2, 'b');
  assert.deepEqual(D.tableList(h2).map((t) => t.no), [1, 3]);
  assert.equal(D.seat(h2, 'd').table, 2);
});

test('同一个人不能坐两桌；给不在座的人办离席返回 null；座位号取桌上最小空位', () => {
  const h = D.createHall(4);
  const a = D.seat(h, 'a'), b = D.seat(h, 'b'), c = D.seat(h, 'c');
  assert.deepEqual([a.seat, b.seat, c.seat], [0, 1, 2]);
  assert.throws(() => D.seat(h, 'a'), /已经坐在/);
  assert.equal(D.leave(h, 'zz'), null);
  D.leave(h, 'b');
  assert.equal(D.seat(h, 'd').seat, 1, '空出来的 1 号位该被补上');
});

test('验收 2 来访记录往返：录 → 编码 → 解码 → 同一条时间线；坏数据被丢掉；最多留 12 次', () => {
  const v = D.newVisit(1700000000000);
  assert.equal(D.recordAct(v, 3.14, 1), true);
  assert.equal(D.recordAct(v, 2.0, 2), true, '时间倒退时不丢，钉到上一条的时刻');
  assert.equal(D.recordAct(v, 9.5, 4), true);
  assert.equal(D.recordAct(v, 10, 7), false, '抿茶不是玩家动作，不该进记录');
  assert.equal(D.recordAct(v, -1, 1), false);
  D.closeVisit(v, 61.26);
  assert.deepEqual(v.acts, [[3.1, 1], [3.1, 2], [9.5, 4]]);
  assert.equal(v.dur, 61.3);
  const back = D.decodeVisits(D.encodeVisits([v]));
  assert.deepEqual(back, [v]);
  // 坏数据
  assert.deepEqual(D.decodeVisits('not json'), []);
  assert.deepEqual(D.decodeVisits(JSON.stringify([{ v: 1, at: 1, dur: 2, acts: [[0, 9]] }])), [], '动作码越界的记录整条丢');
  assert.deepEqual(D.decodeVisits(JSON.stringify([{ v: 1, at: 1, dur: 2, acts: [[5, 1], [3, 1]] }])), [], '时间不单调的记录整条丢');
  assert.deepEqual(D.decodeVisits(JSON.stringify([{ v: 1, at: 1, dur: 2, acts: [[1, 1, 'text']] }])), [], '多出来的字段（比如文字）不接受');
  // 上限
  let list = [];
  for (let i = 0; i < 15; i++) list = D.pushVisit(list, D.closeVisit(D.newVisit(i), 10));
  assert.equal(list.length, 12);
  assert.equal(list[0].at, 3, '丢的是最旧的');
  assert.equal(D.decodeVisits(JSON.stringify(Array.from({ length: 20 }, (_, i) => D.closeVisit(D.newVisit(i), 1)))).length, 12);
});

test('验收 3 幽灵与玩家走同一套分桌：6 次来访 → 第 1 桌满、第 2 桌 2 个幽灵，玩家进第 2 桌成 3 人', () => {
  const plan = D.planGhosts(D.syntheticVisits(6, 7), 4);
  assert.deepEqual(D.tableList(plan.hall).map((t) => [t.no, t.count]), [[1, 4], [2, 3]]);
  assert.equal(plan.me.table, 2, '玩家该被排到最满的未满桌');
  assert.equal(plan.ghosts.length, 6);
  for (const g of plan.ghosts) {
    assert.ok(g.end >= D.MIN_GHOST_STAY, '幽灵至少在座 45 秒');
    assert.ok(g.acts.every((a) => a[1] !== 0 && a[1] !== 6), '落座与离席不进回放动作');
  }
  // 没有历史：玩家一个人开第 1 桌
  const alone = D.planGhosts([], 4);
  assert.deepEqual(alone.me, { table: 1, seat: 0 });
  assert.equal(alone.ghosts.length, 0);
  // 幽灵按当年进门先后落座，与数组顺序无关
  const vs = D.syntheticVisits(3, 3);
  const p1 = D.planGhosts(vs, 4), p2 = D.planGhosts(vs.slice().reverse(), 4);
  assert.deepEqual(p1.ghosts.map((g) => [g.at, g.table, g.seat]), p2.ghosts.map((g) => [g.at, g.table, g.seat]));
});

test('验收 6 灰影补位：桌上别人不足 2 个就补到 2 个，够了就一个不补', () => {
  assert.equal(D.residentsFor(0), 2);
  assert.equal(D.residentsFor(1), 1);
  assert.equal(D.residentsFor(2), 0);
  assert.equal(D.residentsFor(3), 0);
});

test('灰影日程可复现、只做抿茶 / 翻报 / 斟茶、32 秒一轮且时刻单调', () => {
  const a = D.residentSchedule(11, 0), b = D.residentSchedule(11, 0), c = D.residentSchedule(11, 1);
  assert.deepEqual(a, b, '同种子同序号该给同一张表');
  assert.notDeepEqual(a.acts, c.acts, '两个灰影不该做一模一样的事');
  assert.equal(a.period, 32);
  assert.ok(a.acts.length >= 2 && a.acts.length <= 8, `一轮 ${a.acts.length} 个动作，应在 2–8 之间`);
  let last = -1;
  for (const [t, code] of a.acts) { assert.ok(t > last && t < 32); assert.ok([7, 4, 1].includes(code), `灰影不该做动作 ${code}`); last = t; }
  // 一百个种子里至少有一个灰影会给你斟茶，否则叩指永远按不了
  let pours = 0;
  for (let s = 0; s < 100; s++) for (let i = 0; i < 2; i++) pours += D.residentSchedule(s, i).acts.filter((x) => x[1] === 1).length;
  assert.ok(pours > 20, `100 个种子里灰影只斟了 ${pours} 次茶`);
});

test('dueActs 只取 (prev, tau] 之间的动作，一个动作不会被取两次', () => {
  const acts = [[1, 1], [2.5, 4], [2.5, 7], [9, 2]];
  assert.deepEqual(D.dueActs(acts, 0, 1), [[1, 1]]);
  assert.deepEqual(D.dueActs(acts, 1, 2.5), [[2.5, 4], [2.5, 7]]);
  assert.deepEqual(D.dueActs(acts, 2.5, 8.99), []);
  assert.deepEqual(D.dueActs(acts, 8.99, 100), [[9, 2]]);
});

test('验收 11 早市的钟：进门 7:00，一半 9:00，收市 11:00 后钉住；最后 45 秒是快收市', () => {
  assert.equal(D.clockAt(0), '7:00');
  assert.equal(D.clockAt(D.CLOSE / 2), '9:00');
  assert.equal(D.clockAt(D.CLOSE), '11:00');
  assert.equal(D.clockAt(D.CLOSE + 99), '11:00');
  assert.equal(D.clockAt(25), '7:20', '300 秒对 4 小时，25 秒该是 20 分钟');
  assert.deepEqual([D.phaseAt(0), D.phaseAt(D.CLOSE - 46), D.phaseAt(D.CLOSE - 45), D.phaseAt(D.CLOSE)], [0, 0, 1, 2]);
  assert.ok(D.CLOSE >= 240 && D.CLOSE <= 360, '一个早市该在 4–6 分钟真时间');
});

test('验收 12 点心车日程：可复现、首趟 10–15 秒、间隔 30–42 秒、收市前 40 秒停、每趟 3 样不重样各 1–3 件', () => {
  const a = D.cartPlan(5), b = D.cartPlan(5), c = D.cartPlan(6);
  assert.deepEqual(a, b); assert.notDeepEqual(a.map((x) => x.at), c.map((x) => x.at));
  assert.ok(a.length >= 6 && a.length <= 9, `一个早市 ${a.length} 趟车`);
  assert.ok(a[0].at >= 10 && a[0].at <= 15);
  for (let i = 1; i < a.length; i++) { const gap = a[i].at - a[i - 1].at; assert.ok(gap >= 30 && gap <= 42, `第 ${i} 趟间隔 ${gap}`); }
  assert.ok(a[a.length - 1].at < D.CLOSE - 40);
  for (const cart of a) {
    assert.equal(cart.items.length, 3);
    assert.equal(new Set(cart.items.map((x) => x.kind)).size, 3, '一趟车上三样不重样');
    for (const it of cart.items) { assert.ok(it.stock >= 1 && it.stock <= 3); assert.ok(D.DIMSUM.some((d) => d.key === it.kind)); }
    assert.ok(cart.stay >= 8 && cart.stay <= 12, '车停 8–12 秒，够看一眼再决定');
  }
  // 一个早市里总件数够一桌人分，又不至于人人都吃饱
  const total = a.reduce((s, cart) => s + cart.items.reduce((x, it) => x + it.stock, 0), 0);
  assert.ok(total >= 24 && total <= 60, `整个早市车上一共 ${total} 件`);
  // 夹：有就减一，没了返回 false
  const cart = JSON.parse(JSON.stringify(a[0])), k = cart.items[0].kind, n = cart.items[0].stock;
  for (let i = 0; i < n; i++) assert.equal(D.takeFromCart(cart, k), true);
  assert.equal(D.takeFromCart(cart, k), false, '卖完了不能再夹');
  assert.equal(D.takeFromCart(cart, 'nope'), false);
  // 灰影会跟你抢：100 趟里六成左右会伸筷子，都在车到后 1.5–6 秒
  let takes = 0;
  for (let i = 0; i < 100; i++) { const m = D.residentCartMove(1, i, 0); if (m.takes) takes++; assert.ok(m.delay >= 1.5 && m.delay <= 6); assert.ok(m.pick >= 0 && m.pick < 3); }
  assert.ok(takes >= 45 && takes <= 75, `100 趟灰影夹了 ${takes} 次`);
  assert.deepEqual(D.residentCartMove(1, 3, 1), D.residentCartMove(1, 3, 1));
});

test('验收 13 埋单：六行，茶位加点心按档算钱，时长与笼件格式；没叫茶、一笼未点也有话说', () => {
  const tally = { table: 2, companions: 3, seconds: 125, tea: 'puer', pours: 2, lids: 1, knocksGiven: 1, knocksGot: 2, pages: 3, baskets: { har: 1, bao: 2, siu: 0 }, pieces: { har: 4, bao: 5 }, leftAt: '8:40' };
  const lines = D.billLines(tally);
  assert.equal(lines.length, 6);
  assert.equal(lines[0], '第 2 桌 · 搭了 3 位');
  assert.equal(lines[1], '8:40 离席 · 坐了 2 分 05 秒');
  assert.equal(lines[2], '茶位 普洱 ¥6 · 斟了 2 巡 · 揭盖 1 次');
  assert.equal(lines[3], '虾饺 顶点 ×1、叉烧包 中点 ×2');
  assert.equal(lines[4], '3 笼 9 件 · 礼数：谢了 1 次 · 被谢 2 次 · 报纸 3 版');
  assert.deepEqual(D.billTotal(tally), { tea: 6, dim: 28 + 16 * 2, total: 66 });
  assert.equal(lines[5], '合计 ¥66');
  const none = D.billLines({ table: 1, companions: 0, seconds: 8, baskets: {}, pieces: {}, closedOut: true, leftAt: '11:00' });
  assert.equal(none[0], '第 1 桌 · 没人搭台，两位常客陪坐', '没有真人搭台时不写「搭了 0 位」');
  assert.equal(none[1], '11:00 离席 · 坐了 8 秒 · 坐到收市');
  assert.equal(none[2], '未叫茶 · 斟了 0 巡 · 揭盖 0 次');
  assert.equal(none[3], '一笼未点');
  assert.equal(none[5], '合计 ¥0');
});

test('验收 14 点心纸：十四样五档不重名、价钱随档递增、车上八样都在纸上；五种茶各有茶色', () => {
  assert.equal(D.DIMSUM.length, 14);
  assert.equal(new Set(D.DIMSUM.map((d) => d.zh)).size, 14);
  for (const d of D.DIMSUM) { assert.ok(D.TIERS[d.tier], `${d.zh} 的档位 ${d.tier} 不存在`); assert.ok(d.n >= 2 && d.n <= 4, `${d.zh} 一笼 ${d.n} 件`); }
  const prices = ['s', 'm', 'l', 'x', 't'].map((k) => D.TIERS[k].price);
  for (let i = 1; i < prices.length; i++) assert.ok(prices[i] > prices[i - 1], '小点 < 中点 < 大点 < 特点 < 顶点');
  assert.equal(new Set(D.DIMSUM.map((d) => d.tier)).size, 5, '五档都有东西');
  for (const k of D.CART_KEYS) assert.ok(D.dimsum(k), `车上的 ${k} 不在点心纸上`);
  assert.equal(D.TEAS.length, 5);
  assert.equal(new Set(D.TEAS.map((x) => x.color)).size, 5, '五种茶的茶色要分得开');
  assert.equal(D.teaOf('puer').zh, '普洱');
  assert.equal(D.teaOf('nope'), null);
});

test('验收 15 下单出品：一张纸最多三样，第一样 18–30 秒到，之后每样隔 12–25 秒，可复现', () => {
  const a = D.kitchenPlan(3, 0, ['har', 'siu', 'bao', 'feet']);
  assert.equal(a.length, 3, '勾了四样只做前三样');
  assert.deepEqual(a.map((x) => x.kind), ['har', 'siu', 'bao']);
  assert.ok(a[0].at >= 18 && a[0].at <= 30, `第一样 ${a[0].at} 秒到`);
  for (let i = 1; i < a.length; i++) { const gap = a[i].at - a[i - 1].at; assert.ok(gap >= 12 && gap <= 25, `第 ${i + 1} 样隔了 ${gap} 秒`); }
  assert.deepEqual(D.kitchenPlan(3, 0, ['har', 'siu', 'bao']), a.slice(0, 3));
  assert.notDeepEqual(D.kitchenPlan(3, 1, ['har', 'siu', 'bao']).map((x) => x.at), a.map((x) => x.at), '第二张单不该和第一张同一个时间表');
  assert.equal(D.ORDER_MAX, 3);
});

test('记录里允许「唔该」（动作码 8），仍不收抿茶（7）', () => {
  const v = D.newVisit(1);
  assert.equal(D.recordAct(v, 1, 8), true);
  assert.equal(D.recordAct(v, 2, 7), false);
  assert.equal(D.decodeVisits(JSON.stringify([D.closeVisit(v, 5)])).length, 1);
  assert.deepEqual(D.decodeVisits(JSON.stringify([{ v: 1, at: 1, dur: 2, acts: [[0, 7]] }])), []);
});
