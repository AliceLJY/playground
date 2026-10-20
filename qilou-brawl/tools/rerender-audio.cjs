// 只重渲染音轨：读 record.cjs 存下的 sound-events.json，在页面里离线合成，再和已有画面重新合成 MP4。
//   NODE_PATH="$(npm root -g)" node tools/rerender-audio.cjs <url> <out-dir> [width] [height]
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
(async () => {
  const [url, outDir, W = '1920', H = '1080'] = process.argv.slice(2);
  const ev = JSON.parse(fs.readFileSync(path.join(outDir, 'sound-events.json'), 'utf8'));
  const b = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await (await b.newContext({ viewport: { width: 320, height: 200 } })).newPage();
  await page.goto(`${url}?record`);
  await page.waitForFunction(() => window.__qilou && window.__qilou.ready, null, { polling: 200, timeout: 90000 });
  const wav = await page.evaluate((e) => { window.__qilouRec = e.events; return window.__qilou.renderAudio(e.t0, e.seconds); }, ev);
  await b.close();
  fs.writeFileSync(path.join(outDir, 'audio.wav'), Buffer.from(wav, 'base64'));
  const mp4 = path.join(outDir, `qilou-brawl-${W}x${H}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '30', '-i', path.join(outDir, 'frames', '%05d.jpg'), '-i', path.join(outDir, 'audio.wav'),
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '18', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', mp4]);
  console.log('rewrote', mp4);
})();
