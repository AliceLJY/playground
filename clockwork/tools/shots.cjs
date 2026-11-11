// 质感对照用：三个固定机位各拍一张（全景、齿轮近景、手机竖屏），改前改后各跑一次再并排。
//   NODE_PATH="$(npm root -g)" node tools/shots.cjs <page-url> <out-dir>
const { chromium } = require('playwright'), path = require('node:path'), fs = require('node:fs');
(async () => {
  const [base, out] = process.argv.slice(2); fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
  for (const [name, w, h, zoom] of [['wide', 1440, 810, 0], ['close', 1440, 810, 1], ['phone', 390, 664, 0]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 600, deviceScaleFactor: w < 600 ? 2 : 1 });
    const page = await ctx.newPage(), errors = []; page.on('pageerror', (e) => errors.push(e.message)); page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    await page.goto(base + '?debug=1'); await page.waitForSelector('canvas'); await page.waitForTimeout(800);
    await page.locator('#pause').click();
    if (zoom) { await page.mouse.move(w * .5, h * .45); for (let i = 0; i < 9; i++) { await page.mouse.wheel(0, -240); await page.waitForTimeout(60); } await page.mouse.move(w * .5, h * .5); await page.mouse.down(); await page.mouse.move(w * .56, h * .47, { steps: 6 }); await page.mouse.up(); }
    await page.waitForTimeout(900);
    await page.screenshot({ path: path.join(out, name + '.png') });
    console.log(name, JSON.stringify(errors));
    await ctx.close();
  }
  await browser.close();
})();
