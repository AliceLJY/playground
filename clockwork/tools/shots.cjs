// Three reproducible views at the same simulation time, with shaft/camera evidence.
// NODE_PATH="$(npm root -g)" node tools/shots.cjs <page-url> <out-dir>
const path = require('node:path'), fs = require('node:fs');

async function main() {
  const [base, out] = process.argv.slice(2);
  if (!base || !out) throw Error('Provide page URL and output directory');
  const { chromium } = require('playwright');
  const { shotRequest, assertFrozen } = await import('./acceptance.mjs');
  const url = new URL(base); url.searchParams.set('debug', '1');
  fs.mkdirSync(out, { recursive: true });
  const report = { base, runs: [] };
  let browser;
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
    report.browser = browser.version();
    for (const [name, width, height] of [['wide', 1440, 810], ['close', 1440, 810], ['phone', 390, 664]]) {
      const ctx = await browser.newContext({ viewport: { width, height }, hasTouch: width < 600, deviceScaleFactor: width < 600 ? 2 : 1 });
      const run = { name, width, height, requested: shotRequest(name, width, height), errors: [] };
      report.runs.push(run);
      try {
        const page = await ctx.newPage();
        page.on('pageerror', e => run.errors.push(e.message));
        page.on('console', m => { if (m.type() === 'error') run.errors.push(m.text()); });
        // The host's optional favicon is not part of this page's acceptance.
        await page.route('**/favicon.ico', route => route.fulfill({ status: 204 }));
        await page.goto(url.href);
        await page.waitForFunction(() => !!window.__clockwork?.freeze, null, { polling: 100 });
        run.frozen = await page.evaluate(request => window.__clockwork.freeze(request), run.requested);
        assertFrozen(run.frozen, run.requested, run.errors);
        run.dpr = await page.evaluate(() => devicePixelRatio);
        await page.screenshot({ path: path.join(out, name + '.png') });
        run.afterScreenshot = await page.evaluate(() => window.__clockwork.snapshot());
        assertFrozen(run.afterScreenshot, run.requested, run.errors);
        run.pass = true;
        console.log(`PASS ${name}: ${JSON.stringify(run.frozen)}`);
      } catch (e) {
        run.pass = false; run.failure = e.message;
        throw e;
      } finally {
        await ctx.close();
      }
      if (run.errors.length) throw Error(`Page errors: ${run.errors.join('; ')}`);
    }
  } catch (e) {
    report.failure = e.message;
    throw e;
  } finally {
    try { if (browser) await browser.close(); }
    finally { fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2)); }
  }
}

main().catch(e => { console.error(e.stack || e); process.exitCode = 1; });
