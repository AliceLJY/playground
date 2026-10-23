// 竖屏演示录屏：手机竖屏视口从正常开场进，点「入画」，?demo 让视线慢慢转去找四处（每找到一处停一会儿），录到结尾立轴。
//   NODE_PATH="$(npm root -g)" node tools/demo.cjs <base-url> <out-dir> [width=430] [height=860] [pixel-ratio=2]
// 做法同 qilou-brawl/tools/record.cjs：接管页面时钟，每帧推进 1/30 s 再按设备像素截图，帧率稳定、不丢帧。
// Playwright 自带录屏和 CDP 截帧都只按 CSS 尺寸出图，竖屏会糊或只占一角，所以不用它们。没有声音。这是给人看的演示，不是验收。
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
(async () => {
  const [base, outDir, W = '430', H = '860', dpr = '2'] = process.argv.slice(2);
  const frames = path.join(outDir, 'frames'); fs.mkdirSync(frames, { recursive: true });
  const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist', '--use-angle=metal'] });
  const page = await (await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: +dpr, isMobile: true, hasTouch: true })).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: 0 });
  await page.goto(base + (base.includes('?') ? '&' : '?') + 'demo');
  for (let i = 0; i < 900; i++) { if (await page.evaluate(() => window.__jianmen && (window.__jianmen.ready || window.__jianmen.error))) break; await page.clock.runFor(100); await page.waitForTimeout(50); }
  if (!(await page.evaluate(() => window.__jianmen.ready))) throw new Error('not ready: ' + (await page.evaluate(() => window.__jianmen.error)));
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 50));
  const fps = 30; let n = 0, tapped = false, endAt = null, seen = 0;
  const shot = async () => { await page.clock.runFor(1000 / fps); await page.waitForTimeout(12); await page.screenshot({ path: path.join(frames, String(n).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 90 }); n++; };
  while (n < 120 * fps) {
    if (!tapped && n === Math.round(2.5 * fps)) { await page.tap('#enter'); tapped = true; console.log('入画 at', (n / fps).toFixed(1), 's'); }
    await shot();
    if (n % 15 === 0) {
      const info = await page.evaluate(() => window.__jianmen.info());
      if (info.found.length > seen) { seen = info.found.length; console.log('found', info.found[seen - 1], 'at', (n / fps).toFixed(1), 's'); }
      if (info.outro && endAt === null) { endAt = n + 5 * fps; console.log('outro at', (n / fps).toFixed(1), 's'); }
    }
    if (endAt !== null && n >= endAt) break;
  }
  await b.close();
  const mp4 = path.join(outDir, `demo-portrait-${W * dpr}x${H * dpr}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, '%05d.jpg'), '-c:v', 'libx264', '-preset', 'slow', '-crf', '20', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', mp4]);
  console.log(JSON.stringify({ frames: n, seconds: n / fps, mp4, errors: errors.slice(0, 5) }));
})();
