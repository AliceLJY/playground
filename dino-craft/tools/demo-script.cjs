// 演示片的动作编排（tools/demo.cjs 调用）。时间都是视频秒；种子 731。
// 出生点在一道土坎上，前面是一片洼地：开局霸王龙从洼地冲上来 → 开火打倒 → 在右手边挖一个坑 → 打开工作台做火把
// → 沿坎沿搭一道木板矮墙、两头各立一根桩、桩顶插火把 → 等白天补刷的那只霸王龙在洼地远处出现
// → 天色转暗（这一段把游戏钟每帧多拨一些，模拟本身照常一步 1/60 秒）→ 点亮头灯 → 那只霸王龙从黑暗里冲上来 → 开火守住。
const wrap = a => Math.atan2(Math.sin(a), Math.cos(a));
module.exports = async (k) => {
  const { start, wait, until, hold, stick, lookTo, aim, creature, cue, nearestRex, setClock } = k;
  const dead = id => s => { const e = s.cr.find(c => c.id === id); return !e || e.dead; };
  const tap = async (target, after = 0.3) => { start('R', hold(typeof target === 'string' ? await k.rect(target) : target, 0.09)); await wait(after); };

  // 一、霸王龙正冲过来：右手先把准星对上，按住开火；左手在看向区跟着它微调
  const rex = nearestRex(k.st);
  await wait(0.35);
  start('R', aim(creature(rex.id), 0.45, [300, 300], 0.35)); await wait(0.5);
  cue('fire1');
  start('R', hold('fire', 6));
  start('L', aim(creature(rex.id), 6, [205, 330], 0.25, 5));
  await until(dead(rex.id), 5, 'rex1 dead');
  cue('rex1-dead'); await wait(0.3);
  k.F.R.beh = null; k.F.L.beh = null; await wait(0.25);

  // 二、往右手边平地看，按住挖掘，挖出一个小坑
  const y0 = k.st.p.yaw;
  start('R', lookTo(y0 - 1.35, -0.6, 0.36)); await wait(0.42);
  cue('dig'); start('R', hold('mine', 0.95));
  start('L', lookTo(y0 - 1.22, -0.68, 0.9, [210, 330])); await wait(1.05);
  k.F.L.beh = null;
  console.log('dug', k.st.stats.mined);

  // 三、工作台：做一份火把（打开工作台时游戏暂停，这是游戏本来的样子）
  cue('craft'); await tap('#craft-open', 0.45);
  await tap('.recipe:nth-child(2)', 0.5); cue('crafted');
  await tap('#craft-close', 0.3);

  // 四、沿坎沿搭木板矮墙、两头立桩、桩顶插火把：每一块先算好准星要对的位置（落点用页面射线核过），左手对准、右手点放置
  async function topY(x, z) { for (let y = 40; y > 1; y--) { const b = await k.block(x, y, z); if (b && b !== 6) return y; } return 0; }
  async function aimFor(cell) {      // 对准 cell 下面那块的顶面，射线落点正好是 cell 才算数
    const [x, y, z] = cell, s = k.st;
    for (const [ox, oz] of [[0, 0], [0, 0.25], [0.25, 0], [-0.25, 0], [0, -0.25], [0.3, 0.3], [-0.3, 0.3], [0.3, -0.3], [-0.3, -0.3]]) {
      const tx = x + 0.5 + ox, tz = z + 0.5 + oz, dx = tx - s.p.x, dz = tz - s.p.z, yaw = Math.atan2(-dx, -dz), pitch = Math.atan2(y + 0.02 - s.p.y - 1.62, Math.hypot(dx, dz));
      const r = await k.probe(yaw, pitch);
      if (r && r.px === x && r.py === y && r.pz === z) return [yaw, pitch];
    }
    return null;
  }
  async function put(x, z, first) {
    const cell = [x, (await topY(x, z)) + 1, z], a = await aimFor(cell);
    if (!a) { console.log('NO-AIM', cell.join(',')); return; }
    start('L', lookTo(a[0], a[1], first ? 0.34 : 0.17, [first ? 175 : 215, 330])); await wait(first ? 0.38 : 0.2);
    start('R', hold('place', 0.08)); await wait(0.13);
  }
  cue('place');
  const row = [[2, 5], [1, 5], [0, 5], [-1, 5], [-2, 5]];
  for (let i = 0; i < row.length; i++) await put(...row[i], i === 0);
  await put(-2, 5); await put(2, 5);                       // 两头的桩
  await tap('.slot:nth-child(5)', 0.25); cue('torch-slot'); // 换到火把
  await put(2, 5, true); await put(-2, 5);
  await tap('.slot:nth-child(1)', 0.2);                      // 换回木板
  console.log('placed', k.st.stats.placed, 'plank', k.st.inv.plank, 'torch', k.st.inv.torch);

  // 五、天色转暗：转头看桩顶的火把，游戏钟拨快（模拟本身照常一步 1/60 秒）。白天补刷的那只霸王龙出现在洼地远处之后再入夜，
  //    这样夜里只来这一只（入夜后才补刷会一次刷两只，贴脸乱咬）
  start('L', lookTo(k.st.p.yaw + 0.55, -0.12, 0.45, [215, 330])); await wait(0.5);
  const ids0 = new Set(k.st.cr.map(c => c.id));
  cue('dusk'); setClock((82.2 - k.st.time) / 3.4 - 1);
  start('L', lookTo(k.st.p.yaw + 0.25, -0.02, 2.6, [215, 330]));
  await until(s => s.cr.some(c => c.type === 'rex' && !ids0.has(c.id)), 6, 'day respawn');
  const late = k.st.cr.find(c => c.type === 'rex' && !ids0.has(c.id));
  cue('respawn', late && { id: late.id, d: +Math.hypot(late.x - k.st.p.x, late.z - k.st.p.z).toFixed(1), time: k.st.time });
  setClock(Math.max(0, (83.1 - k.st.time) / 0.4 - 1));
  await until(s => s.night, 1.5, 'night'); setClock(0); cue('night', { time: k.st.time });
  await wait(0.45);
  await tap('#lamp', 0.35); cue('lamp');
  start('L', lookTo(y0 - 0.15, 0.02, 0.5, [300, 330])); await wait(0.6);
  // 七、夜里：左手一直跟着最近的那只，进了 22 格右手按住开火，打倒为止
  const alive = s => s.cr.filter(c => c.type === 'rex' && !c.dead).map(c => ({ c, d: Math.hypot(c.x - s.p.x, c.z - s.p.z) })).sort((a, b) => a.d - b.d);
  const kills0 = k.st.stats.kills, end = k.now() + 12;
  let target = null, firing = false;
  while (k.now() < end && k.st.stats.kills - kills0 < 1) {
    const list = alive(k.st), near = list[0], cur = list.find(e => e.c.id === target);
    if (near && near.d < 34 && (!cur || (cur.c.id !== near.c.id && near.d < cur.d - 3))) {
      const prev = target; target = near.c.id; cue('target', { id: target, d: +near.d.toFixed(1) });
      start('L', aim(creature(target), 20, [prev ? 230 : 215, 320], 0.35, 10));
    }
    if (near && near.d < 22 && !firing) { firing = true; cue('fire'); start('R', hold('fire', 30)); }
    await wait(1 / 30);
  }
  cue('night-done', { kills: k.st.stats.kills - kills0 });
  await wait(0.35); k.F.R.beh = null; await wait(0.3); k.F.L.beh = null;
  // 八、打着头灯往洼地里走，拾两份肉，吃一口；再回头看坎上的火把
  cue('walk');
  start('L', stick(6, [0.05, 0.78]));
  start('R', lookTo(y0, 0.06, 0.5, [300, 300])); await wait(0.6);
  await until(s => s.inv.meat >= 4, 4.5, 'pickups'); cue('pickups', { meat: k.st.inv.meat });
  k.F.L.beh = null; await wait(0.3);
  cue('eat'); await tap('#eat', 0.6);
  const back = k.st.p.yaw;          // 回头：两下快划，转半圈多一点，看坎上的两支火把
  const camp = k.point(0.5, 23.2, 5.5)(k.st);
  start('R', lookTo(back + wrap(camp[0] - back) / 2, camp[1] / 2, 0.42, [340, 300])); await wait(0.5);
  start('R', lookTo(camp[0], camp[1], 0.5, [340, 300])); await wait(1.3);
};
