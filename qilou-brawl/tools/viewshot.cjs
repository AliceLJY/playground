// 开发用：打开角色查看页，隔 0.4 s 截两帧，报告页面错误与两帧差异。
//   NODE_PATH="$(npm root -g)" node tools/viewshot.cjs <url> <outprefix>
const { chromium } = require('playwright');
(async () => {
  const [url, out] = process.argv.slice(2);
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await (await browser.newContext({ viewport: { width: 900, height: 900 } })).newPage(), errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(url);
  try { await page.waitForFunction(() => window.__viewer && (window.__viewer.ready || window.__viewer.error), null, { polling: 200, timeout: 60000 }); }
  catch (e) { console.log('TIMEOUT', errors.slice(0, 8)); await browser.close(); process.exit(1); }
  const st = await page.evaluate(() => ({ ready: window.__viewer.ready, error: window.__viewer.error }));
  console.log(JSON.stringify(st));
  await page.waitForTimeout(1500);
  const a = await page.screenshot({ path: out + '-a.png' });
  await page.waitForTimeout(400);
  const b = await page.screenshot({ path: out + '-b.png' });
  let diff = 0; for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) diff++;
  console.log('png byte diff ratio', (diff / a.length).toFixed(3), 'errors', errors.slice(0, 8));
  await browser.close();
})();
