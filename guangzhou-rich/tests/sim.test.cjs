// 花城收租佬 · 整局自动驾驶：验收条目 3（能在设定轮数内结束、钱的松紧两侧都有、样本里真发生过要测的事）。
const test = require('node:test');
const assert = require('node:assert/strict');
const M = require('../src/core.js');

const SEEDS = Array.from({ length: 60 }, (_, k) => k + 1);
const ROUNDS = M.DEFAULT_ROUNDS;
const bots = (seed) => M.simulate({ seed, humanSeat: -1 });
// 「乱选」档：每个决定随机挑（模拟不看规则的新手），用独立随机数，不碰规则随机数
const randomPick = (seed) => {
  const r = { rng: seed * 7919 + 1 };
  return M.simulate({ seed, humanSeat: -1 }, (g) => g.pending.options[Math.floor(M.rngNext(r) * g.pending.options.length)]);
};
// 「莽撞」档：能买就买、能盖就盖、塞车就付钱、总是掷两颗
const reckless = (seed) => M.simulate({ seed }, (g, i) => (i === 0 ? g.pending.options[0] : M.botChoice(g, i, M.BOT_TUNES[i])));

for (const [name, run] of [['规则机器人', bots], ['乱选', randomPick]]) {
  test(`${name}：60 个种子每局都在 ${ROUNDS} 轮内结束，回合数不超上限`, () => {
    for (const s of SEEDS) {
      const g = run(s);
      assert.equal(g.phase, 'over', `种子 ${s} 没结束`);
      assert.ok(g.round <= ROUNDS, `种子 ${s} 打到第 ${g.round} 轮`);
      assert.ok(g.stats.turns <= ROUNDS * 4, `种子 ${s} 走了 ${g.stats.turns} 回合`);
    }
  });
}

test('规则机器人：钱的松紧两侧都有——有破产的局占 10%–90%；每局都交过租；至少一半的局有人加盖', () => {
  let bk = 0, built = 0;
  for (const s of SEEDS) {
    const g = bots(s);
    if (g.stats.bankrupt > 0) bk++;
    if (g.stats.builds > 0) built++;
    assert.ok(g.stats.rentPaid > 0, `种子 ${s} 一次租都没交，地没有压力`);
  }
  const share = bk / SEEDS.length;
  assert.ok(share >= 0.1, `有破产的局只占 ${share}，钱太松`);
  assert.ok(share <= 0.9, `有破产的局占 ${share}，钱太紧`);
  assert.ok(built >= SEEDS.length / 2, `只有 ${built} 局有人加盖`);
});

test('莽撞档会输也会赢：玩家本人既不总是出局，也不总是第一；输了能重开一局正常打', () => {
  let out = 0, first = 0, lostSeed = null;
  for (const s of SEEDS) {
    const g = reckless(s);
    if (g.result.reason === 'human') { out++; lostSeed = lostSeed == null ? s : lostSeed; }
    if (g.result.ranking[0].seat === 0) first++;
  }
  assert.ok(out > 0, '一味莽撞从来不出局，没有压力');
  assert.ok(out < SEEDS.length / 2, `莽撞档出局 ${out} 次，太容易输光`);
  assert.ok(first > 0 && first < SEEDS.length * 0.75, `莽撞档拿第一 ${first} 次`);
  // 出局后用新种子开下一局：从头开始、能正常打完
  const again = M.simulate({ seed: lostSeed + 1000 });
  assert.equal(again.phase, 'over');
  assert.equal(again.players[0].cash >= 0, true);
});

test('一局的长度与决定密度：整局 40–60 回合；人每个回合开头都有一个决定（掷一颗还是两颗），开局第一回合就有', () => {
  for (const s of SEEDS) {
    const g = M.create({ seed: s });
    let dice = 0, other = 0, firstAt = null, myTurns = 0, lastTurn = -1;
    while (g.phase !== 'over') {
      if (g.turn === 0) {
        if (g.stats.turns !== lastTurn) { myTurns++; lastTurn = g.stats.turns; }
        if (firstAt == null) firstAt = g.stats.turns;
        if (g.pending.type === 'dice') dice++; else other++;
      }
      M.decide(g, M.botChoice(g, g.turn, M.BOT_TUNES[g.turn % 4]));
    }
    assert.equal(firstAt, 0, `种子 ${s}：人第一次做决定不在开局第一回合`);
    if (g.result.reason === 'rounds') assert.ok(g.stats.turns >= 40 && g.stats.turns <= 60, `种子 ${s} 走了 ${g.stats.turns} 回合`);
    assert.ok(dice >= myTurns - 2, `种子 ${s}：人走了 ${myTurns} 个回合，只有 ${dice} 次掷骰选择`);
  }
});

test('掷几颗是真决定：会看局面的选法明显赢过乱选（同样是规则机器人买地盖楼）', () => {
  let smart = 0, rand = 0;
  for (const s of SEEDS) {
    const a = M.simulate({ seed: s });
    if (a.result.ranking[0].seat === 0) smart++;
    const r = { rng: s * 31 + 7 };
    const b = M.simulate({ seed: s }, (g, i) => (i === 0 && g.pending.type === 'dice' ? g.pending.options[Math.floor(M.rngNext(r) * 2)] : M.botChoice(g, i, M.BOT_TUNES[i])));
    if (b.result.ranking[0].seat === 0) rand++;
  }
  assert.ok(smart > rand, `看局面选 ${smart} 次第一，乱选 ${rand} 次，选择不影响结果`);
});

// ---- 2026-11-24 外部试玩复核：「机器人现金停在 232 好几轮，可能困在内环塞车」「第 10–15 轮几乎无翻盘」 ----
// 数据（200 个种子、4 个规则机器人，见 VERIFICATION.md）：自己回合开头现金与上一回合相同的占 1392 / 11878 次，最长连续 6 个回合不变，没有无限绕圈；
// 第 10 轮领先者最终第一的占 125 / 200。所以按设计取舍处理，不改规则；这里留成回归守卫，免得以后改规则时把真卡死放进来。
const SEEDS200 = Array.from({ length: 200 }, (_, k) => k + 1);

// 一个座位在自己回合开头（掷骰或塞车决定）的现金序列里，「现金连续不变」的最长回合数
function longestSameCash(hist) {
  let best = 1, run = 1;
  for (let k = 1; k < hist.length; k++) { run = hist[k].cash === hist[k - 1].cash ? run + 1 : 1; best = Math.max(best, run); }
  return hist.length ? best : 0;
}

function playRecording(seed) {
  const g = M.create({ seed, humanSeat: -1 });
  const hist = g.players.map(() => []);
  let leader10 = null, jailInARow = 0, worstJailRun = 0;
  const lastKind = g.players.map(() => null);
  while (g.phase !== 'over') {
    const t = g.turn;
    if (g.round === 10 && leader10 == null && t === 0 && g.pending.type === 'dice') {
      leader10 = g.players.map((_, i) => i).filter((i) => g.players[i].alive).sort((a, b) => M.netWorth(g, b) - M.netWorth(g, a))[0];
    }
    if (g.pending.type === 'dice' || g.pending.type === 'jail') {
      hist[t].push({ cash: g.players[t].cash });
      jailInARow = g.pending.type === 'jail' && lastKind[t] === 'jail' ? jailInARow + 1 : 0;
      worstJailRun = Math.max(worstJailRun, jailInARow);
      lastKind[t] = g.pending.type;
    }
    M.decide(g, M.botChoice(g, t, M.BOT_TUNES[t % 4]));
  }
  return { g, hist, leader10, worstJailRun };
}

test('检查校准：最长「现金连续不变」的数法对手写的已知序列给对答案', () => {
  assert.equal(longestSameCash([]), 0);
  assert.equal(longestSameCash([{ cash: 5 }, { cash: 6 }, { cash: 7 }]), 1);
  assert.equal(longestSameCash([{ cash: 5 }, { cash: 232 }, { cash: 232 }, { cash: 232 }, { cash: 232 }, { cash: 9 }, { cash: 9 }]), 4);
});

test('规则机器人不卡死：200 个种子里没人连续 8 个回合现金不变；不会连着两回合都在塞车里做决定；样本里真出现过停滞', () => {
  let stalled = 0, worstJail = 0;
  for (const s of SEEDS200) {
    const { hist, worstJailRun } = playRecording(s);
    worstJail = Math.max(worstJail, worstJailRun);
    let seedHas = false;
    hist.forEach((h, i) => {
      const r = longestSameCash(h);
      if (r >= 4) seedHas = true;
      assert.ok(r <= 8, `种子 ${s} 座位 ${i} 连续 ${r} 个回合现金不变，疑似卡死`);
    });
    if (seedHas) stalled++;
  }
  assert.equal(worstJail, 0, '出现了连着两回合在塞车里做决定');
  assert.ok(stalled >= 10, `只有 ${stalled} 局出现过 4 回合以上现金不变，样本里没发生要测的事（空验）`);
});

test('翻盘两侧都有：第 10 轮的领先者最终第一的比例既不是定局也不是随机（200 个种子）', () => {
  let n = 0, wins = 0;
  for (const s of SEEDS200) {
    const { g, leader10 } = playRecording(s);
    if (leader10 == null) continue;
    n++;
    if (g.result.ranking[0].seat === leader10) wins++;
  }
  const share = wins / n;
  assert.ok(share < 0.9, `第 10 轮领先者拿第一占 ${share}，后五轮几乎没有翻盘`);
  assert.ok(share > 0.4, `第 10 轮领先者拿第一只占 ${share}，前十轮的积累不起作用`);
});
