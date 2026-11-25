// 画面不变形（2026-11-25 Duet 巡检后续）：画布内部是 960×540，屏上显示的内容横竖缩放必须一致（差 ≤ 1%），
// 且同一种排版里视口越宽、画面不会反而变矮（单栏 ≤ 760、两栏 ≥ 761 各自比）。按 object-fit 算出画布内容在屏上的实际宽高。带触屏 / 不带触屏都跑。
// 同时报咖啡（36×33 画布像素）和 bug（36×30）在屏上的大小。
//   NODE_PATH="$(npm root -g)" node tools/aspect-check.cjs <page-url> <out-dir>
const { chromium } = require('playwright'), fs = require('node:fs'), path = require('node:path');
const [url, out] = process.argv.slice(2);
if (!url || !out) { console.error('用法：node tools/aspect-check.cjs <page-url> <out-dir>'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
(async () => {
  const b = await chromium.launch();
  let failed = 0;
  for (const touch of [true, false]) {
    let lastH = 0;
    for (const w of [320, 360, 375, 390, 412, 440, 441, 500, 760, 761, 1024, 1280]) {
      if (w === 761) lastH = 0; // 761 起右边多出一栏「摸鱼守则」，画面让出宽度，是另一种排版，不和单栏比高矮
      const h = w < 800 ? 844 : 800;
      const ctx = await b.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
      const p = await ctx.newPage(), errors = [];
      p.on('pageerror', (e) => errors.push(e.message));
      await p.route((u) => !['127.0.0.1', 'localhost'].includes(u.hostname), (r) => r.abort());
      await p.goto(url); await p.click('#start'); await p.waitForTimeout(1200);
      const r = await p.evaluate(() => {
        const c = document.getElementById('game'), box = c.getBoundingClientRect(), fit = getComputedStyle(c).objectFit;
        let cw = box.width, ch = box.height; const ar = 960 / 540;
        if (fit === 'contain' || fit === 'scale-down') { if (box.width / box.height > ar) cw = ch * ar; else ch = cw / ar; }
        else if (fit === 'cover') { if (box.width / box.height > ar) ch = cw / ar; else cw = ch * ar; }
        return { box: [box.width, box.height], fit, cw, ch, sx: cw / 960, sy: ch / 540, hscroll: document.documentElement.scrollWidth > innerWidth + 1 };
      });
      await p.evaluate(() => document.getElementById('game').scrollIntoView({ block: 'center' }));
      await p.screenshot({ path: path.join(out, `coal-${w}-${touch ? 'touch' : 'mouse'}.png`) });
      const ratio = r.sx / r.sy, shrink = r.ch < lastH - 0.5;
      const ok = Math.abs(ratio - 1) <= 0.01 && !shrink && !r.hscroll && errors.length === 0;
      if (!ok) failed++;
      const f = (v) => v.toFixed(1);
      console.log(`${ok ? 'ok  ' : 'FAIL'} ${w}x${h} ${touch ? 'touch' : 'mouse'}: 画面 ${f(r.cw)}×${f(r.ch)}（object-fit ${r.fit}，横缩放 ${r.sx.toFixed(3)}、竖缩放 ${r.sy.toFixed(3)}，横竖比 ${ratio.toFixed(3)}）咖啡 ${f(36 * r.sx)}×${f(33 * r.sy)}、bug ${f(36 * r.sx)}×${f(30 * r.sy)}${shrink ? `，比更窄的视口还矮（上一档 ${f(lastH)}）` : ''}${r.hscroll ? '，页面横向可滚' : ''}${errors.length ? '，报错 ' + errors.join(' | ') : ''}`);
      lastH = Math.max(lastH, r.ch);
      await ctx.close();
    }
  }
  await b.close();
  process.exit(failed ? 1 : 0);
})();
