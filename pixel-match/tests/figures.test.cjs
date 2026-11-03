// 牌面小人：和像素办公室一模一样；最像的两种在牌面尺寸下仍能分辨；前两关不放像的。SPEC 第 7 节验收 5–7。
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const C = require('../src/core.js');
const F = require('../src/figures.js');
const K = require('../src/card.js');
const RS = require('../src/raster.js');

const OFFICE = fs.readFileSync(path.join(__dirname, '..', '..', 'ai-office', 'office.js'), 'utf8');
const FIGSRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'figures.js'), 'utf8');

// 规格第 4 节的数
const FLOOR = 100; // 任意两种在自己那关的牌面上，「一眼不一样」的 CSS 像素不少于这么多
const EASY = 300;  // 参考牌面上低于它的两种算「长得像」，不许同时出现在第 1、2 关
const REF = { vw: 390, vh: 664, dpr: 2 }; // 参考牌面：iPhone 带浏览器栏的可视区，第 5 关（最小的牌）
const VIEWPORTS = [[390, 664, 2], [390, 664, 3], [412, 700, 2.625], [360, 600, 2], [360, 600, 3], [1280, 720, 1], [1280, 720, 2]];

test('5 牌面小人和办公室源码一致：生成脚本重跑结果与提交的 figures.js 逐字相同，每一笔都能在 office.js 里找到原文', () => {
  execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'sync-figures.cjs'), '--check'], { stdio: 'pipe' });
  const strokes = FIGSRC.split('\n').filter((l) => /\br\((ctx|g),/.test(l)).map((l) => l.trim().replace(/^(if \(boss\) \{.*10\);) \}$/, '$1').replace(/^const (kid=)/, '$1'));
  assert.ok(strokes.length >= 25, `只找到 ${strokes.length} 行画笔，抽取不完整`);
  for (const line of strokes) assert.ok(OFFICE.includes(line), `这一行在办公室源码里找不到原文：${line}`);
  // 名单：10 位同事 + 老板 + 无忧无虑
  assert.equal(F.ROSTER.length, 13);
  assert.deepEqual(F.ROSTER.filter((f) => f.kind === 'kid').map((f) => f.name), ['无忧', '无虑']);
  assert.ok(OFFICE.includes(`kid(54,62,'${F.ROSTER.find((f) => f.id === 'wulv').color}',true)`), '无虑的颜色要和办公室一致');
});

test('5b 软光栅画出来的就是那套代码：Codex 的衬衫、Muse 的胶片、无虑的辫子落在该在的像素上', () => {
  const ras = RS.Raster(40, 40, '#ffffff'); ras.ctx.setScale(1, 20, 34);
  const px = (x, y) => { const o = (y * 40 + x) * 3; return '#' + [0, 1, 2].map((k) => Math.round(ras.data[o + k]).toString(16).padStart(2, '0')).join(''); };
  F.drawFigure(ras.ctx, F.ROSTER.find((f) => f.id === 'builder'), 0, 0, {});
  assert.equal(px(20, 34 - 6), '#6d9d8e', 'Codex 衬衫（身体 x-5..x+5、y-10..y-2）');
  F.drawFigure(ras.ctx, F.ROSTER.find((f) => f.id === 'filmmaker'), 0, 0, {});
  assert.equal(px(20 + 9, 34 - 4), '#3f5351', 'Muse 的胶片盒在右下');
  const k = RS.Raster(20, 20, '#ffffff'); k.ctx.setScale(1, 10, 16); F.drawFigure(k.ctx, F.ROSTER.find((f) => f.id === 'wulv'), 0, 0, {});
  const o = ((16 - 11) * 20 + (10 - 5)) * 3; assert.equal(Math.round(k.data[o]), 0x4b, '无虑左边的辫子');
});

function table(vw, vh, dpr, lv) { const Lv = C.LEVELS[lv]; return K.likenessTable(C.layout(vw, vh, Lv.cols, Lv.rows, dpr), Lv.types); }
function minPair(fn, ids) { let m = Infinity, p = null; for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) { const v = fn(ids[i], ids[j]); if (v < m) { m = v; p = [ids[i], ids[j]]; } } return [m, p]; }

test('6 读数先校准：同一个人比自己是 0；把 Codex 的衬衫换成只差 ΔE≈5 的颜色，读数掉到底线以下', () => {
  const L = C.layout(REF.vw, REF.vh, 6, 8, REF.dpr), codex = F.ROSTER.find((f) => f.id === 'builder');
  const a = K.cardPixels(codex, L);
  assert.equal(K.likeness(a, K.cardPixels(codex, L)), 0);
  const twin = { ...codex, color: '#71a091' };
  assert.ok(RS.deltaE(RS.parse(codex.color), RS.parse(twin.color)) < 6);
  assert.ok(K.likeness(a, K.cardPixels(twin, L)) < FLOOR, '几乎同色的双胞胎应该被判成分不清');
});

test('6b 最像的两种在牌面尺寸下仍能分辨：每关每种视口里，任意两种「一眼不一样」的 CSS 像素都不少于 100', () => {
  const report = [];
  for (const [vw, vh, dpr] of VIEWPORTS) for (let lv = 0; lv < C.LEVELS.length; lv++) {
    const [m, p] = minPair(table(vw, vh, dpr, lv), C.LEVELS[lv].types);
    report.push(`${vw}x${vh}@${dpr} 第${lv + 1}关 ${m} ${p.join('/')}`);
    assert.ok(m >= FLOOR, `${vw}×${vh}@${dpr} 第 ${lv + 1} 关里 ${p.join(' 和 ')} 只差 ${m} 个像素，低于底线 ${FLOOR}`);
  }
  console.log(report.filter((l) => l.includes('第5关')).join('\n'));
  const ref = table(REF.vw, REF.vh, REF.dpr, 4), [m, p] = minPair(ref, C.LEVELS[4].types);
  console.log(`参考牌面最像的一对：${p.join(' / ')}，${m} CSS 像素`);
});

test('7 前两关不放长得像的：参考牌面上读数低于 300 的两种，不会同时出现在第 1、2 关；每关最像那对的读数逐关不升', () => {
  const ref = table(REF.vw, REF.vh, REF.dpr, 4), all = C.LEVELS[4].types;
  const alike = [];
  for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) if (ref(all[i], all[j]) < EASY) alike.push([all[i], all[j], ref(all[i], all[j])]);
  assert.ok(alike.length >= 3, `参考牌面上「长得像」的只有 ${alike.length} 对，难度梯度没东西可用`);
  for (const lv of [0, 1]) for (const [a, b, v] of alike) assert.ok(!(C.LEVELS[lv].types.includes(a) && C.LEVELS[lv].types.includes(b)), `第 ${lv + 1} 关同时有 ${a} 和 ${b}（读数 ${v} < ${EASY}）`);
  let prev = Infinity;
  for (let lv = 0; lv < C.LEVELS.length; lv++) { const [m] = minPair(ref, C.LEVELS[lv].types); assert.ok(m <= prev, `第 ${lv + 1} 关最像那对比上一关还好分`); prev = m; }
  assert.ok(alike.some(([a, b]) => C.LEVELS[2].types.includes(a) && C.LEVELS[2].types.includes(b)), '第 3 关起应该开始混进像的');
});
