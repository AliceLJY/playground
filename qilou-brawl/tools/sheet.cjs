// 开发用：角色查看页按时间点逐帧截图，拼成一行看动作。node tools/sheet.cjs <url> <out.png> <t1,t2,...>
const { chromium } = require('playwright');
(async () => {
  const [url, out, ts] = process.argv.slice(2);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 360, height: 480 } })).newPage(), errs = [];
  page.on('pageerror', (e) => errs.push(e.message));
  await page.goto(url);
  await page.waitForFunction(() => window.__viewer && (window.__viewer.ready || window.__viewer.error), null, { polling: 200, timeout: 60000 });
  const shots = [];
  await page.evaluate(() => { const c = window.__viewer.char; c.playAnimation('a', { loop: true, rootMotion: false }); window.__t0 = performance.now(); });
  for (const t of ts.split(',').map(Number)) {
    await page.waitForFunction((t) => performance.now() - window.__t0 >= t * 1000, t, { polling: 10 });
    shots.push((await page.screenshot()).toString('base64'));
  }
  const html = `<body style="margin:0;display:flex;background:#000">${shots.map((b, i) => `<div style="position:relative"><img src="data:image/png;base64,${b}" width=240><span style="position:absolute;left:4px;bottom:4px;color:#fff;font:14px sans-serif">${ts.split(',')[i]}s</span></div>`).join('')}</body>`;
  const p2 = await browser.newPage({ viewport: { width: 240 * shots.length, height: 320 } }); await p2.setContent(html); await p2.screenshot({ path: out });
  if (errs.length) console.log('ERR', errs);
  await browser.close();
})();
