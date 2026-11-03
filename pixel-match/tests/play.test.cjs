// 时长与难度：精准档、手抖档、莽撞档跨种子跑整关。SPEC 第 5 节、第 7 节验收 8–9。
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../src/core.js');
const K = require('../src/card.js');

const REF = { vw: 390, vh: 664, dpr: 2 };
const sims = C.LEVELS.map((Lv) => K.likenessTable(C.layout(REF.vw, REF.vh, Lv.cols, Lv.rows, REF.dpr), Lv.types));
const N = 200;
function batch(kind, lv, n) {
  const out = { wins: 0, times: [], mistakes: 0, hints: 0, shuffles: 0, results: [] };
  for (let seed = 1; seed <= n; seed++) {
    const r = C.simulate(lv, seed, kind, sims[lv]);
    out.results.push(r);
    if (r.won) { out.wins++; out.times.push(r.time); }
    out.mistakes += r.mistakes; out.hints += r.hintsUsed; out.shuffles += r.autoShuffles;
  }
  out.mean = out.times.reduce((a, b) => a + b, 0) / Math.max(1, out.times.length);
  return out;
}
const human = C.LEVELS.map((_, lv) => batch('human', lv, N));

test('8 精准档：每关每个种子都通关，用时不超过时限的 10%、每对至少 0.25 秒（点得再快也要按真实点击节奏）', () => {
  for (let lv = 0; lv < C.LEVELS.length; lv++) {
    const b = batch('precise', lv, 50), Lv = C.LEVELS[lv], pairs = Lv.cols * Lv.rows / 2;
    assert.equal(b.wins, 50, `精准档第 ${lv + 1} 关没全过`);
    for (const t of b.times) {
      assert.ok(t <= Lv.time * 0.1, `精准档第 ${lv + 1} 关用了 ${t.toFixed(1)} 秒，超过时限 10%（${Lv.time * 0.1} 秒），说明有卡住`);
      assert.ok(t >= pairs * 0.25, `精准档第 ${lv + 1} 关 ${t.toFixed(1)} 秒，快得不像在点`);
    }
  }
});

test('9 手抖档（按真人误差抽样）：每关平均 55–180 秒；第 1、2 关通关率 ≥ 95%；第 5 关通关率在 70%–95% 之间', () => {
  const lines = human.map((b, lv) => `第${lv + 1}关 通关 ${b.wins}/${N} 平均 ${b.mean.toFixed(1)}s 点错 ${(b.mistakes / N).toFixed(1)}/局 提示 ${(b.hints / N).toFixed(2)}/局 死局洗牌 ${(b.shuffles / N).toFixed(2)}/局`);
  console.log(lines.join('\n'));
  human.forEach((b, lv) => assert.ok(b.mean >= 55 && b.mean <= 180, `手抖档第 ${lv + 1} 关平均 ${b.mean.toFixed(1)} 秒，不在 55–180 秒`));
  for (const lv of [0, 1]) assert.ok(human[lv].wins / N >= 0.95, `手抖档第 ${lv + 1} 关通关率 ${human[lv].wins / N} < 95%，前两关太难`);
  const last = human[4].wins / N;
  assert.ok(last >= 0.7, `手抖档第 5 关通关率 ${last} < 70%，太难`);
  assert.ok(last <= 0.95, `手抖档第 5 关通关率 ${last} > 95%，太简单（像不像没起作用，或者时限太松）`);
  assert.ok(human[4].mean > human[0].mean * 1.6, '最后一关应明显比第一关花时间');
});

test('9b 样本里真的发生过要测的事：越往后看走眼越多、用过提示、遇到过死局洗牌', () => {
  const m1 = human[0].mistakes / N, m5 = human[4].mistakes / N;
  assert.ok(m5 >= 3, `第 5 关平均每局点错 ${m5.toFixed(2)} 次，像不像根本没让人看走眼`);
  assert.ok(m5 >= m1 * 5, `第 5 关点错（${m5.toFixed(2)}）没有明显多于第 1 关（${m1.toFixed(2)}）`);
  for (let lv = 1; lv < 5; lv++) assert.ok(human[lv].mistakes >= human[lv - 1].mistakes * 0.9, `第 ${lv + 1} 关点错比第 ${lv} 关还少很多`);
  assert.ok(human.reduce((a, b) => a + b.hints, 0) > 50, '手抖档几乎没用过提示');
  assert.ok(human.reduce((a, b) => a + b.shuffles, 0) > 5, '手抖档几乎没遇到死局');
});

test('9c 莽撞档（满屏乱点）：第 3–5 关必输；输了重开是正常的一盘，能正常打完', () => {
  for (let lv = 2; lv < 5; lv++) {
    const b = batch('reckless', lv, 30);
    assert.equal(b.wins, 0, `乱点也能过第 ${lv + 1} 关`);
    for (const r of b.results.slice(0, 5)) {
      assert.equal(r.state.status, 'lost');
      const again = C.simulate(lv, r.state.seed + 1000, 'precise');
      assert.ok(again.won, `第 ${lv + 1} 关输了重开后打不完`);
    }
  }
});
