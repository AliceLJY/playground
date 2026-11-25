// 守夜规则页不透底（2026-11-25 Duet 巡检）：从标题进「奶茶摊守夜」规则页后，规则卡片以外的地方
// 只能是规则页自己的底色，标题页画布上的字和小巷画面不能从后面透出来。
// 判法：截一张规则页的图，在浏览器里逐像素读回来，跳过规则卡片（加 8 px 边）以外的每个像素，
// 和规则页底色 #0b0d12 比，任一通道差超过 6 就算透出来；报透出像素数和最大差值。
//   NODE_PATH="$(npm root -g)" node tools/rules-backdrop-check.cjs <base-url> <out-dir>
const { chromium } = require('playwright'), fs = require('node:fs'), path = require('node:path');
const [base, out] = process.argv.slice(2);
if (!base || !out) { console.error('用法：node tools/rules-backdrop-check.cjs <base-url> <out-dir>'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
const BG = [0x0b, 0x0d, 0x12], TOL = 6;
(async () => {
  const browser = await chromium.launch({ channel: 'chrome' });
  let failed = 0;
  for (const [width, height, touch] of [[390, 664, true], [390, 664, false], [320, 568, true], [844, 340, true], [1365, 900, false]]) {
    const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base); await page.waitForFunction(() => window.__slipper?.ready, null, { polling: 100 });
    await page.evaluate(() => localStorage.clear()); await page.reload(); await page.waitForFunction(() => window.__slipper?.ready, null, { polling: 100 });
    if (touch) await page.tap('#night-entry'); else await page.click('#night-entry');
    await page.waitForTimeout(400);
    const screen = await page.evaluate(() => __slipper.probe().screen);
    const tag = `${width}x${height}-${touch ? 'touch' : 'mouse'}`;
    const png = await page.screenshot({ path: path.join(out, `rules-${tag}.png`) });
    const card = await page.evaluate(() => document.querySelector('#night-menu .card').getBoundingClientRect().toJSON());
    const r = await page.evaluate(async ({ b64, card, BG, TOL }) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      const d = g.getImageData(0, 0, c.width, c.height).data;
      const m = 8; let leak = 0, worst = 0, sample = null;
      for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
        if (x >= card.left - m && x <= card.right + m && y >= card.top - m && y <= card.bottom + m) continue;
        const i = (y * c.width + x) * 4;
        const diff = Math.max(Math.abs(d[i] - BG[0]), Math.abs(d[i + 1] - BG[1]), Math.abs(d[i + 2] - BG[2]));
        if (diff > worst) { worst = diff; sample = [x, y, d[i], d[i + 1], d[i + 2]]; }
        if (diff > TOL) leak++;
      }
      return { leak, worst, sample, total: c.width * c.height };
    }, { b64: png.toString('base64'), card, BG, TOL });
    const ok = screen === 'nightMenu' && r.leak === 0 && errors.length === 0;
    if (!ok) failed++;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${tag}: 规则页${screen === 'nightMenu' ? '已开' : '没开'}，卡片外透出 ${r.leak} 个像素（最大通道差 ${r.worst}${r.sample ? '，在 (' + r.sample[0] + ',' + r.sample[1] + ') 读到 rgb(' + r.sample.slice(2).join(',') + ')' : ''}）${errors.length ? '，报错 ' + errors.join(' | ') : ''}`);
    await ctx.close();
  }
  await browser.close();
  process.exit(failed ? 1 : 0);
})();
