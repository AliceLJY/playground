// 录品牌片头（11-05 Alice 定：以后每支视频前面都加像素办公室片头，片尾署名页是另一半）：
// 竖屏 1080×1920、30fps、3 秒——整栋楼全景 → 镜头扎进对应房间 → 房间牌子＋片名，出无声 intro.mp4。
//   NODE_PATH="$(npm root -g)" node tools/intro-record.cjs <jobs.json> <out-dir>
// jobs.json: [{name, room, title}]；room 取下面 ROOMS 的键；每条输出 <out-dir>/<name>/intro.mp4。
// 坐标是塔楼布局（竖屏 portrait）逻辑像素，宽 360、高 1050；房间位置改了要跟着改 ROOMS。
const { chromium } = require('playwright');
const fs = require('node:fs'), path = require('node:path'), { execFileSync } = require('node:child_process');
const { createPreview } = require('./preview.cjs');
const [jobsFile, outDir] = process.argv.slice(2);
if (!jobsFile || !outDir) { console.error('usage: intro-record.cjs <jobs.json> <out-dir>'); process.exit(2); }
const ROOMS = {
  游戏室: { cx: 140, cy: 300, w: 250 },
  陈列室: { cx: 58, cy: 206, w: 150 },
  制片室: { cx: 270, cy: 206, w: 170 },
  总监室: { cx: 66, cy: 126, w: 150 },
  会议室: { cx: 68, cy: 410, w: 150 },
  阅读室: { cx: 70, cy: 916, w: 150 },
  办公室: { cx: 180, cy: 270, w: 340 },
};
const fps = 30, total = 90, WIDE = { cx: 180, cy: 525, w: 600 };
const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
const camOf = r => ({ x: r.cx - r.w / 2, y: r.cy - r.w * 16 / 9 / 2, w: r.w });
const jobs = JSON.parse(fs.readFileSync(jobsFile, 'utf8'));
for (const j of jobs) if (!ROOMS[j.room]) { console.error(`unknown room ${j.room} (${j.name})`); process.exit(2); }
(async () => {
  const server = createPreview(); await new Promise(ok => server.listen(3197, '127.0.0.1', ok));
  const browser = await chromium.launch(); const errors = [];
  for (const job of jobs) {
    const dir = path.join(outDir, job.name), frames = path.join(dir, 'frames');
    fs.rmSync(frames, { recursive: true, force: true }); fs.mkdirSync(frames, { recursive: true });
    const page = await browser.newPage({ viewport: { width: 430, height: 900 } });
    page.on('pageerror', e => errors.push(`${job.name}: ${e.message}`));
    await page.goto('http://127.0.0.1:3197/?demo=1');
    await page.waitForFunction(() => window.__PLAYTEST__?.ready);
    await page.evaluate(ms => window.__PLAYTEST__.step(ms), 3000);
    const a = camOf(WIDE), b = camOf(ROOMS[job.room]);
    for (let i = 0; i < total; i++) {
      await page.evaluate(ms => window.__PLAYTEST__.step(ms), 1000 / fps);
      const t = i / fps, k = ease(Math.min(1, Math.max(0, (t - 0.6) / 1.3)));
      const cam = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k };
      const data = await page.evaluate(({ cam, t, room, title }) => {
        const src = document.querySelector('#office'), o = document.createElement('canvas'); o.width = 1080; o.height = 1920;
        const g = o.getContext('2d'); g.imageSmoothingEnabled = false; g.fillStyle = '#efe7d4'; g.fillRect(0, 0, 1080, 1920);
        const W = src.width / 2, H = src.height / 2, h = cam.w * 16 / 9;
        const x = cam.w <= W ? Math.max(0, Math.min(cam.x, W - cam.w)) : cam.x, y = h <= H ? Math.max(0, Math.min(cam.y, H - h)) : cam.y;
        const s = 1080 / cam.w; g.drawImage(src, 0, 0, src.width, src.height, -x * s, -y * s, W * s, H * s);
        g.textAlign = 'center';
        // Top band: the same line on every film, the brand half of the fingerprint.
        g.fillStyle = '#253334d8'; g.fillRect(0, 0, 1080, 110); g.font = '600 44px "PingFang SC",system-ui'; g.fillStyle = '#fff6dc';
        g.fillText('小试AI 的像素办公室', 540, 72);
        // Room sign pops in at 1.9 s (wooden board, gold rim), film title under it.
        const p = Math.min(1, Math.max(0, (t - 1.9) / 0.18));
        if (p > 0) {
          const sc = p < 1 ? 0.6 + 0.5 * p - 0.1 * p * p : 1;
          g.save(); g.translate(540, 1460); g.scale(sc, sc);
          g.font = '700 84px "PingFang SC",system-ui'; const rw = g.measureText(room).width + 120;
          g.fillStyle = '#5a3b22'; g.beginPath(); g.roundRect(-rw / 2, -78, rw, 128, 16); g.fill();
          g.strokeStyle = '#d9b25a'; g.lineWidth = 8; g.stroke();
          g.fillStyle = '#fff1c9'; g.fillText(room, 0, 18); g.restore();
          if (title) {
            g.globalAlpha = Math.min(1, Math.max(0, (t - 2.05) / 0.2));
            g.font = '600 54px "PingFang SC",system-ui';
            const lines = []; let cur = '';
            for (const ch of title) { if (g.measureText(cur + ch).width > 920) { lines.push(cur); cur = ''; } cur += ch; }
            lines.push(cur);
            const bh = 36 + lines.length * 70, by = 1580;
            g.fillStyle = '#253334e6'; g.beginPath(); g.roundRect(60, by, 960, bh, 22); g.fill();
            g.fillStyle = '#fff6dc'; lines.forEach((l, j) => g.fillText(l, 540, by + 68 + j * 70)); g.globalAlpha = 1;
          }
        }
        // 0.15 s fade in from black.
        if (t < 0.15) { g.fillStyle = `rgba(0,0,0,${1 - t / 0.15})`; g.fillRect(0, 0, 1080, 1920); }
        return o.toDataURL('image/jpeg', .93);
      }, { cam, t, room: job.room, title: job.title });
      fs.writeFileSync(path.join(frames, String(i).padStart(5, '0') + '.jpg'), Buffer.from(data.split(',')[1], 'base64'));
    }
    await page.close();
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', path.join(frames, '%05d.jpg'), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '16', path.join(dir, 'intro.mp4')]);
    console.log('wrote', path.join(dir, 'intro.mp4'));
  }
  await browser.close(); server.close();
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
})();
