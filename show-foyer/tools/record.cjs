const skipIntro = url => { const u = new URL(url); u.searchParams.set('intro', 'skip'); return u.href; };
// Normal entry: 30 continuous seconds of real taps/keys, then an accelerated ending return.
// NODE_PATH="$(npm root -g)" node tools/record.cjs <page-url> <out-dir>
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), { spawn, spawnSync } = require('node:child_process');
const [url, out] = process.argv.slice(2);
if (!url || !out) throw new Error('Expected page URL and output directory');
fs.mkdirSync(out, { recursive: true });
(async () => {
  const browser = await chromium.launch({ args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
  const context = await browser.newContext({ viewport: { width: 390, height: 664 }, deviceScaleFactor: 2, hasTouch: true });
  const page = await context.newPage(), errors = [], frames = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.clock.install({ time: new Date('2026-11-03T12:15:00Z') }); await page.goto(skipIntro(url));
  await page.waitForFunction(() => window.__foyer?.ready, null, { polling: 50 });
  await page.clock.pauseAt(new Date('2026-11-03T12:15:01Z'));
  // CSS transitions use wall time, so only the recording disables them. Game rendering is unchanged.
  await page.addStyleTag({ content: '* { transition: none !important; animation: none !important; }' });
  await page.evaluate(() => { window.sheet = document.createElement('canvas'); sheet.width = 1950; sheet.height = 1740; });
  const movie = path.join(out, 'opening-and-ending.mp4');
  const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', '30', '-i', '-', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', movie]);
  const done = new Promise((resolve, reject) => { ff.on('close', c => c ? reject(new Error('ffmpeg ' + c)) : resolve()); ff.on('error', reject); });
  const taps = new Map([[30, '#btnSit'], [90, '#btnLamp'], [150, '#btnClap'], [270, '#infoBtn'], [300, '#progNext'], [330, '#progNext'], [360, '[data-close="programmeOverlay"]'], [420, '#btnLeave'], [480, '#btnSit'], [540, '#btnTea'], [600, '#gongBtn'], [630, '[data-close="gongOverlay"]'], [690, '#btnPhoto'], [750, '[data-close="photoOverlay"]'], [990, '#curtainPhotoBtn'], [1020, '[data-close="photoOverlay"]'], [1050, '#nextShowBtn'], [1070, '#btnSit']]);
  for (let f = 0; f < 1080; f++) {
    if (taps.has(f)) await page.locator(taps.get(f)).tap();
    if (f === 210) { const r = await page.locator('#scene').boundingBox(); await page.touchscreen.tap(r.x + r.width / 2, r.y + r.height * .14); }
    if (f === 810 || f === 840) await page.keyboard.press('m');
    if (f === 900) await page.evaluate(() => __foyer.jumpTo(.01));
    await page.clock.runFor(f % 3 === 0 ? 34 : 33);
    const state = await page.evaluate(() => __foyer.snapshot()); frames.push({ frame: f, videoSeconds: f / 30, ...state });
    const png = await page.screenshot();
    if (!ff.stdin.write(png)) await new Promise(r => ff.stdin.once('drain', r));
    if (f % 150 === 0 || [990, 1020, 1050, 1079].includes(f)) fs.writeFileSync(path.join(out, `frame-${String(f).padStart(4, '0')}.png`), png);
    const data = await page.evaluate(async ({ png, f }) => {
      const image = new Image(); image.src = 'data:image/png;base64,' + png; await image.decode();
      const g = sheet.getContext('2d'), i = f % 50, x = i % 10 * 195, y = Math.floor(i / 10) * 348;
      if (i === 0) { g.fillStyle = '#140e0a'; g.fillRect(0, 0, sheet.width, sheet.height); }
      g.drawImage(image, x, y, 195, 332); g.fillStyle = '#f7dc9a'; g.font = '12px monospace'; g.fillText(String(f), x + 4, y + 345);
      return i === 49 || f === 1079 ? sheet.toDataURL().split(',')[1] : null;
    }, { png: png.toString('base64'), f });
    if (data) fs.writeFileSync(path.join(out, `sheet-${String(Math.floor(f / 50) + 1).padStart(2, '0')}.png`), Buffer.from(data, 'base64'));
    if (f % 150 === 0) console.log(`recorded ${f}/1080`);
  }
  ff.stdin.end(); await done;
  const checks = { seated: frames[60].phase === 'seated', lamp: frames[120].lamps === 1, clap: frames[180].claps === 1,
    stagePhoto: frames[240].snaps === 1, programme: frames[340].programmePage === 2, replay: frames[510].ghostsHere === 1,
    tea: frames[570].teas === 1, endingPhoto: frames[1000].photoOpen, endingReturn: frames[1030].curtainOverlay,
    nextShow: frames[1079].phase === 'seated' && frames[1079].shows === 1, noErrors: errors.length === 0 };
  fs.writeFileSync(path.join(out, 'frames.json'), JSON.stringify({ browser: browser.version(), viewport: [390, 664], dpr: 2, cssAnimationsDisabled: true, checks, errors, frames }, null, 2));
  await browser.close();
  const cut = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', movie, '-frames:v', '900', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', path.join(out, 'opening-30s.mp4')]);
  if (cut.status || Object.values(checks).some(v => !v)) throw new Error(JSON.stringify(checks));
  console.log('1080 frames recorded; first 900 frames are normal entry without state jumps; 11 checks passed');
})().catch(e => { console.error(e); process.exitCode = 1; });
