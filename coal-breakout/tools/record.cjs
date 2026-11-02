// 30 seconds from the normal entry, real pointer + keyboard events, fixed browser clock at 30 fps.
// Uses existing Playwright and ffmpeg. Writes MP4, per-frame state and nine sheets containing EVERY hero frame.
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), { spawn } = require('node:child_process');
const base = process.argv[2] || 'http://127.0.0.1:8936/coal-breakout/';
const out = process.argv[3] || path.join(__dirname, 'shots'); fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ headless: true }), context = await browser.newContext({ viewport: { width: 390, height: 664 }, deviceScaleFactor: 1, hasTouch: true, isMobile: true });
  const page = await context.newPage(), errors = [], frames = [];
  page.on('pageerror', e => errors.push(e.message)); await page.clock.install(); await page.goto(base);
  await page.waitForFunction(() => window.__PLAYTEST__?.ready, null, { polling: 50 }); await page.clock.pauseAt(new Date()); await page.click('#start');
  // Sheet canvas is out of the UI and never changes game state. Nine sheets × 100 consecutive frames.
  await page.evaluate(() => { window.sheet = document.createElement('canvas'); sheet.width = 1200; sheet.height = 1120; });
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '23', path.join(out, 'opening-30s.mp4')]);
  const completed = new Promise((resolve, reject) => { ff.on('close', code => code ? reject(new Error('ffmpeg ' + code)) : resolve()); ff.on('error', reject); });
  const box = await page.locator('#game').boundingBox(), ox = box.x + box.width / 2, oy = box.y + box.height / 2;
  const cdp = await context.newCDPSession(page); let held = false, input = 'none', totalMoved = 0;
  for (let f = 0; f < 900; f++) {
    let state = await page.evaluate(() => __PLAYTEST__.snapshot());
    if (state.phase === 'levelup') { if (held) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); held = false; } await page.locator('.card').first().click(); }
    if (f % 30 === 0) {
      if (held) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await page.keyboard.up('KeyW'); await page.keyboard.up('KeyD');
      if (f < 600) {
        // Clockwise square: right, down, left, up. Ends away from boundaries.
        const directions = [[55, 0, 'right'], [0, 55, 'down'], [-55, 0, 'left'], [0, -55, 'up']], d = directions[Math.floor(f / 30) % 4];
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: ox, y: oy }] });
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: ox + d[0], y: oy + d[1] }] }); held = true; input = d[2];
      } else { held = false; input = f % 60 === 0 ? 'key-up' : 'key-right'; await page.keyboard.down(input === 'key-up' ? 'KeyW' : 'KeyD'); }
    }
    const before = state; await page.clock.runFor(f % 3 === 0 ? 34 : 33); state = await page.evaluate(() => __PLAYTEST__.snapshot());
    if (state.phase === 'play' && before.phase === 'play') {
      const dx = state.x - before.x, dy = state.y - before.y; totalMoved += Math.hypot(dx, dy);
      if (input === 'right' || input === 'key-right') { if (dx < -.01) throw new Error('right moved left at ' + f); }
      if (input === 'left' && dx > .01 || (input === 'up' || input === 'key-up') && dy > .01 || input === 'down' && dy < -.01) throw new Error('direction mismatch at ' + f);
    }
    frames.push({ frame: f, videoSeconds: f / 30, input, ...state });
    const png = await page.screenshot(); if (!ff.stdin.write(png)) await new Promise(resolve => ff.stdin.once('drain', resolve));
    if (f % 150 === 0) fs.writeFileSync(path.join(out, `opening-${String(f).padStart(3, '0')}.png`), png);
    const sheetData = await page.evaluate(({ data, state, f, box }) => new Promise(resolve => {
      const img = new Image(); img.onload = () => {
        const g = sheet.getContext('2d'), index = f % 100, x = index % 10 * 120, y = Math.floor(index / 10) * 112;
        if (!index) { g.fillStyle = '#0b1424'; g.fillRect(0, 0, 1200, 1120); }
        const cx = box.x + state.x / 360 * box.width, cy = box.y + state.y / 520 * box.height;
        g.drawImage(img, cx - 60, cy - 55, 120, 100, x, y, 120, 100); g.fillStyle = '#72F1C4'; g.font = '10px monospace'; g.fillText(String(f) + ' ' + state.phase, x + 2, y + 109);
        resolve(index === 99 ? sheet.toDataURL().split(',')[1] : null);
      }; img.src = 'data:image/png;base64,' + data;
    }), { data: png.toString('base64'), state, f, box });
    if (sheetData) fs.writeFileSync(path.join(out, `opening-sheet-${Math.floor(f / 100) + 1}.png`), Buffer.from(sheetData, 'base64'));
    if (f % 150 === 0) console.log(`recorded ${f}/900 frames`);
  }
  ff.stdin.end(); await completed;
  if (errors.length || totalMoved < 1000) throw new Error('opening recording errors/no movement ' + JSON.stringify({ errors, totalMoved }));
  fs.writeFileSync(path.join(out, 'opening-frames.json'), JSON.stringify({ frames, errors, totalMoved }, null, 2)); await browser.close(); console.log('recorded 900 frames / 30 seconds; all direction checks passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
