// 最靓的仔 · 逻辑检查。在本目录运行：node --test tests/*.test.cjs
// 每条测试写明守的是 SPEC.md 哪一条；驱动的是页面同一份 src/model.js 与 src/tour.js。
// 像素、帧率、布局在浏览器里由 tools/browser-check.cjs 检查。
const test = require('node:test');
const assert = require('node:assert');
const load = () => Promise.all([import('../src/model.js'), import('../src/tour.js')]);
const d = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const SPEEDS = [0, 0.15, 0.3, 0.6, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4, 1.5];

test('SPEC 1: 实测数字——最高 1.5 m/s，高速步频趋近 27 Hz，1.0 起四足、1.25 起二足', async () => {
  const [M] = await load();
  assert.strictEqual(M.SPEED_MAX, 1.5);
  const fTop = M.strideFrequency(1.5);
  assert.ok(fTop > 24 && fTop <= 27, `1.5 m/s 时步频 ${fTop.toFixed(1)} Hz，应在 24–27`);
  // 高速靠步幅不靠步频：1.0→1.5 步频增幅 < 15%，步幅增幅 > 25%
  assert.ok(M.strideFrequency(1.5) / M.strideFrequency(1.0) < 1.15, '1.0→1.5 m/s 步频不该再明显上升');
  assert.ok(M.strideLength(1.5) / M.strideLength(1.0) > 1.25, '1.0→1.5 m/s 应主要靠步幅变长');
  assert.strictEqual(M.gaitZone(0.99).id, 'six'); assert.strictEqual(M.gaitZone(1.1).id, 'four'); assert.strictEqual(M.gaitZone(1.3).id, 'two');
  const bl = M.bodyLengthsPerSecond(1.5);
  assert.ok(bl > 40 && bl < 50, `1.5 m/s = ${bl.toFixed(1)} 体长/秒，实测约 50（体长 30 mm 时）`);
  assert.ok(M.dutyFactor(1.2) < 0.5 && M.aerialFraction(1.2) > 0, '1 m/s 以上应出现腾空相');
});

test('SPEC 2: 每条腿每一段骨长在任何速度、任何时刻、展品姿态里都不变（误差 < 0.01 mm）', async () => {
  const [M] = await load();
  for (const v of SPEEDS) for (const swag of [0, 0.5, 1]) for (let i = 0; i < 40; i++) {
    const p = M.pose(v, i * 0.137, { swag, cycle: i / 40 });
    for (const l of p.legs) {
      assert.ok(Math.abs(d(l.H, l.C) - l.coxa) < 0.01, `v=${v} swag=${swag} ${l.id} 基节 ${d(l.H, l.C).toFixed(3)} ≠ ${l.coxa}`);
      assert.ok(Math.abs(d(l.C, l.K) - l.femur) < 0.01, `v=${v} swag=${swag} ${l.id} 股节 ${d(l.C, l.K).toFixed(3)} ≠ ${l.femur}`);
      assert.ok(Math.abs(d(l.K, l.A) - l.tibia) < 0.01, `v=${v} swag=${swag} ${l.id} 胫节 ${d(l.K, l.A).toFixed(3)} ≠ ${l.tibia}`);
    }
  }
});

test('SPEC 3: 着地的脚踩在地上、不打滑——相对地面的速度为 0（误差 < 3%）', async () => {
  const [M] = await load();
  for (const v of [0.3, 0.6, 0.9, 1.2, 1.5]) {
    const f = M.strideFrequency(v), dc = 0.002, dtBug = dc / f; // 周期推进 dc，对应真实时间 dc/f 秒
    let checked = 0;
    for (let i = 0; i < 50; i++) {
      const c = i / 50, a = M.pose(v, 0, { cycle: c }), b = M.pose(v, 0, { cycle: c + dc });
      for (let k = 0; k < 6; k++) {
        const la = a.legs[k], lb = b.legs[k];
        if (!la.stance || !lb.stance) continue;
        assert.ok(Math.abs(la.P[1]) < 1e-6, `v=${v} ${la.id} 着地却离地 ${la.P[1].toFixed(3)} mm`);
        const footSpeed = (lb.P[0] - la.P[0]) / dtBug; // mm/s，身体坐标里脚往后划的速度
        assert.ok(Math.abs(footSpeed + v * 1000) / (v * 1000) < 0.03, `v=${v} ${la.id} 脚往后划 ${(-footSpeed).toFixed(0)} mm/s，地面走 ${v * 1000} mm/s`);
        checked++;
      }
    }
    assert.ok(checked > 20, `v=${v} 只核到 ${checked} 个着地样本，测试是空验`);
  }
});

test('SPEC 4: 一个步态周期里六只脚的垂直力平均下来等于体重（误差 < 2%）', async () => {
  const [M] = await load();
  for (const v of [0.3, 0.6, 0.9, 1.1, 1.3, 1.5]) {
    let sum = 0; const N = 2000;
    for (let i = 0; i < N; i++) sum += M.pose(v, 0, { cycle: i / N }).totalLoad;
    const mean = sum / N;
    assert.ok(Math.abs(mean - M.WEIGHT_MN) / M.WEIGHT_MN < 0.02, `v=${v} 平均 ${mean.toFixed(2)} mN，体重 ${M.WEIGHT_MN.toFixed(2)} mN`);
  }
  const s = M.pose(0, 0, { swag: 1 });
  assert.ok(Math.abs(s.totalLoad - M.WEIGHT_MN) < 0.01, `展品姿态两只后足合计 ${s.totalLoad.toFixed(2)}，应等于体重`);
});

test('SPEC 5: 没有东西插进地里——腿上每个关节和腹尾都在地面之上（容差 0.3 mm）', async () => {
  const [M] = await load();
  for (const v of SPEEDS) for (const swag of [0, 0.3, 0.7, 1]) for (let i = 0; i < 60; i++) {
    const p = M.pose(v, i * 0.21, { swag, cycle: i / 60 });
    for (const l of p.legs) for (const k of ['H', 'C', 'K', 'A', 'P']) assert.ok(l[k][1] > -0.3, `v=${v} swag=${swag} ${l.id}.${k} 在地下 ${l[k][1].toFixed(2)} mm`);
    assert.ok(p.tip[1] > -0.3, `v=${v} swag=${swag} 腹尾在地下 ${p.tip[1].toFixed(2)} mm`);
  }
  const s = M.pose(0, 0, { swag: 1 });
  assert.ok(s.tip[1] < 2.5, `展品姿态腹尾应点地当支撑，现在离地 ${s.tip[1].toFixed(2)} mm`);
});

test('SPEC 6: 步态——低速两组三足交替；1.2 m/s 前足离地；1.5 m/s 只剩后足；展品姿态两后足站', async () => {
  const [M] = await load();
  const A = ['L1', 'R2', 'L3'], B = ['R1', 'L2', 'R3'];
  let sawA = 0, sawB = 0;
  for (let i = 0; i < 100; i++) {
    const down = M.pose(0.6, 0, { cycle: i / 100 }).legs.filter((l) => l.stance).map((l) => l.id).sort().join();
    if (down === [...A].sort().join()) sawA++; if (down === [...B].sort().join()) sawB++;
  }
  assert.ok(sawA > 30 && sawB > 30, `0.6 m/s 两组三足各应占一段：A 组 ${sawA}/100，B 组 ${sawB}/100`);
  for (let i = 0; i < 50; i++) {
    const p12 = M.pose(1.2, 0, { cycle: i / 50 }), p15 = M.pose(1.5, 0, { cycle: i / 50 });
    assert.ok(p12.legs.filter((l) => l.pair === 0).every((l) => !l.stance && l.load === 0), '1.2 m/s 前足不该着地');
    assert.ok(p15.legs.filter((l) => l.pair < 2).every((l) => !l.stance && l.load === 0), '1.5 m/s 只该后足着地');
  }
  const s = M.pose(0, 0, { swag: 1 });
  assert.deepStrictEqual(s.legs.filter((l) => l.stance).map((l) => l.id).sort(), ['L3', 'R3']);
  assert.ok(s.pitchDeg > 75, `展品姿态要立起来，抬头角 ${s.pitchDeg.toFixed(0)}°`);
});

test('SPEC 7: 导览是时间的纯函数，速度与机位不跳变，首尾接得上', async () => {
  const [M, T] = await load();
  for (const t of [0, 3.3, 17.7, 30.1]) assert.deepStrictEqual(JSON.stringify(T.tourAt(t)), JSON.stringify(T.tourAt(t)), `t=${t} 两次结果不同`);
  let prev = T.tourAt(0);
  for (let i = 1; i <= T.TOUR_S * 60; i++) {
    const s = T.tourAt(i / 60);
    assert.ok(Math.abs(s.v - prev.v) < 0.03, `t=${(i / 60).toFixed(2)} 速度一帧跳了 ${(s.v - prev.v).toFixed(3)} m/s`);
    for (const k of ['swag', 'wings', 'explode']) assert.ok(Math.abs(s[k] - prev[k]) < 0.05, `t=${(i / 60).toFixed(2)} ${k} 一帧跳了 ${(s[k] - prev[k]).toFixed(3)}`);
    assert.ok(s.cycle >= prev.cycle - 1e-9 || i === T.TOUR_S * 60, '步态周期不能倒退');
    prev = s;
  }
  const a = T.tourAt(0), z = T.tourAt(T.TOUR_S - 1e-6);
  assert.ok(Math.abs(a.v - z.v) < 0.01 && a.swag === 0 && z.swag < 0.01, '导览结尾要回到开头的状态');
  assert.ok(T._tracks.steps.view.every(([, n]) => M.VIEWS[n]), '导览里每个机位都在 VIEWS 里');
  // 每段过渡都要在上一个关键帧之后才开始，否则会在上一帧结束时突然接上半截过渡
  for (const [name, keys] of Object.entries(T._tracks.tracks)) for (let i = 1; i < keys.length; i++) {
    const [t1, , dur = 1.2] = keys[i];
    assert.ok(t1 - dur >= keys[i - 1][0] - 1e-9, `${name} 第 ${i} 个关键帧的过渡从 ${t1 - dur} 开始，早于上一个关键帧 ${keys[i - 1][0]}`);
  }
});

test('SPEC 7: 固定机位落在剧本对应的状态上', async () => {
  const [, T] = await load();
  const want = { hero: { v: [0.2, 0.3] }, tripod: { v: [0.85, 0.95] }, four: { v: [1.15, 1.25] }, biped: { v: [1.45, 1.5] }, xray: { xray: true }, explode: { explode: [0.95, 1] }, wings: { wings: [0.95, 1] }, swag: { swag: [0.95, 1] } };
  for (const [name, cond] of Object.entries(want)) {
    const s = T.tourAt(T.SHOTS[name]);
    for (const [k, c] of Object.entries(cond)) {
      if (Array.isArray(c)) assert.ok(s[k] >= c[0] && s[k] <= c[1], `机位 ${name}：${k}=${s[k]} 不在 ${c}`);
      else assert.strictEqual(s[k], c, `机位 ${name}：${k}=${s[k]}，应为 ${c}`);
    }
  }
});
