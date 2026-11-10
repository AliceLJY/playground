// 固定机位截图 + 指标。用法：NODE_PATH="$(npm root -g)" node tools/shots.cjs <基准地址> <输出目录> [机位,机位…]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const base = process.argv[2], out = process.argv[3], only = process.argv[4] ? process.argv[4].split(',') : null;
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const report = [];
  const jobs = [
    ['top', 'top', 30], ['wide', 'wide', 30], ['walk', 'walk', 30], ['quay', 'quay', 120], ['lane', 'lane', 30], ['facade', 'facade', 30],
    ['tea', 'tea', 45], ['porter', 'porter', 110], ['merchant', 'merchant', 30], ['hawker', 'hawker', 30], ['sampan', 'sampan', 30], ['junk', 'junk', 30],
  ].filter(j => !only || only.includes(j[0]));
  for (const [vw, vh, tag, dpr] of [[1440, 900, 'desk', 1], [390, 664, 'phone', 2]]) {
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, hasTouch: tag === 'phone', isMobile: tag === 'phone' });
    for (const [name, view, t] of jobs) {
      const page = await ctx.newPage(); const errors = [];
      page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`${base}?view=${view}&t=${t}&mute`);
      await page.waitForFunction(() => window.__hong && window.__hong.ready, null, { polling: 100, timeout: 30000 });
      await page.waitForTimeout(2600);
      const snap = await page.evaluate(() => ({ ...window.__PLAYTEST__.snapshot(), gpu: window.__hong.gpu() }));
      await page.screenshot({ path: path.join(out, `${tag}-${name}.png`) });
      report.push({ tag, name, errors, ...snap }); await page.close();
      console.log(tag, name, snap.mode, snap.follow || '', snap.stage, snap.fps + 'fps', snap.calls + 'calls', snap.tris + 'tris', errors.length ? 'ERR ' + errors[0] : '');
    }
    await ctx.close();
  }
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  await browser.close();
})();
