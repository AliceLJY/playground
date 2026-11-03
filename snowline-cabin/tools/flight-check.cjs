// B6 regression: the counter explains the pending arrival without changing when lamps light.
// node tools/build.mjs && NODE_PATH="$(npm root -g)" node tools/flight-check.cjs <out-dir> <page-url>
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const out = process.argv[2], base = process.argv[3];
if (!out || !base) throw new Error('usage: flight-check.cjs <out-dir> <page-url>');
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
      await page.waitForFunction(() => window.__cabin?.ready, null, { polling: 100 });
      report.devices.push(await page.evaluate(() => { const gl = document.querySelector('canvas').getContext('webgl2'), ext = gl.getExtension('WEBGL_debug_renderer_info'); return { ...__cabin.info(), renderer: ext && gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) }; }));
      const read = () => page.evaluate(() => { const el = document.querySelector('#chip'), r = el.getBoundingClientRect(); return { ...__cabin.state(), text: el.textContent, visible: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight }; });
      const tap = async () => { const p = await page.evaluate(() => __cabin.summitOnScreen('beacon')); await page.mouse.click(p.x, p.y); };
      // Use the real summit hit target, then return before arrival.
      if (width === 1365) await tap(); else await page.evaluate(() => __cabin.focus('beacon'));
      let s = await read();
      check(`${size} pending`, s.mode === 'fly' && s.lit.length === 0 && /正在前往.*抵达后点亮/.test(s.text) && s.visible, s);
      await page.waitForTimeout(650); // let the existing story/copy crossfade settle
      await page.screenshot({ path: path.join(out, `${size}-flying.png`) });
      await page.click('#back'); s = await read();
      check(`${size} cancelled`, s.lit.length === 0 && !/正在前往/.test(s.text), s.text);
      await page.evaluate(() => __cabin.focus('beacon'));
      await page.waitForFunction(() => __cabin.state().lit.includes('beacon'), null, { polling: 100, timeout: 15000 });
      s = await read();
      check(`${size} arrived`, s.lit.length === 1 && /1 \/ 7/.test(s.text) && !/正在前往|抵达后点亮/.test(s.text), s.text);
      await page.screenshot({ path: path.join(out, `${size}-arrived.png`) });
      await page.evaluate(() => __cabin.focus('beacon')); s = await read();
      check(`${size} already lit`, !/抵达后点亮/.test(s.text), s.text);
      await page.evaluate(() => { __cabin.focus('red-hut'); __cabin.enter(true); __cabin.leave(true); }); s = await read();
      check(`${size} enter clears pending`, s.lit.length === 1 && !/正在前往/.test(s.text), s.text);
      await ctx.close();
    }
    check('page errors', report.errors.length === 0, report.errors);
  } finally {
    fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
    await browser.close();
  }
  process.exitCode = report.checks.some(c => !c.pass) ? 1 : 0;
})();
