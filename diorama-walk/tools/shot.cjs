// Quick look: open dist/index.html with a query string and save one screenshot. Development helper, run by hand.
//   NODE_PATH="$(npm root -g)" node tools/shot.cjs <out.png> "<query>" [width] [height] [dpr] [js-to-run-in-page]
const { chromium } = require('playwright');
const path = require('path');
(async () => {
  const [out, query = '', w = '1280', h = '720', dpr = '1', js = ''] = process.argv.slice(2);
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const ctx = await browser.newContext({ viewport: { width: +w, height: +h }, deviceScaleFactor: +dpr, hasTouch: +w < 600, isMobile: +w < 600 });
  const page = await ctx.newPage(), errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html') + query);
  try { await page.waitForFunction(() => window.__diorama && window.__diorama.ready, null, { polling: 100, timeout: 20000 }); }
  catch (e) { console.log('NOT READY', errors); await browser.close(); process.exit(1); }
  if (js) console.log('eval:', JSON.stringify(await page.evaluate(js)));
  await page.waitForTimeout(400);
  const st = await page.evaluate(() => { const s = window.__diorama.state(); return { mode: s.mode, s: s.s, cam: s.cam, eye: s.eye, doors: s.doors.map((d) => d.k) }; });
  console.log(JSON.stringify(st));
  console.log(JSON.stringify(await page.evaluate(() => ({ ...window.__diorama.info(), box: window.__diorama.screenBox() }))));
  if (errors.length) console.log('ERRORS', errors.slice(0, 8));
  await page.screenshot({ path: out });
  await browser.close();
})();
