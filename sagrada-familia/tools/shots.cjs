// 固定视点截图 + 指标。用法：NODE_PATH="$(npm root -g)" node tools/shots.cjs <基准地址> <输出目录> [视点,视点…] [desk|phone]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const base = process.argv[2], out = process.argv[3], only = process.argv[4] && process.argv[4] !== 'all' ? process.argv[4].split(',') : null, which = process.argv[5];
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const report = [];
  // [文件名, 视点, 光, 额外动作]
  const jobs = [
    ['whole', 'whole', 'morning'], ['nativity', 'nativity', 'morning'], ['nativity-detail', 'nativity-detail', 'morning'], ['passion', 'passion', 'evening'], ['passion-detail', 'passion-detail', 'evening'],
    ['glory', 'glory', 'noon'], ['towers', 'towers', 'noon'], ['cross', 'cross', 'noon'], ['pinnacles', 'pinnacles', 'morning'], ['apse', 'apse', 'evening'],
    ['nave', 'nave', 'morning'], ['columns', 'columns', 'morning'], ['vault', 'vault', 'noon'], ['crossing', 'crossing', 'noon'], ['altar', 'altar', 'noon'],
    ['morning-glass', 'morning-glass', 'morning'], ['evening-glass', 'evening-glass', 'evening'], ['nave-evening', 'nave', 'evening'], ['walk-out', 'glory', 'morning', 'walk'],
  ].filter(j => !only || only.includes(j[0]));
  for (const [vw, vh, tag, dpr] of [[1440, 900, 'desk', 1], [390, 760, 'phone', 2]]) {
    if (which && which !== tag) continue;
    const ctx = await browser.newContext({ viewport: { width: vw, height: vh }, deviceScaleFactor: dpr, hasTouch: tag === 'phone', isMobile: tag === 'phone' });
    for (const [name, view, light, mode] of jobs) {
      const page = await ctx.newPage(); const errors = [];
      page.on('pageerror', e => errors.push(String(e))); page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
      await page.goto(`${base}?view=${view}&light=${light}&still${mode ? '&mode=' + mode : ''}`);
      await page.waitForFunction(() => window.__sf && window.__sf.ready, null, { polling: 100, timeout: 30000 });
      await page.waitForTimeout(2200);
      const snap = await page.evaluate(() => ({ ...window.__sf.snapshot(), gpu: window.__sf.gpu() }));
      await page.screenshot({ path: path.join(out, `${tag}-${name}.png`) });
      report.push({ tag, name, errors, ...snap }); await page.close();
      console.log(tag, name, snap.mode, snap.zone, snap.fps + 'fps', snap.calls + 'calls', snap.tris + 'tris', errors.length ? 'ERR ' + errors[0] : '');
    }
    await ctx.close();
  }
  fs.writeFileSync(path.join(out, `report${which ? '-' + which : ''}.json`), JSON.stringify(report, null, 1));
  await browser.close();
})();
