// 测试用的小工具：跑整局、采样。自动驾驶本体在 src/core.js（定格机位也用它）。
const CLIPS = require('../src/clips.js');
const M = require('../src/core.js');

// 跑一整局，每一步采样：返回统计、用时、卡死窗口、事件
function sample(skill, seed, maxMs = 400000) {
  const g = M.create(CLIPS, { seed });
  const d = M.makeDriver(skill, seed);
  const log = { stuck: 0, slideOut: 0, warnToHit: [], attackXs: [] };
  let used = 0, still = 0, lastKey = '';
  while (used < maxMs && !(g.phase === 'end' && g.endT > 500)) {
    d.think(g);
    M.advance(g, M.STEP);
    used += M.STEP;
    for (const a of [g.p, g.e]) {
      if (a.act === 'attack' && (a.x < M.MIN_X - 0.01 || a.x > M.MAX_X + 0.01)) log.slideOut++;
    }
    // 卡死：按着方向键，但位置和阶段都不变
    const moving = g.held.left || g.held.right;
    const key = [g.p.x.toFixed(1), g.phase, g.stage, g.meter, g.helmets, g.qi].join('|');
    if (moving && g.p.act === 'walk' && key === lastKey) still++; else still = 0;
    if (still === 120) log.stuck++;
    lastKey = key;
  }
  return { g, ms: used, log, done: g.phase === 'end' };
}
module.exports = { sample, CLIPS, M };
