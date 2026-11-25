// Checks from the 2026-11-25 Duet review: Enter right after clicking ↻ only dispatches (no reshuffle); the main card
// button is bold 17px and larger than the 回标题 ghost button; ↻ in the 0.7 s before the clear card does not swallow it.
// Usage: NODE_PATH="$(npm root -g)" node tools/duet-check.cjs <base-url>
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8793/message-pipe/';
let fails = 0;
const check = (name, pass, detail) => { if (!pass) fails++; console.log(pass ? 'ok  ' : 'FAIL', name, pass ? '' : JSON.stringify(detail)); };
(async () => {
  const browser = await chromium.launch();
  for (const [w, h, touch] of [[1440, 900, false], [390, 664, true]]) {
    const page = await browser.newPage({ viewport: { width: w, height: h }, hasTouch: touch, isMobile: touch });
    const open = async (q) => { await page.goto(base + q); await page.waitForFunction(() => window.__pipe?.ready); };
    const font = (sel) => page.$eval(sel, (e) => ({ size: parseFloat(getComputedStyle(e).fontSize), weight: getComputedStyle(e).fontWeight }));
    // 1. card buttons
    await open('');
    const tGo = await font('#c-go');
    check(`${w} title 「开始」 button is bold 17px`, tGo.size === 17 && +tGo.weight >= 700, tGo);
    await open('?view=clear');
    const cGo = await font('#c-go'), cHome = await font('#c-home');
    check(`${w} clear card: 「下一关」 is larger than 「回标题」`, cGo.size > cHome.size && +cGo.weight >= 700, { go: cGo, home: cHome });
    // 2. click ↻, solve with real taps, then Enter
    await open('');
    await page.evaluate(() => window.__pipe.start(0, 7));
    await page.click('#again');
    const solve = async () => { for (const i of await page.evaluate(() => window.__pipe.solution())) { const p = await page.evaluate((k) => window.__pipe.cellCenter(k), i); await page.mouse.click(p.x, p.y); } };
    await solve();
    const a = await page.evaluate(() => window.__pipe.snapshot());
    await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    const b = await page.evaluate(() => window.__pipe.snapshot());
    check(`${w} Enter with focus left on ↻ dispatches and does not reshuffle`, a.outcome === 'delivered' && b.seed === a.seed && b.rides === 1 && b.steps === a.steps, { before: { seed: a.seed, steps: a.steps, outcome: a.outcome }, after: { seed: b.seed, steps: b.steps, rides: b.rides, phase: b.phase } });
    // 3. ↻ right after the level is cleared
    await page.evaluate(() => window.__pipe.start(0, 9));
    await solve();
    await page.click('#go', { force: true });   // it pulses when ready, so it is never 'stable'
    await page.waitForFunction(() => window.__pipe.snapshot().phase === 'cleared', null, { timeout: 30000 });
    await page.click('#again');
    await page.waitForTimeout(1200);
    const c = await page.evaluate(() => window.__pipe.snapshot());
    check(`${w} ↻ within 0.7 s of clearing does not lose the clear card`, c.card === 'cleared', { card: c.card, phase: c.phase });
    await page.close();
  }
  await browser.close();
  console.log(fails ? fails + ' failed' : 'all passed');
  process.exit(fails ? 1 : 0);
})();
