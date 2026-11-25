// Keyboard check (2026-11-25 Duet review): the board frame is role=button with tabindex=0, so Enter on it must
// pause and resume like a click or Space. Usage: NODE_PATH="$(npm root -g)" node tools/keys-check.cjs <base-url>
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8793/handwritten-board/';
let fails = 0;
const check = (name, pass, detail) => { if (!pass) fails++; console.log(pass ? 'ok  ' : 'FAIL', name, pass ? '' : JSON.stringify(detail)); };
(async () => {
  const browser = await chromium.launch();
  for (const [w, h, touch] of [[1440, 900, false], [390, 664, true]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
    await page.goto(base);
    await page.waitForFunction(() => window.__handBoard?.ready);
    const st = () => page.evaluate(() => window.__handBoard.state());
    await page.waitForTimeout(600);
    await page.locator('#frame').focus();
    const a = await st();
    await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    const b = await st();
    check(`${w} Enter on the focused board pauses it`, !a.paused && b.paused, { before: a.paused, after: b.paused });
    await page.keyboard.press('Enter'); await page.waitForTimeout(150);
    const c = await st();
    check(`${w} Enter again resumes`, b.paused && !c.paused, { before: b.paused, after: c.paused });
    await page.keyboard.press('Space'); await page.waitForTimeout(150);
    const d = await st();
    check(`${w} Space on the focused board still pauses`, d.paused, { after: d.paused });
    await page.close();
  }
  await browser.close();
  console.log(fails ? fails + ' failed' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
