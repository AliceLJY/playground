// Mac mini 拆解台 · 逻辑检查。在本目录运行：node --test tests/*.test.cjs
// 每条测试写明守的是 SPEC.md 哪一条；驱动的是页面同一份 src/model.js 与 src/tour.js。
// 数字不是和常量比，而是直接解析 data/ 里的 iFixit 原文（tools/extract-ifixit.py 从 API 原文摘出）。
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const guide = require(path.join(__dirname, '../data/ifixit-180199.steps.json'));
const chips = require(path.join(__dirname, '../data/ifixit-178986.steps.json'));
const load = () => import('../src/model.js');

const WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 };
const BIT_RE = /\b(T\d+|\d+IP)\b/;
/** 从原文数螺丝：一行里同时有刀头型号与 screw(s)；数量词或单数「the ... screw」。只写总数、没写型号的那行不计。 */
function screwsFromGuide() {
  const per = {}; // { stepNo: { bit: n } }
  for (const st of guide.steps) for (const l of st.lines) {
    const t = l.text; if (!/\bscrews?\b/i.test(t)) continue;
    const bit = (t.match(BIT_RE) || [])[1]; if (!bit) continue;
    const w = (t.toLowerCase().match(/\b(one|two|three|four|five|six|seven|eight|nine|ten)\b/) || [])[1];
    const n = w ? WORDS[w] : /\bthe [\d.]+\s*mm[‑-]long screw\b/i.test(t) ? 1 : NaN;
    assert.ok(Number.isFinite(n), `第 ${st.n} 步这行读不出数量：${t}`);
    (per[st.n] ||= {})[bit] = (per[st.n][bit] || 0) + n;
  }
  return per;
}

test('SPEC 1: 终点读数 = 21 步、13 颗螺丝、4 种刀头、3 个接头、0 个内存插槽', async () => {
  const M = await load();
  const c = M.counters(M.S_MAX);
  assert.deepStrictEqual([c.steps, c.screws, c.bits, c.connectors, c.ramSlots], [21, 13, 4, 3, 0]);
  assert.deepStrictEqual(c.totals, { steps: 21, screws: 13, bits: 4, connectors: 3 });
});

test('SPEC 1: 每一步拧下的螺丝（按刀头分）与 iFixit 原文逐条一致', async () => {
  const M = await load();
  const fromJson = screwsFromGuide();
  const fromModel = {};
  for (const sc of M.SCREWS) { const n = M.STAGES[sc.stage].ifixit; (fromModel[n] ||= {})[sc.bit] = (fromModel[n][sc.bit] || 0) + 1; }
  assert.deepStrictEqual(fromModel, fromJson);
  // 原文写的长度也对得上
  for (const sc of M.SCREWS) {
    const st = guide.steps[M.STAGES[sc.stage].ifixit - 1];
    assert.ok(st.lines.some((l) => l.text.includes(sc.bit) && l.text.includes(String(sc.len))), `第 ${st.n} 步原文里找不到 ${sc.bit} ${sc.len} mm`);
  }
  // 刀头种类 = 原文里出现过的螺丝刀头
  const bits = new Set(); Object.values(fromJson).forEach((o) => Object.keys(o).forEach((b) => bits.add(b)));
  assert.deepStrictEqual([...bits].sort(), [...M.BITS].sort());
  // 逐步累计：每个 iFixit 步骤做完时，读数 = 原文到这一步为止的累计
  let acc = 0;
  M.STAGES.forEach((st, i) => {
    if (st.ifixit) acc += Object.values(fromJson[st.ifixit] || {}).reduce((a, b) => a + b, 0);
    assert.strictEqual(M.counters(i + 1).screws, acc, `做完第 ${i + 1} 拍（${st.short}）应拧下 ${acc} 颗`);
  });
});

test('SPEC 1: 接头 3 个、销钉 4 个，各自落在原文写的那一步', async () => {
  const M = await load();
  const text = (n) => guide.steps[n - 1].lines.map((l) => l.text).join(' ');
  const expect = { power: [7, /disconnect it/i], zif: [17, /ZIF connector straight out of its socket/i], ssd: [20, /fully disconnected/i] };
  assert.strictEqual(M.CONNECTORS.length, Object.keys(expect).length);
  for (const c of M.CONNECTORS) {
    const [n, re] = expect[c.id];
    assert.strictEqual(M.STAGES[c.stage].ifixit, n, `${c.name} 应在第 ${n} 步`);
    assert.match(text(n), re);
  }
  // 电源键排线原文说可以不拔：页面标了「可不拔」
  assert.match(text(7), /don't have to disconnect it/i);
  assert.ok(M.CONNECTORS.find((c) => c.id === 'power').optional);
  // 内板那根线指南不拔（第 12 步：still connected）
  assert.match(text(12), /still connected to the Mac mini by a cable/i);
  assert.match(text(4), /four pins total/i);
  assert.strictEqual(M.counters(M.S_MAX).pins, 4);
  assert.strictEqual(M.counters(5).pins, 4, '第 5 步做完四个销钉都起来了');
});

test('SPEC 2: 步数与原文相同；芯片原文有 LPDDR5、没有任何插槽字样；SSD 不是普通 M.2', async () => {
  const M = await load();
  assert.strictEqual(guide.steps.length, 21);
  assert.strictEqual(M.IFIXIT_STEPS, guide.steps.length);
  M.STAGES.filter((s) => s.ifixit).forEach((s, i) => assert.strictEqual(s.ifixit, i + 1));
  const all = chips.steps.flatMap((s) => s.lines.map((l) => l.text)).join('\n');
  assert.match(all, /M4 deca-core/); assert.match(all, /8 GB LPDDR5 SDRAM Memory/);
  assert.doesNotMatch(all, /DIMM|slot|socket/i);
  const nand = chips.steps.filter((s) => /Flash Module/.test(s.title));
  assert.strictEqual(nand.length, 2, '闪存模块两面');
  nand.forEach((s) => assert.match(s.lines[0].text, /128 GB NAND flash/));
  assert.match(guide.introduction, /looks like a normal M\.2 SSD/);
  assert.match(guide.introduction, /storage controller/);
  assert.match(guide.introduction, /normal M\.2 SSDs are incompatible/);
});

test('SPEC 3: 读数随进度单调不减；顺带看内存那一拍之前内存插槽是未知', async () => {
  const M = await load();
  let prev = null;
  for (let s = 0; s <= M.S_MAX + 1e-9; s += 0.01) {
    const c = M.counters(s);
    if (prev) for (const k of ['steps', 'screws', 'bits', 'connectors', 'pins']) assert.ok(c[k] >= prev[k], `s=${s.toFixed(2)} ${k} 倒退了`);
    if (s < M.LOOK) assert.strictEqual(c.ramSlots, null);
    prev = c;
  }
  assert.strictEqual(M.counters(0).steps, 0);
  assert.strictEqual(M.counters(0).screws, 0);
});

const ALLOWED = (a, b, s) => {
  const k = [a, b].sort().join('|');
  if (k === 'socket|ssd') return s < 20.9; // 原厂 SSD 插在插槽里，直到第 20 步拔开
  if (k === 'socket|ssd2') return s > 23.38; // 第三方小板从斜插进插槽开始
  return false;
};
const SOLID = (M) => Object.keys(M.PARTS);
for (const layout of ['wide', 'tall']) {
  test(`SPEC 4: 零件互不穿插（${layout}，每 0.02 取样，穿透 < 0.05 mm）`, async () => {
    const M = await load();
    const ids = SOLID(M);
    const trayO = { c: M.trayBox(layout).slice(0, 3), R: [1, 0, 0, 0, 1, 0, 0, 0, 1], half: M.trayBox(layout).slice(3).map((x) => x / 2) };
    trayO.axes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
    let worst = { d: 0 };
    for (let s = 0; s <= M.S_MAX + 1e-9; s += 0.02) {
      const P = M.pose(s, layout);
      const live = ids.filter((id) => P[id].op > 0.05);
      const O = Object.fromEntries(live.map((id) => [id, M.obb(id, P[id])]));
      for (let i = 0; i < live.length; i++) {
        const a = live[i];
        // 地面：任何零件不低于桌面
        for (const v of M.corners(O[a])) if (v[1] < -0.05) worst = worst.d > -v[1] ? worst : { d: -v[1], a, b: '桌面', s };
        const t = M.penetration(O[a], trayO); if (t > worst.d) worst = { d: t, a, b: '螺丝盘', s };
        for (let j = i + 1; j < live.length; j++) {
          const b = live[j];
          if (M.PARTS[a].group === 'chassis' && M.PARTS[b].group === 'chassis') continue;
          if (ALLOWED(a, b, s)) continue;
          const d = M.penetration(O[a], O[b]);
          if (d > worst.d) worst = { d, a, b, s };
        }
      }
    }
    assert.ok(worst.d < 0.05, `s=${worst.s && worst.s.toFixed(2)} ${worst.a} 与 ${worst.b} 穿插 ${worst.d.toFixed(2)} mm`);
  });
}

test('SPEC 5: 拆下来的零件离开机身后不再回来；螺丝在被拧之前不动', async () => {
  const M = await load();
  const inside = { c: [0, 26.25, 0], R: [1, 0, 0, 0, 1, 0, 0, 0, 1], half: [60.9, 23.75, 60.9], axes: [[1, 0, 0], [0, 1, 0], [0, 0, 1]] };
  const away = { cover: 7.6, inner: 12, fan: 17.6, ssd: 21.8 };
  for (const [id, from] of Object.entries(away)) for (let s = from; s <= M.S_MAX + 1e-9; s += 0.02) {
    const P = M.pose(s)[id]; if (P.op < 0.05) continue;
    assert.strictEqual(M.penetration(M.obb(id, P), inside), 0, `s=${s.toFixed(2)} ${id} 又回到了机身里`);
  }
  for (const sc of M.SCREWS) for (let s = 1; s < sc.stage + sc.a; s += 0.05) {
    const p = M.pose(s)[sc.id].p;
    assert.ok(Math.hypot(p[0] - sc.x, p[1] - sc.y, p[2] - sc.z) < 1e-6, `${sc.id} 在 s=${s.toFixed(2)} 就动了`);
  }
  // 拆完那一刻，拧下的螺丝都在螺丝盘里
  const out = M.pose(M.SWAP);
  for (const sc of M.SCREWS) assert.ok(out[sc.id].p[1] < 6, `${sc.id} 没落进盘里`);
  // 换上小板以后：那颗 8IP 回到半圆缺口原位，其余还在盘里；「拧下」的计数不因装回而变
  const end = M.pose(M.S_MAX);
  for (const sc of M.SCREWS) {
    const d = Math.hypot(end[sc.id].p[0] - sc.x, end[sc.id].p[1] - sc.y, end[sc.id].p[2] - sc.z);
    if (sc.bit === '8IP') assert.ok(d < 1e-6, `8IP 没拧回缺口（差 ${d.toFixed(2)} mm）`);
    else assert.ok(end[sc.id].p[1] < 6, `${sc.id} 不该离开螺丝盘`);
  }
  assert.strictEqual(M.counters(M.S_MAX).screws, 13);
  // 小板最后平放在原厂模块的位置；原厂模块平放在机身外的桌上
  const b = M.PARTS.ssd2.box, q = end.ssd2;
  assert.ok(Math.hypot(q.p[0] - b[0], q.p[1] - b[1], q.p[2] - b[2]) < 1e-6 && Math.abs(q.R[4] - 1) < 1e-9, '小板没压平到位');
  assert.ok(end.ssd.p[2] > 63.5 && end.ssd.p[1] < 2, '原厂模块应平放在机身前面的桌上');
});

test('SPEC 8: SSD 模块是竖长板，宽 : 长 ≈ 1 : 1.5，金手指那条短边插进插槽；螺丝在远端短边正中', async () => {
  const M = await load();
  for (const id of ['ssd', 'ssd2']) {
    const b = M.PARTS[id].box, r = b[5] / b[3];
    assert.ok(r > 1.4 && r < 1.6, `${id} 长宽比 ${r.toFixed(2)}`);
  }
  const s = M.PARTS.ssd.box, k = M.PARTS.socket.box;
  assert.ok(Math.abs(k[0] - s[0]) < 1e-6 && k[2] < s[2], '插槽在 SSD 的近端短边');
  const sc = M.SCREWS.find((x) => x.bit === '8IP');
  assert.ok(Math.abs(sc.x - s[0]) < 1e-6 && Math.abs(sc.z - (s[2] + s[5] / 2)) < 1, '8IP 在远端短边正中');
});

test('SPEC 7: 机身按官方规格 127 × 127 × 50 mm', async () => {
  const M = await load();
  assert.deepStrictEqual([M.SPEC.width, M.SPEC.depth, M.SPEC.height, M.SPEC.weightKg], [127, 127, 50, 0.67]);
  const P = M.pose(1); let x0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const id of ['skin', 'wallN', 'wallS', 'wallW', 'wallE']) for (const v of M.corners(M.obb(id, P[id]))) { x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]); y1 = Math.max(y1, v[1]); }
  assert.ok(Math.abs(x1 - x0 - 127) < 1e-6 && Math.abs(y1 - 50) < 1e-6);
});
