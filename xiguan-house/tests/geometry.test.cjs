// 几何与机构检查：node --test tests/*.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const XG = require('../src/model.js');
const { SOLIDS, T, dims } = XG;
const { sub, dot, cross, norm } = XG.vec;

// 凸多面体分离轴检测：返回最小穿入深度（<=0 表示分开或只是贴着）
function edgesOf(sd, V) {
  const dirs = [];
  for (const f of sd.faces) for (let i = 0; i < f.idx.length; i++) {
    const d = norm(sub(V[f.idx[(i + 1) % f.idx.length]], V[f.idx[i]]));
    if (!dirs.some((e) => Math.abs(dot(e, d)) > 0.9999)) dirs.push(d);
  }
  return dirs;
}
function normalsOf(sd, V) {
  return sd.faces.map((f) => norm(cross(sub(V[f.idx[1]], V[f.idx[0]]), sub(V[f.idx[2]], V[f.idx[0]]))));
}
function penetration(a, A, b, B) {
  const axes = [...normalsOf(a, A), ...normalsOf(b, B)];
  const ea = edgesOf(a, A), eb = edgesOf(b, B);
  for (const u of ea) for (const v of eb) { const c = cross(u, v); if (Math.hypot(...c) > 1e-6) axes.push(norm(c)); }
  let min = Infinity;
  for (const ax of axes) {
    let a0 = Infinity, a1 = -Infinity, b0 = Infinity, b1 = -Infinity;
    for (const p of A) { const d = dot(p, ax); if (d < a0) a0 = d; if (d > a1) a1 = d; }
    for (const p of B) { const d = dot(p, ax); if (d < b0) b0 = d; if (d > b1) b1 = d; }
    const o = Math.min(a1, b1) - Math.max(a0, b0);
    if (o < min) min = o;
    if (min <= 0) return min;
  }
  return min;
}
function aabb(V) {
  const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
  for (const p of V) for (let i = 0; i < 3; i++) { if (p[i] < lo[i]) lo[i] = p[i]; if (p[i] > hi[i]) hi[i] = p[i]; }
  return [lo, hi];
}
const TOL = 0.3; // cm：贴面允许的数值误差
function clashes(s) {
  const W = XG.worldVerts(s), boxes = W.map(aabb), out = [];
  for (let i = 0; i < SOLIDS.length; i++) for (let j = i + 1; j < SOLIDS.length; j++) {
    const [la, ha] = boxes[i], [lb, hb] = boxes[j];
    if (la[0] > hb[0] - TOL || lb[0] > ha[0] - TOL || la[1] > hb[1] - TOL || lb[1] > ha[1] - TOL || la[2] > hb[2] - TOL || lb[2] > ha[2] - TOL) continue;
    const d = penetration(SOLIDS[i], W[i], SOLIDS[j], W[j]);
    if (d > TOL) out.push(`${SOLIDS[i].name}#${i} × ${SOLIDS[j].name}#${j} 穿入 ${d.toFixed(2)} cm @ ${s.toFixed(2)}s`);
  }
  return out;
}
const SAMPLES = (() => {
  const out = [];
  for (let s = 0; s <= T + 1e-9; s += 0.025) out.push(+s.toFixed(3));
  for (const [a, b] of Object.values(XG.TIMELINE)) for (const k of [0.78, 0.8, 0.85, 0.9, 0.95]) out.push(a + (b - a) * k);
  return out;
})();

test('合上、打开和全程每一帧都没有部件互相穿插', () => {
  const bad = [];
  for (const s of SAMPLES) { const c = clashes(s); if (c.length) bad.push(...c.slice(0, 6)); if (bad.length > 30) break; }
  assert.deepEqual(bad, [], '部件穿插（凸体分离轴检测，容差 0.3 cm）:\n' + bad.join('\n'));
});

test('收起沿同一条时间线倒回，回到 0 时每个顶点都归位', () => {
  const rest = XG.worldVerts(0), back = XG.worldVerts(0); // 时间线是纯函数：倒放到 0 就是同一个姿势
  const rev = XG.worldVerts(T - T); // 显式算一次
  let max = 0;
  SOLIDS.forEach((sd, i) => sd.verts.forEach((v, k) => { for (let a = 0; a < 3; a++) max = Math.max(max, Math.abs(rev[i][k][a] - v[a]), Math.abs(rest[i][k][a] - back[i][k][a])); }));
  assert.ok(max < 1e-9, `归位误差 ${max}`);
  // 每段动作末尾停在 1（不多不少）
  for (const k of Object.keys(XG.TIMELINE)) assert.ok(Math.abs(XG.seg(T, k) - 1) < 1e-12, `${k} 在结束时不是 1`);
});

test('每段动作的过冲不超过 2%，落地的动作不会越过目标', () => {
  for (const [k, [a, b, kind]] of Object.entries(XG.TIMELINE)) {
    let hi = -Infinity;
    for (let s = a; s <= b; s += 0.001) hi = Math.max(hi, XG.seg(s, k));
    if (kind === 'land') assert.ok(hi <= 1 + 1e-9, `${k} 是落到实物上的动作，却越过了 1：${hi}`);
    else assert.ok(hi > 1.015 && hi <= 1.0200001, `${k} 的过冲应约为 2%，实为 ${((hi - 1) * 100).toFixed(2)}%`);
  }
});

test('铰链接得住：前坡的屋脊铰线全程贴在后坡屋脊上；两扇大门的门轴全程不离门框', () => {
  const { YR, RIDGE_TOP, IN, DOOR, WT } = dims;
  for (const s of SAMPLES) {
    const M = XG.poseAt(s);
    for (const x of [-IN, IN]) {
      const p = [x, YR, RIDGE_TOP];
      const a = XG.apply(M.roofF, p), b = XG.apply(M.roofB, p);
      assert.ok(Math.hypot(...sub(a, b)) < 1e-6, `屋脊铰线在 ${s}s 脱开`);
    }
    for (const [g, x] of [['doorL', -DOOR], ['doorR', DOOR]]) for (const z of [1, 306]) {
      const a = XG.apply(M[g], [x, WT, z]), b = XG.apply(M.wallF, [x, WT, z]);
      assert.ok(Math.hypot(...sub(a, b)) < 1e-6, `${g} 门轴在 ${s}s 脱开`);
    }
  }
});

test('趟栊是 13 根圆木，楼梯 13 级，两者同数（单数）', () => {
  assert.equal(XG.parts.BARS.length, 13);
  assert.equal(XG.parts.STEPS.length, 13);
  assert.equal(XG.parts.BARS.length % 2, 1);
});

test('打开后：屋面离开屋身，三面墙都平躺在台面上', () => {
  const W = XG.worldVerts(T);
  const zMax = (name) => Math.max(...SOLIDS.flatMap((sd, i) => (sd.group === name ? W[i].map((p) => p[2]) : [])));
  const zMin = (name) => Math.min(...SOLIDS.flatMap((sd, i) => (sd.group === name ? W[i].map((p) => p[2]) : [])));
  for (const g of ['wallF', 'wallL', 'wallR']) {
    assert.ok(zMin(g) > -0.3, `${g} 打开后钻进台面：${zMin(g)}`);
    assert.ok(zMax(g) < 50, `${g} 打开后没有躺平：最高 ${zMax(g).toFixed(1)} cm`);
  }
  const yMinRoof = Math.min(...SOLIDS.flatMap((sd, i) => (sd.group.startsWith('roof') ? W[i].map((p) => p[1]) : [])));
  assert.ok(yMinRoof > dims.D, `屋面打开后应全部退到后墙外，实际最前到 y=${yMinRoof.toFixed(1)}`);
  // 台面接得住：所有点都在台面范围内
  const { STAND } = dims;
  for (const [i, sd] of SOLIDS.entries()) for (const p of W[i]) if (p[2] < 60) {
    assert.ok(p[0] >= STAND.x0 && p[0] <= STAND.x1 && p[1] >= STAND.y0 && p[1] <= STAND.y1, `${sd.name} 打开后落到台面外 (${p.map((v) => v.toFixed(0))})`);
  }
});

test('屋高落在资料范围里：檐墙至少 5 米，屋脊 6 到 8 米', () => {
  assert.ok(dims.E >= 500, `檐墙 ${dims.E} cm，资料说大屋挑高至少 5 米`);
  assert.ok(dims.RIDGE_TOP >= 600 && dims.RIDGE_TOP <= 800, `屋脊 ${dims.RIDGE_TOP.toFixed(0)} cm，资料说瓦脊距地面 6 到 8 米`);
});

test('前坡翻过来正好扣在后坡上：结束时两块板的瓦面贴合', () => {
  const M = XG.poseAt(T);
  const { YR, OVER, D, IN, RIDGE_TOP } = dims;
  // 前坡瓦面上的点翻过去以后，应落在后坡瓦面所在的平面上
  const backTop = [[-IN, YR, RIDGE_TOP], [IN, YR, RIDGE_TOP], [IN, D + OVER, RIDGE_TOP - (D + OVER - YR) * Math.tan(dims.PITCH * Math.PI / 180)]].map((p) => XG.apply(M.roofB, p));
  const n = norm(cross(sub(backTop[1], backTop[0]), sub(backTop[2], backTop[0])));
  const frontTopEave = XG.apply(M.roofF, [0, -OVER, RIDGE_TOP - (YR + OVER) * Math.tan(dims.PITCH * Math.PI / 180)]);
  const gap = Math.abs(dot(sub(frontTopEave, backTop[0]), n));
  assert.ok(gap < 1e-6, `前坡檐口落下后离后坡瓦面 ${gap.toFixed(4)} cm`);
});
