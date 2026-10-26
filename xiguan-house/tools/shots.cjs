// 固定机位截图 + 控制台检查。
//   NODE_PATH="$(npm root -g)" node tools/shots.cjs <page-url> <out-dir> [t1,t2,...]
// 每个时刻用 ?view=mid&t= 直接定格（同一条时间线上的真实姿势）；另拍 1920×1080 与 390×664 手机两档。
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
(async () => {
  const [url, out, list] = process.argv.slice(2);
  fs.mkdirSync(out, { recursive: true });
  const times = (list || '0,0.6,1.3,1.9,2.4,2.9,3.4').split(',').map(Number);
  const b = await chromium.launch();
  const report = [];
  for (const [tag, vp] of [['desk', { width: 1920, height: 1080 }], ['phone', { width: 390, height: 664 }]]) {
    const ctx = await b.newContext({ viewport: vp, deviceScaleFactor: tag === 'phone' ? 2 : 1 });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    for (const t of (tag === 'phone' ? [0, 2.4, 3.4] : times)) {
      await page.goto(`${url}?view=mid&t=${t}`);
      await page.waitForFunction(() => window.__xiguan && window.__xiguan.ready, null, { polling: 100 });
      await page.waitForTimeout(150);
      const st = await page.evaluate(() => ({ s: window.__xiguan.s, faces: window.__xiguan.faces, cycles: window.__xiguan.cycles, box: window.__xiguan.screenBox(), btn: document.getElementById('toggle').getBoundingClientRect().toJSON() }));
      const file = path.join(out, `${tag}-${t.toFixed(2)}.png`);
      await page.screenshot({ path: file });
      report.push({ tag, t, ...st });
    }
    report.push({ tag, errors });
    await ctx.close();
  }
  await b.close();
  fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 1));
  console.log(JSON.stringify(report.map((r) => r.errors ? { tag: r.tag, errors: r.errors } : { tag: r.tag, t: r.t, s: r.s, faces: r.faces, cycles: r.cycles, boxBottom: Math.round(r.box.y1), btnTop: Math.round(r.btn.top) })));
})();
