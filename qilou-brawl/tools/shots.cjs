// 质感对照用：同一批固定机位各拍一张，改前改后各跑一次再并排。
//   NODE_PATH="$(npm root -g)" node tools/shots.cjs <base-url> <out-dir>
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [base, out] = process.argv.slice(2);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
  const results = []; let failed = false;
  for (const [name, query, w, h] of [['hero', '?view=hero', 1440, 810], ['wide', '?view=wide', 1440, 810], ['boss', '?view=boss', 1440, 810], ['phone', '?view=hero', 390, 664]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: w < 600, isMobile: w < 600, deviceScaleFactor: w < 600 ? 2 : 1 });
    const page = await ctx.newPage(), errors = [];
    page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
    await page.goto(base + query);
    try { await page.waitForFunction(() => window.__qilou && (window.__qilou.ready || window.__qilou.error), null, { polling: 200, timeout: 90000 }); }
    catch { results.push({ name, error: 'not ready', errors }); failed = true; await ctx.close(); continue; }
    await page.waitForTimeout(3000);
    const info = await page.evaluate(() => window.__qilou.error ? { error: window.__qilou.error } : window.__qilou.info());
    await page.screenshot({ path: path.join(out, `${name}.png`) });
    const view = await page.evaluate(() => window.__qilou.view), want = new URLSearchParams(query).get('view'), bad = errors.filter((e) => !e.startsWith('warning:'));
    if (info.error || view !== want || bad.length) failed = true; // 机位没进对、页面报错都算失败，别把没生效的状态当成那个机位拍下来
    results.push({ name, want, view, backend: info.backend, fps: info.fps, enemies: info.enemies, errors: errors.slice(0, 6) });
    await ctx.close();
  }
  console.log(JSON.stringify(results, null, 1));
  await browser.close();
  process.exitCode = failed ? 1 : 0;
})();
