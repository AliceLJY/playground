// A9: real final-frame pixels, same time/camera/seed/integrator, spatial sampling only.
// node tools/clarity-check.cjs [base-page-url] [--label=old|new]
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const shots = path.join(root, 'shots');
const MIN_RATIO = .65;
// Normalized top-left rectangles; kept unchanged between the red and green runs.
const REGIONS = {
  hero: { ring: [.505, .35, .595, .425], filaments: [.635, .415, .725, .505] },
  edge: { ring: [.505, .35, .595, .425], filaments: [.605, .43, .695, .52] }
};
function playwright() {
  try { return require('playwright'); }
  catch { return require(path.join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'playwright')); }
}
async function startServer() {
  const server = spawn(process.execPath, [path.join(__dirname, 'serve.cjs'), root, '0']);
  const base = await new Promise((resolve, reject) => {
    server.stdout.on('data', chunk => {
      const match = String(chunk).match(/http:\/\/127\.0\.0\.1:\d+/);
      if (match) resolve(match[0] + '/dist/index.html');
    });
    server.once('error', reject);
    server.once('exit', code => reject(new Error('server exit ' + code)));
  });
  return { server, base };
}
async function measureClarity(page, base, label = 'new') {
  fs.mkdirSync(shots, { recursive: true });
  const report = { date: new Date().toISOString(), label, minRatio: MIN_RATIO, regions: REGIONS, views: [], errors: [] };
  const error = value => report.errors.push(value.message || value.text());
  const consoleError = message => { if (message.type() === 'error') error(message); };
  page.on('pageerror', error); page.on('console', consoleError);
  try {
    for (const view of ['hero', 'edge']) {
      const url = new URL(base); url.search = 'view=' + view + '&test';
      await page.goto(url.href, { waitUntil: 'networkidle' });
      await page.waitForFunction(() => window.__PLAYTEST__?.ready, null, { polling: 40 });
      const actual = await page.evaluate(() => __TDE_TEST__.capture());
      const reference = await page.evaluate(() => __TDE_TEST__.capture(true));
      for (const [kind, capture] of [[label, actual], [label + '-reference', reference]]) {
        fs.writeFileSync(path.join(shots, `r3-${kind}-${view}.png`), Buffer.from(capture.image.split(',')[1], 'base64'));
      }
      const metrics = await page.evaluate(async ({ actual, reference, regions }) => {
        async function decode(src) {
          const image = new Image(); image.src = src; await image.decode();
          const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
          const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(image, 0, 0);
          return { width: image.width, height: image.height, data: ctx.getImageData(0, 0, image.width, image.height).data };
        }
        function energy(image, bounds) {
          const { width, height, data } = image;
          const [left, top, right, bottom] = bounds.map((v, i) => Math.floor(v * (i % 2 ? height : width)));
          const y = (x, row) => {
            const i = (row * width + x) * 4;
            return (.2126 * data[i] + .7152 * data[i + 1] + .0722 * data[i + 2]) / 255;
          };
          let sum = 0, count = 0;
          for (let row = top + 1; row < bottom - 1; row++) for (let x = left + 1; x < right - 1; x++) {
            const dx = (y(x + 1, row) - y(x - 1, row)) * .5;
            const dy = (y(x, row + 1) - y(x, row - 1)) * .5;
            sum += dx * dx + dy * dy; count++;
          }
          return { energy: sum / count, pixels: count, bounds: [left, top, right, bottom] };
        }
        const a = await decode(actual), r = await decode(reference);
        if (a.width !== r.width || a.height !== r.height) throw new Error('reference pixel dimensions differ');
        return Object.fromEntries(Object.entries(regions).map(([name, bounds]) => {
          const measured = energy(a, bounds), expected = energy(r, bounds);
          return [name, { ...measured, referenceEnergy: expected.energy, ratio: measured.energy / expected.energy }];
        }));
      }, { actual: actual.image, reference: reference.image, regions: REGIONS[view] });
      const a = actual.state, r = reference.state;
      const sameFrame = a.view === view && r.view === view && a.time === 82 && r.time === 82 && a.seed === 19 && r.seed === 19 && a.tier === 1 && a.qualityMode === 'auto' && a.raySteps === r.raySteps && a.particleCount === r.particleCount && JSON.stringify(a.camera) === JSON.stringify(r.camera);
      const fullReference = r.rayResolution.every((size, i) => size === r.drawingBuffer[i]) && r.atlasSize >= 1024;
      const pass = sameFrame && fullReference && Object.values(metrics).every(m => m.referenceEnergy > 1e-7 && Number.isFinite(m.ratio) && m.ratio >= MIN_RATIO);
      report.views.push({ view, pass, sameFrame, fullReference, actual: a, reference: r, metrics });
      console.log(`${pass ? 'PASS' : 'FAIL'} A9 ${label} ${view} ` + JSON.stringify(metrics));
    }
  } finally {
    page.off('pageerror', error); page.off('console', consoleError);
    report.pass = report.errors.length === 0 && report.views.length === 2 && report.views.every(v => v.pass);
    fs.writeFileSync(path.join(shots, `r3-clarity-${label}.json`), JSON.stringify(report, null, 2));
  }
  return report;
}
async function main() {
  let server, browser;
  try {
    let base = process.argv.find(value => /^https?:/.test(value));
    if (!base) ({ server, base } = await startServer());
    browser = await playwright().chromium.launch({ channel: 'chrome', headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5 });
    const label = process.argv.find(v => v.startsWith('--label='))?.split('=')[1] || 'new';
    if (!['old', 'new'].includes(label)) throw new Error('label must be old or new');
    const report = await measureClarity(page, base, label);
    if (!report.pass) process.exitCode = 1;
  } finally {
    if (browser) await browser.close();
    if (server) server.kill();
  }
}
module.exports = { measureClarity, playwright, startServer, REGIONS };
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
