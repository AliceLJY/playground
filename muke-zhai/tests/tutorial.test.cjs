// 穆柯寨 · 教学与示范测试：node --test tests/*.test.cjs
// 全部用模拟按键走真实模拟，不手摆状态（钩子 prepareView 除外，那条单独断言它的结果）。
const test = require('node:test');
const assert = require('node:assert/strict');
const CLIPS = require('../src/clips.js');
const M = require('../src/core.js');

const tutorialGame = (seed = 5) => M.create(CLIPS, { seed, tutorial: true, touch: true });
const run = (g, ms) => { for (let t = 0; t < ms; t += M.STEP) M.advance(g, M.STEP); };
const step = (g) => (g.tut ? g.tut.step : null);
// 一边推进一边等条件，最多 maxMs；返回是否等到
const until = (g, cond, maxMs, each) => {
  for (let t = 0; t < maxMs; t += M.STEP) {
    if (cond()) return true;
    if (each) each();
    M.advance(g, M.STEP);
  }
  return cond();
};

test('T1 五步一步一步走完：每一步做对之前不前进，做对之后前进；教学里不掉气', () => {
  const g = tutorialGame();
  const qiOk = () => assert.equal(g.qi, M.QI_MAX, '教学里不该掉气');
  assert.equal(step(g), 'walk');
  assert.equal(g.helmets, 3);

  // 第一步 走：不动 3 秒不前进；走到够得着才前进，且前进那一刻确实已走近
  run(g, 3000);
  assert.equal(step(g), 'walk', '没走就不该前进');
  assert.equal(g.e.act, 'idle', '孟良这时站着不动手');
  g.held.right = true;
  let farAtPass = null;
  until(g, () => step(g) !== 'walk', 6000, () => { farAtPass = Math.abs(g.e.x - g.p.x); });
  g.held.right = false;
  assert.equal(step(g), 'stab', '走近后应进入第二步');
  assert.ok(farAtPass <= 245 + 2, `前进时相距 ${farAtPass}，应已够得着`);

  // 第二步 刺：不按 2 秒不前进；打中一下前进，这一下不掉金盔
  run(g, 2000);
  assert.equal(step(g), 'stab');
  M.tap(g, 'attack', 60);
  assert.ok(until(g, () => step(g) !== 'stab', 1500), '出枪命中后应前进');
  assert.equal(step(g), 'guard');
  assert.equal(g.helmets, 3, '第二步这一下不掉金盔');
  qiOk();

  // 第三步 架：孟良慢慢举斧，不按就一直慢着、不前进
  assert.ok(until(g, () => g.tut.slow, 3000), '应进入放慢举斧');
  assert.equal(g.timeScale, 0.35);
  assert.equal(g.e.act, 'warn');
  assert.ok(g.sub && g.sub.text.includes('架'), `提示应提到「架」：${g.sub && g.sub.text}`);
  assert.equal(g.tut.glow, 'guard');
  run(g, 1200);
  assert.equal(step(g), 'guard', '没按架就不该前进');
  assert.ok(g.tut.slow && g.timeScale === 0.35);
  // 按住架：恢复正常速度，斧子落在枪上，出架开
  const parries0 = g.stats.parries;
  M.input(g, 'guard', true);
  M.advance(g, M.STEP * 2);
  assert.equal(g.timeScale, 1, '她一按住架就恢复正常速度');
  assert.ok(until(g, () => step(g) !== 'guard', 2500, () => {}), '架开后应前进');
  M.input(g, 'guard', false);
  assert.equal(g.stats.parries, parries0 + 1, '应出架开');
  assert.equal(step(g), 'punish');
  qiOk();

  // 第四步 趁他收招：他愣住约 1.2 秒；不打就不前进，打中掉第一顶金盔
  run(g, 600);
  assert.equal(step(g), 'punish');
  assert.equal(g.helmets, 3);
  assert.ok(M.isVul(g.e), '他应在硬直里');
  M.tap(g, 'attack', 60);
  assert.ok(until(g, () => step(g) !== 'punish', 1500), '打中后应前进');
  assert.equal(g.helmets, 2, '掉第一顶金盔');
  assert.equal(step(g), 'dodge');

  // 第五步 闪
  assert.ok(until(g, () => g.tut.slow, 4000), '第五步孟良应再放慢劈一次');
  run(g, 1000);
  assert.equal(step(g), 'dodge', '没闪就不该前进');
  const dodges0 = g.stats.dodges;
  M.tap(g, 'dodge', 60);
  assert.ok(until(g, () => step(g) !== 'dodge', 3000), '躲开后应前进');
  assert.equal(step(g), 'chain', '躲开后进入第六步「连按三下刺」');
  assert.equal(g.stats.dodges, dodges0 + 1);
  qiOk();

  // 第六步 连按三下刺：只按一下不前进；连按三下（后两下在上一枪的后半段）才前进
  assert.equal(g.tut.glow, 'attack');
  assert.ok(g.sub.text.includes('三下'), g.sub.text);
  until(g, () => g.p.act === 'idle' && g.e.act === 'idle', 3000);
  g.held.right = true;
  until(g, () => Math.abs(g.e.x - g.p.x) <= 230, 4000);
  g.held.right = false;
  M.tap(g, 'attack', 50);
  run(g, 1500);
  assert.equal(step(g), 'chain', '只按一下刺不该前进');
  M.tap(g, 'attack', 50);
  until(g, () => g.p.act === 'attack' && g.p.t * g.p.rate >= g.p.tabs.attack.total * 0.55, 800);
  M.tap(g, 'attack', 50);
  until(g, () => g.p.atk && g.p.chainN === 2 && g.p.t * g.p.rate >= g.p.tabs.attack.total * 0.55, 800);
  assert.equal(step(g), 'chain', '两下还不够');
  M.tap(g, 'attack', 50);
  assert.ok(until(g, () => step(g) !== 'chain', 800), '第三下出手后应前进');
  assert.equal(step(g), 'outro');
  qiOk();
  assert.ok(g.sub.text.includes('剩下两顶金盔'), g.sub.text);

  // 结尾：教学结束，进入正常的第一场，金盔从剩两顶接着打
  assert.ok(until(g, () => g.tut === null, 5000));
  assert.equal(g.tutDone, true);
  assert.equal(g.helmets, 2);
  assert.equal(g.stage, 1);
  assert.equal(g.timeScale, 1);
  assert.equal(g.stats.hitsTaken, 0);
  // 之后孟良会自己进攻
  assert.ok(until(g, () => g.e.act === 'warn', 12000), '教学结束后孟良应恢复正常进攻');
});

test('T2 第三步连续三次不按：挨三下不掉气，第四次自动替她架一次并继续', () => {
  for (const seed of [1, 2, 3]) {
    const g = tutorialGame(seed);
    const d = M.makeDriver('precise', seed, { tutStop: 'guard' });
    let guard = 0;
    const lost = [];
    for (let t = 0; t < 120000 && step(g) !== 'punish'; t += M.STEP) {
      d.think(g);
      M.advance(g, M.STEP);
      if (g.qi !== M.QI_MAX) lost.push(g.t);
      if (step(g) === 'guard') guard++;
    }
    assert.equal(step(g), 'punish', `种子 ${seed}：三次没按后应被自动带过`);
    assert.equal(lost.length, 0, '教学里不该掉气');
    assert.equal(g.stats.hitsTaken, 0);
    assert.equal(g.tut.attempt, 4, `应在第 4 次举斧时被自动架开，实际第 ${g.tut.attempt} 次`);
    assert.equal(g.stats.parries, 1);
    assert.ok(guard > 0);
  }
});

test('T3 跳过能直接进正常局，金盔仍是三顶，孟良会正常进攻', () => {
  const g = tutorialGame(7);
  run(g, 500);
  assert.equal(step(g), 'walk');
  M.skipTutorial(g);
  assert.equal(step(g), null);
  assert.equal(g.tutDone, true);
  assert.equal(g.helmets, 3);
  assert.equal(g.timeScale, 1);
  const d = M.makeDriver('precise', 7);
  let ms = 0;
  while (ms < 90000 && g.stage === 1) { d.think(g); M.advance(g, M.STEP); ms += M.STEP; }
  assert.equal(g.stage, 2, '跳过教学后应能照常打过第一场');
  assert.ok(g.stats.swings > 3);
});

test('T3b 教学进行到一半跳过也一样（正在放慢举斧时）', () => {
  const g = tutorialGame(9);
  const d = M.makeDriver('precise', 9, { tutStop: 'guard' });
  assert.ok(until(g, () => g.tut && g.tut.slow, 60000, () => d.think(g)));
  assert.equal(g.timeScale, 0.35);
  M.skipTutorial(g);
  assert.equal(g.timeScale, 1, '跳过后不能留在慢放里');
  assert.equal(g.e.act, 'idle');
  run(g, 4000);
  assert.equal(step(g), null);
  assert.ok(g.qi >= 0);
});

test('T4 从教学开始，由自动驾驶把整局打完（3 个种子）', () => {
  for (const seed of [1, 2, 3]) {
    const g = tutorialGame(seed);
    const d = M.makeDriver('precise', seed);
    const ms = M.playThrough(g, d, 300000);
    assert.equal(g.phase, 'end', `种子 ${seed} 没打到结尾（用时 ${(ms / 1000).toFixed(0)} 秒，阶段 ${g.phase}，教学步骤 ${step(g)}）`);
    assert.equal(g.tutDone, true);
    assert.ok(ms / 1000 >= 45 && ms / 1000 <= 300, `用时 ${(ms / 1000).toFixed(0)} 秒`);
  }
});

test('T5 示范跑完后，玩家自己的状态与示范前逐字段相同；示范里确实演了架、刺、闪', () => {
  const g = tutorialGame(5);
  run(g, 1200);
  const before = JSON.stringify(M.snapshot(g));
  const fields = JSON.stringify({ t: g.t, qi: g.qi, helmets: g.helmets, meter: g.meter, eventId: g.eventId, tut: g.tut, held: g.held, p: g.p.x, e: g.e.x });
  const control = tutorialGame(5);
  run(control, 1200);

  const demo = M.createDemo(CLIPS, 11);
  assert.notEqual(demo.g, g);
  let swings = 0, guards = 0, dodges = 0, last = { attack: -1e9, guard: -1e9, dodge: -1e9 };
  for (let t = 0; t < 16000; t += M.STEP) {
    demo.driver.think(demo.g);
    M.advance(demo.g, M.STEP);
    for (const k of ['attack', 'guard', 'dodge']) {
      if (demo.g.pressT[k] !== last[k]) { last[k] = demo.g.pressT[k]; if (k === 'attack') swings++; if (k === 'guard') guards++; if (k === 'dodge') dodges++; }
    }
  }
  assert.ok(guards >= 1 && swings >= 1 && dodges >= 1, `示范里按键：架 ${guards} 刺 ${swings} 闪 ${dodges}`);
  // 闪开有两种结果：斧子够得着但她在无敌段（evade），或她闪远了斧子落空（whiff）
  const dodged = demo.g.events.filter((ev) => ev.type === 'evade' || (ev.type === 'whiff' && ev.who === 'e')).length;
  assert.ok(demo.g.stats.parries >= 1 && dodged >= 1, `示范里架开 ${demo.g.stats.parries} 次，闪开 ${dodged} 次`);
  assert.equal(demo.g.stage, 1);
  const ds = demo.g.stats;
  assert.ok(ds.chain3 >= 1 && ds.dashes >= 1 && ds.flips >= 1 && ds.ults >= 1, `示范里要演三连 ${ds.chain3}、冲刺 ${ds.dashes}、翻身刺 ${ds.flips}、大招 ${ds.ults}`);

  assert.equal(JSON.stringify(M.snapshot(g)), before, '示范不能改玩家的状态');
  assert.equal(JSON.stringify({ t: g.t, qi: g.qi, helmets: g.helmets, meter: g.meter, eventId: g.eventId, tut: g.tut, held: g.held, p: g.p.x, e: g.e.x }), fields);
  // 随机数序列也没被借用
  assert.equal(g.rng(), control.rng());
});

test('T6 钩子 teach3：真实模拟推进到「按住架」那一刻', () => {
  const g = tutorialGame(5);
  M.prepareView(g, 'teach3');
  assert.equal(step(g), 'guard');
  assert.equal(g.tut.slow, true);
  assert.equal(g.e.act, 'warn');
  assert.equal(g.timeScale, 0.35);
  assert.equal(g.tut.glow, 'guard');
  assert.equal(g.qi, M.QI_MAX);
});

test('T7 第二场开头的一句提示出现 3 秒后自己消失', () => {
  const g = M.create(CLIPS, { seed: 2, hints: true });
  const d = M.makeDriver('precise', 2);
  let seen = null, gone = false;
  for (let t = 0; t < 120000 && !gone; t += M.STEP) {
    d.think(g); M.advance(g, M.STEP);
    if (g.stage === 2 && g.sub && g.sub.text.includes('撞在一起')) seen = seen || g.t;
    if (seen && !(g.sub && g.sub.text.includes('撞在一起'))) { gone = true; assert.ok(g.t - seen >= 2800 && g.t - seen <= 3300, `停了 ${g.t - seen} 毫秒`); }
  }
  assert.ok(seen && gone, '应出现并消失');
});
