// B6: fine controls visible at entry alongside the task and image; 44 px nudge targets.
// NODE_PATH="$(npm root -g)" node tools/layout.cjs <out-dir> <page-url>
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const [out, base] = process.argv.slice(2);
if (!out || !base) throw new Error('usage: layout.cjs <out-dir> <page-url>');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
  const report = { base, browser: browser.version(), checks: [], errors: [], devices: [] };
  const check = (name, pass, detail) => { report.checks.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(detail)}`); };
  try {
    for (const [width, height] of [[390, 664], [320, 568], [844, 340], [1365, 900]]) {
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 2, hasTouch: width < 900 });
      const page = await ctx.newPage(), size = `${width}x${height}`;
      page.on('pageerror', e => report.errors.push(e.message));
      await page.goto(base);
      await page.waitForFunction(() => window.__lens?.ready, null, { polling: 100 });
      report.devices.push(await page.evaluate(() => ({ ...__lens.info(), dpr: devicePixelRatio, viewport: [innerWidth, innerHeight] })));
      const layout = () => page.evaluate(() => {
        const box = el => { const r = el.getBoundingClientRect(), p = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); let top = 0, bottom = innerHeight;
          for (let a = el.parentElement; a; a = a.parentElement) if (/(auto|scroll|hidden)/.test(getComputedStyle(a).overflowY)) { const b = a.getBoundingClientRect(); top = Math.max(top, b.top); bottom = Math.min(bottom, b.bottom); }
          return { x: r.x, y: r.y, w: r.width, h: r.height, bottom: r.bottom, visible: r.left >= 0 && r.right <= innerWidth && r.top >= top - 1 && r.bottom <= bottom + 1, hit: p === el || el.contains(p), scroll: el.scrollWidth > el.clientWidth + 1 }; };
        return Object.fromEntries(['#candle', '#screen', '#stepTitle', '#inset', '#status', '#candleOut', '#screenOut', ...Array.from({ length: 4 }, (_, i) => `button.nudge:nth-of-type(${i % 2 + 1})[data-k="${i < 2 ? 'candle' : 'screen'}"]`)].map(s => [s, box(document.querySelector(s))]));
      });
      let r = await layout();
      check(`${size} sliders visible without scrolling`, ['#candle', '#screen'].every(k => r[k].visible && r[k].hit), r);
      check(`${size} task and live image visible`, ['#stepTitle', '#inset', '#status'].every(k => r[k].visible), r);
      check(`${size} nudge targets at least 44px`, Object.entries(r).filter(([k]) => k.startsWith('button')).every(([, b]) => b.w >= 44 && b.h >= 44), r);
      check(`${size} readings fit one line`, ['#candleOut', '#screenOut'].every(k => !r[k].scroll && r[k].h < 30), r);
      await page.screenshot({ path: path.join(out, `${size}-initial.png`) });
      await page.evaluate(() => __lens.set({ screen: 100 })); await page.waitForTimeout(100);
      r = await layout();
      check(`${size} longest reading fits`, !r['#screenOut'].scroll && r['#screenOut'].h < 30, r['#screenOut']);
      if (width < 900) {
        await page.evaluate(() => { const a = document.querySelector('aside'); a.scrollTop = a.scrollHeight; });
        r = await layout();
        check(`${size} tuning stays while lesson scrolls`, ['#candle', '#screen'].every(k => r[k].visible && r[k].hit), r['#screen']);
        await page.evaluate(() => { document.querySelector('aside').scrollTop = 0; });
      }
      // The same action for a real touch tap and keyboard activation.
      const button = page.locator('button.nudge[data-k="screen"][data-d="1"]');
      await button.scrollIntoViewIfNeeded();
      await page.evaluate(() => __lens.set({ screen: 60 }));
      if (width < 900) await button.tap(); else await button.click();
      let v = await page.evaluate(() => __lens.state().screen);
      await button.focus(); await page.keyboard.press('Enter');
      const v2 = await page.evaluate(() => __lens.state().screen);
      check(`${size} touch and keyboard share half-cm step`, Math.abs(v - 60.5) < 1e-6 && Math.abs(v2 - 61) < 1e-6, [v, v2]);
      // Cancel a held nudge before its repeat delay; the value must remain at the initial half step.
      for (const event of ['pointerup', 'pointercancel', 'lostpointercapture', 'blur', 'visibilitychange']) {
        await page.evaluate(() => __lens.set({ screen: 60 }));
        await button.dispatchEvent('pointerdown', { pointerId: 1, pointerType: 'touch' });
        if (event === 'blur') await page.evaluate(() => window.dispatchEvent(new Event('blur')));
        else if (event === 'visibilitychange') await page.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, value: true }); document.dispatchEvent(new Event('visibilitychange')); });
        else await button.dispatchEvent(event, { pointerId: 1 });
        await page.waitForTimeout(550);
        const value = await page.evaluate(() => __lens.state().screen);
        check(`${size} hold released by ${event}`, Math.abs(value - 60.5) < 1e-6, value);
        await button.dispatchEvent('pointercancel');
        await page.evaluate(() => { delete document.hidden; });
      }
      await ctx.close();
    }
    check('page errors', report.errors.length === 0, report.errors);
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
  process.exitCode = report.checks.some(c => !c.pass) ? 1 : 0;
})();
