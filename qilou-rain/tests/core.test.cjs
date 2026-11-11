// 无头逻辑测试：node --test tests/*.test.cjs
// 难度断言两侧都写；跨种子断言都带「样本里真发生过要测的事」，免得全绿是空验。
const test = require('node:test'), assert = require('node:assert');
const load = () => import('../src/core.js');
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;

test('场地：开局点、三处沙井口、补给箱、登船点都站得住，并且互相走得到', async () => {
  const C = await load();
  const pts = [C.START, C.EXTRACT, ...C.DRAINS, ...C.CRATES, ...C.VENTS];
  for (const p of pts) assert.ok(C.free(p.x, p.z, 0.3), `(${p.x}, ${p.z}) 被障碍或墙占住`);
  const f = C.fillField(C.makeField(), C.START.x, C.START.z), o = { x: 0, z: 0 };
  for (const p of pts) assert.ok(C.flow(f, p.x, p.z, o) < 1e8, `(${p.x}, ${p.z}) 从开局点走不到`);
  assert.strictEqual(C.DRAINS.length, 3);
  assert.ok(C.COLUMNS.length >= 36, '两排骑楼柱');
  assert.ok(!C.free(5.35, -57.5, 0.3), '柱子挡人');
  assert.ok(!C.los(-8, -52, 8, -52.4) || C.los(-8, -55, 8, -55), '视线判定可用');
});

test('精准档：每个种子都能通关，用时 60–240 秒，全程不卡死', async () => {
  const C = await load(); const T = [];
  for (let s = 1; s <= 12; s++) {
    const { sim, log } = C.runBot(s, 'precise', 400);
    assert.strictEqual(sim.state, 'won', `种子 ${s} 精准档没通关，停在 ${sim.t.toFixed(0)} 秒、盖了 ${C.sealedCount(sim)} 个`);
    assert.strictEqual(log.stuck, 0, `种子 ${s} 出现卡死窗口`);
    assert.strictEqual(log.seals.length, 3);
    T.push(sim.t);
  }
  assert.ok(avg(T) > 60 && avg(T) < 240, `精准档平均用时 ${avg(T).toFixed(0)} 秒`);
});

test('手抖档：通关率在 55%–97% 之间，平均 100–300 秒；样本里真的出过飞的、带壳的，真的撞翻过', async () => {
  const C = await load(); let won = 0, fly = 0, chg = 0, stun = 0, tele = 0, hurtRuns = 0; const T = [], N = 30;
  for (let s = 1; s <= N; s++) {
    const { sim, log } = C.runBot(s, 'shaky', 480);
    if (sim.state === 'won') { won++; T.push(sim.t); }
    fly += log.flyerSeen; chg += log.chargerSeen; stun += log.stuns; tele += log.telegraphs; if (sim.stats.damage > 0) hurtRuns++;
    assert.strictEqual(log.stuck, 0, `种子 ${s} 出现卡死窗口`);
  }
  assert.ok(won / N >= 0.55, `手抖档只赢 ${won}/${N}，太难`);
  assert.ok(won / N <= 0.97, `手抖档赢了 ${won}/${N}，太简单`);
  assert.ok(avg(T) > 100 && avg(T) < 300, `手抖档通关平均 ${avg(T).toFixed(0)} 秒`);
  assert.ok(fly > N && chg >= N * 0.8 && stun > 5 && tele > N * 10, `样本太空：飞 ${fly} 壳 ${chg} 翻 ${stun} 预警 ${tele}`);
  assert.ok(hurtRuns > N * 0.8, '手抖档大多数局里挨过咬');
});

test('莽撞档（只跑不打）一定输；什么都不做也会输；输了重开能正常玩', async () => {
  const C = await load();
  for (let s = 1; s <= 12; s++) {
    const { sim } = C.runBot(s, 'reckless', 300);
    assert.strictEqual(sim.state, 'dead', `种子 ${s}：只跑不打居然没输（${sim.state}，盖了 ${C.sealedCount(sim)} 个）`);
  }
  for (let s = 1; s <= 6; s++) {
    const sim = C.createSim(s);
    while (sim.state === 'play' && sim.t < 200) C.stepSim(sim, 1 / 30, {});
    assert.strictEqual(sim.state, 'dead', '站着不动应该会被淹没');
    assert.ok(sim.t > 12 && sim.t < 90, `站着不动撑了 ${sim.t.toFixed(0)} 秒，开局要留出看清楚的时间`);
  }
  assert.strictEqual(C.runBot(3, 'precise', 400).sim.state, 'won', '重开一局能正常通关');
});

test('预警提前量：每一次挨咬之前，那只虫都先亮过预警，提前量不短于它的蓄力时间', async () => {
  const C = await load(); let hurts = 0; const kinds = new Set();
  for (let s = 1; s <= 10; s++) {
    const sim = C.createSim(s), bot = C.makeBot('shaky', s), told = new Map();
    while (sim.state === 'play' && sim.t < 300) {
      C.stepSim(sim, 1 / 30, C.botInput(sim, bot, 1 / 30));
      for (const e of sim.events) {
        if (e.type === 'telegraph') told.set(e.id, e.t);
        if (e.type === 'hurt') {
          hurts++; kinds.add(e.kind);
          assert.ok(told.has(e.id), `${e.kind} 没预警就咬人`);
          const lead = e.t - told.get(e.id);
          assert.ok(lead >= C.TYPES[e.kind].wind - 0.05, `${e.kind} 预警只提前了 ${lead.toFixed(2)} 秒`);
        }
      }
    }
  }
  assert.ok(hurts > 30 && kinds.size === 3, `样本里三种虫都咬到过人才算数：${hurts} 次，${[...kinds]}`);
});

test('喷雾：隔着柱子喷不到；带壳的正面只吃三成，翻肚后吃双倍', async () => {
  const C = await load();
  const mk = (type, x, z, yaw) => { const sim = C.createSim(1, { god: true }); sim.spawnT = 1e9; sim.waveLeft = 0; const e = C.spawnAt(sim, type, x, z); e.x = x; e.z = z; e.state = 'stun'; e.t = -99; e.yaw = yaw; return { sim, e }; };
  const spray = (sim, n = 30) => { const e = sim.enemies[0], p = sim.player, pitch = Math.atan2(e.y + (e.type === 'charger' ? 0.7 : 0.35) - C.P.eye, Math.hypot(e.x - p.x, e.z - p.z)); for (let i = 0; i < n; i++) C.stepSim(sim, 1 / 60, { fire: true, yaw: Math.PI, pitch }); };
  let { sim, e } = mk('runner', 0, -49, 0); spray(sim);
  const open = C.TYPES.runner.hp - e.hp;
  assert.ok(open > 15, `空地上半秒应喷掉不少血，实际 ${open.toFixed(1)}`);
  ({ sim, e } = mk('runner', 5.35, -50.5, 0)); sim.player.x = 5.35; sim.player.z = -54.4; spray(sim);
  assert.strictEqual(e.hp, C.TYPES.runner.hp, '柱子后面的不该掉血');
  ({ sim, e } = mk('charger', 0, -47, 0)); e.state = 'recover'; e.flip = 0; spray(sim); const front = C.TYPES.charger.hp - e.hp;
  ({ sim, e } = mk('charger', 0, -47, Math.PI)); e.state = 'recover'; spray(sim); const back = C.TYPES.charger.hp - e.hp;
  ({ sim, e } = mk('charger', 0, -47, 0)); spray(sim); const belly = C.TYPES.charger.hp - e.hp;
  assert.ok(front > 0 && Math.abs(front / back - 0.3) < 0.03, `正面/背面 = ${(front / back).toFixed(2)}，应约 0.3`);
  assert.ok(Math.abs(belly / back - 2) < 0.1, `翻肚/背面 = ${(belly / back).toFixed(2)}，应约 2`);
});

test('喷雾好瞄：准星偏 6 度以内算喷中并亮起「对准了」，偏 20 度不算；近处更宽', async () => {
  const C = await load();
  const run = (dist, off) => { const sim = C.createSim(1, { god: true }); sim.spawnT = 1e9; sim.waveLeft = 0; const e = C.spawnAt(sim, 'runner', 0, -54 + dist); e.x = 0; e.z = -54 + dist; e.state = 'stun'; e.t = -99;
    const pitch = Math.atan2(0.35 - C.P.eye, dist); let on = 0;
    for (let i = 0; i < 20; i++) { C.stepSim(sim, 1 / 60, { fire: true, yaw: Math.PI + off, pitch }); if (sim.player.aimOn) on++; }
    return { lost: C.TYPES.runner.hp - e.hp, on }; };
  for (const d of [3, 6, 10]) {
    const hit = run(d, 6 * Math.PI / 180), miss = run(d, 20 * Math.PI / 180);
    assert.ok(hit.lost > 5 && hit.on === 20, `${d} 米处偏 6 度应喷中，实际掉血 ${hit.lost.toFixed(1)}`);
    assert.ok(miss.lost === 0 && miss.on === 0, `${d} 米处偏 20 度不该喷中，实际掉血 ${miss.lost.toFixed(1)}`);
  }
  assert.ok(run(2.5, 11 * Math.PI / 180).lost > 0, '贴近时偏 11 度也喷得到');
  const idle = C.createSim(1, { god: true }); idle.spawnT = 1e9; idle.waveLeft = 0; const e = C.spawnAt(idle, 'runner', 0, -48); e.x = 0; e.z = -48; e.state = 'stun'; e.t = -99;
  C.stepSim(idle, 1 / 60, { yaw: Math.PI, pitch: Math.atan2(0.35 - C.P.eye, 6) });
  assert.ok(idle.player.aimOn && e.hp === C.TYPES.runner.hp, '没按喷的时候准星也会提示对准了，但不掉血');
});

test('封盖：按住 4.6 秒盖上；被咬会打断并倒退；盖上后回血加一罐，出虫口少一个', async () => {
  const C = await load();
  const sim = C.createSim(2, { god: false }); sim.spawnT = 1e9; sim.waveLeft = 0; sim.drains.forEach(d => { d.woke = true; });
  const d = sim.drains[0]; sim.player.x = d.x; sim.player.z = d.z + 1.2;
  for (let i = 0; i < 120; i++) C.stepSim(sim, 1 / 60, { use: true });
  const half = d.prog; assert.ok(half > 0.4 && half < 0.5, `两秒应到四成多，实际 ${half.toFixed(2)}`);
  const e = C.spawnAt(sim, 'runner', d.x, d.z + 2.6); e.state = 'windup'; e.t = 0.3;
  for (let i = 0; i < 20; i++) C.stepSim(sim, 1 / 60, { use: true });
  assert.ok(d.prog < half, `被咬后进度应倒退，${half.toFixed(2)} → ${d.prog.toFixed(2)}`);
  assert.ok(sim.sealLock > 0 && sim.player.hp < C.P.hp);
  e.dead = true; const cans = sim.player.cans;
  for (let i = 0; i < 600 && !d.sealed; i++) C.stepSim(sim, 1 / 60, { use: true });
  assert.ok(d.sealed && sim.stage === 1 && sim.player.cans === cans + 1, '盖上后进下一阶段并加一罐');
});

test('不会弹尽粮绝：药全空时凉拖照样拍得死，补给箱 30 秒内会再有', async () => {
  const C = await load();
  const sim = C.createSim(4, { god: true }); sim.spawnT = 1e9; sim.waveLeft = 0; sim.player.tank = 0; sim.player.cans = 0;
  const e = C.spawnAt(sim, 'runner', 0, -52.2); e.state = 'recover'; e.t = -99;
  C.stepSim(sim, 1 / 60, { slap: true, yaw: Math.PI }); for (let i = 0; i < 20; i++) C.stepSim(sim, 1 / 60, { yaw: Math.PI });
  assert.ok(e.dead, '一拖鞋拍死一只爬的');
  const c = sim.crates[0]; sim.player.x = c.x; sim.player.z = c.z + 1; C.stepSim(sim, 1 / 60, {});
  assert.strictEqual(sim.player.cans, 2, '走到红箱子旁拿到两罐');
  let t = 0; while (c.t > 0 && t < 40) { C.stepSim(sim, 1 / 30, {}); t += 1 / 30; }
  assert.ok(t < 30, `补给箱 ${t.toFixed(0)} 秒后再有`);
});

test('公开仓：页面与文档里没有邮箱、手机号和计划外的外链', async () => {
  const fs = require('fs'), path = require('path'), root = path.join(__dirname, '..');
  for (const f of ['index.template.html', 'README.md', 'README_CN.md', 'SPEC.md']) {
    const s = fs.readFileSync(path.join(root, f), 'utf8');
    assert.ok(!/@(gmail|qq|163)\.|\b1[3-9]\d{9}\b/.test(s), f + ' 里有邮箱或手机号');
    assert.ok(!/https?:\/\/(?!aliceljy\.github\.io|127\.0\.0\.1|github\.com\/(AliceLJY|mrdoob))/.test(s.replace(/<!--[\s\S]*?-->/g, '')), f + ' 里有计划外的外链');
  }
});
