// B6: after staying in the scene, reopen the painting and restart through visible buttons.
// NODE_PATH="$(npm root -g)" node tools/return-check.cjs <out-dir> <base-url>
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const [out, base] = process.argv.slice(2);
if (!out || !base) throw new Error('usage: return-check.cjs <out-dir> <base-url>');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--use-angle=metal'] });
  const report = { base, browser: browser.version(), checks: [], errors: [], devices: [] };
  const check = (name, pass, detail) => { report.checks.push({ name, pass, detail }); console.log(`${pass ? 'PASS' : 'FAIL'} ${name}: ${JSON.stringify(detail)}`); };
  try {
    for (const [width, height] of [[390, 664], [320, 568], [844, 340], [1365, 900]]) {
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width < 900 ? 3 : 1, hasTouch: width < 900 });
      const page = await ctx.newPage(), size = `${width}x${height}`;
      page.on('pageerror', e => report.errors.push(e.message));
      await page.goto(base);
      await page.waitForFunction(() => window.__jianmen?.ready, null, { polling: 100, timeout: 90000 });
      report.devices.push(await page.evaluate(() => { const gl = document.querySelector('#game').getContext('webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info'); return { ...__jianmen.info(), viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, renderer: ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) }; }));
      await page.click('#enter');
      // Actual keyboard motion before using the existing look hook to aim at each target.
      await page.waitForTimeout(2000);
      const yaw = await page.evaluate(() => __jianmen.info().look.yaw);
      await page.keyboard.down('ArrowRight'); await page.waitForTimeout(300); await page.keyboard.up('ArrowRight');
      check(`${size} keyboard turns`, Math.abs((await page.evaluate(() => __jianmen.info().look.yaw)) - yaw) > 1, yaw);
      for (const [id, yaw, pitch] of [['path', 8, -40], ['far', -90, -5], ['back', 180, 10], ['gate', 19, 47]]) {
        await page.evaluate(([y, p]) => __jianmen.look(y, p), [yaw, pitch]);
        await page.waitForFunction(id => __jianmen.info().found.includes(id), id, { polling: 100, timeout: 10000 });
      }
      await page.waitForFunction(() => __jianmen.info().phase === 'done', null, { polling: 100, timeout: 15000 });
      await page.click('#stay'); await page.waitForTimeout(1800);
      const entry = await page.evaluate(() => { const e = document.querySelector('#painting'); if (!e) return null; const r = e.getBoundingClientRect(); return { text: e.textContent, w: r.width, h: r.height, visible: r.width > 0 && r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight, hit: document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === e }; });
      check(`${size} return entry`, entry?.visible && entry.hit && entry.w >= 44 && entry.h >= 44, entry);
      await page.screenshot({ path: path.join(out, `${size}-stay.png`) });
      if (entry?.visible) {
        await page.click('#painting');
        await page.waitForTimeout(1800);
        check(`${size} painting reopened`, await page.locator('#outro').isVisible() && await page.evaluate(() => __jianmen.info().found.length === 4), await page.evaluate(() => __jianmen.info()));
        await page.screenshot({ path: path.join(out, `${size}-painting.png`) });
        // Repeat once to catch a stale hide timer or a one-use guard.
        await page.click('#stay'); await page.waitForTimeout(1800); await page.click('#painting'); await page.waitForTimeout(1800);
        await page.click('#again');
        await page.waitForFunction(() => window.__jianmen?.ready && !__jianmen.info().started, null, { polling: 100, timeout: 90000 });
        check(`${size} restart`, await page.locator('#enter').isVisible() && await page.evaluate(() => __jianmen.info().found.length === 0), await page.evaluate(() => __jianmen.info()));
      }
      await ctx.close();
    }
    check('page errors', report.errors.length === 0, report.errors);
  } finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); await browser.close(); }
  process.exitCode = report.checks.some(c => !c.pass) ? 1 : 0;
})();
