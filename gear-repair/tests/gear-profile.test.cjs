// 齿形与穿模检测（SPEC §9 第 1–3 条）。
// 从 dsh 两版真实的齿形函数生成齿廓，用 dsh 自己的 60 帧二维相交检测（src/gear-mesh.js 里的 referenceCycle）：
// 对原版断言「帧帧穿模」，对返修后断言「零穿模」。两边都断言，这条测试才校准得了。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs'), path = require('path');
const { pathToFileURL } = require('url');
const G = require('../src/gear-profile.js');
const M = require('../src/gear-mesh.js');
const P = M.PARAMS;
const root = path.join(__dirname, '..');
const THREE_P = import(pathToFileURL(path.join(root, 'vendor', 'three.module.js')).href);

const polyOf = (THREE, v, N) => G.makeGearShape(THREE, v, N, P.m).getPoints(P.curveDivisions).map((p) => [p.x, p.y]);
const fixture = (name) => fs.readFileSync(path.join(__dirname, 'fixtures', name), 'utf8');

// 取出 src 里某个顶层函数的全文：从签名行到第一个单独占一行的 "}"
function extractFn(src, startLine) {
  const i = src.indexOf(startLine);
  assert.ok(i >= 0, `src/gear-profile.js 里找不到 ${startLine}`);
  const j = src.indexOf('\n}\n', i);
  return src.slice(i, j + 3);
}

test('验收 1 两版齿形函数与 dsh 原文逐字相同（只把 THREE 改成参数）', () => {
  const src = fs.readFileSync(path.join(root, 'src', 'gear-profile.js'), 'utf8');
  const sig = 'function makeGearShape(N, m, pressureDeg = 20) {';
  const orig = fixture('dsh-original-makeGearShape.txt').replace(sig, 'function makeGearShapeOriginal(THREE, N, m, pressureDeg = 20) {');
  const rep = fixture('dsh-repaired-makeGearShape.txt').replace(sig, 'function makeGearShapeRepaired(THREE, N, m, pressureDeg = 20) {');
  assert.equal(extractFn(src, 'function makeGearShapeOriginal('), orig, '原版函数体与 dsh 原文不一致');
  assert.equal(extractFn(src, 'function makeGearShapeRepaired('), rep, '返修后函数体与 dsh 原文不一致');
  assert.equal(extractFn(src, 'function involutePoint('), fixture('dsh-involutePoint.txt'), 'involutePoint 与 dsh 原文不一致');
});

test('验收 2 原版齿顶比齿根宽，返修后齿顶比齿根窄', async (t) => {
  const THREE = await THREE_P;
  // 在某个半径的圆周上，量一个齿占了多少度（围绕 0 度那颗齿，取一个齿距的窗口）
  const widthAt = (poly, N, r) => {
    let inside = 0; const S = 2000;
    for (let i = 0; i < S; i++) {
      const a = -Math.PI / N + (2 * Math.PI / N) * (i + 0.5) / S;
      if (M.pointInPoly([r * Math.cos(a), r * Math.sin(a)], poly)) inside++;
    }
    return inside / S * 360 / N;
  };
  for (const N of [P.NA, P.NB]) {
    const rp = P.m * N / 2, ra = rp + P.m, rb = rp * Math.cos(20 * Math.PI / 180);
    const rBase = rb + 0.05, rTip = ra - 0.05;
    const o = polyOf(THREE, 'original', N), r = polyOf(THREE, 'repaired', N);
    const ow = [widthAt(o, N, rBase), widthAt(o, N, rTip)], rw = [widthAt(r, N, rBase), widthAt(r, N, rTip)];
    t.diagnostic(`N=${N} 齿宽（度）原版 基圆处 ${ow[0].toFixed(2)} → 齿顶处 ${ow[1].toFixed(2)}；返修后 ${rw[0].toFixed(2)} → ${rw[1].toFixed(2)}`);
    assert.ok(ow[1] > ow[0] * 1.3, `N=${N} 原版齿顶应明显比齿根宽，实测 ${ow[1].toFixed(2)}° vs ${ow[0].toFixed(2)}°`);
    assert.ok(rw[1] < rw[0] * 0.7, `N=${N} 返修后齿顶应明显比齿根窄，实测 ${rw[1].toFixed(2)}° vs ${rw[0].toFixed(2)}°`);
  }
});

test('验收 3 一个齿周期取 60 帧：原版 60/60 帧穿模，返修后 0/60（与 dsh 验证说明里的数字一致）', async (t) => {
  const THREE = await THREE_P;
  for (const [v, expectBad] of [['original', 60], ['repaired', 0]]) {
    const polys = { A: polyOf(THREE, v, P.NA), B: polyOf(THREE, v, P.NB), C: polyOf(THREE, v, P.NC), D: polyOf(THREE, v, P.ND) };
    for (const pr of M.PAIRS) {
      const res = M.referenceCycle(polys[pr.left], polys[pr.right], pr.NL, pr.NR, pr.dist, Math.PI / pr.NR, 60);
      t.diagnostic(`${v} ${pr.id}: ${JSON.stringify(res)}`);
      assert.equal(res.framesWith, expectBad, `${v} ${pr.id}: 60 帧里穿模的帧数应为 ${expectBad}，实测 ${res.framesWith}`);
      if (v === 'original') {
        // dsh 的数字：单帧最多穿入 121 个顶点、最多 12 对边相交
        assert.equal(Math.max(res.maxInL, res.maxInR), 121, `${pr.id} 单帧最多穿入顶点数应与 dsh 记录的 121 一致`);
        assert.equal(res.maxSeg, 12, `${pr.id} 单帧最多相交边对数应与 dsh 记录的 12 一致`);
      } else {
        assert.deepEqual([res.maxSeg, res.maxInL, res.maxInR], [0, 0, 0], `${v} ${pr.id} 应零穿模`);
      }
    }
  }
});

test('验收 3 校准：检测器对「确实穿模的返修后齿轮」也报警，对真正分开的原版齿轮不报警', async () => {
  const THREE = await THREE_P;
  const cycleBad = (v, dist) => {
    const chk = new M.PairChecker(polyOf(THREE, v, P.NA), polyOf(THREE, v, P.NB), dist);
    let bad = 0;
    for (let k = 0; k < 60; k++) {
      const a = (2 * Math.PI / P.NA) * k / 60, b = -a * (P.NA / P.NB) + Math.PI / P.NB;
      const r = chk.frame(a, b, false);
      if (r.crossings + r.inL + r.inR > 0) bad++;
    }
    return bad;
  };
  const d0 = P.rA + P.rB;
  assert.equal(cycleBad('repaired', d0), 0, '返修后在正确中心距下应零穿模');
  assert.equal(cycleBad('repaired', d0 - 0.3), 60, '返修后把中心距拉近 0.3 以后，每一帧都该报穿模');
  assert.equal(cycleBad('original', d0 + 2.0), 0, '原版两轮分开 2.0 以后不该有任何穿模（两个齿顶圆已不相交）');
  assert.equal(cycleBad('original', d0 + 1.5), 60, '原版就算分开 1.5，齿顶还是互相穿（说明问题不是中心距）');
});

test('验收 3 补充：只把渐开线符号翻过来（不加齿根内收和 4% 侧隙）还不够，60 帧里仍有帧穿模', async (t) => {
  // 把原版函数里与方向有关的四处符号翻成返修后的写法，其余原样；用于说明 dsh 的后两处改动不是多余的。
  const THREE = await THREE_P;
  const flipped = fixture('dsh-original-makeGearShape.txt')
    .replace('halfThick - invAlpha', 'halfThick + invAlpha')
    .replace('th - rotRel - p.a', 'th - rotRel + p.a')
    .replace('th - rotRel - invTa, th + rotRel + invTa', 'th - rotRel + invTa, th + rotRel - invTa')
    .replace('th + rotRel + p.a', 'th + rotRel - p.a')
    .replace('function makeGearShape(N, m, pressureDeg = 20) {', 'return function (N, m, pressureDeg = 20) {') + ';';
  const fn = new Function('THREE', 'involutePoint', flipped)(THREE, G.involutePoint);
  const poly = (N) => fn(N, P.m).getPoints(P.curveDivisions).map((p) => [p.x, p.y]);
  const res = M.referenceCycle(poly(P.NA), poly(P.NB), P.NA, P.NB, P.rA + P.rB, Math.PI / P.NB, 60);
  t.diagnostic(`只翻符号 A–B: ${JSON.stringify(res)}`);
  assert.ok(res.framesWith > 0 && res.framesWith < 60, `只翻符号应还有少数帧穿模，实测 ${res.framesWith}/60`);
});
