// node tools/browser-check.cjs [base-page-url]
// Real-browser check with Playwright and installed Chrome (GPU). Runs one browser, sequentially.
// Without a URL it serves this folder and checks both the source entry (/dev.html) and dist/index.html.
// Online: node tools/browser-check.cjs https://aliceljy.github.io/playground/painterly-peacock/
// Writes 10 fixed-scene screenshots (5 scenes × desktop 1440×900 and phone 390×664) to shots/, plus report.json.
// Written in a session that could not download a browser, so it has NOT been run yet: expect to adjust
// thresholds (the pixel ones especially) on the first real run.
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(execFileSync('npm', ['root', '-g'], { encoding: 'utf8' }).trim(), 'playwright'))); }
const root = path.resolve(__dirname, '..');
const shots = path.join(root, 'shots');
fs.mkdirSync(shots, { recursive: true });
const report = { date: new Date().toISOString(), checks: [], scenes: [], errors: [] };
let server, browser;
function check(name, condition, details) {
  report.checks.push({ name, pass: Boolean(condition), details });
  console.log((condition ? 'PASS ' : 'FAIL ') + name + (details ? ' ' + JSON.stringify(details) : ''));
}
const snapshot = (page) => page.evaluate(() => __PLAYTEST__.snapshot());
const SCENES = ['stand', 'display', 'fallen', 'carrying', 'returned'];
async function go(page, base, query = '') {
  const url = new URL(base); url.search = query;
  await page.goto(url.href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__PLAYTEST__?.ready, null, { polling: 50, timeout: 30000 });
  await page.waitForTimeout(150);
}
async function layout(page, name) {
  const result = await page.evaluate(() => {
    const els = [...document.querySelectorAll('button, .intro h1, .intro .english, .hints, .note')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none');
    const items = els.map(e => { const b = e.getBoundingClientRect(); return { name: e.id || e.className || e.textContent.trim().slice(0, 12), x: b.x, y: b.y, w: b.width, h: b.height, control: e.matches('button') }; }).filter(b => b.w > 0 && b.h > 0);
    const outside = items.filter(b => b.x < -0.5 || b.y < -0.5 || b.x + b.w > innerWidth + 0.5 || b.y + b.h > innerHeight + 0.5);
    const overlaps = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1) overlaps.push([a.name, b.name]);
    }
    const blocked = els.filter(e => e.matches('button')).filter(e => { const b = e.getBoundingClientRect(), hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return !(hit && (hit === e || e.contains(hit))); }).map(e => e.id || e.textContent.trim());
    return { outside, overlaps, blocked, small: items.filter(b => b.control && (b.w < 44 || b.h < 44)) };
  });
  check('B8 layout ' + name, !result.outside.length && !result.overlaps.length && !result.small.length && !result.blocked.length, result);
}
// The bird's screen box (from the same pose points the Node tests use) against the safe zone, and against
// the UI: the title may sit over the picture, the buttons may not cover the bird's body.
function safeCheck(vp, name, s) {
  const b = s.screenBox, z = s.safe;
  check(`B3 ${vp} ${name}: whole bird inside the safe zone`, b.x0 >= z.x[0] && b.x1 <= z.x[1] && b.y0 >= z.y[0] && b.y1 <= z.y[1], { box: b, safe: z });
}
// Readings from the drawn frame itself (the WebGL buffer, without the page's text and buttons): colours must
// not turn white or grey (instanceColor, ACES wash-out), and the ground must stay ivory.
async function pixels(page, vp) {
  const r = await page.evaluate(() => {
    const s = __PLAYTEST__.setScene('display');
    const canvas = document.querySelector('#scene'), gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const at = (x, y) => { const i = 4 * ((h - 1 - Math.round(Math.min(h - 1, Math.max(0, y)))) * w + Math.round(Math.min(w - 1, Math.max(0, x)))); return [px[i], px[i + 1], px[i + 2]]; };
    const sat = (c) => { const mx = Math.max(...c), mn = Math.min(...c); return mx ? (mx - mn) / mx : 0; };
    const eyes = s.eyes.map(e => { const c = at(e.x * w, e.y * h); return { id: e.id, c, sat: +sat(c).toFixed(2), white: Math.min(...c) > 225 }; });
    // A band through the fan between the body and the eyes: should be teal-green, not grey or white.
    const box = s.screenBox; let teal = 0, grey = 0, n = 0;
    for (let y = box.y0 * h + (box.y1 - box.y0) * h * 0.15; y < box.y0 * h + (box.y1 - box.y0) * h * 0.4; y += 3) for (let x = box.x0 * w; x < box.x1 * w; x += 3) {
      const c = at(x, y); if (Math.abs(c[0] - 239) + Math.abs(c[1] - 230) + Math.abs(c[2] - 211) < 40) continue; // ivory ground
      n++; if (c[1] > c[0] + 8 && c[2] > c[0] - 10) teal++; if (sat(c) < 0.15) grey++;
    }
    const corner = at(w * 0.97, h * 0.5);
    return { eyes, teal: n ? teal / n : 0, grey: n ? grey / n : 1, n, corner };
  });
  const whiteEyes = r.eyes.filter(e => e.white).length, satEyes = r.eyes.filter(e => e.sat > 0.25).length;
  check(`B7 ${vp} pixels: eye spots are coloured, not white`, whiteEyes === 0 && satEyes >= r.eyes.length * 0.6, { whiteEyes, colouredEyes: satEyes, of: r.eyes.length });
  check(`B7 ${vp} pixels: the open train reads teal-green, not grey`, r.n > 50 && r.teal > 0.35 && r.grey < 0.35, { teal: +r.teal.toFixed(2), grey: +r.grey.toFixed(2), sampled: r.n });
  check(`B7 ${vp} pixels: the ground stays warm ivory`, r.corner[0] > 200 && r.corner[0] >= r.corner[1] && r.corner[1] >= r.corner[2] && r.corner[2] > 160, { corner: r.corner });
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
  for (const [vp, viewport, dpr] of [['desktop', { width: 1440, height: 900 }, 1.5], ['phone', { width: 390, height: 664 }, 2]]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: dpr, isMobile: vp === 'phone', hasTouch: vp === 'phone' });
    const page = await context.newPage(), requests = [];
    page.on('pageerror', (e) => report.errors.push(`${vp}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') report.errors.push(`${vp}: ${m.text()}`); });
    page.on('request', (r) => requests.push(r.url()));
    if (server && vp === 'desktop') {
      await go(page, new URL('/dev.html', base).href, 'scene=display');
      check('B9 source entry ready', (await snapshot(page)).sceneResult === 'display');
    }
    requests.length = 0;
    for (const [i, name] of SCENES.entries()) {
      await go(page, base, 'scene=' + name);
      const s = await snapshot(page);
      report.scenes.push({ viewport: vp, requested: name, ...s, feathers: undefined, eyes: undefined });
      check(`B6 ${vp} scene ${name} reached by play`, s.sceneResult === name && s.counts.total === 26, { action: s.action, counts: s.counts });
      check(`B4 ${vp} ${name}: body in one piece`, s.integrity.bone < 1e-6 && s.integrity.joint < 1e-6 && s.integrity.ground < 1e-6, s.integrity);
      safeCheck(vp, name, s);
      const file = `${String(i + 1).padStart(2, '0')}-${name}-${vp}.png`;
      await page.screenshot({ path: path.join(shots, file) });
      if (i === 1) report[vp] = { renderer: s.renderer, pixelRatio: s.pixelRatio, viewport: s.viewport, drawCalls: s.drawCalls, triangles: s.triangles };
      check(`B9 ${vp} ${name} draw calls ≤ 30`, s.drawCalls > 0 && s.drawCalls <= 30, { drawCalls: s.drawCalls, triangles: s.triangles });
    }
    check(`B9 ${vp} single-file: no requests besides the page`, requests.every(u => u.startsWith('data:') || new URL(u).pathname === new URL(base).pathname), [...new Set(requests.map(u => new URL(u).pathname))]);
    await go(page, base, '');
    await layout(page, vp);
    await pixels(page, vp);

    // Real input, not the hook. The hook only reads the result.
    await go(page, base, '');
    if (vp === 'desktop') {
      const s0 = await snapshot(page), b = s0.screenBox;
      // Pointer on the ground to the left of the bird: it walks there.
      await page.mouse.move(viewport.width * Math.max(0.12, b.x0 - 0.05), viewport.height * 0.7, { steps: 6 });
      await page.waitForTimeout(1500);
      let s = await snapshot(page);
      check('B5 desktop pointer on the ground leads the bird', s.peacock.position[0] < s0.peacock.position[0] - 0.1, { from: s0.peacock.position, to: s.peacock.position });
      // Pointer on the bird's body: it displays.
      const body = await page.evaluate(() => { const s = __PLAYTEST__.snapshot(); return { x: (s.screenBox.x0 + s.screenBox.x1) / 2, y: s.screenBox.y0 + (s.screenBox.y1 - s.screenBox.y0) * 0.6 }; });
      await page.mouse.move(viewport.width * body.x, viewport.height * body.y, { steps: 4 });
      await page.waitForTimeout(2500);
      s = await snapshot(page);
      check('B5 desktop hover on the bird opens the train gradually', s.hover && s.fan > 0.6, { hover: s.hover, fan: s.fan });
      await page.mouse.move(viewport.width * 0.95, viewport.height * 0.2, { steps: 4 });
      await page.waitForTimeout(400); const closing = await snapshot(page);
      check('B5 desktop leaving starts closing', !closing.hover, { hover: closing.hover, fan: closing.fan });
      // Click a feather's eye: that feather comes off and the bird goes for it.
      await page.evaluate(() => __PLAYTEST__.hover(true)); await page.evaluate(() => __PLAYTEST__.step(3000)); await page.evaluate(() => __PLAYTEST__.play());
      const e = (await snapshot(page)).eyes[12];
      await page.mouse.click(viewport.width * e.x, viewport.height * e.y);
      await page.waitForTimeout(200);
      s = await snapshot(page);
      check('B5 desktop click on a feather plucks that feather', s.pickup && s.pickup.id === 12, { pickup: s.pickup, under: await page.evaluate(([x, y]) => __PLAYTEST__.featherAt(x, y), [viewport.width * e.x, viewport.height * e.y]) });
      await page.mouse.click(viewport.width * e.x, viewport.height * e.y); await page.mouse.click(viewport.width * e.x, viewport.height * e.y);
      await page.waitForFunction(() => !__PLAYTEST__.snapshot().pickup, null, { polling: 200, timeout: 30000 }).catch(() => {});
      s = await snapshot(page);
      check('B5 desktop the feather goes back, and repeated clicks did not copy it', !s.pickup && s.counts.attached === 26 && s.counts.total === 26, { counts: s.counts, pickup: s.pickup });
      await page.evaluate(() => __PLAYTEST__.hover(null));
      // Wheel down: closer and a hard peck. Space: a jump.
      const z0 = (await snapshot(page)).peacock.position[2];
      await page.mouse.move(viewport.width * 0.9, viewport.height * 0.85); await page.mouse.wheel(0, 120);
      await page.waitForTimeout(1300);
      s = await snapshot(page);
      check('B5 desktop wheel down walks toward the camera', s.peacock.position[2] > z0 + 0.1, { z0, z: s.peacock.position[2], action: s.action });
      await page.keyboard.press('Space'); await page.waitForTimeout(350);
      s = await snapshot(page);
      check('B5 desktop Space jumps', /^jump/.test(s.action) || s.peacock.lift > 0.05, { action: s.action, lift: s.peacock.lift });
    } else {
      await page.locator('#b-fan').tap(); await page.waitForTimeout(2600);
      let s = await snapshot(page);
      check('B5 phone 开屏 button opens the train', s.fanLatch && s.fan > 0.7, { fan: s.fan });
      const e = s.eyes[8];
      await page.touchscreen.tap(viewport.width * e.x, viewport.height * e.y); await page.waitForTimeout(200);
      s = await snapshot(page);
      check('B5 phone tapping a feather plucks it', s.pickup && s.pickup.id === 8, { pickup: s.pickup });
      await page.waitForFunction(() => !__PLAYTEST__.snapshot().pickup, null, { polling: 200, timeout: 30000 }).catch(() => {});
      for (const id of ['b-near', 'b-back', 'b-jump']) { await page.locator('#' + id).tap(); await page.waitForTimeout(600); }
      s = await snapshot(page);
      check('B5 phone buttons drive the bird without breaking it', s.integrity.bone < 1e-6 && s.integrity.joint < 1e-6 && s.counts.attached === 26, s.integrity);
    }
    await page.locator('#b-sound').click();
    check(`B5 ${vp} sound button switches sound on`, (await snapshot(page)).sound === true);
    await context.close();
  }
  check('B8 no page errors', report.errors.length === 0, report.errors);
  check('B9 renderer recorded (SwiftShader means frame rates do not count)', Boolean(report.desktop?.renderer), report.desktop?.renderer);
}
main().catch((e) => { report.errors.push(String(e.stack || e)); console.error(e); process.exitCode = 1; })
  .finally(async () => {
    if (browser) await browser.close();
    if (server) server.kill();
    fs.writeFileSync(path.join(shots, 'report.json'), JSON.stringify(report, null, 2));
    if (report.checks.some(c => !c.pass)) process.exitCode = 1;
  });
