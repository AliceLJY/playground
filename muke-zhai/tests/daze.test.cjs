// 穆柯寨 · 11-19：收场时杨宗保演一次「脸红愣神」（Grok 单拍），演完再并肩亮相。
const test = require('node:test');
const assert = require('node:assert/strict');
const CLIPS = require('../src/clips.js');
const M = require('../src/core.js');

test('D1 打满心动进收场：杨宗保换上「愣神」图集、整段演完、最后一帧回到原站姿，再走去并肩', () => {
  assert.ok(CLIPS.zongbao.daze && CLIPS.zongbao.daze.count >= 20, '杨宗保有愣神图集');
  assert.ok(!CLIPS.mengliang.daze, '孟良没有愣神图集');
  const g = M.create(CLIPS, { seed: 2 });
  const d = M.makeDriver('precise', 2);
  for (let t = 0; t < 120000 && g.phase !== 'finale'; t += M.STEP) { d.think(g); M.advance(g, M.STEP); }
  assert.equal(g.phase, 'finale');
  assert.equal(g.e.who, 'zongbao');
  const seen = new Set(); let maxFrame = -1, dazeStart = null, step1At = null;
  for (let t = 0; t < 8000; t += M.STEP) {
    M.advance(g, M.STEP);
    const f = M.frameOf(g.e);
    if (g.e.act === 'daze') { seen.add(f.clip); maxFrame = Math.max(maxFrame, f.frame); if (dazeStart == null) dazeStart = g.finT; }
    if (g.finStep >= 1 && step1At == null) { step1At = g.finT; break; }
  }
  assert.deepEqual([...seen], ['daze'], `愣神时画的是 ${[...seen]}`);
  assert.equal(maxFrame, CLIPS.zongbao.daze.count - 1, '愣神整段放完');
  assert.ok(step1At != null && step1At <= 5000 + M.STEP, `收场第一步在 ${step1At} 毫秒结束`);
  assert.ok(step1At - dazeStart >= 35 * 75, '演完才往下走');
});

test('D2 没有愣神图集的角色进 daze 退回待机图集，不报错', () => {
  const g = M.create(CLIPS, { seed: 1 });
  g.e.act = 'daze'; g.e.t = 300;
  const f = M.frameOf(g.e);
  assert.equal(g.e.who, 'mengliang');
  assert.equal(f.clip, 'idle');
});
