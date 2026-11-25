// 2026-11-25 Duet 巡检复核：标注开关状态、倍率滑杆的名字与触控高度、倍率写法、手机提示、标注不贴边
// NODE_PATH="$(npm root -g)" node tools/duet-check.cjs <page-url> [screenshot-dir]
const { chromium } = require('playwright');
const path = require('node:path');
const [base, shots] = process.argv.slice(2);
if (!base) throw new Error('Provide page URL');
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  let fails = 0;
  const check = (name, pass, detail) => { if (!pass) fails++; console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(detail)}`); };
  for (const [w, h, touch] of [[1440, 900, false], [390, 664, true], [390, 664, false]]) {
    const tag = `${w} hasTouch=${touch}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch, deviceScaleFactor: w < 900 ? 2 : 1 });
    const page = await ctx.newPage(); const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(base);
    await page.waitForFunction(() => getComputedStyle(document.getElementById('labels-container')).visibility === 'visible', null, { timeout: 30000 });
    await page.waitForTimeout(500);
    const btn = page.locator('#toggle-labels');
    const nameOf = () => btn.evaluate((b) => (b.getAttribute('aria-label') || b.innerText).replace(/\s+/g, ''));
    const shownName = await nameOf();
    if (shots) await page.screenshot({ path: path.join(shots, `clockwork-${w}-touch${touch}-labels.png`) });
    await btn.click();
    const hidden = await page.evaluate(() => getComputedStyle(document.getElementById('labels-container')).display === 'none');
    const hiddenName = await nameOf();
    check(`${tag} label toggle names the action it will do`, hidden && /隐藏/.test(shownName) && !/显示/.test(shownName) && /显示/.test(hiddenName) && !/隐藏/.test(hiddenName), { shownName, hiddenName, hidden });
    if (shots) await page.screenshot({ path: path.join(shots, `clockwork-${w}-touch${touch}-labels-off.png`) });
    await btn.click();
    const slider = await page.locator('#speed-slider').evaluate((s) => { const r = s.getBoundingClientRect(); return { name: s.getAttribute('aria-label') || (s.labels && s.labels[0] ? s.labels[0].innerText : ''), w: Math.round(r.width), h: Math.round(r.height) }; });
    check(`${tag} speed slider has a name`, slider.name.length > 0, slider);
    if (w < 900) check(`${tag} speed slider touch height >=44px`, slider.h >= 44, slider);
    const speed = await page.locator('.control-row span').innerText();
    check(`${tag} speed reads with full-width colon and ×`, speed.includes('：60×') && !/[:x]/.test(speed), speed);
    const hints = await page.evaluate(() => ({ mouse: getComputedStyle(document.querySelector('.mouse-hint')).display !== 'none', touch: getComputedStyle(document.querySelector('.touch-hint')).display !== 'none', coarse: matchMedia('(pointer: coarse)').matches }));
    check(`${tag} hint matches the pointer (touch -> gestures)`, touch ? (hints.touch && !hints.mouse) : (hints.mouse && !hints.touch), hints);
    const labels = await page.evaluate(() => [...document.querySelectorAll('.gear-label')].map((el) => { const r = el.getBoundingClientRect(); return { id: el.id, left: Math.round(r.left), right: Math.round(r.right), gap: Math.round(innerWidth - r.right) }; }));
    check(`${tag} labels keep >=8px from the right edge`, labels.every((l) => l.gap >= 8 && l.left >= 0), labels);
    check(`${tag} zero page errors`, errors.length === 0, errors);
    await ctx.close();
  }
  await browser.close();
  console.log(fails ? `${fails} FAIL` : 'ALL PASS');
  process.exitCode = fails ? 1 : 0;
})();
