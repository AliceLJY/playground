/* 牌面：浅色底 + 办公室小人。真画布和测试用的软光栅走同一个函数，所以「像不像」的读数就是玩家看到的那张牌。
 * ctx 只需要 fillStyle / fillRect，外加 setScale(s, ox, oy)：之后的 fillRect 坐标乘 s 再平移到物理像素 (ox, oy)。 */
(function (root) {
  'use strict';
  const F = typeof module === 'object' && module.exports ? require('./figures.js') : root.PixelFigures;
  const RS = typeof module === 'object' && module.exports ? require('./raster.js') : root.PixelRaster;

  const CARD = { face: '#fff6dc', edge: '#d9a56d', shade: '#c7a77a', lit: '#fffbef' };
  // 一眼能看出的差别：CSS 像素上两张牌颜色差 ΔE76 > VISIBLE_DE 才算「这里不一样」。
  const VISIBLE_DE = 20;

  // 在 devW×devH 物理像素的牌上画底和小人。sa/sk = 大人/小孩每个逻辑像素占几个物理像素。
  function paintCard(ctx, fig, devW, devH, sa, sk, opts = {}) {
    ctx.setScale(1, opts.ox || 0, opts.oy || 0);
    const e = Math.max(1, Math.round(devH / 60));
    ctx.fillStyle = CARD.shade; ctx.fillRect(e, e * 2, devW - e, devH - e * 2);
    ctx.fillStyle = CARD.edge; ctx.fillRect(0, 0, devW - e, devH - e * 2);
    ctx.fillStyle = CARD.face; ctx.fillRect(e, e, devW - e * 3, devH - e * 4);
    ctx.fillStyle = CARD.lit; ctx.fillRect(e, e, devW - e * 3, e);
    if (!fig) return;
    const kid = fig.kind === 'kid', S = kid ? sk : sa;
    // 大人身体 x-8..x+8 居中、外框 y-28..y+2 竖直居中；小孩 x-4..x+4、y-13..y+2。
    const cx = kid ? 0 : 0.5, cy = kid ? -5.5 : -13;
    const ox = (opts.ox || 0) + Math.round((devW - e * 2) / 2 - cx * S), oy = (opts.oy || 0) + Math.round((devH - e * 3) / 2 - cy * S) + (opts.lift || 0);
    ctx.setScale(S, ox, oy);
    F.drawFigure(ctx, fig, 0, 0, opts);
  }

  // 把一张牌画进软光栅（物理像素），再按 dpr 平均回 CSS 像素。
  function cardPixels(fig, L) {
    const ras = RS.Raster(L.dev.w, L.dev.h, '#c9a27a');
    paintCard(ras.ctx, fig, L.dev.w, L.dev.h, L.scale.adult, L.scale.kid);
    const k = Math.max(1, Math.round(L.dpr)), px = RS.downsample(ras, k);
    px.area = (k / L.dpr) ** 2; // 下采样后一个格子折合多少 CSS 像素²（像素比不是整数时，如 2.625）
    return px;
  }
  // 两种小人在这个牌面尺寸下有多少 CSS 像素²「一眼不一样」。
  function likeness(a, b) {
    let n = 0; const A = a.data, B = b.data;
    for (let i = 0; i < A.length; i += 3) if (RS.deltaE([A[i], A[i + 1], A[i + 2]], [B[i], B[i + 1], B[i + 2]]) > VISIBLE_DE) n++;
    return Math.round(n * (a.area || 1));
  }
  // 名单里两两的读数，返回 (idA, idB) => 读数。
  function likenessTable(L, ids) {
    const figs = new Map(F.ROSTER.map((f) => [f.id, f])), px = new Map(), table = new Map();
    for (const id of ids) px.set(id, cardPixels(figs.get(id), L));
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const v = likeness(px.get(ids[i]), px.get(ids[j]));
      table.set(ids[i] + '|' + ids[j], v); table.set(ids[j] + '|' + ids[i], v);
    }
    const fn = (x, y) => (x === y ? 0 : table.get(x + '|' + y) ?? 1e9);
    fn.table = table;
    return fn;
  }

  const api = { CARD, VISIBLE_DE, paintCard, cardPixels, likeness, likenessTable };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.PixelCard = api;
})(typeof window !== 'undefined' ? window : globalThis);
