// 浏览器验收：打开打包产物的固定机位或自动驾驶，等就绪后截图，报告页面错误与状态。
//   NODE_PATH="$(npm root -g)" node tools/browser-check.cjs <base-url> <out-dir> [w] [h]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [base, out, w = '1280', h = '720'] = process.argv.slice(2);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
  const results = [];
  for (const [name, query, wait] of [['hero', '?view=hero', 2500], ['wide', '?view=wide', 2500], ['stress', '?view=stress', 3000], ['boss', '?view=boss', 3000], ['auto', '?auto&seed=3', 25000]]) {
    const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, hasTouch: +w < 600, isMobile: +w < 600 });
    const page = await ctx.newPage(), errors = []; let bytes = 0;
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
    page.on('response', async (r) => { try { const b = await r.body(); bytes += b.length; } catch {} });
    await page.goto(base + query);
    try { await page.waitForFunction(() => window.__qilou && (window.__qilou.ready || window.__qilou.error), null, { polling: 200, timeout: 90000 }); }
    catch { results.push({ name, error: 'not ready', errors }); await ctx.close(); continue; }
    await page.waitForTimeout(wait);
    const info = await page.evaluate(() => window.__qilou.error ? { error: window.__qilou.error } : { ...window.__qilou.info(), snap: window.__qilou.snapshot() });
    await page.screenshot({ path: path.join(out, `${name}-${w}x${h}.png`) });
    results.push({ name, info, mb: +(bytes / 1048576).toFixed(1), errors: errors.slice(0, 6) });
    await ctx.close();
  }
  console.log(JSON.stringify(results, null, 1));
  await browser.close();
})();
