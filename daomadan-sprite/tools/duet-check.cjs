// Checks from the 2026-11-25 Duet review: the 跑 button follows Shift; Enter on a focused pad button acts; phones do not
// show the keyboard hint; holding ← on a touch screen keeps walking when the finger drifts a little.
// Usage: NODE_PATH="$(npm root -g)" node tools/duet-check.cjs <base-url>
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8793/daomadan-sprite/';
let fails = 0;
const check = (name, pass, detail) => { if (!pass) fails++; console.log(pass ? 'ok  ' : 'FAIL', name, pass ? '' : JSON.stringify(detail)); };
(async () => {
  const browser = await chromium.launch();
  for (const [w, h, touch] of [[1440, 900, false], [390, 664, true]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
    await page.goto(base + '?view=stage'); await page.waitForFunction(() => window.__PLAYTEST__?.ready);
    const snap = () => page.evaluate(() => window.__PLAYTEST__.snapshot());
    const pressed = () => page.$eval('[data-k=run]', (b) => b.getAttribute('aria-pressed'));
    const hint = await page.$eval('.keys', (e) => getComputedStyle(e).display !== 'none');
    check(`${w} keyboard hint ${touch ? 'hidden on a touch phone' : 'shown with a mouse'}`, hint === !touch, { shown: hint });
    if (!touch) {
      await page.click('[data-k=run]');
      await page.keyboard.down('Shift'); const a = [await pressed(), (await snap()).run];
      await page.keyboard.up('Shift'); const b = [await pressed(), (await snap()).run];
      check(`${w} 跑 button follows Shift down/up`, a[0] === 'true' && a[1] === true && b[0] === 'false' && b[1] === false, { down: a, up: b });
      for (const [k, act] of [['attack', 'attack'], ['jump', 'jump'], ['hurt', 'hurt']]) {
        await page.waitForTimeout(1300);
        const n0 = (await snap()).plays[act] || 0;
        await page.locator(`[data-k=${k}]`).focus(); await page.keyboard.press('Enter'); await page.waitForTimeout(60);
        const s = await snap();
        check(`${w} Enter on focused ${k} button plays it once`, s.plays[act] === n0 + 1, { before: n0, after: s.plays[act], state: s.state });
      }
      await page.waitForTimeout(1300);
      const x0 = (await snap()).x;
      await page.locator('[data-k=left]').focus(); await page.keyboard.down('Enter'); await page.waitForTimeout(500);
      const mid = await snap(); await page.keyboard.up('Enter'); await page.waitForTimeout(200);
      const end = await snap();
      check(`${w} holding Enter on ← walks left, letting go stops`, mid.state === 'walk' && mid.x < x0 && end.state !== 'walk', { x0, mid, end: end.state });
    } else {
      // finger down on ←, drift 24px sideways and 12px down, keep holding
      const cdp = await page.context().newCDPSession(page);
      const box = await page.locator('[data-k=left]').boundingBox();
      const x = box.x + box.width / 2, y = box.y + box.height / 2;
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
      for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x + i * 4, y: y + i * 2 }] }); await page.waitForTimeout(30); }
      await page.waitForTimeout(500);
      const s = await snap();
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      check(`${w} finger drifting on ← keeps walking`, s.state === 'walk', s);
    }
    await page.close();
  }
  await browser.close();
  console.log(fails ? fails + ' failed' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
