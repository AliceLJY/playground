// 导览剧本检查（SPEC 验收 6）：tourAt 只依赖时间，进度单调、连续，三处放慢够长。
const test = require('node:test');
const assert = require('node:assert');
const load = () => Promise.all([import('../src/model.js'), import('../src/tour.js')]);

test('SPEC 6: s(t) 单调不减、30 帧下相邻帧变化 < 0.25，0 秒是 0，结束时拆完', async () => {
  const [M, T] = await load();
  assert.strictEqual(T.sAt(0), 0);
  assert.strictEqual(T.sAt(T.TOUR_S), M.S_MAX);
  let prev = 0;
  for (let i = 0; i <= T.TOUR_S * 30; i++) {
    const s = T.tourAt(i / 30).s;
    assert.ok(s >= prev - 1e-9, `t=${(i / 30).toFixed(2)} 进度倒退`);
    assert.ok(s - prev < 0.25, `t=${(i / 30).toFixed(2)} 一帧跳了 ${(s - prev).toFixed(2)}`);
    prev = s;
  }
  // 纯函数：同一时刻算两次一样
  assert.deepStrictEqual(T.tourAt(17.3), T.tourAt(17.3));
  // 第 0 帧：读数全 0、机器正放（分享卡和封面）
  const c0 = M.counters(T.sAt(0));
  assert.deepStrictEqual([c0.steps, c0.screws, c0.bits, c0.connectors], [0, 0, 0, 0]);
});

test('SPEC 6: 三处放慢（掀开底盖、拆风扇看到 SSD、拔出 SSD）各至少 6 秒；顺带看内存只占 2–3 秒', async () => {
  const [M, T] = await load();
  const dur = (a, b) => T.timeAt(b) - T.timeAt(a);
  assert.ok(dur(1, 8) >= 6, `底盖 ${dur(1, 8).toFixed(1)} s`);
  assert.ok(T.timeAt(M.LOOK) - T.timeAt(12) >= 6, '内板翻开到看到 SSD');
  assert.ok(dur(19, M.S_MAX) >= 6, `SSD ${dur(19, M.S_MAX).toFixed(1)} s`);
  // 进度停在 LOOK 与 LOOK+1 之间（不含前面风扇拿走后的停顿）的时长
  let look = 0; for (let t = 0; t < T.TOUR_S; t += 0.01) { const s = T.sAt(t); if (s > M.LOOK && s < M.LOOK + 1) look += 0.01; }
  assert.ok(look >= 2 && look <= 3, `顺带看内存 ${look.toFixed(1)} s`);
  // timeAt 与 sAt 互逆
  for (const s of [0.5, 3.3, 9.9, 18.5, 21.2, 22.7]) assert.ok(Math.abs(T.sAt(T.timeAt(s)) - s) < 1e-9);
});

test('SPEC 6: 每句旁白停留够读（1 秒 + 每 4 个字 0.25 秒）', async () => {
  const [, T] = await load();
  const caps = T._steps.steps.caption;
  for (let i = 0; i < caps.length - 1; i++) {
    const [t0, text] = caps[i], t1 = caps[i + 1][0];
    if (!text) continue;
    const need = 1 + Math.max(0, text.length / 4 - 3) * 0.25;
    assert.ok(t1 - t0 >= need, `「${text}」只停 ${(t1 - t0).toFixed(1)} s，要 ${need.toFixed(1)} s`);
  }
});
