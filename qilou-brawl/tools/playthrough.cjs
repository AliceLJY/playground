// 浏览器里让自动驾驶快进打完整局，记录每段耗时、最终结果和结束画面。
//   NODE_PATH="$(npm root -g)" node tools/playthrough.cjs <base-url> <out.png> [seed] [fast]
const { chromium } = require('playwright');
(async () => {
  const [base, out, seed = '3', fast = '4'] = process.argv.slice(2);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage(), errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(`${base}?auto&seed=${seed}&fast=${fast}`);
  await page.waitForFunction(() => window.__qilou && window.__qilou.ready, null, { polling: 200, timeout: 90000 });
  const t0 = Date.now(), log = []; let last = -1, fpsMin = 999;
  while (Date.now() - t0 < 240000) {
    const i = await page.evaluate(() => window.__qilou.info());
    if (i.wave !== last) { log.push(`wave ${i.wave} at sim ${i.t}s`); last = i.wave; }
    if (i.fps) fpsMin = Math.min(fpsMin, i.fps);
    if (i.phase !== 'fight') { log.push(`${i.phase} at sim ${i.t}s hp ${i.hp}`); break; }
    await page.waitForTimeout(500);
  }
  await page.waitForTimeout(2500);
  await page.screenshot({ path: out });
  console.log(log.join('\n'), '\nfps min', fpsMin, 'errors', errors.slice(0, 5));
  await browser.close();
})();
