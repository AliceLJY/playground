// 录一遍导览：逐帧调用 window.__mini.render(t) 再截图，管道送进 ffmpeg。帧率与机器快慢无关。可选，不进 CI。
//   node tools/build.mjs
//   NODE_PATH="$(npm root -g)" node tools/record.cjs <out.mp4> [--size 1920x1080] [--dpr 1] [--fps 30]
//   竖屏：--size 540x960 --dpr 2（1080×1920，录片竖屏版式）
// 同时在 out.mp4 旁边写 <out>.events.json：每颗螺丝落盘、每个接头断开、每句旁白、SSD 拔出、总结卡出现的时刻，给 tools/score.py 配声音用。
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const argv = process.argv.slice(2);
const out = path.resolve(argv[0] || 'mini.mp4');
const opt = (k, d) => { const i = argv.indexOf('--' + k); return i < 0 ? d : argv[i + 1]; };
const [W, H] = opt('size', '1920x1080').split('x').map(Number), dpr = +opt('dpr', 1), fps = +opt('fps', 30);

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: ['--ignore-gpu-blocklist', '--enable-gpu-rasterization'] });
  const page = await (await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: dpr, isMobile: W < 600, hasTouch: W < 600 })).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('file://' + path.resolve(__dirname, '../dist/index.html') + '?capture');
  await page.waitForFunction(() => window.__mini && window.__mini.ready, null, { polling: 100, timeout: 20000 });
  const dur = await page.evaluate(() => window.__mini.TOUR_S);
  const frames = Math.round(dur * fps);
  console.log(await page.evaluate(() => window.__mini.info().renderer), `${W * dpr}x${H * dpr}`, frames, 'frames');
  const events = { duration: dur, fps, screws: [], connectors: [], steps: [], beats: await page.evaluate(() => window.__mini.beats()), ssdOut: null, ram: null, summary: null };
  let prev = null;
  const ff = spawn('ffmpeg', ['-loglevel', 'error', '-y', '-f', 'image2pipe', '-framerate', String(fps), '-i', '-', '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out], { stdio: ['pipe', 'inherit', 'inherit'] });
  const t0 = Date.now();
  for (let i = 0; i < frames; i++) {
    const t = i / fps;
    const st = await page.evaluate((x) => { window.__mini.render(x); const s = window.__mini.state(); return { s: s.s, c: s.counters, sum: +getComputedStyle(document.getElementById('summary')).opacity }; }, t);
    if (prev) {
      for (let k = prev.c.screws; k < st.c.screws; k++) events.screws.push(+t.toFixed(4));
      for (let k = prev.c.connectors; k < st.c.connectors; k++) events.connectors.push(+t.toFixed(4));
      for (let k = prev.c.steps; k < st.c.steps; k++) events.steps.push(+t.toFixed(4));
      if (events.ram === null && st.c.ramSlots === 0) events.ram = +t.toFixed(4);
      if (events.ssdOut === null && st.s >= 22) events.ssdOut = +t.toFixed(4);
      if (events.summary === null && st.sum > 0.5) events.summary = +t.toFixed(4);
    }
    prev = st;
    const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
    if (!ff.stdin.write(buf)) await new Promise((r) => ff.stdin.once('drain', r));
    if (i % (fps * 4) === 0) process.stdout.write(`\r${i}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  }
  ff.stdin.end(); await new Promise((r) => ff.on('close', r));
  await browser.close();
  fs.writeFileSync(out.replace(/\.mp4$/, '') + '.events.json', JSON.stringify(events));
  console.log(`\r${frames}/${frames}  ${((Date.now() - t0) / 1000).toFixed(0)} s → ${out}  screws ${events.screws.length} conns ${events.connectors.length} steps ${events.steps.length}`, errors.length ? 'ERRORS ' + errors.join(' | ') : '');
})();
