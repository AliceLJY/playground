// B6: opening instructions match the actual tap-then-zoom sequence, normal and calm.
// NODE_PATH="$(npm root -g)" node tools/entry-check.cjs <out-dir> <page-url>
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const [out, base] = process.argv.slice(2);
if (!out || !base) throw new Error('usage: entry-check.cjs <out-dir> <page-url>');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
  const report = { base, browser: browser.version(), checks: [], errors: [], devices: [] };
  const check = (name, pass, detail) => { report.checks.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(detail)}`); };
  try {
    for (const calm of [false, true]) for (const [width, height] of [[390, 664], [320, 568], [844, 340], [1365, 900]]) {
      const touch = width < 900, size = `${calm ? 'calm' : 'normal'}-${width}x${height}`;
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: touch ? 2 : 1, hasTouch: touch, isMobile: touch });
      const page = await ctx.newPage(); page.on('pageerror', e => report.errors.push(e.message));
      await page.goto(base + (calm ? '?calm=1' : ''));
      await page.waitForFunction(() => window.__diorama?.ready, null, { polling: 100 });
      report.devices.push(await page.evaluate(() => { const i = __diorama.info(); return { gpu: i.gpu, dpr: i.dpr, deviceDpr: i.deviceDpr, css: i.css, buffer: i.buffer }; }));
      const cdp = await ctx.newCDPSession(page);
      const pinch = async () => {
        const x = width / 2, y = height / 2;
        const send = (type, d) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x: x - d, y, id: 1 }, { x: x + d, y, id: 2 }] });
        await send('touchStart', 25);
        for (let i = 1; i <= 12; i++) { await send('touchMove', 25 + 90 * i / 12); await page.waitForTimeout(20); }
        await send('touchEnd');
      };
      const go = await page.locator('#card .go').textContent();
      check(`${size} says tap first`, /点一下开始/.test(go), go);
      const layout = await page.evaluate(() => { const e = document.querySelector('#card .go'), r = e.getBoundingClientRect(), b = document.querySelector('#card .box').getBoundingClientRect(); return { visible: b.top >= 0 && b.bottom <= innerHeight && b.left >= 0 && b.right <= innerWidth, hit: e.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)) }; });
      check(`${size} start visible and hittable`, layout.visible && layout.hit, layout);
      if (touch) await pinch(); else { await page.mouse.move(width / 2, height / 2); await page.mouse.wheel(0, -600); }
      const blocked = await page.evaluate(() => ({ open: __diorama.card().open, z: __diorama.state().z, mode: __diorama.state().mode }));
      check(`${size} card still gates zoom`, blocked.open && blocked.z === 0 && blocked.mode === 'orbit', blocked);
      await page.screenshot({ path: path.join(out, `${size}-card.png`) });
      if (touch) await page.locator('#card .go').tap(); else await page.click('#card .go');
      const hint = await page.locator('#hint').textContent();
      check(`${size} tap reveals zoom instructions`, !(await page.evaluate(() => __diorama.card().open)) && /双指|滚轮/.test(hint), hint);
      if (touch) await pinch(); else { await page.mouse.move(width / 2, height / 2); for (let i = 0; i < 9; i++) { await page.mouse.wheel(0, -240); await page.waitForTimeout(50); } }
      await page.waitForFunction(() => __diorama.state().mode === 'walk', null, { polling: 100, timeout: 10000 });
      check(`${size} zoom enters street`, await page.evaluate(() => __diorama.state().mode === 'walk'), await page.evaluate(() => __diorama.state().mode));
      await page.screenshot({ path: path.join(out, `${size}-entered.png`) });
      if (!calm && width === 390) {
        // Observation, not a blind-play claim: the built-in wanderer has movement keys but no exit action.
        await page.keyboard.press('Escape'); await page.evaluate(() => __diorama.step(1 / 60, 120)); // wanderer starts from orbit
        const route = await page.evaluate(() => __diorama.wander({ seed: 1, maxT: 90, stop: 'END' }));
        report.wander = { route, beforeExit: await page.evaluate(() => ({ mode: __diorama.state().mode, fired: __diorama.horror().fired, note: __diorama.note().lines })) };
        await page.keyboard.press('Escape'); await page.evaluate(() => __diorama.step(1 / 60, 600));
        const end = await page.evaluate(() => ({ mode: __diorama.state().mode, fired: __diorama.horror().fired }));
        report.wander.afterExit = end;
        check('normal exit reaches ending after E4', report.wander.beforeExit.fired.E4 != null && end.fired.END != null && end.mode === 'orbit', end);
        await page.screenshot({ path: path.join(out, 'normal-ending.png') });
      }
      await ctx.close();
    }
    check('page errors', report.errors.length === 0, report.errors);
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
  process.exitCode = report.checks.some(c => !c.pass) ? 1 : 0;
})();
