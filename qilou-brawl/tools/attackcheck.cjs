// 走到阿婆跟前出拳、出脚，在出手那一刻截图，看招式是不是朝着对手打。
//   NODE_PATH="$(npm root -g)" node tools/attackcheck.cjs <url> <outprefix>
const { chromium } = require('playwright');
(async () => {
  const [url, out] = process.argv.slice(2);
  const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await (await b.newContext({ viewport: { width: 960, height: 600 } })).newPage();
  await page.goto(url);
  await page.waitForFunction(() => window.__qilou && window.__qilou.ready, null, { polling: 200, timeout: 90000 });
  await page.click('#start'); await page.waitForTimeout(300);
  await page.keyboard.press('Enter'); await page.waitForTimeout(150); await page.keyboard.press('Enter');
  await page.keyboard.down('KeyW'); await page.waitForTimeout(900); await page.keyboard.up('KeyW');
  const st = () => page.evaluate(() => { const s = window.__qilou.sim(), p = s.player; return { a: Math.round(p.a * 57.3), state: p.state, move: p.move, st: +p.st.toFixed(2), hits: s.stats.hitsLanded }; });
  for (const [key, name, waitMs] of [['KeyJ', 'jab', 170], ['KeyK', 'kick', 330]]) {
    await page.waitForTimeout(700);
    await page.keyboard.press(key); await page.waitForTimeout(waitMs);
    await page.screenshot({ path: `${out}-${name}.png` }); console.log(name, JSON.stringify(await st()));
  }
  await b.close();
})();
