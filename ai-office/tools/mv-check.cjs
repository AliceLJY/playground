// MV 录片检查（照 gz-roach/tools/browser-check.cjs 的 B11）：画面只取决于页面时间，不受截图快慢影响。
//   NODE_PATH="$(npm root -g)" node tools/mv-check.cjs [秒,秒,…]
// 每个时刻：推进到那一刻立刻截一张，等 1 秒真实时间再截一张，差异像素应接近 0（阈值 0.05%）。
// 默认挑字幕淡入、镜头推进、打招呼、灯光转换、关灯淡出这些最容易被真实时间带偏的时刻。
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), http = require('node:http');
const root = path.resolve(__dirname, '..');
const times = (process.argv[2] || '0.6,11.0,17.7,31.5,37.8,53.6,60.6,74.5,75.9').split(',').map(Number);
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
(async () => {
  const server = await new Promise(ok => { const s = http.createServer((req, res) => { const f = path.join(root, new URL(req.url, 'http://x').pathname); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); } res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res); }).listen(0, '127.0.0.1', () => ok(s)); });
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await (await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 })).newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({ time: Date.parse('2026-11-01T01:00:00Z') });
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html?mv=1&hold=1`);
  for (let i = 0; i < 300 && !(await page.evaluate(() => window.__PLAYTEST__?.ready)); i++) { await page.clock.runFor(100); await page.waitForTimeout(30); }
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 50));
  const diff = async (a, b) => page.evaluate(async ([x, y]) => {
    const load = async b64 => { const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode(); const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0); return g.getImageData(0, 0, c.width, c.height).data; };
    const p = await load(x), q = await load(y); let n = 0; for (let i = 0; i < p.length; i += 4) if (Math.abs(p[i] - q[i]) + Math.abs(p[i + 1] - q[i + 1]) + Math.abs(p[i + 2] - q[i + 2]) > 24) n++; return n / (p.length / 4);
  }, [a.toString('base64'), b.toString('base64')]);
  let at = 0, failed = 0;
  for (const t of times.sort((p, q) => p - q)) {
    await page.evaluate(ms => window.__PLAYTEST__.step(ms), (t - at) * 1000); at = t;
    const a = await page.screenshot(); await page.waitForTimeout(1000); const b = await page.screenshot();
    const d = await diff(a, b), snap = await page.evaluate(() => window.__PLAYTEST__.snapshot().mv), ok = d < 0.0005;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'} B11 t=${t}s 立刻截与等 1 秒再截，差异像素 ${(d * 100).toFixed(3)}%  （${snap.clock}，字幕「${snap.subtitle?.text || ''}」${snap.subtitle ? ' α=' + snap.subtitle.alpha.toFixed(2) : ''}，镜头 z=${snap.camera.z.toFixed(2)}，暗 ${snap.darkness.toFixed(2)}）`);
  }
  console.log(errors.length ? 'page errors: ' + errors.join(' | ') : 'page errors: 0');
  await browser.close(); server.close(); process.exit(failed || errors.length ? 1 : 0);
})();
