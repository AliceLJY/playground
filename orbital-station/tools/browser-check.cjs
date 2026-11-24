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
// Readings from the drawn frame itself (the WebGL buffer, without the page's text and buttons). Each one
// was calibrated on a build that was known to be wrong: the first version passed every Node test while the
// Earth rendered flat white and all twelve hook lamps stayed white.
async function pixels(page, base) {
  await go(page, base, 'view=establish');
  const grab = (view, time, points) => page.evaluate(([view, time, points]) => {
    __ORBITAL__.setView(view); if (time != null) __ORBITAL__.setTime(time);
    // Read in the same task as the draw: the buffer is not preserved once the frame is presented.
    const canvas = document.querySelector('#scene'), gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const at = (x, y) => { const i = 4 * ((h - 1 - Math.round(y)) * w + Math.round(x)); return [px[i], px[i + 1], px[i + 2]]; };
    // Band under the station in the establishing view: what share is near-white, what share is clearly blue.
    let white = 0, blue = 0, n = 0;
    for (let y = Math.round(h * 0.62); y < h * 0.82; y += 3) for (let x = Math.round(w * 0.08); x < w * 0.92; x += 3) { const [r, g, b] = at(x, y); n++; if (Math.min(r, g, b) > 205) white++; if (b > r + 25 && b > 60) blue++; }
    const lamps = points.map(p => {
      const s = __ORBITAL__.pointScreen(p); if (s.z > 1 || s.x < 0 || s.x > 1 || s.y < 0 || s.y > 1) return 'off-screen';
      let r = 0, g = 0, b = 0; for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) { const c = at(s.x * w + dx, s.y * h + dy); r += c[0] / 9; g += c[1] / 9; b += c[2] / 9; }
      return g > 150 && g > 1.6 * r && g > 1.6 * b ? 'green' : r > 200 && g > 120 && g < 0.85 * r && b < 0.6 * g ? 'amber' : r > 200 && g > 200 && b > 200 ? 'white' : 'other';
    });
    return { white: white / n, blue: blue / n, lamps };
  }, [view, time, points]);
  const tally = (list) => list.reduce((a, k) => (a[k] = (a[k] || 0) + 1, a), {});
  const earth = await grab('establish', null, []);
  check('A4 pixels: the Earth below the station is ocean and cloud, not a white disc', earth.white < 0.5 && earth.blue > 0.2, { nearWhite: +earth.white.toFixed(2), blue: +earth.blue.toFixed(2) });
  // Hook lamp centres from the model: 12 on a 3.48 m circle just under the port face (see buildHub in src/station.js).
  const hooks = Array.from({ length: 12 }, (_, i) => { const a = (i * 30 + 15) * Math.PI / 180; return [Math.cos(a) * 3.48, 18 - 0.55, Math.sin(a) * 3.48]; });
  const captured = tally((await grab('settle', 35.2, hooks)).lamps), closed = tally((await grab('settle', 39.5, hooks)).lamps);
  check('A1 pixels: hook lamps are amber right after capture', (captured.amber || 0) >= 3 && !captured.green && !captured.white, captured);
  check('A1 pixels: hook lamps are green once all hooks are closed', (closed.green || 0) >= 3 && !closed.amber && !closed.white, closed);
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
    if (vp === 'desktop') {
      await pixels(page, base);
      // Free orbit with a real mouse: pressing must not swing the view, and the very first drag must orbit.
      for (const key of ['establish', 'truss']) {
        await go(page, base, 'view=' + key);
        const cam = () => page.evaluate(() => ({ mode: __PLAYTEST__.snapshot().mode, pos: __PLAYTEST__.snapshot().camera.position, hub: __ORBITAL__.pointScreen([0, 0, 0]) }));
        const a = await cam(); await page.mouse.move(720, 380); await page.mouse.down(); await page.waitForTimeout(150);
        const b = await cam(); await page.mouse.move(840, 400, { steps: 8 }); await page.waitForTimeout(250); await page.mouse.up();
        const c = await cam(), jump = Math.hypot(a.hub.x - b.hub.x, a.hub.y - b.hub.y), moved = Math.hypot(...c.pos.map((v, i) => v - a.pos[i]));
        check(`A5 desktop drag from ${key}: no jump on press, first drag orbits`, b.mode === 'free' && jump < 0.01 && moved > 3, { jumpOnPress: +jump.toFixed(3), cameraMoved: +moved.toFixed(1) });
      }
    }
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
