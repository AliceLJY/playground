// 刀马旦精灵 · 状态机与帧数据：node --test tests/*.test.cjs
// 每条断言对应 README_CN.md「验收」里的条目号。
const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/core.js');
const CLIPS = require('../src/clips.js');

const run = (p, input, ms, dt = 16) => { for (let t = 0; t < ms; t += dt) D.step(p, input, dt); return p; };

test('1 五个动作的帧数据齐全，图集格子与帧数对得上', () => {
  for (const name of ['idle', 'walk', 'attack', 'jump', 'hurt']) {
    const c = CLIPS[name];
    assert.ok(c, `缺 ${name}`);
    assert.equal(c.ms.length, c.count, `${name} 每帧都要有时长`);
    assert.ok(c.cols >= 1 && c.cell[0] > 0 && c.cell[1] > 0, `${name} 图集格子尺寸非法`);
    assert.ok(c.anchor[1] > c.cell[1] * 0.9, `${name} 锚点应在脚底（格子下沿附近）`);
  }
  assert.equal(CLIPS.idle.loop, true);
  assert.equal(CLIPS.walk.loop, true);
  for (const n of D.ONE_SHOTS) assert.equal(CLIPS[n].loop, false, `${n} 应是单次动作`);
});

test('2 单次动作时长落在游戏可用区间：出枪 0.5–1 秒，跳 0.6–1.2 秒，受击 0.3–0.8 秒', () => {
  const s = (n) => D.durationMs(CLIPS[n]) / 1000;
  assert.ok(s('attack') >= 0.5 && s('attack') <= 1.0, `出枪 ${s('attack')} 秒`);
  assert.ok(s('jump') >= 0.6 && s('jump') <= 1.2, `跳 ${s('jump')} 秒`);
  assert.ok(s('hurt') >= 0.3 && s('hurt') <= 0.8, `受击 ${s('hurt')} 秒`);
});

test('3 按住方向键走起来并转向，松开回到待机', () => {
  const p = D.create(CLIPS);
  run(p, { left: true }, 400);
  assert.equal(p.state, 'walk');
  assert.equal(p.face, -1);
  const x0 = p.x;
  run(p, { right: true }, 400);
  assert.equal(p.face, 1);
  assert.ok(p.x > x0, '往右走 x 应增大');
  run(p, {}, 50);
  assert.equal(p.state, 'idle');
});

test('4 跑比走快：同样 1 秒，跑的位移约为走的 2.5 倍，步频按倍速加快', () => {
  const walk = run(D.create(CLIPS, { x: 100, maxX: 5000 }), { right: true }, 1000);
  const runp = run(D.create(CLIPS, { x: 100, maxX: 5000 }), { right: true, run: true }, 1000);
  const ratio = (runp.x - 100) / (walk.x - 100);
  assert.ok(ratio > 2.2 && ratio < 2.8, `位移比 ${ratio.toFixed(2)}`);
  assert.ok(runp.plays.walk >= 1);
});

test('5 出招播完一次就回到待机，期间不接第二招', () => {
  const p = D.create(CLIPS);
  assert.equal(D.trigger(p, 'attack'), true);
  run(p, {}, 100);
  assert.equal(D.trigger(p, 'jump'), false, '出枪没收完不能起跳');
  assert.equal(p.state, 'attack');
  run(p, {}, D.durationMs(CLIPS.attack) + 100);
  assert.equal(p.state, 'idle');
  assert.equal(p.plays.attack, 1);
});

test('6 出招时站定不滑步，收招后若还按着方向键直接接着走', () => {
  const p = D.create(CLIPS);
  D.trigger(p, 'attack');
  const x0 = p.x;
  run(p, { right: true }, D.durationMs(CLIPS.attack) - 50);
  assert.equal(p.x, x0, '出枪中不应移动');
  run(p, { right: true }, 200);
  assert.equal(p.state, 'walk');
});

test('7 角色走不出舞台左右边界', () => {
  const p = run(D.create(CLIPS, { minX: 80, maxX: 880 }), { right: true, run: true }, 8000);
  assert.equal(p.x, 880);
  run(p, { left: true, run: true }, 8000);
  assert.equal(p.x, 80);
});

test('8 帧坐标不越出图集：每个动作最后一帧的格子仍在图集范围内', () => {
  for (const [n, c] of Object.entries(CLIPS)) {
    const rows = Math.ceil(c.count / c.cols);
    const last = D.cellOf(c, c.count - 1);
    assert.ok(last.sx + last.w <= c.cols * c.cell[0], `${n} 横向越界`);
    assert.ok(last.sy + last.h <= rows * c.cell[1], `${n} 纵向越界`);
    assert.deepEqual(D.cellOf(c, c.count + 5), last, `${n} 超出帧号应夹到最后一帧`);
  }
});
