// 第二轮对照图：与超哥参考帧同视角的七组截图。用法：NODE_PATH="$(npm root -g)" node tools/compare2.cjs <页面地址> <输出目录>
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => {
  const base = process.argv[2], out = process.argv[3]; fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const ctx = await browser.newContext({ viewport: { width: 1114, height: 720 }, deviceScaleFactor: 1 });
  // [文件名, 光, 视点 或 [机位, 看向]]
  const jobs = [['1-whole', 'morning', 'whole'], ['2-nativity', 'morning', [[150, 66, 62], [14, 58, -12]]], ['3-passion', 'noon', 'passion'], ['4-nave', 'morning', [[0, 3.2, 40], [0, 14, -10]]],
    ['5-column', 'morning', [[-3.2, 16.5, 21.5], [-7.5, 20.5, 16.5]]], ['6-vault', 'noon', 'vault'], ['7-rays', 'evening', 'evening-glass']];
  for (const [name, light, v] of jobs) {
    const page = await ctx.newPage(); const errs = []; page.on('pageerror', e => errs.push(String(e)));
    await page.goto(`${base}?view=${typeof v === 'string' ? v : 'whole'}&light=${light}&still`);
    await page.waitForFunction(() => window.__sf && window.__sf.ready, null, { polling: 100, timeout: 30000 });
    if (typeof v !== 'string') await page.evaluate(([p, l, li]) => { window.__sf.shot(p, l); window.__sf.setLight(li); }, [v[0], v[1], light]);
    await page.waitForTimeout(2200); await page.screenshot({ path: path.join(out, `r2-${name}.png`) });
    const s = await page.evaluate(() => window.__sf.snapshot()); console.log(name, s.zone, s.fps + 'fps', s.tris, errs[0] || ''); await page.close();
  }
  await browser.close();
})();
