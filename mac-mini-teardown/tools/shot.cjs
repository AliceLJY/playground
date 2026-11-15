// 看一眼：打开 dist/index.html 的固定机位，存截图并打印钩子读数。开发用，手动跑。
//   NODE_PATH="$(npm root -g)" node tools/shot.cjs <out-dir> <view|at=秒|s=进度,...> [宽] [高] [像素比] [--capture]
const { chromium } = require('playwright');
const path = require('path'), fs = require('fs');
(async () => {
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--')), cap = process.argv.includes('--capture');
  const [out, list = 'open', w = '1365', h = '900', dpr = '1'] = args;
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
  for (const item of list.split(',')) {
    const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr, hasTouch: +w < 600, isMobile: +w < 600 });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
    const query = (item.includes('=') ? '?' + item : '?view=' + item) + (cap ? '&capture' : '');
    await page.goto('file://' + path.resolve(__dirname, '../dist/index.html') + query);
    try { await page.waitForFunction(() => window.__mini && window.__mini.ready, null, { polling: 100, timeout: 20000 }); }
    catch (e) { console.log(item, 'NOT READY', errors); await ctx.close(); continue; }
    await page.waitForTimeout(300);
    const info = await page.evaluate(() => ({ ...window.__mini.info(), box: window.__mini.box(), st: window.__mini.state() }));
    const file = path.join(out, `${item.replace('=', '')}-${w}x${h}${cap ? '-cap' : ''}.png`);
    await page.screenshot({ path: file });
    console.log(item, JSON.stringify({ s: +info.st.s.toFixed(2), calls: info.calls, tris: info.tris, r: info.renderer.slice(0, 50), box: [info.box.x0, info.box.x1, info.box.y0, info.box.y1].map((x) => +x.toFixed(2)) }), errors.length ? 'ERRORS ' + errors.slice(0, 5).join(' | ') : '');
    await ctx.close();
  }
  await browser.close();
})();
