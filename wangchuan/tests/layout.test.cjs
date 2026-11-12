// 规格里能算出来的几条，写成断言。跑法：node --test tests/*.test.cjs
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const L = require('../layout.js');

// 竖屏手机、平板、横屏电脑、超宽屏
const ASPECTS = [9 / 19.5, 9 / 16, 3 / 4, 4 / 3, 16 / 9, 21 / 9];
const STEPS = Array.from({ length: 41 }, (_, k) => k / 40);
const name = (a) => `宽高比 ${a.toFixed(2)}`;

test('四景按诗的四句排，一句一景', () => {
  assert.deepEqual(L.SCENES.map((s) => s.line), ['空山不见人', '但闻人语响', '返景入深林', '复照青苔上']);
});

test('第一眼就是一幅画：开场不在云气里，也不露出画外（留 2 秒也有 2 秒的收获）', () => {
  assert.equal(L.veil(0, 0), 0, '第一景开头被云气遮住了');
  for (const a of ASPECTS) {
    const c = L.camera(0, 0, a);
    assert.ok(c.left >= -1e-9 && c.right <= L.R + 1e-9, `${name(a)}：开场看到的范围 [${c.left.toFixed(2)}, ${c.right.toFixed(2)}] 超出画 [0, ${L.R}]`);
  }
});

test('每一景从头走到尾，镜头都不走出画外', () => {
  for (const a of ASPECTS) for (let i = 0; i < L.N; i++) for (const u of STEPS) {
    const c = L.camera(i, u, a);
    assert.ok(c.left >= -1e-9 && c.right <= L.R + 1e-9, `${name(a)} 第 ${i + 1} 景 u=${u}：横向 [${c.left.toFixed(3)}, ${c.right.toFixed(3)}] 出画`);
    assert.ok(c.bottom >= -1e-9 && c.top <= 1 + 1e-9, `${name(a)} 第 ${i + 1} 景 u=${u}：纵向出画`);
  }
});

test('每一景都是向左展、往里推（手卷从右往左看，人往山里走）', () => {
  for (const a of ASPECTS) for (let i = 0; i < L.N; i++) {
    const c0 = L.camera(i, 0, a), c1 = L.camera(i, 1, a);
    assert.ok(c1.cx <= c0.cx + 1e-9, `${name(a)} 第 ${i + 1} 景：镜头没有向左`);
    assert.ok(c1.zoom > c0.zoom * 1.05, `${name(a)} 第 ${i + 1} 景：镜头没有往里推`);
  }
});

test('「返景入深林」：光落到苔上那一刻，落点在屏幕里', () => {
  const i = L.SCENES.findIndex((s) => s.line === '返景入深林'), li = L.SCENES[i].light;
  assert.ok(li && li.enterFrom, '第三景没有写光从哪里照进来');
  assert.ok(li.enterFrom[0] > li.u, '日头在右边，光应当从右往左照进来');
  for (const a of ASPECTS) for (const u of [li.arrive, li.arrive + 0.15]) {
    const c = L.camera(i, u, a), x = li.u * L.R;
    assert.ok(x > c.left && x < c.right, `${name(a)} u=${u.toFixed(2)}：苔上落点 ${x.toFixed(2)} 不在看到的 [${c.left.toFixed(2)}, ${c.right.toFixed(2)}] 里`);
  }
});

test('「复照青苔上」：光还在的那段时间里，苔上的返照一直在屏幕里，而且有树干能落影', () => {
  const i = L.SCENES.findIndex((s) => s.line === '复照青苔上'), s = L.SCENES[i], li = s.light;
  for (const a of ASPECTS) for (const u of STEPS.filter((x) => x >= L.FADE && x <= li.leave)) {
    const c = L.camera(i, u, a), x = (li.u - 0.05 * u) * L.R;
    assert.ok(x > c.left && x < c.right, `${name(a)} u=${u}：返照正中 ${x.toFixed(2)} 不在看到的 [${c.left.toFixed(2)}, ${c.right.toFixed(2)}] 里`);
  }
  assert.ok(s.trunks.some(([x]) => x > li.u), '日头在右边，返照右侧至少要有一根树干，影子才落得进光里');
});

test('人语在「但闻人语响」那一景最近', () => {
  const v = L.SCENES.map((s) => s.voice), i = L.SCENES.findIndex((s) => s.line === '但闻人语响');
  assert.equal(v.indexOf(Math.max(...v)), i);
  assert.ok(v.every((x, k) => k === i || x <= v[i] * 0.5), '别的景里人语应当明显更远');
});

test('越往里走日头越低：暖意一景比一景重', () => {
  const w = L.SCENES.map((s) => s.warm);
  for (let k = 1; k < w.length; k++) assert.ok(w[k] > w[k - 1], `第 ${k + 1} 景的暖意没有比前一景重`);
});

test('换景在云气里：每一景收尾和下一景开头都被云气完全盖住，中间是清的', () => {
  for (let i = 0; i < L.N; i++) {
    assert.equal(L.veil(i, 1), 1, `第 ${i + 1} 景收尾没有完全进云`);
    assert.equal(L.veil(i, 0.5), 0, `第 ${i + 1} 景中段不该有换景的云`);
    if (i > 0) assert.equal(L.veil(i, 0), 1, `第 ${i + 1} 景开头不是从云里出来的`);
  }
  assert.equal(L.veil(L.N, 0), 1, '卷尾素纸不是从云里出来的');
  assert.equal(L.veil(L.N, 0.5), 0, '卷尾素纸上还盖着云');
});

test('最窄的竖屏手机也装得下整首题诗', () => {
  assert.ok(L.POEM_W + 0.04 <= 9 / 19.5, `题诗宽 ${L.POEM_W.toFixed(3)} 屏高，9:19.5 的手机只有 ${(9 / 19.5).toFixed(3)} 屏高宽`);
});

test('题诗图的尺寸和 layout 里写的一致；每一景的画和深度图都在', () => {
  const dir = path.join(__dirname, '..', 'assets');
  const buf = fs.readFileSync(path.join(dir, 'poem.png'));
  const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20);
  assert.ok(Math.abs(w / h - L.POEM_W / L.POEM_H) < 1e-3, `poem.png 是 ${w}×${h}，layout 按 ${(L.POEM_W / L.POEM_H).toFixed(3)} 算`);
  for (const s of L.SCENES) for (const f of [`${s.key}.jpg`, `${s.key}-depth.jpg`]) {
    assert.ok(fs.statSync(path.join(dir, f)).size > 5000, `缺 assets/${f}`);
  }
});

test('画面上不放解说：屏幕上只有卷尾署名和出口、一句提示、声音开关和「溯源」入口；学术背景收在点开才见的那一页里', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  let body = html.slice(html.indexOf('<body>')).replace(/<script[\s\S]*?<\/script>/g, '');
  const panel = body.match(/<section id="source"([^>]*)>[\s\S]*?<\/section>/);
  assert.ok(panel, '没有溯源那一页');
  assert.ok(/\bhidden\b/.test(panel[1]), '溯源那一页应当默认收起');
  for (const must of ['女史箴图', '欧阳询', '渲染', '今人加的', '不是古迹']) assert.ok(panel[0].includes(must), `溯源里没有讲到「${must}」`);
  body = body.replace(panel[0], '');
  const lines = body.replace(/<[^>]+>/g, '\n').split('\n').map((s) => s.trim()).filter(Boolean);
  assert.deepEqual(lines, ['辋川卧游 · 鹿柴', '画与字皆为 AI 依唐人勾线平涂、欧阳询楷书之法新作，并非古迹。', '再看一遍', '·', '回 playground', '按住，往山里走', '声', '溯源']);
});
