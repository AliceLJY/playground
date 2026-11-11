// Render the same simulation state at different wall times and draw counts.
// NODE_PATH="$(npm root -g)" node tools/animation-check.cjs <page-url> <out-dir>
const { chromium } = require('playwright');
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const [base, out] = process.argv.slice(2);
if (!base || !out) throw new Error('Expected page URL and output directory');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch(); let passed = 0, failed = 0;
  try {
    for (const [level, view] of [[1, 'start'], [1, 'hiss'], [2, 'heard'], [2, 'hug'], [3, 'start'], [3, 'warn'], [3, 'stop']]) {
      const page = await browser.newPage({ viewport: { width: 390, height: 664 } });
      const errors = []; page.on('pageerror', e => errors.push(e.message));
      await page.clock.install();
      const url = new URL(base); url.search = `?level=${level}&view=${view}`;
      await page.goto(url.href); await page.waitForFunction(() => window.__PLAYTEST__?.ready, null, { polling: 50 });
      try {
        assert.equal(await page.evaluate(() => __PLAYTEST__.snapshot().view), view);
        const before = await page.evaluate(() => { __sneak.paint(); return document.querySelector('#board').toDataURL(); });
        await page.screenshot({ path: path.join(out, `level${level}-${view}-before.png`) });
        await page.clock.runFor(240);
        const after = await page.evaluate(() => { __sneak.paint(); return document.querySelector('#board').toDataURL(); });
        await page.screenshot({ path: path.join(out, `level${level}-${view}-after.png`) });
        assert.ok(before === after, 'frozen canvas changed while only wall time advanced');
        assert.deepEqual(errors, []); passed++;
      } catch (e) { failed++; console.error(`FAIL level ${level}/${view}: ${e.message}`); }
      await page.close();
    }
    const page = await browser.newPage({ viewport: { width: 390, height: 664 } });
    await page.clock.install(); await page.goto(new URL('?level=2&view=start', base).href);
    await page.waitForFunction(() => window.__PLAYTEST__?.ready, null, { polling: 50 });
    try {
      const angles = await page.evaluate(() => {
        const original = SneakArt.kid, readings = []; let angle;
        SneakArt.kid = (...args) => { angle = args[4]; return original(...args); };
        for (const draws of [1, 20]) {
          __PLAYTEST__.setSeed(2); const pilot = SneakCore.human(__sneak.state, 2);
          for (let i = 0; i < 50; i++) { pilot(); __PLAYTEST__.step(100); for (let j = 0; j < draws; j++) __sneak.paint(); }
          readings.push({ angle, state: __PLAYTEST__.snapshot().kid });
        }
        SneakArt.kid = original; return readings;
      });
      assert.ok(angles.every(a => a.state === 'look'), 'sampling must reach the child looking around');
      assert.ok(Math.abs(angles[0].angle - angles[1].angle) < 1e-12, `draw count changed child direction: ${JSON.stringify(angles)}`);
      passed++;
    } catch (e) { failed++; console.error(`FAIL child direction: ${e.message}`); }
    await page.close();
  } finally { await browser.close(); }
  console.log(`animation-check: ${passed} passed, ${failed} failed`); process.exitCode = failed ? 1 : 0;
})().catch(e => { console.error(e); process.exitCode = 1; });
