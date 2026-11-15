// 抽帧联络表：逐个时刻调用 window.__mini.render(t) 截图，左上角标 t=，再用 ffmpeg 拼成一张。
//   NODE_PATH="$(npm root -g)" node tools/stills.cjs <out.png> [--size 1365x900] [--dpr 1] [--times 0,1.5,...|--every 2] [--cols 4] [--scale 0.5]
// 不给 --times / --every 时取 src/tour.js 里每句旁白出现后 0.6 秒（beats）。
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const argv = process.argv.slice(2), out = path.resolve(argv[0]);
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const [W, H] = opt('size', '1365x900').split('x').map(Number), dpr = +opt('dpr', 1), cols = +opt('cols', 4), scale = +opt('scale', 0.5);
(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr, isMobile: W < 600, hasTouch: W < 600 })).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html') + '?capture');
  await page.waitForFunction(() => window.__mini && window.__mini.ready, null, { polling: 100, timeout: 20000 });
  let times;
  if (opt('times')) times = opt('times').split(',').map(Number);
  else if (opt('every')) { const e = +opt('every'), T = await page.evaluate(() => window.__mini.TOUR_S); times = []; for (let t = 0; t < T; t += e) times.push(+t.toFixed(2)); }
  else times = await page.evaluate(() => window.__mini.beats().map((t) => +(t + 0.6).toFixed(2)));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stills-'));
  for (let i = 0; i < times.length; i++) {
    await page.evaluate((t) => { window.__mini.render(t); let l = document.getElementById('__t'); if (!l) { l = document.createElement('div'); l.id = '__t'; l.style.cssText = 'position:fixed;left:6px;top:6px;z-index:99;font:600 13px Menlo,monospace;background:#1f1e1c;color:#fff;padding:2px 6px;border-radius:4px'; document.body.appendChild(l); } l.textContent = 't=' + t; }, times[i]);
    await page.screenshot({ path: path.join(dir, String(i).padStart(3, '0') + '.png') });
  }
  await browser.close();
  const rows = Math.ceil(times.length / cols);
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-framerate', '1', '-i', path.join(dir, '%03d.png'), '-vf', `scale=iw*${scale}:-1,tile=${cols}x${rows}:padding=6:color=0x888888`, '-frames:v', '1', out]);
  console.log(out, times.length, 'tiles', errors.length ? 'ERRORS ' + errors.join(' | ') : 'no page errors');
})();
