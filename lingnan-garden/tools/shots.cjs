// 固定机位截图 + 指标。用法：NODE_PATH="$(npm root -g)" node tools/shots.cjs <页面地址> <输出目录> [机位,机位…] [desk|phone]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const base = process.argv[2], out = process.argv[3], only = process.argv[4] && process.argv[4] !== 'all' ? process.argv[4].split(',') : null, dev = process.argv[5];
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const report = [];
  const all = ['card', 'pavilion', 'steps', 'veranda', 'inside', 'water', 'back', 'islet', 'bridge', 'far', 'gate', 'court', 'east', 'north', 'top'];
  for (const [vw, vh, tag, dpr] of [[1440, 810, 'desk', 1], [390, 664, 'phone', 2]]) {
    if (dev && dev !== tag) continue;
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, hasTouch: tag === 'phone', isMobile: tag === 'phone' });
    for (const name of all.filter(n => !only || only.includes(n))) {
      const page = await ctx.newPage(); const errors = [];
      page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`${base}?view=${name}&mute`);
      await page.waitForFunction(() => window.__garden && window.__garden.ready, null, { polling: 100, timeout: 30000 });
      await page.waitForTimeout(2200);
      const snap = await page.evaluate(() => ({ ...window.__garden.snapshot(), gpu: window.__garden.gpu() }));
      if (process.env.CLEAN) await page.addStyleTag({ content: '.hud,#ref,#joy{display:none!important}' });
      await page.screenshot({ path: path.join(out, `${tag}-${name}.png`) });
      report.push({ tag, name, errors, ...snap }); await page.close();
      console.log(tag, name, snap.mode, snap.place, snap.fps + 'fps', snap.calls + 'calls', snap.tris + 'tris', errors.length ? 'ERR ' + errors[0] : '');
    }
    await ctx.close();
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  await browser.close();
})();
