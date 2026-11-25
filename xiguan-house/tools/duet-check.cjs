// 2026-11-25 Duet 巡检复核：底栏提示只在有键盘鼠标的设备上提空格 / 回车，触屏只说「点屋子」
// NODE_PATH="$(npm root -g)" node tools/duet-check.cjs <page-url> [screenshot-dir]
const { chromium } = require('playwright');
const path = require('node:path');
const [base, shots] = process.argv.slice(2);
if (!base) throw new Error('Provide page URL');
(async () => {
  const browser = await chromium.launch();
  let fails = 0;
  const check = (name, pass, detail) => { if (!pass) fails++; console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(detail)}`); };
  for (const [w, h, touch] of [[1440, 900, false], [390, 664, true], [390, 664, false]]) {
    const tag = `${w} hasTouch=${touch}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: w < 900 ? 2 : 1 });
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base + (base.includes('?') ? '&' : '?') + 'intro=skip');
    await page.waitForTimeout(800);
    const r = await page.evaluate(() => { const el = document.querySelector('.bar .hint'); const b = el.getBoundingClientRect(); return { text: el.innerText.trim(), coarse: matchMedia('(pointer: coarse)').matches, inView: b.bottom <= innerHeight && b.top >= 0 && b.width > 0 }; });
    const keyWords = /空格|回车/.test(r.text);
    check(`${tag} bottom hint matches the input (${touch ? 'tap only' : 'tap or keys'})`, r.inView && /点屋子/.test(r.text) && (touch ? !keyWords : keyWords), r);
    if (shots) await page.screenshot({ path: path.join(shots, `xiguan-${w}-touch${touch}.png`) });
    check(`${tag} zero page errors`, errors.length === 0, errors);
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `${fails} FAIL` : 'ALL PASS');
  process.exitCode = fails ? 1 : 0;
})();
