// Canvas 2D paint calls and real RAF callback cost; no changes to the game's render path.
// NODE_PATH="$(npm root -g)" node tools/performance.cjs <page-url> <out-dir>
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path');
const [url, out] = process.argv.slice(2);
if (!url || !out) throw new Error('Expected page URL and output directory');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist'] }), report = [];
  for (const [width, height] of [[390, 664], [1365, 900]]) {
    const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: width === 390 ? 2 : 1 });
    await context.addInitScript(() => {
      const raf = window.requestAnimationFrame; let calls = 0;
      window.samples = [];
      for (const name of ['fill', 'stroke', 'fillRect', 'strokeRect', 'clearRect', 'fillText', 'strokeText', 'drawImage', 'putImageData']) {
        const original = CanvasRenderingContext2D.prototype[name];
        CanvasRenderingContext2D.prototype[name] = function (...args) { if (this.canvas.id === 'scene') calls++; return original.apply(this, args); };
      }
      window.requestAnimationFrame = callback => raf.call(window, ts => { calls = 0; const start = performance.now(); callback(ts); samples.push({ ms: performance.now() - start, calls }); });
    });
    const p = await context.newPage(), errors = []; p.on('pageerror', e => errors.push(e.message));
    const u = new URL(url); u.searchParams.set('view', 'full'); u.searchParams.set('t', '6');
    await p.goto(u.href); await p.waitForFunction(() => window.__foyer?.ready, null, { polling: 50 });
    await p.click('#btnSit'); await p.evaluate(() => { __foyer.pause(false); samples.length = 0; });
    await p.waitForFunction(() => samples.length >= 120, null, { polling: 50 });
    const result = await p.evaluate(() => {
      const rows = samples.slice(0, 120), sorted = rows.map(r => r.ms).sort((a, b) => a - b);
      const gl = document.createElement('canvas').getContext('webgl'), ext = gl?.getExtension('WEBGL_debug_renderer_info');
      return { viewport: [innerWidth, innerHeight], dpr: devicePixelRatio, samples: rows.length, p95: sorted[114], maxCalls: Math.max(...rows.map(r => r.calls)), snapshot: __foyer.snapshot(), renderer: ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : 'unavailable' };
    });
    result.errors = errors; result.pass = !errors.length && result.samples === 120 && result.snapshot.humans === 10 && result.snapshot.lamps === 9 && result.p95 <= 16.7 && result.maxCalls <= 1500;
    report.push(result); console.log(JSON.stringify(result));
    await p.screenshot({ path: path.join(out, `${width}x${height}-full.png`) }); await context.close();
  }
  await browser.close(); fs.writeFileSync(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  process.exitCode = report.every(r => r.pass) ? 0 : 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
