// node tools/browser-check.cjs [page-url]
// Real-browser check with Playwright and installed Chrome. Runs one browser, sequentially.
// Without a URL it serves this folder and checks both the source entry (/dev.html) and dist/index.html.
// Online: node tools/browser-check.cjs https://aliceljy.github.io/playground/gummy-bears/
// Writes 8 screenshots (4 scenes × desktop 1440×900 and phone 390×664) to shots/, plus shots/report.json:
//   01-row (resting row) · 02-stretch (one bear pulled long, still held) · 03-fling (thrown, squashed on landing)
//   · 04-pile (poured to the cap and settled).
// The scenes are replayed with __PLAYTEST__.scenario(), the same steps the Node tests run (src/scenarios.js).
// Mouse and touch are then checked with real input events. Frame times are recorded but only mean something
// on a real GPU: with SwiftShader (software) in report.desktop.renderer they do not count.
// Written without a browser in reach and never run before the first review: expect to adjust thresholds.
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
const hook = (page, fn, ...args) => page.evaluate(([fn, args]) => __PLAYTEST__[fn](...args), [fn, args]);
async function go(page, base, query = '') {
  const url = new URL(base); url.search = query;
  await page.goto(url.href, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__PLAYTEST__?.ready, null, { polling: 50, timeout: 30000 });
  await page.waitForTimeout(150);
}
// Text and controls inside the screen, not on top of each other, buttons at least 44 px and reachable;
// and the card and title must not cover any bear (screen boxes from __PLAYTEST__).
async function layout(page, name, snap) {
  const result = await page.evaluate(() => {
    const vis = (e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden' && getComputedStyle(e).display !== 'none';
    const els = [...document.querySelectorAll('button, input, h1, .cn, .eyebrow, .dek, dt, dd, .hint')].filter(vis);
    const items = els.map(e => { const b = e.getBoundingClientRect(); return { name: e.id || e.className || e.tagName + ':' + e.textContent.trim().slice(0, 8), x: b.x, y: b.y, w: b.width, h: b.height, control: e.matches('button, input') }; });
    const outside = items.filter(b => b.x < -0.5 || b.y < -0.5 || b.x + b.w > innerWidth + 0.5 || b.y + b.h > innerHeight + 0.5);
    const overlaps = [];
    for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
      const a = items[i], b = items[j];
      if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 1 && Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 1) overlaps.push([a.name, b.name]);
    }
    const blocked = els.filter(e => e.matches('button')).filter(e => { const b = e.getBoundingClientRect(), hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2); return !(hit && (hit === e || e.contains(hit))); }).map(e => e.id || e.getAttribute('aria-label'));
    const box = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); return { x0: b.left, y0: b.top, x1: b.right, y1: b.bottom }; };
    return { outside, overlaps, blocked, small: items.filter(b => b.control && (b.w < 43.5 || b.h < 43.5)).map(b => [b.name, b.w, b.h]), card: box('.card'), title: box('.masthead h1') };
  });
  const hit = (a, b) => Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > 2 && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 2;
  const covered = snap.bears.filter(b => hit(b.screen, result.card) || hit(b.screen, result.title)).map(b => b.id);
  const offscreen = snap.bears.filter(b => b.screen.x0 < 0 || b.screen.y0 < 0 || b.screen.x1 > snap.viewport[0] || b.screen.y1 > snap.viewport[1]).map(b => b.id);
  // The region the camera framed for must match the real card and title (view.js LAYOUT vs. the CSS).
  const regionClear = !hit(snap.region, result.card) && !hit(snap.region, result.title);
  check('B8 layout ' + name, !result.outside.length && !result.overlaps.length && !result.small.length && !result.blocked.length && !covered.length && !offscreen.length && regionClear,
    { outside: result.outside, overlaps: result.overlaps, small: result.small, blocked: result.blocked, bearsUnderCardOrTitle: covered, bearsOffScreen: offscreen, regionClear, card: result.card, region: snap.region });
}
// Readings from the drawn frame itself (the WebGL buffer): bears must show saturated candy colour, not a
// grey or white wash, and the paper must stay near-white. Thresholds are first guesses written without a GPU.
async function pixels(page, vp, key) {
  const r = await page.evaluate(() => {
    const s = __PLAYTEST__.step(16); // draw now, then read in the same task (the buffer is not preserved)
    const canvas = document.querySelector('#scene'), gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    const w = gl.drawingBufferWidth, h = gl.drawingBufferHeight, px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const k = w / innerWidth;
    let sat = 0, n = 0, white = 0, paper = 0, pn = 0;
    for (const b of s.bears) for (let y = b.screen.y0; y < b.screen.y1; y += 4) for (let x = b.screen.x0; x < b.screen.x1; x += 4) {
      const i = 4 * ((h - 1 - Math.round(y * k)) * w + Math.round(x * k)); if (i < 0 || i >= px.length) continue;
      const mx = Math.max(px[i], px[i + 1], px[i + 2]), mn = Math.min(px[i], px[i + 1], px[i + 2]); n++;
      if (mx - mn > 70) sat++; if (mn > 240) white++;
    }
    for (let x = 4; x < w; x += 24) { const i = 4 * ((h - 4) * w + x); pn++; if (Math.min(px[i], px[i + 1], px[i + 2]) > 228) paper++; }
    return { saturated: sat / Math.max(1, n), nearWhite: white / Math.max(1, n), paperBottomRow: paper / pn };
  });
  check(`B7 ${vp} ${key} pixels: bears read as saturated colour, not washed out`, r.saturated > 0.12 && r.nearWhite < 0.5, { saturated: +r.saturated.toFixed(2), nearWhite: +r.nearWhite.toFixed(2), paperBottomRow: +r.paperBottomRow.toFixed(2) });
}
// Pointer drag with real input: mouse on desktop, touch (via CDP) on phone. Grab bear 2's head, pull it up,
// check it stretched, let go, wait, check it came back.
async function pointerDrag(page, vp, touch) {
  await go(page, page.url().split('?')[0], 'seed=7');
  const s0 = await hook(page, 'snapshot');
  const p = await page.evaluate(() => { const s = __PLAYTEST__.snapshot(), b = s.bears[2]; return { x: b.centre[0], y: (b.screen.y0 * 3 + b.screen.y1) / 4 }; });
  const to = { x: p.x + 20, y: Math.max(s0.region.y0 + 10, p.y - (touch ? 110 : 220)) };
  let session, held;
  if (touch) {
    session = await page.context().newCDPSession(page);
    const t = (type, q) => session.send('Input.dispatchTouchEvent', { type, touchPoints: q ? [{ x: q.x, y: q.y }] : [] });
    await t('touchStart', p);
    for (let i = 1; i <= 10; i++) { await t('touchMove', { x: p.x + ((to.x - p.x) * i) / 10, y: p.y + ((to.y - p.y) * i) / 10 }); await page.waitForTimeout(30); }
    await page.waitForTimeout(300);
    held = await hook(page, 'snapshot');
    await t('touchEnd');
  } else {
    await page.mouse.move(p.x, p.y); await page.waitForTimeout(80);
    const hover = await page.evaluate(() => document.querySelector('#cursor').dataset.state);
    await page.mouse.down(); await page.waitForTimeout(80);
    const grabCursor = await page.evaluate(() => document.querySelector('#cursor').dataset.state);
    check('B5 desktop cursor grows into the grab ring', hover === 'hover' && grabCursor === 'grab', { hover, grab: grabCursor });
    await page.mouse.move(to.x, to.y, { steps: 12 }); await page.waitForTimeout(300);
    held = await hook(page, 'snapshot');
    await page.mouse.up();
  }
  // Judge the peak, not the reading 300 ms after the drag stops: by then the body has followed the head and
  // the stretch has relaxed (first real-GPU run, 2026-11-24: phone touch peaked at 1.23, read 1.04 afterwards).
  // The page is reloaded above, so maxStretch covers this drag only.
  check(`B5 ${vp} ${touch ? 'touch' : 'mouse'} drag grabs and stretches a bear`, held.grabbing && held.maxStretch > 1.15, { grabbing: held.grabbing, peak: held.maxStretch, afterHold: held.stretch });
  const id = held.grabbing ? held.grabbing.bear : 2;
  await page.waitForFunction((id) => { const b = __PLAYTEST__.snapshot().bears[id]; return b && !b.moving; }, id, { polling: 200, timeout: 10000 }).catch(() => {});
  const after = await hook(page, 'snapshot'), b = after.bears[id];
  check(`B5 ${vp} let go, the bear comes back (volume 0.9–1.1, not moving)`, !after.grabbing && b.volume > 0.9 && b.volume < 1.1 && !b.moving, { volume: b.volume, moving: b.moving });
  if (session) await session.detach();
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
  const keys = ['row', 'stretch', 'fling', 'pile'];
  for (const [vp, viewport, dpr] of [['desktop', { width: 1440, height: 900 }, 1.5], ['phone', { width: 390, height: 664 }, 2]]) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: dpr, isMobile: vp === 'phone', hasTouch: vp === 'phone' });
    const page = await context.newPage(), requests = [];
    page.on('pageerror', (e) => report.errors.push(`${vp}: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') report.errors.push(`${vp}: ${m.text()}`); });
    page.on('request', (r) => requests.push(r.url()));
    if (server && vp === 'desktop') {
      await go(page, new URL('/dev.html', base).href);
      check('B9 source entry ready', (await hook(page, 'snapshot')).ready);
    }
    requests.length = 0;
    await go(page, base, 'seed=7');
    let s = await hook(page, 'snapshot');
    report[vp] = { quality: s.render.quality, transmission: s.render.transmission, renderer: s.render.renderer, pixelRatio: s.render.pixelRatio, viewport: s.viewport, phoneLayout: s.phoneLayout, bearTriangles: s.render.bearTriangles };
    check(`B6 ${vp} tier`, vp === 'phone' ? s.render.quality === 'low' && !s.render.transmission && s.phoneLayout : s.render.quality === 'high' && s.render.transmission && !s.phoneLayout, report[vp]);
    await layout(page, vp + ' start', s);
    // Frame time over 3 s of the live page (only meaningful on a real GPU).
    const ft = await page.evaluate(() => new Promise(res => { const t = []; let last = performance.now(); const f = (now) => { t.push(now - last); last = now; if (t.length < 180) requestAnimationFrame(f); else res(t.sort((a, b) => a - b)); }; requestAnimationFrame(f); }));
    report[vp].frameMs = { median: +ft[90].toFixed(1), p95: +ft[171].toFixed(1) };
    for (const [i, key] of keys.entries()) {
      await go(page, base, 'seed=7');
      s = await hook(page, 'scenario', key);
      await page.waitForTimeout(100);
      const file = `${String(i + 1).padStart(2, '0')}-${key}-${vp}.png`;
      await page.screenshot({ path: path.join(shots, file) });
      const moving = s.bears.filter(b => b.moving).length;
      report.scenes.push({ viewport: vp, scene: key, file, count: s.count, moving, stretch: s.stretch, notes: s.notes, drawCalls: s.render.drawCalls, triangles: s.render.triangles, points: s.render.points, bears: s.bears.map(b => ({ id: b.id, flavor: b.flavor, position: b.position, volume: b.volume, moving: b.moving, screen: b.screen })) });
      check(`B9 ${vp} ${key} draw calls and triangles recorded`, s.render.drawCalls > 0 && s.render.drawCalls <= 12, { drawCalls: s.render.drawCalls, triangles: s.render.triangles });
      if (key === 'row') check(`B6 ${vp} row rests`, s.count === 5 && moving === 0, { count: s.count, moving });
      if (key === 'stretch') check(`B6 ${vp} stretch holds a long bear`, s.grabbing && s.stretch > 1.25, { stretch: s.stretch });
      if (key === 'fling') check(`B6 ${vp} fling lands`, s.notes.landedAt > 0, s.notes);
      if (key === 'pile') {
        check(`B6 ${vp} pile reaches the cap and settles`, s.count === s.cap && s.notes.settled, { count: s.count, cap: s.cap, settledAt: s.notes.settledAt });
        check(`B9 ${vp} pour button shows the cap`, await page.locator('#pour').isDisabled(), await page.locator('#pour').textContent());
      }
      await layout(page, `${vp} ${key}`, s);
      await pixels(page, vp, key);
      if (key === 'stretch') await hook(page, 'release');
    }
    check(`B9 ${vp} single-file: no requests besides the page`, requests.every(u => u.startsWith('data:') || u.startsWith('blob:') || new URL(u).pathname === new URL(base).pathname), [...new Set(requests.map(u => u.slice(0, 80)))]);
    // Hooks: reset puts the row back; the same seed twice gives the same snapshot.
    await go(page, base, 'seed=7');
    const first = await hook(page, 'reset');
    await hook(page, 'pour'); await hook(page, 'step', 2000);
    const again = await hook(page, 'reset');
    check(`B6 ${vp} reset restores the row`, JSON.stringify(first.bears.map(b => b.position)) === JSON.stringify(again.bears.map(b => b.position)));
    const runSeed = () => page.evaluate(() => { __PLAYTEST__.setSeed(42); __PLAYTEST__.pour(); return JSON.stringify(__PLAYTEST__.step(1500).bears.map(b => b.position)); });
    check(`B6 ${vp} same seed, same result`, (await runSeed()) === (await runSeed()));
    // The pour button through the page, and the live page (not frozen by hooks) settling after a pour.
    await go(page, base, 'seed=7');
    await page.locator('#pour').click();
    await page.waitForTimeout(6000);
    s = await hook(page, 'snapshot');
    check(`B5 ${vp} pour button adds a handful that lands`, s.count > 5 && s.pending === 0, { count: s.count, pending: s.pending });
    await pointerDrag(page, vp, vp === 'phone');
    await context.close();
  }
  check('B8 no page errors', report.errors.length === 0, report.errors);
  check('B9 renderer recorded (SwiftShader/llvmpipe means frame times do not count)', Boolean(report.desktop?.renderer), report.desktop?.renderer);
}
main().catch((e) => { report.errors.push(String(e.stack || e)); console.error(e); process.exitCode = 1; })
  .finally(async () => {
    if (browser) await browser.close();
    if (server) server.kill();
    fs.writeFileSync(path.join(shots, 'report.json'), JSON.stringify(report, null, 2));
    if (report.checks.some(c => !c.pass)) process.exitCode = 1;
  });
