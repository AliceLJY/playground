// 复现「按 W 跑起来就往右转」：开局跳过对白，按住一个方向键，按时间截图，同时记录逻辑里的朝向与位移。
//   NODE_PATH="$(npm root -g)" node tools/runcheck.cjs <url> <outprefix> [key]
const { chromium } = require('playwright');
(async () => {
  const [url, out, key = 'KeyW'] = process.argv.slice(2);
  const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await (await b.newContext({ viewport: { width: 960, height: 600 } })).newPage();
  await page.goto(url);
  await page.waitForFunction(() => window.__qilou && window.__qilou.ready, null, { polling: 200, timeout: 90000 });
  await page.click('#start'); await page.waitForTimeout(300);
  for (let i = 0; i < 4; i++) { await page.keyboard.press('Space'); await page.waitForTimeout(150); }
  await page.waitForTimeout(800);
  const st = () => page.evaluate(() => { const s = window.__qilou.sim(), p = s.player; return { x: +p.x.toFixed(2), z: +p.z.toFixed(2), a: +(p.a * 180 / Math.PI).toFixed(0), state: p.state }; });
  await page.screenshot({ path: `${out}-0.png` }); console.log('before', JSON.stringify(await st()));
  await page.keyboard.down(key);
  for (const t of [300, 700, 1400]) { await page.waitForTimeout(t === 300 ? 300 : t - (t === 700 ? 300 : 700)); await page.screenshot({ path: `${out}-${t}.png` }); console.log(t, JSON.stringify(await st())); }
  await page.keyboard.up(key); await b.close();
})();
