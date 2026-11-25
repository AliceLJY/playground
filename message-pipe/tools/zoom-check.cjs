// Page zoom (Duet 2026-11-25 #7, WCAG 1.4.4): the viewport no longer forbids pinch zoom, while the board and the buttons
// still do not zoom on a pinch or a double tap. Phone emulation 390×664 with touch; pinch and taps go through CDP's
// touch input, so touch-action applies as it would on a phone (not a real phone).
// Usage: NODE_PATH="$(npm root -g)" node tools/zoom-check.cjs <base-url>
const { chromium } = require('playwright');
const base = process.argv[2] || 'http://127.0.0.1:8793/message-pipe/';
let fails = 0;
const check = (name, pass, detail) => { if (!pass) fails++; console.log(pass ? 'ok  ' : 'FAIL', name, JSON.stringify(detail)); };
(async () => {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 664 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage(), cdp = await ctx.newCDPSession(page);
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  const open = async () => { await page.goto(base); await page.waitForFunction(() => window.__pipe?.ready); };
  const scale = () => page.evaluate(() => window.visualViewport.scale);
  const pinch = async (x, y) => { await cdp.send('Input.synthesizePinchGesture', { x, y, scaleFactor: 2.5, gestureSourceType: 'touch' }); await page.waitForTimeout(400); };
  const tap = (x, y) => cdp.send('Input.synthesizeTapGesture', { x, y, gestureSourceType: 'touch' });
  const centre = async (sel) => { const b = await page.locator(sel).boundingBox(); return { x: Math.round(b.x + b.width / 2), y: Math.round(b.y + b.height / 2) }; };

  await open();
  const meta = await page.$eval('meta[name=viewport]', (m) => m.content);
  check('viewport meta allows zoom', !/user-scalable\s*=\s*(no|0)/i.test(meta) && !/maximum-scale\s*=\s*1(\.0*)?\b/i.test(meta), meta);
  // 1. the page as a whole zooms: pinch on the title card text
  const card = await centre('#cardbox');
  await pinch(card.x, card.y);
  const s1 = await scale();
  check('pinch on the title card zooms the page', s1 > 1.2, { scale: s1 });

  // 2. during play the board keeps its pinch for itself
  await open();
  await page.evaluate(() => window.__pipe.start(0, 7));
  await page.waitForTimeout(300);
  const board = await centre('#board');
  await pinch(board.x, board.y);
  const s2 = await scale();
  check('pinch on the board does not zoom the page', Math.abs(s2 - 1) < 0.01, { scale: s2 });

  // 3. a double tap on a pipe turns it twice and does not zoom
  const cell = await page.evaluate(() => { const s = window.__pipe.solution(); return { i: s[0], p: window.__pipe.cellCenter(s[0]) }; });
  const before = (await page.evaluate(() => window.__pipe.snapshot())).steps;
  await tap(Math.round(cell.p.x), Math.round(cell.p.y)); await page.waitForTimeout(60);
  await tap(Math.round(cell.p.x), Math.round(cell.p.y)); await page.waitForTimeout(500);
  const after = (await page.evaluate(() => window.__pipe.snapshot())).steps, s3 = await scale();
  check('double tap on a pipe turns it twice without zooming', after - before === 2 && Math.abs(s3 - 1) < 0.01, { steps: after - before, scale: s3 });

  // 4. a double tap on ↻ does not zoom (touch-action: manipulation on buttons)
  const again = await centre('#again');
  await tap(again.x, again.y); await page.waitForTimeout(60);
  await tap(again.x, again.y); await page.waitForTimeout(500);
  const s4 = await scale();
  check('double tap on ↻ does not zoom', Math.abs(s4 - 1) < 0.01, { scale: s4 });

  check('no page errors', errors.length === 0, errors);
  await browser.close();
  console.log(fails ? `${fails} FAIL` : 'all passed');
  process.exit(fails ? 1 : 0);
})();
