// Separate final performance pass. No other checks from this task run alongside it.
// node tools/performance-check.cjs [base-page-url]
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { playwright, startServer } = require('./clarity-check.cjs');
const shots = path.resolve(__dirname, '../shots');
function processLoad() {
  // Process names only: avoid recording other tasks' command arguments or data.
  return execFileSync('ps', ['-axo', 'pid,ppid,pcpu,comm'], { encoding: 'utf8' }).split('\n').filter(line => /Google Chrome|Chromium|playwright|\/node$/.test(line));
}
(async () => {
  let server, browser;
  const report = { date: new Date().toISOString(), browser: '', loadBefore: processLoad(), views: [], errors: [] };
  try {
    let base = process.argv.find(value => /^https?:/.test(value));
    if (!base) ({ server, base } = await startServer());
    browser = await playwright().chromium.launch({ channel: 'chrome', headless: true });
    report.browser = browser.version();
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
    page.on('pageerror', error => report.errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') report.errors.push(message.text()); });
    for (const view of ['default', 'hero', 'edge']) {
      const url = new URL(base); if (view !== 'default') url.search = 'view=' + view;
      await page.goto(url.href, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__PLAYTEST__?.ready, null, { polling: 40 });
      if (view !== 'default') await page.locator('#play').click();
      await page.waitForTimeout(1500);
      const before = await page.evaluate(() => __PLAYTEST__.snapshot());
      const wall = performance.now();
      await page.waitForTimeout(5000);
      const after = await page.evaluate(() => __PLAYTEST__.snapshot());
      const fps = (after.frames - before.frames) * 1000 / (performance.now() - wall);
      const pass = !after.softwareRenderer && after.gpuSamplesMs.length >= 100 && after.gpuMedianMs <= 20 && after.tier === 1 && after.qualityMode === 'auto' && fps >= 26 && fps <= 31 && after.dpr === 1.5;
      report.views.push({ ...after, scenario: view, pass, measuredFps: fps, beforeTime: before.time });
      console.log(`${pass ? 'PASS' : 'FAIL'} final performance ${view} ` + JSON.stringify({ fps, medianMs: after.gpuMedianMs, samples: after.gpuSamplesMs.length, ray: after.rayResolution, tier: after.tier, renderer: after.renderer }));
      await page.locator('#play').click();
    }
    const cdp = await browser.newBrowserCDPSession();
    report.ownProcesses = (await cdp.send('SystemInfo.getProcessInfo')).processInfo.map(({ type, id }) => ({ type, pid: id }));
    await cdp.detach();
    report.loadDuring = processLoad();
  } finally {
    if (browser) await browser.close();
    if (server) server.kill();
    report.loadAfter = processLoad();
    report.pass = report.views.length === 3 && report.views.every(v => v.pass) && !report.errors.length;
    fs.mkdirSync(shots, { recursive: true });
    fs.writeFileSync(path.join(shots, 'r3-performance.json'), JSON.stringify(report, null, 2));
    if (!report.pass) process.exitCode = 1;
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
