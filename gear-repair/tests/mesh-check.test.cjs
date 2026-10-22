// 页面每帧用的快速检测与参照实现逐帧对账；运动学；检测耗时预算（SPEC §9 第 3–5 条）。
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { pathToFileURL } = require('url');
const G = require('../src/gear-profile.js');
const M = require('../src/gear-mesh.js');
const P = M.PARAMS;
const THREE_P = import(pathToFileURL(path.join(__dirname, '..', 'vendor', 'three.module.js')).href);
const polyOf = (THREE, v, N) => G.makeGearShape(THREE, v, N, P.m).getPoints(P.curveDivisions).map((p) => [p.x, p.y]);
const polysFor = (THREE, v) => ({ A: polyOf(THREE, v, P.NA), B: polyOf(THREE, v, P.NB), C: polyOf(THREE, v, P.NC), D: polyOf(THREE, v, P.ND) });

// 固定种子的伪随机，保证每次跑同样的帧
function rng(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

test('验收 4 快速检测与参照实现逐帧一致：60 个均分帧 + 20 个随机帧，两版 × 两对', async () => {
  const THREE = await THREE_P;
  const rand = rng(20261023);
  for (const v of G.VERSIONS) {
    const polys = polysFor(THREE, v);
    for (const pr of M.PAIRS) {
      const chk = new M.PairChecker(polys[pr.left], polys[pr.right], pr.dist);
      const tooth = 2 * Math.PI / pr.NL;
      const frames = [];
      for (let k = 0; k < 60; k++) { const a = tooth * k / 60; frames.push([a, -a * (pr.NL / pr.NR) + Math.PI / pr.NR]); }
      for (let k = 0; k < 20; k++) { const a = rand() * 2 * Math.PI; frames.push([a, -a * (pr.NL / pr.NR) + Math.PI / pr.NR]); }
      for (const [a, b] of frames) {
        const f = chk.frame(a, b, true), r = M.referenceFrame(polys[pr.left], polys[pr.right], a, b, pr.dist);
        assert.deepEqual([f.crossings, f.inL, f.inR], [r.crossings, r.inL, r.inR], `${v} ${pr.id} a=${a.toFixed(4)}: 快速检测与参照实现不一致`);
        assert.equal(f.points.length / 3, f.crossings + f.inL + f.inR, `${v} ${pr.id}: 标记点数应等于 交点 + 穿入顶点`);
      }
    }
  }
});

test('验收 4 按页面真实运动（任意时刻 t）：原版每个采样时刻都穿模，返修后每个采样时刻都不穿', async (t) => {
  const THREE = await THREE_P;
  const rand = rng(7);
  const bad = { original: 0, repaired: 0 }, N = 400;
  for (const v of G.VERSIONS) {
    const polys = polysFor(THREE, v);
    const chks = M.PAIRS.map((pr) => new M.PairChecker(polys[pr.left], polys[pr.right], pr.dist));
    for (let i = 0; i < N; i++) {
      const ang = M.angles(rand() * 60);      // 一分钟内随机取时刻，转了很多个齿周期
      const hit = M.PAIRS.some((pr, j) => { const r = chks[j].frame(ang[pr.left], ang[pr.right], false); return r.crossings + r.inL + r.inR > 0; });
      if (hit) bad[v]++;
    }
  }
  t.diagnostic(`随机 ${N} 个时刻：原版 ${bad.original} 个穿模，返修后 ${bad.repaired} 个穿模`);
  assert.equal(bad.original, N, `原版应每个时刻都穿模，实测 ${bad.original}/${N}`);
  assert.equal(bad.repaired, 0, `返修后应零穿模，实测 ${bad.repaired}/${N}`);
});

test('验收 4 运动学：传动比 6.25:1，相邻两轮转向相反，B 与 C 同轴同速', () => {
  const dt = 1e-3, a0 = M.angles(1), a1 = M.angles(1 + dt);
  const w = Object.fromEntries(['A', 'B', 'C', 'D'].map((k) => [k, (a1[k] - a0[k]) / dt]));
  assert.ok(Math.abs(w.A - P.w0) < 1e-9, 'A 的角速度应为 w0');
  assert.ok(Math.abs(w.B / w.A + 0.4) < 1e-9, 'B = −0.4 ω');
  assert.ok(Math.abs(w.C / w.B - 1) < 1e-9, 'C 与 B 同轴同速');
  assert.ok(Math.abs(w.D / w.A - 0.16) < 1e-9, 'D = +0.16 ω');
  assert.ok(Math.abs(w.A / w.D - 6.25) < 1e-9, '总减速比 6.25');
  assert.ok(w.A * w.B < 0 && w.C * w.D < 0, '相邻啮合的两轮转向相反');
  // 中心距 = 两轮节圆半径之和
  assert.equal(M.PAIRS[0].dist, P.rA + P.rB);
  assert.equal(M.PAIRS[1].dist, P.rC + P.rD);
  assert.ok(Math.abs(P.bx - M.PAIRS[1].dist) < 1e-12, 'A–B 与 C–D 的中心距相同，装配才能左右对称摆开');
});

test('验收 9 检测耗时：快速检测每帧（两对）中位数 < 2 ms，第 95 百分位 < 5 ms（Node，M 系列芯片）', async (t) => {
  const THREE = await THREE_P;
  const polys = polysFor(THREE, 'original');           // 原版是最坏情况：穿模点最多
  const chks = M.PAIRS.map((pr) => new M.PairChecker(polys[pr.left], polys[pr.right], pr.dist));
  const times = [];
  for (let i = 0; i < 600; i++) {
    const ang = M.angles(i * 0.0137);
    const t0 = performance.now();
    for (let j = 0; j < 2; j++) chks[j].frame(ang[M.PAIRS[j].left], ang[M.PAIRS[j].right], true);
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const med = times[300], p95 = times[570];
  t.diagnostic(`原版 600 帧检测耗时：中位数 ${med.toFixed(3)} ms，P95 ${p95.toFixed(3)} ms`);
  assert.ok(med < 2, `中位数 ${med.toFixed(3)} ms 超过 2 ms`);
  assert.ok(p95 < 5, `P95 ${p95.toFixed(3)} ms 超过 5 ms`);
});
