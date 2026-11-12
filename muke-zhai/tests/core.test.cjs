// 穆柯寨 · 逻辑测试：node --test tests/*.test.cjs
// 每条对应 README_CN.md「验收」里的条目号。数值阈值取自规格，不是照着实现填的。
const test = require('node:test');
const assert = require('node:assert/strict');
const { sample, CLIPS, M } = require('./bots.cjs');

const SEEDS = [1, 2, 3, 4, 5];
const runs = {};
const get = (skill, seed) => (runs[skill + seed] = runs[skill + seed] || sample(skill, seed));

test('1 帧数据：三个人的动作齐全，命中帧与停住帧在范围内', () => {
  const need = {
    guiying: ['idle', 'walk', 'attack', 'jump', 'hurt', 'guard', 'victory'],
    zongbao: ['idle', 'walk', 'attack', 'guard', 'hurt', 'victory'],
    mengliang: ['idle', 'walk', 'attack', 'hurt', 'defeat'],
  };
  for (const who of Object.keys(need)) {
    for (const act of need[who]) {
      const c = CLIPS[who][act];
      assert.ok(c, `缺 ${who}.${act}`);
      assert.ok(c.count <= c.cols * 99 && c.cell[0] > 0, `${who}.${act} 格子非法`);
      if (act === 'attack') assert.ok(c.hit > 0 && c.hit < c.count, `${who} 命中帧超范围`);
      if (['guard', 'victory', 'defeat'].includes(act)) assert.ok(c.hold < c.count, `${who}.${act} 停住帧超范围`);
    }
  }
});

test('2 预警提前量：每一次敌人出招，从预警开始到命中不少于 0.45 秒（真实模拟取样）', () => {
  let n = 0, min = 1e9;
  for (const skill of ['precise', 'sloppy']) {
    for (const seed of SEEDS) {
      const { g } = get(skill, seed);
      for (const w of g.stats.warnToHit) { n++; min = Math.min(min, w); }
    }
  }
  assert.ok(n >= 40, `样本太少只有 ${n} 次出招，断言可能是空验`);
  assert.ok(min >= 450, `最短预警 ${min.toFixed(0)} 毫秒，少于规格的 450`);
});

test('2b 规格常量之外：孟良预警 0.6 秒，杨宗保 0.38 秒，都由真实出招量得', () => {
  const { g } = get('precise', 1);
  assert.ok(g.stats.warnToHit.some((w) => w > 900), '孟良一档的预警应接近 1 秒（预警 + 蓄力）');
  assert.ok(g.stats.warnToHit.some((w) => w > 650 && w < 800), '杨宗保一档应在 0.65–0.8 秒');
});

test('3 精准档与手抖档：5 个种子都能打完全程，时长 60–240 秒', () => {
  for (const skill of ['precise', 'sloppy']) {
    for (const seed of SEEDS) {
      const r = get(skill, seed);
      assert.ok(r.done, `${skill} 种子 ${seed} 没打到结尾（用时 ${(r.ms / 1000).toFixed(0)} 秒，阶段 ${r.g.phase}）`);
      const s = r.ms / 1000;
      assert.ok(s >= 60 && s <= 240, `${skill} 种子 ${seed} 用时 ${s.toFixed(1)} 秒，不在 60–240`);
    }
  }
});

test('4 难度两侧：手抖档会被打到（不是全赢）、但不会气掉光（不是输光）', () => {
  let taken = 0;
  for (const seed of SEEDS) {
    const { g } = get('sloppy', seed);
    taken += g.stats.hitsTaken;
    assert.equal(g.stats.retries, 0, `手抖档种子 ${seed} 气掉光重来了，太难`);
  }
  assert.ok(taken >= 3, `手抖档五个种子一共只被打中 ${taken} 次，太简单`);
});

test('5 样本里真发生过架开和对枪（否则前面的全绿可能是空验）', () => {
  let parries = 0, clashes = 0, blocks = 0, dodges = 0;
  for (const skill of ['precise', 'sloppy']) {
    for (const seed of SEEDS) {
      const s = get(skill, seed).g.stats;
      parries += s.parries; clashes += s.clashes; blocks += s.blocks; dodges += s.dodges;
    }
  }
  assert.ok(parries >= 10, `架开只发生 ${parries} 次`);
  assert.ok(clashes >= 3, `对枪只发生 ${clashes} 次`);
  assert.ok(blocks >= 5, `挡下只发生 ${blocks} 次`);
  assert.ok(dodges >= 1, `闪避躲过只发生 ${dodges} 次`);
});

test('6 莽撞档：只会乱按出枪，气会掉光，出「再来」，重来后能恢复正常', () => {
  for (const seed of [1, 2, 3]) {
    const g = M.create(CLIPS, { seed });
    const d = M.makeDriver('reckless', seed);
    let sawRetry = false, ms = 0, stageAtRetry = 0;
    while (ms < 120000 && g.stats.retries < 1) {
      d.think(g); M.advance(g, M.STEP); ms += M.STEP;
      if (g.phase === 'retry') { sawRetry = true; stageAtRetry = g.stage; assert.equal(g.qi, 0, '出「再来」时气应为 0'); }
    }
    assert.ok(sawRetry, `莽撞档种子 ${seed} 120 秒内没把气打光`);
    assert.equal(g.stats.retries, 1);
    assert.equal(g.qi, M.QI_MAX, '重来后气应回满');
    assert.equal(g.phase, 'play');
    assert.equal(g.stage, stageAtRetry, '重打当前这一场');
    if (stageAtRetry === 1) assert.equal(g.helmets, 3, '重来后金盔应回满');
    else assert.equal(g.meter, 0, '重来后心动应清零');
    // 重来之后精准驾驶仍能把这一场打完
    const p = M.makeDriver('precise', seed);
    ms = 0;
    const cleared = () => (stageAtRetry === 1 ? g.stage === 2 : g.phase === 'end');
    while (ms < 150000 && !cleared()) { p.think(g); M.advance(g, M.STEP); ms += M.STEP; }
    assert.ok(cleared(), `重来后 150 秒内没能打过这一场（种子 ${seed}，第 ${stageAtRetry} 场）`);
  }
});

test('7 出招时不滑出舞台，吸附滑步不冲过头', () => {
  let swings = 0;
  for (const skill of ['precise', 'sloppy']) {
    for (const seed of SEEDS) {
      const { g, log } = get(skill, seed);
      swings += g.stats.swings;
      assert.equal(log.slideOut, 0, `${skill} 种子 ${seed} 出招时有 ${log.slideOut} 步越出舞台`);
      assert.ok(g.stats.minX >= M.MIN_X - 0.5 && g.stats.maxX <= M.MAX_X + 0.5,
        `站位出了舞台：${g.stats.minX.toFixed(1)}–${g.stats.maxX.toFixed(1)}`);
      assert.ok(g.stats.maxSlide <= 110.5, `吸附滑步 ${g.stats.maxSlide.toFixed(0)} 像素，超过 110 上限`);
    }
  }
  assert.ok(swings > 100, `出招样本只有 ${swings} 次`);
});

test('8 没有卡死窗口：按着方向键却既不动也不推进', () => {
  for (const skill of ['precise', 'sloppy']) {
    for (const seed of SEEDS) assert.equal(get(skill, seed).log.stuck, 0, `${skill} 种子 ${seed} 出现卡死`);
  }
});

test('9 输入响应：按出枪到出手帧不超过 0.24 秒；按架枪当步就进入架枪', () => {
  const g = M.create(CLIPS, { seed: 9 });
  g.e.cool = 99999;
  M.input(g, 'attack', true); M.input(g, 'attack', false);
  let t = 0;
  while (g.p.act !== 'attack' && t < 500) { M.advance(g, M.STEP); t += M.STEP; }
  assert.equal(g.p.act, 'attack');
  assert.ok(t <= M.STEP * 2, `按下到开始出枪用了 ${t.toFixed(0)} 毫秒`);
  assert.ok(g.p.tabs.attack.hitT <= 240, `出枪到命中帧 ${g.p.tabs.attack.hitT} 毫秒，超过 240`);
  const h = M.create(CLIPS, { seed: 9 });
  h.e.cool = 99999;
  M.input(h, 'guard', true);
  M.advance(h, M.STEP * 2);
  assert.equal(h.p.act, 'guard');
  assert.ok(M.guardActive(h.p), '按下架枪当即生效');
});

test('10 顿帧：命中时攻受双方各自顿帧（轻 70 毫秒 重 110 毫秒），其余照常', () => {
  const g = M.create(CLIPS, { seed: 3 });
  g.e.cool = 99999;
  // 把孟良摆在一次出手够得着的位置并强制他处于收招硬直，走一次真实的出手结算
  g.e.x = g.p.x + 190; g.e.face = -1;
  g.e.act = 'attack'; g.e.t = g.e.tabs.attack.hitT + 300; g.e.hitDone = true;
  const t0 = g.t;
  M.input(g, 'attack', true); M.input(g, 'attack', false);
  let seen = null;
  for (let i = 0; i < 80 && !seen; i++) {
    M.advance(g, M.STEP);
    if (g.p.freeze > 0 && g.e.freeze > 0) seen = { p: g.p.freeze, e: g.e.freeze, t: g.t };
  }
  assert.ok(seen, '命中后双方都应进入顿帧');
  assert.ok(seen.p <= M.HITSTOP_HEAVY && seen.p >= M.HITSTOP_LIGHT - M.STEP, `玩家顿帧 ${seen.p}`);
  assert.ok(seen.e <= M.HITSTOP_HEAVY && seen.e >= M.HITSTOP_LIGHT - M.STEP, `敌人顿帧 ${seen.e}`);
  // 顿帧期间世界时间照走
  const tt = g.t;
  M.advance(g, 50);
  assert.ok(g.t > tt, '顿帧期间游戏时间应继续走');
});

test('11 输入缓冲：顿帧期间按下的出枪不丢', () => {
  const g = M.create(CLIPS, { seed: 4 });
  g.e.cool = 99999;
  g.p.freeze = 90;
  M.input(g, 'attack', true); M.input(g, 'attack', false);
  M.advance(g, 40);
  assert.notEqual(g.p.act, 'attack', '顿帧中不应出手');
  M.advance(g, 100);
  assert.equal(g.p.act, 'attack', '顿帧结束后缓冲的出枪应立即生效');
});

test('12 震屏按创伤值平方：小事件几乎不动，叠加有上限', () => {
  const g = M.create(CLIPS, { seed: 5 });
  g.trauma = 0.1; let small = 0;
  for (let i = 0; i < 60; i++) { g.t += 16; const o = M.shakeOffset(g); small = Math.max(small, Math.abs(o.x), Math.abs(o.y)); }
  g.trauma = 1; let big = 0;
  for (let i = 0; i < 60; i++) { g.t += 16; const o = M.shakeOffset(g); big = Math.max(big, Math.abs(o.x), Math.abs(o.y)); }
  assert.ok(small < 0.5, `创伤 0.1 时偏移 ${small.toFixed(2)} 像素，应几乎不动`);
  assert.ok(big <= 16.01 && big > 6, `创伤满值偏移 ${big.toFixed(1)} 像素，应在 6–16 之间`);
});

test('13 过场：孟良认输出字幕，转场进第二场；结尾并肩亮相出字幕', () => {
  const { g } = get('precise', 2);
  assert.equal(g.stage, 2);
  assert.equal(g.phase, 'end');
  assert.equal(g.p.act, 'victory');
  assert.equal(g.e.act, 'victory');
  assert.equal(g.meter, 100);
  assert.ok(Math.abs(g.p.x - g.e.x) <= 140 && Math.abs(g.p.x - g.e.x) >= 90, `并肩距离 ${Math.abs(g.p.x - g.e.x)}`);
  assert.equal(g.p.face, g.e.face, '并肩应朝同一边');
});
