// Keyboard check: with focus left on a failure card (after clicking or tabbing to it), the arrow keys still turn scenes,
// and Enter still flips the focused card. Usage: NODE_PATH="$(npm root -g)" node tools/keys-check.cjs <base-url>
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8793/agent-engine/';
let fails = 0;
const check = (name, pass, detail) => { if (!pass) fails++; console.log(pass ? 'ok  ' : 'FAIL', name, pass ? '' : JSON.stringify(detail)); };
(async () => {
  const browser = await chromium.launch();
  for (const [w, h, touch] of [[1440, 900, false], [390, 664, true]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
    await page.goto(base);
    await page.waitForFunction(() => window.__agentEngine?.ready);
    const st = () => page.evaluate(() => window.__agentEngine.state());
    await page.evaluate(() => window.__agentEngine.go(4));
    await page.locator('#cards .fc').first().click();
    const a = await st();
    check(`${w} click flips card 1`, a.cards.flipped.includes(1), a.cards);
    check(`${w} focus is on the card`, await page.evaluate(() => document.activeElement.classList.contains('fc')), null);
    await page.keyboard.press('ArrowRight');
    const b = await st();
    check(`${w} ArrowRight with focus on a card goes to scene 5`, b.view === 5, { view: b.view });
    await page.keyboard.press('ArrowLeft');
    const c = await st();
    check(`${w} ArrowLeft comes back to scene 4`, c.view === 4, { view: c.view });
    await page.locator('#cards .fc').nth(1).focus();
    await page.keyboard.press('Enter');
    const d = await st();
    check(`${w} Enter on a focused card still flips it`, d.cards.flipped.includes(2) && d.view === 4, d.cards);
    await page.close();
  }
  await browser.close();
  console.log(fails ? fails + ' failed' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
