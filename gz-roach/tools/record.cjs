// 录一遍导览：逐帧调用 window.__roach.render(t) 再截图，管道送进 ffmpeg。帧率与机器快慢无关。可选，不进 CI。
//   node tools/build.mjs
//   NODE_PATH="$(npm root -g)" node tools/record.cjs <out.mp4> [--size 1920x1080] [--dpr 1] [--fps 30]
//   竖屏：--size 540x960 --dpr 2（1080×1920，用手机排版）
// 同时在 out.mp4 旁边写 <out>.events.json：每次脚着地、光标按下、墨镜落下的时刻，给 tools/score.py 配声音用。
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const argv = process.argv.slice(2);
const out = path.resolve(argv[0] || 'roach.mp4');
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const [W, H] = opt('size', '1920x1080').split('x').map(Number), dpr = +opt('dpr', 1), fps = +opt('fps', 30);

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr, isMobile: W < 600, hasTouch: W < 600 })).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html') + '?capture');
  await page.waitForFunction(() => window.__roach && window.__roach.ready, null, { polling: 100, timeout: 20000 });
  const dur = await page.evaluate(() => window.__roach.TOUR_S);
  const frames = Math.round(dur * fps);
  console.log(await page.evaluate(() => window.__roach.info().renderer), `${W * dpr}x${H * dpr}`, frames, 'frames');

  // 事件：着地 = 某只脚从空中变成着地；按下 = 导览光标按下；墨镜 = 展品姿态过半
  const events = { duration: dur, fps, steps: [], presses: [], swag: null };
  let prevDown = null, prevPress = false;
  const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    const t = i / fps;
    const st = await page.evaluate((x) => { window.__roach.render(x); const p = window.__roach.pose(x); const c = document.querySelector('#cursor'); return { down: p.legs.map((l) => l.stance), pair: p.legs.map((l) => l.pair), v: p.v, swag: p.swag, press: c.classList.contains('press') && +c.style.opacity > 0 }; }, t);
    if (prevDown) st.down.forEach((d, k) => { if (d && !prevDown[k] && st.v > 0.05) events.steps.push({ t: +t.toFixed(4), leg: k, pair: st.pair[k], v: +st.v.toFixed(3) }); });
    if (st.press && !prevPress) events.presses.push(+t.toFixed(4));
    if (events.swag === null && st.swag > 0.5) events.swag = +t.toFixed(4);
    prevDown = st.down; prevPress = st.press;
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % (fps * 4) === 0) process.stdout.write(`\r${i}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  ff.stdin.end(); await new Promise((r) => ff.on('close', r));
  await browser.close();
  fs.writeFileSync(out.replace(/\.mp4$/, '') + '.events.json', JSON.stringify(events));
  console.log(`\r${frames}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)} s → ${out}  steps ${events.steps.length} presses ${events.presses.length} swag ${events.swag}`, errors.length ? 'ERRORS ' + errors.join(' | ') : '');
})();
