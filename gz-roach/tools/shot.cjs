// 看一眼：打开 dist/index.html 的固定机位，存截图并打印钩子读数。开发用，手动跑。
//   NODE_PATH="$(npm root -g)" node tools/shot.cjs <out-dir> <view|at=秒,...> [宽] [高] [像素比]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const [out, list = 'hero', w = '1440', h = '900', dpr = '1'] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
  for (const item of list.split(',')) {
    const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr, hasTouch: +w < 600, isMobile: +w < 600 });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
    const query = item.startsWith('at=') ? '?at=' + item.slice(3) : '?view=' + item;
    await page.goto('file://' + path.resolve(__dirname, '../dist/index.html') + query);
    try { await page.waitForFunction(() => window.__roach && window.__roach.ready, null, { polling: 100, timeout: 20000 }); }
    catch (e) { console.log(item, 'NOT READY', errors); await ctx.close(); continue; }
    await page.waitForTimeout(400);
    const info = await page.evaluate(() => ({ ...window.__roach.info(), box: window.__roach.roachBox() }));
    const file = path.join(out, `${item.replace('=', '')}-${w}x${h}.png`);
    await page.screenshot({ path: file });
    console.log(item, JSON.stringify({ calls: info.calls, tris: info.tris, meshes: info.meshes, r: info.renderer.slice(0, 40), box: [info.box.x0, info.box.x1, info.box.y0, info.box.y1].map((x) => +x.toFixed(2)) }), errors.length ? 'ERRORS ' + errors.slice(0, 5).join(' | ') : '');
    await ctx.close();
  }
  await browser.close();
})();
