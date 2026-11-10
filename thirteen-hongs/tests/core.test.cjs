// 无头逻辑测试：node --test tests/*.test.cjs
const test = require('node:test'), assert = require('node:assert');
const load = () => import('../src/core.js');

test('商馆十三座、两条巷，自西向东排列与依据一致', async () => {
  const C = await load();
  assert.deepStrictEqual(C.FACTORIES.map(f => f.id), ['danish', 'spanish', 'french', 'mingqua', 'american', 'paoushun', 'imperial', 'swedish', 'old-english', 'chowchow', 'new-english', 'dutch', 'creek']);
  for (let i = 1; i < C.FACTORIES.length; i++) assert.ok(C.FACTORIES[i].x0 >= C.FACTORIES[i - 1].x1 - 1e-9, '商馆不应重叠');
  assert.deepStrictEqual(C.LANES.map(l => l.id), ['old-china', 'hog']);
  assert.deepStrictEqual(C.POLES.map(p => p.flag), ['dk', 'es', 'us', 'se', 'gb', 'nl'], '只挂约 1805 年玻璃画题注里的六面旗，自西向东');
  const len = C.FACTORIES[12].x1 - C.FACTORIES[0].x0;
  assert.ok(len > 270 && len < 310, `商馆区东西长约 300 米，实际 ${len}`);
});

test('名场面完整发生一遍：六个阶段依次出现，15 箱全部上艇，然后重来', async () => {
  const C = await load();
  for (const seed of [1805, 7, 42]) {
    const sim = C.createSim(seed); let maxLoaded = 0, t = 0, carried = 0;
    while (sim.event.cycles < 1 && t < 600) { C.stepSim(sim, 0.05); t += 0.05; maxLoaded = Math.max(maxLoaded, sim.event.loaded); if (sim.porters.some(p => p.carry === 'chest')) carried++; }
    assert.strictEqual(sim.event.cycles, 1, `种子 ${seed}：600 秒内应走完一遍`);
    assert.deepStrictEqual(sim.event.log.slice(0, 7), ['wait', 'arrive', 'inspect', 'load', 'hoist', 'depart', 'wait']);
    assert.strictEqual(maxLoaded, C.EVENT.chests, '15 箱应全部落艇');
    assert.ok(carried > 100, '样本里挑夫真的扛过箱子');
    assert.ok(t > 180 && t < 330, `一遍应在 3–5.5 分钟，实际 ${t.toFixed(0)} 秒`);
    assert.strictEqual(sim.event.loaded, 0, '重来后艇上清空');
  }
});

test('茶艇靠泊时停在栈桥头，离栈桥 2–5 米，不压上岸', async () => {
  const C = await load(); const sim = C.createSim();
  while (sim.event.stage !== 'inspect') C.stepSim(sim, 0.05);
  const b = sim.boats[0], j = C.JETTIES[0];
  assert.ok(b.z - j.z1 > 2 && b.z - j.z1 < 5, `艇心离栈桥头 ${(b.z - j.z1).toFixed(2)} 米`);
  assert.ok(Math.abs(b.x - 45) < 0.01 && !b.hidden);
});

test('行人十分钟里不走进建筑、货堆和江里，也没有人卡住不动', async () => {
  const C = await load();
  for (const seed of [1805, 3]) {
    const sim = C.createSim(seed); let bad = 0;
    for (let i = 0; i < 6000; i++) {
      C.stepSim(sim, 0.1);
      for (const a of sim.walkers) { if (C.hitsObstacle(a.x, a.z, 0.15)) bad++; if (a.z > 0 || a.x < C.BOUND.x0 || a.x > C.BOUND.x1) bad++; }
    }
    assert.strictEqual(bad, 0, `种子 ${seed}：越界或穿进障碍 ${bad} 次`);
    const stuck = sim.walkers.filter(a => a.moved < 150).length;
    assert.strictEqual(stuck, 0, `十分钟走不到 150 米的人有 ${stuck} 个`);
  }
});

test('路网连通，两条巷子都有人能走进去', async () => {
  const C = await load(); const g = C.buildGraph();
  const seen = new Set([0]), q = [0];
  while (q.length) for (const n of g[q.pop()].nb) if (!seen.has(n)) { seen.add(n); q.push(n); }
  assert.strictEqual(seen.size, g.length, '路网应是一整块');
  for (const l of C.LANES) assert.ok(g.some(n => n.lane === l.id), l.cn + ' 应有路网节点');
});

test('第一人称：进不了墙、下不了水，能上栈桥、下石阶、进巷子', async () => {
  const C = await load();
  const walk = (x, z, dx, dz, n) => { for (let i = 0; i < n; i++) { const r = C.moveWalker(x, z, dx, dz); x = r.x; z = r.z; } return { x, z }; };
  assert.ok(walk(0, -50, 0, -0.1, 400).z > C.FRONT, '向北顶墙应停在立面外');
  assert.ok(walk(60, -10, 0, 0.1, 400).z <= 0, '向南应停在岸边');
  assert.ok(walk(40, -3, 0, 0.1, 400).z > 12, '栈桥应能走到头');
  const s = walk(12, -3, 0, 0.1, 400); assert.ok(s.z > 3 && C.groundY(s.x, s.z) < -0.9, '石阶应能走下去且视点降低');
  assert.ok(walk(C.LANES[0].cx, -55, 0, -0.1, 900).z < -120, '靖远街应能走到街尾');
  assert.ok(walk(C.LANES[1].cx, -55, 0, -0.1, 900).z < -100, '新豆栏应能走进去');
  assert.ok(walk(-140, -30, -0.1, 0, 400).x >= C.BOUND.x0, '西端有界');
  const g = walk(90, -30, 0, -0.1, 400); assert.ok(g.z > C.GARDEN.z1, '花园围栏挡路');
  const slide = walk(0, -61, 0.07, -0.07, 200); assert.ok(slide.x > 10, '贴墙斜走应沿墙滑动而不是卡死');
});

test('人物各有长相：十类人都在场，衣着组合不少于 60 种', async () => {
  const C = await load(); const sim = C.createSim();
  const kinds = new Set(sim.agents.map(a => a.kind));
  for (const k of ['coolie', 'merchant', 'linguist', 'clerk', 'foreigner', 'sailor', 'hawker', 'boatwoman', 'official', 'monk']) assert.ok(kinds.has(k), '缺 ' + k);
  const looks = new Set(sim.agents.map(a => [a.kind, a.look.top, a.look.bottom, a.look.gown, a.look.hat, a.look.skin].join('|')));
  assert.ok(looks.size >= 60, `衣着组合只有 ${looks.size} 种`);
  const poses = new Set(sim.agents.map(a => a.pose));
  assert.ok(poses.size >= 8, `在做的事只有 ${poses.size} 种：${[...poses]}`);
  assert.ok(sim.agents.length >= 380 && sim.boats.length >= 25, `规模：${sim.agents.length} 人 ${sim.boats.length} 船`);
  assert.ok(sim.agents.filter(a => a.kind !== 'foreigner' && a.kind !== 'sailor' && a.kind !== 'boatwoman' && a.kind !== 'monk').every(a => a.look.queue), '清代男子留辫');
});

test('九个跟随对象都存在，船上的人随船走', async () => {
  const C = await load(); const sim = C.createSim();
  assert.deepStrictEqual(Object.keys(sim.follow).sort(), ['hawker', 'junk', 'merchant', 'monk', 'official', 'porter', 'sampan', 'sedan', 'tea']);
  const b = sim.boats[sim.follow.sampan.boat], a = sim.agents[b.crew[0]];
  const p0 = C.agentWorld(sim, a); for (let i = 0; i < 200; i++) C.stepSim(sim, 0.1); const p1 = C.agentWorld(sim, a);
  assert.ok(Math.hypot(p1.x - p0.x, p1.z - p0.z) > 10, '疍家艇上的人应随艇移动');
  assert.ok(Math.hypot(p1.x - b.x, p1.z - b.z) < 4, '人应留在艇上');
});

test('画面与页面文字不碰禁区题材', () => {
  const fs = require('fs'), path = require('path');
  const text = ['src/core.js', 'src/world.js', 'src/main.js', 'src/audio.js', 'index.template.html'].map(f => fs.readFileSync(path.join(__dirname, '..', f), 'utf8')).join('\n');
  for (const w of ['鸦片', 'opium', '炮', '战争', '地图']) assert.ok(!text.toLowerCase().includes(w), '出现了不该有的字样：' + w);
});

test('轿子绕空地走：十分钟里不撞进建筑和货堆，轿夫和坐轿的人跟着走', async () => {
  const C = await load(); const sim = C.createSim(); const b = sim.boats[sim.follow.sedan.boat]; let bad = 0, dist = 0, px = b.x, pz = b.z;
  for (let i = 0; i < 6000; i++) { C.stepSim(sim, 0.1); if (C.hitsObstacle(b.x, b.z, 0.6) || b.z > -2 || b.z < C.FRONT + 2) bad++; dist += Math.hypot(b.x - px, b.z - pz); px = b.x; pz = b.z; }
  assert.strictEqual(bad, 0, `轿子撞进障碍 ${bad} 次`);
  assert.ok(dist > 600, `十分钟应走 600 米以上，实际 ${dist.toFixed(0)}`);
  assert.strictEqual(b.crew.length, 3);
  for (const id of b.crew) { const w = C.agentWorld(sim, sim.agents[id]); assert.ok(Math.hypot(w.x - b.x, w.z - b.z) < 2 && w.y < 1, '轿夫与乘客应在轿旁、在地面上'); }
});

test('手机档人数约为桌面的六成，名场面照样走完', async () => {
  const C = await load(); const full = C.createSim(1805, 1), lite = C.createSim(1805, 0.6);
  assert.ok(lite.agents.length < full.agents.length * 0.75 && lite.agents.length > 200, `${lite.agents.length} / ${full.agents.length}`);
  let t = 0; while (lite.event.cycles < 1 && t < 600) { C.stepSim(lite, 0.05); t += 0.05; }
  assert.strictEqual(lite.event.cycles, 1);
});
