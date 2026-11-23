// 花城收租佬 · 规则判定测试：node --test tests/*.test.cjs
// 验收条目 1（规则判定）与 2（带种子可复现）。状态由真实的 roll / decide 产生，只在需要固定场面时直接摆位置和产权。
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/core.js');

const idx = (name) => M.BOARD.findIndex((s) => s.name === name);
const fresh = (seed = 3) => M.create({ seed, humanSeat: -1 });
// 让当前玩家从 from 出发、骰子必然是 total：找一个能掷出 total 的 rng 状态
function forceRoll(g, total) {
  for (let r = 1; r < 200000; r++) {
    const probe = { rng: r };
    const a = Math.floor(M.rngNext(probe) * 6) + 1;
    const b = Math.floor(M.rngNext(probe) * 6) + 1;
    if (a + b === total) { g.rng = r; return; }
  }
  throw new Error('找不到能掷出 ' + total + ' 的种子');
}
function rollTo(g, target) {
  const p = g.players[g.turn];
  let d = (target - p.pos + M.BOARD.length) % M.BOARD.length;
  assert.ok(d >= 2 && d <= 12, `测试摆位：${p.pos}→${target} 掷不到`);
  forceRoll(g, d);
  return M.roll(g);
}

test('租金：0–3 层按倍率，整片无楼翻倍，盖楼后不再翻倍', () => {
  const g = fresh();
  const tower = idx('广州塔');
  g.owner[tower] = 1;
  assert.equal(M.rentFor(g, tower), Math.round(220 * M.RENT_MULT[0]), '单块无楼');
  for (let lv = 1; lv <= 3; lv++) { g.level[tower] = lv; assert.equal(M.rentFor(g, tower), Math.round(220 * M.RENT_MULT[lv]), `${lv} 层`); }
  g.level[tower] = 0;
  g.owner[idx('天河路')] = 1;
  g.owner[idx('珠江新城')] = 1;
  assert.equal(M.rentFor(g, tower), Math.round(220 * M.RENT_MULT[0]) * 2, '整片天河在手、无楼应翻倍');
  g.level[tower] = 1;
  assert.equal(M.rentFor(g, tower), Math.round(220 * M.RENT_MULT[1]), '有楼按楼层算，不再翻倍');
});

test('交租：真实掷骰走到别人的地，钱从走的人转给地主', () => {
  const g = fresh();
  const sq = idx('北京路');
  g.owner[sq] = 2;
  const before0 = g.players[0].cash, before2 = g.players[2].cash;
  rollTo(g, sq);
  const rent = Math.round(100 * M.RENT_MULT[0]);
  assert.equal(g.players[0].cash, before0 - rent);
  assert.equal(g.players[2].cash, before2 + rent);
  assert.equal(g.stats.rentPaid, rent);
  assert.equal(g.turn, 1, '交完租回合结束');
});

test('买地与加盖：空地给出买/不买，买了扣钱记产权；走回自己的地可以加盖', () => {
  const g = fresh();
  const sq = idx('恩宁路');
  rollTo(g, sq);
  assert.equal(g.phase, 'decide');
  assert.deepEqual(M.legal(g), ['buy', 'skip']);
  M.decide(g, 'buy');
  assert.equal(g.owner[sq], 0);
  assert.equal(g.players[0].cash, M.START_CASH - 60);
  // 让 0 号再走回恩宁路
  g.turn = 0; g.phase = 'roll'; g.players[0].pos = 22;
  const cash = g.players[0].cash;
  rollTo(g, sq); // 22→3 经过出发
  assert.equal(g.pending.type, 'build');
  M.decide(g, 'build');
  assert.equal(g.level[sq], 1);
  assert.equal(g.players[0].cash, cash + M.GO_SALARY - M.buildCost(sq), '过出发领钱、加盖扣一半标价');
});

test('不合法的选择被拒绝，状态不变', () => {
  const g = fresh();
  rollTo(g, idx('恩宁路'));
  assert.throws(() => M.decide(g, 'build'), /不合法/);
  assert.throws(() => M.roll(g), /不是掷骰/);
  assert.equal(g.phase, 'decide');
});

test('塞车：坐错地铁送去内环；下回合可付 50 走（照常掷骰）或等一轮', () => {
  const g = fresh();
  g.players[0].pos = 10;
  rollTo(g, 18);
  assert.equal(g.players[0].pos, M.JAIL);
  assert.equal(g.players[0].stuck, true);
  // 其他人走完一圈回到 0
  while (g.turn !== 0) { if (g.phase === 'roll') M.roll(g); else M.decide(g, g.pending.options[1] || g.pending.options[0]); }
  assert.equal(g.pending.type, 'jail');
  assert.deepEqual(g.pending.options, ['pay', 'wait']);
  const cash = g.players[0].cash;
  M.decide(g, 'pay');
  assert.equal(g.players[0].cash, cash - M.JAIL_FEE);
  assert.equal(g.phase, 'roll', '付钱后这一回合照常掷骰');
  assert.equal(g.turn, 0);

  const h = fresh(9);
  h.players[0].stuck = true; h.players[0].pos = M.JAIL;
  h.phase = 'roll';
  h.turn = 3; h.players[3].pos = 0; forceRoll(h, 2); M.roll(h); // 3 号走完，轮到 0 号
  if (h.phase === 'decide' && h.turn === 3) M.decide(h, 'skip');
  assert.equal(h.turn, 0);
  assert.equal(h.pending.type, 'jail');
  M.decide(h, 'wait');
  assert.equal(h.turn, 1, '等一轮：这回合直接结束');
  assert.equal(h.players[0].stuck, false, '下回合照常');
  assert.equal(h.players[0].pos, M.JAIL);
});

test('钱不够：先卖楼再卖地凑钱，凑够就不破产', () => {
  const g = fresh();
  const a = idx('长隆'), b = idx('上下九'), target = idx('广州塔');
  g.owner[a] = 0; g.level[a] = 2; g.owner[b] = 0;
  g.owner[target] = 1; // 租 = 220×0.6 = 132
  g.players[0].cash = 100;
  g.players[0].pos = 14;
  rollTo(g, target);
  assert.equal(g.players[0].alive, true);
  assert.ok(g.players[0].cash >= 0);
  assert.equal(g.level[a], 1, '卖一层（回 70）就够，只卖一层');
  assert.equal(g.owner[a], 0, '卖楼够了就不卖地');
  assert.ok(g.log.some((e) => e.t === 'sell'));
});

test('破产：凑不够就出局，地全收回，债主只收到能付的钱；剩一个人时结束', () => {
  const g = M.create({ seed: 5, seats: [{ name: 'A' }, { name: 'B' }], humanSeat: -1 });
  const t = idx('长隆');
  g.owner[t] = 1; g.level[t] = 3; // 租 1960
  const own = idx('上下九');
  g.owner[own] = 0;
  g.players[0].cash = 100;
  g.players[0].pos = 20;
  const b0 = g.players[1].cash;
  rollTo(g, t);
  assert.equal(g.players[0].alive, false);
  assert.equal(g.owner[own], null, '破产者的地收回');
  assert.equal(g.players[1].cash, b0 + 100 + 30, '债主收到现金 100 加卖地的 30');
  assert.equal(g.phase, 'over');
  assert.equal(g.result.reason, 'last');
  assert.equal(g.result.ranking[0].seat, 1);
});

test('玩家本人破产时整局结束', () => {
  const g = M.create({ seed: 5 });
  const t = idx('长隆');
  g.owner[t] = 2; g.level[t] = 3;
  g.players[0].cash = 10; g.players[0].pos = 20;
  rollTo(g, t);
  assert.equal(g.phase, 'over');
  assert.equal(g.result.reason, 'human');
  assert.equal(g.result.ranking[3].seat, 0, '出局的排最后');
});

test('回合上限：到第 N 轮结束按身家排名（现金 + 地价 + 楼的造价）', () => {
  const g = M.simulate({ seed: 11, maxRounds: 3, humanSeat: -1 });
  assert.equal(g.phase, 'over');
  assert.equal(g.result.reason, 'rounds');
  assert.equal(g.round, 3);
  assert.equal(g.stats.turns, 12, '4 人 × 3 轮');
  const worth = g.result.ranking.map((r) => r.worth);
  assert.deepEqual(worth, worth.slice().sort((a, b) => b - a), '按身家从高到低');
  for (const r of g.result.ranking) {
    let w = g.players[r.seat].cash;
    M.BOARD.forEach((s, k) => { if (g.owner[k] === r.seat) w += s.price + g.level[k] * M.buildCost(k); });
    assert.equal(r.worth, w);
  }
});

test('机会卡：14 张都是原创文案，抽完重洗，每张都能结算不抛错', () => {
  assert.equal(M.CARDS.length, 14);
  for (const c of M.CARDS) assert.doesNotMatch(c.text, /Monopoly|大富翁|Community Chest|Go to Jail/i);
  const g = fresh(21);
  let drawn = 0;
  for (let n = 0; n < 40; n++) {
    g.turn = 0; g.phase = 'roll'; g.pending = null; g.players[0].stuck = false; g.players[0].alive = true; g.players[0].cash = 800;
    g.players[0].pos = 0;
    rollTo(g, 2);
    drawn++;
    if (g.phase === 'decide' && g.turn === 0) M.decide(g, g.pending.options[0]);
  }
  assert.equal(g.log.filter((e) => e.t === 'chance').length, drawn);
});

test('带种子可复现：同种子同选择全程逐字一致，换种子不同', () => {
  const a = M.simulate({ seed: 42, humanSeat: -1 });
  const b = M.simulate({ seed: 42, humanSeat: -1 });
  const c = M.simulate({ seed: 43, humanSeat: -1 });
  assert.deepEqual(a.log.map((e) => e.text), b.log.map((e) => e.text));
  assert.deepEqual(M.snapshot(a), M.snapshot(b));
  assert.notDeepEqual(a.log.map((e) => e.text), c.log.map((e) => e.text));
});

test('棋盘原创：24 格、13 块地分 5 片、地名都是广州街区，不用 Monopoly 的格名', () => {
  assert.equal(M.BOARD.length, 24);
  const props = M.BOARD.filter((s) => s.kind === 'prop');
  assert.equal(props.length, 13);
  assert.deepEqual([...new Set(props.map((s) => s.area))].sort(), Object.keys(M.AREAS).sort());
  for (const s of M.BOARD) assert.doesNotMatch(s.name, /Boardwalk|Park Place|Free Parking|Jail|Chance|Community/i);
});
