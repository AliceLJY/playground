// node tools/browser-check.cjs [base-page-url]
// Real-browser check with Playwright and installed Chrome (GPU). Runs one browser, sequentially.
// Without a URL it serves this folder and checks both the source entry (/dev.html) and dist/index.html.
// Online: node tools/browser-check.cjs https://aliceljy.github.io/playground/orbital-station/
// Writes 20 fixed-view screenshots (10 shots × desktop 1440×900 and phone 390×664) to shots/, plus report.json.
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'playwright'))); }
const root = path.resolve(__dirname, '..');
const shots = path.join(root, 'shots');
fs.mkdirSync(shots, { recursive: true });
const report = { date: new Date().toISOString(), checks: [], views: [], errors: [] };
let server, browser;
function check(name, condition, details) {
  report.checks.push({ name, pass: Boolean(condition), details });
  console.log((condition ? 'PASS ' : 'FAIL ') + name + (details ? ' ' + JSON.stringify(details) : ''));
}
const snapshot = (page) => page.evaluate(() => __PLAYTEST__.snapshot());
async function go(page, base, query = '') {
  const url = new URL(base); url.search = query;
  await page.goto(url.href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__PLAYTEST__?.ready, null, { polling: 50, timeout: 30000 });
  await page.waitForTimeout(150);
}
async function layout(page, name) {
  const result = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button, .tele, .caption h2, .caption .kicker, #clock, .intro h1')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
    const items = els.map(e => { const b = e.getBoundingClientRect(); return { name: e.id || e.className || e.textContent.trim().slice(0, 12), x: b.x, y: b.y, w: b.width, h: b.height, control: e.matches('button') }; });
    const outside = items.filter(b => b.x < -0.5 || b.y < -0.5 || b.x + b.w > innerWidth + 0.5 || b.y + b.h > innerHeight + 0.5);
    const overlaps = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1) overlaps.push([a.name, b.name]);
    }
    // The button's centre must reach the button itself (nothing drawn over it).
    const blocked = els.filter(e => e.matches('button')).filter(e => { const b = e.getBoundingClientRect(), hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return !(hit && (hit === e || e.contains(hit))); }).map(e => e.id || e.textContent.trim());
    return { outside, overlaps, blocked, small: items.filter(b => b.control && (b.w < 43 || b.h < 43)) };
  });
  check('A10 layout ' + name, !result.outside.length && !result.overlaps.length && !result.small.length && !result.blocked.length, result);
}
async function main() {
  let base = process.argv.find(v => /^https?:/.test(v));
  if (!base) {
    server = spawn(process.execPath, [path.join(__dirname, 'serve.cjs'), root, '0']);
    base = await new Promise((resolve, reject) => {
      server.stdout.on('data', (c) => { const m = String(c).match(/http:\/\/127\.0\.0\.1:\d+/); if (m) resolve(m[0] + '/dist/index.html'); });
      server.once('error', reject); server.once('exit', (code) => reject(new Error('server exit ' + code)));
    });
  }
  report.base = base;
  browser = await chromium.launch({ channel: 'chrome', headless: process.env.HEADED !== '1' });
  report.browser = browser.version();
  const shotKeys = ['establish', 'truss', 'ring', 'garden', 'approach', 'align', 'port', 'settle', 'sunrise', 'axis'];
  for (const [vp, viewport, dpr] of [['desktop', { width: 1440, height: 900 }, 1.5], ['phone', { width: 390, height: 664 }, 2]]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: dpr, isMobile: vp === 'phone', hasTouch: vp === 'phone' });
    const page = await context.newPage(), requests = [];
    page.on('pageerror', (e) => report.errors.push(`${vp}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') report.errors.push(`${vp}: ${m.text()}`); });
    page.on('request', (r) => requests.push(r.url()));
    if (server && vp === 'desktop') {
      await go(page, new URL('/dev.html', base).href, 'view=establish');
      check('A8 source entry ready', (await snapshot(page)).view === 'establish');
    }
    requests.length = 0;
    for (const [i, key] of shotKeys.entries()) {
      // Half the views by name and half by number, so both URL forms are exercised.
      await go(page, base, 'view=' + (i % 2 ? String(i + 1) : key));
      const s = await snapshot(page);
      report.views.push({ viewport: vp, requested: key, ...s });
      check(`A3 ${vp} view ${i + 1} ${key} entered`, s.requestedView === key && s.view === key && s.mode === 'shot' && !s.playing && s.fade === 0, { view: s.view, time: s.time });
      const file = `${String(i + 1).padStart(2, '0')}-${key}-${vp}.png`;
      await page.screenshot({ path: path.join(shots, file) });
      if (i === 0) report[vp] = { renderer: s.renderer, pixelRatio: s.pixelRatio, viewport: s.viewport, drawCalls: s.drawCalls, triangles: s.triangles };
      check(`A8 ${vp} ${key} draw calls ≤ 160`, s.drawCalls > 0 && s.drawCalls <= 160, { drawCalls: s.drawCalls, triangles: s.triangles });
    }
    check(`A8 ${vp} single-file: no requests besides the page`, requests.every(u => u.startsWith('data:') || new URL(u).pathname === new URL(base).pathname), [...new Set(requests.map(u => new URL(u).pathname))]);
    // Normal entry: tour plays; a button press keeps the clock and every part where it was.
    await go(page, base, '');
    let s = await snapshot(page);
    check(`A3 ${vp} default entry starts the tour`, s.mode === 'tour' && s.playing, { mode: s.mode });
    await layout(page, vp + ' tour');
    await page.locator('#play').click();
    const before = await snapshot(page);
    await page.locator('#shots button').nth(6).click();
    await page.waitForTimeout(900);
    const after = await snapshot(page);
    check(`A5 ${vp} switching camera while paused keeps time and docking state`, after.view === 'port' && after.time === before.time && JSON.stringify(after.docking) === JSON.stringify(before.docking) && after.ringAngle === before.ringAngle, { before: before.time, after: after.time });
    await layout(page, vp + ' shot');
    await page.locator('#tour').click();
    await page.waitForTimeout(1200);
    s = await snapshot(page);
    check(`A3 ${vp} tour button resumes the tour`, s.mode === 'tour' && s.playing);
    await context.close();
  }
  check('A10 no page errors', report.errors.length === 0, report.errors);
  check('A8 renderer recorded (SwiftShader means frame rates do not count)', Boolean(report.desktop?.renderer), report.desktop?.renderer);
}
main().catch((e) => { report.errors.push(String(e.stack || e)); console.error(e); process.exitCode = 1; })
  .finally(async () => {
    if (browser) await browser.close();
    if (server) server.kill();
    fs.writeFileSync(path.join(shots, 'report.json'), JSON.stringify(report, null, 2));
    if (report.checks.some(c => !c.pass)) process.exitCode = 1;
  });
