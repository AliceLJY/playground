// 穆柯寨 · 第三轮：蓄力条、杨宗保全程在场、第一场心动、连续转场、提示字的出收、身体不重叠。
const test = require('node:test');
const assert = require('node:assert/strict');
const CLIPS = require('../src/clips.js');
const M = require('../src/core.js');

const run = (g, ms) => { for (let t = 0; t < ms; t += M.STEP) M.advance(g, M.STEP); };
const until = (g, cond, ms, each) => { for (let t = 0; t < ms; t += M.STEP) { if (cond()) return true; if (each) each(); M.advance(g, M.STEP); } return cond(); };

test('S1 蓄力条：从预警匀速走满，走满那一刻招式落下；最后 0.2 秒是亮段', () => {
  const g = M.create(CLIPS, { seed: 4 });
  g.p.x = 300; g.e.x = 520; g.e.cool = 0;
  const samples = [];
  let hitAt = null, warnAt = null;
  for (let t = 0; t < 4000; t += M.STEP) {
    M.advance(g, M.STEP);
    const b = M.chargeBar(g);
    if (b) { if (warnAt == null) warnAt = g.t; samples.push({ t: g.t, frac: b.frac, win: b.inWindow, ws: b.winStart, total: b.total }); }
    if (g.stats.warnToHit.length === 1 && hitAt == null) hitAt = g.t;
    if (hitAt != null) break;
  }
  assert.ok(samples.length > 30, '预警期应一直有条');
  // 匀速：每帧增量一致
  const d = samples.slice(1).map((s, i) => s.frac - samples[i].frac);
  const mean = d.reduce((a, b) => a + b, 0) / d.length;
  assert.ok(d.every((x) => Math.abs(x - mean) < mean * 0.35 + 1e-6), '条应匀速走（含预警到蓄力的衔接）');
  assert.ok(samples[samples.length - 1].frac > 0.97, `命中那一刻条应走满（${samples[samples.length - 1].frac.toFixed(3)}）`);
  // 亮段 = 最后 0.2 秒
  const win = samples.filter((s) => s.win);
  assert.ok(win.length > 8 && win[0].frac >= samples[0].ws - 0.02, '亮段应在条的末尾');
  const winMs = (win[win.length - 1].t - win[0].t) + M.STEP;
  assert.ok(winMs >= 170 && winMs <= 230, `亮段约 0.2 秒，实测 ${winMs.toFixed(0)} 毫秒`);
  assert.ok(Math.abs(samples[0].ws - (1 - 200 / samples[0].total)) < 0.01, '亮段起点 = 1 - 0.2 秒 / 总长');
});

test('S2 蓄力条在亮段里按下 = 架开（真的能架开）；条头进亮段前按下是挡下', () => {
  const press = (atFrac) => {
    const g = M.create(CLIPS, { seed: 4 });
    g.p.x = 300; g.e.x = 520; g.e.cool = 0;
    assert.ok(until(g, () => { const b = M.chargeBar(g); return b && b.frac >= atFrac; }, 4000));
    M.input(g, 'guard', true);
    run(g, 1800);
    return g.stats;
  };
  const ok = press(0.86);
  assert.equal(ok.parries, 1, '亮段里按下应架开');
  const early = press(0.45);
  assert.equal(early.parries, 0, '太早按下不该是架开');
});

test('S3 教学第三步的字幕跟着状态走：举斧 → 条走到一半 → 按住后「架住了」→ 架开后换下一句', () => {
  const g = M.create(CLIPS, { seed: 5, tutorial: true, touch: false });
  const d = M.makeDriver('precise', 5, { tutStop: 'guard' });
  let seen = [];
  const note = () => { const t = g.sub && g.sub.text; if (t && seen[seen.length - 1] !== t) seen.push(t); };
  for (let t = 0; t < 60000 && !(g.tut && g.tut.slow); t += M.STEP) { d.think(g); M.advance(g, M.STEP); note(); }
  assert.equal(g.sub.text, '他举斧了，看他头上的条');
  until(g, () => g.sub.text.includes('亮的那一段'), 4000, note);
  assert.equal(g.sub.text, '条走到亮的那一段时，按住 K');
  until(g, () => M.chargeBar(g).inWindow, 4000);
  const t0 = g.t;
  M.input(g, 'guard', true);
  M.advance(g, M.STEP);
  assert.equal(g.sub.text, '架住了', '亮段里按下，字幕立刻换成「架住了」');
  assert.ok(g.t - t0 <= 300);
  until(g, () => g.tut.step !== 'guard', 2000);
  M.input(g, 'guard', false);
  assert.equal(g.tut.step, 'punish');
  assert.equal(g.sub.text, '趁他愣住，刺', '架开后「架住了」消失，换成下一步的提示');
});

test('S4 教学：按得太早算挡下，字幕提示等亮段；这一步必须真的架开一次才过', () => {
  const g = M.create(CLIPS, { seed: 5, tutorial: true });
  const d = M.makeDriver('precise', 5, { tutStop: 'guard' });
  for (let t = 0; t < 60000 && !(g.tut && g.tut.slow); t += M.STEP) { d.think(g); M.advance(g, M.STEP); }
  until(g, () => M.chargeBar(g).frac >= 0.45, 4000);
  M.input(g, 'guard', true);
  const tp = g.t;
  until(g, () => g.tut.tries === 1, 6000);
  M.input(g, 'guard', false);
  assert.equal(g.tut.step, 'guard', '挡下不算过');
  assert.equal(g.stats.parries, 0);
  assert.ok(g.sub.text.includes('挡住了。等条走到亮段再按'), g.sub.text);
  assert.equal(g.qi, M.QI_MAX);
  // 再练一次：亮段里按，才过
  assert.ok(until(g, () => g.tut.slow, 6000));
  until(g, () => M.chargeBar(g) && M.chargeBar(g).inWindow, 4000);
  M.input(g, 'guard', true);
  assert.ok(until(g, () => g.tut.step !== 'guard', 3000));
  M.input(g, 'guard', false);
  assert.equal(g.stats.parries, 1, '过关靠的是真的架开');
});

test('S5 教学第三步连续三次不按：第四次在亮段里自动替她架开，仍然是真的架开', () => {
  const g = M.create(CLIPS, { seed: 6, tutorial: true });
  const d = M.makeDriver('precise', 6, { tutStop: 'guard' });
  for (let t = 0; t < 150000 && g.tut && g.tut.step !== 'punish'; t += M.STEP) { d.think(g); M.advance(g, M.STEP); }
  assert.equal(g.tut.step, 'punish');
  assert.equal(g.stats.parries, 1);
  assert.equal(g.tut.attempt, 4);
  assert.equal(g.stats.hitsTaken, 0);
});

test('S6 提示字不挂着不走：做到动作后 0.3 秒内消失或换句（教学全程 + 势满提示）', () => {
  const g = M.create(CLIPS, { seed: 5, tutorial: true, touch: true });
  const d = M.makeDriver('precise', 5);
  let prevStep = g.tut.step, prevText = g.sub && g.sub.text, worst = 0;
  let stepChangedAt = null, textAtChange = null, checked = 0;
  for (let t = 0; t < 150000 && g.tut; t += M.STEP) {
    d.think(g); M.advance(g, M.STEP);
    const step = g.tut ? g.tut.step : 'done', text = g.sub && g.sub.text;
    if (step !== prevStep && prevText != null) {
      // 步骤前进的这一刻：提示字必须已经换了句（或收掉）
      assert.notEqual(text, prevText, `步骤 ${prevStep} → ${step} 时提示字还挂着「${prevText}」`);
      checked++;
    }
    prevStep = step; prevText = text;
  }
  assert.ok(checked >= 5, `只核了 ${checked} 次步骤切换`);
  assert.equal(g.tutDone, true);

  // 势满的那一句：放出大招后 0.3 秒内收掉
  const h = M.create(CLIPS, { seed: 5, hints: true });
  h.e.lock = 1e9; h.e.cool = 1e9; h.e.x = 480;
  h.shi = 95; M.tap(h, 'attack', 50);
  until(h, () => h.shi >= 100, 3000);
  assert.ok(h.sub && h.sub.text.includes('势满了'), '势满时出提示');
  M.input(h, 'guard', true); M.input(h, 'attack', true);
  M.advance(h, M.STEP);
  assert.ok(!h.sub || !h.sub.text.includes('势满了'), '放出大招后提示字立刻收掉');
});

test('S7 杨宗保第一场从头到尾都在场；不参与碰撞和伤害结算（有没有他，穆桂英与孟良的结果一样）', () => {
  const a = M.create(CLIPS, { seed: 3 });
  const b = M.create(CLIPS, { seed: 3 });
  b.z = null;
  const da = M.makeDriver('precise', 3), db = M.makeDriver('precise', 3);
  let ticks = 0;
  for (let t = 0; t < 60000 && a.stage === 1 && a.phase === 'play' && b.phase === 'play'; t += M.STEP) {
    da.think(a); db.think(b); M.advance(a, M.STEP); M.advance(b, M.STEP);
    ticks++;
    const s = M.snapshot(a);
    assert.ok(s.z, `第 ${ticks} 步场上没有杨宗保`);
    assert.ok(['idle', 'walk', 'hurt', 'guard'].includes(s.z.act), `他的状态 ${s.z.act}`);
    assert.ok(s.z.x >= 690 && s.z.x <= 870, `他的位置 ${s.z.x}`);
    assert.equal(a.p.x, b.p.x, `第 ${ticks} 步穆桂英位置不同`);
    assert.equal(a.e.x, b.e.x, `第 ${ticks} 步孟良位置不同`);
    assert.equal(a.qi, b.qi); assert.equal(a.helmets, b.helmets); assert.equal(a.loose, b.loose);
  }
  assert.ok(ticks > 1000, `只比了 ${ticks} 步`);
  assert.equal(a.stats.parries, b.stats.parries);
  assert.equal(a.stats.hitsTaken, b.stats.hitsTaken);
  assert.equal(a.stats.hitsLanded, b.stats.hitsLanded);
});

test('S8 开场第一帧：三个人都在台上，穆桂英在左、孟良居中、杨宗保在右侧门边；开场字幕', () => {
  const g = M.create(CLIPS, { seed: 7 });
  const s = M.snapshot(g);
  assert.ok(s.p.x < s.e.x && s.e.x < s.z.x, `${s.p.x} / ${s.e.x} / ${s.z.x}`);
  assert.ok(s.z.x >= 780, '杨宗保在右门边');
  assert.equal(s.sub, '穆柯寨前，杨宗保带着孟良来讨降龙木。');
});

test('S9 第一场心动：每次架开、三连第三枪、大招都涨一点，合计最多约 20，第二场从这个数接着涨', () => {
  let sawHeart = 0, carried = 0;
  for (const seed of [1, 2, 3, 4, 5]) {
    const g = M.create(CLIPS, { seed });
    const d = M.makeDriver('precise', seed);
    let maxHeart1 = 0, at2 = null;
    for (let t = 0; t < 200000 && g.phase !== 'end'; t += M.STEP) {
      d.think(g); M.advance(g, M.STEP);
      if (g.stage === 1) { maxHeart1 = Math.max(maxHeart1, g.meter); assert.ok(g.meter <= 20, `第一场心动 ${g.meter} 超过上限 20`); }
      else if (at2 == null) { at2 = g.meter; }
    }
    if (maxHeart1 > 0) sawHeart++;
    if (at2 != null && at2 === maxHeart1) carried++;
    assert.ok(g.events.some((e) => e.type === 'zreact') || maxHeart1 === 0);
  }
  assert.ok(sawHeart >= 4, `5 局里只有 ${sawHeart} 局第一场有心动`);
  assert.ok(carried >= 3, `第二场开头应从第一场的数接着涨（${carried}/5）`);
});

test('S10 孟良认输后的转场是连续的：不黑场、每一步场上都有杨宗保；孟良退进右门，杨宗保走上前站到对面', () => {
  const g = M.create(CLIPS, { seed: 2 });
  const d = M.makeDriver('precise', 2);
  let sawWalk = false, sawMengExit = false, gap = 0, maxFade = 0, stage2At = null, zAtHandoff = 0;
  for (let t = 0; t < 200000 && !(g.stage === 2 && g.t - (stage2At || g.t) > 500); t += M.STEP) {
    d.think(g); M.advance(g, M.STEP);
    maxFade = Math.max(maxFade, g.fade);
    const hasZ = !!g.z || (g.e && g.e.who === 'zongbao');
    if (!hasZ) gap++;
    if (g.phase === 'win1' && g.z && g.z.act === 'walk' && g.z.x < 800) sawWalk = true;
    if (g.phase === 'win1' && g.e.act === 'walk' && g.e.face === 1) sawMengExit = true;
    if (g.stage === 2 && stage2At == null) { stage2At = g.t; zAtHandoff = g.e.x; }
  }
  assert.equal(gap, 0, '转场里有帧场上没有杨宗保');
  assert.equal(maxFade, 0, '不黑场');
  assert.ok(sawMengExit, '孟良应走进右门');
  assert.ok(sawWalk, '杨宗保应走上前（walk）');
  assert.equal(g.stage, 2);
  assert.equal(g.e.who, 'zongbao');
  assert.ok(g.m && g.m.who === 'mengliang' && g.m.x > 800, '孟良留在门边');
  assert.ok(zAtHandoff >= 690 && zAtHandoff <= 710, `杨宗保站到对面 ${zAtHandoff}`);
});

test('S11 身体有体积：除了结尾并肩，两人身体圆（半径 42）全程不重叠，大招起手前修正间距', () => {
  const R2 = 84;
  let minGap = 1e9, ticks = 0;
  for (const skill of ['precise', 'sloppy', 'reckless']) {
    for (const seed of [1, 2, 3]) {
      const g = M.create(CLIPS, { seed });
      const d = M.makeDriver(skill, seed);
      for (let t = 0; t < 90000 && g.phase !== 'end'; t += M.STEP) {
        d.think(g); M.advance(g, M.STEP);
        if (g.phase === 'finale' || g.phase === 'end') break;
        minGap = Math.min(minGap, Math.abs(g.e.x - g.p.x)); ticks++;
      }
    }
  }
  assert.ok(ticks > 20000);
  assert.ok(minGap >= R2 - 0.5, `最小间距 ${minGap.toFixed(1)}，身体圆重叠了`);
  // 大招：贴身起手
  const g = M.create(CLIPS, { seed: 3 });
  g.e.lock = 1e9; g.e.cool = 1e9; g.p.x = 300; g.e.x = 372;
  g.shi = 100;
  M.input(g, 'guard', true); M.input(g, 'attack', true);
  let mg = 1e9;
  for (let t = 0; t < 3000 && (g.ult || t < 100); t += M.STEP) { M.advance(g, M.STEP); mg = Math.min(mg, Math.abs(g.e.x - g.p.x)); }
  assert.ok(mg >= R2 - 0.5, `大招全程最小间距 ${mg.toFixed(1)}`);
});

test('S12 大招冲上去停在「刚好够得着」的距离，不贴脸', () => {
  const g = M.create(CLIPS, { seed: 3 });
  g.e.lock = 1e9; g.e.cool = 1e9; g.p.x = 200; g.e.x = 600;
  g.shi = 100;
  M.input(g, 'guard', true); M.input(g, 'attack', true);
  until(g, () => g.stats.ultHits >= 3, 3000);
  const gap = Math.abs(g.e.x - g.p.x);
  assert.ok(gap >= 100 && gap <= 230, `大招中段间距 ${gap.toFixed(0)}`);
});

test('S13 引子：第一次默认出，看过后不再自动出；教学、机位、?stage=2 默认不出；?story=1 / view=story 强制出', () => {
  const P = M.storyPolicy;
  assert.equal(P({ seen: false }), true, '第一次默认出');
  assert.equal(P({ seen: true }), false, '看过后不再自动出');
  assert.equal(P({ seen: false, view: 'meng' }), false, '机位默认不出');
  assert.equal(P({ seen: false, stage: 2 }), false, '?stage=2 不出');
  assert.equal(P({ seen: false, tutorialParam: '1' }), false, '?tutorial=… 不出');
  assert.equal(P({ seen: true, param: '1' }), true, '?story=1 强制出');
  assert.equal(P({ seen: true, view: 'story' }), true, '?view=story 定格在引子页');
  assert.equal(P({ seen: false, param: '0' }), false);
});

test('S14 引子页期间游戏时间不走；点一下（或任意键）继续后才开始；之后可以用「故事」再看', () => {
  const g = M.create(CLIPS, { seed: 3, story: true, tutorial: true });
  run(g, 2000);
  assert.equal(g.t, 0, '引子期间时间不走');
  assert.equal(M.snapshot(g).intro, true);
  assert.equal(g.tut.step, 'walk');
  g.held.right = true; run(g, 500);
  assert.equal(g.p.x, 300, '引子期间不能走');
  M.input(g, 'attack', true);   // 任意输入也关闭
  assert.equal(g.intro, false);
  run(g, 600);
  assert.ok(g.t >= 500, '关闭后游戏开始');
  M.showIntro(g);
  const t1 = g.t;
  run(g, 500);
  assert.equal(g.t, t1, '再看一遍时同样暂停');
  assert.equal(g.held.right, false, '再看时松开按着的键');
  M.dismissIntro(g);
  run(g, 200);
  assert.ok(g.t > t1);
  assert.equal(M.STORY.title, '穆柯寨');
  assert.equal(M.STORY.lines.length, 3);
});

test('S15 名牌：三个人第一次出场时各一个，淡入、停到 2.5 秒前后淡出，之后不再出；第二场没有', () => {
  const g = M.create(CLIPS, { seed: 3 });
  let s = M.snapshot(g).tags;
  assert.equal(s.p, 0); assert.equal(s.e, 0); assert.equal(s.z, 0);
  run(g, 150);
  s = M.snapshot(g).tags;
  assert.ok(s.p > 0.3 && s.p < 0.8 && s.z > 0.3, `淡入中 ${JSON.stringify(s)}`);
  run(g, 600);
  s = M.snapshot(g).tags;
  assert.equal(s.p, 1); assert.equal(s.e, 1); assert.equal(s.z, 1);
  run(g, 1500);
  s = M.snapshot(g).tags;
  assert.ok(s.p < 1 && s.p > 0, `淡出中 ${JSON.stringify(s)}`);
  run(g, 700);
  s = M.snapshot(g).tags;
  assert.deepEqual([s.p, s.e, s.z], [0, 0, 0], '2.5 秒后全部收掉');
  assert.deepEqual(M.TAG_TEXT, { p: '穆柯寨寨主之女', e: '杨家将麾下，来讨降龙木', z: '杨家少将，随后就到' });
  const h = M.create(CLIPS, { seed: 3, stage: 2 });
  run(h, 600);
  const t = M.snapshot(h).tags;
  assert.deepEqual([t.p, t.e, t.z], [0, 0, 0], '第二场不出名牌');
});

test('S16 结尾：先「这一仗谁也没赢…」，再「戏里，两人结为夫妻，后来同赴宋营抗辽。」停 5 秒，然后才出「再来一遍」', () => {
  const g = M.create(CLIPS, { seed: 2 });
  const d = M.makeDriver('precise', 2);
  const seq = [];
  let line2At = null, line2Until = null, goneAt = null;
  for (let t = 0; t < 300000 && !goneAt; t += M.STEP) {
    d.think(g); M.advance(g, M.STEP);
    if (g.phase !== 'end') continue;
    const txt = g.sub && g.sub.text;
    if (txt && seq[seq.length - 1] !== txt) { seq.push(txt); if (txt === M.ENDING_LINE2) line2At = g.t; }
    if (txt === M.ENDING_LINE2) line2Until = g.t;
    if (!txt && line2At) goneAt = g.t;
  }
  assert.deepEqual(seq, ['这一仗谁也没赢。后来的事，戏里都唱过。', '戏里，两人结为夫妻，后来同赴宋营抗辽。']);
  const held = line2Until - line2At;
  assert.ok(held >= 4800 && held <= 5200, `第二行停了 ${held.toFixed(0)} 毫秒，应约 5 秒`);
  assert.ok(goneAt - line2Until <= 100, '第二行一收，「再来一遍」就可以出了');
});

test('S17 第一场心动第一次上涨时出「杨宗保在看。」，只出一次，停 2 秒收掉', () => {
  for (const seed of [1, 2, 3]) {
    const g = M.create(CLIPS, { seed });
    const d = M.makeDriver('precise', seed);
    let shows = 0, since = null, spans = [];
    for (let t = 0; t < 300000 && g.phase !== 'end'; t += M.STEP) {
      d.think(g); M.advance(g, M.STEP);
      const on = g.sub && g.sub.text === '杨宗保在看。';
      if (on && since == null) { shows++; since = g.t; }
      if (!on && since != null) { spans.push(g.t - since); since = null; }
    }
    assert.equal(shows, 1, `种子 ${seed}：「杨宗保在看。」出现了 ${shows} 次`);
    assert.ok(spans[0] >= 1500 && spans[0] <= 2100, `停了 ${spans[0]} 毫秒`);
    assert.equal(g.zSeen, true);
  }
});
