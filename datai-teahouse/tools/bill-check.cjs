// 茶单红章不压字（2026-11-25 Duet 巡检）：离席出的那张茶单图上，「多謝」红章的外框（含线宽）不许碰到任何一行字。
// 在页面里拦下画茶单那张画布的 fillText / strokeRect，按当时的变换矩阵算出每行字的包围盒和红章四个角，再判相交。
// 跑三种账：最少（刚坐下就走）、开局走查那样、礼数和笼数都多（行最长、字号被压到最小）。
//   NODE_PATH="$(npm root -g)" node tools/bill-check.cjs <page-url> [out-dir]
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
(async () => {
  const [url, out] = process.argv.slice(2);
  if (!url) { console.error('用法：node tools/bill-check.cjs <page-url> [out-dir]'); process.exit(2); }
  if (out) fs.mkdirSync(out, { recursive: true });
  const TALLIES = {
    light: { pours: 0, lids: 0, knocksGiven: 0, knocksGot: 0, pages: 0, pieces: {}, baskets: {} },
    walkthrough: { pours: 5, lids: 1, knocksGiven: 1, knocksGot: 2, pages: 1, pieces: { siu: 1, har: 1 }, baskets: { siu: 1, rice: 1, har: 1 } },
    heavy: { pours: 24, lids: 6, knocksGiven: 18, knocksGot: 23, pages: 12, pieces: { har: 4, siu: 4, bao: 3, feet: 3, rib: 3, roll: 3, cake: 2, tart: 2 }, baskets: { har: 3, siu: 2, bao: 2, feet: 1, rib: 1, roll: 1, cake: 1, tart: 2, ham: 1 } },
  };
  const b = await chromium.launch();
  let fail = 0;
  const sep = url.includes('?') ? '&' : '?';
  for (const [name, tally] of Object.entries(TALLIES)) {
    const ctx = await b.newContext({ viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, hasTouch: true });
    const p = await ctx.newPage();
    // 这项检查用不着痕迹服务：本机以外的请求一律拦掉，绝不往线上发
    await p.route((u) => !['127.0.0.1', 'localhost'].includes(u.hostname), (r) => r.abort());
    const errors = []; p.on('pageerror', (e) => errors.push(e.message));
    await p.addInitScript(() => {
      const P = CanvasRenderingContext2D.prototype, rec = (window.__billDraw = []);
      const big = (g) => g.canvas.width === 1080 && g.canvas.height === 1180; // 茶单那张画布
      const tf = (m, x, y) => [m.a * x + m.c * y + m.e, m.b * x + m.d * y + m.f];
      const fillText = P.fillText, strokeRect = P.strokeRect;
      P.fillText = function (s, x, y, ...rest) {
        if (big(this)) {
          const mt = this.measureText(s), al = this.textAlign;
          const x0 = al === 'center' ? x - mt.width / 2 : al === 'right' || al === 'end' ? x - mt.width : x;
          const corners = [[x0, y - mt.actualBoundingBoxAscent], [x0 + mt.width, y - mt.actualBoundingBoxAscent], [x0 + mt.width, y + mt.actualBoundingBoxDescent], [x0, y + mt.actualBoundingBoxDescent]];
          const m = this.getTransform();
          rec.push({ kind: 'text', s, poly: corners.map(([a, c]) => tf(m, a, c)) });
        }
        return fillText.call(this, s, x, y, ...rest);
      };
      P.strokeRect = function (x, y, w, h) {
        if (big(this)) {
          const m = this.getTransform(), lw = this.lineWidth / 2;
          rec.push({ kind: 'rect', style: String(this.strokeStyle), rotated: m.b !== 0, poly: [[x - lw, y - lw], [x + w + lw, y - lw], [x + w + lw, y + h + lw], [x - lw, y + h + lw]].map(([a, c]) => tf(m, a, c)) });
        }
        return strokeRect.call(this, x, y, w, h);
      };
    });
    await p.goto(`${url}${sep}view=first&t=6&mute=1`);
    await p.waitForFunction(() => window.__datai && window.__datai.ready, null, { polling: 100 });
    const r = await p.evaluate((t) => {
      Object.assign(window.__datai.state.tally, t);
      window.__datai.act(6);
      return { draws: window.__billDraw, bill: window.__datai.snapshot().bill };
    }, tally);
    if (out) { await p.waitForTimeout(300); await p.screenshot({ path: path.join(out, `bill-${name}.png`) }); await p.evaluate(() => document.getElementById('billImg').src).then((src) => fs.writeFileSync(path.join(out, `bill-${name}-sheet.png`), Buffer.from(src.split(',')[1], 'base64'))); }
    // 分离轴判两凸多边形相交
    const axes = (poly) => poly.map((pt, i) => { const q = poly[(i + 1) % poly.length]; return [-(q[1] - pt[1]), q[0] - pt[0]]; });
    const proj = (poly, ax) => { const v = poly.map(([x, y]) => x * ax[0] + y * ax[1]); return [Math.min(...v), Math.max(...v)]; };
    const hits = (A, B) => [...axes(A), ...axes(B)].every((ax) => { const [a0, a1] = proj(A, ax), [b0, b1] = proj(B, ax); return a0 < b1 && b0 < a1; });
    const stamp = r.draws.find((d) => d.kind === 'rect' && d.rotated);
    const stampText = r.draws.find((d) => d.kind === 'text' && d.s === '多謝');
    const texts = r.draws.filter((d) => d.kind === 'text' && d.s !== '多謝');
    const under = texts.filter((d) => hits(d.poly, stamp.poly)).map((d) => d.s);
    const ok = !!stamp && !!stampText && r.bill && r.bill.length === 6 && under.length === 0 && errors.length === 0;
    const sb = stamp ? stamp.poly.map(([x, y]) => [Math.round(x), Math.round(y)]) : null;
    console.log(`${ok ? '✔' : '✖'} ${name}: 红章外框角 ${JSON.stringify(sb)}${under.length ? '，压住了：' + under.map((s) => '「' + s + '」').join('') : '，没压字'}${errors.length ? '，报错 ' + errors.join(' | ') : ''}`);
    if (!ok) fail++;
    await ctx.close();
  }
  await b.close();
  process.exit(fail ? 1 : 0);
})();
