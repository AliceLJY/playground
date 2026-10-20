// 录屏：接管页面时钟，每帧推进 1/30 s 再截图（帧率稳定、不丢帧），录完把记下的发声离线渲染成音轨，ffmpeg 合成 MP4。
//   NODE_PATH="$(npm root -g)" node tools/record.cjs <url> <out-dir> [width] [height] [max-seconds] [seed] [pixel-ratio]
// 竖屏：540 960 200 3 2 → 1080×1920，界面字号按手机比例
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
(async () => {
  const [url, outDir, W = '1920', H = '1080', maxS = '200', seed = '3', dpr = '1'] = process.argv.slice(2);
  const frames = path.join(outDir, 'frames'); fs.mkdirSync(frames, { recursive: true });
  const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--enable-gpu', '--ignore-gpu-blocklist'] });
  const page = await (await b.newContext({ viewport: { width: +W, height: +H }, deviceScaleFactor: +dpr })).newPage();
  const errors = []; page.on('pageerror', (e) => errors.push(e.message));
  await page.clock.install({ time: 0 });
  await page.goto(`${url}?record&seed=${seed}`);
  for (let i = 0; i < 600; i++) { if (await page.evaluate(() => window.__qilou && (window.__qilou.ready || window.__qilou.error))) break; await page.clock.runFor(100); await page.waitForTimeout(50); }
  if (!(await page.evaluate(() => window.__qilou.ready))) throw new Error('not ready: ' + (await page.evaluate(() => window.__qilou.error)));
  // install 之后时钟默认仍随真实时间走，截图等待会被算进游戏时间；先停住，之后只按帧推进
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 50));
  for (let i = 0; i < 20; i++) { await page.clock.runFor(1000 / 30); await page.waitForTimeout(20); } // 让第一帧排好序
  const t0 = await page.evaluate(() => { window.__qilou.recStart(); return performance.now(); }); // 标题页的 2.5 s 从这里起算
  let n = 0, endAt = null; const fps = 30, max = +maxS * fps;
  while (n < max) {
    await page.clock.runFor(1000 / fps);
    await page.waitForTimeout(12); // 泼溅排序在 worker 里，给它一点真实时间
    await page.screenshot({ path: path.join(frames, String(n).padStart(5, '0') + '.jpg'), type: 'jpeg', quality: 92 });
    n++;
    if (n % 30 === 0) {
      const ph = await page.evaluate(() => window.__qilou.sim().phase);
      if ((ph === 'win' || ph === 'lose') && endAt === null) endAt = n + 5 * fps; // 打完再录 5 秒（胜利镜头和结算页）；开头标题页 phase 是 title，不算结束
      if (n % 300 === 0) console.log('frame', n, ph);
    }
    if (endAt !== null && n >= endAt) break;
  }
  const secs = n / fps;
  // 发声事件也存下来：以后只调声音不用重录画面，用 tools/rerender-audio.cjs 重新渲染
  fs.writeFileSync(path.join(outDir, 'sound-events.json'), JSON.stringify({ t0, seconds: secs, events: await page.evaluate(() => window.__qilouRec) }));
  const wav = await page.evaluate(([t0, s]) => window.__qilou.renderAudio(t0, s), [t0, secs]);
  fs.writeFileSync(path.join(outDir, 'audio.wav'), Buffer.from(wav, 'base64'));
  const info = await page.evaluate(() => window.__qilou.info());
  await b.close();
  const mp4 = path.join(outDir, `qilou-brawl-${W * dpr}x${H * dpr}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, '%05d.jpg'), '-i', path.join(outDir, 'audio.wav'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', mp4]);
  console.log(JSON.stringify({ frames: n, seconds: secs, phase: info.phase, mp4, errors: errors.slice(0, 5) }));
})();
