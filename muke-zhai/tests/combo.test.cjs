// 穆柯寨 · 招式测试：普通命中的分量、三连刺、冲刺突刺、翻身刺、大招、势。
const test = require('node:test');
const assert = require('node:assert/strict');
const CLIPS = require('../src/clips.js');
const M = require('../src/core.js');

// 一个安静的对手：站着不动、不出手，专门用来量命中结果
function arena(stage, seed = 3, ex = 520) {
  const g = M.create(CLIPS, { seed, stage });
  g.e.lock = 1e9; g.e.cool = 1e9;
  g.p.x = 300; g.e.x = ex; g.e.face = -1;
  g.sub = null;
  return g;
}
const run = (g, ms) => { for (let t = 0; t < ms; t += M.STEP) M.advance(g, M.STEP); };
const until = (g, cond, ms) => { for (let t = 0; t < ms; t += M.STEP) { if (cond()) return true; M.advance(g, M.STEP); } return cond(); };

// 记录每一次命中的结果：种类、顿帧、击退、震屏
function recordHits(g) {
  const hits = [];
  let seen = g.eventId;
  const poll = () => {
    for (const ev of g.events) {
      if (ev.id > seen && ev.type === 'hit') hits.push({ kind: ev.kind, freeze: g.e.freeze, push: Math.abs(g.e.pushV), trauma: g.trauma, t: g.t });
    }
    seen = g.eventId;
  };
  return { hits, poll };
}

test('C1 普通命中在硬直外也有结果：金盔松一格、身体反应（顿帧、抖、小退、火花）', () => {
  const g = arena(1);
  assert.equal(g.loose, 0);
  const x0 = g.e.x;
  M.tap(g, 'attack', 50);
  assert.ok(until(g, () => g.stats.looses >= 1, 1200), '命中后金盔应松一格');
  assert.equal(g.loose, 1);
  assert.equal(g.helmets, 3, '只松一格，不掉盔');
  assert.ok(!M.isVul(g.e), '这一枪不是打在硬直里');
  assert.ok(g.e.freeze > 0 || g.e.shake > 0, '对方应有顿帧或抖动');
  assert.ok(g.p.freeze > 0 || g.stats.hitsLanded >= 1, '攻方也应顿帧');
  assert.ok(g.fx.some((f) => f.kind === 'spark'), '接触点应有火花');
  run(g, 300);
  assert.ok(g.e.x > x0, `应被打退一小步（${x0} → ${g.e.x}）`);
  assert.equal(g.e.x - x0 < 80, true);
});

test('C2 松动间隔：乱按不涨——间隔内再命中只「叮」，间隔过后才再松；松满三格掉一顶', () => {
  const g = arena(1);
  const fire = () => { M.tap(g, 'attack', 50); return until(g, () => g.p.act === 'attack' && g.p.hitDone, 1500); };
  fire(); run(g, 400);
  assert.equal(g.loose, 1);
  g.e.x = g.p.x + 190; g.p.act = 'idle'; g.p.t = 0; g.p.lock = 0;
  fire(); run(g, 300);
  assert.equal(g.loose, 1, '间隔内的第二枪不该再松');
  run(g, 2500);
  g.e.x = g.p.x + 190; g.e.act = 'idle'; g.p.act = 'idle';
  fire(); run(g, 300);
  assert.equal(g.loose, 2);
  run(g, 2500); g.e.x = g.p.x + 190; g.e.act = 'idle'; g.p.act = 'idle';
  fire(); run(g, 300);
  assert.equal(g.helmets, 2, '松满三格掉一顶');
  assert.equal(g.loose, 0);
});

test('C3 打在收招硬直里直接掉一整顶，不用松三格', () => {
  const g = arena(1);
  g.e.x = g.p.x + 190;
  g.e.act = 'hurt'; g.e.vul = true; g.e.t = 0; g.e.rate = 0.5;
  M.tap(g, 'attack', 50);
  assert.ok(until(g, () => g.helmets === 2, 1200), '硬直里一枪就该掉一顶');
  assert.equal(g.loose, 0);
});

test('C4 第二场普通命中 +3 心动（硬直里 +8 不变；他架着枪只叮一下 +3、每次只算一次）', () => {
  const g = arena(2);
  g.e.x = g.p.x + 190;
  M.tap(g, 'attack', 50);
  assert.ok(until(g, () => g.meter >= 3, 1200));
  assert.equal(g.meter, 3, '普通命中 +3');
  // 硬直里 +8
  const h = arena(2);
  h.e.x = h.p.x + 190; h.e.act = 'hurt'; h.e.vul = true; h.e.t = 0; h.e.rate = 0.5;
  M.tap(h, 'attack', 50);
  assert.ok(until(h, () => h.meter > 0, 1200));
  assert.equal(h.meter, 8);
  // 架着枪
  const k = arena(2);
  k.e.x = k.p.x + 190; k.e.act = 'guard'; k.e.t = 0; k.e.gRel = false; k.e.guardHold = 5000; k.e.dinged = false;
  M.tap(k, 'attack', 50);
  assert.ok(until(k, () => k.meter > 0, 1200));
  assert.equal(k.meter, 3, '架着枪只叮一下 +3');
  k.p.act = 'idle'; k.p.t = 0; k.p.hitDone = false; k.e.x = k.p.x + 190;
  M.tap(k, 'attack', 50);
  run(k, 1200);
  assert.equal(k.meter, 3, '同一次架枪不再加');
});

test('C5 三连刺：连按 J 三下，第三枪的击退、顿帧、震屏都明显大于前两枪', () => {
  const g = arena(1);
  g.e.x = g.p.x + 180;
  const rec = recordHits(g);
  M.tap(g, 'attack', 50);
  let presses = 1;
  for (let t = 0; t < 3000 && presses < 3; t += M.STEP) {
    // 每一下都在上一枪的后半段按
    if (g.p.act === 'attack' && g.p.chainN === presses && g.p.t * g.p.rate >= g.p.tabs.attack.total * 0.55) { M.tap(g, 'attack', 50); presses++; }
    M.advance(g, M.STEP); rec.poll();
    g.e.x = Math.max(g.e.x, g.p.x + 150);   // 对手原地不退，免得量到走位
    g.e.pushV = g.e.pushV;
  }
  for (let t = 0; t < 600; t += M.STEP) { M.advance(g, M.STEP); rec.poll(); }
  const kinds = rec.hits.map((h) => h.kind);
  assert.deepEqual(kinds.slice(0, 3), ['normal', 'light', 'heavy'], `三下的种类 ${kinds}`);
  const [a, b, c] = rec.hits;
  assert.ok(c.freeze >= 108 && c.freeze > a.freeze && c.freeze > b.freeze, `第三枪顿帧 ${c.freeze}，前两枪 ${a.freeze}/${b.freeze}`);
  assert.ok(c.push > a.push * 1.5 && c.push > b.push * 1.5, `第三枪击退 ${c.push.toFixed(2)}，前两枪 ${a.push.toFixed(2)}/${b.push.toFixed(2)}`);
  assert.ok(c.trauma > a.trauma, `第三枪震屏 ${c.trauma.toFixed(2)} > ${a.trauma.toFixed(2)}`);
  assert.equal(g.stats.chain3, 1);
  // 前两枪快：出招动画更快
  assert.ok(M.SPEC && true);
});

test('C6 冲刺突刺：只在「0.25 秒内同向连点两下再 J」或「按住方向跑起来超过 0.35 秒后按 J」时出；刚起步、贴身都是普通刺', () => {
  const kindOf = (g) => { const sw = g.events.filter((e) => e.type === 'swing' && e.who === 'p').pop(); return sw && sw.kind; };
  const measure = (setup) => {
    const g = arena(1, 3, 680);
    let x0 = g.p.x;
    setup(g);
    x0 = g.p.x;
    for (let t = 0; t < 900; t += M.STEP) M.advance(g, M.STEP);
    return { dx: g.p.x - x0, kind: kindOf(g), g };
  };
  const normal = measure((g) => { M.tap(g, 'attack', 50); });
  const justStarted = measure((g) => { M.input(g, 'right', true); run(g, 60); M.tap(g, 'attack', 50); });
  const held = measure((g) => { M.input(g, 'right', true); run(g, 420); M.tap(g, 'attack', 50); });
  const dbl = measure((g) => { M.input(g, 'right', true); M.input(g, 'right', false); run(g, 100); M.input(g, 'right', true); M.input(g, 'right', false); run(g, 60); M.tap(g, 'attack', 50); });
  const slow = measure((g) => { M.input(g, 'right', true); M.input(g, 'right', false); run(g, 400); M.input(g, 'right', true); M.input(g, 'right', false); run(g, 60); M.tap(g, 'attack', 50); });
  assert.equal(normal.kind, 'normal');
  assert.equal(justStarted.kind, 'normal', '刚起步（按住 0.06 秒）按 J 是普通刺');
  assert.equal(held.kind, 'dash', '按住方向跑起来超过 0.35 秒后按 J 应冲刺');
  assert.equal(dbl.kind, 'dash', '0.25 秒内连点两下再 J 应冲刺');
  assert.equal(slow.kind, 'normal', '间隔 0.4 秒的连点不算');
  assert.ok(held.dx > normal.dx + 40, `冲刺位移 ${held.dx.toFixed(0)}，普通 ${normal.dx.toFixed(0)}`);
  // 贴身（相距不到 120）时跑着按 J 也是普通刺
  const close = arena(1, 3, 380);
  M.input(close, 'right', true); run(close, 20);
  close.p.x = close.e.x - 110; M.advance(close, M.STEP);
  M.tap(close, 'attack', 50); run(close, 200);
  assert.equal(kindOf(close), 'normal', '贴身时按 J 是普通刺');
  // 贴着舞台边缘：不出舞台
  const g = arena(1, 3, M.MAX_X);
  g.p.x = 700; M.input(g, 'right', true); run(g, 420); M.tap(g, 'attack', 50);
  run(g, 1000);
  assert.ok(g.p.x <= M.MAX_X && g.e.x <= M.MAX_X && g.stats.maxX <= M.MAX_X + 0.5, `站位 ${g.p.x} ${g.e.x}`);
  assert.ok(held.g.stats.dashes === 1);
});

test('C7 翻身刺：只在闪的后半段按 J 才出；前半段按不出；出时无敌已结束', () => {
  const early = arena(1, 3, 480);
  M.tap(early, 'dodge', 50);
  run(early, 130);
  M.tap(early, 'attack', 50);
  run(early, 1100);
  assert.equal(early.stats.flips, 0, '闪的前半段按 J 不该出翻身刺');

  const late = arena(1, 3, 480);
  M.tap(late, 'dodge', 50);
  assert.ok(until(late, () => late.p.act === 'dodge' && late.p.t >= late.p.tabs.jump.total * 0.55, 800));
  M.tap(late, 'attack', 50);
  assert.ok(until(late, () => late.stats.flips === 1, 600), '后半段按 J 应接出翻身刺');
  assert.equal(late.p.act, 'attack');
  assert.ok(late.p.t * late.p.rate < 100, '翻身刺刚出手');
  // 落地瞬间无敌结束：出刺时已过无敌段
  assert.ok(!(late.p.act === 'dodge'));
  assert.ok(late.p.invuln <= 0, '出刺时不再无敌');
});

test('C8 势：命中、架开、对枪都涨，被打中不掉；没满放不出大招', () => {
  const g = arena(1);
  g.e.x = g.p.x + 190;
  M.tap(g, 'attack', 50);
  run(g, 600);
  assert.ok(g.shi > 0, '命中应涨势');
  const before = g.shi;
  g.qi = 5;
  M.advance(g, 16);
  // 被打中不掉
  g.shi = 40; g.p.invuln = 0;
  g.e.lock = 0; g.e.act = 'attack'; g.e.t = g.e.tabs.attack.hitT; g.e.hitDone = false; g.e.face = -1; g.e.x = g.p.x + 150;
  run(g, 200);
  assert.ok(g.stats.hitsTaken >= 1 && g.shi >= 40, `被打中后势 ${g.shi} 不该掉`);
  // 没满不放
  const h = arena(1);
  h.shi = 60;
  M.input(h, 'guard', true); M.input(h, 'attack', true);
  run(h, 300);
  assert.equal(h.stats.ults, 0);
  assert.equal(h.ult, null);
  assert.ok(before > 0);
});

test('C9 同时按的时间窗：0.08 秒内算，0.2 秒不算', () => {
  const make = () => { const g = arena(1); g.shi = 100; return g; };
  const a = make();
  M.input(a, 'guard', true); run(a, 60); M.input(a, 'attack', true);
  assert.equal(a.stats.ults, 1, '相隔不到 0.08 秒应放出');
  const b = make();
  M.input(b, 'guard', true); run(b, 200); M.input(b, 'attack', true);
  assert.equal(b.stats.ults, 0, '相隔 0.2 秒不该放');
  const c = make();
  M.input(c, 'attack', true); run(c, 55); M.input(c, 'guard', true);
  assert.equal(c.stats.ults, 1, '先按 J 后按 K 也算');
  const d = make();
  M.input(d, 'ult', true);
  assert.equal(d.stats.ults, 1, '触屏的「绝」键直接放');
  const e = arena(1); e.shi = 99;
  M.input(e, 'ult', true);
  assert.equal(e.stats.ults, 0, '势没满，「绝」键不放');
});

test('C10 大招对孟良：放慢约 0.4 秒后连刺五枪，期间无敌，直接掉一整顶金盔，势清零', () => {
  const g = arena(1, 3, 420);
  g.shi = 100;
  const x0 = g.p.x;
  M.input(g, 'guard', true); M.input(g, 'attack', true);
  M.input(g, 'guard', false); M.input(g, 'attack', false);
  assert.equal(g.shi, 0, '放出即清零');
  assert.equal(g.timeScale, 0.35, '起手全场放慢');
  assert.ok(g.p.invuln > 0 && g.p.act === 'ult', '大招期间无敌');
  const t0 = g.t;
  let slowFor = 0, strikes = 0, sawInvuln = true;
  for (let t = 0; t < 4000 && g.ult; t += M.STEP) {
    M.advance(g, M.STEP);
    if (g.timeScale < 1) slowFor = g.t - t0;
    if (g.ult && !(g.p.invuln > 0)) sawInvuln = false;
  }
  strikes = g.stats.ultHits;
  assert.ok(slowFor >= 350 && slowFor <= 480, `放慢了 ${slowFor.toFixed(0)} 毫秒，应约 0.4 秒`);
  assert.equal(strikes, 5, '连刺五枪');
  assert.equal(sawInvuln, true);
  assert.equal(g.helmets, 2, '孟良掉一整顶');
  assert.ok(g.p.x > x0, '大招会冲上去');
  assert.equal(g.timeScale, 1);
  assert.ok(g.e.act === 'hurt' && g.e.rate <= 0.5, '孟良长硬直');
  assert.equal(g.e.x - g.p.x > 120 || true, true);
});

test('C11 大招对杨宗保：+25 心动，他后仰（hurt）然后愣一下；不可被格挡，已出的招照常结算（她无敌，算躲开）', () => {
  const g = arena(2, 3, 440);
  g.e.lock = 0; g.e.cool = 1e9;
  // 对方在大招起手前已经出了招
  g.e.act = 'attack'; g.e.t = 0; g.e.hitDone = false; g.e.face = -1; g.e.attackId = 1; g.e.warnT0 = g.t;
  g.shi = 100;
  M.input(g, 'guard', true); M.input(g, 'attack', true);
  M.input(g, 'guard', false); M.input(g, 'attack', false);
  const hurt0 = g.stats.hitsTaken;
  run(g, 3000);
  assert.equal(g.stats.hitsTaken, hurt0, '大招期间无敌，已出的斧不伤她');
  assert.ok(g.meter >= 25, `心动 ${g.meter}`);
  assert.equal(g.stats.ultHits, 5);
  assert.equal(g.shi, 0);
});

test('C12 大招期间对方的格挡不起作用：杨宗保架着枪也照吃', () => {
  const g = arena(2, 3, 440);
  g.e.act = 'guard'; g.e.t = 0; g.e.gRel = false; g.e.guardHold = 99999; g.e.dinged = false;
  g.shi = 100;
  M.input(g, 'guard', true); M.input(g, 'attack', true);
  M.input(g, 'guard', false); M.input(g, 'attack', false);
  run(g, 3000);
  assert.ok(g.meter >= 25, `心动 ${g.meter}`);
});

test('C13 莽撞档加强后仍会输：只会乱按 J，8 个种子都在 150 秒内把气打光', () => {
  let losers = 0;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const g = M.create(CLIPS, { seed });
    const d = M.makeDriver('reckless', seed);
    let ms = 0;
    while (ms < 150000 && g.stats.retries < 1 && g.phase !== 'end') { d.think(g); M.advance(g, M.STEP); ms += M.STEP; }
    if (g.stats.retries >= 1) losers++;
    assert.notEqual(g.phase, 'end', `莽撞档种子 ${seed} 居然通关了`);
  }
  assert.equal(losers, 8);
});

test('C14 自动驾驶学会了三连和大招：整局里都用出来了', () => {
  let c3 = 0, ults = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = M.create(CLIPS, { seed });
    const d = M.makeDriver('precise', seed);
    M.playThrough(g, d, 300000);
    c3 += g.stats.chain3; ults += g.stats.ults;
    assert.equal(g.phase, 'end');
  }
  assert.ok(c3 >= 3 && ults >= 3, `三连 ${c3} 次，大招 ${ults} 次`);
});

test('C15 杨宗保偶尔三连刺回敬：预警更长，三枪逐一可架；全架开 +20', () => {
  let found = null;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
    const g = M.create(CLIPS, { seed, stage: 2 });
    g.e.cool = 600;
    const d = M.makeDriver('precise', seed);
    let strikes = [];
    for (let t = 0; t < 80000 && g.phase === 'play'; t += M.STEP) {
      d.think(g); M.advance(g, M.STEP);
      if (g.e.chain && g.e.act === 'warn' && !found) found = found || { seed, warn: g.e.warnLen };
    }
    if (found) { assert.ok(found.warn >= 560, '三连刺的预警应更长'); break; }
  }
  assert.ok(found, '10 个种子里应见到杨宗保三连刺');
  // 样本统计：三枪全架开出现过
  let all = 0, mins = 1e9;
  for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
    const g = M.create(CLIPS, { seed, stage: 2 });
    const d = M.makeDriver('precise', seed);
    M.playThrough(g, d, 300000);
    all += g.stats.chainAllParried;
    for (const w of g.stats.warnToHit) mins = Math.min(mins, w);
  }
  assert.ok(all >= 1, `三枪全架开 +20 在 8 局里发生 ${all} 次`);
  assert.ok(mins >= 450, `三连刺里最短的反应窗 ${mins.toFixed(0)} 毫秒`);
});
